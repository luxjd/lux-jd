/**
 * Concierge Agent Storage — leads, conversations, escalations.
 * Uses PostgreSQL via Prisma (no local JSON files).
 */

import { getDb } from "@/lib/db";

// ─── Leads ───

export async function getAllLeads() {
  const db = await getDb();
  if (!db) return { leads: [] };
  const leads = await db.lead.findMany({ orderBy: { createdAt: "desc" }, include: { vehicle: true } });
  return {
    leads: leads.map(mapLeadToJson),
    updatedAt: leads[0]?.updatedAt?.toISOString() || null,
  };
}

export async function getLeadById(id) {
  const db = await getDb();
  if (!db) return null;
  const lead = await db.lead.findUnique({ where: { id }, include: { vehicle: true } });
  return lead ? mapLeadToJson(lead) : null;
}

export async function saveLead(lead) {
  const db = await getDb();
  if (!db) return lead;
  const data = mapJsonToLeadData(lead);
  const saved = await db.lead.upsert({
    where: { id: lead.id },
    update: data,
    create: { id: lead.id, ...data },
  });
  return mapLeadToJson(saved);
}

export async function updateLeadStatus(id, status) {
  const db = await getDb();
  if (!db) return null;
  try {
    const updated = await db.lead.update({ where: { id }, data: { status } });
    return mapLeadToJson(updated);
  } catch { return null; }
}

// ─── Conversations ───

export async function getConversation(leadId) {
  const db = await getDb();
  if (!db) return { leadId, messages: [] };
  const messages = await db.message.findMany({ where: { leadId }, orderBy: { createdAt: "asc" } });
  return {
    leadId,
    messages: messages.map((m) => ({
      role: m.role,
      text: m.text,
      source: m.source,
      aiPowered: m.aiPowered,
      timestamp: m.createdAt.toISOString(),
    })),
  };
}

export async function addMessage(leadId, message) {
  const db = await getDb();
  if (!db) return { leadId, messages: [] };
  await db.message.create({
    data: {
      leadId,
      role: message.role,
      text: message.text,
      source: message.source || null,
      aiPowered: message.aiPowered || false,
    },
  });
  return getConversation(leadId);
}

// ─── Escalations ───

export async function getEscalations() {
  const db = await getDb();
  if (!db) return { escalations: [] };
  const leads = await db.lead.findMany({ where: { escalated: true }, orderBy: { updatedAt: "desc" } });
  return {
    escalations: leads.map((l) => ({
      leadId: l.id,
      name: l.name,
      email: l.email,
      vehicle: l.vehicleId,
      reason: l.escalationReason,
      status: l.status,
      timestamp: l.updatedAt.toISOString(),
    })),
  };
}

export async function addEscalation(esc) {
  const db = await getDb();
  if (!db) return;
  if (esc.leadId) {
    await db.lead.update({
      where: { id: esc.leadId },
      data: { escalated: true, escalationReason: esc.reason || esc.escalationReason || null },
    });
  }
}

// ─── SLA Metrics (Spec §6.6.2 point 1 / KPI §11.2 — <10 min response) ───
// Stored in keyValueStore per lead + rollup counter, same pattern as
// Logistics' pre-ship-inspection / inland-transports.

export async function recordSlaMetric(leadId, metric) {
  const db = await getDb();
  if (!db || !leadId) return metric;

  // Per-lead record for audit trail
  const leadKey = `concierge-sla-${leadId}`;
  const value = { ...metric, leadId, recordedAt: new Date().toISOString() };
  await db.keyValueStore.upsert({
    where: { key: leadKey },
    update: { value },
    create: { key: leadKey, value },
  });

  // Rolling counter for KPI reporting (14-day window)
  const rollupKey = "concierge-sla-rollup";
  const existing = await db.keyValueStore.findUnique({ where: { key: rollupKey } });
  const rollup = existing?.value || { samples: [] };
  rollup.samples.push({
    leadId,
    respondedAt: metric.respondedAt,
    responseDelayMs: metric.responseDelayMs,
    slaBreached: metric.slaBreached,
    path: metric.path,
  });
  // Keep last 14 days
  const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;
  rollup.samples = rollup.samples.filter((s) => new Date(s.respondedAt).getTime() > cutoff);
  rollup.totalSamples = rollup.samples.length;
  rollup.breachCount = rollup.samples.filter((s) => s.slaBreached).length;
  rollup.breachRatePct = rollup.totalSamples > 0
    ? Number(((rollup.breachCount / rollup.totalSamples) * 100).toFixed(1))
    : 0;
  rollup.avgResponseDelayMs = rollup.totalSamples > 0
    ? Math.round(rollup.samples.reduce((s, x) => s + x.responseDelayMs, 0) / rollup.totalSamples)
    : 0;
  rollup.updatedAt = new Date().toISOString();

  await db.keyValueStore.upsert({
    where: { key: rollupKey },
    update: { value: rollup },
    create: { key: rollupKey, value: rollup },
  });

  return value;
}

