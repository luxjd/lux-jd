/**
 * Valuation Engine — generates realistic valuation reports based on vehicle input.
 *
 * In production, this would:
 * - Call Claude Vision API for photo/auction sheet analysis
 * - Scrape mobile.de + AutoScout24 for live comparables
 * - Fetch live FX rates
 * - Use Claude Sonnet for risk assessment + recommendation
 *
 * For now: generates realistic mock data seeded by the input parameters.
 */

const BRAND_DATA = {
  Ferrari: { avgMsrp: 250000, depRate: 0.12, demandScore: 85, tuvRisk: 1, prestige: "EXOTIC" },
  "Mercedes-AMG": { avgMsrp: 150000, depRate: 0.18, demandScore: 72, tuvRisk: 1, prestige: "SPORTS" },
  Porsche: { avgMsrp: 180000, depRate: 0.14, demandScore: 90, tuvRisk: 1, prestige: "SPORTS" },
  Lamborghini: { avgMsrp: 300000, depRate: 0.15, demandScore: 80, tuvRisk: 1, prestige: "EXOTIC" },
  Bentley: { avgMsrp: 220000, depRate: 0.22, demandScore: 52, tuvRisk: 1, prestige: "GRAND_TOURER" },
  "Aston Martin": { avgMsrp: 200000, depRate: 0.20, demandScore: 58, tuvRisk: 2, prestige: "GRAND_TOURER" },
  Jaguar: { avgMsrp: 100000, depRate: 0.25, demandScore: 55, tuvRisk: 2, prestige: "SPORTS" },
  Maserati: { avgMsrp: 160000, depRate: 0.28, demandScore: 42, tuvRisk: 2, prestige: "GRAND_TOURER" },
  "BMW M": { avgMsrp: 120000, depRate: 0.20, demandScore: 71, tuvRisk: 1, prestige: "SPORTS" },
  "Range Rover": { avgMsrp: 140000, depRate: 0.24, demandScore: 65, tuvRisk: 2, prestige: "SUV" },
};

const COLOR_PREMIUMS = {
  "Rosso Corsa": 1.05, "Rosso Portofino": 1.04, "Blu Pozzi": 1.08,
  "GT Silver": 1.02, "Shark Blue": 1.06, "Racing Yellow": 1.05, "Miami Blue": 1.08,
  "AMG Green Hell Magno": 1.12, "Nardo Grey": 1.06, "Selenite Grey": 1.01,
  "Arancio Borealis": 1.06, "Verde Mantis": 1.08,
  "Isle of Man Green": 1.06, "Frozen variants": 1.08,
};

const FX_RATE = 166.80;
const FX_BUFFER = 0.03;

