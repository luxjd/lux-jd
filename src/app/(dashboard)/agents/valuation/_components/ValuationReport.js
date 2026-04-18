"use client";

import { formatEur, formatEurCompact, formatJpy, formatKm } from "@/lib/format";

const fmt = formatEurCompact;
const fmtFull = (n) => formatEur(n, { dash: "€—" });
const RISK_COLORS = { LOW: "text-emerald-400 bg-emerald-400/10", MEDIUM: "text-amber-400 bg-amber-400/10", HIGH: "text-red-400 bg-red-400/10" };
const VERDICT_STYLES = { BUY: "bg-emerald-400/15 text-emerald-400 border-emerald-400/30", REVIEW: "bg-amber-400/15 text-amber-400 border-amber-400/30", PASS: "bg-slate-400/10 text-slate-400 border-slate-400/20" };
const VERDICT_ICONS = { BUY: "check_circle", REVIEW: "help", PASS: "block" };

export default function ValuationReport({ report, onNewValuation, onRerun, onSendToPipeline, pipelineSent }) {
  const r = report;
  const v = r.recommendation || { verdict: "REVIEW", verdictReasoning: "AI recommendation unavailable — review manually.", keyStrengths: [], keyConcerns: ["AI analysis incomplete"], maxBidJpy: null };
  const m = r.marginAnalysis || {};
  const lc = r.landedCost || {};
  const risk = r.riskAssessment || {};
  const cond = r.conditionAssessment || {};
  const mkt = r.marketAnalysis || {};
  const fx = r.fxAnalysis || {};
  const hist = r.historicalComparison || null;

  const handleExportPdf = () => {
    // Add print class for styling, then print
    document.body.classList.add("printing-report");
    window.print();
    // Remove after print dialog closes
    setTimeout(() => document.body.classList.remove("printing-report"), 1000);
  };

  return (
    <div className="space-y-6 print:space-y-4 print:text-black" id="valuation-report">
      {/* Print-only header */}
      <div className="hidden print:block print:mb-6">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-bold font-headline tracking-tight">LuxJD</h1>
            <p className="text-xs text-gray-400 uppercase tracking-widest mt-0.5">Vehicle Valuation Report</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-500 font-mono">{r.valuationId}</p>
            <p className="text-xs text-gray-400">{new Date(r.timestamp).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</p>
          </div>
        </div>
      </div>

      {/* Verdict Banner — or Pricing Guidance hero when no asking price was provided */}
      {r.pricingGuidanceMode ? (
        <PricingGuidanceHero
          suggestedMaxBidJpy={r.suggestedMaxBidJpy || m.deterministicMaxBidJpy || v.maxBidJpy}
          estimatedSalePrice={m.estimatedSalePrice || mkt.estimatedSalePrice}
          totalLandedCost={m.totalLandedCost || lc.totalLandedCostEur}
          grossMarginEur={m.grossMarginEur}
          fxRate={fx.rate}
          fxLive={fx.live}
        />
      ) : (
        <div className={`rounded-2xl border-2 p-8 text-center print:p-4 print:border print:border-gray-300 ${VERDICT_STYLES[v.verdict]}`}>
          <span className="material-symbols-outlined text-5xl mb-3 block print:text-3xl">{VERDICT_ICONS[v.verdict]}</span>
          <h2 className="font-headline text-2xl sm:text-4xl font-bold mb-2 print:text-2xl">{v.verdict}</h2>
          <p className="text-sm max-w-2xl mx-auto opacity-90">{v.verdictReasoning}</p>
          {v.maxBidJpy && (
            <div className="mt-4 inline-block px-4 py-2 rounded-xl bg-black/20 print:bg-gray-100">
              <span className="text-xs uppercase tracking-widest opacity-70">Max Recommended Bid</span>
              <p className="font-headline text-2xl font-bold">{formatJpy(v.maxBidJpy)}</p>
              {m.deterministicMaxBidJpy && m.deterministicMaxBidJpy !== v.maxBidJpy && (
                <p className="text-[10px] opacity-60">Deterministic: {formatJpy(m.deterministicMaxBidJpy)}</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Data Source Banner — tells the user exactly where pricing data came from */}
      {(() => {
        const isWebSearch = mkt.dataSource?.includes("Web search");
        const isAiOnly = mkt.dataSource?.includes("AI estimation") || (mkt.totalComparables === 0 && !isWebSearch);
        const isScraped = !isWebSearch && !isAiOnly && mkt.totalComparables > 0;

        if (isScraped) return (
          <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/5 p-4 flex items-center gap-3">
            <span className="material-symbols-outlined text-emerald-400">verified</span>
            <div className="flex-1">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-emerald-400/15 text-emerald-400 border border-emerald-400/20">
                <span className="material-symbols-outlined text-[11px]">storefront</span>
                Live Listing Data
              </span>
              <p className="text-xs text-on-surface-variant mt-1">
                Pricing based on {mkt.totalComparables} real comparable listings scraped from mobile.de and AutoScout24.
              </p>
            </div>
          </div>
        );

        if (isWebSearch) return (
          <div className="rounded-2xl border-2 border-blue-400/25 bg-blue-400/5 p-5 flex items-start gap-4">
            <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-blue-400/15 flex items-center justify-center">
              <span className="material-symbols-outlined text-xl text-blue-400">travel_explore</span>
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-headline font-bold text-sm text-blue-400">No Direct Listings Found</h3>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-blue-400/15 text-blue-400 border border-blue-400/20">
                  <span className="material-symbols-outlined text-[10px]">travel_explore</span>
                  Web Search Data
                </span>
              </div>
              <p className="text-xs text-on-surface-variant leading-relaxed">
                Scrapers were blocked, so pricing is based on real prices found via Google web search ({mkt.totalComparables} results). Confidence: {((m.marginConfidence || 0) * 100).toFixed(0)}%.
              </p>
              {mkt.dataSource && <p className="text-[10px] text-on-surface-variant/50 mt-1">{mkt.dataSource}</p>}
            </div>
          </div>
        );

        if (isAiOnly) return (
          <div className="rounded-2xl border-2 border-amber-400/30 bg-amber-400/5 p-5 flex items-start gap-4">
            <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-amber-400/15 flex items-center justify-center">
              <span className="material-symbols-outlined text-xl text-amber-400">search_off</span>
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-headline font-bold text-sm text-amber-400">No Listing Data Found</h3>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-amber-400/15 text-amber-400 border border-amber-400/20">
                  <span className="material-symbols-outlined text-[10px]">auto_awesome</span>
                  AI Estimate
                </span>
              </div>
              <p className="text-xs text-on-surface-variant leading-relaxed">
                No comparable listings or web prices found. All pricing is based on AI estimation with lower confidence ({((m.marginConfidence || 0) * 100).toFixed(0)}%). Verify manually before bidding.
              </p>
              {mkt.dataSource && <p className="text-[10px] text-on-surface-variant/50 mt-1">{mkt.dataSource}</p>}
            </div>
          </div>
        );

        return null;
      })()}

      {/* Overall Reasoning */}
      {r.reasoning && (
        <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-6 print:p-4 print:border-gray-200">
          <h3 className="font-headline font-bold text-lg mb-3 flex items-center gap-2">
            <span className="material-symbols-outlined text-primary print:hidden">psychology</span> Analysis Summary
          </h3>
          <p className="text-sm text-on-surface-variant leading-relaxed print:text-gray-700">{r.reasoning}</p>
        </div>
      )}

      {/* Vehicle + Confidence */}
      <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-6 print:p-4 print:border-gray-200">
        <div className="flex flex-col lg:flex-row justify-between gap-4">
          <div>
            <h3 className="font-headline text-2xl font-bold">
              {r.vehicleSummary.fullModelName || `${r.vehicleSummary.make} ${r.vehicleSummary.model}`}
            </h3>
            <p className="text-on-surface-variant">
              {r.vehicleSummary.year} &middot; {formatKm(r.vehicleSummary.mileageKm)} km &middot; {r.vehicleSummary.driveSide} &middot; {r.vehicleSummary.exteriorColor}
              {r.vehicleSummary.auctionGrade && ` · Grade ${r.vehicleSummary.auctionGrade}`}
            </p>
            {r.vehicleSummary.engineSpec && (
              <p className="text-xs text-on-surface-variant mt-1">{r.vehicleSummary.engineSpec}</p>
            )}
            {r.vehicleSummary.originalMsrp && (
              <p className="text-xs text-on-surface-variant">Original MSRP: {fmtFull(r.vehicleSummary.originalMsrp)} | Production: {r.vehicleSummary.productionYears}</p>
            )}
          </div>
          <div className="flex items-center gap-4 print:hidden">
            <div className="text-center">
              <svg width="56" height="56" viewBox="0 0 36 36" className="-rotate-90">
                <circle cx="18" cy="18" r="14" fill="none" stroke="rgba(65,71,84,0.3)" strokeWidth="3" />
                <circle cx="18" cy="18" r="14" fill="none" stroke={m.marginConfidence >= 0.80 ? "#34d399" : m.marginConfidence >= 0.65 ? "#fbbf24" : "#f87171"} strokeWidth="3" strokeDasharray={`${(m.marginConfidence || 0) * 88} 88`} strokeLinecap="round" />
              </svg>
              <p className="text-xs text-on-surface-variant mt-1">{((m.marginConfidence || 0) * 100).toFixed(0)}% conf</p>
            </div>
            {risk.overallRiskLevel && (
              <div className={`px-3 py-1.5 rounded-full text-xs font-bold uppercase ${RISK_COLORS[risk.overallRiskLevel]}`}>
                {risk.overallRiskLevel} RISK ({risk.overallRiskScore})
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Margin Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-4 print:grid-cols-4">
        {(() => {
          const isWebSearch = mkt.dataSource?.includes("Web search");
          const isAiOnly = mkt.dataSource?.includes("AI estimation") || (mkt.totalComparables === 0 && !isWebSearch);
          const borderColor = isAiOnly ? "border-amber-400/30" : isWebSearch ? "border-blue-400/30" : "border-outline-variant/10";
          return (
            <div className={`bg-surface-container rounded-2xl border p-5 print:p-3 print:border-gray-200 ${borderColor}`}>
              <p className="text-[10px] uppercase text-on-surface-variant tracking-widest mb-1">DE Market Value</p>
              <p className="font-headline text-2xl font-bold print:text-lg">{fmtFull(m.estimatedSalePrice)}</p>
              {isAiOnly ? (
                <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-amber-400/15 text-amber-400 border border-amber-400/20">
                  <span className="material-symbols-outlined text-[10px]">auto_awesome</span>
                  AI Estimate
                </span>
              ) : isWebSearch ? (
                <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-blue-400/15 text-blue-400 border border-blue-400/20">
                  <span className="material-symbols-outlined text-[10px]">travel_explore</span>
                  Web Search
                </span>
              ) : (
                <p className="text-xs text-on-surface-variant">{mkt.totalComparables} comparables</p>
              )}
            </div>
          );
        })()}
        <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-5 print:p-3 print:border-gray-200">
          <p className="text-[10px] uppercase text-on-surface-variant tracking-widest mb-1">Landed Cost</p>
          <p className="font-headline text-2xl font-bold print:text-lg">{fmtFull(m.totalLandedCost)}</p>
          <p className="text-xs text-on-surface-variant">excl. reclaimable VAT</p>
        </div>
        <div className={`bg-surface-container rounded-2xl border p-5 print:p-3 print:border-gray-400 ${(m.grossMarginEur || 0) >= 0 ? "border-emerald-400/30" : "border-red-400/30"}`}>
          <p className={`text-[10px] uppercase tracking-widest mb-1 ${(m.grossMarginEur || 0) >= 0 ? "text-emerald-400" : "text-red-400"}`}>Gross Margin</p>
          <p className={`font-headline text-2xl font-bold print:text-lg ${(m.grossMarginEur || 0) >= 0 ? "text-emerald-400" : "text-red-400"}`}>{fmtFull(m.grossMarginEur)}</p>
          <p className={`text-xs ${(m.grossMarginEur || 0) >= 0 ? "text-emerald-400" : "text-red-400"}`}>{m.grossMarginPct}%</p>
        </div>
        <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-5 print:p-3 print:border-gray-200">
          <p className="text-[10px] uppercase text-on-surface-variant tracking-widest mb-1">Annualized ROI</p>
          <p className="font-headline text-2xl font-bold print:text-lg">{m.annualizedRoi}%</p>
          <p className="text-xs text-on-surface-variant">{m.estimatedHoldDays}d hold</p>
        </div>
      </div>

      {/* Margin Scenarios */}
      <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-6 print:p-4 print:border-gray-200">
        <h3 className="font-headline font-bold text-lg mb-4">Margin Scenarios</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 print:grid-cols-3">
          {[
            { label: "Pessimistic (P25)", value: m.pessimisticMargin, sub: `Sale at ${fmtFull(mkt.priceStatistics?.p25)}` },
            { label: "Base (Median)", value: m.baseMargin, sub: `Sale at ${fmtFull(mkt.priceStatistics?.median)}` },
            { label: "Optimistic (P75)", value: m.optimisticMargin, sub: `Sale at ${fmtFull(mkt.priceStatistics?.p75)}` },
          ].map((s, i) => (
            <div key={i} className={`p-4 rounded-xl text-center ${i === 1 ? "bg-primary/5 border border-primary/20" : "bg-surface-container-high/30"}`}>
              <p className="text-[10px] uppercase tracking-widest text-on-surface-variant mb-1">{s.label}</p>
              <p className={`font-headline text-xl font-bold ${s.value > 0 ? "text-emerald-400" : "text-red-400"}`}>
                {s.value > 0 ? "+" : ""}{fmtFull(s.value)}
              </p>
              <p className="text-[10px] text-on-surface-variant mt-0.5">{s.sub}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Cost Breakdown + Condition */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 print:grid-cols-2 print:gap-4">
        {/* Cost Breakdown */}
        <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-6 print:p-4 print:border-gray-200">
          <h3 className="font-headline font-bold text-lg mb-4">Landed Cost Breakdown</h3>
          <div className="space-y-2">
            {[
              { label: `Purchase (${formatJpy(lc.purchasePriceJpy)})`, value: lc.purchasePriceEur, icon: "gavel" },
              { label: "Auction fees (4%)", value: lc.auctionFeesEur, icon: "receipt" },
              { label: "JP Transport", value: lc.jpTransportEur, icon: "local_shipping" },
              { label: "Export docs", value: lc.exportDocsEur, icon: "description" },
              { label: "Container freight", value: lc.freightEur, icon: "sailing" },
              { label: "Marine insurance (2%)", value: lc.insuranceEur, icon: "security" },
              { label: "Customs duty (10% CIF)", value: lc.customsDutyEur, icon: "account_balance" },
              { label: "Port handling", value: lc.portHandlingEur, icon: "inventory_2" },
              { label: `TUV inspection (${lc.tuvComplexity || "STD"})`, value: lc.tuvEstimatedEur, icon: "verified" },
              { label: "Registration", value: lc.registrationEur, icon: "badge" },
              { label: "DE Transport", value: lc.deTransportEur, icon: "local_shipping" },
              { label: "Detailing + prep", value: lc.detailingEur, icon: "auto_fix_high" },
              { label: "Photography", value: lc.photographyEur, icon: "photo_camera" },
            ].map((item, i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-outline-variant/10 last:border-0 print:py-1">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-on-surface-variant text-sm print:hidden">{item.icon}</span>
                  <span className="text-sm text-on-surface-variant">{item.label}</span>
                </div>
                <span className="text-sm font-mono font-bold">{fmtFull(item.value)}</span>
              </div>
            ))}
            <div className="flex items-center justify-between pt-3 mt-2 border-t-2 border-primary/30 print:border-gray-400">
              <span className="font-headline font-bold">Total Landed</span>
              <span className="font-headline font-bold text-lg">{fmtFull(lc.totalLandedCostEur)}</span>
            </div>
            <div className="flex items-center justify-between text-xs text-on-surface-variant">
              <span>Import VAT (reclaimable)</span>
              <span className="text-emerald-400 font-bold">+{fmtFull(lc.reclaimableVatEur)} back</span>
            </div>
            <div className="flex items-center justify-between text-xs text-on-surface-variant">
              <span>Cash outlay (incl. VAT)</span>
              <span className="font-bold">{fmtFull(lc.totalCashOutlayEur)}</span>
            </div>
            <div className="flex items-center justify-between text-xs text-on-surface-variant">
              <span>FX rate used (with {lc.fxBufferApplied}% buffer)</span>
              <span className="font-mono">¥{lc.fxRateUsed}/€</span>
            </div>
          </div>
        </div>

        {/* Condition Assessment */}
        <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-6 print:p-4 print:border-gray-200">
          <h3 className="font-headline font-bold text-lg mb-4">Condition Assessment</h3>
          <div className="flex items-center gap-4 mb-6">
            <div className="text-center">
              <p className="font-headline text-3xl font-bold">{cond.overallGradeNumeric}/10</p>
              <p className={`text-sm font-bold ${cond.overallGrade === "EXCELLENT" ? "text-emerald-400" : cond.overallGrade === "VERY_GOOD" ? "text-primary" : "text-amber-400"}`}>
                {(cond.overallGrade || "").replace("_", " ")}
              </p>
            </div>
            {cond.photoCount > 0 && <p className="text-xs text-on-surface-variant">{cond.photoCount} photos analyzed</p>}
            {cond.interiorOriginality && cond.interiorOriginality !== "UNKNOWN" && (
              <p className="text-xs px-2 py-0.5 rounded-full bg-surface-container-high text-on-surface-variant">
                Interior: {cond.interiorOriginality.replace(/_/g, " ").toLowerCase()}
              </p>
            )}
          </div>

          <div className="space-y-4">
            {[
              { label: "Exterior", score: cond.exteriorScore || 0, notes: cond.exteriorNotes || [] },
              { label: "Interior", score: cond.interiorScore || 0, notes: cond.interiorNotes || [] },
            ].map((area) => (
              <div key={area.label}>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-sm font-bold">{area.label}</span>
                  <span className="text-sm font-mono font-bold">{area.score}/10</span>
                </div>
                <div className="w-full h-2 bg-surface-container-high rounded-full overflow-hidden mb-2 print:hidden">
                  <div className={`h-full rounded-full ${area.score >= 8 ? "bg-emerald-400" : area.score >= 6 ? "bg-primary" : "bg-amber-400"}`} style={{ width: `${area.score * 10}%` }} />
                </div>
                <ul className="space-y-1">
                  {area.notes.map((n, i) => (
                    <li key={i} className="text-xs text-on-surface-variant flex items-start gap-1.5">
                      <span className="material-symbols-outlined text-xs mt-0.5 shrink-0 print:hidden">arrow_right</span>{n}
                    </li>
                  ))}
                </ul>
              </div>
            ))}

            {cond.mechanicalNotes?.length > 0 && (
              <div>
                <p className="text-sm font-bold mb-1">Mechanical</p>
                {cond.mechanicalNotes.map((n, i) => (
                  <p key={i} className="text-xs text-on-surface-variant">{n}</p>
                ))}
              </div>
            )}

            {cond.modificationNotes?.length > 0 && cond.modificationNotes[0] !== "No modifications detected" && (
              <div>
                <p className="text-sm font-bold mb-1">Modifications</p>
                {cond.modificationNotes.map((n, i) => (
                  <p key={i} className="text-xs text-emerald-400">{n}</p>
                ))}
              </div>
            )}

            {cond.visibleDamage?.length > 0 && (
              <div>
                <p className="text-sm font-bold mb-1 text-amber-400">Visible Damage</p>
                {cond.visibleDamage.map((n, i) => (
                  <p key={i} className="text-xs text-amber-400/80">{n}</p>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* TUV Risk Flags */}
      {cond.tuvRiskFlags?.length > 0 && (
        <div className="bg-surface-container rounded-2xl border border-red-400/20 p-6 print:p-4">
          <h3 className="font-headline font-bold text-lg mb-3 text-red-400 flex items-center gap-2">
            <span className="material-symbols-outlined print:hidden">gpp_bad</span> TUV Import Risk Flags
          </h3>
          <ul className="space-y-2">
            {cond.tuvRiskFlags.map((flag, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-red-400/90">
                <span className="material-symbols-outlined text-sm mt-0.5 shrink-0 print:hidden">error</span>
                {flag}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Panel Conditions (from auction sheet) */}
      {cond.panelConditions && Object.values(cond.panelConditions).some(v => v && v !== "Clean") && (
        <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-6 print:p-4 print:border-gray-200">
          <h3 className="font-headline font-bold text-lg mb-4">Panel Condition Map</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {Object.entries(cond.panelConditions).map(([panel, condition]) => (
              <div key={panel} className={`p-3 rounded-xl text-sm ${condition === "Clean" || !condition ? "bg-emerald-400/5 border border-emerald-400/15" : "bg-amber-400/5 border border-amber-400/15"}`}>
                <p className="text-xs font-bold text-on-surface-variant capitalize">{panel.replace(/_/g, " ")}</p>
                <p className={`text-xs mt-0.5 ${condition === "Clean" || !condition ? "text-emerald-400" : "text-amber-400"}`}>
                  {condition || "Clean"}
                </p>
              </div>
            ))}
          </div>
          {cond.accidentContradiction && (
            <div className="mt-3 p-3 rounded-xl bg-red-400/10 border border-red-400/20 text-sm text-red-400">
              <span className="material-symbols-outlined text-sm mr-1 print:hidden">warning</span>
              {cond.accidentContradiction}
            </div>
          )}
        </div>
      )}

      {/* FX Volatility Alert */}
      {fx.volatility?.alert && (
        <div className="bg-surface-container rounded-2xl border border-amber-400/20 p-6 print:p-4">
          <h3 className="font-headline font-bold text-lg mb-3 text-amber-400 flex items-center gap-2">
            <span className="material-symbols-outlined print:hidden">currency_exchange</span> FX Volatility Alert
          </h3>
          <p className="text-sm text-amber-400/90">{fx.volatility.alertReason}</p>
          <div className="flex gap-4 mt-2 text-xs text-on-surface-variant">
            {fx.volatility.movingAvg7d && <span>7d MA: ¥{fx.volatility.movingAvg7d}</span>}
            {fx.volatility.movingAvg30d && <span>30d MA: ¥{fx.volatility.movingAvg30d}</span>}
            {fx.volatility.stdDevPct != null && <span>30d Std Dev: {fx.volatility.stdDevPct}%</span>}
          </div>
        </div>
      )}

      {/* Risk Assessment */}
      {(risk.conditionRisk || risk.overallRiskScore) && (
      <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-6 print:p-4 print:border-gray-200">
        <h3 className="font-headline font-bold text-lg mb-4">Risk Assessment</h3>
        <div className="grid grid-cols-3 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3 print:grid-cols-6">
          {[
            { label: "Condition", ...(risk.conditionRisk || { score: "—", level: "MEDIUM" }), weight: "25%" },
            { label: "Market", ...(risk.marketRisk || { score: "—", level: "MEDIUM" }), weight: "25%" },
            { label: "Currency", ...(risk.currencyRisk || { score: "—", level: "MEDIUM" }), weight: "20%" },
            { label: "Provenance", ...(risk.provenanceRisk || { score: "—", level: "MEDIUM" }), weight: "15%" },
            { label: "TUV", ...(risk.tuvRisk || { score: "—", level: "MEDIUM" }), weight: "10%" },
            { label: "Capital", ...(risk.capitalRisk || { score: "—", level: "MEDIUM" }), weight: "5%" },
          ].map((rd) => (
            <div key={rd.label} className={`p-4 rounded-xl text-center print:p-2 ${RISK_COLORS[rd.level] || RISK_COLORS.MEDIUM}`}>
              <p className="font-headline text-2xl font-bold print:text-lg">{rd.score}/5</p>
              <p className="text-xs font-bold">{rd.label}</p>
              <p className="text-[10px] opacity-70 mt-0.5">{rd.level || "—"} · {rd.weight}</p>
              {rd.reasoning && <p className="text-[9px] opacity-60 mt-1 hidden print:block">{rd.reasoning}</p>}
            </div>
          ))}
        </div>
      </div>
      )}

      {/* Strengths & Concerns */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 print:grid-cols-2 print:gap-4">
        <div className="bg-surface-container rounded-2xl border border-emerald-400/20 p-6 print:p-4">
          <h3 className="font-headline font-bold text-lg mb-3 text-emerald-400 flex items-center gap-2">
            <span className="material-symbols-outlined print:hidden">thumb_up</span> Key Strengths
          </h3>
          <ul className="space-y-2">
            {v.keyStrengths.map((s, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <span className="material-symbols-outlined text-emerald-400 text-sm mt-0.5 shrink-0 print:hidden">check</span>
                {s}
              </li>
            ))}
          </ul>
        </div>
        <div className="bg-surface-container rounded-2xl border border-amber-400/20 p-6 print:p-4">
          <h3 className="font-headline font-bold text-lg mb-3 text-amber-400 flex items-center gap-2">
            <span className="material-symbols-outlined print:hidden">warning</span> Key Concerns
          </h3>
          <ul className="space-y-2">
            {v.keyConcerns.length > 0 ? v.keyConcerns.map((c, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <span className="material-symbols-outlined text-amber-400 text-sm mt-0.5 shrink-0 print:hidden">priority_high</span>
                {c}
              </li>
            )) : (
              <li className="text-sm text-on-surface-variant">No significant concerns identified</li>
            )}
          </ul>
        </div>
      </div>

      {/* Known Issues (from enrichment) */}
      {r.vehicleSummary.knownIssues?.length > 0 && (
        <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-6 print:p-4 print:border-gray-200">
          <h3 className="font-headline font-bold text-lg mb-3 flex items-center gap-2">
            <span className="material-symbols-outlined text-on-surface-variant print:hidden">build</span> Known Model Issues
          </h3>
          <ul className="space-y-2">
            {r.vehicleSummary.knownIssues.map((issue, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-on-surface-variant">
                <span className="material-symbols-outlined text-sm mt-0.5 shrink-0 print:hidden">info</span>
                {issue}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Action Items (REVIEW only) */}
      {v.actionItems?.length > 0 && (
        <div className="bg-surface-container rounded-2xl border border-primary/20 p-6 print:p-4">
          <h3 className="font-headline font-bold text-lg mb-3 text-primary flex items-center gap-2">
            <span className="material-symbols-outlined print:hidden">checklist</span> Action Items to Move to BUY
          </h3>
          <ul className="space-y-2">
            {v.actionItems.map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <span className="material-symbols-outlined text-primary text-sm mt-0.5 shrink-0 print:hidden">radio_button_unchecked</span>
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Historical Comparison */}
      {hist && (
        <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-6 print:p-4 print:border-gray-200">
          <h3 className="font-headline font-bold text-lg mb-3 flex items-center gap-2">
            <span className="material-symbols-outlined text-secondary print:hidden">history</span> Historical Context
          </h3>
          <p className="text-sm text-on-surface-variant">{hist.summary}</p>
          {hist.avgMarginEur != null && (
            <div className="flex gap-4 mt-3">
              <div className="px-3 py-1.5 rounded-lg bg-surface-container-high text-xs">
                <span className="text-on-surface-variant">Avg Margin:</span> <span className="font-bold">{fmtFull(hist.avgMarginEur)}</span>
              </div>
              <div className="px-3 py-1.5 rounded-lg bg-surface-container-high text-xs">
                <span className="text-on-surface-variant">Past Verdicts:</span>{" "}
                <span className="text-emerald-400 font-bold">{hist.verdictBreakdown?.buy || 0} BUY</span>{" "}
                <span className="text-amber-400 font-bold">{hist.verdictBreakdown?.review || 0} REV</span>{" "}
                <span className="text-slate-400 font-bold">{hist.verdictBreakdown?.pass || 0} PASS</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Market Data Section — 3 states: scraped listings / web search results / AI estimation */}
      {(() => {
        const isWebSearch = mkt.dataSource?.includes("Web search");
        const isAiOnly = mkt.dataSource?.includes("AI estimation") || ((!r.comparableListings || r.comparableListings.length === 0) && !isWebSearch);
        const hasListings = r.comparableListings?.length > 0;

        // ── State 1: Real scraped listings ──
        if (hasListings && !isWebSearch) return (
          <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-6 print:p-4 print:border-gray-200">
            <h3 className="font-headline font-bold text-lg mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-emerald-400 text-xl">storefront</span>
              Comparable Listings ({r.comparableListings.length})
              {mkt.outliersRemoved > 0 && <span className="text-xs font-normal text-on-surface-variant ml-2">({mkt.outliersRemoved} outliers removed)</span>}
              {mkt.searchCriteria?.searchWidened && <span className="text-xs font-normal text-amber-400 ml-2">(widened search)</span>}
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-emerald-400/10 text-emerald-400 border border-emerald-400/20 ml-auto">
                <span className="material-symbols-outlined text-[10px]">verified</span>
                Live Data
              </span>
            </h3>
            <FindCarLinks searchUrls={mkt.searchUrls} />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px]">
                <thead>
                  <tr className="border-b border-outline-variant/20 print:border-gray-300">
                    {["Vehicle", "Price", "Mileage", "Location", "Platform"].map((h) => (
                      <th key={h} className="text-left py-2 px-3 text-[10px] uppercase tracking-widest text-on-surface-variant">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {r.comparableListings.map((c, i) => (
                    <tr key={c.id || i} className="border-b border-outline-variant/10 hover:bg-surface-container-high/30 print:border-gray-100">
                      <td className="py-2 px-3 text-sm font-bold">{c.title || "—"}</td>
                      <td className="py-2 px-3 text-sm font-mono">{fmtFull(c.price)}</td>
                      <td className="py-2 px-3 text-sm text-on-surface-variant">{c.mileage && c.mileage < 1000000 ? `${formatKm(c.mileage)} km` : "—"}</td>
                      <td className="py-2 px-3 text-sm text-on-surface-variant">{c.location || "—"}</td>
                      <td className="py-2 px-3 text-sm text-on-surface-variant">{c.platform || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );

        // ── State 2: Web search results (real prices from Google) ──
        if (hasListings && isWebSearch) return (
          <div className="bg-surface-container rounded-2xl border border-blue-400/20 p-6 print:p-4 print:border-gray-200">
            <h3 className="font-headline font-bold text-lg mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-blue-400 text-xl">travel_explore</span>
              Web Search Results ({r.comparableListings.length})
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-blue-400/10 text-blue-400 border border-blue-400/20 ml-auto">
                <span className="material-symbols-outlined text-[10px]">travel_explore</span>
                Web Search
              </span>
            </h3>
            <p className="text-xs text-on-surface-variant mb-4">
              Scrapers were blocked — these prices were found via Google search. Fewer details available than direct scraping.
            </p>
            <FindCarLinks searchUrls={mkt.searchUrls} />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[500px]">
                <thead>
                  <tr className="border-b border-outline-variant/20">
                    {["Vehicle", "Price", "Source"].map((h) => (
                      <th key={h} className="text-left py-2 px-3 text-[10px] uppercase tracking-widest text-on-surface-variant">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {r.comparableListings.map((c, i) => (
                    <tr key={c.id || i} className="border-b border-outline-variant/10 hover:bg-surface-container-high/30">
                      <td className="py-2 px-3 text-sm font-bold">{c.title || "—"}</td>
                      <td className="py-2 px-3 text-sm font-mono">{fmtFull(c.price)}</td>
                      <td className="py-2 px-3 text-sm text-on-surface-variant">{c.platform || "web"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );

        // ── State 3: Pure AI estimation (no real data) ──
        return (
          <div className="bg-surface-container rounded-2xl border border-amber-400/20 p-6 print:p-4 print:border-gray-200">
            <div className="text-center py-6">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-amber-400/10 mb-4">
                <span className="material-symbols-outlined text-3xl text-amber-400">auto_awesome</span>
              </div>
              <h3 className="font-headline font-bold text-lg mb-2">AI-Powered Price Estimation</h3>
              <p className="text-sm text-on-surface-variant max-w-md mx-auto mb-4">
                No listings or web prices could be found. This estimate is based on AI knowledge of the German luxury car market — not real-time data.
              </p>
              <div className="inline-flex items-center gap-3 px-5 py-3 rounded-xl bg-amber-400/10 border border-amber-400/20">
                <div className="text-left">
                  <p className="text-sm font-bold text-on-surface">{fmtFull(m.estimatedSalePrice)}</p>
                  <p className="text-[10px] text-amber-400 font-bold uppercase">Estimated Market Value</p>
                </div>
                <div className="w-px h-8 bg-outline-variant/20" />
                <div className="text-left">
                  <p className="text-sm font-bold text-on-surface">{((m.marginConfidence || 0) * 100).toFixed(0)}%</p>
                  <p className="text-[10px] text-amber-400 font-bold uppercase">Confidence</p>
                </div>
              </div>
              <p className="text-[10px] text-on-surface-variant/50 mt-3">
                {mkt.dataSource || "Claude AI estimation"} &middot; Verify manually before bidding
              </p>
              <div className="mt-4 flex justify-center">
                <FindCarLinks searchUrls={mkt.searchUrls} />
              </div>
            </div>
          </div>
        );
      })()}

      {/* Price Adjustments */}
      {mkt.priceAdjustments?.length > 0 && (
        <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-6 print:p-4 print:border-gray-200">
          <h3 className="font-headline font-bold text-lg mb-4">Price Adjustments Applied</h3>
          <div className="space-y-2">
            {mkt.priceAdjustments.map((a, i) => (
              <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-surface-container-high/30 print:p-2">
                <div>
                  <p className="text-sm font-bold">{a.factor}</p>
                  <p className="text-xs text-on-surface-variant">{a.reasoning}</p>
                </div>
                <span className={`text-sm font-mono font-bold whitespace-nowrap ml-4 ${(a.adjustment_eur || a.adjustmentEur || 0) >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {(a.adjustment_eur || a.adjustmentEur || 0) >= 0 ? "+" : ""}{fmtFull(a.adjustment_eur || a.adjustmentEur)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions (hide in print) */}
      <div className="flex flex-col sm:flex-row gap-4 print:hidden">
        {!pipelineSent && (
          <button onClick={onSendToPipeline}
            className="flex-1 py-4 bg-primary text-on-primary font-headline font-bold text-lg rounded-xl hover:shadow-[0_0_30px_rgba(248,113,113,0.5)] transition-all flex items-center justify-center gap-2">
            <span className="material-symbols-outlined">send</span>
            Send to Pipeline
          </button>
        )}
        {pipelineSent && (
          <a href="/pipeline"
            className="flex-1 py-4 bg-emerald-400/15 text-emerald-400 border-2 border-emerald-400/30 font-headline font-bold text-lg rounded-xl hover:bg-emerald-400/25 transition-all flex items-center justify-center gap-2">
            <span className="material-symbols-outlined">check_circle</span>
            Sent — View Pipeline
          </a>
        )}
        <button onClick={onRerun}
          className="flex-1 py-4 bg-secondary/15 text-secondary border-2 border-secondary/30 font-headline font-bold text-lg rounded-xl hover:bg-secondary/25 transition-all flex items-center justify-center gap-2">
          <span className="material-symbols-outlined">replay</span>
          Rerun Valuation
        </button>
        <button onClick={onNewValuation}
          className="flex-1 py-4 border-2 border-outline-variant/30 text-on-surface font-headline font-bold text-lg rounded-xl hover:border-primary/50 transition-all flex items-center justify-center gap-2">
          <span className="material-symbols-outlined">add</span>
          New Valuation
        </button>
        <button onClick={handleExportPdf}
          className="flex-1 py-4 border-2 border-outline-variant/30 text-on-surface-variant font-headline font-bold text-lg rounded-xl hover:border-primary/50 transition-all flex items-center justify-center gap-2">
          <span className="material-symbols-outlined">picture_as_pdf</span>
          Export PDF
        </button>
      </div>

      {/* Processing meta */}
      <p className="text-center text-xs text-on-surface-variant">
        {r.aiPowered ? (
          <span className="inline-flex items-center gap-1 text-emerald-400">
            <span className="material-symbols-outlined text-xs">auto_awesome</span> AI-Powered
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-amber-400">
            <span className="material-symbols-outlined text-xs">calculate</span> Mock Estimation
          </span>
        )}
        {" "}&middot; {r.processingTimeSeconds}s &middot; {r.valuationId} &middot; {new Date(r.timestamp).toLocaleString()}
        {r.fxLive && <span> &middot; <span className="text-emerald-400">Live FX</span></span>}
        {fx.volatility?.stdDevPct != null && <span> &middot; FX Vol: {fx.volatility.stdDevPct}%</span>}
      </p>
    </div>
  );
}

function PricingGuidanceHero({ suggestedMaxBidJpy, estimatedSalePrice, totalLandedCost, grossMarginEur, fxRate, fxLive }) {
  const hasBid = suggestedMaxBidJpy && suggestedMaxBidJpy > 0;
  return (
    <div className="rounded-2xl border-2 border-primary/30 bg-gradient-to-br from-primary/10 to-primary/5 p-8 text-center print:p-4 print:border print:border-gray-300">
      <span className="material-symbols-outlined text-5xl mb-3 block text-primary print:text-3xl">auto_awesome</span>
      <p className="text-xs uppercase tracking-widest text-primary/80 font-bold mb-2">Pricing Guidance</p>
      {hasBid ? (
        <>
          <h2 className="font-headline text-3xl sm:text-5xl font-bold mb-2 print:text-2xl text-on-surface">
            Pay up to {formatJpy(suggestedMaxBidJpy)}
          </h2>
          <p className="text-sm max-w-2xl mx-auto text-on-surface-variant mb-5">
            The highest JPY bid that still hits your target margin, given the live German market value and landed costs to get this vehicle sale-ready in Germany.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-2xl mx-auto text-left">
            <div className="px-4 py-3 rounded-xl bg-black/20 print:bg-gray-100">
              <p className="text-[10px] uppercase tracking-widest text-on-surface-variant mb-1">DE market value</p>
              <p className="font-mono font-bold text-on-surface">{fmtFull(estimatedSalePrice)}</p>
            </div>
            <div className="px-4 py-3 rounded-xl bg-black/20 print:bg-gray-100">
              <p className="text-[10px] uppercase tracking-widest text-on-surface-variant mb-1">Landed cost at max bid</p>
              <p className="font-mono font-bold text-on-surface">{fmtFull(totalLandedCost)}</p>
            </div>
            <div className="px-4 py-3 rounded-xl bg-black/20 print:bg-gray-100">
              <p className="text-[10px] uppercase tracking-widest text-on-surface-variant mb-1">Target margin at ceiling</p>
              <p className="font-mono font-bold text-emerald-400">{fmtFull(grossMarginEur)}</p>
            </div>
          </div>
          {fxRate && (
            <p className="text-[10px] text-on-surface-variant/70 mt-4">
              At FX {fxRate?.toFixed?.(2) || fxRate} JPY/€ {fxLive ? "(live)" : "(cached)"} &middot; Bid above this price and the margin target slips
            </p>
          )}
        </>
      ) : (
        <>
          <h2 className="font-headline text-2xl sm:text-3xl font-bold mb-2 text-on-surface">No profitable bid possible</h2>
          <p className="text-sm max-w-2xl mx-auto text-on-surface-variant">
            Even at the lowest realistic purchase price, landed costs plus the target margin exceed the German market value for this vehicle. Consider a cheaper variant, different year, or skip this listing.
          </p>
        </>
      )}
    </div>
  );
}

// Defensive: reports saved before the URL fix still carry /lst/<make>/<model-slug> URLs
// that 404 when clicked (AutoScout24 rotates slugs). Rewrite to the stable make+search form.
function sanitizeAutoScout24Url(url) {
  if (!url || typeof url !== "string") return url;
  try {
    const u = new URL(url);
    if (!u.hostname.includes("autoscout24")) return url;
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts[0] === "lst" && parts.length >= 3) {
      const make = parts[1];
      const modelFromSlug = parts.slice(2).join(" ").replace(/-/g, " ");
      u.pathname = `/lst/${make}`;
      if (!u.searchParams.get("search")) u.searchParams.set("search", modelFromSlug);
    }
    return u.toString();
  } catch {
    return url;
  }
}

function FindCarLinks({ searchUrls }) {
  if (!searchUrls?.mobile_de && !searchUrls?.autoscout24) return null;
  const autoscoutUrl = sanitizeAutoScout24Url(searchUrls?.autoscout24);
  return (
    <div className="flex flex-wrap gap-2 mb-4 print:hidden">
      {searchUrls?.mobile_de && (
        <a
          href={searchUrls.mobile_de}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-emerald-400/10 text-emerald-400 border border-emerald-400/20 hover:bg-emerald-400/20 transition"
        >
          <span className="material-symbols-outlined text-sm">open_in_new</span>
          Find on mobile.de
        </a>
      )}
      {autoscoutUrl && (
        <a
          href={autoscoutUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-blue-400/10 text-blue-400 border border-blue-400/20 hover:bg-blue-400/20 transition"
        >
          <span className="material-symbols-outlined text-sm">open_in_new</span>
          Find on AutoScout24
        </a>
      )}
    </div>
  );
}
