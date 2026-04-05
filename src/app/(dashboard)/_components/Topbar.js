"use client";

import { usePathname } from "next/navigation";

const PAGE_TITLES = {
  "/dashboard": "Dashboard",
  "/pipeline": "Vehicle Pipeline",
  "/opportunities": "Sourcing Opportunities",
  "/listings": "Listings",
  "/finance": "Finance & Compliance",
  "/leads": "Leads & Inquiries",
  "/settings": "Settings",
  "/agents": "AI Agents",
  "/agents/de-market": "DE Market Research Agent",
  "/agents/valuation": "Valuation Agent",
  "/agents/jp-sourcing": "JP Sourcing Agent",
};

export default function Topbar() {
  const pathname = usePathname();
  const title = PAGE_TITLES[pathname] || (pathname.startsWith("/agents/de-market/") ? "Model Detail" : "Dashboard");

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
        <button className="relative text-on-surface-variant hover:text-on-surface transition-colors p-1.5 sm:p-2 rounded-xl hover:bg-surface-container-high/50" aria-label="Notifications">
          <span className="material-symbols-outlined text-lg sm:text-xl">notifications</span>
          <span className="absolute top-1 right-1 w-2 h-2 bg-error rounded-full"></span>
        </button>

        {/* User */}
        <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-primary/20 flex items-center justify-center">
          <span className="text-primary text-xs font-bold">A</span>
        </div>
      </div>
    </header>
  );
}
