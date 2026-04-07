"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const STATUS_STYLES = {
  NEW: "bg-blue-400/15 text-blue-400", CONTACTED: "bg-amber-400/15 text-amber-400",
  QUALIFIED: "bg-emerald-400/15 text-emerald-400", CONVERTED: "bg-primary/15 text-primary",
  ESCALATED: "bg-red-400/15 text-red-400", LOST: "bg-slate-400/10 text-slate-400",
};

export default function AccountPage() {
  const router = useRouter();
  const [customer, setCustomer] = useState(null);
  const [inquiries, setInquiries] = useState([]);
  const [tracking, setTracking] = useState([]);
  const [savedListings, setSavedListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("inquiries");
  const [replyText, setReplyText] = useState({});
  const [replying, setReplying] = useState(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/public/auth/me").then((r) => { if (!r.ok) throw new Error(); return r.json(); }),
      fetch("/api/public/account/inquiries").then((r) => r.json()).catch(() => ({ inquiries: [] })),
      fetch("/api/public/account/tracking").then((r) => r.json()).catch(() => ({ vehicles: [] })),
      fetch("/api/public/showroom").then((r) => r.json()).catch(() => ({ vehicles: [] })),
    ]).then(([me, inq, track, showroom]) => {
      if (!me.authenticated) { router.push("/customer-login"); return; }
      setCustomer(me.customer);
      setInquiries(inq.inquiries || []);
      setTracking(track.vehicles || []);
      // Filter showroom to only saved vehicles
      const savedIds = me.customer.savedVehicles || [];
      setSavedListings((showroom.vehicles || []).filter((v) => savedIds.includes(v.id)));
    }).catch(() => router.push("/customer-login"))
      .finally(() => setLoading(false));
  }, [router]);

  const handleLogout = async () => {
    await fetch("/api/public/auth/me", { method: "DELETE" });
    router.push("/showroom");
  };

  const handleReply = async (inquiryId, vehicleName) => {
    const text = replyText[inquiryId];
    if (!text?.trim()) return;

    setReplying(inquiryId);
    try {
      // Find the listing ID from the inquiry or use a generic approach
      const res = await fetch("/api/public/inquiry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listingId: inquiryId, // Will fallback gracefully
          name: customer.name,
          email: customer.email,
          message: text,
        }),
      });
      const data = await res.json();

      // Add to local conversation
      setInquiries((prev) => prev.map((inq) => {
        if (inq.id !== inquiryId) return inq;
        return {
          ...inq,
          messages: [
            ...(inq.messages || []),
            { role: "customer", text, timestamp: new Date().toISOString() },
            ...(data.response ? [{ role: "concierge", text: data.response, timestamp: new Date().toISOString() }] : []),
          ],
        };
      }));

      setReplyText((prev) => ({ ...prev, [inquiryId]: "" }));
    } catch {}
    finally { setReplying(null); }
  };

  const handleUnsave = async (listingId) => {
    setSavedListings((prev) => prev.filter((v) => v.id !== listingId));
    await fetch("/api/public/account/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ listingId, action: "unsave" }),
    });
  };

  const fmt = (n) => n != null ? `€${n.toLocaleString()}` : "—";

  if (loading) return <div className="flex items-center justify-center min-h-[60vh]"><span className="material-symbols-outlined text-primary text-4xl animate-spin">progress_activity</span></div>;
  if (!customer) return null;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 sm:mb-8">
        <div className="flex items-center gap-3 sm:gap-4">
          <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-primary/20 flex items-center justify-center">
            <span className="text-primary text-lg sm:text-xl font-bold">{customer.name?.charAt(0)}</span>
          </div>
          <div>
            <h1 className="font-headline text-lg sm:text-xl font-bold">{customer.name}</h1>
            <p className="text-xs sm:text-sm text-on-surface-variant">{customer.email}</p>
          </div>
        </div>
        <div className="flex gap-2 sm:gap-3">
          <Link href="/showroom" className="px-4 py-2 bg-primary text-on-primary rounded-xl text-sm font-bold">Browse Cars</Link>
          <button onClick={handleLogout} className="px-4 py-2 border border-outline-variant/20 rounded-xl text-sm font-bold text-on-surface-variant hover:text-on-surface transition-colors">Sign Out</button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-surface-container-high/30 rounded-xl overflow-x-auto mb-6">
        {[
          { key: "inquiries", label: `Inquiries (${inquiries.length})`, icon: "chat" },
          { key: "tracking", label: `Tracking (${tracking.length})`, icon: "local_shipping" },
          { key: "saved", label: `Saved (${savedListings.length})`, icon: "bookmark" },
        ].map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-bold transition-all whitespace-nowrap ${tab === t.key ? "bg-primary text-on-primary" : "text-on-surface-variant hover:text-on-surface"}`}>
            <span className="material-symbols-outlined text-sm">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      {/* ─── INQUIRIES TAB ─── */}
      {tab === "inquiries" && (
        <div className="space-y-4">
          {inquiries.length === 0 ? (
            <div className="text-center py-16 bg-surface-container rounded-2xl border border-outline-variant/10">
              <span className="material-symbols-outlined text-4xl text-on-surface-variant/20 mb-3 block">chat</span>
              <h3 className="font-headline font-bold text-lg mb-2">No Inquiries Yet</h3>
              <p className="text-sm text-on-surface-variant mb-4">Browse our showroom and ask about a vehicle you like.</p>
              <Link href="/showroom" className="px-6 py-2 bg-primary text-on-primary rounded-xl text-sm font-bold">Browse Showroom</Link>
            </div>
          ) : (
            inquiries.map((inq) => (
              <div key={inq.id} className="bg-surface-container rounded-2xl border border-outline-variant/10 p-4 sm:p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-headline font-bold text-sm sm:text-base">{inq.vehicle}</h3>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${STATUS_STYLES[inq.status] || STATUS_STYLES.NEW}`}>{inq.status}</span>
                </div>

                {/* Conversation */}
                <div className="space-y-2 mb-3 max-h-80 overflow-y-auto">
                  {inq.messages?.map((msg, i) => (
                    <div key={i} className={`p-3 rounded-xl text-sm ${msg.role === "customer" ? "bg-surface-container-high/50 ml-4 sm:ml-8" : "bg-primary/5 border border-primary/10 mr-4 sm:mr-8"}`}>
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="material-symbols-outlined text-xs">{msg.role === "customer" ? "person" : "auto_awesome"}</span>
                        <span className="text-[10px] text-on-surface-variant font-bold uppercase">{msg.role === "customer" ? "You" : "LuxJD Concierge"}</span>
                        <span className="text-[10px] text-on-surface-variant ml-auto">{msg.timestamp ? new Date(msg.timestamp).toLocaleString() : ""}</span>
                      </div>
                      <p className="whitespace-pre-wrap text-xs sm:text-sm">{msg.text}</p>
                    </div>
                  ))}
                </div>

                {/* Reply input */}
                <div className="flex gap-2 pt-3 border-t border-outline-variant/10">
                  <input
                    type="text"
                    value={replyText[inq.id] || ""}
                    onChange={(e) => setReplyText((prev) => ({ ...prev, [inq.id]: e.target.value }))}
                    onKeyDown={(e) => { if (e.key === "Enter") handleReply(inq.id, inq.vehicle); }}
                    placeholder="Type a reply..."
                    className="flex-1 px-3 py-2 rounded-xl bg-surface-container-high border border-outline-variant/20 text-on-surface text-sm placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary/50 transition-all"
                  />
                  <button
                    onClick={() => handleReply(inq.id, inq.vehicle)}
                    disabled={replying === inq.id || !replyText[inq.id]?.trim()}
                    className="px-4 py-2 bg-primary text-on-primary rounded-xl text-sm font-bold disabled:opacity-50 flex items-center gap-1"
                  >
                    <span className={`material-symbols-outlined text-sm ${replying === inq.id ? "animate-spin" : ""}`}>
                      {replying === inq.id ? "progress_activity" : "send"}
                    </span>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ─── TRACKING TAB ─── */}
      {tab === "tracking" && (
        <div className="space-y-4">
          {tracking.length === 0 ? (
            <div className="text-center py-16 bg-surface-container rounded-2xl border border-outline-variant/10">
              <span className="material-symbols-outlined text-4xl text-on-surface-variant/20 mb-3 block">local_shipping</span>
              <h3 className="font-headline font-bold text-lg mb-2">No Vehicles to Track</h3>
              <p className="text-sm text-on-surface-variant">Once you purchase a vehicle, you&apos;ll see delivery progress here.</p>
            </div>
          ) : (
            tracking.map((v) => {
              const stages = v.stages || [];
              const currentIdx = stages.indexOf(v.currentStage);
              return (
                <div key={v.id} className="bg-surface-container rounded-2xl border border-outline-variant/10 p-4 sm:p-5">
                  <h3 className="font-headline font-bold text-lg mb-1">{v.make} {v.model} {v.year}</h3>
                  <p className="text-sm text-on-surface-variant mb-4">{v.color} · Status: <span className="text-primary font-bold">{v.currentStage?.replace(/_/g, " ")}</span></p>

                  {/* Progress */}
                  <div className="flex gap-0.5 mb-2">
                    {stages.map((stage, i) => (
                      <div key={stage} className={`flex-1 h-2 rounded-full transition-all ${i < currentIdx ? "bg-emerald-400" : i === currentIdx ? "bg-primary animate-pulse" : "bg-surface-container-high"}`} title={stage.replace(/_/g, " ")} />
                    ))}
                  </div>
                  <div className="flex justify-between text-[9px] text-on-surface-variant mb-3">
                    <span>Sourced</span>
                    <span>Ready for Sale</span>
                  </div>

                  {v.recentEvents?.length > 0 && (
                    <div className="space-y-1 pt-3 border-t border-outline-variant/10">
                      <p className="text-[10px] uppercase text-on-surface-variant tracking-wider mb-1">Recent Updates</p>
                      {v.recentEvents.slice(0, 5).map((e, i) => (
                        <div key={i} className="flex items-start gap-2 text-xs text-on-surface-variant">
                          <span className="material-symbols-outlined text-primary text-xs mt-0.5 shrink-0">arrow_right</span>
                          <span>{e.message}</span>
                          <span className="ml-auto shrink-0 text-[10px]">{new Date(e.timestamp).toLocaleDateString()}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ─── SAVED TAB ─── */}
      {tab === "saved" && (
        <div>
          {savedListings.length === 0 ? (
            <div className="text-center py-16 bg-surface-container rounded-2xl border border-outline-variant/10">
              <span className="material-symbols-outlined text-4xl text-on-surface-variant/20 mb-3 block">bookmark</span>
              <h3 className="font-headline font-bold text-lg mb-2">No Saved Vehicles</h3>
              <p className="text-sm text-on-surface-variant mb-4">Click the bookmark icon on any vehicle to save it here.</p>
              <Link href="/showroom" className="px-6 py-2 bg-primary text-on-primary rounded-xl text-sm font-bold">Browse Showroom</Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {savedListings.map((v) => (
                <div key={v.id} className="bg-surface-container rounded-2xl border border-outline-variant/10 p-4 flex items-center justify-between gap-4">
                  <Link href={`/vehicles/${v.id}`} className="flex-1 min-w-0 hover:text-primary transition-colors">
                    <h3 className="font-headline font-bold text-sm truncate">{v.vehicle.make} {v.vehicle.model}</h3>
                    <p className="text-xs text-on-surface-variant">{v.vehicle.year} · {v.vehicle.exteriorColor} · {fmt(v.price)}</p>
                  </Link>
                  <div className="flex gap-2 shrink-0">
                    <Link href={`/vehicles/${v.id}`} className="px-3 py-1.5 bg-primary text-on-primary rounded-lg text-xs font-bold">View</Link>
                    <button onClick={() => handleUnsave(v.id)} className="px-3 py-1.5 border border-outline-variant/20 rounded-lg text-xs font-bold text-on-surface-variant hover:text-red-400 hover:border-red-400/30 transition-colors">Remove</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
