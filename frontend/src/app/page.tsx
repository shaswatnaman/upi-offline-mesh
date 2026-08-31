"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Lock, Shield, Cpu, Database, Zap, GitBranch, ChevronRight } from "lucide-react";

// ── Animated hero network ──────────────────────────────────────────────────

const NODES = [
  { id: "you",      label: "YOU",      sub: "SENDER",   x: 160, y: 40,  color: "#7c3aed" },
  { id: "phoneA",   label: "PHONE A",  sub: "RELAY",    x: 60,  y: 150, color: "#52525b" },
  { id: "phoneB",   label: "PHONE B",  sub: "RELAY",    x: 160, y: 150, color: "#52525b" },
  { id: "phoneC",   label: "PHONE C",  sub: "RELAY",    x: 260, y: 150, color: "#52525b" },
  { id: "bridge",   label: "BRIDGE",   sub: "📡",       x: 160, y: 260, color: "#0891b2" },
  { id: "backend",  label: "BACKEND",  sub: "☁️",       x: 160, y: 360, color: "#059669" },
];

const EDGES = [
  ["you","phoneA"], ["you","phoneB"], ["you","phoneC"],
  ["phoneA","bridge"], ["phoneB","bridge"], ["phoneC","bridge"],
  ["bridge","backend"],
];

function HeroCanvas() {
  const [step, setStep] = useState(0);
  const [settled, setSettled] = useState(false);
  const animRef = useRef<ReturnType<typeof setTimeout>>(null);

  useEffect(() => {
    const steps = [0,1,2,3,4,5,6,7];
    let i = 0;
    const tick = () => {
      setStep(steps[i % steps.length]);
      if (steps[i % steps.length] === 7) setSettled(true);
      else if (steps[i % steps.length] === 0) setSettled(false);
      i++;
      animRef.current = setTimeout(tick, i % steps.length === 0 ? 2000 : 700);
    };
    animRef.current = setTimeout(tick, 800);
    return () => { if (animRef.current) clearTimeout(animRef.current); };
  }, []);

  const activeEdge = (from: string, to: string) => {
    const map: Record<number, [string,string][]> = {
      1: [["you","phoneA"],["you","phoneB"],["you","phoneC"]],
      2: [["phoneA","bridge"]],
      3: [["phoneB","bridge"]],
      4: [["phoneC","bridge"]],
      5: [["bridge","backend"]],
    };
    return (map[step] ?? []).some(([f,t]) => f === from && t === to);
  };

  return (
    <div className="relative w-full max-w-xs mx-auto select-none">
      <svg viewBox="0 0 320 420" className="w-full">
        {/* edges */}
        {EDGES.map(([from, to]) => {
          const f = NODES.find(n => n.id === from)!;
          const t = NODES.find(n => n.id === to)!;
          const active = activeEdge(from, to);
          return (
            <g key={`${from}-${to}`}>
              <line x1={f.x} y1={f.y + 16} x2={t.x} y2={t.y - 16}
                stroke={active ? "#7c3aed" : "#1e1e1e"} strokeWidth={active ? 1.5 : 1}
                strokeDasharray={active ? "4 2" : "none"}
                style={active ? { animation: "flow-dash 0.3s linear infinite" } : {}}
              />
              {active && (
                <circle r={4} fill="#7c3aed" opacity={0.9}>
                  <animateMotion dur="0.7s" repeatCount="1"
                    path={`M${f.x},${f.y+16} L${t.x},${t.y-16}`} />
                </circle>
              )}
            </g>
          );
        })}

        {/* nodes */}
        {NODES.map(n => {
          const isActive = step > 0 && (
            (n.id === "you" && step >= 1) ||
            (["phoneA","phoneB","phoneC"].includes(n.id) && step >= 2) ||
            (n.id === "bridge" && step >= 5) ||
            (n.id === "backend" && step >= 6)
          );
          return (
            <g key={n.id} transform={`translate(${n.x},${n.y})`}>
              {isActive && (
                <circle r={18} fill="none" stroke={n.color} strokeWidth={1} opacity={0.4}
                  style={{ animation: "node-ping 1s ease-out infinite" }} />
              )}
              <circle r={14} fill="#111111" stroke={isActive ? n.color : "#2a2a2a"} strokeWidth={1.5} />
              <text y={-22} textAnchor="middle" fontSize={8} fill={isActive ? "#fff" : "#52525b"}
                fontFamily="JetBrains Mono,monospace" fontWeight={600}>
                {n.label}
              </text>
              <text y={-13} textAnchor="middle" fontSize={6} fill={isActive ? n.color : "#3f3f46"}
                fontFamily="JetBrains Mono,monospace">
                {n.sub}
              </text>
            </g>
          );
        })}

        {/* Settled indicator */}
        {settled && (
          <g transform="translate(160,395)">
            <text textAnchor="middle" fontSize={9} fill="#10b981"
              fontFamily="JetBrains Mono,monospace" fontWeight={600}>
              ✓ DECRYPTED  ✓ VALIDATED  ✓ SETTLED
            </text>
          </g>
        )}
      </svg>

      {/* Encryption badge */}
      <div className="absolute top-8 right-0 animate-float">
        <div className="bg-[#111] border border-[#2a2a2a] rounded-lg px-2 py-1.5 font-mono text-xs">
          <div className="text-violet-400 font-semibold">🔐 PACKET</div>
          <div className="text-zinc-500">0x{Math.floor(Math.random()*0xffff).toString(16).padStart(4,"0")}…</div>
        </div>
      </div>
    </div>
  );
}

