import Link from "next/link";
import { getAllLeads, getEscalations, getAgentStatus } from "@/lib/agents/concierge/storage";
import InquirySimulator from "./_components/InquirySimulator";
import LeadsPanel from "./_components/LeadsPanel";

export default async function ConciergeAgentPage() {
  const status = await getAgentStatus();
  const data = await getAllLeads();
  const escalations = await getEscalations();
  const leads = data.leads || [];
  const hasLeads = leads.length > 0;

  return (
    <div className="space-y-6">
      <Link href="/agents" className="text-sm text-on-surface-variant hover:text-primary transition-colors flex items-center gap-1">
        <span className="material-symbols-outlined text-sm">arrow_back</span> All Agents
      </Link>

      {/* Header */}
      <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-4 sm:p-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-violet-400/10 border border-violet-400/20 flex items-center justify-center">
            <span className="material-symbols-outlined text-violet-400 text-2xl">support_agent</span>
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-headline text-xl font-bold">Concierge Agent</h2>
              <span className="px-2 py-0.5 rounded-full bg-surface-container-high text-[10px] text-on-surface-variant font-mono">concierge</span>
              <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${status.status === "ONLINE" ? "bg-emerald-400/15 text-emerald-400" : "bg-slate-400/10 text-slate-400"}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${status.status === "ONLINE" ? "bg-emerald-400" : "bg-slate-400"}`} />
                {status.status || "IDLE"}
              </span>
            </div>
            <p className="text-xs text-on-surface-variant mt-0.5">
              Expert-level customer responses · lead scoring · negotiation · multi-language
              {status.totalLeads > 0 && ` · ${status.totalLeads} total leads · ${status.openLeads || 0} open`}
            </p>
          </div>
        </div>

        {hasLeads && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
            <div className="px-3 py-2 rounded-lg bg-primary/5 border border-primary/10">
              <span className="font-headline font-bold text-lg text-primary">{leads.filter((l) => l.status === "NEW").length}</span>
              <span className="text-[10px] text-primary uppercase ml-2">New</span>
            </div>
            <div className="px-3 py-2 rounded-lg bg-emerald-400/5 border border-emerald-400/10">
              <span className="font-headline font-bold text-lg text-emerald-400">{leads.filter((l) => l.status === "QUALIFIED").length}</span>
              <span className="text-[10px] text-emerald-400 uppercase ml-2">Qualified</span>
            </div>
            <div className="px-3 py-2 rounded-lg bg-red-400/5 border border-red-400/10">
              <span className="font-headline font-bold text-lg text-red-400">{leads.filter((l) => l.escalated).length}</span>
              <span className="text-[10px] text-red-400 uppercase ml-2">Escalated</span>
            </div>
            <div className="px-3 py-2 rounded-lg bg-surface-container-high/30 border border-outline-variant/10">
              <span className="font-headline font-bold text-lg">{leads.length}</span>
              <span className="text-[10px] text-on-surface-variant uppercase ml-2">Total</span>
            </div>
          </div>
        )}
      </div>

      {/* Inquiry Form — uses real vehicles from pipeline */}
      <InquirySimulator />

      {/* Escalations */}
      {escalations.escalations?.length > 0 && (
        <div className="bg-surface-container rounded-2xl border border-red-400/20 p-4 sm:p-6">
          <h3 className="font-headline font-bold text-lg mb-3 text-red-400 flex items-center gap-2">
            <span className="material-symbols-outlined">warning</span> Active Escalations ({escalations.escalations.length})
          </h3>
          <div className="space-y-2">
            {escalations.escalations.slice(-5).reverse().map((e, i) => (
              <div key={i} className="p-3 rounded-xl bg-red-400/5 border border-red-400/10">
                <p className="text-sm font-bold">{e.customerName} — {e.vehicle}</p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {e.triggers?.map((t, j) => (
                    <span key={j} className="px-1.5 py-0.5 rounded bg-red-400/10 text-red-400 text-[10px]">{t.trigger}: {t.reason?.substring(0, 50)}</span>
                  ))}
                </div>
                <p className="text-[10px] text-on-surface-variant mt-1">{new Date(e.timestamp).toLocaleString()}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Leads with conversation threading */}
      <LeadsPanel leads={leads.slice(-15).reverse()} />
    </div>
  );
}
