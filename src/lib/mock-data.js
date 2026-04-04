export const PIPELINE_STAGES = [
  { key: "SOURCED", label: "Sourced", icon: "search", color: "text-blue-400", bg: "bg-blue-400/10" },
  { key: "PURCHASED", label: "Purchased", icon: "gavel", color: "text-indigo-400", bg: "bg-indigo-400/10" },
  { key: "JP_TRANSPORT", label: "JP Transport", icon: "local_shipping", color: "text-violet-400", bg: "bg-violet-400/10" },
  { key: "AT_PORT_JP", label: "At Port JP", icon: "anchor", color: "text-purple-400", bg: "bg-purple-400/10" },
  { key: "IN_TRANSIT", label: "In Transit", icon: "sailing", color: "text-cyan-400", bg: "bg-cyan-400/10" },
  { key: "AT_PORT_DE", label: "At Port DE", icon: "location_on", color: "text-teal-400", bg: "bg-teal-400/10" },
  { key: "CUSTOMS", label: "Customs", icon: "fact_check", color: "text-amber-400", bg: "bg-amber-400/10" },
  { key: "WORKSHOP", label: "Workshop", icon: "build", color: "text-orange-400", bg: "bg-orange-400/10" },
  { key: "TUV", label: "TUV", icon: "verified", color: "text-yellow-400", bg: "bg-yellow-400/10" },
  { key: "READY_FOR_SALE", label: "For Sale", icon: "storefront", color: "text-emerald-400", bg: "bg-emerald-400/10" },
];

export const vehicles = [
  { id: "v001", make: "Ferrari", model: "488 GTB", year: 2017, mileage: 18000, color: "Rosso Corsa", driveSide: "LHD", auctionSource: "USS Tokyo", grade: 4.5, purchasePriceJpy: 16500000, purchasePriceEur: 98802, landedCostEur: 121888, estimatedSaleEur: 168000, currentStage: "READY_FOR_SALE", daysInStage: 3, margin: 46112, marginPct: 27.4 },
  { id: "v002", make: "Porsche", model: "911 GT3 (992)", year: 2021, mileage: 12000, color: "GT Silver", driveSide: "LHD", auctionSource: "BH Auction", grade: 4.5, purchasePriceJpy: 22000000, purchasePriceEur: 131736, landedCostEur: 158000, estimatedSaleEur: 210000, currentStage: "IN_TRANSIT", daysInStage: 12, margin: 52000, marginPct: 24.8 },
  { id: "v003", make: "Mercedes-AMG", model: "GT R", year: 2019, mileage: 25000, color: "Selenite Grey", driveSide: "LHD", auctionSource: "USS Nagoya", grade: 4.0, purchasePriceJpy: 9800000, purchasePriceEur: 58682, landedCostEur: 71180, estimatedSaleEur: 105000, currentStage: "CUSTOMS", daysInStage: 2, margin: 33820, marginPct: 32.2 },
  { id: "v004", make: "Lamborghini", model: "Huracan STO", year: 2022, mileage: 5000, color: "Arancio Borealis", driveSide: "LHD", auctionSource: "BH Auction", grade: 5.0, purchasePriceJpy: 42000000, purchasePriceEur: 251497, landedCostEur: 295000, estimatedSaleEur: 365000, currentStage: "AT_PORT_JP", daysInStage: 4, margin: 70000, marginPct: 19.2 },
  { id: "v005", make: "Bentley", model: "Continental GT", year: 2020, mileage: 22000, color: "Onyx Black", driveSide: "LHD", auctionSource: "USS Tokyo", grade: 4.5, purchasePriceJpy: 15000000, purchasePriceEur: 89820, landedCostEur: 110000, estimatedSaleEur: 155000, currentStage: "WORKSHOP", daysInStage: 5, margin: 45000, marginPct: 29.0 },
  { id: "v006", make: "Aston Martin", model: "DB11 V12", year: 2018, mileage: 31000, color: "Magnetic Silver", driveSide: "LHD", auctionSource: "Arai", grade: 4.0, purchasePriceJpy: 12500000, purchasePriceEur: 74850, landedCostEur: 92000, estimatedSaleEur: 135000, currentStage: "TUV", daysInStage: 1, margin: 43000, marginPct: 31.9 },
  { id: "v007", make: "BMW", model: "M4 Competition", year: 2022, mileage: 8000, color: "Isle of Man Green", driveSide: "LHD", auctionSource: "USS Tokyo", grade: 4.5, purchasePriceJpy: 8200000, purchasePriceEur: 49101, landedCostEur: 62000, estimatedSaleEur: 85000, currentStage: "JP_TRANSPORT", daysInStage: 3, margin: 23000, marginPct: 27.1 },
  { id: "v008", make: "Porsche", model: "Cayenne Turbo GT", year: 2022, mileage: 14000, color: "Arctic Grey", driveSide: "LHD", auctionSource: "USS Kobe", grade: 4.0, purchasePriceJpy: 18000000, purchasePriceEur: 107784, landedCostEur: 132000, estimatedSaleEur: 178000, currentStage: "PURCHASED", daysInStage: 1, margin: 46000, marginPct: 25.8 },
  { id: "v009", make: "Jaguar", model: "F-Type SVR", year: 2019, mileage: 19000, color: "Caldera Red", driveSide: "LHD", auctionSource: "USS Tokyo", grade: 4.0, purchasePriceJpy: 7500000, purchasePriceEur: 44910, landedCostEur: 58000, estimatedSaleEur: 82000, currentStage: "AT_PORT_DE", daysInStage: 1, margin: 24000, marginPct: 29.3 },
  { id: "v010", make: "Ferrari", model: "Roma", year: 2021, mileage: 9000, color: "Blu Pozzi", driveSide: "LHD", auctionSource: "BH Auction", grade: 5.0, purchasePriceJpy: 24000000, purchasePriceEur: 143713, landedCostEur: 172000, estimatedSaleEur: 235000, currentStage: "SOURCED", daysInStage: 0, margin: 63000, marginPct: 26.8 },
  { id: "v011", make: "Maserati", model: "MC20", year: 2022, mileage: 6000, color: "Bianco Audace", driveSide: "LHD", auctionSource: "BH Auction", grade: 4.5, purchasePriceJpy: 20000000, purchasePriceEur: 119760, landedCostEur: 145000, estimatedSaleEur: 198000, currentStage: "SOURCED", daysInStage: 0, margin: 53000, marginPct: 26.8 },
  { id: "v012", make: "Mercedes-AMG", model: "G63", year: 2021, mileage: 16000, color: "Obsidian Black", driveSide: "LHD", auctionSource: "USS Tokyo", grade: 4.5, purchasePriceJpy: 16000000, purchasePriceEur: 95808, landedCostEur: 118000, estimatedSaleEur: 165000, currentStage: "IN_TRANSIT", daysInStage: 22, margin: 47000, marginPct: 28.5 },
];

