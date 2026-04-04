"use client";

import { useState } from "react";

const faqs = [
  {
    q: "How does the Japan-to-Europe arbitrage work?",
    a: "Japanese luxury cars depreciate faster due to the Shaken inspection system and cultural preference for new vehicles. We source premium vehicles at Japanese auctions at 25–40% below European market value, handle all shipping, customs, and compliance, then sell at competitive European prices — capturing the spread as profit.",
  },
  {
    q: "Which brands do you focus on?",
    a: "Ferrari, Mercedes-AMG, Porsche, Lamborghini, Bentley, Aston Martin, Jaguar, Maserati, BMW M, and select Range Rover models. We prioritize vehicles with the highest margin potential and strongest European demand.",
  },
  {
    q: "Are Japanese-sourced vehicles in good condition?",
    a: "Excellent condition. Japanese owners maintain vehicles to exceptional standards — regular dealer servicing, garaged storage, and low annual mileage (typically 5,000–10,000 km/year). Our AI performs detailed condition analysis on every vehicle including auction sheet OCR and photo inspection.",
  },
  {
    q: "Do the vehicles have EU Type Approval?",
    a: "Yes. We focus on European luxury brands (Ferrari, Porsche, Mercedes-AMG, etc.) that were originally manufactured and type-approved for the European market. This means the TÜV inspection process is significantly simpler and cheaper than importing truly Japanese-domestic vehicles.",
  },
  {
    q: "What about Left-Hand Drive vs Right-Hand Drive?",
    a: "We prioritize LHD vehicles, which are readily available in Japan — many European exotics are sold in LHD even in Japan. LHD vehicles command premium prices in Europe and eliminate conversion costs entirely.",
  },
  {
    q: "How long does the import process take?",
    a: "Typically 8–16 weeks end-to-end: 4–6 weeks for ocean shipping from Japan to Bremerhaven/Hamburg, 2–4 weeks for customs clearance and TÜV inspection, and then the vehicle is ready for sale.",
  },
  {
    q: "What is the typical profit margin per vehicle?",
    a: "Gross margins of €20,000–€60,000 per vehicle are achievable on well-selected units, representing 20–60% returns. Our AI system maximizes these margins through precise market analysis and optimal timing.",
  },
  {
    q: "How does AI improve the process?",
    a: "Our 6 specialized AI agents handle market intelligence, sourcing decisions, pricing optimization, logistics tracking, financial analysis, and customer interactions. This enables faster decisions, more accurate margin predictions, and scalability without proportional headcount growth.",
  },
];

export default function FAQ() {
  const [openIndex, setOpenIndex] = useState(null);

  return (
    <div className="max-w-3xl mx-auto space-y-3">
      {faqs.map((item, i) => (
        <div
          key={i}
          className="border border-outline-variant/15 rounded-2xl overflow-hidden transition-all"
        >
          <button
            onClick={() => setOpenIndex(openIndex === i ? null : i)}
            className="w-full flex items-center justify-between p-6 text-left hover:bg-surface-container-high/50 transition-colors"
          >
            <span className="font-headline font-bold text-base pr-4">
              {item.q}
            </span>
            <span
              className="material-symbols-outlined text-primary transition-transform duration-300 shrink-0"
              style={{
                transform: openIndex === i ? "rotate(180deg)" : "rotate(0deg)",
              }}
            >
              expand_more
            </span>
          </button>
          <div
            className="overflow-hidden transition-all duration-300"
            style={{
              maxHeight: openIndex === i ? "300px" : "0px",
              opacity: openIndex === i ? 1 : 0,
            }}
          >
            <p className="px-6 pb-6 text-on-surface-variant text-sm leading-relaxed">
              {item.a}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
