"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import InquiryForm from "./_components/InquiryForm";

export default function VehicleDetailPage({ params }) {
  const { id } = use(params);
  const [vehicle, setVehicle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showDe, setShowDe] = useState(true);

  useEffect(() => {
    fetch(`/api/public/vehicles/${id}`)
      .then((r) => { if (!r.ok) throw new Error("Not found"); return r.json(); })
      .then(setVehicle)
      .catch(() => setVehicle(null))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <span className="material-symbols-outlined text-primary text-4xl animate-spin">progress_activity</span>
      </div>
    );
  }

  if (!vehicle) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-20 text-center">
        <span className="material-symbols-outlined text-5xl text-on-surface-variant/20 mb-4 block">directions_car</span>
        <h2 className="font-headline text-2xl font-bold mb-2">Vehicle Not Found</h2>
        <p className="text-on-surface-variant mb-6">This vehicle may have been sold or is no longer available.</p>
        <Link href="/showroom" className="px-6 py-3 bg-primary text-on-primary rounded-xl font-bold">Back to Showroom</Link>
      </div>
    );
  }

  const v = vehicle.vehicle;
  const spec = vehicle.specSheet;
  const fmt = (n) => n != null ? `€${n.toLocaleString()}` : "Price on request";

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-on-surface-variant mb-6">
        <Link href="/showroom" className="hover:text-primary transition-colors">Showroom</Link>
        <span className="material-symbols-outlined text-xs">chevron_right</span>
        <span className="text-on-surface">{v.make} {v.model}</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Content — 2 columns */}
        <div className="lg:col-span-2 space-y-6">
          {/* Hero Image */}
          <div className="h-64 sm:h-96 bg-surface-container rounded-3xl flex items-center justify-center relative overflow-hidden">
            <span className="material-symbols-outlined text-7xl text-on-surface-variant/15">directions_car</span>
            <div className="absolute top-4 left-4 flex gap-2">
              <span className="px-3 py-1 rounded-full bg-primary/90 text-on-primary text-xs font-bold backdrop-blur-sm">{v.driveSide}</span>
              {v.mileageKm && <span className="px-3 py-1 rounded-full bg-surface/80 text-on-surface text-xs font-bold backdrop-blur-sm">{v.mileageKm.toLocaleString()} km</span>}
            </div>
          </div>

          {/* Title + Price (mobile) */}
          <div className="lg:hidden">
            <h1 className="font-headline text-2xl sm:text-3xl font-bold">{v.make} {v.model}</h1>
            <p className="text-on-surface-variant mt-1">{v.year} · {v.exteriorColor} · {v.driveSide}</p>
            <p className="font-headline text-3xl font-bold text-primary mt-3">{fmt(vehicle.price)}</p>
          </div>

          {/* Description */}
          <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-5 sm:p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-headline font-bold text-lg">Description</h2>
              <div className="flex gap-1 p-0.5 bg-surface-container-high rounded-lg">
                <button onClick={() => setShowDe(true)} className={`px-3 py-1 rounded text-xs font-bold transition-all ${showDe ? "bg-primary text-on-primary" : "text-on-surface-variant"}`}>DE</button>
                <button onClick={() => setShowDe(false)} className={`px-3 py-1 rounded text-xs font-bold transition-all ${!showDe ? "bg-primary text-on-primary" : "text-on-surface-variant"}`}>EN</button>
              </div>
            </div>
            <div className="text-sm text-on-surface-variant leading-relaxed whitespace-pre-wrap">
              {showDe
                ? (vehicle.content?.descriptionDe || "Beschreibung folgt in Kürze.")
                : (vehicle.content?.descriptionEn || "Description coming soon.")}
            </div>
          </div>

          {/* Specifications */}
          {spec && (
            <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-5 sm:p-6">
              <h2 className="font-headline font-bold text-lg mb-4">Specifications</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {[
                  { label: "Engine", value: spec.engine, icon: "speed" },
                  { label: "Power", value: spec.power, icon: "bolt" },
                  { label: "Transmission", value: spec.transmission, icon: "settings" },
                  { label: "Drive", value: spec.driveType || spec.drive_type, icon: "swap_driving_apps_wheel" },
                  { label: "Fuel", value: spec.fuel, icon: "local_gas_station" },
                  { label: "0-100 km/h", value: spec.acceleration0To100 || spec.acceleration_0_100, icon: "timer" },
                  { label: "Top Speed", value: spec.topSpeed || spec.top_speed, icon: "speed" },
                  { label: "Weight", value: spec.weight_kg ? `${spec.weight_kg} kg` : spec.weightKg, icon: "scale" },
                  { label: "CO₂", value: spec.co2 ? `${spec.co2} g/km` : null, icon: "eco" },
                ].filter((s) => s.value).map((s) => (
                  <div key={s.label} className="flex items-start gap-2">
                    <span className="material-symbols-outlined text-primary text-lg mt-0.5">{s.icon}</span>
                    <div>
                      <p className="text-[10px] uppercase text-on-surface-variant tracking-wider">{s.label}</p>
                      <p className="text-sm font-bold">{s.value}</p>
                    </div>
                  </div>
                ))}
              </div>

              {spec.notable_options?.length > 0 && (
                <div className="mt-5 pt-5 border-t border-outline-variant/10">
                  <h3 className="text-xs uppercase text-on-surface-variant tracking-wider mb-3">Notable Options</h3>
                  <div className="flex flex-wrap gap-2">
                    {spec.notable_options.map((opt, i) => (
                      <span key={i} className="px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium">{opt}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Highlights */}
          {(vehicle.content?.highlightsDe?.length > 0 || vehicle.content?.highlightsEn?.length > 0) && (
            <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-5 sm:p-6">
              <h2 className="font-headline font-bold text-lg mb-4">Highlights</h2>
              <ul className="space-y-2">
                {(showDe ? vehicle.content?.highlightsDe : vehicle.content?.highlightsEn)?.map((h, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <span className="material-symbols-outlined text-emerald-400 text-lg shrink-0">check_circle</span>
                    <span>{h}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Also listed on */}
          {vehicle.platforms?.length > 0 && (
            <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-5 sm:p-6">
              <h2 className="font-headline font-bold text-lg mb-4">Also Listed On</h2>
              <div className="flex flex-wrap gap-3">
                {vehicle.platforms.map((p, i) => (
                  <a key={i} href={p.url} target="_blank" rel="noopener noreferrer"
                    className="px-4 py-2 rounded-xl bg-surface-container-high border border-outline-variant/10 text-sm font-medium hover:border-primary/30 transition-all flex items-center gap-2">
                    <span className="material-symbols-outlined text-sm text-primary">open_in_new</span>
                    {p.platform}
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar — Price + Inquiry */}
        <div className="space-y-6">
          {/* Price Card (desktop) */}
          <div className="hidden lg:block bg-surface-container rounded-2xl border border-outline-variant/10 p-6 sticky top-24">
            <h1 className="font-headline text-2xl font-bold mb-1">{v.make} {v.model}</h1>
            <p className="text-on-surface-variant text-sm mb-4">{v.year} · {v.exteriorColor} · {v.driveSide}</p>

            <p className="font-headline text-4xl font-bold text-primary mb-1">{fmt(vehicle.price)}</p>
            <p className="text-xs text-on-surface-variant mb-6">incl. VAT · Import from international markets</p>

            <div className="space-y-3 mb-6">
              {[
                { icon: "speed", label: "Mileage", value: v.mileageKm ? `${v.mileageKm.toLocaleString()} km` : "—" },
                { icon: "local_gas_station", label: "Engine", value: v.engineSpec || spec?.engine || "—" },
                { icon: "swap_driving_apps_wheel", label: "Drive Side", value: v.driveSide },
                { icon: "palette", label: "Color", value: `${v.exteriorColor} / ${v.interiorColor || "Leather"}` },
              ].map((item) => (
                <div key={item.label} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 text-on-surface-variant">
                    <span className="material-symbols-outlined text-sm">{item.icon}</span>
                    {item.label}
                  </span>
                  <span className="font-bold">{item.value}</span>
                </div>
              ))}
            </div>

            <InquiryForm listingId={id} vehicleName={`${v.make} ${v.model} ${v.year}`} />
          </div>

          {/* Mobile Inquiry */}
          <div className="lg:hidden bg-surface-container rounded-2xl border border-outline-variant/10 p-5">
            <InquiryForm listingId={id} vehicleName={`${v.make} ${v.model} ${v.year}`} />
          </div>
        </div>
      </div>
    </div>
  );
}
