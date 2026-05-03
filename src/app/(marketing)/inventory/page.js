"use client";

import { useState, useEffect } from "react";
import MarketingNav from "../_components/MarketingNav";
import MarketingFooter from "../_components/MarketingFooter";

export default function InventoryPage() {
  const [vehicles, setVehicles] = useState([]);
  const [filter, setFilter] = useState("ALL");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/agents/listing/listings")
      .then((r) => r.json())
      .then((data) => {
        setVehicles(data.listings || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const activeListing = vehicles.filter((v) => v.status === "ACTIVE" || v.status === "PUBLISHED");
  const brands = [...new Set(activeListing.map((v) => v.vehicle?.make).filter(Boolean))];
  const filtered = filter === "ALL" ? activeListing : activeListing.filter((v) => v.vehicle?.make === filter);

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-on-surface flex flex-col">
      <MarketingNav />

      <main className="pt-24 pb-16 px-6 flex-1">
        <div className="max-w-7xl mx-auto">
          <h1 className="font-headline text-4xl md:text-6xl font-bold mb-4">
            Current <span className="text-secondary">Inventory</span>
          </h1>
          <p className="text-on-surface-variant text-lg mb-10">
            Premium vehicles sourced from Japan, ready for European buyers.
          </p>

          {/* Brand filter */}
          <div className="flex flex-wrap gap-2 mb-8">
            <button onClick={() => setFilter("ALL")}
              className={`px-4 py-2 rounded-full text-sm font-bold transition-colors ${filter === "ALL" ? "bg-primary text-on-primary" : "bg-surface-container border border-outline-variant/10 text-on-surface-variant hover:text-on-surface"}`}>
              All ({activeListing.length})
            </button>
            {brands.map((brand) => (
              <button key={brand} onClick={() => setFilter(brand)}
                className={`px-4 py-2 rounded-full text-sm font-bold transition-colors ${filter === brand ? "bg-primary text-on-primary" : "bg-surface-container border border-outline-variant/10 text-on-surface-variant hover:text-on-surface"}`}>
                {brand} ({activeListing.filter((v) => v.vehicle?.make === brand).length})
              </button>
            ))}
          </div>

          {loading ? (
            <div className="text-center py-20">
              <span className="material-symbols-outlined text-primary text-4xl animate-spin">progress_activity</span>
            </div>
          ) : filtered.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filtered.map((listing, i) => {
                const v = listing.vehicle || {};
                return (
                  <div key={i} className="bg-surface-container rounded-2xl border border-outline-variant/10 overflow-hidden hover:border-primary/30 transition-all group">
                    <div className="h-48 bg-surface-container-high flex items-center justify-center">
                      <span className="material-symbols-outlined text-on-surface-variant/20 text-6xl">directions_car</span>
                    </div>
                    <div className="p-6">
                      <h3 className="font-headline text-xl font-bold mb-1">{v.make} {v.model} {v.year}</h3>
                      <p className="text-on-surface-variant text-sm mb-4">
                        {v.mileageKm ? `${(v.mileageKm / 1000).toFixed(0)}K km` : ""} · {v.driveSide || "LHD"} · {v.exteriorColor || ""}
                      </p>
                      {listing.pricing?.initial_price_eur && (
                        <p className="font-headline text-2xl font-bold text-primary">
                          €{listing.pricing.initial_price_eur.toLocaleString()}
                        </p>
                      )}
                      <div className="flex gap-2 mt-4">
                        {listing.platforms?.filter((p) => p.status === "PUBLISHED").map((p, j) => (
                          <a key={j} href={p.listingUrl || "#"} target="_blank" rel="noopener noreferrer"
                            className="text-xs px-2 py-1 rounded bg-surface-container-high text-on-surface-variant hover:text-primary transition-colors">
                            {p.platform}
                          </a>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-20">
              <span className="material-symbols-outlined text-on-surface-variant/30 text-6xl mb-4 block">inventory_2</span>
              <h3 className="font-headline text-xl font-bold mb-2">No Vehicles Currently Listed</h3>
              <p className="text-on-surface-variant text-sm max-w-md mx-auto">
                Our inventory updates regularly as new vehicles complete the import process.
                Contact us to be notified when new stock arrives.
              </p>
            </div>
          )}
        </div>
      </main>

      <MarketingFooter />
    </div>
  );
}
