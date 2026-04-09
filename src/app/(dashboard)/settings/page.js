"use client";

import { useState, useEffect } from "react";

const AGENT_DEFS = [
  { id: "de-market", name: "DE Market Agent", icon: "query_stats" },
  { id: "jp-sourcing", name: "JP Sourcing Agent", icon: "location_searching" },
  { id: "orchestrator", name: "Orchestrator", icon: "hub" },
  { id: "logistics", name: "Logistics Agent", icon: "local_shipping" },
  { id: "listing", name: "Listing Agent", icon: "storefront" },
  { id: "finance", name: "Finance Agent", icon: "account_balance" },
  { id: "concierge", name: "Concierge Agent", icon: "support_agent" },
];

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Form state
  const [displayName, setDisplayName] = useState("Admin");
  const [email, setEmail] = useState("admin@luxjd.com");
  const [minMarginPct, setMinMarginPct] = useState(20);
  const [minMarginEur, setMinMarginEur] = useState(15000);
  const [maxPurchaseEur, setMaxPurchaseEur] = useState(250000);
  const [fxBufferPct, setFxBufferPct] = useState(3);
  const [agentStates, setAgentStates] = useState(
    AGENT_DEFS.reduce((acc, a) => ({ ...acc, [a.id]: true }), {})
  );

  // Load settings from DB on mount
  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data) => {
        const s = data.settings || {};
        setDisplayName(s["profile.displayName"] || "Admin");
        setEmail(s["profile.email"] || "admin@luxjd.com");
        setMinMarginPct(Number(s["thresholds.minMarginPct"]) || 20);
        setMinMarginEur(Number(s["thresholds.minMarginEur"]) || 15000);
        setMaxPurchaseEur(Number(s["thresholds.maxPurchaseEur"]) || 250000);
        setFxBufferPct(Number(s["thresholds.fxBufferPct"]) || 3);
        const agents = {};
        for (const a of AGENT_DEFS) {
          agents[a.id] = s[`agents.${a.id}`] !== false;
        }
        setAgentStates(agents);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const toggleAgent = async (id) => {
    const newState = !agentStates[id];
    setAgentStates((prev) => ({ ...prev, [id]: newState }));

    // Auto-save immediately
    try {
      await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: { [`agents.${id}`]: newState } }),
      });
    } catch { /* silent fail */ }
  };

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const settings = {
        "profile.displayName": displayName,
        "profile.email": email,
        "thresholds.minMarginPct": minMarginPct,
        "thresholds.minMarginEur": minMarginEur,
        "thresholds.maxPurchaseEur": maxPurchaseEur,
        "thresholds.fxBufferPct": fxBufferPct,
      };
      for (const a of AGENT_DEFS) {
        settings[`agents.${a.id}`] = agentStates[a.id];
      }

      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings }),
      });
      const data = await res.json();
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      } else {
        alert(data.error || "Failed to save");
      }
    } catch (err) {
      alert("Failed to save: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto p-12 text-center">
        <div className="w-10 h-10 rounded-full border-2 border-primary/30 border-t-primary animate-spin mx-auto mb-3" />
        <p className="text-sm text-on-surface-variant">Loading settings...</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Profile */}
      <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-6">
        <h3 className="font-headline font-bold text-lg mb-4 flex items-center gap-2">
          <span className="material-symbols-outlined text-on-surface-variant">person</span>
          Profile
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs uppercase tracking-widest text-on-surface-variant mb-2">Display Name</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => { setDisplayName(e.target.value); setSaved(false); }}
              className="w-full px-4 py-3 rounded-xl bg-surface-container-high border border-outline-variant/20 text-on-surface focus:outline-none focus:border-primary/50 transition-all"
            />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-widest text-on-surface-variant mb-2">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setSaved(false); }}
              className="w-full px-4 py-3 rounded-xl bg-surface-container-high border border-outline-variant/20 text-on-surface focus:outline-none focus:border-primary/50 transition-all"
            />
          </div>
        </div>
      </div>

      {/* Agent Configuration */}
      <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-6">
        <h3 className="font-headline font-bold text-lg mb-4 flex items-center gap-2">
          <span className="material-symbols-outlined text-on-surface-variant">smart_toy</span>
          Agent Configuration
        </h3>
        <div className="space-y-3">
          {AGENT_DEFS.map((a) => (
            <div key={a.id} className="flex items-center justify-between p-4 rounded-xl bg-surface-container-high/30 border border-outline-variant/10">
              <div className="flex items-center gap-3">
                <span className={`material-symbols-outlined ${agentStates[a.id] ? "text-on-surface" : "text-on-surface-variant/50"}`}>{a.icon}</span>
                <div>
                  <p className={`text-sm font-bold ${agentStates[a.id] ? "" : "text-on-surface-variant/50"}`}>{a.name}</p>
                  <p className="text-[10px] text-on-surface-variant">{agentStates[a.id] ? "Active" : "Disabled"}</p>
                </div>
              </div>
              <button
                onClick={() => toggleAgent(a.id)}
                className={`w-12 h-6 rounded-full transition-all duration-300 ${
                  agentStates[a.id] ? "bg-emerald-400" : "bg-surface-container-high border border-outline-variant/20"
                }`}
              >
                <div className={`w-5 h-5 rounded-full bg-white shadow-md transform transition-transform duration-300 ${
                  agentStates[a.id] ? "translate-x-6" : "translate-x-0.5"
                }`} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Thresholds */}
      <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-6">
        <h3 className="font-headline font-bold text-lg mb-4 flex items-center gap-2">
          <span className="material-symbols-outlined text-on-surface-variant">tune</span>
          Decision Thresholds
        </h3>
        <p className="text-xs text-on-surface-variant mb-4">These values control BUY/REVIEW/PASS verdicts and max bid calculations across the entire platform.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs uppercase tracking-widest text-on-surface-variant mb-2">Min Margin %</label>
            <input
              type="number"
              value={minMarginPct}
              onChange={(e) => { setMinMarginPct(Number(e.target.value)); setSaved(false); }}
              className="w-full px-4 py-3 rounded-xl bg-surface-container-high border border-outline-variant/20 text-on-surface focus:outline-none focus:border-primary/50 transition-all"
            />
            <p className="text-[10px] text-on-surface-variant/60 mt-1">Minimum gross margin percentage for BUY verdict</p>
          </div>
          <div>
            <label className="block text-xs uppercase tracking-widest text-on-surface-variant mb-2">Min Margin (EUR)</label>
            <input
              type="number"
              value={minMarginEur}
              onChange={(e) => { setMinMarginEur(Number(e.target.value)); setSaved(false); }}
              className="w-full px-4 py-3 rounded-xl bg-surface-container-high border border-outline-variant/20 text-on-surface focus:outline-none focus:border-primary/50 transition-all"
            />
            <p className="text-[10px] text-on-surface-variant/60 mt-1">Minimum absolute margin in EUR for BUY verdict</p>
          </div>
          <div>
            <label className="block text-xs uppercase tracking-widest text-on-surface-variant mb-2">Max Purchase Price (EUR)</label>
            <input
              type="number"
              value={maxPurchaseEur}
              onChange={(e) => { setMaxPurchaseEur(Number(e.target.value)); setSaved(false); }}
              className="w-full px-4 py-3 rounded-xl bg-surface-container-high border border-outline-variant/20 text-on-surface focus:outline-none focus:border-primary/50 transition-all"
            />
            <p className="text-[10px] text-on-surface-variant/60 mt-1">Auto-reject vehicles above this landed cost</p>
          </div>
          <div>
            <label className="block text-xs uppercase tracking-widest text-on-surface-variant mb-2">FX Buffer %</label>
            <input
              type="number"
              value={fxBufferPct}
              step="0.5"
              onChange={(e) => { setFxBufferPct(Number(e.target.value)); setSaved(false); }}
              className="w-full px-4 py-3 rounded-xl bg-surface-container-high border border-outline-variant/20 text-on-surface focus:outline-none focus:border-primary/50 transition-all"
            />
            <p className="text-[10px] text-on-surface-variant/60 mt-1">Safety buffer applied to JPY/EUR rate for cost calculations</p>
          </div>
        </div>
      </div>

      {/* Save */}
      <div className="flex items-center justify-end gap-3">
        {saved && (
          <span className="flex items-center gap-1.5 text-sm text-emerald-400">
            <span className="material-symbols-outlined text-lg">check_circle</span>
            Settings saved
          </span>
        )}
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-8 py-3 bg-primary text-on-primary font-bold rounded-xl hover:shadow-[0_0_25px_rgba(248,113,113,0.5)] transition-all disabled:opacity-50 flex items-center gap-2"
        >
          {saving && <span className="material-symbols-outlined text-lg animate-spin">progress_activity</span>}
          {saving ? "Saving..." : "Save Changes"}
        </button>
      </div>
    </div>
  );
}
