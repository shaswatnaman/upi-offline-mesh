"use client";
import { useState } from "react";

type Mode = "recruiter" | "academic";

const SECTIONS = [
  {
    id: "what",
    title: "What is MeshPay?",
    recruiter: `MeshPay is a research prototype demonstrating that UPI-style digital payments can propagate and settle securely even without internet connectivity at the point of transaction.

Phones communicate via Bluetooth/WiFi-Direct mesh networks, relaying encrypted payment packets until one device regains connectivity and uploads them for settlement.`,
    academic: `MeshPay implements a delay-tolerant payment network (DTN) with the following formal properties:

**Termination** — TTL-bounded gossip ensures propagation terminates within O(diameter × TTL) steps.

**Confidentiality** — Hybrid encryption (RSA-OAEP + AES-GCM) ensures only the backend's RSA private key can decrypt payment contents.

**Integrity** — AES-GCM authentication tags detect any ciphertext modification with overwhelming probability (2⁻¹²⁸ forgery probability).

**Exactly-once settlement** — SHA-256(ciphertext) as idempotency key with ConcurrentHashMap.putIfAbsent guarantees at-most-once claim, while gossip guarantees at-least-once delivery. Combined: exactly-once settlement.`,
  },
  {
    id: "crypto",
    title: "Cryptographic Design",
    recruiter: `Payments are encrypted with AES-256-GCM (a modern authenticated cipher). The AES key itself is wrapped with RSA-OAEP (asymmetric encryption), so only the backend server can decrypt it.

This means: even if a relay device is compromised or malicious, it sees only opaque ciphertext. It cannot read the sender, receiver, amount, or PIN.`,
    academic: `**Key hierarchy:**
- Server keypair: RSA-2048, generated at startup via KeyPairGenerator.getInstance("RSA")
- Per-packet session key: AES-256, generated via KeyGenerator.getInstance("AES") backed by SecureRandom
- Encryption transform: Cipher("AES/GCM/NoPadding") with 12-byte random IV
- Key encapsulation: Cipher("RSA/ECB/OAEPWithSHA-256AndMGF1Padding")

**Wire format (ciphertext field):**
[RSA-wrapped-key: 256 bytes][IV: 12 bytes][GCM-ciphertext + auth-tag: len + 16 bytes]

**Security reduction:** Breaking packet confidentiality requires either breaking RSA-OAEP (hardness: RSA problem under OAEP, which reduces to factoring) or breaking AES-256-GCM (no known attacks stronger than brute force on 2²⁵⁶ keys). PIN is SHA-256 hashed before encryption; even the backend receives only H(PIN).

**Note on PIN hashing:** SHA-256 without a salt is used here for demo simplicity. A production system would use Argon2id or bcrypt with a per-user salt to resist offline dictionary attacks.`,
  },
  {
    id: "gossip",
    title: "Gossip Protocol",
    recruiter: `Gossip is a flood-fill style propagation. Each device that receives a packet forwards it to its neighbors. The packet carries a TTL (time-to-live) counter that decrements each hop.

When TTL reaches 0, the packet stops propagating. This prevents infinite loops in the mesh graph.`,
    academic: `**Algorithm:** Synchronous bounded flooding (SBF).

Each gossip round is O(|E|) where E is the mesh edge set. Packets reach all reachable nodes within min(TTL, diameter(G)) rounds.

**Why not Bloom-filter gossip?** For a demo with N ≤ 20 devices, SBF is simpler and provably correct. At scale, you'd use SWIM or a Bloom-filter-augmented gossip to reduce redundant transmissions.

**TTL semantics:** TTL represents remaining hop budget, not wall-clock time. This is appropriate for a mesh where delivery time is unpredictable. A device that goes offline for 10 minutes and then re-contacts neighbors will still forward the packet if TTL > 0.

**Convergence:** With TTL = diameter(G) + 1, all connected devices receive the packet in at most TTL rounds with probability 1 (assuming synchronous gossip rounds and a connected graph).`,
  },
  {
    id: "idempotency",
    title: "Idempotency & Exactly-Once",
    recruiter: `When multiple devices (bridges) regain WiFi simultaneously, they might all try to submit the same payment. Without idempotency, the user could be charged multiple times.

MeshPay uses a SHA-256 hash of the encrypted packet as a unique identifier. The first bridge to claim that hash wins; subsequent deliveries are rejected.`,
    academic: `**Idempotency key derivation:**
packetHash = SHA-256(ciphertext)

SHA-256 is used here because:
1. The ciphertext is deterministic for a given plaintext + server public key (RSA-OAEP is probabilistic, but the packet's ciphertext is fixed at creation time and never re-encrypted)
2. SHA-256 is collision-resistant (2¹²⁸ collision resistance), making duplicate packetHash for distinct packets negligible

**Atomicity mechanism:**
ConcurrentHashMap<String, Instant>.putIfAbsent()

putIfAbsent is a single atomic CAS operation. Under concurrent bridge uploads, exactly one thread sees null (success) and all others see the previously-stored Instant (duplicate).

**Scope limitation:** This is JVM-local atomicity. In a distributed system with multiple backend instances, you would need Redis SETNX or a DB-level unique constraint on packetHash to provide cross-instance exactly-once guarantees. This is a known limitation acknowledged in the project.`,
  },
  {
    id: "settlement",
    title: "Settlement Atomicity",
    recruiter: `Settlement is a two-step operation: debit the sender and credit the receiver. If the application crashes halfway through, we don't want a debit without a corresponding credit.

Spring's @Transactional annotation wraps both operations in a single ACID database transaction. Either both succeed or neither does.`,
    academic: `**Transaction isolation:** Spring uses TRANSACTION_READ_COMMITTED by default with Hibernate. For settlement, the relevant guarantee is atomicity (A in ACID): the debit and credit are committed together or rolled back together.

**Optimistic concurrency control:** Account entities carry @Version (a JPA-standard field). If two concurrent transactions read the same account row, the second commit triggers an OptimisticLockException, which Spring converts to a JPA rollback. This is appropriate because:
1. Conflicts are rare (different senders/receivers)
2. No lock acquisition at read time → higher throughput
3. The idempotency layer above prevents the same packet from reaching settlement twice

**Failure modes handled:**
- InsufficientBalanceException → @Transactional rollback, packet marked REJECTED
- OptimisticLockException → @Transactional rollback, safe to retry at bridge layer
- RuntimeException (any) → @Transactional rollback, transaction aborted`,
  },
  {
    id: "limitations",
    title: "Honest Limitations",
    recruiter: `This is an academic prototype — it demonstrates the concepts but is not production-ready:

• **In-memory storage** — database resets on restart; no persistence
• **Single backend instance** — idempotency would fail across multiple instances
• **No real Bluetooth/mesh** — gossip is simulated in the JVM, not over real radio
• **No real UPI integration** — VPAs are seeded demo data, not real bank accounts
• **PIN security** — SHA-256 without a salt; production would use Argon2id`,
    academic: `**Unsolved problems in offline payment systems (active research areas):**

1. **Byzantine fault tolerance in the mesh** — a malicious relay could selectively drop packets, degrading availability without being detected. Byzantine gossip protocols (e.g., PBFT-based) address this at significant latency cost.

2. **Offline balance verification** — the current design cannot prevent a sender from initiating multiple payments offline that exceed their balance. Solutions include hardware-rooted local balance attestation (TEE/Secure Enclave) or cryptographic commitments.

3. **Key distribution** — the server RSA public key must be pre-distributed to devices before going offline. Key rotation while offline is unsolved without a trusted third party.

4. **TTL calibration** — optimal TTL is a function of graph diameter, which is unknown in dynamic mesh topologies. Adaptive TTL (e.g., based on observed hop counts) is an open problem.

5. **Distributed idempotency** — scaling to multiple backend instances requires distributed locking (Redis SETNX, Zookeeper) or a unique DB constraint with retry logic.

6. **Replay window** — the current design rejects replays indefinitely (entries never expire from the idempotency map). Production would need a TTL on the idempotency cache matching the offline window (e.g., 7 days).`,
  },
];

