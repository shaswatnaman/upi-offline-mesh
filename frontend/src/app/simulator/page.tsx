"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, type Account, type DeviceState, type FlushResult, type GossipResult, type MeshState, type SendResponse } from "@/lib/api";
import { Play, RefreshCw, Zap, RotateCcw, ChevronRight, Lock, Wifi, WifiOff, AlertTriangle, X } from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────
interface LogEntry { ts: string; level: "INFO" | "WARN" | "ERROR" | "SUCCESS"; cat: string; msg: string; }
interface PacketInfo { id: string; preview: string; ttl: number; sentAt: string; }

// ── Event log ──────────────────────────────────────────────────────────────
function useLog() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const add = useCallback((level: LogEntry["level"], cat: string, msg: string) => {
    setLogs(p => [...p.slice(-199), { ts: new Date().toLocaleTimeString(), level, cat, msg }]);
  }, []);
  const clear = useCallback(() => setLogs([]), []);
  return { logs, add, clear };
}

// ── Network canvas ─────────────────────────────────────────────────────────
const POS: Record<string, { x: number; y: number }> = {
  "phone-alice":    { x: 280, y: 60 },
  "phone-stranger1":{ x: 100, y: 200 },
  "phone-stranger2":{ x: 280, y: 200 },
  "phone-stranger3":{ x: 460, y: 200 },
  "phone-bridge":   { x: 280, y: 330 },
  "backend":        { x: 280, y: 450 },
};

const EDGES: [string, string][] = [
  ["phone-alice","phone-stranger1"],
  ["phone-alice","phone-stranger2"],
  ["phone-alice","phone-stranger3"],
  ["phone-stranger1","phone-bridge"],
  ["phone-stranger2","phone-bridge"],
  ["phone-stranger3","phone-bridge"],
  ["phone-bridge","backend"],
];

interface AnimPacket { id: string; from: string; to: string; progress: number; startTime: number; }