export const opportunities = [
  { id: "opp001", make: "Ferrari", model: "F12 Berlinetta", year: 2016, auctionHouse: "BH Auction", jpPriceJpy: 19500000, jpPriceEur: 116766, estimatedDeValue: 195000, spreadPct: 40.1, confidence: 0.92, recommendation: "STRONG_BUY", riskLevel: "LOW", auctionDate: "2026-04-08", grade: 4.5, mileage: 28000, color: "Rosso Corsa" },
  { id: "opp002", make: "Porsche", model: "718 Cayman GT4", year: 2020, auctionHouse: "USS Tokyo", jpPriceJpy: 8500000, jpPriceEur: 50898, estimatedDeValue: 82000, spreadPct: 38.0, confidence: 0.88, recommendation: "BUY", riskLevel: "LOW", auctionDate: "2026-04-08", grade: 4.5, mileage: 15000, color: "Racing Yellow" },
  { id: "opp003", make: "Lamborghini", model: "Urus Performante", year: 2023, auctionHouse: "BH Auction", jpPriceJpy: 28000000, jpPriceEur: 167665, estimatedDeValue: 248000, spreadPct: 32.4, confidence: 0.85, recommendation: "BUY", riskLevel: "MEDIUM", auctionDate: "2026-04-10", grade: 4.0, mileage: 8000, color: "Nero Noctis" },
  { id: "opp004", make: "Aston Martin", model: "Vantage V8", year: 2020, auctionHouse: "Arai", jpPriceJpy: 10200000, jpPriceEur: 61078, estimatedDeValue: 98000, spreadPct: 37.7, confidence: 0.82, recommendation: "BUY", riskLevel: "MEDIUM", auctionDate: "2026-04-09", grade: 4.0, mileage: 21000, color: "China Grey" },
  { id: "opp005", make: "BMW", model: "M5 CS", year: 2022, auctionHouse: "USS Nagoya", jpPriceJpy: 13500000, jpPriceEur: 80838, estimatedDeValue: 125000, spreadPct: 35.3, confidence: 0.90, recommendation: "STRONG_BUY", riskLevel: "LOW", auctionDate: "2026-04-08", grade: 4.5, mileage: 11000, color: "Frozen Deep Green" },
  { id: "opp006", make: "Range Rover", model: "Sport SVR", year: 2021, auctionHouse: "USS Tokyo", jpPriceJpy: 9800000, jpPriceEur: 58682, estimatedDeValue: 88000, spreadPct: 33.3, confidence: 0.79, recommendation: "REVIEW", riskLevel: "MEDIUM", auctionDate: "2026-04-11", grade: 4.0, mileage: 35000, color: "Carpathian Grey" },
];

