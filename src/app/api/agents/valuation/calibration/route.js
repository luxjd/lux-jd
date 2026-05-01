import { db } from "@/lib/db";

/**
 * POST /api/agents/valuation/calibration
 * Record actual sale outcome for a valuation to calibrate prediction accuracy.
 *
 * Body: { valuationId, actualSalePriceEur, daysToSell?, notes? }
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const { valuationId, actualSalePriceEur, daysToSell, notes } = body;

    if (!valuationId || !actualSalePriceEur) {
      return Response.json({ error: "valuationId and actualSalePriceEur are required" }, { status: 400 });
    }

    const valuation = await db.valuations.get(valuationId);
    if (!valuation) {
      return Response.json({ error: "Valuation not found" }, { status: 404 });
    }

    const report = valuation.reportData || {};
    const predictedPrice = report.market_analysis?.estimated_sale_price_eur || 0;
    const predictedMargin = report.margin_analysis?.gross_margin_eur || 0;
    const landedCost = report.landed_cost?.total_landed_cost_eur || 0;

    const actualMargin = actualSalePriceEur - landedCost;
    const error = actualSalePriceEur - predictedPrice;
    const errorPct = predictedPrice > 0 ? (error / predictedPrice) * 100 : 0;

    const record = {
      id: crypto.randomUUID(),
      valuationId,
      make: valuation.make,
      model: valuation.model,
      year: valuation.year,
      predictedPriceEur: predictedPrice,
      actualSalePriceEur,
      predictedMarginEur: predictedMargin,
      actualMarginEur: actualMargin,
      predictionError: error,
      predictionErrorPct: Math.round(errorPct * 100) / 100,
      daysToSell: daysToSell || null,
      notes: notes || null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await db.prisma?.valuationCalibration?.create({ data: record });

    return Response.json({
      calibration: record,
      summary: {
        predicted: predictedPrice,
        actual: actualSalePriceEur,
        error: Math.round(error),
        errorPct: `${errorPct > 0 ? "+" : ""}${errorPct.toFixed(1)}%`,
        predictedMargin: Math.round(predictedMargin),
        actualMargin: Math.round(actualMargin),
      },
    });
  } catch (err) {
    console.error("Calibration error:", err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}

/**
 * GET /api/agents/valuation/calibration
 * Get calibration statistics — how accurate are our predictions?
 */
export async function GET() {
  try {
    const records = await db.prisma?.valuationCalibration?.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    if (!records || records.length === 0) {
      return Response.json({
        count: 0,
        message: "No calibration data yet. Submit actual sale prices via POST to start calibrating.",
        stats: null,
      });
    }

    const withActual = records.filter((r) => r.actualSalePriceEur != null);
    const errors = withActual.map((r) => Number(r.predictionError || 0));
    const errorsPct = withActual.map((r) => Number(r.predictionErrorPct || 0));

    const mean = (arr) => arr.reduce((s, v) => s + v, 0) / arr.length;
    const mae = mean(errors.map(Math.abs));
    const mape = mean(errorsPct.map(Math.abs));
    const bias = mean(errors);

    const sorted = [...errors].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];

    return Response.json({
      count: withActual.length,
      stats: {
        meanAbsoluteError: Math.round(mae),
        meanAbsolutePercentageError: `${mape.toFixed(1)}%`,
        bias: Math.round(bias),
        biasDirection: bias > 0 ? "OVER_PREDICTING" : "UNDER_PREDICTING",
        medianError: Math.round(median),
      },
      recent: withActual.slice(0, 10).map((r) => ({
        make: r.make,
        model: r.model,
        year: r.year,
        predicted: Number(r.predictedPriceEur),
        actual: Number(r.actualSalePriceEur),
        error: Number(r.predictionError),
        errorPct: `${Number(r.predictionErrorPct).toFixed(1)}%`,
        daysToSell: r.daysToSell,
      })),
    });
  } catch (err) {
    console.error("Calibration stats error:", err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
