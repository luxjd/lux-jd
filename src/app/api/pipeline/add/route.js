import { savePipelineVehicle, addPipelineEvent } from "@/lib/agents/logistics/storage";

export async function POST(request) {
  try {
    const body = await request.json();
    const { report } = body;

    if (!report?.vehicleSummary) {
      return Response.json({ error: "Missing valuation report" }, { status: 400 });
    }

    const vs = report.vehicleSummary;
    const lc = report.landedCost || {};
    const ma = report.marginAnalysis || {};
    const rec = report.recommendation || {};
    const cond = report.conditionAssessment || {};
    const mkt = report.marketAnalysis || {};

    const vehicleId = `veh-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    const now = new Date().toISOString();

    const vehicle = {
      id: vehicleId,
      make: vs.make,
      model: vs.model,
      year: vs.year,
      variant: vs.fullModelName || null,
      mileageKm: vs.mileageKm,
      driveSide: vs.driveSide,
      exteriorColor: vs.exteriorColor,
      interiorColor: vs.interiorColor || null,
      auctionGrade: vs.auctionGrade || null,
      specification: {
        transmission: vs.transmission,
        fuelType: vs.fuelType,
        engineSpec: vs.engineSpec,
        originalMsrp: vs.originalMsrp,
        productionYears: vs.productionYears,
        specNotes: vs.specNotes,
      },

      // Pipeline status
      currentStage: "SOURCED",
      stageEnteredAt: now,
      stageHistory: [{ stage: "SOURCED", enteredAt: now, agent: "valuation" }],

      // Financial data from valuation
      askingPriceJpy: lc.purchasePriceJpy || null,
      fxRateAtValuation: lc.fxRateUsed || null,
      landedCost: lc,
      estimatedSalePrice: ma.estimatedSalePrice || null,
      margin: {
        grossMarginEur: ma.grossMarginEur || 0,
        grossMarginPct: ma.grossMarginPct || 0,
        pessimisticMargin: ma.pessimisticMargin || 0,
        optimisticMargin: ma.optimisticMargin || 0,
        annualizedRoi: ma.annualizedRoi || 0,
      },
      marginConfidence: ma.marginConfidence || 0,

      // Recommendation
      verdict: rec.verdict || "REVIEW",
      verdictReasoning: rec.verdictReasoning || null,
      maxBidJpy: rec.maxBidJpy || null,
      keyStrengths: rec.keyStrengths || [],
      keyConcerns: rec.keyConcerns || [],

      // Condition
      conditionReport: {
        overallGrade: cond.overallGrade,
        exteriorScore: cond.exteriorScore,
        interiorScore: cond.interiorScore,
        auctionSheetParsed: !!cond.auctionSheetParsed,
      },

      // Market
      comparableCount: mkt.totalComparables || 0,
      dataSource: mkt.dataSource || null,

      // Metadata
      valuationId: report.valuationId,
      createdAt: now,
      updatedAt: now,
    };

    savePipelineVehicle(vehicle);

    addPipelineEvent({
      vehicleId,
      fromStatus: null,
      toStatus: "SOURCED",
      agent: "valuation",
      message: `${vs.make} ${vs.model} (${vs.year}) added to pipeline from valuation. Verdict: ${rec.verdict}. Estimated margin: €${(ma.grossMarginEur || 0).toLocaleString()}.`,
    });

    return Response.json({ vehicleId, status: "SOURCED" });
  } catch (err) {
    console.error("Pipeline add error:", err);
    return Response.json({ error: "Failed to add vehicle to pipeline" }, { status: 500 });
  }
}