export const listings = [
  { id: "lst001", vehicleId: "v001", make: "Ferrari", model: "488 GTB", year: 2017, listedPrice: 175000, status: "ACTIVE", daysOnMarket: 3, views: 284, inquiries: 4, platform: "mobile.de", color: "Rosso Corsa" },
  { id: "lst002", vehicleId: "v006", make: "Aston Martin", model: "DB11 V12", year: 2018, listedPrice: 139000, status: "ACTIVE", daysOnMarket: 0, views: 0, inquiries: 0, platform: "ClassicDriver", color: "Magnetic Silver" },
  { id: "lst003", vehicleId: "sold001", make: "Porsche", model: "911 Turbo S", year: 2020, listedPrice: 198000, status: "SOLD", daysOnMarket: 18, views: 1247, inquiries: 12, platform: "elferspot", color: "Night Blue" },
  { id: "lst004", vehicleId: "sold002", make: "Mercedes-AMG", model: "GT 63 S", year: 2021, listedPrice: 142000, status: "SOLD", daysOnMarket: 24, views: 892, inquiries: 8, platform: "mobile.de", color: "Obsidian Black" },
  { id: "lst005", vehicleId: "v005", make: "Bentley", model: "Continental GT", year: 2020, listedPrice: 158000, status: "DRAFT", daysOnMarket: 0, views: 0, inquiries: 0, platform: "mobile.de", color: "Onyx Black" },
];

export const financeData = {
  summary: {
    totalRevenue: 1248000,
    totalCosts: 872000,
    grossMargin: 30.1,
    netPL: 376000,
    fxGainLoss: 18500,
    capitalDeployed: 1150000,
    vatReclaimable: 68200,
  },
  fxRate: { eurJpy: 166.80, change24h: -0.45, change7d: 1.2, bufferRate: 161.80 },
  soldVehicles: [
    { make: "Porsche", model: "911 Turbo S", year: 2020, purchaseCost: 142000, totalCosts: 168000, salePrice: 198000, margin: 30000, marginPct: 15.2, daysToSell: 18 },
    { make: "Mercedes-AMG", model: "GT 63 S", year: 2021, purchaseCost: 95000, totalCosts: 118000, salePrice: 142000, margin: 24000, marginPct: 16.9, daysToSell: 24 },
    { make: "Ferrari", model: "California T", year: 2016, purchaseCost: 78000, totalCosts: 96000, salePrice: 138000, margin: 42000, marginPct: 30.4, daysToSell: 11 },
    { make: "BMW", model: "M8 Competition", year: 2020, purchaseCost: 62000, totalCosts: 78000, salePrice: 112000, margin: 34000, marginPct: 30.4, daysToSell: 28 },
    { make: "Lamborghini", model: "Urus", year: 2021, purchaseCost: 135000, totalCosts: 162000, salePrice: 218000, margin: 56000, marginPct: 25.7, daysToSell: 15 },
    { make: "Porsche", model: "Taycan Turbo S", year: 2022, purchaseCost: 88000, totalCosts: 108000, salePrice: 148000, margin: 40000, marginPct: 27.0, daysToSell: 21 },
  ],
};

