"use client";
import { useState } from "react";
import { ChevronRight } from "lucide-react";

interface Component {
  id: string;
  label: string;
  sub: string;
  x: number;
  y: number;
  color: string;
  ring: string;
  detail: {
    what: string;
    how: string;
    code: string;
    why: string;
  };
}

const COMPONENTS: Component[] = [
  {
    id: "client",
    label: "Sender Device",
    sub: "Java client / this UI",
    x: 50, y: 10,
    color: "text-cyan-300", ring: "ring-cyan-700",
    detail: {
      what: "The originating device that creates and signs a payment packet.",
      how: "Calls POST /api/demo/send with senderVpa, receiverVpa, amount, pin.",
      code: `SendRequest {
  senderVpa, receiverVpa,
  amount, pin, ttl?
}`,
      why: "PIN is never stored — it is hashed (SHA-256) inside DemoPaymentService before encryption. Even if the relay is compromised, the raw PIN is never exposed.",
    },
  },
  {
    id: "demo",
    label: "DemoPaymentService",
    sub: "Spring @Service",
    x: 50, y: 28,
    color: "text-violet-300", ring: "ring-violet-700",
    detail: {
      what: "Orchestrates packet creation: PIN hashing, payload assembly, encryption, injection into mesh.",
      how: "SHA-256(PIN) → payload JSON → AES-256-GCM encrypt → RSA-OAEP wrap → MeshPacket → MeshDevice.injectPacket()",
      code: `// DemoPaymentService.java
String pinHash = sha256(pin);
byte[] payload = buildPayload(...);
String cipher  = cryptoService.encrypt(payload);
MeshPacket pkt = new MeshPacket(uuid, ttl, cipher);
startDevice.injectPacket(pkt);`,
      why: "Separating demo orchestration from the mesh protocol means the core gossip/settle logic is reusable and doesn't know about demo conventions.",
    },
  },
  {
    id: "crypto",
    label: "CryptoService",
    sub: "RSA-OAEP + AES-256-GCM",
    x: 80, y: 28,
    color: "text-cyan-300", ring: "ring-cyan-700",
    detail: {
      what: "Handles all cryptography. Generates the server RSA key pair on startup, exposes the public key via /api/server-key.",
      how: "Encryption: SecureRandom → 256-bit AES key → AES-GCM(payload) → RSA-OAEP(AES key) → concatenate. Decryption reverses the process.",
      code: `// CryptoService.java
KeyGenerator.getInstance("AES")       // 256-bit
  .generateKey()                       // SecureRandom
// → Cipher("AES/GCM/NoPadding")
// → Cipher("RSA/ECB/OAEPWithSHA-256...")`,
      why: "Hybrid encryption gives us the key-distribution security of RSA with the speed of AES. GCM mode adds authentication — any tampering is caught before decryption.",
    },
  },
  {
    id: "mesh",
    label: "MeshDevice / MeshNetwork",
    sub: "In-memory gossip graph",
    x: 50, y: 48,
    color: "text-emerald-300", ring: "ring-emerald-700",
    detail: {
      what: "Simulates N offline devices. Each MeshDevice holds a ConcurrentHashMap<String, MeshPacket>. MeshNetwork coordinates gossip.",
      how: "POST /api/mesh/gossip triggers MeshNetwork.runGossipRound(): each device fans out its packets to neighbors based on adjacency list. TTL decrements each hop; at TTL=0 the packet stops propagating.",
      code: `// MeshNetwork.java
for (MeshDevice src : devices) {
  for (MeshDevice dst : src.neighbors) {
    src.packets.forEach((id, pkt) -> {
      if (pkt.ttl > 0)
        dst.injectPacket(pkt.decrementTtl());
    });
  }
}`,
      why: "TTL-bounded flooding is the simplest provably-terminating gossip scheme. It guarantees every packet reaches every device within TTL hops without central coordination.",
    },
  },
  {
    id: "bridge",
    label: "BridgeController",
    sub: "POST /api/bridge/ingest",
    x: 50, y: 67,
    color: "text-amber-300", ring: "ring-amber-700",
    detail: {
      what: "Receives an encrypted MeshPacket from a device that has regained internet. Validates, decrypts, then calls settlement.",
      how: "POST /api/mesh/flush → BridgeController → CryptoService.decrypt() → IdempotencyService.claim() → SettlementService.settle()",
      code: `@PostMapping("/api/bridge/ingest")
IngestResult ingest(
  @RequestBody MeshPacket packet,
  @RequestHeader("X-Bridge-Node-Id") String bridge,
  @RequestHeader("X-Hop-Count") int hops
)`,
      why: "The bridge pattern decouples the connectivity moment from payment creation. Any device can become a bridge — the packet carries everything needed for settlement.",
    },
  },
  {
    id: "idempotency",
    label: "IdempotencyService",
    sub: "SHA-256 → ConcurrentHashMap",
    x: 20, y: 67,
    color: "text-red-300", ring: "ring-red-700",
    detail: {
      what: "Ensures each payment is settled at most once, even if multiple bridges deliver the same packet simultaneously.",
      how: "SHA-256(ciphertext) → packetHash → ConcurrentHashMap.putIfAbsent(hash, Instant.now()). First call returns null (success); subsequent calls return existing value (reject).",
      code: `// IdempotencyService.java
String hash = sha256(packet.getCiphertext());
Instant existing = seen.putIfAbsent(hash, Instant.now());
if (existing != null)
  throw new DuplicatePacketException(hash);`,
      why: "putIfAbsent is an atomic CAS operation on a ConcurrentHashMap — no explicit synchronization needed. The hash is deterministic (same ciphertext → same hash) so it survives arbitrary delivery order.",
    },
  },
  {
    id: "settlement",
    label: "SettlementService",
    sub: "@Transactional + @Version",
    x: 80, y: 67,
    color: "text-emerald-300", ring: "ring-emerald-700",
    detail: {
      what: "Executes the actual debit/credit against the H2 JPA ledger with full ACID guarantees.",
      how: "@Transactional wraps the debit + credit + Transaction.save() as a single atomic unit. @Version on Account enables optimistic locking — concurrent bridge flushes for different packets don't block each other.",
      code: `@Transactional
void settle(PaymentPayload p) {
  Account sender = repo.findByVpa(p.senderVpa);
  Account receiver = repo.findByVpa(p.receiverVpa);
  sender.debit(p.amount);    // throws if insufficient
  receiver.credit(p.amount);
  txRepo.save(new Transaction(...));
}`,
      why: "@Transactional + @Version covers both the failure case (rollback on exception) and the concurrency case (optimistic lock prevents double-settlement at the JPA level, below the idempotency cache).",
    },
  },
  {
    id: "db",
    label: "H2 In-Memory DB",
    sub: "JPA / Hibernate 6",
    x: 50, y: 86,
    color: "text-zinc-300", ring: "ring-zinc-700",
    detail: {
      what: "Embedded relational database used for local development and demos. Resets on each application restart.",
      how: "spring.jpa.hibernate.ddl-auto=create-drop creates schema from @Entity annotations. DataInitializer seeds demo accounts on startup.",
      code: `// application.properties
spring.jpa.hibernate.ddl-auto=create-drop
spring.datasource.url=jdbc:h2:mem:meshdb
# No dialect needed — Hibernate 6 auto-detects`,
      why: "H2 in-memory eliminates all external dependencies for development and CI. For production you'd swap the datasource for PostgreSQL with zero code changes — only the JDBC URL and dialect change.",
    },
  },
];