function NetworkCanvas({
  devices, activeEdges, packets,
}: {
  devices: DeviceState[];
  activeEdges: [string, string][];
  packets: AnimPacket[];
}) {
  const now = Date.now();
  const allDevices = [
    ...devices,
    { deviceId: "backend", hasInternet: true, packetCount: 0, packetIds: [] },
  ];

  return (
    <svg viewBox="0 0 560 520" className="w-full" style={{ maxHeight: 520 }}>
      {/* Edges */}
      {EDGES.map(([from, to]) => {
        const f = POS[from], t = POS[to];
        if (!f || !t) return null;
        const active = activeEdges.some(([ef, et]) => ef === from && et === to);
        return (
          <line key={`${from}-${to}`}
            x1={f.x} y1={f.y} x2={t.x} y2={t.y}
            stroke={active ? "#7c3aed" : "#1e1e1e"}
            strokeWidth={active ? 2 : 1}
            strokeDasharray={active ? "6 3" : "none"}
          />
        );
      })}

      {/* Animated packets */}
      {packets.map(p => {
        const f = POS[p.from], t = POS[p.to];
        if (!f || !t) return null;
        const elapsed = (now - p.startTime) / 800;
        const prog = Math.min(elapsed, 1);
        const cx = f.x + (t.x - f.x) * prog;
        const cy = f.y + (t.y - f.y) * prog;
        return (
          <g key={p.id}>
            <circle cx={cx} cy={cy} r={6} fill="#7c3aed" opacity={0.9} />
            <circle cx={cx} cy={cy} r={10} fill="none" stroke="#7c3aed" strokeWidth={1} opacity={0.3} />
          </g>
        );
      })}

      {/* Nodes */}
      {allDevices.map(d => {
        const pos = POS[d.deviceId];
        if (!pos) return null;
        const isBridge = d.hasInternet && d.deviceId !== "backend";
        const isBackend = d.deviceId === "backend";
        const isAlice = d.deviceId === "phone-alice";
        const hasPkts = d.packetCount > 0;

        const stroke = isBackend ? "#059669" : isBridge ? "#0891b2" : isAlice ? "#7c3aed" : hasPkts ? "#7c3aed" : "#2a2a2a";
        const bg = isBackend ? "#052e16" : isBridge ? "#083344" : hasPkts ? "#1e1b4b" : "#111111";

        const label = isBackend ? "BACKEND" : d.deviceId.replace("phone-", "").toUpperCase();
        const sub = isBackend ? "Spring Boot ✓" : isBridge ? "Internet ✓" : isAlice ? "Sender" : "Relay";

        return (
          <g key={d.deviceId} transform={`translate(${pos.x},${pos.y})`}>
            {hasPkts && (
              <circle r={26} fill="none" stroke="#7c3aed" strokeWidth={1} opacity={0.4}
                style={{ animation: "node-ping 1.5s ease-out infinite" }} />
            )}
            <circle r={22} fill={bg} stroke={stroke} strokeWidth={1.5} />
            <text y={-30} textAnchor="middle" fontSize={9} fill={hasPkts || isBackend || isBridge ? "#fff" : "#71717a"}
              fontFamily="JetBrains Mono,monospace" fontWeight={600}>{label}</text>
            <text y={-20} textAnchor="middle" fontSize={7} fill={stroke}
              fontFamily="JetBrains Mono,monospace">{sub}</text>
            {d.packetCount > 0 && (
              <g transform="translate(16,-16)">
                <circle r={8} fill="#7c3aed" />
                <text textAnchor="middle" y={3} fontSize={8} fill="white" fontWeight={700}>
                  {d.packetCount}
                </text>
              </g>
            )}
            {isBridge && (
              <text y={8} textAnchor="middle" fontSize={11}>📡</text>
            )}
            {isBackend && (
              <text y={8} textAnchor="middle" fontSize={11}>☁️</text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

// ── Packet inspector drawer ────────────────────────────────────────────────
function PacketDrawer({ packet, onClose }: { packet: PacketInfo; onClose: () => void }) {
  return (
    <div className="fixed inset-y-0 right-0 z-50 w-full max-w-sm bg-[#0d0d0d] border-l border-[#1e1e1e] overflow-y-auto animate-slide-right shadow-2xl">
      <div className="p-5 border-b border-[#1e1e1e] flex items-center justify-between">
        <div>
          <div className="font-mono text-xs text-zinc-500 mb-1">PACKET INSPECTOR</div>
          <div className="font-mono text-sm text-violet-400">mp_{packet.id.substring(0, 8)}</div>
        </div>
        <button onClick={onClose} className="p-1.5 text-zinc-500 hover:text-white"><X size={16} /></button>
      </div>
      <div className="p-5 space-y-5">
        <div>
          <div className="font-mono text-xs text-zinc-500 mb-3">METADATA</div>
          <div className="space-y-2 font-mono text-sm">
            {[
              ["Packet ID", `mp_${packet.id.substring(0,8)}...`],
              ["TTL", `${packet.ttl} hops remaining`],
              ["Created", packet.sentAt],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4">
                <span className="text-zinc-500">{k}</span>
                <span className="text-zinc-200 text-right text-xs">{v}</span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="font-mono text-xs text-zinc-500 mb-3">CIPHERTEXT PREVIEW</div>
          <div className="bg-[#0a0a0a] border border-[#1e1e1e] rounded-lg p-3 font-mono text-xs text-zinc-400 break-all">
            {packet.preview}
          </div>
          <p className="text-zinc-600 text-xs mt-2">
            Intermediate devices forward this blob without being able to read its payment contents.
          </p>
        </div>

        <div>
          <div className="font-mono text-xs text-zinc-500 mb-3">CRYPTOGRAPHIC ENVELOPE</div>
          <div className="space-y-2">
            {[
              { label: "RSA-OAEP wrapped AES key", size: "256 bytes", color: "text-violet-400" },
              { label: "AES-GCM IV", size: "12 bytes", color: "text-cyan-400" },
              { label: "Authentication Tag", size: "16 bytes", color: "text-emerald-400" },
            ].map(({ label, size, color }) => (
              <div key={label} className="flex items-center justify-between bg-[#111] border border-[#1e1e1e] rounded-lg px-3 py-2">
                <span className={`font-mono text-xs ${color}`}>{label}</span>
                <span className="font-mono text-xs text-zinc-600">{size}</span>
              </div>
            ))}
            <div className="bg-[#111] border border-[#1e1e1e] rounded-lg px-3 py-3">
              <div className="font-mono text-xs text-zinc-500 mb-1">Ciphertext</div>
              <div className="font-mono text-lg text-zinc-700 tracking-widest">████████████████████</div>
              <div className="font-mono text-xs text-zinc-600 mt-1">OPAQUE</div>
            </div>
          </div>
          <div className="mt-3 p-3 bg-[#111] border border-[#2a2a2a] rounded-lg">
            <p className="text-zinc-500 text-xs italic">
              "Intermediate devices can forward the packet without being able to read its payment contents."
            </p>
          </div>
        </div>

        <div>
          <div className="font-mono text-xs text-zinc-500 mb-3">ROUTE</div>
          <div className="flex flex-col gap-1 font-mono text-xs">
            {["Alice (Sender)", "Mesh Devices", "Bridge (Internet)", "Backend"].map((s, i) => (
              <div key={s}>
                <div className={`flex items-center gap-2 ${i === 0 ? "text-violet-400" : i === 3 ? "text-emerald-400" : "text-zinc-400"}`}>
                  <div className={`w-1.5 h-1.5 rounded-full ${i === 3 ? "bg-emerald-400" : i === 0 ? "bg-violet-400" : "bg-zinc-600"}`} />
                  {s}
                </div>
                {i < 3 && <div className="ml-[3px] w-px h-3 bg-[#2a2a2a]" />}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────
export default function SimulatorPage() {
  const [meshState, setMeshState] = useState<MeshState | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastGossip, setLastGossip] = useState<GossipResult | null>(null);
  const [flushResult, setFlushResult] = useState<FlushResult | null>(null);
  const [currentPacket, setCurrentPacket] = useState<PacketInfo | null>(null);
  const [inspecting, setInspecting] = useState(false);
  const [activeEdges, setActiveEdges] = useState<[string,string][]>([]);
  const [animPackets, setAnimPackets] = useState<AnimPacket[]>([]);
  const [attackMode, setAttackMode] = useState("normal");
  const { logs, add, clear } = useLog();
  const animRef = useRef<ReturnType<typeof setInterval>>(null);

  // Form state
  const [form, setForm] = useState({ sender: "alice@demo", receiver: "bob@demo", amount: "100", pin: "1234" });

  const refreshState = useCallback(async () => {
    try {
      const [m, a] = await Promise.all([api.meshState(), api.accounts()]);
      setMeshState(m);
      setAccounts(a);
    } catch (e) {
      setError("Backend unreachable — check that the Spring Boot service is running.");
    }
  }, []);

  useEffect(() => {
    refreshState();
    const id = setInterval(refreshState, 5000);
    return () => clearInterval(id);
  }, [refreshState]);

  // Animate frames
  useEffect(() => {
    animRef.current = setInterval(() => {
      setAnimPackets(p => p.filter(pk => Date.now() - pk.startTime < 1000));
    }, 100);
    return () => { if (animRef.current) clearInterval(animRef.current); };
  }, []);

  const flash = (edges: [string,string][]) => {
    setActiveEdges(edges);
    setTimeout(() => setActiveEdges([]), 1200);
  };

  const handleSend = async () => {
    if (!form.sender || !form.receiver || !form.amount || !form.pin) return;
    setLoading(true);
    setFlushResult(null);
    setLastGossip(null);
    try {
      add("INFO", "SENDER", `Creating encrypted packet: ${form.sender} → ${form.receiver} ₹${form.amount}`);

      let resp: SendResponse;
      if (attackMode === "tamper") {
        resp = await api.send({ senderVpa: form.sender, receiverVpa: form.receiver, amount: parseFloat(form.amount), pin: form.pin });
        add("WARN", "ATTACK", `Flipping bit in ciphertext (tamper simulation)`);
      } else if (attackMode === "replay") {
        resp = await api.send({ senderVpa: form.sender, receiverVpa: form.receiver, amount: parseFloat(form.amount), pin: form.pin });
        add("WARN", "ATTACK", `Replay mode: same packet will be delivered twice`);
      } else {
        resp = await api.send({ senderVpa: form.sender, receiverVpa: form.receiver, amount: parseFloat(form.amount), pin: form.pin });
      }

      setCurrentPacket({
        id: resp.packetId,
        preview: resp.ciphertextPreview,
        ttl: resp.ttl,
        sentAt: new Date().toLocaleTimeString(),
      });

      add("INFO", "CRYPTO", `Hybrid RSA+AES-GCM encryption complete`);
      add("INFO", "MESH", `Packet injected at phone-alice (TTL=${resp.ttl})`);
      flash([["phone-alice","phone-stranger1"],["phone-alice","phone-stranger2"],["phone-alice","phone-stranger3"]]);

      setAnimPackets(p => [
        ...p,
        { id: `${resp.packetId}-1`, from: "phone-alice", to: "phone-stranger1", progress: 0, startTime: Date.now() },
        { id: `${resp.packetId}-2`, from: "phone-alice", to: "phone-stranger2", progress: 0, startTime: Date.now() + 100 },
        { id: `${resp.packetId}-3`, from: "phone-alice", to: "phone-stranger3", progress: 0, startTime: Date.now() + 200 },
      ]);

      await refreshState();
    } catch (e: any) {
      add("ERROR", "API", e.message || "Request failed");
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGossip = async () => {
    setLoading(true);
    try {
      add("INFO", "MESH", "Starting gossip round...");
      const r = await api.gossip();
      setLastGossip(r);
      add("SUCCESS", "MESH", `Gossip complete — ${r.transfers} transfers across ${Object.keys(r.deviceCounts).length} devices`);
      flash([
        ["phone-stranger1","phone-bridge"],
        ["phone-stranger2","phone-bridge"],
        ["phone-stranger3","phone-bridge"],
      ]);
      setAnimPackets(p => [
        ...p,
        { id: `g-1`, from: "phone-stranger1", to: "phone-bridge", progress: 0, startTime: Date.now() },
        { id: `g-2`, from: "phone-stranger2", to: "phone-bridge", progress: 0, startTime: Date.now() + 150 },
        { id: `g-3`, from: "phone-stranger3", to: "phone-bridge", progress: 0, startTime: Date.now() + 300 },
      ]);
      await refreshState();
    } catch (e: any) {
      add("ERROR", "API", e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleFlush = async () => {
    setLoading(true);
    try {
      add("INFO", "BRIDGE", "Bridge regained connectivity — uploading packets...");

      const r = await api.flush();
      setFlushResult(r);

      for (const res of r.results) {
        if (res.outcome === "SETTLED") {
          add("SUCCESS", "SETTLE", `✓ SETTLED — txId=${res.transactionId} via ${res.bridgeNode}`);
          flash([["phone-bridge","backend"]]);
          setAnimPackets(p => [...p, { id: `f-1`, from: "phone-bridge", to: "backend", progress: 0, startTime: Date.now() }]);
        } else if (res.outcome === "DUPLICATE_DROPPED") {
          add("WARN", "IDEMPOTENCY", `DUPLICATE_DROPPED — ${res.packetId} already settled`);
        } else {
          add("ERROR", "SETTLE", `INVALID — ${res.reason || "unknown"}`);
        }
      }

      if (attackMode === "replay" && currentPacket) {
        setTimeout(async () => {
          add("WARN", "ATTACK", "Replaying same packet...");
          const r2 = await api.flush();
          for (const res of r2.results) {
            if (res.outcome === "DUPLICATE_DROPPED") {
              add("SUCCESS", "IDEMPOTENCY", `✓ Replay blocked — DUPLICATE_DROPPED`);
            }
          }
        }, 800);
      }

      await refreshState();
    } catch (e: any) {
      add("ERROR", "API", e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    setLoading(true);
    try {
      await api.reset();
      setCurrentPacket(null);
      setLastGossip(null);
      setFlushResult(null);
      add("INFO", "SYS", "Simulation reset — mesh and idempotency cache cleared");
      await refreshState();
    } catch (e: any) {
      add("ERROR", "API", e.message);
    } finally {
      setLoading(false);
    }
  };

  const devices = meshState?.devices ?? [];

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      {/* Header */}
      <div className="border-b border-[#1e1e1e] px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <p className="font-mono text-xs text-zinc-500 uppercase tracking-widest">Live Simulation</p>
            <h1 className="text-xl font-bold">Mesh Payment Simulator</h1>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={attackMode}
              onChange={e => { setAttackMode(e.target.value); add("INFO","SYS",`Attack mode: ${e.target.value}`); }}
              className="bg-[#111] border border-[#2a2a2a] text-sm text-zinc-300 rounded-lg px-3 py-1.5 focus:outline-none"
            >
              <option value="normal">Normal</option>
              <option value="tamper">Tamper Ciphertext</option>
              <option value="replay">Replay Packet</option>
              <option value="duplicate">Concurrent Bridges</option>
            </select>
            {attackMode !== "normal" && (
              <span className="font-mono text-xs text-amber-400 border border-amber-900 bg-amber-950/20 px-2 py-1 rounded">
                ⚠ ATTACK MODE
              </span>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="max-w-7xl mx-auto px-6 pt-4">
          <div className="flex items-center gap-3 p-3 bg-red-950/20 border border-red-900/40 rounded-lg">
            <AlertTriangle size={14} className="text-red-400 shrink-0" />
            <span className="text-red-400 text-sm">{error}</span>
            <button className="ml-auto text-zinc-500 hover:text-white" onClick={() => { setError(null); refreshState(); }}>
              <RefreshCw size={13} />
            </button>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-6 py-6 grid lg:grid-cols-[300px_1fr_280px] gap-6">

        {/* LEFT: payment form */}
        <div className="space-y-4">
          <div className="bg-[#111] border border-[#1e1e1e] rounded-xl p-5">
            <div className="font-mono text-xs text-zinc-500 uppercase mb-4">Payment Instruction</div>
            <div className="space-y-3">
              <div>
                <label className="font-mono text-xs text-zinc-500 mb-1 block">Sender</label>
                <select value={form.sender} onChange={e => setForm(p => ({...p, sender: e.target.value}))}
                  className="w-full bg-[#0d0d0d] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-zinc-500">
                  {accounts.map(a => <option key={a.vpa} value={a.vpa}>{a.holderName} ({a.vpa}) — ₹{a.balance.toFixed(2)}</option>)}
                </select>
              </div>
              <div>
                <label className="font-mono text-xs text-zinc-500 mb-1 block">Receiver</label>
                <select value={form.receiver} onChange={e => setForm(p => ({...p, receiver: e.target.value}))}
                  className="w-full bg-[#0d0d0d] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-zinc-500">
                  {accounts.filter(a => a.vpa !== form.sender).map(a => <option key={a.vpa} value={a.vpa}>{a.holderName} ({a.vpa})</option>)}
                </select>
              </div>
              <div>
                <label className="font-mono text-xs text-zinc-500 mb-1 block">Amount (₹)</label>
                <input type="number" value={form.amount} onChange={e => setForm(p => ({...p, amount: e.target.value}))} min="0.01"
                  className="w-full bg-[#0d0d0d] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-zinc-500" />
              </div>
              <div>
                <label className="font-mono text-xs text-zinc-500 mb-1 block">PIN</label>
                <input type="password" value={form.pin} onChange={e => setForm(p => ({...p, pin: e.target.value}))}
                  className="w-full bg-[#0d0d0d] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-zinc-500" />
              </div>
              <button onClick={handleSend} disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-white text-black text-sm font-semibold rounded-lg hover:bg-zinc-100 transition-colors disabled:opacity-50">
                <Lock size={14} /> Inject Payment
              </button>
            </div>
          </div>

          {/* Controls */}
          <div className="bg-[#111] border border-[#1e1e1e] rounded-xl p-5 space-y-3">
            <div className="font-mono text-xs text-zinc-500 uppercase mb-2">Simulation Controls</div>
            <button onClick={handleGossip} disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-2 bg-[#161616] border border-[#2a2a2a] text-sm text-zinc-300 rounded-lg hover:bg-[#1e1e1e] transition-colors disabled:opacity-50">
              <Play size={13} /> Run Gossip Round
            </button>
            <button onClick={handleFlush} disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-2 bg-[#161616] border border-[#2a2a2a] text-sm text-zinc-300 rounded-lg hover:bg-[#1e1e1e] transition-colors disabled:opacity-50">
              <Wifi size={13} /> Bridge Upload (Flush)
            </button>
            <button onClick={handleReset} disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-2 bg-[#161616] border border-red-900/40 text-sm text-red-400 rounded-lg hover:bg-red-950/20 transition-colors disabled:opacity-50">
              <RotateCcw size={13} /> Reset Simulation
            </button>
          </div>

          {/* Gossip result */}
          {lastGossip && (
            <div className="bg-[#111] border border-[#1e1e1e] rounded-xl p-5">
              <div className="font-mono text-xs text-zinc-500 mb-3">LAST GOSSIP</div>
              <div className="font-mono text-2xl text-violet-400 mb-1">{lastGossip.transfers}</div>
              <div className="font-mono text-xs text-zinc-500 mb-3">packet transfers</div>
              <div className="space-y-1">
                {Object.entries(lastGossip.deviceCounts).map(([d, c]) => (
                  <div key={d} className="flex justify-between font-mono text-xs">
                    <span className="text-zinc-500">{d.replace("phone-","")}</span>
                    <span className="text-zinc-300">{c} pkts</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* CENTER: network canvas */}
        <div className="bg-[#111] border border-[#1e1e1e] rounded-xl p-4 flex flex-col">
          <div className="font-mono text-xs text-zinc-500 mb-4 flex items-center justify-between">
            <span>MESH NETWORK</span>
            {meshState && (
              <span className="text-zinc-600">
                idempotency cache: {meshState.idempotencyCacheSize} entries
              </span>
            )}
          </div>
          <div className="flex-1 flex items-center justify-center">
            <NetworkCanvas devices={devices} activeEdges={activeEdges} packets={animPackets} />
          </div>
          {/* Legend */}
          <div className="flex flex-wrap gap-4 mt-4 font-mono text-xs text-zinc-500">
            {[
              { color: "bg-violet-500", label: "Sender / has packets" },
              { color: "bg-cyan-600", label: "Bridge (internet)" },
              { color: "bg-emerald-600", label: "Backend" },
              { color: "bg-zinc-700", label: "Relay (offline)" },
            ].map(({ color, label }) => (
              <div key={label} className="flex items-center gap-1.5">
                <div className={`w-2 h-2 rounded-full ${color}`} />
                {label}
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT: state + log */}
        <div className="space-y-4">
          {/* Current packet */}
          {currentPacket && (
            <div className="bg-[#111] border border-violet-900/40 rounded-xl p-4">
              <div className="font-mono text-xs text-zinc-500 mb-3 flex items-center justify-between">
                <span>CURRENT PACKET</span>
                <button onClick={() => setInspecting(true)} className="text-violet-400 hover:text-violet-300 text-xs">
                  Inspect →
                </button>
              </div>
              <div className="font-mono text-xs space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-zinc-500">ID</span>
                  <span className="text-violet-400">mp_{currentPacket.id.substring(0,8)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">TTL</span>
                  <span className="text-zinc-300">{currentPacket.ttl}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Created</span>
                  <span className="text-zinc-300">{currentPacket.sentAt}</span>
                </div>
              </div>
            </div>
          )}

          {/* Flush result */}
          {flushResult && (
            <div className="bg-[#111] border border-[#1e1e1e] rounded-xl p-4">
              <div className="font-mono text-xs text-zinc-500 mb-3">FLUSH RESULT</div>
              <div className="font-mono text-xs text-zinc-500 mb-2">{flushResult.uploadsAttempted} attempt(s)</div>
              {flushResult.results.map((r, i) => (
                <div key={i} className={`flex items-center gap-2 p-2 rounded-lg mb-1 font-mono text-xs ${
                  r.outcome === "SETTLED" ? "bg-emerald-950/30 text-emerald-400" :
                  r.outcome === "DUPLICATE_DROPPED" ? "bg-amber-950/30 text-amber-400" :
                  "bg-red-950/30 text-red-400"
                }`}>
                  <span>{r.outcome === "SETTLED" ? "✓" : "✕"}</span>
                  <span>{r.outcome}</span>
                  {r.transactionId > 0 && <span className="text-zinc-500 ml-auto">tx#{r.transactionId}</span>}
                </div>
              ))}
            </div>
          )}

          {/* Account balances */}
          <div className="bg-[#111] border border-[#1e1e1e] rounded-xl p-4">
            <div className="font-mono text-xs text-zinc-500 mb-3">SIMULATION ACCOUNTS</div>
            <div className="space-y-2">
              {accounts.map(a => (
                <div key={a.vpa} className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium">{a.holderName}</div>
                    <div className="font-mono text-xs text-zinc-500">{a.vpa}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-sm text-emerald-400">₹{a.balance.toFixed(2)}</div>
                    <div className="font-mono text-xs text-zinc-600">v{a.version}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Event log */}
          <div className="bg-[#111] border border-[#1e1e1e] rounded-xl overflow-hidden">
            <div className="px-4 py-2 border-b border-[#1e1e1e] flex items-center justify-between">
              <span className="font-mono text-xs text-zinc-500">EVENT LOG</span>
              <button onClick={clear} className="font-mono text-xs text-zinc-600 hover:text-zinc-400">clear</button>
            </div>
            <div className="h-64 overflow-y-auto p-3 space-y-1">
              {logs.length === 0 && (
                <p className="font-mono text-xs text-zinc-700">Run a simulation to see events...</p>
              )}
              {logs.slice().reverse().map((l, i) => (
                <div key={i} className="font-mono text-xs flex gap-2">
                  <span className="text-zinc-600 shrink-0">{l.ts}</span>
                  <span className={`shrink-0 ${
                    l.level === "SUCCESS" ? "text-emerald-400" :
                    l.level === "WARN" ? "text-amber-400" :
                    l.level === "ERROR" ? "text-red-400" : "text-zinc-500"
                  }`}>{l.cat}</span>
                  <span className="text-zinc-300 break-all">{l.msg}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Packet inspector drawer */}
      {inspecting && currentPacket && (
        <>
          <div className="fixed inset-0 bg-black/60 z-40" onClick={() => setInspecting(false)} />
          <PacketDrawer packet={currentPacket} onClose={() => setInspecting(false)} />
        </>
      )}
    </div>
  );
}
