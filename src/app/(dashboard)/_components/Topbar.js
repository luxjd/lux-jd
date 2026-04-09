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
  const menuRef = useRef(null);

  useEffect(() => {
    fetch("/api/notifications")
      .then((r) => r.json())
      .then((d) => {
        setNotifCount(d.count || 0);
        setCriticalCount(d.byCritical || 0);
      })
      .catch(() => {});
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

  // Close menu on navigation
  useEffect(() => { setProfileOpen(false); }, [pathname]);

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
        <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-container-high/50 border border-outline-variant/10">
          <span className="material-symbols-outlined text-secondary text-sm">currency_exchange</span>
          <span className="text-xs font-mono text-on-surface">EUR/JPY</span>
          <span className="text-xs font-mono font-bold text-secondary">166.80</span>
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
