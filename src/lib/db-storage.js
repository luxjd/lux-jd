/**
 * Database Storage Adapter — unified PostgreSQL + JSON fallback.
 *
 * Each function tries PostgreSQL first. If unavailable, falls back to JSON.
 * This is the bridge between all agents and the database.
 *
 * Usage:
 *   import { db } from "@/lib/db-storage";
 *   const vehicle = await db.vehicles.create({ make: "Ferrari", ... });
 *   const leads = await db.leads.findMany({ status: "NEW" });
 */

import { getDb, isDbAvailable } from "./db";

// ═══════════════════════════════════════════════════
// VEHICLES
// ═══════════════════════════════════════════════════

async function createVehicle(data) {
  const prisma = await getDb();
  if (prisma) {
    return prisma.vehicle.create({ data });
  }
  return null;
}

async function updateVehicle(id, data) {
  const prisma = await getDb();
  if (prisma) {
    return prisma.vehicle.update({ where: { id }, data });
  }
  return null;
}

async function getVehicle(id) {
  const prisma = await getDb();
  if (prisma) {
    return prisma.vehicle.findUnique({ where: { id }, include: { transactions: true, pipelineEvents: { orderBy: { createdAt: "desc" }, take: 20 }, shipment: true, tuvAppointment: true, listings: true, leads: true } });
  }
  return null;
}

async function getAllVehicles(filter = {}) {
  const prisma = await getDb();
  if (prisma) {
    return prisma.vehicle.findMany({ where: filter, orderBy: { createdAt: "desc" }, include: { transactions: true, shipment: true } });
  }
  return [];
}

async function getVehiclesByStatus(status) {
  const prisma = await getDb();
  if (prisma) {
    return prisma.vehicle.findMany({ where: { status }, orderBy: { createdAt: "desc" } });
  }
  return [];
}

// ═══════════════════════════════════════════════════
// TRANSACTIONS
// ═══════════════════════════════════════════════════

async function createTransaction(data) {
  const prisma = await getDb();
  if (prisma) {
    return prisma.transaction.create({ data });
  }
  return null;
}

async function createManyTransactions(dataArray) {
  const prisma = await getDb();
  if (prisma) {
    return prisma.transaction.createMany({ data: dataArray });
  }
  return null;
}

async function getTransactionsByVehicle(vehicleId) {
  const prisma = await getDb();
  if (prisma) {
    return prisma.transaction.findMany({ where: { vehicleId }, orderBy: { transactionDate: "desc" } });
  }
  return [];
}

async function getAllTransactions() {
  const prisma = await getDb();
  if (prisma) {
    return prisma.transaction.findMany({ orderBy: { createdAt: "desc" }, take: 500 });
  }
  return [];
}

// ═══════════════════════════════════════════════════
// MARKET SNAPSHOTS
// ═══════════════════════════════════════════════════

async function createMarketSnapshot(data) {
  const prisma = await getDb();
  if (prisma) {
    return prisma.marketSnapshot.create({ data });
  }
  return null;
}

async function getMarketSnapshots(make, model, limit = 90) {
  const prisma = await getDb();
  if (prisma) {
    return prisma.marketSnapshot.findMany({ where: { make, model }, orderBy: { snapshotAt: "desc" }, take: limit });
  }
  return [];
}

// ═══════════════════════════════════════════════════
// PIPELINE EVENTS
// ═══════════════════════════════════════════════════

async function createPipelineEvent(data) {
  const prisma = await getDb();
  if (prisma) {
    return prisma.pipelineEvent.create({ data });
  }
  return null;
}

async function getPipelineEvents(vehicleId = null, limit = 50) {
  const prisma = await getDb();
  if (prisma) {
    return prisma.pipelineEvent.findMany({ where: vehicleId ? { vehicleId } : {}, orderBy: { createdAt: "desc" }, take: limit });
  }
  return [];
}

// ═══════════════════════════════════════════════════
// SHIPMENTS
// ═══════════════════════════════════════════════════

async function createShipment(data) {
  const prisma = await getDb();
  if (prisma) {
    return prisma.shipment.create({ data });
  }
  return null;
}

async function updateShipment(id, data) {
  const prisma = await getDb();
  if (prisma) {
    return prisma.shipment.update({ where: { id }, data });
  }
  return null;
}

async function getShipments() {
  const prisma = await getDb();
  if (prisma) {
    return prisma.shipment.findMany({ include: { vehicle: true }, orderBy: { createdAt: "desc" } });
  }
  return [];
}

// ═══════════════════════════════════════════════════
// TUV APPOINTMENTS
// ═══════════════════════════════════════════════════

async function createTuvAppointment(data) {
  const prisma = await getDb();
  if (prisma) {
    return prisma.tuvAppointment.create({ data });
  }
  return null;
}

async function getTuvAppointments() {
  const prisma = await getDb();
  if (prisma) {
    return prisma.tuvAppointment.findMany({ include: { vehicle: true }, orderBy: { createdAt: "desc" } });
  }
  return [];
}

// ═══════════════════════════════════════════════════
// LISTINGS
// ═══════════════════════════════════════════════════

async function createListing(data) {
  const prisma = await getDb();
  if (prisma) {
    return prisma.listing.create({ data });
  }
  return null;
}