// ── Tech badges ─────────────────────────────────────────────────────────────

const BADGES = [
  "Java 17", "Spring Boot", "RSA-OAEP", "AES-256-GCM",
  "SHA-256", "Idempotency", "Optimistic Locking", "ConcurrentHashMap",
];

// ── Features ────────────────────────────────────────────────────────────────

const FEATURES = [
  { icon: Lock,      title: "Hybrid Encryption",   desc: "RSA-OAEP wraps a per-packet AES-256-GCM session key. Relays cannot read the payment instruction." },
  { icon: Shield,    title: "Tamper Detection",    desc: "AES-GCM authentication tags reject any single-bit modification before it reaches the settlement layer." },
  { icon: Cpu,       title: "Atomic Idempotency",  desc: "ConcurrentHashMap.putIfAbsent provides exactly-once settlement even when three bridges deliver simultaneously." },
  { icon: GitBranch, title: "Gossip Propagation",  desc: "TTL-bounded gossip ensures packets spread through the mesh without flooding or infinite loops." },
  { icon: Database,  title: "Transactional Ledger",desc: "@Transactional guarantees debit+credit+record are atomic — all succeed or none do." },
  { icon: Zap,       title: "Replay Protection",   desc: "SHA-256(ciphertext) is claimed atomically on first delivery; all subsequent attempts are silently dropped." },
];

// ── Problem section ─────────────────────────────────────────────────────────

