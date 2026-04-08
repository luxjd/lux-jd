/**
 * Notifications API — aggregates alerts, escalations, and pending items from all agents.
 */

import { getDecisions } from "@/lib/agents/orchestrator/storage";
import { getEscalations } from "@/lib/agents/concierge/storage";
import { getFxAlerts } from "@/lib/agents/finance/storage";
import { getPipelineVehicles } from "@/lib/agents/logistics/storage";
import { getAllListings } from "@/lib/agents/listing/storage";
import { STAGE_KEYS as STAGES, STAGE_DURATIONS } from "@/lib/agents/logistics/pipeline";

export async function GET() {
  const notifications = [];

  // ─── Orchestrator: Pending HUMAN_REVIEW decisions ───
  const decisions = await getDecisions();
  const pendingReviews = (decisions.decisions || []).filter((d) => d.decision === "HUMAN_REVIEW");
  for (const d of pendingReviews.slice(-5)) {
    notifications.push({
      id: `orch-${d.evaluatedAt}`,
      type: "APPROVAL_NEEDED",
      priority: "HIGH",
      source: "Orchestrator",
      icon: "gavel",
      title: `Purchase approval needed: ${d.vehicleName}`,
      description: d.brief?.headline || d.decisionReason?.substring(0, 100),
      detail: `Margin €${d.financials?.margin?.toLocaleString()} (${d.financials?.marginPct}%) · Risk ${d.risk?.compositeScore}/3.0 · ${d.flagReasons?.length || 0} flag(s)`,
      actionUrl: "/agents/orchestrator",
      timestamp: d.evaluatedAt,
    });
  }

  // ─── Concierge: Escalated leads ───
  const escalations = await getEscalations();
  for (const e of (escalations.escalations || []).slice(-5)) {
    notifications.push({
      id: `esc-${e.timestamp}`,
      type: "ESCALATION",
      priority: e.triggers?.some((t) => t.priority === "CRITICAL") ? "CRITICAL" : "HIGH",
      source: "Concierge Agent",
      icon: "warning",
      title: `Escalated: ${e.customerName} — ${e.vehicle}`,
      description: e.triggers?.map((t) => t.reason).join("; ") || "Customer inquiry requires human attention",
      actionUrl: "/agents/concierge",
      timestamp: e.timestamp,
    });
  }

  // ─── Finance: FX alerts ───
  const fxAlerts = await getFxAlerts();
  for (const a of (fxAlerts.alerts || []).slice(-3)) {
    notifications.push({
      id: `fx-${a.timestamp}`,
      type: "FX_ALERT",
      priority: a.level === "CRITICAL" ? "CRITICAL" : a.level === "WARN" ? "HIGH" : "LOW",
      source: "Finance Agent",
      icon: "currency_exchange",
      title: a.message,
      description: a.impact,
      actionUrl: "/agents/finance",
      timestamp: a.timestamp,
    });
  }

  // ─── Logistics: Delayed vehicles (stuck in stage too long) ───
  const pipeline = await getPipelineVehicles();
  for (const v of (pipeline.vehicles || [])) {
    const stageIdx = STAGES.indexOf(v.currentStage);
    if (stageIdx < 0) continue;
    const expectedDays = STAGE_DURATIONS[v.currentStage] || 7;
    const actualDays = Math.round((Date.now() - new Date(v.stageEnteredAt).getTime()) / (1000 * 60 * 60 * 24));

    if (actualDays > expectedDays * 1.5) {
      notifications.push({
        id: `delay-${v.id}`,
        type: "PIPELINE_DELAY",
        priority: actualDays > expectedDays * 3 ? "HIGH" : "MEDIUM",
        source: "Logistics Agent",
        icon: "schedule",
        title: `${v.make} ${v.model} delayed at ${v.currentStage}`,
        description: `Day ${actualDays} in stage (expected ${expectedDays} days). ${actualDays - expectedDays} days overdue.`,
        actionUrl: "/agents/logistics",
        timestamp: v.stageEnteredAt,
      });
    }
  }

  // ─── Listing: Price reduction triggers ───
  const listings = await getAllListings();
  for (const l of (listings.listings || [])) {
    if (l.status !== "ACTIVE") continue;
    const dom = l.daysOnMarket || 0;
    if (dom >= 42 && dom < 56) {
      notifications.push({
        id: `price-review-${l.id}`,
        type: "PRICE_REVIEW",
        priority: "MEDIUM",
        source: "Listing Agent",
        icon: "sell",
        title: `Day ${dom}: Price review needed for ${l.vehicle?.make} ${l.vehicle?.model}`,
        description: `Current price €${l.currentPrice?.toLocaleString()} — Day 42 strategic review required per pricing policy.`,
        actionUrl: "/agents/listing",
        timestamp: l.createdAt,
      });
    }
  }

  // Sort by priority then timestamp
  const priorityOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  notifications.sort((a, b) => (priorityOrder[a.priority] || 3) - (priorityOrder[b.priority] || 3) || new Date(b.timestamp) - new Date(a.timestamp));

  return Response.json({
    notifications,
    count: notifications.length,
    byCritical: notifications.filter((n) => n.priority === "CRITICAL").length,
    byHigh: notifications.filter((n) => n.priority === "HIGH").length,
    byMedium: notifications.filter((n) => n.priority === "MEDIUM").length,
    byLow: notifications.filter((n) => n.priority === "LOW").length,
    generatedAt: new Date().toISOString(),
  });
}
