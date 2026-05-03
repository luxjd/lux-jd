import Link from "next/link";

export default function MarketingFooter() {
  return (
    <footer className="w-full border-t border-primary/20 bg-[#0a0a0a] flex flex-col md:flex-row justify-between items-center px-12 py-8 gap-6 font-body text-sm tracking-wide">
      <div className="text-slate-500">&copy; {new Date().getFullYear()} LuxJD GmbH</div>
      <div className="flex gap-8">
        <Link className="text-slate-500 hover:text-slate-200 transition-all" href="/about">About</Link>
        <Link className="text-slate-500 hover:text-slate-200 transition-all" href="/contact">Contact</Link>
        <Link className="text-slate-500 hover:text-slate-200 transition-all" href="/privacy">Privacy</Link>
      </div>
      <div className="flex items-center gap-6">
        <Link href="/" className="text-primary font-bold transition-all hover:shadow-[0_0_15px_rgba(248,113,113,0.4)]">
          <span className="material-symbols-outlined">language</span>
        </Link>
        <Link href="/login" className="text-primary font-bold transition-all hover:shadow-[0_0_15px_rgba(248,113,113,0.4)]">
          <span className="material-symbols-outlined">account_circle</span>
        </Link>
      </div>
    </footer>
  );
}
