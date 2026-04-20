/**
 * Cash Flow Projector — forecasts capital needs 4-8 weeks forward.
 *
 * Docx §6.4.2 Function 3: "Project cash requirements 4–8 weeks forward based on
 * pipeline status, **expected sale timing, and upcoming purchase opportunities**.
 * Alert when cash reserves drop below safety threshold."
 *
 * Docx §6.4.2 Function 2: Portfolio Dashboard must show "**expected revenue by
 * week/month**" — delivered as `expectedRevenue.{byWeek, byMonth}` on the
 * projection return.
 */

/**
 * @param {Array} vehicles       — vehicles already in pipeline
 * @param {Array} transactions   — all recorded transactions
 * @param {number} [weeksAhead=8]
 * @param {Array} [upcomingPurchases=[]] — pending Orchestrator AUTO_APPROVE
 *   commitments not yet reflected in transactions. Each entry:
 *     { vehicleName, expectedPurchaseDate (ISO), expectedOutlayEur, opportunityId? }
 */
export function projectCashFlow(vehicles, transactions, weeksAhead = 8, upcomingPurchases = []) {
  const projections = [];
  const now = new Date();
  let runningBalance = 0;

  // Calculate current balance from all transactions
  for (const txn of transactions) {
    if (txn.category === "SALE_PROCEEDS") runningBalance += txn.amountEur;
    else runningBalance -= txn.amountEur;
  }

  for (let week = 0; week < weeksAhead; week++) {
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() + week * 7);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);

    let inflows = 0;
    let outflows = 0;
    const events = [];

    for (const v of vehicles) {
      const enteredAt = new Date(v.addedAt || v.stageHistory?.[0]?.enteredAt || now);
      const daysInPipeline = (weekStart - enteredAt) / (1000 * 60 * 60 * 24);

      // Estimate when customs duty is due (~45 days after purchase).
      // Spec §3.1 / §4.3: EU customs duty = 10% of CIF. Fallback percentages
      // aligned with the rest of the system (JP Sourcing landed-cost calc,
      // Logistics customs declaration, regulatory baseline).
      if (daysInPipeline >= 40 && daysInPipeline < 47) {
        const duty = v.landedCost?.customsDutyEur || Math.round((v.purchasePriceEur || 80000) * 0.10);
        outflows += duty;
        events.push({ type: "CUSTOMS_DUTY", vehicle: `${v.make} ${v.model}`, amount: -duty });
      }

      // Estimate when VAT is due (~45 days). Spec: German import VAT = 19%.
      if (daysInPipeline >= 42 && daysInPipeline < 49) {
        const vat = v.landedCost?.importVatEur || Math.round((v.purchasePriceEur || 80000) * 0.19);
        outflows += vat;
        events.push({ type: "IMPORT_VAT", vehicle: `${v.make} ${v.model}`, amount: -vat, note: "Reclaimable" });
      }

      // Estimate when sale proceeds arrive (~75-90 days after purchase)
      if (daysInPipeline >= 70 && daysInPipeline < 77) {
        const salePrice = v.estimatedSaleEur || v.pricing?.deMarketMedian || 150000;
        inflows += salePrice;
        events.push({ type: "SALE_PROCEEDS", vehicle: `${v.make} ${v.model}`, amount: salePrice });
      }

      // VAT reclaim (~4-8 weeks after customs) — same 19% basis.
      if (daysInPipeline >= 70 && daysInPipeline < 77) {
        const vatReclaim = v.landedCost?.importVatEur || Math.round((v.purchasePriceEur || 80000) * 0.19);
        inflows += vatReclaim;
        events.push({ type: "VAT_RECLAIM", vehicle: `${v.make} ${v.model}`, amount: vatReclaim });
      }
    }

    // Docx §6.4.2.3: project outflows for upcoming purchase opportunities.
    // Any Orchestrator-approved candidate whose auction/purchase date falls
    // within this week contributes its expected cash outlay.
    for (const up of upcomingPurchases) {
      const purchaseDate = up.expectedPurchaseDate
        ? new Date(up.expectedPurchaseDate)
        : null;
      if (!purchaseDate || isNaN(purchaseDate.getTime())) continue;
      if (purchaseDate >= weekStart && purchaseDate < weekEnd) {
        const outlay = Number(up.expectedOutlayEur) || Number(up.maxBidEur) || 80000;
        outflows += outlay;
        events.push({
          type: "UPCOMING_PURCHASE",
          vehicle: up.vehicleName || "Pending purchase",
          amount: -outlay,
          note: `Orchestrator-approved, not yet committed${up.opportunityId ? ` (opp ${up.opportunityId})` : ""}`,
        });
      }
    }

    runningBalance += inflows - outflows;

    projections.push({
      week: week + 1,
      weekStarting: weekStart.toISOString().split("T")[0],
      inflows,
      outflows,
      netFlow: inflows - outflows,
      runningBalance: Math.round(runningBalance),
      events,
      alert: runningBalance < 0 ? "NEGATIVE_BALANCE" : runningBalance < 50000 ? "LOW_BALANCE" : null,
    });
  }

  // ── Expected revenue rollup (docx §6.4.2 Function 2: "by week/month") ──
  // Sale proceeds only — VAT reclaim is a cash-flow item but not revenue.
  const byWeek = projections.map((p) => {
    const saleEvents = p.events.filter((e) => e.type === "SALE_PROCEEDS");
    const revenueEur = saleEvents.reduce((s, e) => s + e.amount, 0);
    return {
      week: p.week,
      weekStarting: p.weekStarting,
      revenueEur,
      vehicleCount: saleEvents.length,
      vehicles: saleEvents.map((e) => e.vehicle),
    };
  });

  const byMonth = {};
  for (const w of byWeek) {
    const monthKey = w.weekStarting.substring(0, 7); // YYYY-MM
    if (!byMonth[monthKey]) byMonth[monthKey] = { revenueEur: 0, vehicleCount: 0, vehicles: [] };
    byMonth[monthKey].revenueEur += w.revenueEur;
    byMonth[monthKey].vehicleCount += w.vehicleCount;
    byMonth[monthKey].vehicles.push(...w.vehicles);
  }

  return {
    projections,
    expectedRevenue: {
      byWeek,
      byMonth,
      totalEur: byWeek.reduce((s, w) => s + w.revenueEur, 0),
      horizonWeeks: weeksAhead,
    },
    upcomingPurchasesProjected: upcomingPurchases.filter((up) => {
      const d = up.expectedPurchaseDate ? new Date(up.expectedPurchaseDate) : null;
      if (!d || isNaN(d.getTime())) return false;
      const weeksOut = (d.getTime() - now.getTime()) / (7 * 24 * 60 * 60 * 1000);
      return weeksOut >= 0 && weeksOut < weeksAhead;
    }).length,
    summary: {
      totalInflows: projections.reduce((s, p) => s + p.inflows, 0),
      totalOutflows: projections.reduce((s, p) => s + p.outflows, 0),
      endingBalance: projections[projections.length - 1]?.runningBalance || 0,
      lowestBalance: Math.min(...projections.map((p) => p.runningBalance)),
      hasAlert: projections.some((p) => p.alert),
    },
    generatedAt: new Date().toISOString(),
  };
}
