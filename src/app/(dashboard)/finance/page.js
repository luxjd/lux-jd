import { financeData } from "@/lib/mock-data";

export default function FinancePage() {
  const { summary, fxRate, soldVehicles } = financeData;

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
        {[
          { label: "Total Revenue", value: `€${(summary.totalRevenue / 1000).toFixed(0)}K`, icon: "payments", color: "text-secondary" },
          { label: "Gross Margin", value: `${summary.grossMargin}%`, icon: "trending_up", color: "text-emerald-400" },
          { label: "Net P&L", value: `€${(summary.netPL / 1000).toFixed(0)}K`, icon: "account_balance", color: "text-primary" },
          { label: "FX Gain/Loss", value: `+€${(summary.fxGainLoss / 1000).toFixed(1)}K`, icon: "currency_exchange", color: "text-secondary" },
        ].map((m, i) => (
          <div key={i} className="bg-surface-container rounded-2xl border border-outline-variant/10 p-5">
            <div className="flex items-center justify-between mb-3">
              <span className={`material-symbols-outlined ${m.color} text-2xl`}>{m.icon}</span>
              <span className="text-[10px] uppercase tracking-widest text-on-surface-variant">{m.label}</span>
            </div>
            <p className="font-headline text-xl sm:text-3xl font-bold">{m.value}</p>
          </div>
        ))}
      </div>

      {/* FX Rate + Capital */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-6">
          <h3 className="font-headline font-bold text-lg mb-4">EUR/JPY Rate</h3>
          <p className="font-headline text-4xl font-bold text-secondary mb-2">{fxRate.eurJpy}</p>
          <div className="flex gap-4 text-sm text-on-surface-variant">
            <span className={fxRate.change24h < 0 ? "text-red-400" : "text-emerald-400"}>
              24h: {fxRate.change24h > 0 ? "+" : ""}{fxRate.change24h}%
            </span>
            <span className={fxRate.change7d < 0 ? "text-red-400" : "text-emerald-400"}>
              7d: {fxRate.change7d > 0 ? "+" : ""}{fxRate.change7d}%
            </span>
          </div>
          <div className="mt-4 p-3 rounded-xl bg-surface-container-high/50 border border-outline-variant/10">
            <p className="text-xs text-on-surface-variant">Buffer Rate (3%)</p>
            <p className="font-headline font-bold text-lg">{fxRate.bufferRate}</p>
          </div>
        </div>

        <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-6">
          <h3 className="font-headline font-bold text-lg mb-4">Capital Deployed</h3>
          <p className="font-headline text-4xl font-bold text-primary mb-2">€{(summary.capitalDeployed / 1000).toFixed(0)}K</p>
          <div className="mt-2">
            <div className="flex justify-between text-xs text-on-surface-variant mb-1">
              <span>Deployment</span>
              <span>62% of limit</span>
            </div>
            <div className="w-full h-2 bg-surface-container-high rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-primary to-secondary rounded-full" style={{ width: "62%" }}></div>
            </div>
          </div>
          <p className="text-xs text-on-surface-variant mt-3">Max 80% = €1.48M</p>
        </div>

        <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-6">
          <h3 className="font-headline font-bold text-lg mb-4">VAT Status</h3>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-sm text-on-surface-variant">Reclaimable VAT</span>
              <span className="font-headline font-bold">€{(summary.vatReclaimable / 1000).toFixed(1)}K</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-on-surface-variant">Tax Treatment</span>
              <span className="font-headline font-bold text-primary text-sm">Regelbesteuerung</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-on-surface-variant">Next Declaration</span>
              <span className="font-headline font-bold text-sm">Apr 10, 2026</span>
            </div>
          </div>
        </div>
      </div>

      {/* Sold Vehicles P&L Table */}
      <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-6">
        <h3 className="font-headline font-bold text-lg mb-4">Per-Vehicle P&L (Sold)</h3>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px]">
            <thead>
              <tr className="border-b border-outline-variant/20">
                {["Vehicle", "Total Cost", "Sale Price", "Margin", "%", "Days"].map((h) => (
                  <th key={h} className="text-left py-3 px-3 text-xs uppercase tracking-widest text-on-surface-variant font-label">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {soldVehicles.map((v, i) => (
                <tr key={i} className="border-b border-outline-variant/10 hover:bg-surface-container-high/30 transition-colors">
                  <td className="py-3 px-3">
                    <span className="font-headline font-bold text-sm">{v.make} {v.model}</span>
                    <span className="text-xs text-on-surface-variant ml-2">{v.year}</span>
                  </td>
                  <td className="py-3 px-3 text-sm">€{v.totalCosts.toLocaleString()}</td>
                  <td className="py-3 px-3 text-sm font-bold">€{v.salePrice.toLocaleString()}</td>
                  <td className="py-3 px-3 text-sm font-bold text-emerald-400">+€{v.margin.toLocaleString()}</td>
                  <td className="py-3 px-3 text-sm text-primary font-bold">{v.marginPct}%</td>
                  <td className="py-3 px-3 text-sm text-on-surface-variant">{v.daysToSell}d</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
