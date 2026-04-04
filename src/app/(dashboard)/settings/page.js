"use client";

import { useState } from "react";
import { agents } from "@/lib/mock-data";

export default function SettingsPage() {
  const [agentStates, setAgentStates] = useState(
    agents.reduce((acc, a) => ({ ...acc, [a.id]: true }), {})
  );

  const toggleAgent = (id) => {
    setAgentStates((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="max-w-4xl space-y-8">
      {/* Profile */}
      <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-6">
        <h3 className="font-headline font-bold text-lg mb-4">Profile</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs uppercase tracking-widest text-on-surface-variant mb-2">Display Name</label>
            <input type="text" defaultValue="Admin" className="w-full px-4 py-3 rounded-xl bg-surface-container-high border border-outline-variant/20 text-on-surface focus:outline-none focus:border-primary/50 transition-all" />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-widest text-on-surface-variant mb-2">Email</label>
            <input type="email" defaultValue="admin@luxjd.com" disabled className="w-full px-4 py-3 rounded-xl bg-surface-container-high border border-outline-variant/20 text-on-surface-variant cursor-not-allowed" />
          </div>
        </div>
      </div>

      {/* Agent Configuration */}
      <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-6">
        <h3 className="font-headline font-bold text-lg mb-4">Agent Configuration</h3>
        <div className="space-y-3">
          {agents.map((a) => (
            <div key={a.id} className="flex items-center justify-between p-4 rounded-xl bg-surface-container-high/30 border border-outline-variant/10">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-on-surface-variant">{a.icon}</span>
                <div>
                  <p className="text-sm font-bold">{a.name}</p>
                  <p className="text-xs text-on-surface-variant">{a.lastAction}</p>
                </div>
              </div>
              <button
                onClick={() => toggleAgent(a.id)}
                className={`w-12 h-6 rounded-full transition-all duration-300 ${
                  agentStates[a.id] ? "bg-primary" : "bg-surface-container-high"
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
        <h3 className="font-headline font-bold text-lg mb-4">Decision Thresholds</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs uppercase tracking-widest text-on-surface-variant mb-2">Min Spread %</label>
            <input type="number" defaultValue="20" className="w-full px-4 py-3 rounded-xl bg-surface-container-high border border-outline-variant/20 text-on-surface focus:outline-none focus:border-primary/50 transition-all" />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-widest text-on-surface-variant mb-2">Min Margin (EUR)</label>
            <input type="number" defaultValue="15000" className="w-full px-4 py-3 rounded-xl bg-surface-container-high border border-outline-variant/20 text-on-surface focus:outline-none focus:border-primary/50 transition-all" />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-widest text-on-surface-variant mb-2">Max Purchase Price (EUR)</label>
            <input type="number" defaultValue="250000" className="w-full px-4 py-3 rounded-xl bg-surface-container-high border border-outline-variant/20 text-on-surface focus:outline-none focus:border-primary/50 transition-all" />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-widest text-on-surface-variant mb-2">FX Buffer %</label>
            <input type="number" defaultValue="3" className="w-full px-4 py-3 rounded-xl bg-surface-container-high border border-outline-variant/20 text-on-surface focus:outline-none focus:border-primary/50 transition-all" />
          </div>
        </div>
      </div>

      {/* Save */}
      <div className="flex justify-end">
        <button className="px-8 py-3 bg-primary text-on-primary font-bold rounded-xl hover:shadow-[0_0_25px_rgba(173,198,255,0.5)] transition-all">
          Save Changes
        </button>
      </div>
    </div>
  );
}
