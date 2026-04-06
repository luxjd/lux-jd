/**
 * Concierge Agent Storage — leads, conversations, escalations.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

const DATA_DIR = join(process.cwd(), "data", "concierge");

function ensureDir() { if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true }); }
function readJson(f) { const p = join(DATA_DIR, f); if (!existsSync(p)) return null; try { return JSON.parse(readFileSync(p, "utf-8")); } catch { return null; } }
function writeJson(f, d) { ensureDir(); writeFileSync(join(DATA_DIR, f), JSON.stringify(d, null, 2), "utf-8"); }

// Leads
export function getAllLeads() { return readJson("leads.json") || { leads: [] }; }
export function getLeadById(id) { return (getAllLeads().leads || []).find((l) => l.id === id); }
export function saveLead(lead) {
  const d = getAllLeads();
  const idx = d.leads.findIndex((l) => l.id === lead.id);
  if (idx >= 0) d.leads[idx] = lead;
  else d.leads.push(lead);
  d.updatedAt = new Date().toISOString();
  writeJson("leads.json", d);
  return lead;
}
export function updateLeadStatus(id, status) {
  const d = getAllLeads();
  const lead = d.leads.find((l) => l.id === id);
  if (!lead) return null;
  lead.status = status;
  lead.statusUpdatedAt = new Date().toISOString();
  d.updatedAt = new Date().toISOString();
  writeJson("leads.json", d);
  return lead;
}

// Conversations
export function getConversation(leadId) { return readJson(`conv-${leadId}.json`) || { leadId, messages: [] }; }
export function addMessage(leadId, message) {
  const conv = getConversation(leadId);
  conv.messages.push({ ...message, timestamp: new Date().toISOString() });
  writeJson(`conv-${leadId}.json`, conv);
  return conv;
}

// Escalations
export function getEscalations() { return readJson("escalations.json") || { escalations: [] }; }
export function addEscalation(esc) {
  const d = getEscalations();
  d.escalations.push({ ...esc, timestamp: new Date().toISOString() });
  writeJson("escalations.json", d);
}

// Agent Status
export function getAgentStatus() { return readJson("agent-status.json") || { status: "IDLE" }; }
export function updateAgentStatus(u) { const c = getAgentStatus(); writeJson("agent-status.json", { ...c, ...u, updatedAt: new Date().toISOString() }); }