export const leads = [
  { id: "lead001", name: "Thomas Mueller", email: "thomas@example.de", vehicle: "Ferrari 488 GTB", source: "mobile.de", status: "NEW", date: "2026-04-04", notes: "Budget up to €180K, wants test drive" },
  { id: "lead002", name: "Hans Weber", email: "hans.w@example.de", vehicle: "Porsche 911 GT3", source: "elferspot", status: "QUALIFIED", date: "2026-04-03", notes: "Serious collector, owns 3 Porsches already" },
  { id: "lead003", name: "Sophie Laurent", email: "sophie@example.fr", vehicle: "Lamborghini Huracan STO", source: "ClassicDriver", status: "CONTACTED", date: "2026-04-02", notes: "French buyer, wants delivery to Paris" },
  { id: "lead004", name: "Marco Rossi", email: "marco@example.it", vehicle: "Ferrari 488 GTB", source: "Instagram", status: "NEW", date: "2026-04-04", notes: "DM inquiry, asked about service history" },
  { id: "lead005", name: "Jan de Vries", email: "jan@example.nl", vehicle: "Bentley Continental GT", source: "AutoScout24", status: "CONTACTED", date: "2026-04-01", notes: "Dutch buyer, dealer trade possible" },
  { id: "lead006", name: "Klaus Schmidt", email: "klaus@example.de", vehicle: "Mercedes-AMG GT R", source: "mobile.de", status: "CONVERTED", date: "2026-03-28", notes: "Purchase confirmed, payment pending" },
  { id: "lead007", name: "Pierre Dupont", email: "pierre@example.fr", vehicle: "Aston Martin DB11", source: "ClassicDriver", status: "LOST", date: "2026-03-25", notes: "Found alternative at lower price" },
  { id: "lead008", name: "Emma Fischer", email: "emma@example.de", vehicle: "BMW M4 Competition", source: "mobile.de", status: "QUALIFIED", date: "2026-04-03", notes: "Ready to buy, wants to see it in person" },
];

export const agents = [
  { id: "de-market", name: "DE Market Agent", icon: "query_stats", status: "ONLINE", lastAction: "Scanned 342 listings on mobile.de", time: "2 min ago", metrics: { scanned: 342, priceUpdates: 28 } },
  { id: "jp-sourcing", name: "JP Sourcing Agent", icon: "travel_explore", status: "PROCESSING", lastAction: "Analyzing USS Tokyo auction batch", time: "now", metrics: { evaluated: 47, opportunities: 6 } },
  { id: "listing", name: "Listing Agent", icon: "edit_note", status: "IDLE", lastAction: "Updated Ferrari 488 listing photos", time: "1h ago", metrics: { activeListings: 2, drafts: 1 } },
  { id: "logistics", name: "Logistics Agent", icon: "local_shipping", status: "ONLINE", lastAction: "Tracking vessel MV Pacific Star", time: "15 min ago", metrics: { inTransit: 2, atPort: 2 } },
  { id: "finance", name: "Finance Agent", icon: "account_balance", status: "ONLINE", lastAction: "FX rate alert: EUR/JPY at 166.80", time: "30 min ago", metrics: { totalPL: "€376K", fxExposure: "€1.15M" } },
  { id: "concierge", name: "Concierge Agent", icon: "support_agent", status: "ONLINE", lastAction: "Replied to Thomas Mueller inquiry", time: "45 min ago", metrics: { openLeads: 5, responded: 3 } },
  { id: "orchestrator", name: "Orchestrator", icon: "hub", status: "ONLINE", lastAction: "Approved Ferrari F12 purchase bid", time: "3h ago", metrics: { approved: 12, rejected: 4 } },
];

export const dashboardMetrics = {
  activeVehicles: 12,
  portfolioValue: 1850000,
  unrealizedPL: 342000,
  leadsThisMonth: 23,
  avgMarginPct: 27.8,
  avgDaysToSell: 19,
  vehiclesSoldThisMonth: 6,
  totalRevenue: 1248000,
};

export const recentActivity = [
  { id: 1, type: "purchase", message: "Ferrari F12 Berlinetta bid approved", agent: "Orchestrator", time: "3h ago", icon: "gavel" },
  { id: 2, type: "lead", message: "New inquiry from Thomas Mueller for 488 GTB", agent: "Concierge", time: "45 min ago", icon: "person_add" },
  { id: 3, type: "fx", message: "EUR/JPY crossed 166.80 — within normal range", agent: "Finance", time: "30 min ago", icon: "currency_exchange" },
  { id: 4, type: "shipping", message: "MV Pacific Star ETA Bremerhaven: Apr 18", agent: "Logistics", time: "15 min ago", icon: "sailing" },
  { id: 5, type: "listing", message: "Ferrari 488 GTB listed on mobile.de at €175K", agent: "Listing", time: "2h ago", icon: "storefront" },
  { id: 6, type: "scan", message: "USS Tokyo batch: 47 vehicles evaluated, 6 opportunities found", agent: "JP Sourcing", time: "just now", icon: "search" },
  { id: 7, type: "customs", message: "AMG GT R customs clearance started at Bremerhaven", agent: "Logistics", time: "4h ago", icon: "fact_check" },
  { id: 8, type: "sale", message: "Porsche Taycan Turbo S sold for €148,000 (margin €40K)", agent: "Finance", time: "yesterday", icon: "paid" },
];
