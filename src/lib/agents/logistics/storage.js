/**
 * Logistics Agent Storage — persists vehicles, shipments, events.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

const DATA_DIR = join(process.cwd(), "data", "logistics");

function ensureDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

function readJson(filename) {
  const path = join(DATA_DIR, filename);
  if (!existsSync(path)) return null;
  try { return JSON.parse(readFileSync(path, "utf-8")); } catch { return null; }
}

function writeJson(filename, data) {
  ensureDir();
  writeFileSync(join(DATA_DIR, filename), JSON.stringify(data, null, 2), "utf-8");
}

// ─── Pipeline Vehicles ───

export function getPipelineVehicles() {
  return readJson("pipeline-vehicles.json") || { vehicles: [] };
}

export function savePipelineVehicle(vehicle) {
  const data = getPipelineVehicles();
  const idx = data.vehicles.findIndex((v) => v.id === vehicle.id);
  if (idx >= 0) data.vehicles[idx] = vehicle;
  else data.vehicles.push(vehicle);
  data.updatedAt = new Date().toISOString();
  writeJson("pipeline-vehicles.json", data);
  return vehicle;
}

export function getVehicleById(id) {
  const data = getPipelineVehicles();
  return data.vehicles?.find((v) => v.id === id) || null;
}

// ─── Pipeline Events ───

export function getPipelineEvents(vehicleId = null) {
  const data = readJson("pipeline-events.json") || { events: [] };
  if (vehicleId) {
    return { events: data.events.filter((e) => e.vehicleId === vehicleId) };
  }
  return data;
}

export function addPipelineEvent(event) {
  const data = getPipelineEvents();
  data.events.push({
    id: `evt-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    ...event,
    timestamp: new Date().toISOString(),
  });
  if (data.events.length > 500) data.events = data.events.slice(-500);
  writeJson("pipeline-events.json", data);
}

// ─── Shipments ───

export function getShipments() {
  return readJson("shipments.json") || { shipments: [] };
}

export function saveShipment(shipment) {
  const data = getShipments();
  const idx = data.shipments.findIndex((s) => s.shipmentId === shipment.shipmentId);
  if (idx >= 0) data.shipments[idx] = shipment;
  else data.shipments.push(shipment);
  writeJson("shipments.json", data);
  return shipment;
}

// ─── TUV Appointments ───

export function getTuvAppointments() {
  return readJson("tuv-appointments.json") || { appointments: [] };
}

export function saveTuvAppointment(appointment) {
  const data = getTuvAppointments();
  data.appointments.push(appointment);
  writeJson("tuv-appointments.json", data);
  return appointment;
}

// ─── Customs Declarations ───

export function getCustomsDeclarations() {
  return readJson("customs-declarations.json") || { declarations: [] };
}

export function saveCustomsDeclaration(declaration) {
  const data = getCustomsDeclarations();
  data.declarations.push(declaration);
  writeJson("customs-declarations.json", data);
  return declaration;
}

// ─── Agent Status ───

export function getAgentStatus() {
  return readJson("agent-status.json") || { status: "IDLE", lastActionTimestamp: null };
}

export function updateAgentStatus(updates) {
  const current = getAgentStatus();
  writeJson("agent-status.json", { ...current, ...updates, updatedAt: new Date().toISOString() });
}
