import { dashboardMetrics, vehicles, agents, recentActivity, PIPELINE_STAGES } from "@/lib/mock-data";

export default function DashboardPage() {
  const stageCount = PIPELINE_STAGES.map((s) => ({
    ...s,
    count: vehicles.filter((v) => v.currentStage === s.key).length,
  }));

  return (
    <div className="space-y-6">
      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Active Vehicles", value: dashboardMetrics.activeVehicles, icon: "directions_car", color: "text-primary", trend: "+2 this week" },
          { label: "Portfolio Value", value: `€${(dashboardMetrics.portfolioValue / 1000).toFixed(0)}K`, icon: "account_balance_wallet", color: "text-secondary", trend: "+€120K" },
          { label: "Unrealized P&L", value: `€${(dashboardMetrics.unrealizedPL / 1000).toFixed(0)}K`, icon: "trending_up", color: "text-emerald-400", trend: "27.8% avg margin" },
          { label: "Leads This Month", value: dashboardMetrics.leadsThisMonth, icon: "people", color: "text-primary", trend: "6 converted" },
        ].map((m, i) => (
          <div key={i} className="bg-surface-container rounded-2xl border border-outline-variant/10 p-5">
            <div className="flex items-center justify-between mb-3">
              <span className={`material-symbols-outlined ${m.color} text-2xl`}>{m.icon}</span>
              <span className="text-[10px] uppercase tracking-widest text-on-surface-variant">{m.label}</span>
            </div>
            <p className="font-headline text-3xl font-bold mb-1">{m.value}</p>
            <p className="text-xs text-on-surface-variant">{m.trend}</p>
          </div>
        ))}
      </div>

      {/* Pipeline Summary + Agent Status */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Pipeline Mini */}
        <div className="lg:col-span-2 bg-surface-container rounded-2xl border border-outline-variant/10 p-6">
          <h3 className="font-headline font-bold text-lg mb-4">Pipeline Overview</h3>
          <div className="grid grid-cols-5 lg:grid-cols-10 gap-2">
            {stageCount.map((s) => (
              <div key={s.key} className="text-center">
                <div className={`w-10 h-10 rounded-full ${s.bg} flex items-center justify-center mx-auto mb-1.5`}>
                  <span className={`material-symbols-outlined text-lg ${s.color}`}>{s.icon}</span>
                </div>
                <p className="font-headline text-lg font-bold">{s.count}</p>
                <p className="text-[9px] text-on-surface-variant uppercase tracking-wider leading-tight">{s.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Quick Stats */}
        <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-6">
          <h3 className="font-headline font-bold text-lg mb-4">This Month</h3>
          <div className="space-y-4">
            {[
              { label: "Vehicles Sold", value: dashboardMetrics.vehiclesSoldThisMonth, icon: "paid" },
              { label: "Total Revenue", value: `€${(dashboardMetrics.totalRevenue / 1000).toFixed(0)}K`, icon: "payments" },
              { label: "Avg Days to Sell", value: `${dashboardMetrics.avgDaysToSell}d`, icon: "schedule" },
              { label: "Avg Margin", value: `${dashboardMetrics.avgMarginPct}%`, icon: "trending_up" },
            ].map((s, i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-on-surface-variant text-lg">{s.icon}</span>
                  <span className="text-sm text-on-surface-variant">{s.label}</span>
                </div>
                <span className="font-headline font-bold text-sm">{s.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Agent Status + Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Agent Status */}
        <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-6">
          <h3 className="font-headline font-bold text-lg mb-4">Agent Status</h3>
          <div className="space-y-3">
            {agents.map((a) => (
              <div key={a.id} className="flex items-center justify-between p-3 rounded-xl bg-surface-container-high/30">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <span className="material-symbols-outlined text-on-surface-variant">{a.icon}</span>
                    <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-surface-container ${
                      a.status === "ONLINE" ? "bg-emerald-400" : a.status === "PROCESSING" ? "bg-amber-400 animate-pulse" : "bg-slate-500"
                    }`} />
                  </div>
                  <div>
                    <p className="text-sm font-medium">{a.name}</p>
                    <p className="text-xs text-on-surface-variant">{a.lastAction}</p>
                  </div>
                </div>
                <span className="text-[10px] text-on-surface-variant">{a.time}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-6">
          <h3 className="font-headline font-bold text-lg mb-4">Recent Activity</h3>
          <div className="space-y-3">
            {recentActivity.map((a) => (
              <div key={a.id} className="flex items-start gap-3 p-3 rounded-xl hover:bg-surface-container-high/30 transition-colors">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-primary text-sm">{a.icon}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm">{a.message}</p>
                  <p className="text-xs text-on-surface-variant mt-0.5">{a.agent} &middot; {a.time}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
