package com.shaswatnaman.upimesh.model;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * The over-the-wire format. This is what hops from phone to phone via Bluetooth.
 *
 * The intermediate phones can read the outer fields (packetId, ttl, createdAt)
 * because they need them for routing and dedup. They CANNOT read ciphertext —
 * that's encrypted with the server's public key.
 *
 * NOTE on outer-field tampering:
 *   A malicious intermediate could change packetId or createdAt. That's why
 *   we use the ciphertext hash (not packetId) as the idempotency key on the
 *   server. The ciphertext is authenticated by AES-GCM, so any tampering
 *   inside the encrypted blob is detected on decryption.
 */
@Getter
@Setter
@NoArgsConstructor
public class MeshPacket {

    @NotBlank
    private String packetId; // UUID, used by intermediates for gossip dedup

    @Min(0)
    private int ttl; // Hops remaining; intermediates decrement it

    @NotNull
    private long createdAt; // epoch millis, when sender created the packet

    @NotBlank
    private String ciphertext; // base64(RSA-encrypted AES key + AES-GCM ciphertext)

    public MeshPacket(String packetId, int ttl, long createdAt, String ciphertext) {
        this.packetId = packetId;
        this.ttl = ttl;
        this.createdAt = createdAt;
        this.ciphertext = ciphertext;
    }

    /** Returns a copy with TTL decremented by one, for gossip hops. */
    public MeshPacket withDecrementedTtl() {
        return new MeshPacket(packetId, ttl - 1, createdAt, ciphertext);
    }
}