export function generateValuation(input) {
  const brand = BRAND_DATA[input.make] || BRAND_DATA["BMW M"];
  const age = 2026 - input.year;
  const mileageFactor = Math.max(0.7, 1 - (input.mileageKm / 100000) * 0.3);
  const ageFactor = Math.max(0.5, 1 - age * brand.depRate * 0.4);
  const colorMod = COLOR_PREMIUMS[input.exteriorColor] || 1.0;
  const historyMod = input.serviceHistory === "FULL_DEALER" ? 1.08 : input.serviceHistory === "PARTIAL_DEALER" ? 1.03 : 1.0;
  const accidentMod = input.accidentHistory ? 0.85 : 1.0;
  const lhdMod = input.driveSide === "LHD" ? 1.03 : 0.92;
  const gradeMod = input.auctionGrade ? Math.min(1.1, 0.9 + input.auctionGrade * 0.04) : 1.0;

  // Market value estimation
  const baseValue = brand.avgMsrp * ageFactor * mileageFactor;
  const adjustedValue = Math.round(baseValue * colorMod * historyMod * accidentMod * lhdMod * gradeMod);
  const median = adjustedValue;
  const p25 = Math.round(median * 0.90);
  const p75 = Math.round(median * 1.12);
  const sampleSize = Math.floor(Math.random() * 25) + 20;

  // Landed cost calculation
  const bufferedRate = FX_RATE * (1 - FX_BUFFER);
  const purchaseEur = Math.round(input.askingPriceJpy / bufferedRate);
  const auctionFees = Math.round(purchaseEur * 0.04);
  const jpTransport = 400;
  const exportDocs = 175;
  const freight = 2800;
  const insuranceValue = Math.max(purchaseEur, median * 0.7);
  const insurance = Math.round(insuranceValue * 0.02);
  const cifValue = purchaseEur + auctionFees + jpTransport + exportDocs + freight + insurance;
  const customsDuty = Math.round(cifValue * 0.10);
  const importVat = Math.round((cifValue + customsDuty) * 0.19);
  const portHandling = 600;
  const tuvCost = brand.tuvRisk === 1 ? 400 : 800;
  const registration = 150;
  const deTransport = 450;
  const detailing = 1200;
  const photography = 500;
  const totalLanded = purchaseEur + auctionFees + jpTransport + exportDocs + freight + insurance + customsDuty + portHandling + tuvCost + registration + deTransport + detailing + photography;
  const totalWithVat = totalLanded + importVat;

  // Margin
  const grossMargin = median - totalLanded;
  const grossMarginPct = Number(((grossMargin / median) * 100).toFixed(1));
  const pessimistic = p25 - totalLanded;
  const optimistic = p75 - totalLanded;

  // Confidence
  const marketConf = sampleSize > 20 ? 0.92 : sampleSize > 10 ? 0.80 : 0.65;
  const conditionConf = input.auctionGrade ? (input.auctionGrade >= 4.5 ? 0.95 : 0.82) : 0.65;
  const fxConf = 0.88;
  const confidence = Number(Math.pow(marketConf * conditionConf * fxConf, 1 / 3).toFixed(2));

  // Risk scores (1-5)
  const conditionRisk = input.auctionGrade ? (input.auctionGrade >= 4.5 ? 1 : input.auctionGrade >= 4.0 ? 2 : 3) : 3;
  const provenanceRisk = input.serviceHistory === "FULL_DEALER" ? 1 : input.serviceHistory === "PARTIAL_DEALER" ? 2 : 3;
  const tuvRiskScore = input.driveSide === "LHD" ? brand.tuvRisk : brand.tuvRisk + 1;
  const marketRisk = brand.demandScore >= 70 ? 1 : brand.demandScore >= 50 ? 2 : 3;
  const currencyRisk = 2;
  const capitalRisk = totalWithVat > 200000 ? 3 : totalWithVat > 100000 ? 2 : 1;
  const overallRisk = Number((conditionRisk * 0.25 + marketRisk * 0.25 + currencyRisk * 0.20 + provenanceRisk * 0.15 + tuvRiskScore * 0.10 + capitalRisk * 0.05).toFixed(1));
  const riskLevel = overallRisk <= 2.0 ? "LOW" : overallRisk <= 3.5 ? "MEDIUM" : "HIGH";

  // Verdict
  let verdict = "PASS";
  let verdictReasoning = "";
  const highRisks = [conditionRisk, provenanceRisk, tuvRiskScore, marketRisk, currencyRisk, capitalRisk].filter(r => r >= 4);

  if (grossMargin >= 15000 && grossMarginPct >= 20 && confidence >= 0.70 && overallRisk <= 3.0 && highRisks.length === 0) {
    verdict = "BUY";
    verdictReasoning = `Strong margin opportunity at ${grossMarginPct}% (€${grossMargin.toLocaleString()}). ${input.make} ${input.model} is in ${brand.demandScore >= 70 ? "high" : "moderate"} demand in the German market. ${input.driveSide === "LHD" ? "LHD configuration commands a premium." : "RHD limits the addressable market."} ${input.serviceHistory === "FULL_DEALER" ? "Full dealer service history adds significant value." : ""} Confidence at ${(confidence * 100).toFixed(0)}% with overall risk ${riskLevel}.`;
  } else if (grossMargin >= 15000 && grossMarginPct >= 15) {
    verdict = "REVIEW";
    verdictReasoning = `Margin of €${grossMargin.toLocaleString()} (${grossMarginPct}%) meets minimum threshold but ${confidence < 0.70 ? "confidence is below 70%" : overallRisk > 3.0 ? "overall risk is elevated" : "requires additional review"}. ${highRisks.length > 0 ? `${highRisks.length} risk dimension(s) scored HIGH.` : ""} Recommend verifying condition and reviewing comparable listings before committing.`;
  } else {
    verdict = "PASS";
    verdictReasoning = `Margin of €${grossMargin.toLocaleString()} (${grossMarginPct}%) ${grossMargin < 15000 ? "is below the €15,000 minimum threshold" : "does not meet the 20% minimum"}. ${overallRisk > 4.0 ? "Risk is unacceptably high." : ""} The numbers do not support a purchase at ¥${input.askingPriceJpy.toLocaleString()}.`;
  }

  // Max bid
  const maxBidEur = median - 20000;
  const maxBidJpy = Math.round(maxBidEur * bufferedRate);

  // Comparable listings
  const cities = ["Munich", "Stuttgart", "Hamburg", "Berlin", "Frankfurt", "Cologne", "Dusseldorf"];
  const platforms = ["mobile.de", "AutoScout24", "ClassicDriver", "elferspot"];
  const comparables = Array.from({ length: Math.min(sampleSize, 8) }, (_, i) => {
    const priceDiff = (Math.random() - 0.5) * median * 0.25;
    const mileageDiff = (Math.random() - 0.3) * 20000;
    return {
      id: `comp-${i + 1}`,
      title: `${input.make} ${input.model} ${input.year + Math.floor(Math.random() * 3) - 1}`,
      price: Math.round(median + priceDiff),
      mileage: Math.max(5000, Math.round(input.mileageKm + mileageDiff)),
      location: cities[Math.floor(Math.random() * cities.length)],
      platform: platforms[Math.floor(Math.random() * platforms.length)],
      daysOnMarket: Math.floor(Math.random() * 45) + 5,
    };
  }).sort((a, b) => a.price - b.price);

  // Condition assessment
  const extScore = input.auctionGrade ? Math.min(10, input.auctionGrade * 1.8 + (Math.random() * 0.5)) : 7.0;
  const intScore = input.auctionGrade ? Math.min(10, input.auctionGrade * 1.9 + (Math.random() * 0.3)) : 7.5;

  // Estimated hold days
  const shippingDays = 42;
  const customsDays = 5;
  const workshopDays = 7;
  const avgSaleDays = brand.demandScore >= 70 ? 21 : brand.demandScore >= 50 ? 35 : 50;
  const holdDays = shippingDays + customsDays + workshopDays + avgSaleDays;
  const annualizedRoi = Number(((grossMargin / totalWithVat) * (365 / holdDays) * 100).toFixed(1));

  return {
    valuationId: `val-${Date.now()}`,
    timestamp: new Date().toISOString(),

    vehicleSummary: {
      make: input.make,
      model: input.model,
      year: input.year,
      mileageKm: input.mileageKm,
      driveSide: input.driveSide,
      exteriorColor: input.exteriorColor,
      interiorColor: input.interiorColor || "Not specified",
      serviceHistory: input.serviceHistory || "UNKNOWN",
      auctionGrade: input.auctionGrade || null,
      accidentHistory: input.accidentHistory || false,
      segment: brand.prestige,
      specNotes: input.specificationNotes || "",
    },

    conditionAssessment: {
      overallGrade: extScore >= 8.5 ? "EXCELLENT" : extScore >= 7.0 ? "VERY_GOOD" : extScore >= 5.5 ? "GOOD" : "FAIR",
      overallGradeNumeric: Number(((extScore + intScore) / 2).toFixed(1)),
      exteriorScore: Number(extScore.toFixed(1)),
      exteriorNotes: input.auctionGrade >= 4.5
        ? ["Paint in excellent condition", "Minimal stone chips on front bumper", "Wheels show no significant damage"]
        : ["Minor stone chips on front bumper and hood", "Light swirl marks visible under direct light", "Wheels show light curb marks on one rim"],
      interiorScore: Number(intScore.toFixed(1)),
      interiorNotes: input.auctionGrade >= 4.5
        ? ["Leather in excellent condition with minimal wear", "Dashboard and trim pristine", "All electronics functional"]
        : ["Light wear on driver seat bolster", "Dashboard in good condition", "Minor scuff on center console trim"],
      mechanicalNotes: input.auctionGrade >= 4.0 ? ["No mechanical issues noted"] : ["Minor oil seepage at valve cover — monitor"],
      modificationNotes: ["No aftermarket modifications detected"],
      conditionConfidence: conditionConf,
      photoCount: input.photoCount || 0,
    },

    marketAnalysis: {
      totalComparables: sampleSize,
      priceStatistics: { median, mean: Math.round(median * 1.02), p25, p75, min: Math.round(median * 0.82), max: Math.round(median * 1.25) },
      estimatedSalePrice: median,
      priceAdjustments: [
        { factor: "Color premium", adjustmentEur: Math.round((colorMod - 1) * median), reasoning: `${input.exteriorColor} ${colorMod > 1 ? "commands a premium" : "is neutral"} in the German market` },
        { factor: "Mileage adjustment", adjustmentEur: Math.round((mileageFactor - 1) * median * 0.3), reasoning: `${input.mileageKm.toLocaleString()} km ${input.mileageKm < 20000 ? "is very low — significant premium" : input.mileageKm < 40000 ? "is below average — slight premium" : "is average for this model"}` },
        { factor: "Service history", adjustmentEur: Math.round((historyMod - 1) * median), reasoning: `${input.serviceHistory === "FULL_DEALER" ? "Full dealer stamps add strong value" : "Unknown history reduces buyer confidence"}` },
        { factor: "Drive side", adjustmentEur: Math.round((lhdMod - 1) * median), reasoning: `${input.driveSide === "LHD" ? "LHD commands +3% premium in DE" : "RHD significantly limits market"}` },
      ].filter(a => a.adjustmentEur !== 0),
      avgDaysOnMarket: avgSaleDays,
      marketLiquidity: brand.demandScore >= 70 ? "HIGH" : brand.demandScore >= 50 ? "MEDIUM" : "LOW",
      trendDirection: "STABLE",
      dataSource: "mobile.de, AutoScout24",
    },

    landedCost: {
      purchasePriceJpy: input.askingPriceJpy,
      fxRateUsed: FX_RATE,
      fxBufferApplied: FX_BUFFER * 100,
      purchasePriceEur: purchaseEur,
      auctionFeesEur: auctionFees,
      jpTransportEur: jpTransport,
      exportDocsEur: exportDocs,
      freightEur: freight,
      insuranceEur: insurance,
      cifValueEur: cifValue,
      customsDutyEur: customsDuty,
      importVatEur: importVat,
      portHandlingEur: portHandling,
      tuvEstimatedEur: tuvCost,
      registrationEur: registration,
      deTransportEur: deTransport,
      detailingEur: detailing,
      photographyEur: photography,
      totalLandedCostEur: totalLanded,
      totalCashOutlayEur: totalWithVat,
      reclaimableVatEur: importVat,
    },

    marginAnalysis: {
      estimatedSalePrice: median,
      totalLandedCost: totalLanded,
      grossMarginEur: grossMargin,
      grossMarginPct,
      marginAfterOpex: grossMargin - 500,
      pessimisticMargin: pessimistic,
      baseMargin: grossMargin,
      optimisticMargin: optimistic,
      capitalRequired: totalWithVat,
      returnOnCapital: Number(((grossMargin / totalWithVat) * 100).toFixed(1)),
      estimatedHoldDays: holdDays,
      annualizedRoi,
      marginConfidence: confidence,
    },

    riskAssessment: {
      conditionRisk: { score: conditionRisk, level: conditionRisk <= 2 ? "LOW" : conditionRisk <= 3 ? "MEDIUM" : "HIGH" },
      provenanceRisk: { score: provenanceRisk, level: provenanceRisk <= 2 ? "LOW" : provenanceRisk <= 3 ? "MEDIUM" : "HIGH" },
      tuvRisk: { score: tuvRiskScore, level: tuvRiskScore <= 2 ? "LOW" : tuvRiskScore <= 3 ? "MEDIUM" : "HIGH" },
      marketRisk: { score: marketRisk, level: marketRisk <= 2 ? "LOW" : marketRisk <= 3 ? "MEDIUM" : "HIGH" },
      currencyRisk: { score: currencyRisk, level: currencyRisk <= 2 ? "LOW" : currencyRisk <= 3 ? "MEDIUM" : "HIGH" },
      capitalRisk: { score: capitalRisk, level: capitalRisk <= 2 ? "LOW" : capitalRisk <= 3 ? "MEDIUM" : "HIGH" },
      overallRiskScore: overallRisk,
      overallRiskLevel: riskLevel,
    },

    recommendation: {
      verdict,
      verdictReasoning,
      maxBidJpy: verdict !== "PASS" ? maxBidJpy : null,
      maxBidReasoning: verdict !== "PASS" ? `Calculated as: (median sale €${median.toLocaleString()} - min margin €20,000) converted at buffered FX rate ¥${bufferedRate.toFixed(2)}/€` : null,
      keyStrengths: [
        input.driveSide === "LHD" ? "LHD configuration — full EU market access" : null,
        input.serviceHistory === "FULL_DEALER" ? "Complete dealer service history" : null,
        input.mileageKm < 20000 ? "Very low mileage — significant premium potential" : null,
        input.auctionGrade >= 4.5 ? `Excellent auction grade (${input.auctionGrade})` : null,
        brand.demandScore >= 70 ? `Strong German market demand (score ${brand.demandScore}/100)` : null,
      ].filter(Boolean).slice(0, 3),
      keyConcerns: [
        input.driveSide === "RHD" ? "RHD significantly limits European market" : null,
        input.serviceHistory === "UNKNOWN" ? "Unknown service history reduces buyer confidence" : null,
        input.accidentHistory ? "Accident history will reduce value by 10-20%" : null,
        brand.demandScore < 50 ? "Low market demand — longer time to sell" : null,
        overallRisk > 2.5 ? "Elevated overall risk score" : null,
        age > 6 ? "Vehicle age increases maintenance concern" : null,
      ].filter(Boolean).slice(0, 3),
      actionItems: verdict === "REVIEW" ? [
        "Request additional high-resolution photos for condition verification",
        "Verify service history stamps with dealer",
        confidence < 0.70 ? "Wait for more comparable listings to improve confidence" : null,
      ].filter(Boolean) : [],
    },

    reasoning: `${verdictReasoning} The vehicle's total landed cost of €${totalLanded.toLocaleString()} against an estimated German market value of €${median.toLocaleString()} yields a ${grossMarginPct}% gross margin (€${grossMargin.toLocaleString()}). Confidence in this estimate is ${(confidence * 100).toFixed(0)}% based on ${sampleSize} comparable listings.`,

    comparableListings: comparables,
    processingTimeSeconds: Number((20 + Math.random() * 15).toFixed(1)),
  };
}
