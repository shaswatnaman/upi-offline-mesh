package com.shaswatnaman.upimesh;

import com.shaswatnaman.upimesh.crypto.HybridCryptoService;
import com.shaswatnaman.upimesh.crypto.ServerKeyHolder;
import com.shaswatnaman.upimesh.model.MeshPacket;
import com.shaswatnaman.upimesh.model.PaymentInstruction;
import com.shaswatnaman.upimesh.repository.AccountRepository;
import com.shaswatnaman.upimesh.service.BridgeIngestionService;
import com.shaswatnaman.upimesh.service.DemoService;
import com.shaswatnaman.upimesh.service.IdempotencyService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import java.math.BigDecimal;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Covers the three headline properties of the system:
 *   1. Concurrent duplicate delivery settles exactly once.
 *   2. Tampered ciphertext is rejected before touching the ledger.
 *   3. Encrypt/decrypt is symmetric and lossless.
 */
@SpringBootTest
class IdempotencyConcurrencyTest {

    @Autowired private DemoService demoService;
    @Autowired private BridgeIngestionService bridge;
    @Autowired private IdempotencyService idempotency;
    @Autowired private AccountRepository accounts;
    @Autowired private HybridCryptoService crypto;
    @Autowired private ServerKeyHolder serverKey;

    @BeforeEach
    void clearIdempotencyCache() {
        idempotency.clear();
    }

    @Test
    void singlePacketDeliveredByThreeBridgesSettlesExactlyOnce() throws Exception {
        BigDecimal aliceBefore = accounts.findById("alice@demo").orElseThrow().getBalance();
        BigDecimal bobBefore   = accounts.findById("bob@demo").orElseThrow().getBalance();

        MeshPacket packet = demoService.createPacket(
                "alice@demo", "bob@demo", new BigDecimal("100.00"), "1234", 5);

        ExecutorService pool = Executors.newFixedThreadPool(3);
        CountDownLatch start = new CountDownLatch(1);
        AtomicInteger settled = new AtomicInteger();
        AtomicInteger duplicates = new AtomicInteger();

        Future<?>[] futures = new Future[3];
        for (int i = 0; i < 3; i++) {
            final String node = "bridge-" + i;
            futures[i] = pool.submit(() -> {
                try {
                    start.await();
                    BridgeIngestionService.IngestResult r = bridge.ingest(packet, node, 3);
                    if ("SETTLED".equals(r.outcome()))          settled.incrementAndGet();
                    else if ("DUPLICATE_DROPPED".equals(r.outcome())) duplicates.incrementAndGet();
                } catch (Exception e) {
                    throw new RuntimeException(e);
                }
            });
        }

        start.countDown(); // release all 3 threads simultaneously
        for (Future<?> f : futures) f.get(5, TimeUnit.SECONDS);
        pool.shutdown();

        assertEquals(1, settled.get(),    "exactly one bridge should settle");
        assertEquals(2, duplicates.get(), "the other two should be duplicates");

        BigDecimal aliceAfter = accounts.findById("alice@demo").orElseThrow().getBalance();
        BigDecimal bobAfter   = accounts.findById("bob@demo").orElseThrow().getBalance();
        assertEquals(aliceBefore.subtract(new BigDecimal("100.00")), aliceAfter,
                "Alice debited exactly once");
        assertEquals(bobBefore.add(new BigDecimal("100.00")), bobAfter,
                "Bob credited exactly once");
    }

    @Test
    void tamperedCiphertextIsRejected() throws Exception {
        MeshPacket packet = demoService.createPacket(
                "alice@demo", "bob@demo", new BigDecimal("50.00"), "1234", 5);

        // Flip a byte in the middle of the ciphertext
        char[] chars = packet.getCiphertext().toCharArray();
        chars[chars.length / 2] = chars[chars.length / 2] == 'A' ? 'B' : 'A';
        packet.setCiphertext(new String(chars));

        BridgeIngestionService.IngestResult r = bridge.ingest(packet, "bridge-x", 1);
        assertEquals("INVALID", r.outcome());
        assertEquals("decryption_failed", r.reason());
    }

    @Test
    void encryptDecryptRoundTrip() throws Exception {
        PaymentInstruction original = new PaymentInstruction(
                "alice@demo", "bob@demo", new BigDecimal("123.45"),
                "abcdef", "nonce-1", System.currentTimeMillis());

        String ct = crypto.encrypt(original, serverKey.getPublicKey());
        PaymentInstruction decrypted = crypto.decrypt(ct);

        assertEquals(original.getSenderVpa(),   decrypted.getSenderVpa());
        assertEquals(original.getReceiverVpa(), decrypted.getReceiverVpa());
        assertEquals(0, original.getAmount().compareTo(decrypted.getAmount()));
        assertEquals(original.getNonce(),       decrypted.getNonce());
    }

    @Test
    void insufficientBalanceIsRejectedNotSettled() throws Exception {
        // Dave has ₹500, trying to send ₹9999
        MeshPacket packet = demoService.createPacket(
                "dave@demo", "alice@demo", new BigDecimal("9999.00"), "1234", 5);

        BridgeIngestionService.IngestResult r = bridge.ingest(packet, "bridge-y", 2);

        assertEquals("INVALID", r.outcome());
        assertEquals("insufficient_balance", r.reason());

        // Dave's balance must be unchanged
        BigDecimal daveBalance = accounts.findById("dave@demo").orElseThrow().getBalance();
        assertEquals(0, new BigDecimal("500.00").compareTo(daveBalance),
                "Dave's balance must be unchanged after rejection");
    }
}
