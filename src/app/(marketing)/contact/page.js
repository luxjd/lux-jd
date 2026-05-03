"use client";

import { useState } from "react";
import MarketingNav from "../_components/MarketingNav";
import MarketingFooter from "../_components/MarketingFooter";

export default function ContactPage() {
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    setSubmitted(true);
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-on-surface flex flex-col">
      <MarketingNav />

      <main className="pt-24 pb-40 px-6 flex-1">
        <div className="max-w-5xl mx-auto">
          <h1 className="font-headline text-4xl md:text-6xl font-bold mb-4">
            Get in <span className="text-secondary">Touch</span>
          </h1>
          <p className="text-on-surface-variant text-lg mb-16 max-w-2xl">
            Whether you&apos;re looking for a specific vehicle or have questions about our import service,
            we&apos;re here to help. Our AI concierge responds within 10 minutes.
          </p>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 mb-20">
            {/* Contact Info */}
            <div className="space-y-8">
              {[
                { icon: "schedule", title: "Response Time", value: "Under 10 minutes", desc: "AI-powered instant response, 24/7" },
                { icon: "language", title: "Languages", value: "DE · EN · FR · IT · NL", desc: "Native-level multi-language support" },
                { icon: "location_on", title: "Location", value: "Germany", desc: "Premium vehicle showroom and logistics hub" },
                { icon: "mail", title: "Email", value: "info@luxjd.com", desc: "For general inquiries and partnerships" },
                { icon: "phone", title: "Phone", value: "By appointment", desc: "Schedule a call for high-value acquisitions" },
              ].map((item, i) => (
                <div key={i} className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-surface-container border border-outline-variant/10 flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-primary">{item.icon}</span>
                  </div>
                  <div>
                    <h3 className="font-headline font-bold">{item.title}</h3>
                    <p className="text-secondary text-sm font-semibold">{item.value}</p>
                    <p className="text-xs text-on-surface-variant">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Contact Form */}
            {submitted ? (
              <div className="bg-surface-container rounded-2xl border border-emerald-400/20 p-12 text-center">
                <span className="material-symbols-outlined text-emerald-400 text-5xl mb-4 block">check_circle</span>
                <h3 className="font-headline text-xl font-bold mb-2">Message Sent</h3>
                <p className="text-on-surface-variant text-sm">
                  Thank you for your inquiry. Our AI concierge will respond within 10 minutes.
                  For urgent matters, you&apos;ll hear from a specialist directly.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="bg-surface-container rounded-2xl border border-outline-variant/10 p-8 space-y-5">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs uppercase tracking-widest text-on-surface-variant mb-2">First Name</label>
                    <input type="text" required placeholder="John" className="w-full px-4 py-3 rounded-xl bg-surface-container-high border border-outline-variant/20 text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary/50" />
                  </div>
                  <div>
                    <label className="block text-xs uppercase tracking-widest text-on-surface-variant mb-2">Last Name</label>
                    <input type="text" required placeholder="Doe" className="w-full px-4 py-3 rounded-xl bg-surface-container-high border border-outline-variant/20 text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary/50" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs uppercase tracking-widest text-on-surface-variant mb-2">Email</label>
                  <input type="email" required placeholder="you@example.com" className="w-full px-4 py-3 rounded-xl bg-surface-container-high border border-outline-variant/20 text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary/50" />
                </div>
                <div>
                  <label className="block text-xs uppercase tracking-widest text-on-surface-variant mb-2">Interested In</label>
                  <select className="w-full px-4 py-3 rounded-xl bg-surface-container-high border border-outline-variant/20 text-on-surface focus:outline-none focus:border-primary/50">
                    <option value="">Select a brand...</option>
                    <option>Ferrari</option>
                    <option>Mercedes-AMG</option>
                    <option>Porsche</option>
                    <option>Lamborghini</option>
                    <option>Bentley</option>
                    <option>Aston Martin</option>
                    <option>Jaguar</option>
                    <option>BMW M</option>
                    <option>Range Rover</option>
                    <option>Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs uppercase tracking-widest text-on-surface-variant mb-2">Message</label>
                  <textarea rows={5} required placeholder="Tell us about the vehicle you're looking for..." className="w-full px-4 py-3 rounded-xl bg-surface-container-high border border-outline-variant/20 text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary/50 resize-none" />
                </div>
                <button type="submit" className="w-full py-3.5 bg-primary text-on-primary font-bold rounded-xl text-lg hover:shadow-[0_0_25px_rgba(173,198,255,0.4)] transition-all active:scale-[0.98]">
                  Send Inquiry
                </button>
                <p className="text-center text-xs text-on-surface-variant">
                  We respond within 10 minutes. Your data is protected under our privacy policy.
                </p>
              </form>
            )}
          </div>
        </div>
      </main>

      <MarketingFooter />
    </div>
  );
}
