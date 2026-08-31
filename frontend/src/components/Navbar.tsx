"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { api } from "@/lib/api";
import { ExternalLink, Activity, Radio } from "lucide-react";

const NAV = [
  { label: "Overview",     href: "/" },
  { label: "Simulator",    href: "/simulator" },
  { label: "Security",     href: "/security" },
  { label: "Architecture", href: "/architecture" },
  { label: "Ledger",       href: "/ledger" },
  { label: "Engineering",  href: "/notes" },
];

export function Navbar() {
  const path = usePathname();
  const [online, setOnline] = useState<boolean | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const check = async () => {
      try {
        await api.health();
        setOnline(true);
      } catch {
        setOnline(false);
      }
    };
    check();
    const id = setInterval(check, 30_000);
    return () => clearInterval(id);
  }, []);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 h-14 border-b border-[#1e1e1e] bg-[#0a0a0a]/95 backdrop-blur-sm">
      <div className="max-w-7xl mx-auto h-full px-4 flex items-center justify-between gap-4">

        {/* Logo */}
        <Link href="/" className="flex items-center gap-3 shrink-0">
          <div className="flex items-center gap-2">
            <Radio size={16} className="text-violet-400" />
            <span className="font-semibold text-sm tracking-tight">MeshPay</span>
          </div>
          <span className="hidden sm:inline font-mono text-[10px] text-zinc-500 border border-zinc-800 px-1.5 py-0.5 rounded">
            OFFLINE MESH LAB
          </span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-1">
          {NAV.map(({ label, href }) => (
            <Link
              key={href}
              href={href}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                path === href
                  ? "text-white bg-[#1e1e1e]"
                  : "text-zinc-500 hover:text-zinc-200 hover:bg-[#161616]"
              }`}
            >
              {label}
            </Link>
          ))}
        </div>

        {/* Right side */}
        <div className="flex items-center gap-3 shrink-0">
          {/* Backend status */}
          <div className="hidden sm:flex items-center gap-1.5 font-mono text-xs">
            {online === null ? (
              <span className="text-zinc-600">checking...</span>
            ) : online ? (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.7)] animate-pulse" />
                <span className="text-emerald-400">BACKEND CONNECTED</span>
              </>
            ) : (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-zinc-600" />
                <span className="text-zinc-500">BACKEND OFFLINE</span>
              </>
            )}
          </div>

          <a
            href="https://github.com/shaswatnaman/upi-offline-mesh"
            target="_blank"
            rel="noopener noreferrer"
            className="p-1.5 text-zinc-500 hover:text-white transition-colors"
            aria-label="GitHub"
          >
            <ExternalLink size={16} />
          </a>

          {/* Mobile hamburger */}
          <button
            className="md:hidden p-1.5 text-zinc-500 hover:text-white"
            onClick={() => setOpen(o => !o)}
            aria-label="Menu"
          >
            <Activity size={16} />
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="md:hidden border-t border-[#1e1e1e] bg-[#0a0a0a] px-4 py-3 flex flex-col gap-1">
          {NAV.map(({ label, href }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              className={`px-3 py-2 text-sm rounded-md ${
                path === href ? "text-white bg-[#1e1e1e]" : "text-zinc-400"
              }`}
            >
              {label}
            </Link>
          ))}
        </div>
      )}
    </nav>
  );
}
