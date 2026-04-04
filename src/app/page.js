"use client";

import Image from "next/image";
import AuthModals from "./components/AuthModals";
import ScrollReveal from "./components/ScrollReveal";

export default function Home() {
  return (
    <AuthModals>
      {({ openLogin, openSignup }) => (
        <>
          {/* Top Navigation Bar */}
          <nav className="anim-nav fixed top-0 w-full z-50 bg-[#0B0B0B]/80 backdrop-blur-xl shadow-[0_0_20px_rgba(58,134,255,0.1)] flex justify-between items-center px-8 py-4 max-w-full font-headline tracking-tighter uppercase">
            <div className="text-xl font-bold tracking-widest text-slate-100">
              LuxJD
            </div>
            <div className="hidden md:flex items-center gap-8">
              <a className="text-blue-400 border-b-2 border-blue-500 pb-1" href="#">
                Home
              </a>
              <a className="text-slate-300 hover:text-blue-300 transition-colors" href="#">
                About
              </a>
              <a className="text-slate-300 hover:text-blue-300 transition-colors" href="#">
                Inventory
              </a>
              <a className="text-slate-300 hover:text-blue-300 transition-colors" href="#">
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
              <button
                onClick={openSignup}
                className="bg-primary-container text-on-primary-container px-6 py-2 rounded-xl font-bold scale-95 active:scale-90 transition-transform hover:shadow-[0_0_15px_rgba(173,198,255,0.4)]"
              >
                Get Started
              </button>
            </div>
          </nav>

          {/* Hero Section */}
          <section className="relative h-screen flex items-center justify-center overflow-hidden">
            <div className="absolute inset-0 z-0">
              <Image
                className="anim-hero-image w-full h-full object-cover brightness-50"
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuBXqatSJuC2pgQuVAPu8TeDA7b1kLNpCVtRV7yGGGh18NO3MmSJbJu3mlWonzp5HPIGD_1kogl2WBawoVO9SrNGcJUADLM5zoz0wA29p3NQTbUciCox9WKz3ymYYJ06a9kM53OhvMQ9aXKUEac9MXrrm8EDJ0RUO8u5Lgi6FN5WrUurOjqZzbfr8JGdsVD7Ni6dkYbpRXkp4rLLMO9XBO8F2VPi7glwcmcxxTGCvTyWB6dn3IByIFARqlGHQc2SI4y3CNkuw03J9w=w1920"
                alt="dramatic low angle shot of a sleek black supercar in a futuristic dark garage with atmospheric blue and gold neon lighting reflections"
                fill
                priority
                quality={100}
                sizes="100vw"
                unoptimized
              />
              <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-background/50"></div>
            </div>
            <div className="relative z-10 text-center max-w-5xl px-6">
              <div className="anim-hero-badge inline-block mb-4 px-4 py-1 rounded-full border border-primary/20 bg-primary/10 backdrop-blur-md">
                <span className="text-primary font-medium tracking-widest uppercase text-xs">
                  The Pinnacle of Sourcing
                </span>
              </div>
              <h1 className="anim-hero-title font-headline text-5xl md:text-8xl font-bold mb-6 neon-text-glow leading-tight">
                AI-Powered{" "}
                <span className="anim-shimmer-text">
                  Luxury Car Arbitrage
                </span>
              </h1>
              <p className="anim-hero-subtitle text-on-surface-variant text-xl md:text-2xl mb-10 max-w-2xl mx-auto leading-relaxed">
                Source undervalued supercars from Japan. Sell at premium in Europe.
                Guided by hyper-intelligent market data.
              </p>
              <div className="anim-hero-buttons flex flex-col md:flex-row gap-6 justify-center items-center">
                <button
                  onClick={openSignup}
                  className="px-10 py-4 bg-primary text-on-primary font-bold rounded-xl text-lg hover:shadow-[0_0_25px_rgba(173,198,255,0.5)] transition-all duration-300 hover:scale-105 active:scale-95"
                >
                  Explore Inventory
                </button>
                <button
                  onClick={openLogin}
                  className="px-10 py-4 border-2 border-outline/30 text-on-surface font-bold rounded-xl text-lg backdrop-blur-sm hover:border-primary/50 hover:scale-105 active:scale-95 transition-all"
                >
                  View Strategy
                </button>
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
                {/* Connector Line - animated */}
                <ScrollReveal className="hidden md:block absolute top-12 left-0 w-full h-[2px] z-0" direction="none" threshold={0.3}>
                  <div className="w-full h-full bg-gradient-to-r from-primary/0 via-primary/50 to-secondary/0 anim-line-grow"></div>
                </ScrollReveal>

                {/* Step 1 */}
                <ScrollReveal className="relative z-10 group" delay={0} direction="up">
                  <div className="w-24 h-24 rounded-full bg-surface-container-high border border-primary/30 flex items-center justify-center mb-8 mx-auto group-hover:scale-110 group-hover:shadow-[0_0_20px_rgba(173,198,255,0.3)] transition-all anim-pulse-glow">
                    <span className="material-symbols-outlined text-primary text-4xl">
                      analytics
                    </span>
                  </div>
                  <div className="text-center">
                    <h3 className="font-headline text-xl font-bold mb-3">
                      AI Market Analysis
                    </h3>
                    <p className="text-on-surface-variant text-sm">
                      Identifying cross-border price discrepancies in real-time.
                    </p>
                  </div>
                </ScrollReveal>

                {/* Step 2 */}
                <ScrollReveal className="relative z-10 group" delay={150} direction="up">
                  <div className="w-24 h-24 rounded-full bg-surface-container-high border border-secondary/30 flex items-center justify-center mb-8 mx-auto group-hover:scale-110 group-hover:shadow-[0_0_20px_rgba(234,193,105,0.3)] transition-all anim-pulse-glow-gold">
                    <span className="material-symbols-outlined text-secondary text-4xl">
                      location_searching
                    </span>
                  </div>
                  <div className="text-center">
                    <h3 className="font-headline text-xl font-bold mb-3">
                      Japan Sourcing
                    </h3>
                    <p className="text-on-surface-variant text-sm">
                      Direct access to elite Japanese auction houses.
                    </p>
                  </div>
                </ScrollReveal>

                {/* Step 3 */}
                <ScrollReveal className="relative z-10 group" delay={300} direction="up">
                  <div className="w-24 h-24 rounded-full bg-surface-container-high border border-primary/30 flex items-center justify-center mb-8 mx-auto group-hover:scale-110 group-hover:shadow-[0_0_20px_rgba(173,198,255,0.3)] transition-all anim-pulse-glow">
                    <span className="material-symbols-outlined text-primary text-4xl">
                      sailing
                    </span>
                  </div>
                  <div className="text-center">
                    <h3 className="font-headline text-xl font-bold mb-3">
                      Import &amp; Logistics
                    </h3>
                    <p className="text-on-surface-variant text-sm">
                      Seamless white-glove transport and customs clearance.
                    </p>
                  </div>
                </ScrollReveal>

                {/* Step 4 */}
                <ScrollReveal className="relative z-10 group" delay={450} direction="up">
                  <div className="w-24 h-24 rounded-full bg-surface-container-high border border-secondary/30 flex items-center justify-center mb-8 mx-auto group-hover:scale-110 group-hover:shadow-[0_0_20px_rgba(234,193,105,0.3)] transition-all anim-pulse-glow-gold">
                    <span className="material-symbols-outlined text-secondary text-4xl">
                      sell
                    </span>
                  </div>
                  <div className="text-center">
                    <h3 className="font-headline text-xl font-bold mb-3">
                      Sell in Europe
                    </h3>
                    <p className="text-on-surface-variant text-sm">
                      Placement in high-liquidity EU premium showrooms.
                    </p>
                  </div>
                </ScrollReveal>
              </div>
            </div>
          </section>

          {/* Featured Vehicles */}
          <section className="py-24 bg-surface-container-low px-6">
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
                {/* Card 1 */}
                <ScrollReveal delay={0} direction="up">
                  <div className="group bg-surface-container rounded-2xl overflow-hidden border border-outline-variant/10 hover:border-primary/50 transition-all duration-500 hover-lift">
                    <div className="h-64 overflow-hidden relative">
                      <Image
                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                        src="https://lh3.googleusercontent.com/aida-public/AB6AXuDJuHOJfnwz1Vg_lQ1maYQvS3qoMTURwEwxaykKSmLy8040GDySVT2v6YpxwQkkZ8DzG3F9JrHHwSQncVGxQS2W3aKPQzmkolF3Zg0plTTnx053_gyFDbql9OKONxll26rPRsuGmfejxazBm8uZAaiM3QA_8wmSZgf0x6HDZceuMkRU0XbWuQZmHZ_NAKQeNJOIyO0hagRk96x-JlVoITnBrRIeACT0az2KkcJySM4LeO_utmtM95Yaq55jStr3MoOu2h46RnzhHQ"
                        alt="Ferrari 488 GTB"
                        fill
                      />
                      <div className="absolute top-4 right-4 bg-background/60 backdrop-blur-md px-3 py-1 rounded-full text-secondary text-xs font-bold uppercase tracking-widest border border-secondary/30">
                        Available Now
                      </div>
                    </div>
                    <div className="p-8">
                      <h3 className="font-headline text-2xl font-bold mb-2">
                        Ferrari 488 GTB
                      </h3>
                      <p className="text-on-surface-variant text-sm mb-6">
                        Osaka Regional Hub
                      </p>
                      <div className="grid grid-cols-2 gap-4 pt-6 border-t border-outline-variant/10">
                        <div>
                          <p className="text-xs uppercase text-on-surface-variant mb-1">
                            Buy Price
                          </p>
                          <p className="text-xl font-bold">€185,000</p>
                        </div>
                        <div>
                          <p className="text-xs uppercase text-primary mb-1">
                            Est. Profit
                          </p>
                          <p className="text-xl font-bold text-primary">€42,000</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </ScrollReveal>

                {/* Card 2 */}
                <ScrollReveal delay={150} direction="up">
                  <div className="group bg-surface-container rounded-2xl overflow-hidden border border-outline-variant/10 hover:border-primary/50 transition-all duration-500 hover-lift">
                    <div className="h-64 overflow-hidden relative">
                      <Image
                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                        src="https://lh3.googleusercontent.com/aida-public/AB6AXuAa6z-laJIhTiy_OxW-TCKByWrVOrKeI4QI439qyAgd263NZeTV_dSdhar8z7eNjygSI_BX-LPSUhSuPei_WU-pGSQJfHC40U8Z-3Yu0IDr7asL_xe8ceJJRSr9j32tKpX77o8VKCmUSIBTfAwd4gQU0nqME4doK6D-IMaVNWb6gAOsMcnv_zVE8VGNUk4Btl1TFSqL9tEVPI0WrbPNDFFpsZcDbkwrwAtRltRzYfHSgHSxuJ26PVqzO3kx8jlv_cVPUFmfDG3gdg"
                        alt="Porsche 911 GT3"
                        fill
                      />
                      <div className="absolute top-4 right-4 bg-background/60 backdrop-blur-md px-3 py-1 rounded-full text-primary text-xs font-bold uppercase tracking-widest border border-primary/30">
                        In Transit
                      </div>
                    </div>
                    <div className="p-8">
                      <h3 className="font-headline text-2xl font-bold mb-2">
                        Porsche 911 GT3 (992)
                      </h3>
                      <p className="text-on-surface-variant text-sm mb-6">
                        Tokyo Port Hub
                      </p>
                      <div className="grid grid-cols-2 gap-4 pt-6 border-t border-outline-variant/10">
                        <div>
                          <p className="text-xs uppercase text-on-surface-variant mb-1">
                            Buy Price
                          </p>
                          <p className="text-xl font-bold">€210,000</p>
                        </div>
                        <div>
                          <p className="text-xs uppercase text-primary mb-1">
                            Est. Profit
                          </p>
                          <p className="text-xl font-bold text-primary">€38,500</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </ScrollReveal>

                {/* Card 3 */}
                <ScrollReveal delay={300} direction="up">
                  <div className="group bg-surface-container rounded-2xl overflow-hidden border border-outline-variant/10 hover:border-primary/50 transition-all duration-500 hover-lift">
                    <div className="h-64 overflow-hidden relative">
                      <Image
                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                        src="https://lh3.googleusercontent.com/aida-public/AB6AXuDFi1KI9otlroY-VbTQccK1RLpoeRLxI3is0qYP7fDJZ45xm3dk-6SGt771iJzBF7XazV4IlTRDFIFVGCWu78im7YJmLUorFwV1dPw5YIR959ZnqEibsoHwfoHGEFNKDvObgIt-AAVSQO_NoN2oRbGsFDLCcReQigMfbRbWBJYPmVILCJsMKPt5dj-F13lbNRC1etmpYmvzmsyz1Y_3yAtdc8NATLX5RajJhdI6R89D833XKhwG3TPufMOZkwbmWFiN0-4uolgtXw"
                        alt="Lamborghini Huracán STO"
                        fill
                      />
                      <div className="absolute top-4 right-4 bg-background/60 backdrop-blur-md px-3 py-1 rounded-full text-secondary text-xs font-bold uppercase tracking-widest border border-secondary/30">
                        High Priority
                      </div>
                    </div>
                    <div className="p-8">
                      <h3 className="font-headline text-2xl font-bold mb-2">
                        Lamborghini Huracán STO
                      </h3>
                      <p className="text-on-surface-variant text-sm mb-6">
                        Kyoto Exclusive Collection
                      </p>
                      <div className="grid grid-cols-2 gap-4 pt-6 border-t border-outline-variant/10">
                        <div>
                          <p className="text-xs uppercase text-on-surface-variant mb-1">
                            Buy Price
                          </p>
                          <p className="text-xl font-bold">€345,000</p>
                        </div>
                        <div>
                          <p className="text-xs uppercase text-primary mb-1">
                            Est. Profit
                          </p>
                          <p className="text-xl font-bold text-primary">€58,200</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </ScrollReveal>
              </div>
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
                <div
                  className="md:-translate-y-8 flex-1 p-8 glass-panel border border-outline-variant/10 rounded-2xl flex flex-col items-center text-center cursor-default icon-bounce anim-wave"
                  style={{ animationDelay: "0s", animationFillMode: "both" }}
                >
                  <span className="material-symbols-outlined text-primary text-4xl mb-6">
                    query_stats
                  </span>
                  <h4 className="font-headline font-bold text-lg mb-2">
                    Market Agent
                  </h4>
                  <p className="text-xs text-on-surface-variant">
                    Real-time global price parity tracker.
                  </p>
                </div>
                <div
                  className="md:translate-y-8 flex-1 p-8 glass-panel border border-outline-variant/10 rounded-2xl flex flex-col items-center text-center cursor-default icon-bounce anim-wave-gold"
                  style={{ animationDelay: "0.35s", animationFillMode: "both" }}
                >
                  <span className="material-symbols-outlined text-secondary text-4xl mb-6">
                    precision_manufacturing
                  </span>
                  <h4 className="font-headline font-bold text-lg mb-2">
                    Sourcing Agent
                  </h4>
                  <p className="text-xs text-on-surface-variant">
                    Autonomous auction bidding &amp; inspection.
                  </p>
                </div>
                <div
                  className="md:-translate-y-8 flex-1 p-8 glass-panel border border-outline-variant/10 rounded-2xl flex flex-col items-center text-center cursor-default icon-bounce anim-wave"
                  style={{ animationDelay: "0.7s", animationFillMode: "both" }}
                >
                  <span className="material-symbols-outlined text-primary text-4xl mb-6">
                    currency_exchange
                  </span>
                  <h4 className="font-headline font-bold text-lg mb-2">
                    Finance Agent
                  </h4>
                  <p className="text-xs text-on-surface-variant">
                    FX hedging and transaction optimization.
                  </p>
                </div>
                <div
                  className="md:translate-y-8 flex-1 p-8 glass-panel border border-outline-variant/10 rounded-2xl flex flex-col items-center text-center cursor-default icon-bounce anim-wave-gold"
                  style={{ animationDelay: "1.05s", animationFillMode: "both" }}
                >
                  <span className="material-symbols-outlined text-secondary text-4xl mb-6">
                    inventory_2
                  </span>
                  <h4 className="font-headline font-bold text-lg mb-2">
                    Logistics Agent
                  </h4>
                  <p className="text-xs text-on-surface-variant">
                    Supply chain and duty calculation.
                  </p>
                </div>
                <div
                  className="md:-translate-y-8 flex-1 p-8 glass-panel border border-outline-variant/10 rounded-2xl flex flex-col items-center text-center cursor-default icon-bounce anim-wave"
                  style={{ animationDelay: "1.4s", animationFillMode: "both" }}
                >
                  <span className="material-symbols-outlined text-primary text-4xl mb-6">
                    support_agent
                  </span>
                  <h4 className="font-headline font-bold text-lg mb-2">
                    Concierge Agent
                  </h4>
                  <p className="text-xs text-on-surface-variant">
                    24/7 high-net-worth portfolio support.
                  </p>
                </div>
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

          {/* Premium CTA */}
          <section className="py-32 px-6">
            <ScrollReveal direction="up" duration={900}>
              <div className="max-w-6xl mx-auto relative rounded-[3rem] overflow-hidden bg-gradient-to-br from-[#0B0B0B] via-[#0B0B0B] to-primary/20 p-20 border border-primary/10 anim-border-pulse">
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
                  <button
                    onClick={openSignup}
                    className="bg-secondary text-on-secondary font-headline font-extrabold text-xl px-12 py-6 rounded-xl hover:shadow-[0_0_30px_rgba(234,193,105,0.6)] transition-all duration-500 scale-100 hover:scale-105 active:scale-95 uppercase tracking-widest"
                  >
                    Get Started
                  </button>
                </div>
              </div>
            </ScrollReveal>
          </section>

          {/* Footer */}
          <ScrollReveal direction="up" distance={20} duration={500}>
            <footer className="w-full border-t border-[#EAC169]/30 bg-[#121212] flex flex-col md:flex-row justify-between items-center px-12 py-8 gap-6 font-body text-sm tracking-wide">
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
                  className="text-[#EAC169] font-bold transition-all hover:shadow-[0_0_15px_rgba(234,193,105,0.4)]"
                  href="#"
                >
                  <span className="material-symbols-outlined">language</span>
                </a>
                <button
                  onClick={openLogin}
                  className="text-[#EAC169] font-bold transition-all hover:shadow-[0_0_15px_rgba(234,193,105,0.4)]"
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
