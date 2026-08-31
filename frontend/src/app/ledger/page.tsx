"use client";
import { useEffect, useState } from "react";
import { api, Account, Transaction } from "@/lib/api";
import { RefreshCw, CheckCircle, XCircle } from "lucide-react";

function fmt(n: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(n);
}

function timeAgo(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return new Date(iso).toLocaleTimeString();
}

export default function LedgerPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [txns, setTxns] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [a, t] = await Promise.all([api.accounts(), api.transactions()]);
      setAccounts(a);
      setTxns(t);
      setLastRefresh(new Date());
    } catch (e: any) {
      setError(e.message || "Failed to load ledger");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const id = setInterval(load, 10_000);
    return () => clearInterval(id);
  }, []);

  const settled = txns.filter(t => t.status === "SETTLED");
  const totalVolume = settled.reduce((s, t) => s + t.amount, 0);
  const avgHops = settled.length ? settled.reduce((s, t) => s + t.hopCount, 0) / settled.length : 0;

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <div className="border-b border-[#1e1e1e] px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div>
            <p className="font-mono text-xs text-zinc-500 uppercase tracking-widest mb-1">Ledger</p>
            <h1 className="text-2xl font-bold">Settlement Ledger</h1>
            <p className="text-zinc-400 text-sm mt-1">Live view of accounts and settled transactions.</p>
          </div>
          <div className="flex items-center gap-3">
            {lastRefresh && (
              <div className="font-mono text-xs text-zinc-600">
                Updated {timeAgo(lastRefresh.toISOString())}
              </div>
            )}
            <button onClick={load} disabled={loading}
              className="flex items-center gap-2 px-3 py-1.5 bg-[#161616] border border-[#2a2a2a] text-sm text-zinc-300 rounded-lg hover:bg-[#1e1e1e] transition-colors disabled:opacity-50">
              <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
              Refresh
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-8">
        {error && (
          <div className="flex items-center gap-3 p-4 bg-red-950/20 border border-red-900/40 rounded-xl">
            <XCircle size={16} className="text-red-400" />
            <div className="font-mono text-sm text-red-400">{error}</div>
            <div className="font-mono text-xs text-zinc-500 ml-auto">Backend may be offline</div>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Accounts", value: accounts.length.toString(), sub: "demo wallets" },
            { label: "Settled", value: settled.length.toString(), sub: "transactions" },
            { label: "Volume", value: fmt(totalVolume), sub: "total settled" },
            { label: "Avg Hops", value: avgHops.toFixed(1), sub: "per packet" },
          ].map(s => (
            <div key={s.label} className="bg-[#111] border border-[#1e1e1e] rounded-xl p-4">
              <div className="font-mono text-xs text-zinc-500 mb-1">{s.label}</div>
              <div className="text-xl font-semibold">{loading ? "—" : s.value}</div>
              <div className="font-mono text-xs text-zinc-600 mt-0.5">{s.sub}</div>
            </div>
          ))}
        </div>

        {/* Accounts */}
        <div className="bg-[#111] border border-[#1e1e1e] rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-[#1e1e1e] flex items-center justify-between">
            <h2 className="font-semibold text-sm">Accounts</h2>
            <div className="font-mono text-xs text-zinc-500">@version = optimistic lock version</div>
          </div>
          {loading && accounts.length === 0 ? (
            <div className="px-5 py-8 text-center font-mono text-sm text-zinc-600">Loading...</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#1a1a1a]">
                  {["VPA", "Holder", "Balance", "@Version"].map(h => (
                    <th key={h} className="text-left font-mono text-xs text-zinc-500 px-5 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#141414]">
                {accounts.map(a => (
                  <tr key={a.vpa} className="hover:bg-[#141414] transition-colors">
                    <td className="font-mono text-xs text-cyan-400 px-5 py-3">{a.vpa}</td>
                    <td className="text-zinc-300 px-5 py-3">{a.holderName}</td>
                    <td className="font-mono text-sm font-semibold text-emerald-400 px-5 py-3">{fmt(a.balance)}</td>
                    <td className="font-mono text-xs text-zinc-600 px-5 py-3">{a.version}</td>
                  </tr>
                ))}
                {accounts.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-5 py-6 text-center font-mono text-xs text-zinc-600">
                      No accounts found. Backend may be offline or not seeded.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        {/* Transactions */}
        <div className="bg-[#111] border border-[#1e1e1e] rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-[#1e1e1e]">
            <h2 className="font-semibold text-sm">Transaction Log</h2>
            <p className="font-mono text-xs text-zinc-500 mt-0.5">All settlements recorded by the backend. packetHash is the idempotency key.</p>
          </div>
          {loading && txns.length === 0 ? (
            <div className="px-5 py-8 text-center font-mono text-sm text-zinc-600">Loading...</div>
          ) : txns.length === 0 ? (
            <div className="px-5 py-8 text-center">
              <div className="font-mono text-sm text-zinc-600 mb-2">No transactions yet</div>
              <div className="font-mono text-xs text-zinc-700">Use the Simulator to send a payment, then come back here.</div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#1a1a1a]">
                    {["ID", "Sender → Receiver", "Amount", "Hops", "Bridge", "Status", "Settled"].map(h => (
                      <th key={h} className="text-left font-mono text-xs text-zinc-500 px-4 py-3 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#141414]">
                  {[...txns].reverse().map(t => (
                    <tr key={t.id} className="hover:bg-[#141414] transition-colors">
                      <td className="font-mono text-xs text-zinc-600 px-4 py-3">{t.id}</td>
                      <td className="font-mono text-xs px-4 py-3 whitespace-nowrap">
                        <span className="text-cyan-400">{t.senderVpa}</span>
                        <span className="text-zinc-600"> → </span>
                        <span className="text-violet-400">{t.receiverVpa}</span>
                      </td>
                      <td className="font-mono text-sm font-semibold text-emerald-400 px-4 py-3 whitespace-nowrap">{fmt(t.amount)}</td>
                      <td className="font-mono text-xs text-zinc-400 px-4 py-3">{t.hopCount}</td>
                      <td className="font-mono text-xs text-zinc-500 px-4 py-3 max-w-[120px] truncate">{t.bridgeNodeId}</td>
                      <td className="px-4 py-3">
                        {t.status === "SETTLED" ? (
                          <span className="flex items-center gap-1.5 font-mono text-xs text-emerald-400">
                            <CheckCircle size={12} /> SETTLED
                          </span>
                        ) : (
                          <span className="flex items-center gap-1.5 font-mono text-xs text-red-400">
                            <XCircle size={12} /> REJECTED
                          </span>
                        )}
                      </td>
                      <td className="font-mono text-xs text-zinc-600 px-4 py-3 whitespace-nowrap">
                        {t.settledAt ? timeAgo(t.settledAt) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Hash inspector */}
        {txns.length > 0 && (
          <div className="bg-[#111] border border-[#1e1e1e] rounded-xl p-5">
            <h3 className="font-semibold text-sm mb-3">Idempotency Key Inspector</h3>
            <div className="space-y-2">
              {[...txns].reverse().slice(0, 5).map(t => (
                <div key={t.id} className="flex items-start gap-3 font-mono text-xs">
                  <span className="text-zinc-600 shrink-0">#{t.id}</span>
                  <span className="text-zinc-400 shrink-0">{t.senderVpa} → {t.receiverVpa}</span>
                  <span className="text-emerald-400 break-all">{t.packetHash}</span>
                </div>
              ))}
            </div>
            <p className="text-zinc-600 text-xs mt-3 font-mono">
              SHA-256(ciphertext) — deterministic, derived from the encrypted payload, collision-resistant.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