function ProblemSection() {
  return (
    <section className="py-24 border-t border-[#1e1e1e]">
      <div className="max-w-7xl mx-auto px-6">
        <p className="font-mono text-xs text-zinc-500 uppercase tracking-widest mb-6">The Problem</p>
        <h2 className="text-3xl font-bold mb-4">What happens when every phone is offline?</h2>
        <p className="text-zinc-400 text-lg max-w-2xl mb-16">
          Basement. Rural area. Disaster zone. Network dead spot. Traditional payment systems halt completely. MeshPay explores what a deferred, mesh-routed settlement protocol could look like.
        </p>

        <div className="grid md:grid-cols-2 gap-8">
          {/* Traditional */}
          <div className="bg-[#111] border border-[#1e1e1e] rounded-xl p-6">
            <div className="font-mono text-xs text-zinc-500 mb-4">TRADITIONAL FLOW</div>
            <div className="flex flex-col gap-3 font-mono text-sm">
              {["Phone", "Internet", "Bank"].map((s, i) => (
                <div key={s}>
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${i === 1 ? "bg-red-400" : "bg-zinc-500"}`} />
                    <span className={i === 1 ? "text-red-400" : "text-zinc-300"}>{s}</span>
                    {i === 1 && <span className="text-red-500 text-xs">UNAVAILABLE</span>}
                  </div>
                  {i < 2 && <div className="ml-[3px] w-px h-4 bg-[#2a2a2a]" />}
                </div>
              ))}
            </div>
            <div className="mt-4 p-3 bg-red-950/20 border border-red-900/40 rounded-lg">
              <span className="text-red-400 font-mono text-xs">✕ Payment fails. No connectivity = no transaction.</span>
            </div>
          </div>

          {/* MeshPay */}
          <div className="bg-[#111] border border-[#1e1e1e] rounded-xl p-6">
            <div className="font-mono text-xs text-zinc-500 mb-4">MESHPAY SIMULATION</div>
            <div className="flex flex-col gap-3 font-mono text-sm">
              {["Phone (Sender)", "Device Mesh", "Bridge Device", "Backend (Settled)"].map((s, i) => (
                <div key={s}>
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${
                      i === 3 ? "bg-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.6)]" :
                      i === 2 ? "bg-cyan-400" : "bg-violet-400"
                    }`} />
                    <span className="text-zinc-200">{s}</span>
                    {i === 2 && <span className="text-cyan-400 text-xs">internet restored</span>}
                  </div>
                  {i < 3 && <div className="ml-[3px] w-px h-4 bg-[#2a2a2a]" />}
                </div>
              ))}
            </div>
            <div className="mt-4 p-3 bg-emerald-950/20 border border-emerald-900/40 rounded-lg">
              <span className="text-emerald-400 font-mono text-xs">✓ Deferred settlement when connectivity returns.</span>
            </div>
          </div>
        </div>

        <div className="mt-8 p-4 bg-amber-950/20 border border-amber-900/40 rounded-xl">
          <p className="text-amber-400 font-mono text-xs text-center">
            ⚠ RESEARCH / ACADEMIC SIMULATION — Mesh-routed deferred settlement, not real-time offline UPI.
            Not affiliated with NPCI or the official UPI platform.
          </p>
        </div>
      </div>
    </section>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────

export default function Home() {
  return (
    <div>
      {/* Hero */}
      <section className="min-h-[92vh] flex flex-col justify-center relative overflow-hidden bg-grid">
        <div className="absolute inset-0 bg-gradient-to-b from-violet-950/10 via-transparent to-transparent pointer-events-none" />

        <div className="max-w-7xl mx-auto px-6 py-20 grid lg:grid-cols-2 gap-16 items-center relative">
          {/* Left */}
          <div className="animate-fade-in-up">
            <div className="inline-flex items-center gap-2 bg-[#111] border border-[#2a2a2a] rounded-full px-3 py-1 mb-8">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="font-mono text-xs text-zinc-400">RESEARCH / ACADEMIC SIMULATION</span>
            </div>

            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.1] mb-6">
              Payments that survive the{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-cyan-400">
                absence of a network.
              </span>
            </h1>

            <p className="text-zinc-400 text-lg leading-relaxed mb-10 max-w-lg">
              A distributed-systems simulation of offline UPI-style payments routed through an untrusted
              device mesh and settled when connectivity returns.
            </p>

            {/* Badges */}
            <div className="flex flex-wrap gap-2 mb-10">
              {BADGES.map(b => (
                <span key={b} className="font-mono text-xs border border-[#2a2a2a] text-zinc-400 px-2 py-0.5 rounded">
                  {b}
                </span>
              ))}
            </div>

            {/* CTAs */}
            <div className="flex flex-wrap gap-3">
              <Link href="/simulator"
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-white text-black text-sm font-semibold rounded-lg hover:bg-zinc-100 transition-colors">
                Launch Simulation <ArrowRight size={14} />
              </Link>
              <Link href="/architecture"
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#111] border border-[#2a2a2a] text-sm text-zinc-300 rounded-lg hover:bg-[#161616] hover:text-white transition-colors">
                Explore Architecture <ChevronRight size={14} />
              </Link>
              <a href="https://github.com/shaswatnaman/upi-offline-mesh" target="_blank"
                className="inline-flex items-center gap-2 px-5 py-2.5 text-sm text-zinc-500 hover:text-zinc-300 transition-colors">
                View Source ↗
              </a>
            </div>
          </div>

          {/* Right — live animation */}
          <div className="flex justify-center">
            <div className="relative w-full max-w-sm">
              <HeroCanvas />
              <p className="text-center font-mono text-xs text-zinc-600 mt-4">
                No direct internet connection required during propagation.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-24 border-t border-[#1e1e1e]">
        <div className="max-w-7xl mx-auto px-6">
          <p className="font-mono text-xs text-zinc-500 uppercase tracking-widest mb-4">What was solved</p>
          <h2 className="text-2xl font-bold mb-12">Six hard problems. All implemented.</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {FEATURES.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="bg-[#111] border border-[#1e1e1e] rounded-xl p-5 hover:border-[#2a2a2a] transition-colors group">
                <Icon size={18} className="text-violet-400 mb-4" />
                <h3 className="text-sm font-semibold mb-2">{title}</h3>
                <p className="text-zinc-500 text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <ProblemSection />

      {/* Call to action */}
      <section className="py-24 border-t border-[#1e1e1e]">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <p className="font-mono text-xs text-zinc-500 uppercase tracking-widest mb-6">One question</p>
          <h2 className="text-3xl font-bold mb-6">
            Can a payment survive a disconnected network without trusting every device that carries it?
          </h2>
          <div className="flex flex-col items-center gap-2 font-mono text-sm text-zinc-500 mb-12">
            {[
              "Explore the simulation",
              "Inspect the architecture",
              "Break the packet",
              "Replay the transaction",
              "Watch idempotency prevent double settlement",
            ].map((s, i) => (
              <div key={s} className="flex flex-col items-center gap-1">
                <span className="text-zinc-300">{s}</span>
                {i < 4 && <ChevronRight size={12} className="rotate-90 text-zinc-700" />}
              </div>
            ))}
          </div>
          <div className="flex flex-wrap justify-center gap-3">
            <Link href="/simulator"
              className="inline-flex items-center gap-2 px-6 py-3 bg-white text-black font-semibold rounded-lg hover:bg-zinc-100 transition-colors">
              Launch Mesh Simulator <ArrowRight size={15} />
            </Link>
            <a href="https://github.com/shaswatnaman/upi-offline-mesh" target="_blank"
              className="inline-flex items-center gap-2 px-6 py-3 bg-[#111] border border-[#2a2a2a] text-zinc-300 rounded-lg hover:bg-[#161616] transition-colors">
              View GitHub ↗
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[#1e1e1e] py-12">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div>
            <div className="font-semibold mb-1">MeshPay</div>
            <div className="text-zinc-500 text-sm">Offline Mesh Payment Research Simulation</div>
            <div className="font-mono text-xs text-zinc-600 mt-1">
              Java 17 · Spring Boot · Cryptography · Distributed Systems
            </div>
            <div className="font-mono text-xs text-zinc-700 mt-2">
              Academic / Experimental — Not affiliated with NPCI or the official UPI platform.
            </div>
          </div>
          <div className="flex flex-col gap-1 text-sm">
            {[
              ["GitHub", "https://github.com/shaswatnaman/upi-offline-mesh"],
              ["Architecture", "/architecture"],
              ["Security Lab", "/security"],
              ["Engineering Notes", "/notes"],
            ].map(([label, href]) => (
              <Link key={label} href={href}
                className="text-zinc-500 hover:text-zinc-300 transition-colors">
                {label}
              </Link>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}
