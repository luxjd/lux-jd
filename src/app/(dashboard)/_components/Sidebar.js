"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
  { href: "/pipeline", label: "Pipeline", icon: "local_shipping" },
  { href: "/opportunities", label: "Opportunities", icon: "travel_explore" },
  { href: "/listings", label: "Listings", icon: "directions_car" },
  { href: "/finance", label: "Finance", icon: "account_balance" },
  { href: "/leads", label: "Leads", icon: "people" },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  };

  return (
    <aside
      className={`${collapsed ? "w-20" : "w-64"} h-screen flex flex-col bg-surface-container-lowest border-r border-outline-variant/10 transition-all duration-300 shrink-0`}
    >
      {/* Logo */}
      <div className="flex items-center justify-between px-5 py-5 border-b border-outline-variant/10">
        {!collapsed && (
          <Link href="/dashboard" className="font-headline text-xl font-bold tracking-widest text-on-surface">
            LuxJD
          </Link>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="text-on-surface-variant hover:text-on-surface transition-colors p-1"
        >
          <span className="material-symbols-outlined text-xl">
            {collapsed ? "menu" : "menu_open"}
          </span>
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
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
      <div className="border-t border-outline-variant/10 p-3 space-y-1">
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
        >
          <span className="material-symbols-outlined text-xl">logout</span>
          {!collapsed && <span className="text-sm font-medium">Sign Out</span>}
        </button>

        {/* User */}
        {!collapsed && (
          <div className="flex items-center gap-3 px-3 py-3 mt-2">
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
              <span className="text-primary text-xs font-bold">A</span>
            </div>
            <div className="overflow-hidden">
              <p className="text-xs font-medium text-on-surface truncate">Admin</p>
              <p className="text-[10px] text-on-surface-variant truncate">admin@luxjd.com</p>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
