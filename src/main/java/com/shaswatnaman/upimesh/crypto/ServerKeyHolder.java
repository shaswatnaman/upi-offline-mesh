package com.shaswatnaman.upimesh.crypto;

import jakarta.annotation.PostConstruct;
import lombok.Getter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.PrivateKey;
import java.security.PublicKey;
import java.util.Base64;

/**
 * Holds the server's RSA keypair.
 *
 * In production, the private key would live in an HSM (Hardware Security Module)
 * or a KMS like AWS KMS / HashiCorp Vault — never in the JAR or source.
 *
 * For this demo we generate a fresh keypair on every startup. The public key is
 * exposed via /api/server-key so the (simulated) sender devices can use it to
 * encrypt payloads.
 */
@Component
public class ServerKeyHolder {

    private static final Logger log = LoggerFactory.getLogger(ServerKeyHolder.class);

    @Getter
    private PublicKey publicKey;

    @Getter
    private PrivateKey privateKey;

    @PostConstruct
    public void init() throws Exception {
        KeyPairGenerator gen = KeyPairGenerator.getInstance("RSA");
        gen.initialize(2048);
        KeyPair keyPair = gen.generateKeyPair();
        this.publicKey = keyPair.getPublic();
        this.privateKey = keyPair.getPrivate();
        log.info("Server RSA keypair generated (2048-bit). Public key fingerprint: {}...",
                getPublicKeyBase64().substring(0, 32));
    }

    public String getPublicKeyBase64() {
        return Base64.getEncoder().encodeToString(publicKey.getEncoded());
    }
}
