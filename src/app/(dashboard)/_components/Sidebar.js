"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect } from "react";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
  { href: "/pipeline", label: "Pipeline", icon: "local_shipping" },
  { href: "/opportunities", label: "Opportunities", icon: "travel_explore" },
  { href: "/listings", label: "Listings", icon: "directions_car" },
  { href: "/finance", label: "Finance", icon: "account_balance" },
  { href: "/leads", label: "Leads", icon: "people" },
  { href: "/agents", label: "Agents", icon: "smart_toy" },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close mobile menu on route change
  useEffect(() => { setMobileOpen(false); }, [pathname]);

  // Close on escape
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") setMobileOpen(false); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  };

  const navContent = (
    <>
      {/* Logo */}
      <div className="flex items-center justify-between px-4 sm:px-5 py-4 sm:py-5 border-b border-outline-variant/10">
        {!collapsed && (
          <Link href="/dashboard" className="font-headline text-lg sm:text-xl font-bold tracking-widest text-on-surface">
            LuxJD
          </Link>
        )}
        <button
          onClick={() => { if (window.innerWidth < 1024) setMobileOpen(false); else setCollapsed(!collapsed); }}
          className="text-on-surface-variant hover:text-on-surface transition-colors p-1"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <span className="material-symbols-outlined text-xl">
            {collapsed ? "menu" : "menu_open"}
          </span>
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-3 sm:py-4 px-2 sm:px-3 space-y-1 overflow-y-auto" role="navigation" aria-label="Main navigation">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group ${
                isActive
                  ? "bg-primary/10 text-primary border-l-2 border-primary"
                  : "text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface"
              }`}
            >
              <span className={`material-symbols-outlined text-xl ${isActive ? "text-primary" : "text-on-surface-variant group-hover:text-on-surface"}`}>
                {item.icon}
              </span>
              {!collapsed && (
                <span className="text-sm font-medium">{item.label}</span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Bottom section */}
      <div className="border-t border-outline-variant/10 p-2 sm:p-3 space-y-1">
        <Link
          href="/settings"
          className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 ${
            pathname === "/settings"
              ? "bg-primary/10 text-primary"
              : "text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface"
          }`}
        >
          <span className="material-symbols-outlined text-xl">settings</span>
          {!collapsed && <span className="text-sm font-medium">Settings</span>}
        </Link>

        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-on-surface-variant hover:bg-error/10 hover:text-error transition-all duration-200"
          aria-label="Sign out"
        >
          <span className="material-symbols-outlined text-xl">logout</span>
          {!collapsed && <span className="text-sm font-medium">Sign Out</span>}
        </button>

        {/* User */}
        {!collapsed && (
          <div className="flex items-center gap-3 px-3 py-3 mt-2">
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
              <span className="text-primary text-xs font-bold">A</span>
            </div>
            <div className="overflow-hidden min-w-0">
              <p className="text-xs font-medium text-on-surface truncate">Admin</p>
              <p className="text-[10px] text-on-surface-variant truncate">admin@luxjd.com</p>
            </div>
          </div>
        )}
      </div>
    </>
  );

  return (
    <>
      {/* Mobile hamburger button — shown only on small screens */}
      <button
        onClick={() => setMobileOpen(true)}
        className="lg:hidden fixed top-3 left-3 z-50 w-10 h-10 rounded-xl bg-surface-container border border-outline-variant/20 flex items-center justify-center text-on-surface-variant hover:text-on-surface transition-colors"
        aria-label="Open menu"
      >
        <span className="material-symbols-outlined">menu</span>
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar — desktop: always visible, mobile: slide-in drawer */}
      <aside
        className={`
          ${collapsed ? "w-20" : "w-64"}
          h-full flex flex-col bg-surface-container-lowest border-r border-outline-variant/10 transition-all duration-300 shrink-0

          fixed lg:relative z-50 lg:z-auto
          ${mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
        `}
        role="navigation"
      >
        {navContent}
      </aside>
    </>
  );
}
