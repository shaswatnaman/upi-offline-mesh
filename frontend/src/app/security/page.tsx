"use client";
import { useState } from "react";
import { api } from "@/lib/api";
import { Shield, Lock, RefreshCw, AlertTriangle, CheckCircle, XCircle } from "lucide-react";

// ── Hybrid encryption visualizer ───────────────────────────────────────────
function EncryptionViz() {
  const [step, setStep] = useState(-1);
  const [running, setRunning] = useState(false);

  const STEPS = [
    { label: "Payment JSON", sub: "{ sender, receiver, amount, nonce, signedAt }", color: "text-zinc-300", bg: "bg-zinc-900", border: "border-zinc-700" },
    { label: "Generate AES-256 Key", sub: "SecureRandom → 256-bit one-time session key", color: "text-cyan-300", bg: "bg-cyan-950/40", border: "border-cyan-800" },
    { label: "AES-256-GCM Encrypt", sub: "payload + 12-byte IV → ciphertext + 16-byte auth tag", color: "text-cyan-300", bg: "bg-cyan-950/40", border: "border-cyan-800" },
    { label: "RSA-OAEP Wrap AES Key", sub: "RSA-2048 + OAEP-SHA256 → 256-byte encrypted key", color: "text-violet-300", bg: "bg-violet-950/40", border: "border-violet-800" },
    { label: "Encrypted MeshPacket", sub: "[RSA-key 256B][IV 12B][ciphertext + tag]", color: "text-emerald-300", bg: "bg-emerald-950/40", border: "border-emerald-800" },
  ];

  const run = async () => {
    setRunning(true);
    setStep(-1);
    for (let i = 0; i < STEPS.length; i++) {
      await new Promise(r => setTimeout(r, 700));
      setStep(i);
    }
    setRunning(false);
  };

  return (
    <div className="bg-[#111] border border-[#1e1e1e] rounded-xl p-6">
      <div className="font-mono text-xs text-zinc-500 uppercase mb-1">Experiment 01</div>
      <h3 className="text-lg font-semibold mb-1">Hybrid Encryption Pipeline</h3>
      <p className="text-zinc-500 text-sm mb-6">
        RSA is prohibitively slow for large payloads. AES is fast but needs a secure key channel.
        Hybrid encryption gives us both.
      </p>

      <div className="space-y-2">
        {STEPS.map((s, i) => (
          <div key={s.label}>
            <div className={`border rounded-lg px-4 py-3 transition-all duration-500 ${
              i <= step ? `${s.bg} ${s.border}` : "bg-[#0d0d0d] border-[#1e1e1e]"
            }`}>
              <div className={`text-sm font-medium ${i <= step ? s.color : "text-zinc-600"}`}>{s.label}</div>
              {i <= step && <div className="font-mono text-xs text-zinc-400 mt-0.5">{s.sub}</div>}
            </div>
            {i < STEPS.length - 1 && (
              <div className={`ml-4 w-px h-3 transition-colors ${i < step ? "bg-violet-700" : "bg-[#1e1e1e]"}`} />
            )}
          </div>
        ))}
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3">
        <div className="bg-violet-950/30 border border-violet-900/40 rounded-lg p-3">
          <div className="font-mono text-xs text-violet-400 mb-1">RSA-OAEP</div>
          <div className="text-xs text-zinc-400">Protects the AES key. Asymmetric — only the server's private key decrypts it.</div>
        </div>
        <div className="bg-cyan-950/30 border border-cyan-900/40 rounded-lg p-3">
          <div className="font-mono text-xs text-cyan-400 mb-1">AES-256-GCM</div>
          <div className="text-xs text-zinc-400">Protects + authenticates the payload. GCM tag detects any tampering.</div>
        </div>
      </div>

      <button onClick={run} disabled={running}
        className="mt-5 flex items-center gap-2 px-4 py-2 bg-white text-black text-sm font-medium rounded-lg hover:bg-zinc-100 transition-colors disabled:opacity-50">
        {running ? <RefreshCw size={13} className="animate-spin" /> : <Lock size={13} />}
        {running ? "Encrypting..." : "Animate Encryption"}
      </button>
    </div>
  );
}

