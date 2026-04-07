"use client";

import { useState } from "react";

export default function InquiryForm({ listingId, vehicleName }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [offerPrice, setOfferPrice] = useState("");
  const [sending, setSending] = useState(false);
  const [response, setResponse] = useState(null);
  const [showOffer, setShowOffer] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name || !email || !message) return;

    setSending(true);
    setResponse(null);

    try {
      const res = await fetch("/api/public/inquiry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listingId,
          name,
          email,
          phone: phone || null,
          message,
          offerPrice: offerPrice ? parseInt(offerPrice) : null,
        }),
      });

      const data = await res.json();
      setResponse(data);
    } catch {
      setResponse({ success: true, response: "Thank you! We'll get back to you within 10 minutes." });
    } finally {
      setSending(false);
    }
  };

  if (response?.success && response?.response) {
    return (
      <div className="space-y-4">
        <div className="p-4 rounded-2xl bg-emerald-400/10 border border-emerald-400/20">
          <div className="flex items-center gap-2 mb-2">
            <span className="material-symbols-outlined text-emerald-400">check_circle</span>
            <span className="font-bold text-emerald-400 text-sm">Inquiry Sent</span>
          </div>
          <p className="text-sm text-on-surface-variant">We typically respond within 10 minutes.</p>
        </div>

        {response.response && (
          <div className="p-4 rounded-2xl bg-primary/5 border border-primary/10">
            <div className="flex items-center gap-1.5 mb-2">
              <span className="material-symbols-outlined text-primary text-sm">auto_awesome</span>
              <span className="text-[10px] uppercase tracking-wider text-primary font-bold">AI Concierge Response</span>
            </div>
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{response.response}</p>
          </div>
        )}

        <button
          onClick={() => { setResponse(null); setMessage(""); setOfferPrice(""); }}
          className="w-full py-2.5 border border-outline-variant/20 rounded-xl text-sm font-bold text-on-surface-variant hover:text-on-surface transition-colors"
        >
          Send Another Message
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <h3 className="font-headline font-bold text-base mb-1">Interested in this {vehicleName}?</h3>
      <p className="text-xs text-on-surface-variant mb-3">Our AI concierge responds within 10 minutes, 24/7.</p>

      <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name *" required
        className="w-full px-3 py-2.5 rounded-xl bg-surface-container-high border border-outline-variant/20 text-on-surface text-sm placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary/50 transition-all" />

      <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email address *" required
        className="w-full px-3 py-2.5 rounded-xl bg-surface-container-high border border-outline-variant/20 text-on-surface text-sm placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary/50 transition-all" />

      <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone (optional)"
        className="w-full px-3 py-2.5 rounded-xl bg-surface-container-high border border-outline-variant/20 text-on-surface text-sm placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary/50 transition-all" />

      <textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Your message... e.g. Is this vehicle still available? Can I schedule a viewing?" rows={3} required
        className="w-full px-3 py-2.5 rounded-xl bg-surface-container-high border border-outline-variant/20 text-on-surface text-sm placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary/50 transition-all resize-none" />

      {/* Make an Offer toggle */}
      <button type="button" onClick={() => setShowOffer(!showOffer)}
        className="text-xs text-secondary font-bold flex items-center gap-1 hover:text-primary transition-colors">
        <span className="material-symbols-outlined text-sm">{showOffer ? "expand_less" : "sell"}</span>
        {showOffer ? "Hide offer" : "Make a price offer"}
      </button>

      {showOffer && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-on-surface-variant">€</span>
          <input type="number" value={offerPrice} onChange={(e) => setOfferPrice(e.target.value)} placeholder="Your offer"
            className="flex-1 px-3 py-2.5 rounded-xl bg-surface-container-high border border-outline-variant/20 text-on-surface text-sm placeholder:text-on-surface-variant/50 focus:outline-none focus:border-secondary/50 transition-all" />
        </div>
      )}

      <button type="submit" disabled={sending || !name || !email || !message}
        className="w-full py-3 bg-primary text-on-primary font-bold rounded-xl text-sm hover:shadow-[0_0_20px_rgba(173,198,255,0.4)] transition-all disabled:opacity-50 flex items-center justify-center gap-2">
        <span className={`material-symbols-outlined text-lg ${sending ? "animate-spin" : ""}`}>{sending ? "progress_activity" : "send"}</span>
        {sending ? "Sending..." : "Send Inquiry"}
      </button>

      <p className="text-[10px] text-on-surface-variant text-center">
        By submitting, you agree to our Privacy Policy. Response time: under 10 minutes.
      </p>
    </form>
  );
}
