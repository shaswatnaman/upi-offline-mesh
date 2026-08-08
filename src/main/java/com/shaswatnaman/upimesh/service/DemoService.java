package com.shaswatnaman.upimesh.service;

import com.shaswatnaman.upimesh.crypto.HybridCryptoService;
import com.shaswatnaman.upimesh.crypto.ServerKeyHolder;
import com.shaswatnaman.upimesh.model.Account;
import com.shaswatnaman.upimesh.model.MeshPacket;
import com.shaswatnaman.upimesh.model.PaymentInstruction;
import com.shaswatnaman.upimesh.repository.AccountRepository;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.HexFormat;
import java.util.UUID;

/**
 * Helper service that:
 *   - seeds demo accounts on startup
 *   - simulates the "sender phone creates an encrypted packet" flow
 */
@Service
public class DemoService {

    private static final Logger log = LoggerFactory.getLogger(DemoService.class);

    private final AccountRepository accounts;
    private final HybridCryptoService crypto;
    private final ServerKeyHolder serverKey;

    public DemoService(AccountRepository accounts, HybridCryptoService crypto, ServerKeyHolder serverKey) {
        this.accounts = accounts;
        this.crypto = crypto;
        this.serverKey = serverKey;
    }

    @PostConstruct
    public void seedAccounts() {
        if (accounts.count() == 0) {
            accounts.save(new Account("alice@demo", "Alice", new BigDecimal("5000.00")));
            accounts.save(new Account("bob@demo",   "Bob",   new BigDecimal("1000.00")));
            accounts.save(new Account("carol@demo", "Carol", new BigDecimal("2500.00")));
            accounts.save(new Account("dave@demo",  "Dave",  new BigDecimal("500.00")));
            log.info("Seeded 4 demo accounts");
        }
    }

    /**
     * Simulates the sender's phone:
     *   1. Build a PaymentInstruction with a fresh nonce + signedAt timestamp.
     *   2. Encrypt with the server's public key (hybrid RSA+AES).
     *   3. Wrap in a MeshPacket with TTL.
     *
     * In a real Android app, this exact logic (minus the server-side reference)
     * would run on the phone. The phone would have already cached the server's
     * public key during a previous online session.
     */
    public MeshPacket createPacket(String senderVpa, String receiverVpa,
                                   BigDecimal amount, String pin, int ttl) throws Exception {
        PaymentInstruction instruction = new PaymentInstruction(
                senderVpa,
                receiverVpa,
                amount,
                sha256Hex(pin),
                UUID.randomUUID().toString(),  // nonce — guarantees uniqueness across identical payments
                Instant.now().toEpochMilli()   // signedAt — enables freshness check on ingest
        );

        String ciphertext = crypto.encrypt(instruction, serverKey.getPublicKey());

        return new MeshPacket(
                UUID.randomUUID().toString(),
                ttl,
                Instant.now().toEpochMilli(),
                ciphertext
        );
    }

    private String sha256Hex(String input) throws Exception {
        MessageDigest md = MessageDigest.getInstance("SHA-256");
        return HexFormat.of().formatHex(md.digest(input.getBytes()));
    }
}
