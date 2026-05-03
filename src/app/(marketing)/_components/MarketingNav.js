"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/about", label: "About" },
  { href: "/inventory", label: "Inventory" },
  { href: "/contact", label: "Contact" },
];

export default function MarketingNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed top-0 w-full z-50 bg-[#0a0a0a]/80 backdrop-blur-xl shadow-[0_0_20px_rgba(248,113,113,0.1)] flex justify-between items-center px-8 py-4 font-headline tracking-tighter uppercase">
      <Link href="/" className="text-xl font-bold tracking-widest text-slate-100">
        LuxJD
      </Link>
      <div className="hidden md:flex items-center gap-8">
        {LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={`transition-colors ${pathname === link.href ? "text-primary border-b-2 border-primary-container pb-1" : "text-slate-300 hover:text-primary"}`}
          >
            {link.label}
          </Link>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <Link href="/login" className="text-slate-300 hover:text-white px-4 py-2 rounded-xl font-bold transition-colors">
          Dashboard
        </Link>
      </div>
    </nav>
  );
}
