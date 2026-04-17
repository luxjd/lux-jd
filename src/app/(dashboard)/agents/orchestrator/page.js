import Link from "next/link";
import { getAgentStatus, getDecisions, getLatestPortfolioSnapshot } from "@/lib/agents/orchestrator/storage";
import { getLatestOpportunities } from "@/lib/agents/jp-sourcing/storage";
import { checkAllAgents } from "@/lib/agents/orchestrator/ai/agent-monitor";
import { loadPortfolioState } from "@/lib/agents/orchestrator/ai/portfolio-manager";
import EvaluateButton from "./_components/EvaluateButton";
import DecisionHistory from "./_components/DecisionHistory";

const HEALTH_STYLES = { HEALTHY: "bg-emerald-400", DEGRADED: "bg-amber-400", STALE: "bg-amber-400", DOWN: "bg-red-400", IDLE: "bg-slate-400" };

export default async function OrchestratorPage() {
  const status = await getAgentStatus();
  const decisionsData = await getDecisions();
  const decisions = decisionsData.decisions || [];
  const agentHealth = await checkAllAgents();
  const portfolio = await loadPortfolioState();

  // Deduplicate decisions: keep latest per vehicle (newest first from DB)
  const seenIds = new Set();
  const dedupedDecisions = decisions.filter((d) => {
    const key = d.opportunityId || d.vehicleName || d.id;
    if (seenIds.has(key)) return false;
    seenIds.add(key);
    return true;
  });

  // Counts from deduped decisions
  const approvedCount = dedupedDecisions.filter((d) => d.decision === "AUTO_APPROVE" || d.decision === "HUMAN_APPROVED").length;
  const pendingCount = dedupedDecisions.filter((d) => d.decision === "HUMAN_REVIEW").length;
  const rejectedCount = dedupedDecisions.filter((d) => d.decision === "REJECT" || d.decision === "HUMAN_REJECTED").length;

  // Get actionable opportunities (BUY/STRONG_BUY that haven't been evaluated yet)
  const oppData = await getLatestOpportunities();
  const decidedIds = new Set(dedupedDecisions.map((d) => d.opportunityId).filter(Boolean));
  const opportunities = (oppData?.opportunities || []).filter((o) =>
    (o.recommendation === "STRONG_BUY" || o.recommendation === "BUY") && !decidedIds.has(o.id)
  );

  const fmt = (n) => n != null && !isNaN(n) ? `€${n.toLocaleString("de-DE")}` : "—";

  return (
    <div className="space-y-6">
      <Link href="/agents" className="text-sm text-on-surface-variant hover:text-primary transition-colors flex items-center gap-1">
        <span className="material-symbols-outlined text-sm">arrow_back</span> All Agents
      </Link>

      {/* Header — THE COMMAND CENTER */}
      <div className="bg-surface-container rounded-2xl border border-secondary/20 p-4 sm:p-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-5">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-xl bg-secondary/10 border border-secondary/20 flex items-center justify-center">
              <span className="material-symbols-outlined text-secondary text-3xl">hub</span>
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="font-headline text-xl font-bold">Orchestrator</h2>
                <span className="px-2 py-0.5 rounded-full bg-secondary/15 text-secondary text-[10px] font-bold">SUPREME AGENT</span>
                <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${status.status === "ONLINE" ? "bg-emerald-400/15 text-emerald-400" : "bg-slate-400/10 text-slate-400"}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${status.status === "ONLINE" ? "bg-emerald-400" : "bg-slate-400"}`} />
                  {status.status || "IDLE"}
                </span>
              </div>
              <p className="text-xs text-on-surface-variant mt-0.5">
                10-step decision engine · portfolio management · agent coordination · human-in-the-loop gateway
              </p>
            </div>
          </div>
          <EvaluateButton opportunities={opportunities} />
        </div>

        {/* Key metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div className="px-3 py-2 rounded-lg bg-emerald-400/5 border border-emerald-400/10 text-center">
            <p className="font-headline font-bold text-lg text-emerald-400">{approvedCount}</p>
            <p className="text-[9px] text-emerald-400 uppercase">Approved</p>
          </div>
          <div className="px-3 py-2 rounded-lg bg-amber-400/5 border border-amber-400/10 text-center">
            <p className="font-headline font-bold text-lg text-amber-400">{pendingCount}</p>
            <p className="text-[9px] text-amber-400 uppercase">Pending</p>
          </div>
          <div className="px-3 py-2 rounded-lg bg-red-400/5 border border-red-400/10 text-center">
            <p className="font-headline font-bold text-lg text-red-400">{rejectedCount}</p>
            <p className="text-[9px] text-red-400 uppercase">Rejected</p>
          </div>
          <div className="px-3 py-2 rounded-lg bg-primary/5 border border-primary/10 text-center">
            <p className="font-headline font-bold text-lg text-primary">{portfolio.totalVehicles}</p>
            <p className="text-[9px] text-primary uppercase">Pipeline</p>
          </div>
          <div className="px-3 py-2 rounded-lg bg-surface-container-high/30 border border-outline-variant/10 text-center">
            <p className="font-headline font-bold text-lg">{portfolio.healthScore}</p>
            <p className="text-[9px] text-on-surface-variant uppercase">Health</p>
          </div>
        </div>
      </div>

      {/* Agent Health Monitor */}
      <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-4 sm:p-6">
        <h3 className="font-headline font-bold text-lg mb-4 flex items-center gap-2">
          <span className="material-symbols-outlined text-primary">monitor_heart</span>
          Agent Health Monitor
          <span className={`ml-2 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${agentHealth.overallHealth === "HEALTHY" ? "bg-emerald-400/15 text-emerald-400" : agentHealth.overallHealth === "CRITICAL" ? "bg-red-400/15 text-red-400" : "bg-amber-400/15 text-amber-400"}`}>
            {agentHealth.overallHealth}
          </span>
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {agentHealth.agents.map((a) => (
            <div key={a.id} className="flex items-center justify-between p-3 rounded-xl bg-surface-container-high/30">
              <div className="flex items-center gap-2.5">
                <span className={`w-2.5 h-2.5 rounded-full ${HEALTH_STYLES[a.health]}`} />
                <div>
                  <p className="text-sm font-bold">{a.name}</p>
                  <p className="text-[10px] text-on-surface-variant">{a.status} · {a.hoursSinceAction != null ? `${a.hoursSinceAction}h ago` : "Never run"}</p>
                </div>
              </div>
              {a.critical && <span className="text-[8px] text-secondary font-bold uppercase">CRITICAL</span>}
            </div>
          ))}
        </div>
      </div>

      {/* Portfolio Overview */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-4 sm:p-6">
          <h3 className="font-headline font-bold text-lg mb-4">Portfolio State</h3>
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-on-surface-variant">Vehicles in Pipeline</span>
              <span className="font-bold">{portfolio.totalVehicles}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-on-surface-variant">Capital Deployed</span>
              <span className="font-bold">{fmt(portfolio.totalCapitalDeployed)}</span>
            </div>
            <div>
              <div className="flex justify-between text-xs text-on-surface-variant mb-1">
                <span>Deployment</span>
                <span>{portfolio.deploymentPct}% of {fmt(portfolio.totalAvailableCapital)}</span>
              </div>
              <div className="w-full h-2 bg-surface-container-high rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${portfolio.deploymentPct > 80 ? "bg-red-400" : portfolio.deploymentPct > 60 ? "bg-amber-400" : "bg-emerald-400"}`} style={{ width: `${Math.min(portfolio.deploymentPct, 100)}%` }} />
              </div>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-on-surface-variant">Remaining Capacity</span>
              <span className={`font-bold ${portfolio.remainingCapacity > 0 ? "text-emerald-400" : "text-red-400"}`}>{fmt(Math.max(0, portfolio.remainingCapacity))}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-on-surface-variant">Health Score</span>
              <span className={`font-bold ${portfolio.healthScore >= 70 ? "text-emerald-400" : portfolio.healthScore >= 50 ? "text-amber-400" : "text-red-400"}`}>{portfolio.healthScore}/100 ({portfolio.healthLevel})</span>
            </div>
          </div>
        </div>

        <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-4 sm:p-6">
          <h3 className="font-headline font-bold text-lg mb-4">Brand Concentration</h3>
          {Object.keys(portfolio.brandConcentration || {}).length > 0 ? (
            <div className="space-y-3">
              {Object.entries(portfolio.brandConcentration).sort(([, a], [, b]) => b - a).map(([brand, pct]) => (
                <div key={brand}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-bold">{brand}</span>
                    <span className={`text-xs font-bold ${pct <= 0.30 ? "text-emerald-400" : "text-red-400"}`}>
                      {(pct * 100).toFixed(1)}% {pct > 0.30 ? "⚠ >30%" : "✓"}
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-surface-container-high rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${pct <= 0.30 ? "bg-primary" : "bg-red-400"}`} style={{ width: `${Math.min(pct * 100 * 3.33, 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-on-surface-variant">No vehicles in pipeline</p>
          )}
        </div>
      </div>

      {/* Decision History */}
      {decisions.length > 0 ? (
        <DecisionHistory decisions={decisions} />
      ) : (
        <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-12 text-center">
          <span className="material-symbols-outlined text-4xl text-on-surface-variant/30 mb-3 block">gavel</span>
          <h3 className="font-headline font-bold text-lg mb-2">No Decisions Yet</h3>
          <p className="text-sm text-on-surface-variant">Run JP Sourcing Agent to find opportunities, then click &quot;Evaluate&quot; to run the 10-step decision engine on each candidate.</p>
        </div>
      )}
    </div>
  );
}
