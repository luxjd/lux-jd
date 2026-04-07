"use client";

import Image from "next/image";
import AuthModals from "../components/AuthModals";
import ScrollReveal from "../components/ScrollReveal";
import FAQ from "../components/FAQ";
import HeroDrift, { HeroCarousel, TypingText } from "../components/HeroDrift";
import ScrollCar from "../components/ScrollCar";

export default function Home() {
  return (
    <AuthModals>
      {({ openLogin, openSignup }) => (
        <>
          {/* Scroll-linked car animation — fixed bottom */}
          <ScrollCar />

          {/* Top Navigation Bar */}
          <nav className="anim-nav fixed top-0 w-full z-50 bg-[#0a0a0a]/80 backdrop-blur-xl shadow-[0_0_20px_rgba(248,113,113,0.1)] flex justify-between items-center px-8 py-4 max-w-full font-headline tracking-tighter uppercase">
            <div className="text-xl font-bold tracking-widest text-slate-100">
              LuxJD
            </div>
            <div className="hidden md:flex items-center gap-8">
              <a className="text-primary border-b-2 border-primary-container pb-1" href="#">
                Home
              </a>
              <a className="text-slate-300 hover:text-primary transition-colors" href="#">
                About
              </a>
              <a className="text-slate-300 hover:text-primary transition-colors" href="#">
                Inventory
              </a>
              <a className="text-slate-300 hover:text-primary transition-colors" href="#">
                Contact
              </a>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={openLogin}
                className="text-slate-300 hover:text-white px-4 py-2 rounded-xl font-bold transition-colors"
              >
                Sign In
              </button>
              <a
                href="/showroom"
                className="bg-primary text-on-primary px-6 py-2 rounded-xl font-bold scale-95 active:scale-90 transition-transform hover:shadow-[0_0_15px_rgba(173,198,255,0.4)]"
              >
                Browse Cars
              </a>
            </div>
          </nav>

          {/* Hero Section */}
          <section className="relative h-screen flex items-center justify-center overflow-hidden">
            {/* Option B: Rotating car showcase — parallax bg layer (oversized for movement room) */}
            <div data-parallax-bg className="absolute -inset-6 will-change-transform pointer-events-none">
              <HeroCarousel />
            </div>

            {/* Ambient effects + Option C parallax + cursor glow */}
            <HeroDrift />

            {/* Hero text — parallax foreground layer */}
            <div data-parallax-text className="relative z-10 text-center max-w-5xl px-6 will-change-transform">
              <div className="anim-drift-text-1 inline-block mb-4 px-4 py-1 rounded-full border border-primary/20 bg-primary/10 backdrop-blur-md">
                <span className="text-primary font-medium tracking-widest uppercase text-xs">
                  Japan → Europe | AI-Powered Arbitrage
                </span>
              </div>
              <h1 className="anim-drift-text-2 font-headline text-5xl md:text-8xl font-bold mb-6 neon-text-glow leading-tight">
                AI-Powered{" "}
                <span className="anim-shimmer-text">
                  Luxury Car Arbitrage
                </span>
              </h1>
              {/* Option D: Typing effect on subtitle */}
              <div className="anim-drift-text-3 text-on-surface-variant text-xl md:text-2xl mb-10 max-w-2xl mx-auto leading-relaxed h-[4em] md:h-[3em]">
                <TypingText
                  text="Source undervalued supercars from Japan. Sell at premium in Europe. Guided by hyper-intelligent market data."
                  delay={2000}
                  speed={30}
                />
              </div>
              <div className="anim-drift-text-4 flex flex-col md:flex-row gap-6 justify-center items-center">
                <a
                  href="/showroom"
                  className="cursor-pointer px-10 py-4 bg-primary text-on-primary font-bold rounded-xl text-lg hover:shadow-[0_0_25px_rgba(173,198,255,0.5)] transition-all duration-300 hover:scale-105 active:scale-95"
                >
                  Explore Inventory
                </a>
                <a
                  href="/register"
                  className="px-10 py-4 border-2 border-outline/30 text-on-surface font-bold rounded-xl text-lg backdrop-blur-sm hover:border-primary/50 hover:scale-105 active:scale-95 transition-all"
                >
                  Create Account
                </a>
              </div>
            </div>
          </section>

          {/* Trust Strip */}
          <ScrollReveal className="relative z-20 -mt-12 max-w-7xl mx-auto px-6" direction="up" duration={800}>
            <div className="glass-panel rounded-full py-8 px-12 grid grid-cols-1 md:grid-cols-3 gap-8 items-center border border-outline-variant/15 anim-border-pulse">
              <div className="flex items-center gap-4 justify-center md:border-r border-outline-variant/30 icon-bounce">
                <span className="material-symbols-outlined text-primary text-3xl">
                  payments
                </span>
                <div>
                  <p className="font-headline text-xl font-bold">€20K–€60K</p>
                  <p className="text-xs text-on-surface-variant uppercase tracking-widest">
                    Avg Profit / Unit
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4 justify-center md:border-r border-outline-variant/30 icon-bounce">
                <span className="material-symbols-outlined text-secondary text-3xl">
                  neurology
                </span>
                <div>
                  <p className="font-headline text-xl font-bold">AI-Driven Decisions</p>
                  <p className="text-xs text-on-surface-variant uppercase tracking-widest">
                    Risk Mitigation
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4 justify-center icon-bounce">
                <span className="material-symbols-outlined text-primary text-3xl">
                  public
                </span>
                <div>
                  <p className="font-headline text-xl font-bold">Global Access</p>
                  <p className="text-xs text-on-surface-variant uppercase tracking-widest">
                    Luxury Market Network
                  </p>
                </div>
              </div>
            </div>
          </ScrollReveal>

          {/* ═══════════════ NEW: Target Brands ═══════════════ */}
          <section className="py-20 px-6">
            <div className="max-w-7xl mx-auto">
              <ScrollReveal direction="up" className="text-center mb-14">
                <h2 className="font-headline text-4xl md:text-5xl font-bold mb-4">
                  Premium <span className="text-secondary">Brands</span> We Source
                </h2>
                <p className="text-on-surface-variant max-w-xl mx-auto">
                  Targeting the most profitable European luxury marques available in Japan&apos;s auction ecosystem.
                </p>
              </ScrollReveal>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
                {[
                  { name: "Ferrari", icon: "directions_car", spread: "€25–60K", color: "text-red-400" },
                  { name: "Mercedes-AMG", icon: "star", spread: "€15–40K", color: "text-slate-300" },
                  { name: "Porsche", icon: "speed", spread: "€15–35K", color: "text-yellow-400" },
                  { name: "Lamborghini", icon: "bolt", spread: "€30–70K", color: "text-yellow-300" },
                  { name: "Bentley", icon: "diamond", spread: "€20–45K", color: "text-emerald-400" },
                  { name: "Aston Martin", icon: "auto_awesome", spread: "€20–50K", color: "text-sky-400" },
                  { name: "Jaguar", icon: "pets", spread: "€10–25K", color: "text-green-400" },
                  { name: "Maserati", icon: "water", spread: "€10–25K", color: "text-blue-400" },
                  { name: "BMW M", icon: "engineering", spread: "€10–25K", color: "text-blue-300" },
                  { name: "Range Rover", icon: "landscape", spread: "€12–30K", color: "text-emerald-300" },
                ].map((brand, i) => (
                  <ScrollReveal key={brand.name} delay={i * 60} direction="up">
                    <div className="glass-panel border border-outline-variant/10 rounded-2xl p-5 text-center hover:border-primary/30 transition-all hover-lift hover-shine cursor-default">
                      <span className={`material-symbols-outlined text-3xl mb-3 ${brand.color}`}>
                        {brand.icon}
                      </span>
                      <h4 className="font-headline font-bold text-sm mb-1">{brand.name}</h4>
                      <p className="text-xs text-primary font-semibold">{brand.spread}</p>
                      <p className="text-[10px] text-on-surface-variant uppercase tracking-widest mt-0.5">Avg Spread</p>
                    </div>
                  </ScrollReveal>
                ))}
              </div>
            </div>
          </section>

          {/* ═══════════════ NEW: Why Japan? ═══════════════ */}
          <section className="py-24 bg-surface-container-low px-6">
            <div className="max-w-7xl mx-auto">
              <ScrollReveal direction="up" className="text-center mb-16">
                <h2 className="font-headline text-4xl md:text-5xl font-bold mb-4">
                  Why <span className="text-primary">Japan</span>?
                </h2>
                <p className="text-on-surface-variant max-w-2xl mx-auto">
                  Structural market dynamics create consistent 25–40% price advantages on luxury vehicles.
                </p>
              </ScrollReveal>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {[
                  {
                    icon: "car_repair",
                    title: "Shaken Inspection System",
                    desc: "Biennial inspections costing ¥600K–¥1M for luxury cars force owners to sell rather than pay recurring costs. This creates massive supply.",
                    color: "text-primary",
                  },
                  {
                    icon: "fiber_new",
                    title: "New-Vehicle Culture",
                    desc: "Japanese consumers prefer the latest model year. Luxury vehicles lose 30–40% in just 3 years — vs 20–25% in Germany.",
                    color: "text-secondary",
                  },
                  {
                    icon: "verified",
                    title: "Pristine Maintenance",
                    desc: "Regular dealer servicing, garaged storage, and low mileage (5–10K km/year). Japanese-sourced vehicles are often in better condition than European examples.",
                    color: "text-primary",
                  },
                  {
                    icon: "currency_yen",
                    title: "Favorable JPY/EUR Rate",
                    desc: "The historically weak Yen (¥165–170/€) amplifies the price differential, boosting Euro-denominated margins by an additional 10–15%.",
                    color: "text-secondary",
                  },
                ].map((item, i) => (
                  <ScrollReveal key={i} delay={i * 120} direction="up">
                    <div className="glass-panel border border-outline-variant/10 rounded-2xl p-8 h-full hover:border-primary/30 transition-all hover-lift hover-shine">
                      <div className="w-14 h-14 rounded-full bg-surface-container-high border border-outline-variant/20 flex items-center justify-center mb-5">
                        <span className={`material-symbols-outlined ${item.color} text-2xl`}>
                          {item.icon}
                        </span>
                      </div>
                      <h3 className="font-headline font-bold text-lg mb-3">{item.title}</h3>
                      <p className="text-on-surface-variant text-sm leading-relaxed">{item.desc}</p>
                    </div>
                  </ScrollReveal>
                ))}
              </div>
            </div>
          </section>

          {/* How It Works */}
          <section className="py-32 px-6">
            <div className="max-w-7xl mx-auto">
              <ScrollReveal className="mb-20" direction="up">
                <h2 className="font-headline text-4xl md:text-5xl font-bold mb-4">
                  Mastering the <span className="text-secondary">Arb</span> Flow
                </h2>
                <p className="text-on-surface-variant max-w-xl">
                  Our proprietary ecosystem handles the complexity, while you capture
                  the spread.
                </p>
              </ScrollReveal>
              <div className="relative grid grid-cols-1 md:grid-cols-4 gap-12">
                <ScrollReveal className="hidden md:block absolute top-12 left-0 w-full h-[2px] z-0" direction="none" threshold={0.3}>
                  <div className="w-full h-full bg-gradient-to-r from-primary/0 via-primary/50 to-secondary/0 anim-line-grow"></div>
                </ScrollReveal>
                {[
                  { icon: "analytics", title: "AI Market Analysis", desc: "Identifying cross-border price discrepancies in real-time.", color: "primary" },
                  { icon: "location_searching", title: "Japan Sourcing", desc: "Direct access to elite Japanese auction houses.", color: "secondary" },
                  { icon: "sailing", title: "Import & Logistics", desc: "Seamless white-glove transport and customs clearance.", color: "primary" },
                  { icon: "sell", title: "Sell in Europe", desc: "Placement in high-liquidity EU premium showrooms.", color: "secondary" },
                ].map((step, i) => (
                  <ScrollReveal key={i} className="relative z-10 group" delay={i * 150} direction="up">
                    <div className={`w-24 h-24 rounded-full bg-surface-container-high border border-${step.color}/30 flex items-center justify-center mb-8 mx-auto group-hover:scale-110 group-hover:shadow-[0_0_20px_rgba(173,198,255,0.3)] transition-all anim-pulse-glow${step.color === "secondary" ? "-gold" : ""}`}>
                      <span className={`material-symbols-outlined text-${step.color} text-4xl`}>
                        {step.icon}
                      </span>
                    </div>
                    <div className="text-center">
                      <h3 className="font-headline text-xl font-bold mb-3">{step.title}</h3>
                      <p className="text-on-surface-variant text-sm">{step.desc}</p>
                    </div>
                  </ScrollReveal>
                ))}
              </div>
            </div>
          </section>

          {/* ═══════════════ NEW: Import Pipeline Tracker ═══════════════ */}
          <section className="py-24 bg-surface-container-low px-6 overflow-hidden">
            <div className="max-w-7xl mx-auto">
              <ScrollReveal direction="up" className="text-center mb-16">
                <h2 className="font-headline text-4xl md:text-5xl font-bold mb-4">
                  Live <span className="text-primary">Pipeline</span> Tracker
                </h2>
                <p className="text-on-surface-variant max-w-xl mx-auto">
                  Every vehicle is tracked through 10 stages from discovery to sale with full transparency.
                </p>
              </ScrollReveal>
              <ScrollReveal direction="up" duration={800}>
                <div className="relative">
                  {/* Connection line */}
                  <div className="hidden lg:block absolute top-8 left-0 w-full h-[2px] bg-gradient-to-r from-primary/0 via-primary/40 to-secondary/0 z-0"></div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-10 gap-3">
                    {[
                      { label: "Discovered", icon: "search", active: true },
                      { label: "Bid Placed", icon: "gavel", active: true },
                      { label: "Purchased", icon: "shopping_cart", active: true },
                      { label: "JP Transport", icon: "local_shipping", active: true },
                      { label: "At Port JP", icon: "anchor", active: true },
                      { label: "In Transit", icon: "sailing", active: false },
                      { label: "At Port DE", icon: "location_on", active: false },
                      { label: "Customs", icon: "fact_check", active: false },
                      { label: "TUV Ready", icon: "verified", active: false },
                      { label: "For Sale", icon: "storefront", active: false },
                    ].map((stage, i) => (
                      <div key={i} className="relative z-10 flex flex-col items-center text-center">
                        <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-2 border transition-all ${stage.active ? "bg-primary/15 border-primary/40 shadow-[0_0_15px_rgba(173,198,255,0.2)]" : "bg-surface-container-high border-outline-variant/20"}`}>
                          <span className={`material-symbols-outlined text-xl ${stage.active ? "text-primary" : "text-on-surface-variant/50"}`}>
                            {stage.icon}
                          </span>
                        </div>
                        <p className={`text-[10px] uppercase tracking-wider font-bold ${stage.active ? "text-primary" : "text-on-surface-variant/50"}`}>
                          {stage.label}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </ScrollReveal>
            </div>
          </section>

          {/* Featured Vehicles */}
          <section className="py-24 px-6">
            <div className="max-w-7xl mx-auto">
              <ScrollReveal direction="up">
                <div className="flex justify-between items-end mb-16">
                  <div>
                    <h2 className="font-headline text-4xl font-bold">
                      Current <span className="text-primary">Arbitrage</span> Opportunities
                    </h2>
                    <p className="text-on-surface-variant">
                      Live units from the Tokyo network.
                    </p>
                  </div>
                  <button className="text-secondary font-bold flex items-center gap-2 hover:translate-x-2 transition-transform">
                    View Full Feed{" "}
                    <span className="material-symbols-outlined">arrow_forward</span>
                  </button>
                </div>
              </ScrollReveal>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {[
                  {
                    name: "Ferrari 488 GTB",
                    hub: "Osaka Regional Hub",
                    buy: "€185,000",
                    profit: "€42,000",
                    badge: "Available Now",
                    badgeColor: "secondary",
                    img: "https://lh3.googleusercontent.com/aida-public/AB6AXuDJuHOJfnwz1Vg_lQ1maYQvS3qoMTURwEwxaykKSmLy8040GDySVT2v6YpxwQkkZ8DzG3F9JrHHwSQncVGxQS2W3aKPQzmkolF3Zg0plTTnx053_gyFDbql9OKONxll26rPRsuGmfejxazBm8uZAaiM3QA_8wmSZgf0x6HDZceuMkRU0XbWuQZmHZ_NAKQeNJOIyO0hagRk96x-JlVoITnBrRIeACT0az2KkcJySM4LeO_utmtM95Yaq55jStr3MoOu2h46RnzhHQ",
                  },
                  {
                    name: "Porsche 911 GT3 (992)",
                    hub: "Tokyo Port Hub",
                    buy: "€210,000",
                    profit: "€38,500",
                    badge: "In Transit",
                    badgeColor: "primary",
                    img: "https://lh3.googleusercontent.com/aida-public/AB6AXuAa6z-laJIhTiy_OxW-TCKByWrVOrKeI4QI439qyAgd263NZeTV_dSdhar8z7eNjygSI_BX-LPSUhSuPei_WU-pGSQJfHC40U8Z-3Yu0IDr7asL_xe8ceJJRSr9j32tKpX77o8VKCmUSIBTfAwd4gQU0nqME4doK6D-IMaVNWb6gAOsMcnv_zVE8VGNUk4Btl1TFSqL9tEVPI0WrbPNDFFpsZcDbkwrwAtRltRzYfHSgHSxuJ26PVqzO3kx8jlv_cVPUFmfDG3gdg",
                  },
                  {
                    name: "Lamborghini Huracán STO",
                    hub: "Kyoto Exclusive Collection",
                    buy: "€345,000",
                    profit: "€58,200",
                    badge: "High Priority",
                    badgeColor: "secondary",
                    img: "https://lh3.googleusercontent.com/aida-public/AB6AXuDFi1KI9otlroY-VbTQccK1RLpoeRLxI3is0qYP7fDJZ45xm3dk-6SGt771iJzBF7XazV4IlTRDFIFVGCWu78im7YJmLUorFwV1dPw5YIR959ZnqEibsoHwfoHGEFNKDvObgIt-AAVSQO_NoN2oRbGsFDLCcReQigMfbRbWBJYPmVILCJsMKPt5dj-F13lbNRC1etmpYmvzmsyz1Y_3yAtdc8NATLX5RajJhdI6R89D833XKhwG3TPufMOZkwbmWFiN0-4uolgtXw",
                  },
                ].map((car, i) => (
                  <ScrollReveal key={i} delay={i * 150} direction="up">
                    <div className="group bg-surface-container rounded-2xl overflow-hidden border border-outline-variant/10 hover:border-primary/50 transition-all duration-500 hover-lift hover-shine">
                      <div className="h-64 overflow-hidden relative">
                        <Image className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" src={car.img} alt={car.name} fill />
                        <div className={`absolute top-4 right-4 bg-background/60 backdrop-blur-md px-3 py-1 rounded-full text-${car.badgeColor} text-xs font-bold uppercase tracking-widest border border-${car.badgeColor}/30`}>
                          {car.badge}
                        </div>
                      </div>
                      <div className="p-8">
                        <h3 className="font-headline text-2xl font-bold mb-2">{car.name}</h3>
                        <p className="text-on-surface-variant text-sm mb-6">{car.hub}</p>
                        <div className="grid grid-cols-2 gap-4 pt-6 border-t border-outline-variant/10">
                          <div>
                            <p className="text-xs uppercase text-on-surface-variant mb-1">Buy Price</p>
                            <p className="text-xl font-bold">{car.buy}</p>
                          </div>
                          <div>
                            <p className="text-xs uppercase text-primary mb-1">Est. Profit</p>
                            <p className="text-xl font-bold text-primary">{car.profit}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </ScrollReveal>
                ))}
              </div>
            </div>
          </section>

          {/* ═══════════════ NEW: Worked Example / Cost Breakdown ═══════════════ */}
          <section className="py-24 bg-surface-container-low px-6">
            <div className="max-w-7xl mx-auto">
              <ScrollReveal direction="up" className="text-center mb-16">
                <h2 className="font-headline text-4xl md:text-5xl font-bold mb-4">
                  Real <span className="text-secondary">Numbers</span>, Real Margins
                </h2>
                <p className="text-on-surface-variant max-w-2xl mx-auto">
                  A fully transparent cost breakdown for a Ferrari 488 GTB sourced from USS Tokyo.
                </p>
              </ScrollReveal>
              <ScrollReveal direction="up">
                <div className="max-w-4xl mx-auto glass-panel border border-outline-variant/15 rounded-3xl p-8 md:p-12 hover-shine">
                  <div className="flex items-center gap-4 mb-8">
                    <div className="w-12 h-12 rounded-full bg-red-500/15 border border-red-500/30 flex items-center justify-center">
                      <span className="material-symbols-outlined text-red-400 text-2xl">directions_car</span>
                    </div>
                    <div>
                      <h3 className="font-headline text-2xl font-bold">Ferrari 488 GTB</h3>
                      <p className="text-on-surface-variant text-sm">Grade 4.5 | 18,000 km | LHD | USS Tokyo</p>
                    </div>
                  </div>

                  <div className="space-y-3 mb-8">
                    {[
                      { label: "Purchase at Auction (¥16.5M)", value: "€99,000", icon: "gavel" },
                      { label: "Auction Fees (4%)", value: "€3,960", icon: "receipt" },
                      { label: "Japan Transport + Export Docs", value: "€550", icon: "local_shipping" },
                      { label: "Container Freight (Yokohama → Bremerhaven)", value: "€2,800", icon: "sailing" },
                      { label: "Marine Insurance (2%)", value: "€1,980", icon: "security" },
                      { label: "EU Customs Duty (10% CIF)", value: "€10,829", icon: "account_balance" },
                      { label: "Port Handling + Customs Agent", value: "€600", icon: "inventory_2" },
                      { label: "TÜV Einzelabnahme", value: "€400", icon: "verified" },
                      { label: "DE Transport (Enclosed)", value: "€500", icon: "local_shipping" },
                      { label: "Pre-Sale Detail + Photography", value: "€1,700", icon: "photo_camera" },
                    ].map((item, i) => (
                      <div key={i} className="flex items-center justify-between py-2 border-b border-outline-variant/10">
                        <div className="flex items-center gap-3">
                          <span className="material-symbols-outlined text-on-surface-variant text-lg">{item.icon}</span>
                          <span className="text-sm text-on-surface-variant">{item.label}</span>
                        </div>
                        <span className="font-headline font-bold text-sm">{item.value}</span>
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 p-6 rounded-2xl bg-surface-container-high/50 border border-outline-variant/10">
                    <div className="text-center">
                      <p className="text-xs uppercase text-on-surface-variant tracking-widest mb-1">Total Landed Cost</p>
                      <p className="font-headline text-2xl font-bold">€122,319</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs uppercase text-on-surface-variant tracking-widest mb-1">DE Market Value</p>
                      <p className="font-headline text-2xl font-bold">€165–185K</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs uppercase text-primary tracking-widest mb-1">Expected Margin</p>
                      <p className="font-headline text-2xl font-bold text-primary">€43–63K</p>
                      <p className="text-xs text-secondary font-bold">35–51% ROI</p>
                    </div>
                  </div>
                </div>
              </ScrollReveal>
            </div>
          </section>

          {/* AI Platform Showcase */}
          <section className="py-32 px-6">
            <div className="max-w-7xl mx-auto">
              <ScrollReveal className="text-center mb-24" direction="up">
                <h2 className="font-headline text-5xl font-bold mb-6">
                  The <span className="text-primary">Cognitive</span> Network
                </h2>
                <p className="text-on-surface-variant text-lg max-w-2xl mx-auto">
                  Our specialized AI agents work in concert to secure your capital and
                  maximize yield across global borders.
                </p>
              </ScrollReveal>
              <div className="flex flex-col md:flex-row md:items-center gap-4 md:py-10">
                <div className="md:-translate-y-8 flex-1 p-8 glass-panel border border-outline-variant/10 rounded-2xl flex flex-col items-center text-center cursor-default icon-bounce anim-wave hover-shine" style={{ animationDelay: "0s", animationFillMode: "both" }}>
                  <span className="material-symbols-outlined text-primary text-4xl mb-6">query_stats</span>
                  <h4 className="font-headline font-bold text-lg mb-2">Market Agent</h4>
                  <p className="text-xs text-on-surface-variant">Real-time global price parity tracker.</p>
                </div>
                <div className="md:translate-y-8 flex-1 p-8 glass-panel border border-outline-variant/10 rounded-2xl flex flex-col items-center text-center cursor-default icon-bounce anim-wave-gold hover-shine" style={{ animationDelay: "0.35s", animationFillMode: "both" }}>
                  <span className="material-symbols-outlined text-secondary text-4xl mb-6">precision_manufacturing</span>
                  <h4 className="font-headline font-bold text-lg mb-2">Sourcing Agent</h4>
                  <p className="text-xs text-on-surface-variant">Autonomous auction bidding &amp; inspection.</p>
                </div>
                <div className="md:-translate-y-8 flex-1 p-8 glass-panel border border-outline-variant/10 rounded-2xl flex flex-col items-center text-center cursor-default icon-bounce anim-wave hover-shine" style={{ animationDelay: "0.7s", animationFillMode: "both" }}>
                  <span className="material-symbols-outlined text-primary text-4xl mb-6">currency_exchange</span>
                  <h4 className="font-headline font-bold text-lg mb-2">Finance Agent</h4>
                  <p className="text-xs text-on-surface-variant">FX hedging and transaction optimization.</p>
                </div>
                <div className="md:translate-y-8 flex-1 p-8 glass-panel border border-outline-variant/10 rounded-2xl flex flex-col items-center text-center cursor-default icon-bounce anim-wave-gold hover-shine" style={{ animationDelay: "1.05s", animationFillMode: "both" }}>
                  <span className="material-symbols-outlined text-secondary text-4xl mb-6">inventory_2</span>
                  <h4 className="font-headline font-bold text-lg mb-2">Logistics Agent</h4>
                  <p className="text-xs text-on-surface-variant">Supply chain and duty calculation.</p>
                </div>
                <div className="md:-translate-y-8 flex-1 p-8 glass-panel border border-outline-variant/10 rounded-2xl flex flex-col items-center text-center cursor-default icon-bounce anim-wave hover-shine" style={{ animationDelay: "1.4s", animationFillMode: "both" }}>
                  <span className="material-symbols-outlined text-primary text-4xl mb-6">support_agent</span>
                  <h4 className="font-headline font-bold text-lg mb-2">Concierge Agent</h4>
                  <p className="text-xs text-on-surface-variant">24/7 high-net-worth portfolio support.</p>
                </div>
              </div>
            </div>
          </section>

          {/* ═══════════════ NEW: Risk Mitigation ═══════════════ */}
          <section className="py-24 bg-surface-container-low px-6">
            <div className="max-w-7xl mx-auto">
              <ScrollReveal direction="up" className="text-center mb-16">
                <h2 className="font-headline text-4xl md:text-5xl font-bold mb-4">
                  Built-In <span className="text-primary">Risk</span> Mitigation
                </h2>
                <p className="text-on-surface-variant max-w-2xl mx-auto">
                  Every risk is anticipated, monitored, and actively managed by our AI agents.
                </p>
              </ScrollReveal>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[
                  { risk: "Currency Fluctuation", icon: "trending_down", mitigation: "Real-time FX monitoring, forward contracts, JPY account, and 3% buffer built into every margin calculation.", agent: "Finance Agent" },
                  { risk: "Vehicle Condition", icon: "image_search", mitigation: "Minimum Grade 4.0 threshold, AI-powered auction sheet OCR, Claude Vision photo analysis, and pre-ship inspection.", agent: "Sourcing Agent" },
                  { risk: "TÜV Failure", icon: "gpp_maybe", mitigation: "Pre-import TÜV feasibility check, EU-spec vehicles prioritized, and a database of specialized TÜV stations.", agent: "Logistics Agent" },
                  { risk: "Shipping Damage", icon: "warning", mitigation: "Dedicated container shipping, all-risk marine insurance, and documented pre/post-shipment photo evidence.", agent: "Logistics Agent" },
                  { risk: "Slow Sale (>60 days)", icon: "schedule", mitigation: "Dynamic pricing with automated reductions, multi-platform presence, and dealer wholesale network as fallback.", agent: "Listing Agent" },
                  { risk: "Fraudulent Listing", icon: "shield", mitigation: "Auction grade threshold, VIN provenance verification, matching numbers check, and trusted auction houses only.", agent: "Sourcing Agent" },
                ].map((item, i) => (
                  <ScrollReveal key={i} delay={i * 100} direction="up">
                    <div className="glass-panel border border-outline-variant/10 rounded-2xl p-7 h-full hover:border-primary/30 transition-all hover-lift hover-shine">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 rounded-full bg-error/10 border border-error/20 flex items-center justify-center">
                          <span className="material-symbols-outlined text-error text-lg">{item.icon}</span>
                        </div>
                        <h4 className="font-headline font-bold">{item.risk}</h4>
                      </div>
                      <p className="text-on-surface-variant text-sm leading-relaxed mb-4">{item.mitigation}</p>
                      <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 border border-primary/20">
                        <span className="material-symbols-outlined text-primary text-sm">smart_toy</span>
                        <span className="text-xs text-primary font-bold">{item.agent}</span>
                      </div>
                    </div>
                  </ScrollReveal>
                ))}
              </div>
            </div>
          </section>

          {/* ═══════════════ NEW: Sales Channels ═══════════════ */}
          <section className="py-24 px-6">
            <div className="max-w-7xl mx-auto">
              <ScrollReveal direction="up" className="text-center mb-16">
                <h2 className="font-headline text-4xl md:text-5xl font-bold mb-4">
                  Multi-Platform <span className="text-secondary">Sales</span> Reach
                </h2>
                <p className="text-on-surface-variant max-w-2xl mx-auto">
                  Your vehicles are listed across Europe&apos;s most powerful sales channels simultaneously.
                </p>
              </ScrollReveal>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <ScrollReveal delay={0} direction="left">
                  <div className="glass-panel border border-outline-variant/10 rounded-2xl p-8 hover-lift hover-shine">
                    <h3 className="font-headline font-bold text-lg mb-6 flex items-center gap-2">
                      <span className="material-symbols-outlined text-primary">store</span>
                      Primary Channels
                    </h3>
                    <div className="space-y-4">
                      {[
                        { name: "mobile.de", desc: "Germany's largest marketplace — Dealer API integration", tag: "Volume" },
                        { name: "AutoScout24", desc: "Pan-European reach — 20+ countries", tag: "Cross-Border" },
                        { name: "elferspot.com", desc: "Porsche specialist — premium buyer audience", tag: "Niche" },
                        { name: "ClassicDriver", desc: "Exotics & collectors — Ferrari, Aston Martin, Bentley", tag: "Premium" },
                      ].map((ch, i) => (
                        <div key={i} className="flex items-start justify-between p-4 rounded-xl bg-surface-container-high/30 border border-outline-variant/10">
                          <div>
                            <h4 className="font-headline font-bold text-sm">{ch.name}</h4>
                            <p className="text-xs text-on-surface-variant mt-0.5">{ch.desc}</p>
                          </div>
                          <span className="text-[10px] uppercase tracking-widest text-secondary font-bold bg-secondary/10 px-2 py-1 rounded-full shrink-0">{ch.tag}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </ScrollReveal>
                <ScrollReveal delay={150} direction="right">
                  <div className="glass-panel border border-outline-variant/10 rounded-2xl p-8 hover-lift hover-shine">
                    <h3 className="font-headline font-bold text-lg mb-6 flex items-center gap-2">
                      <span className="material-symbols-outlined text-secondary">public</span>
                      European Reach
                    </h3>
                    <div className="space-y-4">
                      {[
                        { country: "Germany", flag: "🇩🇪", status: "Primary Market", strength: 100 },
                        { country: "Switzerland", flag: "🇨🇭", status: "High Demand", strength: 85 },
                        { country: "Netherlands", flag: "🇳🇱", status: "Strong Market", strength: 75 },
                        { country: "Belgium", flag: "🇧🇪", status: "Growing", strength: 65 },
                        { country: "Austria", flag: "🇦🇹", status: "Active", strength: 60 },
                        { country: "France", flag: "🇫🇷", status: "Expanding", strength: 50 },
                      ].map((m, i) => (
                        <div key={i} className="flex items-center gap-4">
                          <span className="text-2xl">{m.flag}</span>
                          <div className="flex-1">
                            <div className="flex justify-between items-center mb-1">
                              <span className="font-headline font-bold text-sm">{m.country}</span>
                              <span className="text-xs text-on-surface-variant">{m.status}</span>
                            </div>
                            <div className="w-full h-1.5 bg-surface-container-high rounded-full overflow-hidden">
                              <div className="h-full bg-gradient-to-r from-primary to-secondary rounded-full transition-all duration-1000" style={{ width: `${m.strength}%` }}></div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </ScrollReveal>
              </div>
            </div>
          </section>

          {/* Performance Metrics */}
          <section className="py-24 bg-surface-container-highest/30 px-6">
            <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-16">
              <ScrollReveal className="text-center" delay={0} direction="left">
                <h2 className="text-6xl md:text-8xl font-headline font-bold text-primary neon-text-glow mb-2">
                  €25K+
                </h2>
                <p className="text-on-surface-variant uppercase tracking-[0.3em] text-sm">
                  Avg Net Profit
                </p>
              </ScrollReveal>
              <div className="w-px h-24 bg-outline-variant/20 hidden md:block"></div>
              <ScrollReveal className="text-center" delay={200} direction="up">
                <h2 className="text-6xl md:text-8xl font-headline font-bold text-on-surface mb-2">
                  60%
                </h2>
                <p className="text-on-surface-variant uppercase tracking-[0.3em] text-sm">
                  Up to Peak Margin
                </p>
              </ScrollReveal>
              <div className="w-px h-24 bg-outline-variant/20 hidden md:block"></div>
              <ScrollReveal className="text-center" delay={400} direction="right">
                <h2 className="text-6xl md:text-8xl font-headline font-bold text-secondary mb-2">
                  GLOBAL
                </h2>
                <p className="text-on-surface-variant uppercase tracking-[0.3em] text-sm">
                  Network Access
                </p>
              </ScrollReveal>
            </div>
          </section>

          {/* ═══════════════ NEW: Roadmap / Growth Metrics ═══════════════ */}
          <section className="py-24 px-6">
            <div className="max-w-7xl mx-auto">
              <ScrollReveal direction="up" className="text-center mb-16">
                <h2 className="font-headline text-4xl md:text-5xl font-bold mb-4">
                  Growth <span className="text-primary">Trajectory</span>
                </h2>
                <p className="text-on-surface-variant max-w-2xl mx-auto">
                  A phased scale-up from first acquisition to full-scale European operation.
                </p>
              </ScrollReveal>
              <ScrollReveal direction="up">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[600px]">
                    <thead>
                      <tr className="border-b border-outline-variant/20">
                        <th className="text-left py-4 px-4 font-headline text-sm text-on-surface-variant uppercase tracking-widest">Metric</th>
                        <th className="text-center py-4 px-4 font-headline text-sm text-on-surface-variant uppercase tracking-widest">Month 3</th>
                        <th className="text-center py-4 px-4 font-headline text-sm text-on-surface-variant uppercase tracking-widest">Month 6</th>
                        <th className="text-center py-4 px-4 font-headline text-sm text-on-surface-variant uppercase tracking-widest">Month 12</th>
                        <th className="text-center py-4 px-4 font-headline text-sm text-secondary uppercase tracking-widest">Month 24</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        { metric: "Vehicles / Month", m3: "1–2", m6: "3–5", m12: "6–10", m24: "12–20" },
                        { metric: "Avg Gross Margin", m3: "€15–30K", m6: "€20–40K", m12: "€25–50K", m24: "€25–60K" },
                        { metric: "Monthly Revenue", m3: "€60–240K", m6: "€210–750K", m12: "€480K–2M", m24: "€960K–5M" },
                        { metric: "AI Automation", m3: "35–45%", m6: "55–65%", m12: "70–80%", m24: "80–90%" },
                        { metric: "Team Size", m3: "1–2", m6: "2–3", m12: "3–4", m24: "4–6" },
                      ].map((row, i) => (
                        <tr key={i} className="border-b border-outline-variant/10 hover:bg-surface-container-high/30 transition-colors">
                          <td className="py-4 px-4 font-headline font-bold text-sm">{row.metric}</td>
                          <td className="py-4 px-4 text-center text-sm text-on-surface-variant">{row.m3}</td>
                          <td className="py-4 px-4 text-center text-sm text-on-surface-variant">{row.m6}</td>
                          <td className="py-4 px-4 text-center text-sm font-semibold">{row.m12}</td>
                          <td className="py-4 px-4 text-center text-sm font-bold text-secondary">{row.m24}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </ScrollReveal>
            </div>
          </section>

          {/* ═══════════════ NEW: FAQ ═══════════════ */}
          <section className="py-24 bg-surface-container-low px-6">
            <div className="max-w-7xl mx-auto">
              <ScrollReveal direction="up" className="text-center mb-16">
                <h2 className="font-headline text-4xl md:text-5xl font-bold mb-4">
                  Frequently Asked <span className="text-primary">Questions</span>
                </h2>
                <p className="text-on-surface-variant max-w-xl mx-auto">
                  Everything you need to know about luxury auto arbitrage from Japan.
                </p>
              </ScrollReveal>
              <ScrollReveal direction="up">
                <FAQ />
              </ScrollReveal>
            </div>
          </section>

          {/* ═══════════════ NEW: Contact / Inquiry ═══════════════ */}
          <section className="py-24 px-6">
            <div className="max-w-7xl mx-auto">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                <ScrollReveal direction="left">
                  <div>
                    <h2 className="font-headline text-4xl md:text-5xl font-bold mb-4">
                      Get in <span className="text-secondary">Touch</span>
                    </h2>
                    <p className="text-on-surface-variant mb-8 max-w-md">
                      Our AI Concierge responds within 10 minutes. For high-value inquiries, a human specialist will follow up personally.
                    </p>
                    <div className="space-y-6">
                      {[
                        { icon: "schedule", title: "Response Time", value: "Under 10 minutes", desc: "AI-powered instant response" },
                        { icon: "language", title: "Languages", value: "DE · EN · FR · IT · NL", desc: "Multi-language support" },
                        { icon: "verified_user", title: "Security", value: "End-to-end encrypted", desc: "Your data is protected" },
                      ].map((item, i) => (
                        <div key={i} className="flex items-start gap-4">
                          <div className="w-12 h-12 rounded-xl bg-surface-container-high border border-outline-variant/20 flex items-center justify-center shrink-0">
                            <span className="material-symbols-outlined text-primary">{item.icon}</span>
                          </div>
                          <div>
                            <h4 className="font-headline font-bold">{item.title}</h4>
                            <p className="text-secondary text-sm font-semibold">{item.value}</p>
                            <p className="text-xs text-on-surface-variant">{item.desc}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </ScrollReveal>
                <ScrollReveal direction="right">
                  <form onSubmit={(e) => e.preventDefault()} className="glass-panel border border-outline-variant/15 rounded-3xl p-8 space-y-5">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs uppercase tracking-widest text-on-surface-variant mb-2 font-label">First Name</label>
                        <input type="text" placeholder="John" className="w-full px-4 py-3 rounded-xl bg-surface-container-high border border-outline-variant/20 text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary/50 transition-all" />
                      </div>
                      <div>
                        <label className="block text-xs uppercase tracking-widest text-on-surface-variant mb-2 font-label">Last Name</label>
                        <input type="text" placeholder="Doe" className="w-full px-4 py-3 rounded-xl bg-surface-container-high border border-outline-variant/20 text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary/50 transition-all" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs uppercase tracking-widest text-on-surface-variant mb-2 font-label">Email</label>
                      <input type="email" placeholder="you@example.com" className="w-full px-4 py-3 rounded-xl bg-surface-container-high border border-outline-variant/20 text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary/50 transition-all" />
                    </div>
                    <div>
                      <label className="block text-xs uppercase tracking-widest text-on-surface-variant mb-2 font-label">Interested In</label>
                      <select className="w-full px-4 py-3 rounded-xl bg-surface-container-high border border-outline-variant/20 text-on-surface focus:outline-none focus:border-primary/50 transition-all">
                        <option value="">Select a brand...</option>
                        <option>Ferrari</option>
                        <option>Mercedes-AMG</option>
                        <option>Porsche</option>
                        <option>Lamborghini</option>
                        <option>Bentley</option>
                        <option>Aston Martin</option>
                        <option>Jaguar</option>
                        <option>BMW M</option>
                        <option>Other</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs uppercase tracking-widest text-on-surface-variant mb-2 font-label">Message</label>
                      <textarea rows={4} placeholder="Tell us about the vehicle you're looking for..." className="w-full px-4 py-3 rounded-xl bg-surface-container-high border border-outline-variant/20 text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary/50 transition-all resize-none"></textarea>
                    </div>
                    <button type="submit" className="w-full py-3.5 bg-primary-container text-on-primary-container font-bold rounded-xl text-lg hover:shadow-[0_0_25px_rgba(248,113,113,0.5)] transition-all duration-300 active:scale-[0.98]">
                      Send Inquiry
                    </button>
                    <p className="text-center text-xs text-on-surface-variant">
                      By submitting, you agree to our Privacy Policy. We&apos;ll respond within 10 minutes.
                    </p>
                  </form>
                </ScrollReveal>
              </div>
            </div>
          </section>

          {/* Premium CTA */}
          <section className="py-32 px-6">
            <ScrollReveal direction="up" duration={900}>
              <div className="max-w-6xl mx-auto relative rounded-[3rem] overflow-hidden bg-gradient-to-br from-[#0a0a0a] via-[#0a0a0a] to-primary/20 p-20 border border-primary/10 anim-border-pulse">
                <div className="absolute inset-0 z-0">
                  <Image
                    className="w-full h-full object-cover opacity-30"
                    src="https://lh3.googleusercontent.com/aida-public/AB6AXuDcTOWc3SzXrUhMZl4ye2FJXGZKoDLIv4HxitQfjd7z2-Y17h2a-jkRV7rBQwjYP0A2zNJUVpsKHlJnzBX8YINv5IbELlgKMqDZDibfFmW2msWsBvf5WhNJTRozv6r2WEmy3GCMe9TbHLjHNBRusBJZlGp0EsDaGlxEnMO5tdg279I0OlsjqWFuOYQGxxAH0f3XhzslCOVlqVpHeeItPjKj1NonOg2smOUhTdvYpP4nVGJ-h8_QiqY4UXU2lSh3RjA7FIoKJOEIsw"
                    alt="supercar interior dashboard"
                    fill
                  />
                  <div className="absolute inset-0 bg-black/60"></div>
                </div>
                <div className="relative z-10 text-center">
                  <h2 className="font-headline text-5xl md:text-6xl font-bold mb-8">
                    Enter the Future of{" "}
                    <span className="text-secondary">Luxury Auto Trading</span>
                  </h2>
                  <p className="text-on-surface-variant text-xl mb-12 max-w-2xl mx-auto">
                    Access our closed-alpha platform and start sourcing high-yield
                    assets today.
                  </p>
                  <a
                    href="/showroom"
                    className="inline-block bg-secondary text-on-secondary font-headline font-extrabold text-xl px-12 py-6 rounded-xl hover:shadow-[0_0_30px_rgba(234,193,105,0.6)] transition-all duration-500 scale-100 hover:scale-105 active:scale-95 uppercase tracking-widest"
                  >
                    Browse Showroom
                  </a>
                </div>
              </div>
            </ScrollReveal>
          </section>

          {/* Footer */}
          <ScrollReveal direction="up" distance={20} duration={500}>
            <footer className="w-full border-t border-primary/20 bg-[#0a0a0a] flex flex-col md:flex-row justify-between items-center px-12 py-8 gap-6 font-body text-sm tracking-wide">
              <div className="text-slate-500">© 2024 LuxJD</div>
              <div className="flex gap-8">
                <a className="text-slate-500 hover:text-slate-200 transition-all" href="#">
                  About
                </a>
                <a className="text-slate-500 hover:text-slate-200 transition-all" href="#">
                  Contact
                </a>
                <a className="text-slate-500 hover:text-slate-200 transition-all" href="#">
                  Privacy
                </a>
              </div>
              <div className="flex items-center gap-6">
                <a
                  className="text-primary font-bold transition-all hover:shadow-[0_0_15px_rgba(248,113,113,0.4)]"
                  href="#"
                >
                  <span className="material-symbols-outlined">language</span>
                </a>
                <button
                  onClick={openLogin}
                  className="text-primary font-bold transition-all hover:shadow-[0_0_15px_rgba(248,113,113,0.4)]"
                >
                  <span className="material-symbols-outlined">account_circle</span>
                </button>
              </div>
            </footer>
          </ScrollReveal>
        </>
      )}
    </AuthModals>
  );
}
