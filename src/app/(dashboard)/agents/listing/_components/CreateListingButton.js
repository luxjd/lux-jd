"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function CreateListingButton({ vehicles }) {
  const [creating, setCreating] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState("");
  const [result, setResult] = useState(null);
  const router = useRouter();

  const handleCreate = async () => {
    if (!selectedVehicle) return;
    setCreating(true);
    setResult(null);

    const vehicle = vehicles.find((v) => v.id === selectedVehicle);
    if (!vehicle) return;

    try {
      const res = await fetch("/api/agents/listing/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(vehicle),
      });
      const data = await res.json();
      if (data.error) {
        setResult({ error: true, message: data.error });
      } else {
        setResult(data);
        router.refresh();
      }
    } catch (err) {
      setResult({ error: true, message: err.message });
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row gap-3">
        <select
          value={selectedVehicle}
          onChange={(e) => setSelectedVehicle(e.target.value)}
          className="flex-1 px-4 py-2.5 rounded-xl bg-surface-container-high border border-outline-variant/20 text-on-surface text-sm focus:outline-none focus:border-primary/50 transition-all"
        >
          <option value="">Select a vehicle to list...</option>
          {vehicles.map((v) => (
            <option key={v.id} value={v.id}>{v.make} {v.model} {v.year} — {v.exteriorColor}</option>
          ))}
        </select>
        <button
          onClick={handleCreate}
          disabled={creating || !selectedVehicle}
          className="flex items-center gap-2 px-5 py-2.5 bg-primary text-on-primary rounded-xl font-bold text-sm hover:shadow-[0_0_20px_rgba(173,198,255,0.4)] transition-all disabled:opacity-50 shrink-0"
        >
          <span className={`material-symbols-outlined text-lg ${creating ? "animate-spin" : ""}`}>
            {creating ? "progress_activity" : "add_circle"}
          </span>
          {creating ? "Creating Listing..." : "Create Listing"}
        </button>
      </div>

      {creating && (
        <div className="p-3 rounded-xl bg-primary/10 border border-primary/20 text-primary text-sm flex items-center gap-2">
          <span className="material-symbols-outlined text-lg animate-spin">progress_activity</span>
          Generating descriptions for 5 platforms + calculating pricing... (30-60 seconds)
        </div>
      )}

      {result && !result.error && !creating && (
        <div className="p-3 rounded-xl bg-emerald-400/10 border border-emerald-400/20 text-emerald-400 text-sm">
          <div className="flex items-center gap-2 mb-1">
            <span className="material-symbols-outlined text-lg">check_circle</span>
            Listing created in {((result.duration || 0) / 1000).toFixed(0)}s
          </div>
          <p className="text-xs opacity-80">
            Published to {result.platformsPublished} platforms · Price: €{result.initialPrice?.toLocaleString()} · Strategy: {result.pricingStrategy}
          </p>
        </div>
      )}

      {result?.error && !creating && (
        <div className="p-3 rounded-xl bg-red-400/10 border border-red-400/20 text-red-400 text-sm flex items-center gap-2">
          <span className="material-symbols-outlined text-lg">error</span>
          {result.message}
        </div>
      )}
    </div>
  );
}
