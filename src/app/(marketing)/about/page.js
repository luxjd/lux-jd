import MarketingNav from "../_components/MarketingNav";
import MarketingFooter from "../_components/MarketingFooter";

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-on-surface flex flex-col">
      <MarketingNav />

      <main className="pt-24 pb-16 px-6 flex-1">
        <div className="max-w-5xl mx-auto">
          <h1 className="font-headline text-4xl md:text-6xl font-bold mb-6">
            About <span className="text-primary">LuxJD</span>
          </h1>
          <p className="text-on-surface-variant text-lg max-w-2xl mb-16">
            AI-powered luxury vehicle arbitrage. Japan to Germany.
          </p>

          {/* Mission */}
          <section className="mb-20">
            <h2 className="font-headline text-2xl font-bold mb-4">Our Mission</h2>
            <p className="text-on-surface-variant leading-relaxed max-w-3xl">
              LuxJD leverages artificial intelligence to identify, acquire, and sell premium
              vehicles across international markets. We source exceptional luxury cars from
              Japan&apos;s world-class auction system and bring them to discerning European buyers —
              at prices that create value for everyone in the chain.
            </p>
          </section>

          {/* Why Japan */}
          <section className="mb-20">
            <h2 className="font-headline text-2xl font-bold mb-6">Why Japan?</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {[
                { title: "Aggressive Depreciation", desc: "Japan's biennial Shaken inspection system and cultural preference for new vehicles create 30-40% depreciation in 3 years — far steeper than Europe's 20-25%." },
                { title: "Pristine Condition", desc: "Japanese owners maintain vehicles to exceptional standards. Regular dealer service, garaged storage, and low annual mileage (5-10K km/year) are the norm." },
                { title: "LHD Availability", desc: "Many European luxury cars sold in Japan are delivered in LHD configuration. Japanese buyers prefer LHD for European exotics as a mark of authenticity." },
                { title: "Favorable Exchange Rate", desc: "The historically weak JPY/EUR rate amplifies the price differential, boosting Euro-denominated margins by an additional 10-15%." },
              ].map((item, i) => (
                <div key={i} className="bg-surface-container rounded-2xl border border-outline-variant/10 p-6">
                  <h3 className="font-headline font-bold text-lg mb-2">{item.title}</h3>
                  <p className="text-on-surface-variant text-sm leading-relaxed">{item.desc}</p>
                </div>
              ))}
            </div>
          </section>

          {/* The Technology */}
          <section className="mb-20">
            <h2 className="font-headline text-2xl font-bold mb-6">The Technology</h2>
            <p className="text-on-surface-variant leading-relaxed max-w-3xl mb-6">
              Our platform is powered by a network of 7 specialized AI agents, each handling
              a critical aspect of the import pipeline:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { icon: "query_stats", name: "Market Intelligence", desc: "Real-time German market pricing across 20 models" },
                { icon: "travel_explore", name: "Japan Sourcing", desc: "Automated auction scanning with AI sheet parsing" },
                { icon: "hub", name: "Decision Engine", desc: "10-step evaluation with portfolio risk management" },
                { icon: "local_shipping", name: "Logistics", desc: "10-stage import pipeline from Japan to Germany" },
                { icon: "edit_note", name: "Listing", desc: "AI-generated descriptions across 6 platforms" },
                { icon: "support_agent", name: "Concierge", desc: "24/7 multi-language buyer communication" },
                { icon: "account_balance", name: "Finance", desc: "P&L tracking, FX monitoring, tax optimization" },
                { icon: "auto_awesome", name: "Valuation", desc: "Standalone vehicle valuation in 60 seconds" },
              ].map((agent, i) => (
                <div key={i} className="bg-surface-container-low rounded-xl border border-outline-variant/10 p-4 text-center">
                  <span className="material-symbols-outlined text-primary text-2xl mb-2 block">{agent.icon}</span>
                  <h4 className="font-headline font-bold text-sm mb-1">{agent.name}</h4>
                  <p className="text-on-surface-variant text-xs">{agent.desc}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Target Brands */}
          <section className="mb-20">
            <h2 className="font-headline text-2xl font-bold mb-6">Brands We Source</h2>
            <div className="flex flex-wrap gap-3">
              {["Ferrari", "Mercedes-AMG", "Porsche", "Lamborghini", "Bentley", "Aston Martin", "Jaguar", "Maserati", "BMW M", "Range Rover"].map((brand) => (
                <span key={brand} className="px-4 py-2 rounded-full bg-surface-container border border-outline-variant/10 text-sm font-bold">
                  {brand}
                </span>
              ))}
            </div>
          </section>

          {/* Numbers */}
          <section className="mb-16">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              {[
                { value: "€20-60K", label: "Avg Profit Per Vehicle" },
                { value: "20+", label: "Models Tracked" },
                { value: "12+", label: "Auction Houses" },
                { value: "<10 min", label: "Inquiry Response Time" },
              ].map((stat, i) => (
                <div key={i} className="text-center">
                  <p className="font-headline text-2xl md:text-3xl font-bold text-primary">{stat.value}</p>
                  <p className="text-xs text-on-surface-variant uppercase tracking-widest mt-1">{stat.label}</p>
                </div>
              ))}
            </div>
          </section>
        </div>
      </main>

      <MarketingFooter />
    </div>
  );
}