// Edges between component IDs
const EDGES: [string, string][] = [
  ["client", "demo"],
  ["demo", "crypto"],
  ["demo", "mesh"],
  ["mesh", "bridge"],
  ["bridge", "idempotency"],
  ["bridge", "settlement"],
  ["settlement", "db"],
];

function getCenter(c: Component) {
  return { cx: c.x, cy: c.y + 4 };
}

export default function ArchitecturePage() {
  const [selected, setSelected] = useState<Component | null>(null);

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <div className="border-b border-[#1e1e1e] px-6 py-4">
        <div className="max-w-6xl mx-auto">
          <p className="font-mono text-xs text-zinc-500 uppercase tracking-widest mb-1">Architecture</p>
          <h1 className="text-2xl font-bold">System Architecture</h1>
          <p className="text-zinc-400 text-sm mt-2">Click any component to see its implementation details.</p>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="grid lg:grid-cols-2 gap-8">
          {/* SVG diagram */}
          <div className="bg-[#111] border border-[#1e1e1e] rounded-xl p-6 overflow-hidden">
            <svg viewBox="0 0 100 100" className="w-full" style={{ fontFamily: "JetBrains Mono, monospace" }}>
              {/* Edges */}
              {EDGES.map(([a, b]) => {
                const ca = COMPONENTS.find(c => c.id === a)!;
                const cb = COMPONENTS.find(c => c.id === b)!;
                const pa = getCenter(ca);
                const pb = getCenter(cb);
                return (
                  <line key={`${a}-${b}`}
                    x1={pa.cx} y1={pa.cy} x2={pb.cx} y2={pb.cy}
                    stroke="#2a2a2a" strokeWidth="0.4" strokeDasharray="1.2 0.8"
                  />
                );
              })}
              {/* Nodes */}
              {COMPONENTS.map(c => {
                const isSelected = selected?.id === c.id;
                return (
                  <g key={c.id} transform={`translate(${c.x},${c.y})`}
                    onClick={() => setSelected(isSelected ? null : c)}
                    className="cursor-pointer">
                    <rect x="-18" y="-3" width="36" height="14" rx="2"
                      fill={isSelected ? "#1a1a2e" : "#111"}
                      stroke={isSelected ? (c.ring.replace("ring-", "#").replace("700","")) : "#2a2a2a"}
                      strokeWidth={isSelected ? "0.6" : "0.3"}
                    />
                    <text x="0" y="5" textAnchor="middle" fontSize="2.6"
                      className={isSelected ? c.color : "fill-zinc-400"} fill="currentColor">
                      {c.label}
                    </text>
                    <text x="0" y="9" textAnchor="middle" fontSize="1.8" fill="#52525b">
                      {c.sub}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>

          {/* Detail panel */}
          <div className="space-y-4">
            {selected ? (
              <div className="bg-[#111] border border-[#1e1e1e] rounded-xl p-6 h-full">
                <div className={`font-mono text-xs uppercase mb-1 ${selected.color}`}>{selected.id}</div>
                <h2 className="text-xl font-semibold mb-1">{selected.label}</h2>
                <p className="font-mono text-xs text-zinc-500 mb-5">{selected.sub}</p>

                <div className="space-y-5">
                  <div>
                    <div className="font-mono text-xs text-zinc-500 mb-1.5">WHAT IT DOES</div>
                    <p className="text-sm text-zinc-300">{selected.detail.what}</p>
                  </div>
                  <div>
                    <div className="font-mono text-xs text-zinc-500 mb-1.5">HOW</div>
                    <p className="text-sm text-zinc-400">{selected.detail.how}</p>
                  </div>
                  <div>
                    <div className="font-mono text-xs text-zinc-500 mb-1.5">CODE</div>
                    <pre className="bg-[#0d0d0d] border border-[#1e1e1e] rounded-lg p-3 font-mono text-xs text-emerald-300 whitespace-pre-wrap overflow-x-auto">
                      {selected.detail.code}
                    </pre>
                  </div>
                  <div>
                    <div className="font-mono text-xs text-zinc-500 mb-1.5">DESIGN RATIONALE</div>
                    <p className="text-sm text-zinc-400 italic">{selected.detail.why}</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-[#111] border border-[#1e1e1e] rounded-xl p-6 h-full flex items-center justify-center">
                <div className="text-center text-zinc-600">
                  <div className="font-mono text-sm mb-2">← Select a component</div>
                  <div className="text-xs">Click any node in the diagram to view implementation details</div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Data flow */}
        <div className="mt-8 bg-[#111] border border-[#1e1e1e] rounded-xl p-6">
          <h3 className="font-semibold mb-4">Data Flow: Payment Lifecycle</h3>
          <div className="flex flex-wrap gap-2 items-center font-mono text-xs">
            {[
              { label: "POST /demo/send", color: "text-cyan-400" },
              { label: "SHA-256(PIN)", color: "text-violet-400" },
              { label: "AES-GCM encrypt", color: "text-violet-400" },
              { label: "RSA-OAEP wrap", color: "text-violet-400" },
              { label: "MeshPacket created", color: "text-emerald-400" },
              { label: "TTL gossip", color: "text-emerald-400" },
              { label: "Bridge regains wifi", color: "text-amber-400" },
              { label: "POST /bridge/ingest", color: "text-amber-400" },
              { label: "SHA-256(cipher) claim", color: "text-red-400" },
              { label: "RSA-OAEP unwrap", color: "text-violet-400" },
              { label: "AES-GCM decrypt+verify", color: "text-violet-400" },
              { label: "@Transactional settle", color: "text-emerald-400" },
            ].map((s, i, arr) => (
              <span key={s.label} className="flex items-center gap-2">
                <span className={s.color}>{s.label}</span>
                {i < arr.length - 1 && <ChevronRight size={12} className="text-zinc-700" />}
              </span>
            ))}
          </div>
        </div>

        {/* Layer table */}
        <div className="mt-6 bg-[#111] border border-[#1e1e1e] rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#1e1e1e]">
                <th className="text-left font-mono text-xs text-zinc-500 px-4 py-3">LAYER</th>
                <th className="text-left font-mono text-xs text-zinc-500 px-4 py-3">TECH</th>
                <th className="text-left font-mono text-xs text-zinc-500 px-4 py-3">CONCURRENCY MODEL</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1a1a1a]">
              {[
                ["API", "Spring MVC @RestController", "Thread-per-request (Tomcat)"],
                ["Mesh", "ConcurrentHashMap<String, MeshPacket>", "Lock-free reads, putIfAbsent for idempotency"],
                ["Settlement", "@Transactional + @Version (JPA)", "Optimistic locking at entity level"],
                ["Database", "H2 in-memory, Hibernate 6", "ACID transactions, auto DDL"],
                ["Crypto", "JCA (RSA-OAEP + AES-GCM)", "Stateless — no shared mutable state"],
              ].map(([layer, tech, concurrency]) => (
                <tr key={layer}>
                  <td className="font-mono text-xs text-cyan-400 px-4 py-3">{layer}</td>
                  <td className="font-mono text-xs text-zinc-300 px-4 py-3">{tech}</td>
                  <td className="font-mono text-xs text-zinc-500 px-4 py-3">{concurrency}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
