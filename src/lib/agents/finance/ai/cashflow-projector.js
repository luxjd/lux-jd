/**
 * Cash Flow Projector — forecasts capital needs 4-8 weeks forward.
 */

/**
 * Project cash flow based on pipeline vehicles and their estimated timelines.
 */
export function projectCashFlow(vehicles, transactions, weeksAhead = 8) {
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

      // Estimate when customs duty is due (~45 days after purchase)
      if (daysInPipeline >= 40 && daysInPipeline < 47) {
        const duty = v.landedCost?.customsDutyEur || Math.round((v.purchasePriceEur || 80000) * 0.14);
        outflows += duty;
        events.push({ type: "CUSTOMS_DUTY", vehicle: `${v.make} ${v.model}`, amount: -duty });
      }

      // Estimate when VAT is due (~45 days)
      if (daysInPipeline >= 42 && daysInPipeline < 49) {
        const vat = v.landedCost?.importVatEur || Math.round((v.purchasePriceEur || 80000) * 0.22);
        outflows += vat;
        events.push({ type: "IMPORT_VAT", vehicle: `${v.make} ${v.model}`, amount: -vat, note: "Reclaimable" });
      }

      // Estimate when sale proceeds arrive (~75-90 days after purchase)
      if (daysInPipeline >= 70 && daysInPipeline < 77) {
        const salePrice = v.estimatedSaleEur || v.pricing?.deMarketMedian || 150000;
        inflows += salePrice;
        events.push({ type: "SALE_PROCEEDS", vehicle: `${v.make} ${v.model}`, amount: salePrice });
      }

      // VAT reclaim (~4-8 weeks after customs)
      if (daysInPipeline >= 70 && daysInPipeline < 77) {
        const vatReclaim = v.landedCost?.importVatEur || Math.round((v.purchasePriceEur || 80000) * 0.22);
        inflows += vatReclaim;
        events.push({ type: "VAT_RECLAIM", vehicle: `${v.make} ${v.model}`, amount: vatReclaim });
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

  return {
    projections,
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
