/**
 * Finance Agent Storage.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

const DATA_DIR = join(process.cwd(), "data", "finance");

function ensureDir() { if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true }); }
function readJson(f) { const p = join(DATA_DIR, f); if (!existsSync(p)) return null; try { return JSON.parse(readFileSync(p, "utf-8")); } catch { return null; } }
function writeJson(f, d) { ensureDir(); writeFileSync(join(DATA_DIR, f), JSON.stringify(d, null, 2), "utf-8"); }

// Transactions
export function getAllTransactions() { return readJson("transactions.json") || { transactions: [] }; }
export function getTransactionsByVehicle(vehicleId) { return (getAllTransactions().transactions || []).filter((t) => t.vehicleId === vehicleId); }
export function addTransaction(txn) { const d = getAllTransactions(); d.transactions.push(txn); writeJson("transactions.json", d); return txn; }
export function addTransactions(txns) { const d = getAllTransactions(); d.transactions.push(...txns); writeJson("transactions.json", d); }

// FX Rate History
export function getFxHistory() { return readJson("fx-history.json") || { rates: [] }; }
export function addFxRate(rate) { const d = getFxHistory(); d.rates.push({ rate, timestamp: new Date().toISOString() }); if (d.rates.length > 365) d.rates = d.rates.slice(-365); writeJson("fx-history.json", d); }

// FX Alerts
export function getFxAlerts() { return readJson("fx-alerts.json") || { alerts: [] }; }
export function addFxAlert(alert) { const d = getFxAlerts(); d.alerts.push({ ...alert, timestamp: new Date().toISOString() }); if (d.alerts.length > 100) d.alerts = d.alerts.slice(-100); writeJson("fx-alerts.json", d); }

// Portfolio Snapshots
export function getLatestPortfolio() { return readJson("portfolio-latest.json"); }
export function savePortfolio(data) { writeJson("portfolio-latest.json", { ...data, savedAt: new Date().toISOString() }); }

// Tax Reports
export function getLatestTaxReport() { return readJson("tax-latest.json"); }
export function saveTaxReport(data) { writeJson("tax-latest.json", data); }

// Agent Status
export function getAgentStatus() { return readJson("agent-status.json") || { status: "IDLE" }; }
export function updateAgentStatus(u) { const c = getAgentStatus(); writeJson("agent-status.json", { ...c, ...u, updatedAt: new Date().toISOString() }); }
