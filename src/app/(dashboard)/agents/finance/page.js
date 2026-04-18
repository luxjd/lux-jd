import Link from "next/link";
import { getAgentStatus, getLatestPortfolio, getLatestTaxReport, getFxHistory, getFxAlerts, getAllTransactions } from "@/lib/agents/finance/storage";
import { formatEur } from "@/lib/format";
import RunCheckButton from "./_components/RunCheckButton";

const fmt = formatEur;
const EM_DASH = "—";

export default async function FinanceAgentPage() {
  const status = await getAgentStatus();
  const portfolio = await getLatestPortfolio();
  const taxReport = await getLatestTaxReport();
  const fxAlerts = await getFxAlerts();
  const allTxns = await getAllTransactions();
  const hasData = !!portfolio?.summary;

  return (
    <div className="space-y-6">
      <Link href="/agents" className="text-sm text-on-surface-variant hover:text-primary transition-colors flex items-center gap-1">
        <span className="material-symbols-outlined text-sm">arrow_back</span> All Agents
      </Link>

      {/* Header */}
      <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-4 sm:p-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-emerald-400/10 border border-emerald-400/20 flex items-center justify-center">
              <span className="material-symbols-outlined text-emerald-400 text-2xl">account_balance</span>
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="font-headline text-xl font-bold">Finance & Compliance Agent</h2>
                <span className="px-2 py-0.5 rounded-full bg-surface-container-high text-[10px] text-on-surface-variant font-mono">finance</span>
                <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${status.status === "ONLINE" ? "bg-emerald-400/15 text-emerald-400" : "bg-slate-400/10 text-slate-400"}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${status.status === "ONLINE" ? "bg-emerald-400" : "bg-slate-400"}`} />
                  {status.status || "IDLE"}
                </span>
              </div>
              <p className="text-xs text-on-surface-variant mt-0.5">
                P&L tracking · FX monitoring · tax optimization · cash flow projections
                {status.fxRate && ` · EUR/JPY ¥${status.fxRate}`}
              </p>
            </div>
          </div>
          <RunCheckButton />
        </div>

        {/* Quick metrics */}
        {hasData && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
            <div className={`px-3 py-2 rounded-lg ${(portfolio.summary.totalMargin || 0) >= 0 ? "bg-emerald-400/5 border border-emerald-400/10" : "bg-red-400/5 border border-red-400/10"}`}>
              <p className={`font-headline font-bold text-lg ${(portfolio.summary.totalMargin || 0) >= 0 ? "text-emerald-400" : "text-red-400"}`}>{fmt(portfolio.summary.totalMargin)}</p>
              <p className={`text-[10px] uppercase ${(portfolio.summary.totalMargin || 0) >= 0 ? "text-emerald-400" : "text-red-400"}`}>Total Margin</p>
            </div>
            <div className="px-3 py-2 rounded-lg bg-sky-400/5 border border-sky-400/15">
              <p className="font-headline font-bold text-lg text-sky-300">{fmt(portfolio.summary.totalCapitalDeployed)}</p>
              <p className="text-[10px] text-sky-300 uppercase">Capital Deployed</p>
            </div>
            <div className="px-3 py-2 rounded-lg bg-secondary/5 border border-secondary/10">
              <p className="font-headline font-bold text-lg text-secondary">
                {(portfolio.summary.sold || 0) > 0 ? `${portfolio.summary.avgMarginPct || 0}%` : EM_DASH}
              </p>
              <p className="text-[10px] text-secondary uppercase">Avg Margin</p>
            </div>
            <div className="px-3 py-2 rounded-lg bg-surface-container-high/30 border border-outline-variant/10">
              <p className="font-headline font-bold text-lg">{allTxns.transactions?.length || 0}</p>
              <p className="text-[10px] text-on-surface-variant uppercase">Transactions</p>
            </div>
          </div>
        )}
      </div>

      {!hasData ? (
        <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-12 text-center">
          <span className="material-symbols-outlined text-4xl text-on-surface-variant/30 mb-3 block">account_balance</span>
          <h3 className="font-headline font-bold text-lg mb-2">No Financial Data Yet</h3>
          <p className="text-sm text-on-surface-variant">Click &quot;Run Financial Check&quot; to analyze pipeline vehicles, check FX rates, and generate tax reports.</p>
        </div>
      ) : (
        <>
          {/* FX Alerts */}
          {fxAlerts.alerts?.length > 0 && (
            <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-4 sm:p-6">
              <h3 className="font-headline font-bold text-lg mb-3">FX Alerts</h3>
              <div className="space-y-2">
                {fxAlerts.alerts.slice(-5).reverse().map((a, i) => (
                  <div key={i} className={`p-3 rounded-xl text-sm flex items-start gap-2 ${a.level === "CRITICAL" ? "bg-red-400/10 border border-red-400/20 text-red-400" : a.level === "WARN" ? "bg-amber-400/10 border border-amber-400/20 text-amber-400" : "bg-primary/10 border border-primary/20 text-primary"}`}>
                    <span className="material-symbols-outlined text-lg shrink-0">{a.level === "CRITICAL" ? "error" : a.level === "WARN" ? "warning" : "info"}</span>
                    <div>
                      <p className="font-bold">{a.message}</p>
                      <p className="text-xs opacity-80">{a.impact}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Portfolio + Brand Concentration */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-4 sm:p-6">
              <h3 className="font-headline font-bold text-lg mb-4">Portfolio Summary</h3>
              <div className="space-y-3">
                {[
                  { label: "In Pipeline", value: portfolio.summary.inPipeline },
                  { label: "Sold", value: portfolio.summary.sold },
                  { label: "Total Revenue", value: fmt(portfolio.summary.totalRevenue) },
                  { label: "Realized Margin", value: fmt(portfolio.summary.realizedMargin), colored: true, raw: portfolio.summary.realizedMargin },
                  { label: "Unrealized Margin", value: fmt(portfolio.summary.unrealizedMargin), colored: true, raw: portfolio.summary.unrealizedMargin },
                  { label: "Avg Days to Sell", value: (portfolio.summary.sold || 0) > 0 ? `${portfolio.summary.avgDaysToSell}d` : EM_DASH },
                  { label: "Capital Turnover", value: (portfolio.summary.sold || 0) > 0 ? `${portfolio.summary.capitalTurnover}x` : EM_DASH },
                  { label: "VAT Reclaimable", value: fmt(portfolio.summary.totalVatReclaimable) },
                ].map((r, i) => (
                  <div key={i} className="flex justify-between text-sm">
                    <span className="text-on-surface-variant">{r.label}</span>
                    <span className={`font-bold ${r.colored ? ((r.raw || 0) >= 0 ? "text-emerald-400" : "text-red-400") : ""}`}>{r.value}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-4 sm:p-6">
              <h3 className="font-headline font-bold text-lg mb-4">Brand Concentration</h3>
              {portfolio.brandConcentration?.length > 0 ? (
                <div className="space-y-3">
                  {portfolio.brandConcentration.map((b) => (
                    <div key={b.brand}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="font-bold">{b.brand}</span>
                        <span className={`text-xs font-bold ${b.withinLimit ? "text-emerald-400" : "text-red-400"}`}>
                          {b.concentrationPct}% {b.withinLimit ? "✓" : "⚠ >30%"}
                        </span>
                      </div>
                      <div className="w-full h-2 bg-surface-container-high rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${b.withinLimit ? "bg-primary" : "bg-red-400"}`} style={{ width: `${Math.min(b.concentrationPct, 100)}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-on-surface-variant">No concentration data available</p>
              )}
            </div>
          </div>

          {/* Tax + VAT */}
          {taxReport && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {taxReport.vatDeclaration && (
                <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-4 sm:p-6">
                  <h3 className="font-headline font-bold text-lg mb-4">VAT Declaration ({taxReport.vatDeclaration.period})</h3>
                  <div className="space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-on-surface-variant">Sales VAT</span>
                      <span className="font-bold">{fmt(taxReport.vatDeclaration.salesVat)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-on-surface-variant">Input VAT (reclaimable)</span>
                      <span className="font-bold text-emerald-400">-{fmt(taxReport.vatDeclaration.inputVat)}</span>
                    </div>
                    <div className="flex justify-between text-sm pt-2 border-t border-outline-variant/10">
                      <span className="font-bold">{taxReport.vatDeclaration.isRefund ? "Refund" : "Net Liability"}</span>
                      <span className={`font-bold ${taxReport.vatDeclaration.isRefund ? "text-emerald-400" : ""}`}>
                        {fmt(Math.abs(taxReport.vatDeclaration.netVatLiability))}
                      </span>
                    </div>
                    <p className="text-xs text-on-surface-variant">Due: {taxReport.vatDeclaration.dueDate}</p>
                  </div>
                </div>
              )}

              {taxReport.taxReview && (
                <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-4 sm:p-6">
                  <h3 className="font-headline font-bold text-lg mb-4 flex items-center gap-2">
                    AI Tax Review
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${taxReport.taxReview.compliance_status === "COMPLIANT" ? "bg-emerald-400/15 text-emerald-400" : "bg-amber-400/15 text-amber-400"}`}>
                      {taxReport.taxReview.compliance_status}
                    </span>
                  </h3>
                  {taxReport.taxReview.recommendations?.length > 0 && (
                    <ul className="space-y-1">
                      {taxReport.taxReview.recommendations.map((r, i) => (
                        <li key={i} className="text-sm text-on-surface-variant flex items-start gap-1.5">
                          <span className="material-symbols-outlined text-primary text-sm mt-0.5 shrink-0">lightbulb</span>{r}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Recent Transactions */}
          {allTxns.transactions?.length > 0 && (
            <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-4 sm:p-6">
              <h3 className="font-headline font-bold text-lg mb-4">Recent Transactions ({allTxns.transactions.length} total)</h3>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[600px]">
                  <thead>
                    <tr className="border-b border-outline-variant/20">
                      {["Date", "Vehicle", "Category", "Amount", "Description"].map((h) => (
                        <th key={h} className="text-left py-2 px-3 text-[10px] uppercase tracking-widest text-on-surface-variant">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {allTxns.transactions.slice(-15).reverse().map((t) => (
                      <tr key={t.id} className="border-b border-outline-variant/10 hover:bg-surface-container-high/30">
                        <td className="py-2 px-3 text-xs">{t.transactionDate}</td>
                        <td className="py-2 px-3 text-xs font-mono">{t.vehicleId?.substring(0, 12)}</td>
                        <td className="py-2 px-3"><span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-container-high">{t.category}</span></td>
                        <td className={`py-2 px-3 text-sm font-bold ${t.category === "SALE_PROCEEDS" ? "text-emerald-400" : ""}`}>
                          {t.category === "SALE_PROCEEDS" ? "+" : "-"}{fmt(t.amountEur)}
                        </td>
                        <td className="py-2 px-3 text-xs text-on-surface-variant truncate max-w-[200px]">{t.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