export async function getSlaRollup() {
  const db = await getDb();
  if (!db) return null;
  const row = await db.keyValueStore.findUnique({ where: { key: "concierge-sla-rollup" } });
  return row?.value || { samples: [], totalSamples: 0, breachCount: 0, breachRatePct: 0, avgResponseDelayMs: 0 };
}

// ─── Agent Status ───

export async function getAgentStatus() {
  const db = await getDb();
  if (!db) return { status: "IDLE" };
  const s = await db.agentStatus.findUnique({ where: { id: "concierge" } });
  if (!s) return { status: "IDLE" };
  return { ...s.metadata, status: s.status, lastAction: s.lastAction, lastActionAt: s.lastActionAt?.toISOString(), updatedAt: s.updatedAt.toISOString() };
}

export async function updateAgentStatus(u) {
  const db = await getDb();
  if (!db) return;
  const current = await getAgentStatus();
  const { status, lastAction, lastActionAt, ...rest } = { ...current, ...u };
  await db.agentStatus.upsert({
    where: { id: "concierge" },
    update: { name: "Concierge", status: status || "IDLE", lastAction, lastActionAt: lastActionAt ? new Date(lastActionAt) : new Date(), metadata: rest },
    create: { id: "concierge", name: "Concierge", status: status || "IDLE", lastAction, lastActionAt: lastActionAt ? new Date(lastActionAt) : new Date(), metadata: rest },
  });
}

// ─── Helpers ───

function mapLeadToJson(lead) {
  return {
    id: lead.id,
    vehicleId: lead.vehicleId,
    vehicle: lead.vehicle ? `${lead.vehicle.year} ${lead.vehicle.make} ${lead.vehicle.model}` : (lead.vehicleId || null),
    name: lead.name,
    email: lead.email,
    phone: lead.phone,
    source: lead.source,
    status: lead.status,
    buyerType: lead.buyerType,
    score: lead.score,
    language: lead.language,
    inquiryText: lead.inquiryText,
    responseText: lead.responseText,
    offerPrice: lead.offerPrice ? Number(lead.offerPrice) : null,
    escalated: lead.escalated,
    escalationReason: lead.escalationReason,
    suggestedAction: lead.suggestedAction,
    notes: lead.notes,
    createdAt: lead.createdAt.toISOString(),
    updatedAt: lead.updatedAt.toISOString(),
  };
}

function mapJsonToLeadData(lead) {
  const data = {};
  if (lead.vehicleId !== undefined) data.vehicleId = lead.vehicleId;
  if (lead.name !== undefined) data.name = lead.name;
  if (lead.email !== undefined) data.email = lead.email;
  if (lead.phone !== undefined) data.phone = lead.phone || null;
  if (lead.source !== undefined) data.source = lead.source;
  if (lead.status !== undefined) data.status = lead.status;
  if (lead.buyerType !== undefined) data.buyerType = lead.buyerType;
  if (lead.score !== undefined) data.score = lead.score;
  if (lead.language !== undefined) data.language = lead.language;
  if (lead.inquiryText !== undefined) data.inquiryText = lead.inquiryText;
  if (lead.responseText !== undefined) data.responseText = lead.responseText;
  if (lead.offerPrice !== undefined) data.offerPrice = lead.offerPrice;
  if (lead.escalated !== undefined) data.escalated = lead.escalated;
  if (lead.escalationReason !== undefined) data.escalationReason = lead.escalationReason;
  if (lead.suggestedAction !== undefined) data.suggestedAction = lead.suggestedAction;
  if (lead.notes !== undefined) data.notes = lead.notes;
  // Ensure required fields have defaults
  if (!data.name) data.name = lead.name || "Unknown";
  if (!data.source) data.source = lead.source || "website";
  return data;
}