async function updateListing(id, data) {
  const prisma = await getDb();
  if (prisma) {
    return prisma.listing.update({ where: { id }, data });
  }
  return null;
}

async function getListings(filter = {}) {
  const prisma = await getDb();
  if (prisma) {
    return prisma.listing.findMany({ where: filter, include: { vehicle: true }, orderBy: { createdAt: "desc" } });
  }
  return [];
}

// ═══════════════════════════════════════════════════
// LEADS + MESSAGES
// ═══════════════════════════════════════════════════

async function createLead(data) {
  const prisma = await getDb();
  if (prisma) {
    return prisma.lead.create({ data });
  }
  return null;
}

async function updateLead(id, data) {
  const prisma = await getDb();
  if (prisma) {
    return prisma.lead.update({ where: { id }, data });
  }
  return null;
}

async function getLeads(filter = {}) {
  const prisma = await getDb();
  if (prisma) {
    return prisma.lead.findMany({ where: filter, include: { messages: { orderBy: { createdAt: "asc" } } }, orderBy: { createdAt: "desc" } });
  }
  return [];
}

async function createMessage(data) {
  const prisma = await getDb();
  if (prisma) {
    return prisma.message.create({ data });
  }
  return null;
}

// ═══════════════════════════════════════════════════
// VALUATIONS
// ═══════════════════════════════════════════════════

async function createValuation(data) {
  const prisma = await getDb();
  if (prisma) {
    return prisma.valuation.create({ data });
  }
  return null;
}

async function getValuations(limit = 50) {
  const prisma = await getDb();
  if (prisma) {
    return prisma.valuation.findMany({ orderBy: { createdAt: "desc" }, take: limit });
  }
  return [];
}

// ═══════════════════════════════════════════════════
// ORCHESTRATOR DECISIONS
// ═══════════════════════════════════════════════════

async function createDecision(data) {
  const prisma = await getDb();
  if (prisma) {
    return prisma.orchestratorDecision.create({ data });
  }
  return null;
}

async function getDecisions(filter = {}, limit = 50) {
  const prisma = await getDb();
  if (prisma) {
    return prisma.orchestratorDecision.findMany({ where: filter, orderBy: { createdAt: "desc" }, take: limit });
  }
  return [];
}

// ═══════════════════════════════════════════════════
// FX RATES + ALERTS
// ═══════════════════════════════════════════════════

async function createFxRate(data) {
  const prisma = await getDb();
  if (prisma) {
    return prisma.fxRate.create({ data });
  }
  return null;
}

async function getFxRateHistory(limit = 365) {
  const prisma = await getDb();
  if (prisma) {
    return prisma.fxRate.findMany({ orderBy: { createdAt: "desc" }, take: limit });
  }
  return [];
}

async function createFxAlert(data) {
  const prisma = await getDb();
  if (prisma) {
    return prisma.fxAlert.create({ data });
  }
  return null;
}

async function getFxAlerts(limit = 50) {
  const prisma = await getDb();
  if (prisma) {
    return prisma.fxAlert.findMany({ orderBy: { createdAt: "desc" }, take: limit });
  }
  return [];
}

// ═══════════════════════════════════════════════════
// AGENT STATUS
// ═══════════════════════════════════════════════════

async function upsertAgentStatus(id, data) {
  const prisma = await getDb();
  if (prisma) {
    return prisma.agentStatus.upsert({
      where: { id },
      create: { id, name: data.name || id, ...data },
      update: data,
    });
  }
  return null;
}

async function getAgentStatus(id) {
  const prisma = await getDb();
  if (prisma) {
    return prisma.agentStatus.findUnique({ where: { id } });
  }
  return null;
}

async function getAllAgentStatuses() {
  const prisma = await getDb();
  if (prisma) {
    return prisma.agentStatus.findMany();
  }
  return [];
}

// ═══════════════════════════════════════════════════
// AUDIT LOG
// ═══════════════════════════════════════════════════

async function createAuditLog(data) {
  const prisma = await getDb();
  if (prisma) {
    return prisma.auditLog.create({ data });
  }
  return null;
}

// ═══════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════

export const db = {
  isAvailable: isDbAvailable,

  vehicles: { create: createVehicle, update: updateVehicle, get: getVehicle, getAll: getAllVehicles, getByStatus: getVehiclesByStatus },
  transactions: { create: createTransaction, createMany: createManyTransactions, getByVehicle: getTransactionsByVehicle, getAll: getAllTransactions },
  marketSnapshots: { create: createMarketSnapshot, get: getMarketSnapshots },
  pipelineEvents: { create: createPipelineEvent, get: getPipelineEvents },
  shipments: { create: createShipment, update: updateShipment, getAll: getShipments },
  tuvAppointments: { create: createTuvAppointment, getAll: getTuvAppointments },
  listings: { create: createListing, update: updateListing, getAll: getListings },
  leads: { create: createLead, update: updateLead, getAll: getLeads },
  messages: { create: createMessage },
  valuations: { create: createValuation, getAll: getValuations },
  decisions: { create: createDecision, getAll: getDecisions },
  fxRates: { create: createFxRate, getHistory: getFxRateHistory },
  fxAlerts: { create: createFxAlert, getAll: getFxAlerts },
  agentStatus: { upsert: upsertAgentStatus, get: getAgentStatus, getAll: getAllAgentStatuses },
  auditLog: { create: createAuditLog },
};
