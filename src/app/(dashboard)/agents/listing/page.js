import Link from "next/link";
import { getAllListings, getAgentStatus } from "@/lib/agents/listing/storage";
import { vehicles } from "@/lib/mock-data";
import CreateListingButton from "./_components/CreateListingButton";

const STATUS_STYLES = { ACTIVE: "bg-emerald-400/15 text-emerald-400", SOLD: "bg-primary/15 text-primary", DRAFT: "bg-amber-400/15 text-amber-400", PAUSED: "bg-slate-400/10 text-slate-400" };

export default function ListingAgentPage() {
  const status = getAgentStatus();
  const data = getAllListings();
  const listings = data.listings || [];
  const hasData = listings.length > 0;

  const activeListings = listings.filter((l) => l.status === "ACTIVE");
  const soldListings = listings.filter((l) => l.status === "SOLD");

  // Vehicles available for listing (from mock pipeline data — in production, from Logistics Agent)
  const readyVehicles = vehicles.filter((v) => v.currentStage === "READY_FOR_SALE" || v.currentStage === "TUV");

  const fmt = (n) => n != null ? `€${n.toLocaleString()}` : "—";

  return (
    <div className="space-y-6">
      <Link href="/agents" className="text-sm text-on-surface-variant hover:text-primary transition-colors flex items-center gap-1">
        <span className="material-symbols-outlined text-sm">arrow_back</span> All Agents
      </Link>

      {/* Header */}
      <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-4 sm:p-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-5">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
              <span className="material-symbols-outlined text-primary text-2xl">edit_note</span>
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="font-headline text-xl font-bold">Listing & Presentation Agent</h2>
                <span className="px-2 py-0.5 rounded-full bg-surface-container-high text-[10px] text-on-surface-variant font-mono">listing</span>
                <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${status.status === "ONLINE" ? "bg-emerald-400/15 text-emerald-400" : "bg-slate-400/10 text-slate-400"}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${status.status === "ONLINE" ? "bg-emerald-400" : "bg-slate-400"}`} />
                  {status.status || "IDLE"}
                </span>
              </div>
              <p className="text-xs text-on-surface-variant mt-0.5">
                Generates 5-platform listings with AI descriptions, dynamic pricing, and auto-reductions
              </p>
            </div>
          </div>
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-400/5 border border-emerald-400/10">
            <span className="font-headline font-bold text-lg text-emerald-400">{activeListings.length}</span>
            <span className="text-[10px] text-emerald-400 uppercase">Active</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/5 border border-primary/10">
            <span className="font-headline font-bold text-lg text-primary">{soldListings.length}</span>
            <span className="text-[10px] text-primary uppercase">Sold</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-container-high/30 border border-outline-variant/10">
            <span className="font-headline font-bold text-lg">{status.listingsCreatedTotal || 0}</span>
            <span className="text-[10px] text-on-surface-variant uppercase">Total Created</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-container-high/30 border border-outline-variant/10">
            <span className="font-headline font-bold text-lg">{readyVehicles.length}</span>
            <span className="text-[10px] text-on-surface-variant uppercase">Ready to List</span>
          </div>
        </div>

        {/* Create listing */}
        <CreateListingButton vehicles={readyVehicles} />
      </div>

      {/* Active Listings */}
      {hasData ? (
        <div className="space-y-4">
          <h3 className="font-headline font-bold text-lg">Active Listings ({activeListings.length})</h3>
          {activeListings.map((l) => (
            <div key={l.id} className="bg-surface-container rounded-2xl border border-outline-variant/10 p-4 sm:p-5">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <h4 className="font-headline font-bold">{l.vehicle?.make} {l.vehicle?.model} {l.vehicle?.year}</h4>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${STATUS_STYLES[l.status]}`}>{l.status}</span>
                    {l.aiPowered && <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-bold">AI</span>}
                  </div>
                  <p className="text-xs text-on-surface-variant">{l.vehicle?.exteriorColor} · {l.vehicle?.driveSide} · {l.vehicle?.mileageKm?.toLocaleString()} km</p>
                  <p className="text-xs text-on-surface-variant mt-1">
                    Published to {l.publishing?.totalPublished || 0} platforms ·
                    Strategy: {l.pricing?.pricing_strategy || "N/A"} ·
                    Day {l.daysOnMarket || 0}
                  </p>
                </div>

                <div className="flex items-center gap-4 sm:gap-6">
                  <div className="text-center">
                    <p className="text-[10px] uppercase text-on-surface-variant">Current Price</p>
                    <p className="font-headline text-xl font-bold text-primary">{fmt(l.currentPrice)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] uppercase text-on-surface-variant">Margin</p>
                    <p className="font-headline font-bold text-emerald-400">{fmt(l.pricing?.expectedMargin)}</p>
                  </div>
                </div>
              </div>

              {/* Platforms */}
              <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-outline-variant/10">
                {Object.entries(l.platforms || {}).map(([pid, p]) => (
                  <div key={pid} className={`px-2 py-1 rounded-lg text-[10px] font-bold ${p.status === "PUBLISHED" ? "bg-emerald-400/10 text-emerald-400" : "bg-slate-400/10 text-slate-400"}`}>
                    {p.platform || pid} {p.status === "PUBLISHED" ? "✓" : `(${p.reason?.substring(0, 20)})`}
                  </div>
                ))}
              </div>

              {/* Price history */}
              {l.priceHistory?.length > 1 && (
                <div className="mt-2 text-xs text-on-surface-variant">
                  Price history: {l.priceHistory.map((ph, i) => (
                    <span key={i}>{i > 0 && " → "}{fmt(ph.changedTo || ph.price)}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-12 text-center">
          <span className="material-symbols-outlined text-4xl text-on-surface-variant/30 mb-3 block">edit_note</span>
          <h3 className="font-headline font-bold text-lg mb-2">No Listings Yet</h3>
          <p className="text-sm text-on-surface-variant">Select a ready vehicle above and click &quot;Create Listing&quot; to generate AI-powered descriptions and publish across 5 platforms.</p>
        </div>
      )}
    </div>
  );
}