export default function NotesPage() {
  const [mode, setMode] = useState<Mode>("recruiter");
  const [expanded, setExpanded] = useState<string | null>("what");

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <div className="border-b border-[#1e1e1e] px-6 py-4">
        <div className="max-w-3xl mx-auto">
          <p className="font-mono text-xs text-zinc-500 uppercase tracking-widest mb-1">Engineering Notes</p>
          <h1 className="text-2xl font-bold mb-4">Design Decisions & Analysis</h1>

          {/* Mode toggle */}
          <div className="flex items-center gap-1 p-1 bg-[#161616] border border-[#2a2a2a] rounded-lg w-fit">
            <button
              onClick={() => setMode("recruiter")}
              className={`px-4 py-1.5 text-sm rounded-md transition-colors ${
                mode === "recruiter" ? "bg-white text-black font-medium" : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Recruiter Mode
            </button>
            <button
              onClick={() => setMode("academic")}
              className={`px-4 py-1.5 text-sm rounded-md transition-colors ${
                mode === "academic" ? "bg-white text-black font-medium" : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Academic Mode
            </button>
          </div>

          <p className="text-zinc-500 text-xs mt-3">
            {mode === "recruiter"
              ? "Plain-English explanations of what was built and why it matters."
              : "Technical depth: formal properties, algorithms, failure modes, and open problems."}
          </p>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-8 space-y-3">
        {SECTIONS.map(s => (
          <div key={s.id} className="bg-[#111] border border-[#1e1e1e] rounded-xl overflow-hidden">
            <button
              onClick={() => setExpanded(expanded === s.id ? null : s.id)}
              className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-[#161616] transition-colors"
            >
              <span className="font-semibold text-sm">{s.title}</span>
              <span className={`font-mono text-xs text-zinc-500 transition-transform duration-200 ${
                expanded === s.id ? "rotate-90" : ""
              }`}>›</span>
            </button>
            {expanded === s.id && (
              <div className="px-5 pb-5 border-t border-[#1a1a1a]">
                <div className="pt-4 text-sm text-zinc-400 leading-relaxed whitespace-pre-wrap font-mono">
                  {mode === "recruiter" ? s.recruiter : s.academic}
                </div>
              </div>
            )}
          </div>
        ))}

        {/* Tech stack summary */}
        <div className="mt-6 bg-[#111] border border-[#1e1e1e] rounded-xl p-5">
          <h3 className="font-semibold text-sm mb-4">Technology Summary</h3>
          <div className="grid sm:grid-cols-2 gap-3">
            {[
              { layer: "Backend", stack: "Spring Boot 3.5.3 · Java 17 · H2 · JPA/Hibernate 6" },
              { layer: "Cryptography", stack: "JCA · RSA-2048-OAEP · AES-256-GCM · SHA-256" },
              { layer: "Concurrency", stack: "ConcurrentHashMap · @Transactional · @Version" },
              { layer: "Deployment", stack: "Railway · reads $PORT env · Docker-free" },
              { layer: "Frontend", stack: "Next.js 15 · TypeScript · Tailwind CSS · App Router" },
              { layer: "Mesh simulation", stack: "JVM in-process · adjacency list · TTL gossip" },
            ].map(t => (
              <div key={t.layer} className="bg-[#0d0d0d] border border-[#1e1e1e] rounded-lg p-3">
                <div className="font-mono text-xs text-cyan-400 mb-1">{t.layer}</div>
                <div className="font-mono text-xs text-zinc-400">{t.stack}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Source links */}
        <div className="bg-[#111] border border-[#1e1e1e] rounded-xl p-5">
          <h3 className="font-semibold text-sm mb-3">Source & References</h3>
          <div className="space-y-2 font-mono text-xs">
            <div className="flex items-center gap-3">
              <span className="text-zinc-500">Repo</span>
              <a href="https://github.com/shaswatnaman/upi-offline-mesh" target="_blank" rel="noopener noreferrer"
                className="text-cyan-400 hover:underline">
                github.com/shaswatnaman/upi-offline-mesh
              </a>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-zinc-500">Backend</span>
              <a href="https://upi-offline-mesh-production-1e9e.up.railway.app/api/server-key" target="_blank" rel="noopener noreferrer"
                className="text-cyan-400 hover:underline">
                Railway deployment — /api/server-key
              </a>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-zinc-500">NPCI</span>
              <span className="text-zinc-600">This is not affiliated with or endorsed by NPCI. UPI® is a registered trademark of NPCI.</span>
            </div>
          </div>
        </div>

        {/* Disclaimer */}
        <div className="p-4 bg-amber-950/10 border border-amber-900/30 rounded-xl">
          <p className="text-amber-400/80 text-xs font-mono leading-relaxed">
            This is an academic/educational prototype exploring the feasibility of offline payment mesh networks.
            It is not a production system, is not affiliated with any financial institution or payment network,
            and should not be used for real transactions.
          </p>
        </div>
      </div>
    </div>
  );
}
