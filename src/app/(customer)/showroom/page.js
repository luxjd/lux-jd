"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

const MAKES = ["All", "Ferrari", "Porsche", "Mercedes-AMG", "Lamborghini", "Bentley", "Aston Martin", "BMW M", "Jaguar", "Maserati", "Range Rover"];
const SORT_OPTIONS = [
  { value: "newest", label: "Newest First" },
  { value: "price-low", label: "Price: Low → High" },
  { value: "price-high", label: "Price: High → Low" },
  { value: "year-new", label: "Year: Newest" },
  { value: "mileage-low", label: "Mileage: Lowest" },
];

export default function ShowroomPage() {
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedMake, setSelectedMake] = useState("All");
  const [sortBy, setSortBy] = useState("newest");
  const [search, setSearch] = useState("");
  const [savedIds, setSavedIds] = useState([]);
  const [customer, setCustomer] = useState(null);

  useEffect(() => {
    fetch("/api/public/auth/me").then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?.authenticated) { setCustomer(d.customer); setSavedIds(d.customer.savedVehicles || []); } })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("make")) setSelectedMake(params.get("make"));
  }, []);

  useEffect(() => {
    setLoading(true);
    const params = selectedMake !== "All" ? `?make=${selectedMake}` : "";
    fetch(`/api/public/showroom${params}`)
      .then((r) => r.json())
      .then((data) => setVehicles(data.vehicles || []))
      .catch(() => setVehicles([]))
      .finally(() => setLoading(false));
  }, [selectedMake]);

  const filtered = vehicles
    .filter((v) => {
      if (!search) return true;
      const s = search.toLowerCase();
      return `${v.vehicle.make} ${v.vehicle.model} ${v.vehicle.year} ${v.vehicle.exteriorColor}`.toLowerCase().includes(s);
    })
    .sort((a, b) => {
      switch (sortBy) {
        case "price-low": return (a.price || 0) - (b.price || 0);
        case "price-high": return (b.price || 0) - (a.price || 0);
        case "year-new": return (b.vehicle.year || 0) - (a.vehicle.year || 0);
        case "mileage-low": return (a.vehicle.mileageKm || 0) - (b.vehicle.mileageKm || 0);
        default: return 0;
      }
    });

  const toggleSave = useCallback(async (e, listingId) => {
    e.preventDefault();
    e.stopPropagation();
    if (!customer) { window.location.href = "/customer-login"; return; }
    const isSaved = savedIds.includes(listingId);
    setSavedIds((prev) => isSaved ? prev.filter((id) => id !== listingId) : [...prev, listingId]);
    try {
      const res = await fetch("/api/public/account/save", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ listingId, action: isSaved ? "unsave" : "save" }) });
      const data = await res.json();
      if (data.savedVehicles) setSavedIds(data.savedVehicles);
    } catch {}
  }, [customer, savedIds]);

  const fmt = (n) => n != null ? `€${n.toLocaleString()}` : "Price on request";

  return (
    <div>
      {/* Hero */}
      <div className="bg-surface-container-lowest py-10 sm:py-14 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto">
          <h1 className="font-headline text-3xl sm:text-5xl font-bold mb-3">Our <span className="text-primary">Showroom</span></h1>
          <p className="text-on-surface-variant text-base sm:text-lg max-w-2xl">Carefully sourced luxury vehicles from international markets. Inspected, imported, and prepared to the highest standards.</p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {/* Search + Sort */}
        <div className="flex flex-col sm:flex-row gap-3 mb-5">
          <div className="relative flex-1">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-xl">search</span>
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by make, model, color..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-surface-container border border-outline-variant/10 text-on-surface text-sm placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary/50 transition-all" />
          </div>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}
            className="px-4 py-2.5 rounded-xl bg-surface-container border border-outline-variant/10 text-on-surface text-sm focus:outline-none focus:border-primary/50">
            {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        {/* Brand Filters */}
        <div className="flex flex-wrap gap-1.5 sm:gap-2 mb-6 overflow-x-auto pb-1">
          {MAKES.map((make) => (
            <button key={make} onClick={() => setSelectedMake(make)}
              className={`px-3 py-1.5 rounded-xl text-xs sm:text-sm font-medium transition-all whitespace-nowrap ${selectedMake === make ? "bg-primary text-on-primary shadow-[0_0_10px_rgba(173,198,255,0.3)]" : "bg-surface-container border border-outline-variant/10 text-on-surface-variant hover:text-on-surface hover:border-primary/30"}`}>
              {make}
            </button>
          ))}
        </div>

        {/* Results */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="bg-surface-container rounded-2xl border border-outline-variant/10 overflow-hidden animate-pulse">
                <div className="h-44 sm:h-52 bg-surface-container-high" />
                <div className="p-5 space-y-3">
                  <div className="h-5 bg-surface-container-high rounded w-3/4" />
                  <div className="h-4 bg-surface-container-high rounded w-1/2" />
                  <div className="flex gap-2 mt-2"><div className="h-5 bg-surface-container-high rounded w-16" /><div className="h-5 bg-surface-container-high rounded w-16" /></div>
                  <div className="h-7 bg-surface-container-high rounded w-1/3 mt-3" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 sm:py-20">
            <span className="material-symbols-outlined text-5xl text-on-surface-variant/20 mb-4 block">directions_car</span>
            <h3 className="font-headline text-xl font-bold mb-2">{search ? "No Matching Vehicles" : selectedMake !== "All" ? `No ${selectedMake} Available` : "Showroom Coming Soon"}</h3>
            <p className="text-on-surface-variant max-w-md mx-auto text-sm">{search ? "Try different search terms." : "New vehicles added regularly."}</p>
            {(search || selectedMake !== "All") && (
              <button onClick={() => { setSearch(""); setSelectedMake("All"); }} className="mt-4 px-6 py-2 bg-primary text-on-primary rounded-xl font-bold text-sm">Clear Filters</button>
            )}
          </div>
        ) : (
          <>
            <p className="text-sm text-on-surface-variant mb-4">{filtered.length} vehicle{filtered.length !== 1 ? "s" : ""}</p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
              {filtered.map((v) => {
                const isSaved = savedIds.includes(v.id);
                return (
                  <div key={v.id} className="group relative">
                    {/* Save button */}
                    <button onClick={(e) => toggleSave(e, v.id)}
                      className={`absolute top-3 right-3 z-10 w-9 h-9 rounded-full backdrop-blur-sm flex items-center justify-center transition-all ${isSaved ? "bg-secondary/80 text-on-secondary" : "bg-black/40 text-white hover:bg-black/60"}`}
                      aria-label={isSaved ? "Saved" : "Save"}>
                      <span className="material-symbols-outlined text-lg" style={{ fontVariationSettings: isSaved ? "'FILL' 1" : "'FILL' 0" }}>bookmark</span>
                    </button>

                    <Link href={`/vehicles/${v.id}`}
                      className="block bg-surface-container rounded-2xl border border-outline-variant/10 overflow-hidden hover:border-primary/30 transition-all duration-300 hover:shadow-[0_10px_40px_rgba(0,0,0,0.2)] hover:-translate-y-1">
                      <div className="h-44 sm:h-52 bg-surface-container-high flex items-center justify-center relative overflow-hidden">
                        <span className="material-symbols-outlined text-5xl text-on-surface-variant/15 group-hover:scale-110 transition-transform duration-500">directions_car</span>
                        <div className="absolute top-3 left-3 flex gap-2">
                          <span className="px-2.5 py-1 rounded-full bg-primary/90 text-on-primary text-[10px] font-bold backdrop-blur-sm">{v.vehicle.driveSide}</span>
                          {v.daysOnMarket <= 7 && <span className="px-2.5 py-1 rounded-full bg-secondary/90 text-on-secondary text-[10px] font-bold backdrop-blur-sm">New</span>}
                        </div>
                      </div>

                      <div className="p-4 sm:p-5">
                        <h3 className="font-headline text-base sm:text-lg font-bold mb-1 group-hover:text-primary transition-colors">{v.vehicle.make} {v.vehicle.model}</h3>
                        <p className="text-xs sm:text-sm text-on-surface-variant mb-3">{v.vehicle.year} · {v.vehicle.mileageKm?.toLocaleString() || "—"} km · {v.vehicle.exteriorColor}</p>

                        {v.highlights?.length > 0 && (
                          <div className="flex flex-wrap gap-1 mb-3">
                            {v.highlights.slice(0, 2).map((h, i) => (
                              <span key={i} className="px-2 py-0.5 rounded-full bg-surface-container-high text-[9px] sm:text-[10px] text-on-surface-variant truncate max-w-[140px]">{typeof h === "string" ? h : ""}</span>
                            ))}
                          </div>
                        )}

                        <div className="flex items-center justify-between pt-3 border-t border-outline-variant/10">
                          <p className="font-headline text-lg sm:text-xl font-bold text-primary">{fmt(v.price)}</p>
                          <span className="text-xs text-primary font-bold flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-300">Details <span className="material-symbols-outlined text-xs">arrow_forward</span></span>
                        </div>
                      </div>
                    </Link>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
