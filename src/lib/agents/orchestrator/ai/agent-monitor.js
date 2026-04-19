/**
 * Agent Health Monitor — tracks status of all 7 agents.
 *
 * The Orchestrator is responsible for knowing if any agent is down,
 * degraded, or producing stale data.
 */

import { getAgentStatus as getDeMarketStatus } from "@/lib/agents/de-market/storage";
import { getAgentStatus as getJpSourcingStatus } from "@/lib/agents/jp-sourcing/storage";
import { getAgentStatus as getListingStatus } from "@/lib/agents/listing/storage";
import { getAgentStatus as getLogisticsStatus } from "@/lib/agents/logistics/storage";
import { getAgentStatus as getFinanceStatus } from "@/lib/agents/finance/storage";
import { getAgentStatus as getConciergeStatus } from "@/lib/agents/concierge/storage";
import { getAgentStatus as getOrchestratorStatus } from "../storage";

const AGENTS = [
  { id: "orchestrator", name: "Orchestrator", icon: "account_tree", getStatus: getOrchestratorStatus, critical: true },
  { id: "de-market", name: "DE Market Research Agent", icon: "query_stats", getStatus: getDeMarketStatus, critical: true },
  { id: "jp-sourcing", name: "JP Sourcing Agent", icon: "travel_explore", getStatus: getJpSourcingStatus, critical: true },
  { id: "listing", name: "Listing Agent", icon: "edit_note", getStatus: getListingStatus, critical: false },
  { id: "logistics", name: "Logistics Agent", icon: "local_shipping", getStatus: getLogisticsStatus, critical: true },
  { id: "finance", name: "Finance Agent", icon: "account_balance", getStatus: getFinanceStatus, critical: true },
  { id: "concierge", name: "Concierge Agent", icon: "support_agent", getStatus: getConciergeStatus, critical: false },
];

/**
 * Check health of all agents.
 */
export async function checkAllAgents() {
  const results = [];
  let overallHealth = "HEALTHY";

  for (const agent of AGENTS) {
    let status;
    try {
      status = await agent.getStatus();
    } catch {
      status = { status: "ERROR", error: "Failed to read agent status" };
    }

    const lastAction = status.lastActionTimestamp || status.lastScanTimestamp || status.lastCheckTimestamp;
    const hoursSinceAction = lastAction ? (Date.now() - new Date(lastAction).getTime()) / (1000 * 60 * 60) : null;

    let health = "HEALTHY";
    let issues = [];

    if (status.status === "ERROR" || status.status === "OFFLINE") {
      health = "DOWN";
      issues.push("Agent is offline or in error state");
    } else if (!lastAction) {
      health = "IDLE";
      issues.push("Agent has never run");
    } else if (hoursSinceAction > 24 && agent.critical) {
      health = "STALE";
      issues.push(`No activity for ${Math.round(hoursSinceAction)} hours`);
    } else if (status.errorCount24h > 5) {
      health = "DEGRADED";
      issues.push(`${status.errorCount24h} errors in last 24h`);
    }

    if (health !== "HEALTHY" && health !== "IDLE" && agent.critical) {
      if (health === "DOWN") overallHealth = "CRITICAL";
      else if (overallHealth !== "CRITICAL") overallHealth = "DEGRADED";
    }

    results.push({
      id: agent.id,
      name: agent.name,
      icon: agent.icon,
      critical: agent.critical,
      status: status.status || "UNKNOWN",
      health,
      lastAction: status.lastAction || status.lastScanTimestamp ? "Active" : "Never run",
      lastActionTimestamp: lastAction,
      hoursSinceAction: hoursSinceAction ? Number(hoursSinceAction.toFixed(1)) : null,
      issues,
      metrics: {
        ...(status.totalListingsTracked != null && { listingsTracked: status.totalListingsTracked }),
        ...(status.vehiclesEvaluated != null && { vehiclesEvaluated: status.vehiclesEvaluated }),
        ...(status.activeListings != null && { activeListings: status.activeListings }),
        ...(status.totalVehiclesInPipeline != null && { pipelineVehicles: status.totalVehiclesInPipeline }),
        ...(status.fxRate != null && { fxRate: status.fxRate }),
        ...(status.totalLeads != null && { totalLeads: status.totalLeads }),
      },
    });
  }

  return {
    overallHealth,
    agents: results,
    healthyCount: results.filter((a) => a.health === "HEALTHY").length,
    degradedCount: results.filter((a) => a.health === "DEGRADED" || a.health === "STALE").length,
    downCount: results.filter((a) => a.health === "DOWN").length,
    idleCount: results.filter((a) => a.health === "IDLE").length,
    checkedAt: new Date().toISOString(),
  };
}
