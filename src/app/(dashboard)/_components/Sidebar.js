"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect } from "react";

const NAV_SECTIONS = [
  {
    label: "OVERVIEW",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
      { href: "/notifications", label: "Notifications", icon: "notifications", badge: true },
    ],
  },
  {
    label: "PIPELINE",
    items: [
      { href: "/pipeline", label: "Pipeline", icon: "local_shipping" },
      { href: "/opportunities", label: "Opportunities", icon: "travel_explore" },
      { href: "/listings", label: "Listings", icon: "directions_car" },
    ],
  },
  {
    label: "OPERATIONS",
    items: [
      { href: "/agents/valuation", label: "Valuate", icon: "auto_awesome", accent: true },
      { href: "/finance", label: "Finance", icon: "account_balance" },
      { href: "/leads", label: "Leads", icon: "people" },
    ],
  },
  {
    label: "AI AGENTS",
    items: [
      { href: "/agents", label: "Agent Hub", icon: "smart_toy" },
    ],
    subItems: [
      { href: "/agents/de-market", label: "DE Market", icon: "query_stats" },
      { href: "/agents/jp-sourcing", label: "JP Sourcing", icon: "travel_explore" },
      { href: "/agents/orchestrator", label: "Orchestrator", icon: "hub" },
      { href: "/agents/logistics", label: "Logistics", icon: "local_shipping" },
      { href: "/agents/listing", label: "Listing", icon: "edit_note" },
      { href: "/agents/concierge", label: "Concierge", icon: "support_agent" },
      { href: "/agents/finance", label: "Finance", icon: "account_balance" },
    ],
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [agentsExpanded, setAgentsExpanded] = useState(pathname.startsWith("/agents"));
  const [disabledAgents, setDisabledAgents] = useState({});

  // Load agent enabled/disabled from settings
  useEffect(() => {
    fetch("/api/settings").then((r) => r.json()).then((data) => {
      const s = data.settings || {};
      const disabled = {};
      for (const key of Object.keys(s)) {
        if (key.startsWith("agents.") && s[key] === false) {
          disabled[key.replace("agents.", "")] = true;
        }
      }
      setDisabledAgents(disabled);
    }).catch(() => {});
  }, [pathname]);

  useEffect(() => { setMobileOpen(false); }, [pathname]);
  useEffect(() => {
    if (pathname.startsWith("/agents")) setAgentsExpanded(true);
  }, [pathname]);
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") setMobileOpen(false); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  };

  const isActive = (href) => pathname === href || (href !== "/dashboard" && href !== "/agents" && pathname.startsWith(href));

  const navContent = (
    <>
      {/* Logo */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-outline-variant/10">
        {!collapsed && (
          <Link href="/dashboard" className="font-headline text-lg font-bold tracking-widest text-on-surface">
            LuxJD
          </Link>
        )}
        <button
          onClick={() => { if (window.innerWidth < 1024) setMobileOpen(false); else setCollapsed(!collapsed); }}
          className="text-on-surface-variant hover:text-on-surface transition-colors p-1"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <span className="material-symbols-outlined text-xl">{collapsed ? "menu" : "menu_open"}</span>
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-2 px-2 overflow-y-auto" role="navigation" aria-label="Main navigation">
        {NAV_SECTIONS.map((section) => (
          <div key={section.label} className="mb-1">
            {/* Section label */}
            {!collapsed && (
              <p className="px-3 pt-3 pb-1 text-[9px] uppercase tracking-[0.2em] text-on-surface-variant/50 font-bold">
                {section.label}
              </p>
            )}

            {/* Section items */}
            {section.items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-xl transition-all duration-200 group mb-0.5 ${
                  isActive(item.href)
                    ? "bg-primary/10 text-primary"
                    : item.accent
                    ? "text-secondary hover:bg-secondary/10"
                    : "text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface"
                }`}
              >
                <span className={`material-symbols-outlined text-[20px] ${
                  isActive(item.href) ? "text-primary" : item.accent ? "text-secondary" : "text-on-surface-variant group-hover:text-on-surface"
                }`}>
                  {item.icon}
                </span>
                {!collapsed && (
                  <span className="text-[13px] font-medium flex-1">{item.label}</span>
                )}
                {!collapsed && item.badge && (
                  <span className="w-2 h-2 rounded-full bg-error shrink-0"></span>
                )}
              </Link>
            ))}

            {/* Agent sub-items (expandable) */}
            {section.subItems && !collapsed && (
              <>
                <button
                  onClick={() => setAgentsExpanded(!agentsExpanded)}
                  className="w-full flex items-center gap-2.5 px-3 py-1.5 text-on-surface-variant/60 hover:text-on-surface-variant transition-colors"
                >
                  <span className="material-symbols-outlined text-[16px] transition-transform" style={{ transform: agentsExpanded ? "rotate(90deg)" : "rotate(0deg)" }}>
                    chevron_right
                  </span>
                  <span className="text-[11px] uppercase tracking-wider">Individual Agents</span>
                </button>

                {agentsExpanded && (
                  <div className="ml-3 border-l border-outline-variant/10 pl-1 space-y-0.5">
                    {section.subItems.map((sub) => {
                      const agentId = sub.href.replace("/agents/", "");
                      const isOff = disabledAgents[agentId];
                      return (
                        <Link
                          key={sub.href}
                          href={sub.href}
                          className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg transition-all text-[12px] ${
                            isOff
                              ? "text-on-surface-variant/30 hover:text-on-surface-variant/50"
                              : isActive(sub.href)
                                ? "text-primary bg-primary/5"
                                : "text-on-surface-variant/70 hover:text-on-surface hover:bg-surface-container-low"
                          }`}
                        >
                          <span className={`material-symbols-outlined text-[16px] ${isOff ? "text-on-surface-variant/30" : isActive(sub.href) ? "text-primary" : ""}`}>{sub.icon}</span>
                          <span>{sub.label}</span>
                          {isOff && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-red-400/60" />}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        ))}
      </nav>

      {/* Bottom */}
      <div className="border-t border-outline-variant/10 p-2 space-y-0.5">
        <Link href="/settings"
          className={`flex items-center gap-2.5 px-3 py-2 rounded-xl transition-all duration-200 ${pathname === "/settings" ? "bg-primary/10 text-primary" : "text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface"}`}>
          <span className="material-symbols-outlined text-[20px]">settings</span>
          {!collapsed && <span className="text-[13px] font-medium">Settings</span>}
        </Link>

        <button onClick={handleLogout}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-on-surface-variant hover:bg-error/10 hover:text-error transition-all duration-200" aria-label="Sign out">
          <span className="material-symbols-outlined text-[20px]">logout</span>
          {!collapsed && <span className="text-[13px] font-medium">Sign Out</span>}
        </button>

        {!collapsed && (
          <div className="flex items-center gap-2.5 px-3 py-2 mt-1">
            <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
              <span className="text-primary text-[10px] font-bold">A</span>
            </div>
            <div className="overflow-hidden min-w-0">
              <p className="text-[11px] font-medium text-on-surface truncate">Admin</p>
              <p className="text-[9px] text-on-surface-variant truncate">admin@luxjd.com</p>
            </div>
          </div>
        )}
      </div>
    </>
  );

  return (
    <>
      {/* Mobile hamburger */}
      <button onClick={() => setMobileOpen(true)}
        className="lg:hidden fixed top-3 left-3 z-50 w-10 h-10 rounded-xl bg-surface-container border border-outline-variant/20 flex items-center justify-center text-on-surface-variant hover:text-on-surface transition-colors"
        aria-label="Open menu">
        <span className="material-symbols-outlined">menu</span>
      </button>

      {/* Mobile overlay */}
      {mobileOpen && <div className="lg:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />}

      {/* Sidebar */}
      <aside className={`${collapsed ? "w-[60px]" : "w-60"} h-full flex flex-col bg-surface-container-lowest border-r border-outline-variant/10 transition-all duration-300 shrink-0 fixed lg:relative z-50 lg:z-auto ${mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`} role="navigation">
        {navContent}
      </aside>
    </>
  );
}
