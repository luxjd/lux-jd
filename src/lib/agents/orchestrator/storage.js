import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

const DATA_DIR = join(process.cwd(), "data", "orchestrator");
function ensureDir() { if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true }); }
function readJson(f) { const p = join(DATA_DIR, f); if (!existsSync(p)) return null; try { return JSON.parse(readFileSync(p, "utf-8")); } catch { return null; } }
function writeJson(f, d) { ensureDir(); writeFileSync(join(DATA_DIR, f), JSON.stringify(d, null, 2), "utf-8"); }

export function getDecisions() { return readJson("decisions.json") || { decisions: [] }; }
export function saveDecision(decision) {
  const d = getDecisions();
  d.decisions.push({ ...decision, savedAt: new Date().toISOString() });
  if (d.decisions.length > 200) d.decisions = d.decisions.slice(-200);
  writeJson("decisions.json", d);
}
export function getAgentStatus() { return readJson("agent-status.json") || { status: "IDLE" }; }
export function updateAgentStatus(u) { const c = getAgentStatus(); writeJson("agent-status.json", { ...c, ...u, updatedAt: new Date().toISOString() }); }
export function getLatestPortfolioSnapshot() { return readJson("portfolio-snapshot.json"); }
export function savePortfolioSnapshot(s) { writeJson("portfolio-snapshot.json", { ...s, savedAt: new Date().toISOString() }); }
