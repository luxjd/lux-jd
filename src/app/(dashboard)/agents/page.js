import Link from "next/link";
import { agents } from "@/lib/mock-data";

export default function AgentsHubPage() {
  return (
    <div className="space-y-6">
      <p className="text-on-surface-variant text-sm">7 specialized AI agents powering the arbitrage pipeline</p>

      {/* Valuation Agent — standalone, always first */}
      <Link href="/agents/valuation" className="block bg-surface-container rounded-2xl border border-secondary/20 p-6 hover:border-secondary/40 transition-all mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-secondary/10 border border-secondary/20 flex items-center justify-center">
              <span className="material-symbols-outlined text-secondary text-2xl">auto_awesome</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-headline font-bold text-lg">Valuation Agent</h3>
                <span className="px-2 py-0.5 rounded-full bg-secondary/15 text-secondary text-[10px] font-bold">AGENT #0</span>
                <span className="px-2 py-0.5 rounded-full bg-emerald-400/15 text-emerald-400 text-[10px] font-bold">STANDALONE</span>
              </div>
              <p className="text-sm text-on-surface-variant mt-0.5">Upload vehicle data → Get instant BUY/REVIEW/PASS recommendation with full market analysis</p>
            </div>
          </div>
          <span className="material-symbols-outlined text-secondary text-2xl">arrow_forward</span>
        </div>
      </Link>

      <h3 className="font-headline font-bold text-lg mb-4">Pipeline Agents</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {agents.map((a) => {
          const hasPage = a.id === "de-market";
          const Wrapper = hasPage ? Link : "div";
          const wrapperProps = hasPage ? { href: "/agents/de-market" } : {};

          return (
            <Wrapper
              key={a.id}
              {...wrapperProps}
              className={`bg-surface-container rounded-2xl border border-outline-variant/10 p-6 transition-all ${
                hasPage ? "hover:border-primary/30 cursor-pointer" : "opacity-70"
              }`}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                    <span className="material-symbols-outlined text-primary">{a.icon}</span>
                  </div>
                  <div>
                    <h3 className="font-headline font-bold text-sm">{a.name}</h3>
                    <p className="text-[10px] text-on-surface-variant font-mono">{a.id}</p>
                  </div>
                </div>
                <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                  a.status === "ONLINE" ? "bg-emerald-400/15 text-emerald-400" :
                  a.status === "PROCESSING" ? "bg-amber-400/15 text-amber-400" :
                  "bg-slate-500/15 text-slate-400"
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${
                    a.status === "ONLINE" ? "bg-emerald-400" : a.status === "PROCESSING" ? "bg-amber-400 animate-pulse" : "bg-slate-500"
                  }`} />
                  {a.status}
                </span>
              </div>

              <p className="text-xs text-on-surface-variant mb-3">{a.lastAction}</p>

              <div className="flex items-center justify-between pt-3 border-t border-outline-variant/10">
                <span className="text-[10px] text-on-surface-variant">{a.time}</span>
                {hasPage ? (
                  <span className="text-xs text-primary font-bold flex items-center gap-1">
                    Open <span className="material-symbols-outlined text-sm">arrow_forward</span>
                  </span>
                ) : (
                  <span className="text-[10px] text-on-surface-variant">Coming Soon</span>
                )}
              </div>
            </Wrapper>
          );
        })}
      </div>
    </div>
  );
}
