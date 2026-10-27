package com.shaswatnaman.upimesh.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * ============================================================
 * CONCEPT: ConcurrentHashMap + Idempotency
 * ============================================================
 * IDEMPOTENCY means: doing the same operation 1 time or 100 times = same result.
 * Here: processing the same payment packet 1 or 3 times = 1 settled transaction.
 *
 * THE PROBLEM this solves:
 *   3 phones all find internet at the same moment and all upload the same payment.
 *   3 threads on the server run simultaneously. Without synchronization, all 3
 *   would process the payment → Alice gets charged 3 times!
 *
 * WHY ConcurrentHashMap (not regular HashMap)?
 *   Regular HashMap is NOT thread-safe. If 2 threads write simultaneously,
 *   the internal structure gets corrupted (race condition → data loss or corruption).
 *   ConcurrentHashMap uses fine-grained locking: only the affected "bucket" is locked,
 *   so other buckets can be written simultaneously. Fast AND safe.
 *
 * WHY putIfAbsent (not a manual check-then-put)?
 *   BAD (race condition):
 *     if (!seen.containsKey(hash)) { seen.put(hash, now()); return true; }
 *     → Thread 1 checks: not present. Thread 2 checks: not present.
 *       Both proceed! Double payment!
 *   GOOD (atomic):
 *     return seen.putIfAbsent(hash, now()) == null;
 *     → One indivisible operation. Exactly ONE thread gets null back. All others
 *       get the existing value back. Only the null-getter processes the payment.
 *
 * @Scheduled(fixedDelay=60_000): Spring calls evictExpired() every 60 seconds
 *   automatically. Without this, the map grows forever → OutOfMemoryError.
 * ============================================================
 */
@Service
public class IdempotencyService {

    private final Map<String, Instant> seen = new ConcurrentHashMap<>();

    @Value("${upi.mesh.idempotency-ttl-seconds:86400}")
    private long ttlSeconds;

    /**
     * Try to claim a hash. Returns true if this is the first claimer;
     * false if someone else already claimed it (i.e. the packet is a duplicate).
     */
    // CONCURRENTHASHMAP KEY METHOD:
    // putIfAbsent(key, value) → inserts key→value ONLY if key not already present.
    // Returns: null   if key was NEW    → we are the FIRST claimer → return true → process payment
    // Returns: oldVal if key was PRESENT → someone else already claimed → return false → reject duplicate
    // This is ATOMIC — no race condition possible. 100 threads, exactly 1 gets true.
    public boolean claim(String packetHash) {
        return seen.putIfAbsent(packetHash, Instant.now()) == null;
    }

    public int size() {
        return seen.size();
    }

    /** Periodically evict entries past their TTL so the map doesn't grow forever. */
    @Scheduled(fixedDelay = 60_000)
    public void evictExpired() {
        Instant cutoff = Instant.now().minusSeconds(ttlSeconds);
        seen.entrySet().removeIf(e -> e.getValue().isBefore(cutoff));
    }

    /** Test/demo helper. */
    public void clear() {
        seen.clear();
    }
}
