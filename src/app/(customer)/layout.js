"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";

export default function CustomerLayout({ children }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [customer, setCustomer] = useState(null);
  const pathname = usePathname();

  useEffect(() => { setMenuOpen(false); }, [pathname]);

  useEffect(() => {
    fetch("/api/public/auth/me")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?.authenticated) setCustomer(d.customer); })
      .catch(() => {});
  }, [pathname]);

  const NAV_LINKS = [
    { href: "/showroom", label: "Showroom" },
    { href: "/#how-it-works", label: "How It Works" },
    { href: "/#faq", label: "FAQ" },
    { href: "/#contact", label: "Contact" },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 bg-[#0B0B0B]/90 backdrop-blur-xl border-b border-outline-variant/10">
        <div className="max-w-7xl mx-auto flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4">
          <Link href="/" className="font-headline text-lg sm:text-xl font-bold tracking-widest text-on-surface">
            LuxJD
          </Link>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-8">
            {NAV_LINKS.map((l) => (
              <Link key={l.href} href={l.href} className={`text-sm transition-colors font-medium ${pathname === l.href ? "text-primary" : "text-on-surface-variant hover:text-on-surface"}`}>
                {l.label}
              </Link>
            ))}
          </div>

          <div className="hidden md:flex items-center gap-3">
            {customer ? (
              <Link href="/account" className="flex items-center gap-2 text-sm text-on-surface-variant hover:text-on-surface transition-colors">
                <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center">
                  <span className="text-primary text-xs font-bold">{customer.name?.charAt(0)}</span>
                </div>
                {customer.name}
              </Link>
            ) : (
              <Link href="/customer-login" className="text-sm text-on-surface-variant hover:text-on-surface transition-colors font-medium">
                Sign In
              </Link>
            )}
            <Link href="/showroom" className="px-5 py-2 bg-primary text-on-primary rounded-xl font-bold text-sm hover:shadow-[0_0_15px_rgba(173,198,255,0.4)] transition-all">
              Browse Cars
            </Link>
          </div>

          {/* Mobile hamburger */}
          <button onClick={() => setMenuOpen(!menuOpen)} className="md:hidden text-on-surface-variant hover:text-on-surface p-1" aria-label="Toggle menu">
            <span className="material-symbols-outlined text-2xl">{menuOpen ? "close" : "menu"}</span>
          </button>
        </div>

        {/* Mobile Menu */}
        {menuOpen && (
          <div className="md:hidden border-t border-outline-variant/10 bg-[#0B0B0B]/95 backdrop-blur-xl px-4 py-4 space-y-1">
            {NAV_LINKS.map((l) => (
              <Link key={l.href} href={l.href} className="block px-3 py-2.5 rounded-xl text-sm font-medium text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface transition-all">
                {l.label}
              </Link>
            ))}
            <div className="border-t border-outline-variant/10 pt-3 mt-3 space-y-1">
              {customer ? (
                <Link href="/account" className="block px-3 py-2.5 rounded-xl text-sm font-medium text-primary">
                  My Account ({customer.name})
                </Link>
              ) : (
                <>
                  <Link href="/customer-login" className="block px-3 py-2.5 rounded-xl text-sm font-medium text-on-surface-variant hover:text-on-surface">Sign In</Link>
                  <Link href="/register" className="block px-3 py-2.5 rounded-xl text-sm font-medium text-primary">Create Account</Link>
                </>
              )}
            </div>
          </div>
        )}
      </nav>

      {/* Content */}
      <main className="pt-14 sm:pt-16">{children}</main>

      {/* Footer */}
      <footer className="border-t border-outline-variant/10 bg-surface-container-lowest mt-16 sm:mt-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 sm:py-12">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 sm:gap-8">
            <div className="col-span-2 md:col-span-1">
              <h3 className="font-headline font-bold text-lg mb-3">LuxJD</h3>
              <p className="text-sm text-on-surface-variant leading-relaxed">AI-powered luxury vehicle sourcing. Premium cars, exceptional value.</p>
            </div>
            <div>
              <h4 className="font-headline font-bold text-xs mb-3 uppercase tracking-wider">Showroom</h4>
              <div className="space-y-2">
                {["All Vehicles", "Ferrari", "Porsche", "Mercedes-AMG", "Lamborghini"].map((b) => (
                  <Link key={b} href={b === "All Vehicles" ? "/showroom" : `/showroom?make=${b}`} className="block text-sm text-on-surface-variant hover:text-primary transition-colors">{b}</Link>
                ))}
              </div>
            </div>
            <div>
              <h4 className="font-headline font-bold text-xs mb-3 uppercase tracking-wider">Company</h4>
              <div className="space-y-2">
                {[["How It Works", "/#how-it-works"], ["FAQ", "/#faq"], ["Contact", "/#contact"]].map(([label, href]) => (
                  <Link key={label} href={href} className="block text-sm text-on-surface-variant hover:text-primary transition-colors">{label}</Link>
                ))}
              </div>
            </div>
            <div>
              <h4 className="font-headline font-bold text-xs mb-3 uppercase tracking-wider">Contact</h4>
              <div className="space-y-2 text-sm text-on-surface-variant">
                <p>info@luxjd.com</p>
                <p>+49 421 123 4567</p>
                <p>Bremen, Germany</p>
              </div>
            </div>
          </div>
          <div className="border-t border-outline-variant/10 mt-8 pt-6 flex flex-col sm:flex-row justify-between items-center gap-3">
            <p className="text-xs text-on-surface-variant">© 2026 LuxJD. All rights reserved.</p>
            <div className="flex gap-4 text-xs text-on-surface-variant">
              <Link href="#" className="hover:text-primary transition-colors">Privacy</Link>
              <Link href="#" className="hover:text-primary transition-colors">Terms</Link>
              <Link href="#" className="hover:text-primary transition-colors">Imprint</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
