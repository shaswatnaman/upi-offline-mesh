package com.shaswatnaman.upimesh.controller;

import com.shaswatnaman.upimesh.crypto.ServerKeyHolder;
import com.shaswatnaman.upimesh.model.Account;
import com.shaswatnaman.upimesh.model.MeshPacket;
import com.shaswatnaman.upimesh.model.Transaction;
import com.shaswatnaman.upimesh.repository.AccountRepository;
import com.shaswatnaman.upimesh.repository.TransactionRepository;
import com.shaswatnaman.upimesh.service.*;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.util.*;

/**
 * Public REST surface.
 *
 * Endpoints split into three groups:
 *   /api/server-key       → so simulated senders can fetch the server's public key
 *   /api/mesh/*           → simulator endpoints (inject, gossip, flush, reset)
 *   /api/bridge/ingest    → THE real production endpoint a real bridge node would hit
 *   /api/accounts, /api/transactions → for the dashboard
 */
@RestController
@RequestMapping("/api")
public class ApiController {

    private final ServerKeyHolder serverKey;
    private final DemoService demo;
    private final MeshSimulatorService mesh;
    private final BridgeIngestionService bridge;
    private final AccountRepository accountRepo;
    private final TransactionRepository txRepo;
    private final IdempotencyService idempotency;

    public ApiController(ServerKeyHolder serverKey, DemoService demo,
                         MeshSimulatorService mesh, BridgeIngestionService bridge,
                         AccountRepository accountRepo, TransactionRepository txRepo,
                         IdempotencyService idempotency) {
        this.serverKey = serverKey;
        this.demo = demo;
        this.mesh = mesh;
        this.bridge = bridge;
        this.accountRepo = accountRepo;
        this.txRepo = txRepo;
        this.idempotency = idempotency;
    }

    // ------------------------------------------------------------------ key

    @GetMapping("/server-key")
    public Map<String, String> getServerPublicKey() {
        return Map.of(
                "publicKey", serverKey.getPublicKeyBase64(),
                "algorithm", "RSA-2048 / OAEP-SHA256",
                "hybridScheme", "RSA-OAEP encrypts an AES-256-GCM session key"
        );
    }

    // ---------------------------------------------------------------- demo

    /**
     * Demo helper: build a packet on the server (simulating a sender phone)
     * and inject it into the mesh at the given device.
     */
    @PostMapping("/demo/send")
    public ResponseEntity<?> demoSend(@Valid @RequestBody DemoSendRequest req) throws Exception {
        MeshPacket packet = demo.createPacket(
                req.senderVpa(), req.receiverVpa(), req.amount(), req.pin(),
                req.ttl() == null ? 5 : req.ttl());

        String startDevice = req.startDevice() == null ? "phone-alice" : req.startDevice();
        mesh.inject(startDevice, packet);

        return ResponseEntity.ok(Map.of(
                "packetId", packet.getPacketId(),
                "ciphertextPreview", packet.getCiphertext().substring(0, 64) + "...",
                "ttl", packet.getTtl(),
                "injectedAt", startDevice
        ));
    }

    public record DemoSendRequest(
            @NotBlank String senderVpa,
            @NotBlank String receiverVpa,
            @DecimalMin("0.01") BigDecimal amount,
            @NotBlank String pin,
            Integer ttl,
            String startDevice) {}

    // -------------------------------------------------------------- mesh sim

    @GetMapping("/mesh/state")
    public Map<String, Object> meshState() {
        List<Map<String, Object>> deviceData = new ArrayList<>();
        for (VirtualDevice d : mesh.getDevices()) {
            deviceData.add(Map.of(
                    "deviceId", d.getDeviceId(),
                    "hasInternet", d.hasInternet(),
                    "packetCount", d.packetCount(),
                    "packetIds", d.getHeldPackets().stream()
                            .map(p -> p.getPacketId().substring(0, 8))
                            .toList()
            ));
        }
        return Map.of(
                "devices", deviceData,
                "idempotencyCacheSize", idempotency.size()
        );
    }

    @PostMapping("/mesh/gossip")
    public Map<String, Object> meshGossip() {
        MeshSimulatorService.GossipResult r = mesh.gossipOnce();
        return Map.of(
                "transfers", r.transfers(),
                "deviceCounts", r.deviceCounts()
        );
    }

    /**
     * "All bridge nodes simultaneously walk outside and get 4G."
     * They upload everything they hold to /api/bridge/ingest in parallel —
     * this is the concurrent duplicate-storm that idempotency is built to handle.
     */
    @PostMapping("/mesh/flush")
    public Map<String, Object> meshFlush() {
        List<MeshSimulatorService.BridgeUpload> uploads = mesh.collectBridgeUploads();

        List<Map<String, Object>> results = Collections.synchronizedList(new ArrayList<>());
        uploads.parallelStream().forEach(up -> {
            BridgeIngestionService.IngestResult r =
                    bridge.ingest(up.packet(), up.bridgeNodeId(), 5 - up.packet().getTtl());
            results.add(Map.of(
                    "bridgeNode", up.bridgeNodeId(),
                    "packetId", up.packet().getPacketId().substring(0, 8),
                    "outcome", r.outcome(),
                    "reason", r.reason() == null ? "" : r.reason(),
                    "transactionId", r.transactionId() == null ? -1 : r.transactionId()
            ));
        });

        return Map.of(
                "uploadsAttempted", uploads.size(),
                "results", results
        );
    }

    @PostMapping("/mesh/reset")
    public Map<String, Object> meshReset() {
        mesh.resetMesh();
        idempotency.clear();
        return Map.of("status", "mesh and idempotency cache cleared");
    }

    // -------------------------------------------------------------- bridge

    /**
     * THE PRODUCTION ENDPOINT.
     * In a real deployment, the Android app's bridge logic POSTs here whenever
     * the device has internet and is holding mesh packets.
     */
    @PostMapping("/bridge/ingest")
    public ResponseEntity<?> ingest(
            @Valid @RequestBody MeshPacket packet,
            @RequestHeader(value = "X-Bridge-Node-Id", defaultValue = "unknown") String bridgeNodeId,
            @RequestHeader(value = "X-Hop-Count", defaultValue = "0") int hopCount) {

        BridgeIngestionService.IngestResult r = bridge.ingest(packet, bridgeNodeId, hopCount);
        return ResponseEntity.ok(r);
    }

    // ------------------------------------------------------------- ledger

    @GetMapping("/accounts")
    public List<Account> listAccounts() {
        return accountRepo.findAll();
    }

    @GetMapping("/transactions")
    public List<Transaction> listTransactions() {
        return txRepo.findTop20ByOrderByIdDesc();
    }
}
