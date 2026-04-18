"use client";

import { usePathname } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import Link from "next/link";

const PAGE_TITLES = {
  "/dashboard": "Dashboard",
  "/pipeline": "Vehicle Pipeline",
  "/opportunities": "Sourcing Opportunities",
  "/listings": "Listings",
  "/finance": "Finance & Compliance",
  "/leads": "Leads & Inquiries",
  "/notifications": "Notifications & Alerts",
  "/settings": "Settings",
  "/agents": "AI Agents",
  "/agents/de-market": "DE Market Research Agent",
  "/agents/valuation": "Valuation Agent",
  "/agents/jp-sourcing": "JP Sourcing Agent",
  "/agents/listing": "Listing & Presentation Agent",
  "/agents/logistics": "Logistics Agent",
  "/agents/finance": "Finance & Compliance Agent",
  "/agents/concierge": "Concierge Agent",
  "/agents/orchestrator": "Orchestrator — Command Center",
};

export default function Topbar() {
  const pathname = usePathname();
  const title = PAGE_TITLES[pathname] || (pathname.startsWith("/agents/de-market/") ? "Model Detail" : "Dashboard");
  const [notifCount, setNotifCount] = useState(0);
  const [criticalCount, setCriticalCount] = useState(0);
  const [profileOpen, setProfileOpen] = useState(false);
  const [fxRate, setFxRate] = useState(null);
  const [calcOpen, setCalcOpen] = useState(false);
  const [jpy, setJpy] = useState("1000000");
  const [eur, setEur] = useState("");
  const [swapped, setSwapped] = useState(false);
  const menuRef = useRef(null);
  const calcRef = useRef(null);

  const onJpyChange = (v) => {
    setJpy(v);
    if (!fxRate) return;
    const n = parseFloat(String(v).replace(/[,\s]/g, ""));
    setEur(Number.isFinite(n) ? (n / fxRate).toFixed(2) : "");
  };
  const onEurChange = (v) => {
    setEur(v);
    if (!fxRate) return;
    const n = parseFloat(String(v).replace(/[,\s]/g, ""));
    setJpy(Number.isFinite(n) ? String(Math.round(n * fxRate)) : "");
  };

  useEffect(() => {
    fetch("/api/notifications")
      .then((r) => r.json())
      .then((d) => {
        setNotifCount(d.count || 0);
        setCriticalCount(d.byCritical || 0);
      })
      .catch(() => {});
  }, [pathname]);

  // Live EUR/JPY from finance agent's cached status. Refreshes every 60s; also
  // re-fetches on navigation so it stays current when the user returns to the tab.
  useEffect(() => {
    let cancelled = false;
    const load = () => {
      fetch("/api/agents/finance/status")
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (cancelled || !d) return;
          const rate = Number(d.fxRate);
          if (Number.isFinite(rate)) setFxRate(rate);
        })
        .catch(() => {});
    };
    load();
    const id = setInterval(load, 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [pathname]);

  // Close menu on outside click
  useEffect(() => {
    const handleClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setProfileOpen(false);
      }
    };
    if (profileOpen) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [profileOpen]);

  // Close calculator on outside click
  useEffect(() => {
    const handleClick = (e) => {
      if (calcRef.current && !calcRef.current.contains(e.target)) setCalcOpen(false);
    };
    const handleKey = (e) => { if (e.key === "Escape") setCalcOpen(false); };
    if (calcOpen) {
      document.addEventListener("mousedown", handleClick);
      document.addEventListener("keydown", handleKey);
    }
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [calcOpen]);

  // Seed EUR from JPY once the live rate arrives
  useEffect(() => {
    if (!fxRate || eur) return;
    const n = parseFloat(String(jpy).replace(/[,\s]/g, ""));
    if (Number.isFinite(n)) setEur((n / fxRate).toFixed(2));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fxRate]);

  // Close menu on navigation
  useEffect(() => { setProfileOpen(false); setCalcOpen(false); }, [pathname]);

  return (
    <header className="h-14 md:h-16 shrink-0 flex items-center justify-between px-4 pl-14 lg:pl-4 sm:px-6 border-b border-outline-variant/10 bg-surface/80 backdrop-blur-xl">
      <div className="min-w-0">
        <h1 className="font-headline text-base sm:text-lg font-bold text-on-surface truncate">{title}</h1>
        <p className="text-[10px] sm:text-xs text-on-surface-variant hidden sm:block">
          {new Date().toLocaleDateString("en-GB", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
        </p>
      </div>

      <div className="flex items-center gap-2 sm:gap-4 shrink-0">
        {/* Live FX indicator */}
        <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-container-high/50 border border-outline-variant/10" title={fxRate ? "Live EUR/JPY" : "EUR/JPY unavailable"}>
          <span className="material-symbols-outlined text-secondary text-sm">currency_exchange</span>
          <span className="text-xs font-mono text-on-surface">EUR/JPY</span>
          <span className={`text-xs font-mono font-bold ${fxRate ? "text-secondary" : "text-on-surface-variant"}`}>
            {fxRate ? fxRate.toFixed(2) : "—"}
          </span>
        </div>

        {/* Currency Calculator */}
        <div className="relative" ref={calcRef}>
          <button
            type="button"
            onClick={() => setCalcOpen((v) => !v)}
            aria-label="Currency calculator"
            className="cursor-pointer text-on-surface-variant hover:text-on-surface transition-colors p-1.5 sm:p-2 rounded-xl hover:bg-surface-container-high/50"
          >
            <span className="material-symbols-outlined text-lg sm:text-xl">calculate</span>
          </button>
          {calcOpen && (
            <div className="absolute right-0 top-full mt-2 w-80 rounded-2xl bg-surface-container border border-outline-variant/15 shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
              <div className="flex items-center justify-between px-4 py-3 border-b border-outline-variant/10">
                <p className="text-sm font-bold text-on-surface flex items-center gap-2">
                  <span className="material-symbols-outlined text-secondary text-base">currency_exchange</span>
                  Currency Converter
                </p>
                <button
                  type="button"
                  onClick={() => setCalcOpen(false)}
                  className="cursor-pointer text-on-surface-variant hover:text-on-surface transition-colors"
                  aria-label="Close"
                >
                  <span className="material-symbols-outlined text-base">close</span>
                </button>
              </div>
              <div className="p-4 flex flex-col gap-3">
                <label className="block" style={{ order: swapped ? 3 : 1 }}>
                  <span className="text-[10px] uppercase tracking-widest text-on-surface-variant">Japanese Yen</span>
                  <div className="flex items-center mt-1 rounded-xl bg-surface-container-high border border-outline-variant/15 focus-within:border-secondary/50 transition-colors">
                    <span className="pl-3 text-on-surface-variant font-mono">¥</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={jpy}
                      onChange={(e) => onJpyChange(e.target.value)}
                      disabled={!fxRate}
                      placeholder="0"
                      className="flex-1 bg-transparent px-2 py-2.5 text-on-surface outline-none font-mono disabled:opacity-40"
                    />
                  </div>
                </label>
                <div className="flex justify-center" style={{ order: 2 }}>
                  <button
                    type="button"
                    onClick={() => setSwapped((s) => !s)}
                    aria-label="Swap currency positions"
                    title="Swap"
                    className="cursor-pointer text-on-surface-variant hover:text-secondary transition-all p-1.5 rounded-full hover:bg-surface-container-high/70 active:scale-95"
                  >
                    <span className={`material-symbols-outlined text-base transition-transform ${swapped ? "rotate-180" : ""}`}>swap_vert</span>
                  </button>
                </div>
                <label className="block" style={{ order: swapped ? 1 : 3 }}>
                  <span className="text-[10px] uppercase tracking-widest text-on-surface-variant">Euro</span>
                  <div className="flex items-center mt-1 rounded-xl bg-surface-container-high border border-outline-variant/15 focus-within:border-secondary/50 transition-colors">
                    <span className="pl-3 text-on-surface-variant font-mono">€</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={eur}
                      onChange={(e) => onEurChange(e.target.value)}
                      disabled={!fxRate}
                      placeholder="0.00"
                      className="flex-1 bg-transparent px-2 py-2.5 text-on-surface outline-none font-mono disabled:opacity-40"
                    />
                  </div>
                </label>
              </div>
              <div className="px-4 py-2.5 border-t border-outline-variant/10 flex items-center justify-between text-[11px]">
                <span className="text-on-surface-variant">
                  {fxRate ? (
                    <>Live: <span className="font-mono font-bold text-secondary">{fxRate.toFixed(2)}</span> JPY/€</>
                  ) : (
                    <span className="text-red-400">Rate unavailable</span>
                  )}
                </span>
                <span className="text-on-surface-variant/60">frankfurter.app</span>
              </div>
            </div>
          )}
        </div>

        {/* Notifications */}
        <Link href="/notifications"
          className="relative text-on-surface-variant hover:text-on-surface transition-colors p-1.5 sm:p-2 rounded-xl hover:bg-surface-container-high/50" aria-label="Notifications">
          <span className="material-symbols-outlined text-lg sm:text-xl">notifications</span>
          {notifCount > 0 && (
            <span className={`absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full text-[9px] font-bold text-white px-1 ${criticalCount > 0 ? "bg-red-500" : "bg-amber-500"}`}>
              {notifCount > 99 ? "99+" : notifCount}
            </span>
          )}
        </Link>

        {/* Profile Menu */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setProfileOpen((p) => !p)}
            className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-primary/20 flex items-center justify-center hover:ring-2 hover:ring-primary/30 transition-all"
          >
            <span className="text-primary text-xs font-bold">A</span>
          </button>

          {profileOpen && (
            <div className="absolute right-0 top-full mt-2 w-56 rounded-2xl bg-surface-container border border-outline-variant/15 shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
              {/* User info */}
              <div className="px-4 py-3 border-b border-outline-variant/10">
                <p className="text-sm font-bold text-on-surface">Admin</p>
                <p className="text-xs text-on-surface-variant">admin@luxjd.com</p>
              </div>

              {/* Menu items */}
              <div className="py-1.5">
                <Link href="/settings" onClick={() => setProfileOpen(false)}
                  className="flex items-center gap-3 px-4 py-2.5 text-sm text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high/50 transition-colors">
                  <span className="material-symbols-outlined text-lg">person</span>
                  Profile
                </Link>
                <Link href="/settings" onClick={() => setProfileOpen(false)}
                  className="flex items-center gap-3 px-4 py-2.5 text-sm text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high/50 transition-colors">
                  <span className="material-symbols-outlined text-lg">settings</span>
                  Settings
                </Link>
                <Link href="/notifications" onClick={() => setProfileOpen(false)}
                  className="flex items-center gap-3 px-4 py-2.5 text-sm text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high/50 transition-colors">
                  <span className="material-symbols-outlined text-lg">notifications</span>
                  Notifications
                  {notifCount > 0 && (
                    <span className="ml-auto px-1.5 py-0.5 rounded-full bg-amber-400/15 text-amber-400 text-[10px] font-bold">{notifCount}</span>
                  )}
                </Link>

                <div className="my-1.5 border-t border-outline-variant/10" />

                <Link href="/agents" onClick={() => setProfileOpen(false)}
                  className="flex items-center gap-3 px-4 py-2.5 text-sm text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high/50 transition-colors">
                  <span className="material-symbols-outlined text-lg">smart_toy</span>
                  AI Agents
                </Link>
                <Link href="/pipeline" onClick={() => setProfileOpen(false)}
                  className="flex items-center gap-3 px-4 py-2.5 text-sm text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high/50 transition-colors">
                  <span className="material-symbols-outlined text-lg">conveyor_belt</span>
                  Pipeline
                </Link>

                <div className="my-1.5 border-t border-outline-variant/10" />

                <a href="https://github.com/luxjd/docs" target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-3 px-4 py-2.5 text-sm text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high/50 transition-colors">
                  <span className="material-symbols-outlined text-lg">help</span>
                  Help Center
                  <span className="material-symbols-outlined text-xs ml-auto opacity-50">open_in_new</span>
                </a>
                <a href="https://github.com/luxjd/docs" target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-3 px-4 py-2.5 text-sm text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high/50 transition-colors">
                  <span className="material-symbols-outlined text-lg">description</span>
                  Documentation
                  <span className="material-symbols-outlined text-xs ml-auto opacity-50">open_in_new</span>
                </a>

                <div className="my-1.5 border-t border-outline-variant/10" />

                <Link href="/login" onClick={() => setProfileOpen(false)}
                  className="flex items-center gap-3 px-4 py-2.5 text-sm text-red-400 hover:bg-red-400/5 transition-colors">
                  <span className="material-symbols-outlined text-lg">logout</span>
                  Sign Out
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