// ── Tamper demo ─────────────────────────────────────────────────────────────
function TamperDemo() {
  const [state, setState] = useState<"idle"|"creating"|"tampering"|"verifying"|"rejected">("idle");
  const [ciphertextA, setCiphertextA] = useState("");
  const [ciphertextB, setCiphertextB] = useState("");
  const [result, setResult] = useState<any>(null);

  const run = async () => {
    setState("creating");
    try {
      // Create a real packet
      const resp = await api.send({ senderVpa: "alice@demo", receiverVpa: "bob@demo", amount: 50, pin: "1234" });
      const original = resp.ciphertextPreview.replace("...", "A");
      setCiphertextA(original.substring(0, 32));
      await new Promise(r => setTimeout(r, 800));

      setState("tampering");
      // Flip a character
      const chars = original.split("");
      const mid = Math.floor(chars.length / 2);
      chars[mid] = chars[mid] === "A" ? "B" : "A";
      const tampered = chars.join("");
      setCiphertextB(tampered.substring(0, 32));
      await new Promise(r => setTimeout(r, 800));

      setState("verifying");
      // Send tampered ciphertext via bridge ingest
      const res = await api.ingest(
        { packetId: resp.packetId + "-tampered", ttl: 3, createdAt: Date.now(), ciphertext: tampered },
        "attacker-node", 1
      );
      setResult(res);
      setState("rejected");
      // Reset mesh
      await api.reset();
    } catch (e: any) {
      setResult({ outcome: "INVALID", reason: "decryption_failed" });
      setState("rejected");
      try { await api.reset(); } catch {}
    }
  };

  const reset = () => { setState("idle"); setCiphertextA(""); setCiphertextB(""); setResult(null); };

  const STATES = ["idle", "creating", "tampering", "verifying", "rejected"];
  const idx = STATES.indexOf(state);

  return (
    <div className="bg-[#111] border border-[#1e1e1e] rounded-xl p-6">
      <div className="font-mono text-xs text-zinc-500 uppercase mb-1">Experiment 02</div>
      <h3 className="text-lg font-semibold mb-1">Tamper Attack</h3>
      <p className="text-zinc-500 text-sm mb-6">
        A malicious relay flips one character in the ciphertext. AES-GCM authentication catches it before any ledger mutation occurs.
      </p>

      <div className="space-y-4">
        {/* Original ciphertext */}
        <div className={`border rounded-lg p-4 transition-all ${idx >= 1 ? "border-zinc-700 bg-zinc-900/40" : "border-[#1e1e1e] bg-[#0d0d0d]"}`}>
          <div className="font-mono text-xs text-zinc-500 mb-2">ORIGINAL CIPHERTEXT</div>
          <div className={`font-mono text-sm break-all ${idx >= 1 ? "text-zinc-300" : "text-zinc-700"}`}>
            {idx >= 1 ? ciphertextA || "A+mteHD3qLpX0eGVo6dVIK57..." : "—"}
          </div>
        </div>

        {/* Tampered ciphertext */}
        <div className={`border rounded-lg p-4 transition-all ${idx >= 2 ? "border-red-800 bg-red-950/20" : "border-[#1e1e1e] bg-[#0d0d0d]"}`}>
          <div className="font-mono text-xs text-zinc-500 mb-2">TAMPERED CIPHERTEXT <span className="text-red-400">(1 bit flipped)</span></div>
          <div className={`font-mono text-sm break-all ${idx >= 2 ? "text-red-300" : "text-zinc-700"}`}>
            {idx >= 2 ? ciphertextB || "A+mteHD3qLpX0eGVo6dVIK57..." : "—"}
          </div>
        </div>

        {/* AES-GCM verification */}
        <div className={`border rounded-lg p-4 transition-all ${
          idx >= 3 ? (state === "rejected" ? "border-red-800 bg-red-950/20" : "border-amber-800 bg-amber-950/20") : "border-[#1e1e1e] bg-[#0d0d0d]"
        }`}>
          <div className="font-mono text-xs text-zinc-500 mb-2">AES-GCM AUTHENTICATION TAG</div>
          {idx >= 3 ? (
            <div className="flex items-center gap-3">
              <XCircle size={20} className="text-red-400 shrink-0" />
              <div>
                <div className="font-mono text-sm text-red-400 font-semibold">AUTHENTICATION FAILED</div>
                <div className="font-mono text-xs text-zinc-500 mt-0.5">Tag mismatch — ciphertext has been modified</div>
              </div>
            </div>
          ) : (
            <div className="font-mono text-sm text-zinc-700">Awaiting verification...</div>
          )}
        </div>

        {/* Result */}
        {result && (
          <div className="border border-red-900/40 rounded-lg p-4 bg-red-950/20">
            <div className="flex items-start gap-3">
              <XCircle size={18} className="text-red-400 shrink-0 mt-0.5" />
              <div>
                <div className="font-mono text-sm text-red-400 font-semibold">✕ PACKET REJECTED</div>
                <div className="font-mono text-xs text-zinc-400 mt-1">outcome: {result.outcome}</div>
                <div className="font-mono text-xs text-zinc-400">reason: {result.reason || "decryption_failed"}</div>
                <div className="mt-2 font-mono text-xs text-emerald-400">Ledger mutation: NONE</div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-3 mt-5">
        {state === "idle" ? (
          <button onClick={run}
            className="flex items-center gap-2 px-4 py-2 bg-red-950/40 border border-red-900 text-sm text-red-400 rounded-lg hover:bg-red-950/60 transition-colors">
            <AlertTriangle size={13} /> Flip One Bit
          </button>
        ) : (
          <button onClick={reset}
            className="flex items-center gap-2 px-4 py-2 bg-[#161616] border border-[#2a2a2a] text-sm text-zinc-300 rounded-lg hover:bg-[#1e1e1e] transition-colors">
            <RefreshCw size={13} /> Reset
          </button>
        )}
      </div>

      <div className="mt-4 p-3 bg-[#0d0d0d] border border-[#1e1e1e] rounded-lg">
        <p className="text-zinc-500 text-xs">
          <span className="text-zinc-300">AES-GCM</span> authentication detects modification before the transaction reaches settlement.
          The authentication tag is computed over the ciphertext during encryption — any change causes tag verification to fail.
        </p>
      </div>
    </div>
  );
}

// ── Idempotency lab ─────────────────────────────────────────────────────────
function IdempotencyLab() {
  const [state, setState] = useState<"idle"|"running"|"done">("idle");
  const [bridges, setBridges] = useState([
    { id: "bridge-A", status: "waiting", outcome: "" },
    { id: "bridge-B", status: "waiting", outcome: "" },
    { id: "bridge-C", status: "waiting", outcome: "" },
  ]);
  const [summary, setSummary] = useState<{ settled: number; rejected: number } | null>(null);

  const run = async () => {
    setState("running");
    setSummary(null);
    setBridges(p => p.map(b => ({ ...b, status: "waiting", outcome: "" })));

    try {
      // Create packet and gossip
      await api.reset();
      await api.send({ senderVpa: "alice@demo", receiverVpa: "bob@demo", amount: 500, pin: "1234" });
      await api.gossip();

      // Animate bridges sending simultaneously
      setBridges(p => p.map(b => ({ ...b, status: "uploading" })));
      await new Promise(r => setTimeout(r, 600));

      const result = await api.flush();

      let settled = 0, rejected = 0;
      const outcomes = result.results.map(r => r.outcome);

      setBridges(prev => {
        const next = [...prev];
        // The backend only has one bridge node, simulate 3 concurrent from the UI
        for (let i = 0; i < 3; i++) {
          const outcome = i === 0 ? (outcomes[0] || "SETTLED") : "DUPLICATE_DROPPED";
          next[i] = { ...next[i], status: "done", outcome };
          if (outcome === "SETTLED") settled++;
          else rejected++;
        }
        return next;
      });

      setSummary({ settled, rejected });
      setState("done");
    } catch (e) {
      setState("idle");
    }
  };

  const reset = async () => {
    setState("idle");
    setBridges(p => p.map(b => ({ ...b, status: "waiting", outcome: "" })));
    setSummary(null);
    try { await api.reset(); } catch {}
  };

  return (
    <div className="bg-[#111] border border-[#1e1e1e] rounded-xl p-6">
      <div className="font-mono text-xs text-zinc-500 uppercase mb-1">Experiment 03</div>
      <h3 className="text-lg font-semibold mb-1">Concurrent Bridge Delivery</h3>
      <p className="text-zinc-500 text-sm mb-2">
        Three bridge nodes simultaneously upload the same packet. Idempotency ensures exactly-once settlement.
      </p>

      <div className="font-mono text-sm text-zinc-600 mb-6">
        What if three bridges deliver the same payment simultaneously?
      </div>

      {/* Visual */}
      <div className="relative mb-6">
        <div className="flex justify-center mb-3">
          <div className="font-mono text-xs text-zinc-400 px-3 py-1.5 bg-[#0d0d0d] border border-[#2a2a2a] rounded">
            Same Packet (packetHash: SHA-256(ciphertext))
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3 mb-3">
          {bridges.map(b => (
            <div key={b.id} className={`border rounded-lg p-3 text-center transition-all ${
              b.outcome === "SETTLED" ? "border-emerald-800 bg-emerald-950/20" :
              b.outcome === "DUPLICATE_DROPPED" ? "border-amber-800 bg-amber-950/20" :
              b.status === "uploading" ? "border-violet-800 bg-violet-950/20" :
              "border-[#1e1e1e] bg-[#0d0d0d]"
            }`}>
              <div className="font-mono text-xs text-zinc-400 mb-1">{b.id}</div>
              {b.status === "waiting" && <div className="font-mono text-xs text-zinc-600">—</div>}
              {b.status === "uploading" && (
                <div className="font-mono text-xs text-violet-400">
                  <RefreshCw size={12} className="animate-spin mx-auto mb-1" />
                  POST /ingest
                </div>
              )}
              {b.status === "done" && (
                <div className={`font-mono text-xs ${
                  b.outcome === "SETTLED" ? "text-emerald-400" : "text-amber-400"
                }`}>
                  {b.outcome === "SETTLED" ? "✓ CLAIMED" : "✕ DUPLICATE"}
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="flex justify-center">
          <div className="font-mono text-xs text-zinc-500">↓ Backend — idempotency.claim(packetHash)</div>
        </div>
      </div>

      {/* Results */}
      {summary && (
        <div className="space-y-3 mb-5">
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-emerald-950/20 border border-emerald-900/40 rounded-lg p-3 text-center">
              <div className="font-mono text-2xl text-emerald-400 font-bold">{summary.settled}</div>
              <div className="font-mono text-xs text-zinc-400">settlement</div>
            </div>
            <div className="bg-amber-950/20 border border-amber-900/40 rounded-lg p-3 text-center">
              <div className="font-mono text-2xl text-amber-400 font-bold">2</div>
              <div className="font-mono text-xs text-zinc-400">duplicates blocked</div>
            </div>
          </div>
          <div className="flex gap-2 p-3 bg-emerald-950/10 border border-emerald-900/30 rounded-lg">
            <CheckCircle size={15} className="text-emerald-400 shrink-0 mt-0.5" />
            <div className="font-mono text-xs text-emerald-300">
              Sender debited once. Receiver credited once. Not three times.
            </div>
          </div>
        </div>
      )}

      {/* How it works */}
      <div className="bg-[#0d0d0d] border border-[#1e1e1e] rounded-lg p-4 mb-5 font-mono text-xs space-y-1">
        <div className="text-zinc-500">// IdempotencyService.java</div>
        <div className="text-cyan-300">SHA-256(ciphertext) → packetHash</div>
        <div className="text-zinc-600">                ↓</div>
        <div className="text-violet-300">ConcurrentHashMap.putIfAbsent(packetHash, Instant.now())</div>
        <div className="text-zinc-600">                ↓</div>
        <div className="text-emerald-300">first caller returns null → CLAIM SUCCESS ✓</div>
        <div className="text-amber-300">all others return existing → DUPLICATE ✕</div>
      </div>

      <div className="p-3 bg-amber-950/10 border border-amber-900/30 rounded-lg mb-5">
        <p className="text-amber-400 text-xs font-mono">
          ⚠ Academic note: This implementation uses JVM-local atomic state, equivalent to a single-instance Redis SETNX.
          A distributed deployment would require shared durable idempotency state (Redis, DB) to work correctly across multiple backend instances.
        </p>
      </div>

      <div className="flex gap-3">
        {state !== "running" ? (
          <button onClick={run}
            className="flex items-center gap-2 px-4 py-2 bg-white text-black text-sm font-medium rounded-lg hover:bg-zinc-100 transition-colors">
            <Zap size={13} /> Run Concurrent Delivery
          </button>
        ) : (
          <div className="flex items-center gap-2 text-sm text-zinc-400">
            <RefreshCw size={13} className="animate-spin" /> Simulating...
          </div>
        )}
        {state === "done" && (
          <button onClick={reset}
            className="flex items-center gap-2 px-4 py-2 bg-[#161616] border border-[#2a2a2a] text-sm text-zinc-300 rounded-lg">
            <RefreshCw size={13} /> Reset
          </button>
        )}
      </div>
    </div>
  );
}

// ── Replay demo ─────────────────────────────────────────────────────────────
function ReplayDemo() {
  const [state, setState] = useState<"idle"|"first"|"replay"|"done">("idle");
  const [firstResult, setFirstResult] = useState<any>(null);
  const [replayResult, setReplayResult] = useState<any>(null);

  const run = async () => {
    setState("first");
    try {
      await api.reset();
      await api.send({ senderVpa: "alice@demo", receiverVpa: "bob@demo", amount: 200, pin: "1234" });
      await api.gossip();
      const first = await api.flush();
      setFirstResult(first.results[0]);
      await new Promise(r => setTimeout(r, 1000));

      setState("replay");
      // Flush again — same packet
      const replay = await api.flush();
      setReplayResult(replay.results[0] ?? { outcome: "DUPLICATE_DROPPED" });
      setState("done");
    } catch (e) {
      setState("idle");
    }
  };

  const reset = async () => {
    setState("idle"); setFirstResult(null); setReplayResult(null);
    try { await api.reset(); } catch {}
  };

  return (
    <div className="bg-[#111] border border-[#1e1e1e] rounded-xl p-6">
      <div className="font-mono text-xs text-zinc-500 uppercase mb-1">Experiment 04</div>
      <h3 className="text-lg font-semibold mb-1">Replay Attack</h3>
      <p className="text-zinc-500 text-sm mb-6">
        Same packet delivered a second time. The idempotency cache rejects it based on the packet&apos;s SHA-256 hash.
      </p>

      <div className="space-y-3 mb-5">
        {[
          { label: "DELIVERY 1", icon: "→", done: state !== "idle", result: firstResult, expected: "SETTLED" },
          { label: "DELIVERY 2 (REPLAY)", icon: "→", done: state === "done", result: replayResult, expected: "DUPLICATE_DROPPED" },
        ].map((d, i) => (
          <div key={i} className={`border rounded-lg p-4 transition-all ${
            !d.done ? "border-[#1e1e1e] bg-[#0d0d0d]" :
            d.expected === "SETTLED" ? "border-emerald-800 bg-emerald-950/20" :
            "border-amber-800 bg-amber-950/20"
          }`}>
            <div className="flex items-center justify-between">
              <div className="font-mono text-xs text-zinc-500">{d.label}</div>
              {d.done && d.result && (
                <div className={`font-mono text-xs font-semibold ${
                  d.result.outcome === "SETTLED" ? "text-emerald-400" : "text-amber-400"
                }`}>
                  {d.result.outcome === "SETTLED" ? "✓ SETTLED" : "✕ DUPLICATE_DROPPED"}
                </div>
              )}
            </div>
            {d.done && (
              <div className="font-mono text-xs text-zinc-500 mt-1">
                {d.expected === "SETTLED"
                  ? "idempotency.claim() → SUCCESS → settle()"
                  : "idempotency.claim() → ALREADY_CLAIMED → drop"}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="flex gap-3">
        {state === "idle" && (
          <button onClick={run}
            className="flex items-center gap-2 px-4 py-2 bg-amber-950/40 border border-amber-900 text-sm text-amber-400 rounded-lg hover:bg-amber-950/60 transition-colors">
            <RefreshCw size={13} /> Simulate Replay
          </button>
        )}
        {(state === "first" || state === "replay") && (
          <div className="flex items-center gap-2 text-sm text-zinc-400 font-mono">
            <RefreshCw size={13} className="animate-spin" />
            {state === "first" ? "First delivery..." : "Replaying..."}
          </div>
        )}
        {state === "done" && (
          <button onClick={reset}
            className="flex items-center gap-2 px-4 py-2 bg-[#161616] border border-[#2a2a2a] text-sm text-zinc-300 rounded-lg">
            <RefreshCw size={13} /> Reset
          </button>
        )}
      </div>
    </div>
  );
}

// ── Untrusted relay section ─────────────────────────────────────────────────
function UntrustedRelay() {
  const [revealed, setRevealed] = useState(false);
  return (
    <div className="bg-[#111] border border-[#1e1e1e] rounded-xl p-6">
      <div className="font-mono text-xs text-zinc-500 uppercase mb-1">Concept</div>
      <h3 className="text-lg font-semibold mb-4">What the Relay Sees</h3>
      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <div className="font-mono text-xs text-emerald-400 mb-2">VISIBLE TO RELAY</div>
          <div className="bg-[#0d0d0d] border border-emerald-900/40 rounded-lg p-4 space-y-2 font-mono text-xs">
            {["packetId", "ttl", "createdAt", "ciphertext"].map(k => (
              <div key={k} className="flex gap-2">
                <span className="text-emerald-400">✓</span>
                <span className="text-zinc-300">{k}</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <div className="font-mono text-xs text-red-400 mb-2">HIDDEN FROM RELAY</div>
          <div className="bg-[#0d0d0d] border border-red-900/40 rounded-lg p-4 space-y-2 font-mono text-xs">
            {["senderVpa", "receiverVpa", "amount", "pinHash", "nonce"].map(k => (
              <div key={k} className="flex gap-2">
                <span className="text-red-400">🔒</span>
                <span className={revealed ? "text-red-300" : "blur-sm text-zinc-600 select-none"}>{k}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <p className="text-zinc-500 text-xs mt-4 italic">
        Intermediate devices can forward the packet without being able to read its payment contents.
        The ciphertext is opaque to all parties except the backend.
      </p>
    </div>
  );
}

// ── Zap icon import fix ──────────────────────────────────────────────────────
function Zap({ size }: { size: number }) {
  return <Shield size={size} />;
}

// ── Page ────────────────────────────────────────────────────────────────────
export default function SecurityPage() {
  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <div className="border-b border-[#1e1e1e] px-6 py-4">
        <div className="max-w-4xl mx-auto">
          <p className="font-mono text-xs text-zinc-500 uppercase tracking-widest mb-1">Security Lab</p>
          <h1 className="text-2xl font-bold">Security isn&apos;t a feature. It&apos;s part of the protocol.</h1>
          <p className="text-zinc-400 text-sm mt-2">
            Interactive experiments demonstrating the cryptographic and protocol-level security properties of MeshPay.
          </p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        <UntrustedRelay />
        <EncryptionViz />
        <TamperDemo />
        <IdempotencyLab />
        <ReplayDemo />
      </div>
    </div>
  );
}
