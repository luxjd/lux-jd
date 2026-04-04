# LuxJD — Product Requirements Document (PRD)

## AI-Powered Luxury Vehicle Arbitrage Platform
### Japan → Europe | Multi-Agent Intelligence System

**Version:** 2.0
**Date:** April 2026
**Classification:** CONFIDENTIAL
**Owner:** LuxJD Engineering

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Product Vision & Mission](#2-product-vision--mission)
3. [User Personas & Stakeholders](#3-user-personas--stakeholders)
4. [Product Architecture & System Design](#4-product-architecture--system-design)
5. [Agent 1: DE Market Research Agent](#5-agent-1-de-market-research-agent)
6. [Agent 2: JP Sourcing Agent](#6-agent-2-jp-sourcing-agent)
7. [Agent 3: Listing & Presentation Agent](#7-agent-3-listing--presentation-agent)
8. [Agent 4: Logistics Agent](#8-agent-4-logistics-agent)
9. [Agent 5: Finance & Compliance Agent](#9-agent-5-finance--compliance-agent)
10. [Agent 6: Concierge Agent](#10-agent-6-concierge-agent)
11. [Orchestrator & Decision Engine](#11-orchestrator--decision-engine)
12. [Data Model & Entity Relationships](#12-data-model--entity-relationships)
13. [Inter-Agent Communication Contracts](#13-inter-agent-communication-contracts)
14. [KPI Framework & Success Metrics](#14-kpi-framework--success-metrics)
15. [Implementation Roadmap](#15-implementation-roadmap)
16. [Risk Register](#16-risk-register)
17. [Appendix: Glossary & References](#17-appendix-glossary--references)

---

## 1. Executive Summary

LuxJD is a multi-agent AI platform that automates the discovery, acquisition, import, listing, and sale of luxury vehicles sourced from Japanese auctions and resold in the German and European markets.

**The core arbitrage thesis:** Japanese luxury cars (Ferrari, Porsche, Mercedes-AMG, Lamborghini, etc.) depreciate 30-40% in 3 years due to the Shaken inspection system, cultural new-vehicle bias, and limited domestic resale demand. The same vehicles command 25-60% higher prices in Europe. After all import costs (shipping, customs duty, TUV inspection), gross margins of **€20,000-€60,000 per vehicle** are consistently achievable.

**Why AI:** Manual competitors take 2-3 days to evaluate a single opportunity. LuxJD's agent network evaluates hundreds of auction listings daily, calculates precise landed costs in real-time, predicts margin with confidence intervals, and executes listing/customer workflows autonomously. This creates a **speed advantage** (faster decisions), **accuracy advantage** (fewer margin-destroying surprises), and **scale advantage** (10x volume without proportional headcount).

**Target outcome at Month 24:** 12-20 vehicles/month, €25-60K avg margin, €960K-5M monthly revenue, 80-90% AI automation, 4-6 FTEs.

---

## 2. Product Vision & Mission

### Vision
To become Europe's most intelligent and profitable luxury vehicle import operation, where AI agents handle 90% of the decision-making and execution while humans focus on relationship-building and strategic oversight.

### Mission
Build a network of specialized AI agents that collectively execute the full luxury vehicle arbitrage pipeline — from opportunity discovery in Japan to customer handoff in Europe — with higher accuracy, faster throughput, and lower risk than any human-only competitor.

### Core Principles

| Principle | Description | Enforcement |
|---|---|---|
| **Correctness over Speed** | A wrong decision on a €100K+ vehicle is catastrophic. Every agent must prioritize accuracy. | All financial decisions require confidence scores. Below 70% = mandatory human review. |
| **Human-in-the-Loop** | AI decides, humans approve at every financial commitment point. | No purchase >€80K, no price deviation >10%, no complaint response without human sign-off. |
| **Full Auditability** | Every agent decision must be logged with complete reasoning chain. | Structured audit logs with input data, model used, reasoning, output, confidence, timestamp. |
| **Graceful Degradation** | If one agent fails, others continue. No single point of failure. | Health checks every 60s. Circuit breakers. Fallback to manual queue on agent failure. |
| **Financial Precision** | Every cent tracked. No cost goes unrecorded. | Finance Agent reconciles all transactions. Discrepancy alerts at €50 threshold. |

---

## 3. User Personas & Stakeholders

### Primary Users

**Operator (Internal)**
- The 1-4 humans running the business
- Reviews AI recommendations, approves purchases, handles escalations
- Needs: Dashboard with pipeline overview, pending approvals queue, P&L visibility
- Pain: Information overload, slow manual processes, missed opportunities

**Buyer (External)**
- High-net-worth individual or dealer purchasing vehicles
- Expects premium service, rapid response, deep vehicle knowledge
- Needs: Professional listings, fast answers, transparent history
- Pain: Slow dealer responses, incomplete vehicle info, trust issues with imports

### Secondary Users

**Auction Broker (Japan)**
- Executes bids on behalf of LuxJD at Japanese auctions
- Needs: Clear bid limits, vehicle specifications, timing instructions
- Interaction: Receives instructions from JP Sourcing Agent

**Customs Agent (Germany)**
- Processes import documentation at Bremerhaven/Hamburg
- Needs: Pre-prepared documentation, accurate CIF values
- Interaction: Receives document packages from Logistics Agent

**TUV Inspector**
- Performs vehicle technical inspection
- Needs: Vehicle CoC, modification list, appointment scheduling
- Interaction: Logistics Agent pre-assesses and schedules

---

## 4. Product Architecture & System Design

### 4.1 Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        ORCHESTRATOR                              │
│              Portfolio Strategy · Decision Engine                 │
│           Human-in-the-Loop Approval Gateway                     │
└──────┬──────┬──────┬──────┬──────┬──────┬───────────────────────┘
       │      │      │      │      │      │
  ┌────┴─┐ ┌──┴──┐ ┌─┴──┐ ┌─┴──┐ ┌─┴──┐ ┌─┴──┐
  │DE    │ │JP   │ │LIST│ │LOGI│ │FINA│ │CONC│
  │MARKET│ │SOURC│ │ING │ │STIC│ │NCE │ │IERG│
  │AGENT │ │AGENT│ │AGNT│ │S   │ │AGNT│ │E   │
  └──┬───┘ └──┬──┘ └─┬──┘ └─┬──┘ └─┬──┘ └─┬──┘
     │        │      │      │      │      │
  ┌──┴────────┴──────┴──────┴──────┴──────┴──┐
  │           SHARED DATA LAYER               │
  │  PostgreSQL · Redis · S3 · Event Bus      │
  └───────────────────────────────────────────┘
```

### 4.2 Technology Stack

| Layer | Technology | Rationale |
|---|---|---|
| **LLM Backbone** | Claude API (Opus for high-stakes, Sonnet for operations, Haiku for classification) | Best reasoning for complex financial decisions; tiered cost optimization |
| **Agent Framework** | Python + LangGraph with custom state management | Stateful multi-step workflows with human-in-the-loop checkpoints |
| **Primary Database** | PostgreSQL 16 | Relational integrity for financial data; JSONB for flexible schemas |
| **Cache Layer** | Redis Streams | Real-time inter-agent messaging + fast pricing cache |
| **Object Storage** | S3 (or MinIO) | Vehicle photos, auction sheets, documents |
| **Scraping Engine** | Playwright (JS-rendered) + Scrapy (static) | Full browser automation for authenticated auction platforms |
| **OCR / Vision** | Claude Vision API + Tesseract (fallback) | Auction sheet parsing, condition photo analysis |
| **API Integrations** | mobile.de Dealer API, AutoScout24 Dealer API, exchange rate APIs | Multi-platform listing management |
| **Communication Bus** | Redis Streams (pub/sub) | Reliable async agent messaging with consumer groups |
| **Monitoring** | Grafana + Prometheus + custom alerts | Agent health, margin tracking, currency alerts |
| **Infrastructure** | Docker Compose → Kubernetes | Reproducible deployment; horizontal scaling |
| **Frontend** | Next.js 16 + Tailwind CSS v4 | Landing page, operator dashboard |

### 4.3 Inter-Agent Communication Model

Agents communicate through **structured JSON contracts** via Redis Streams. Every message includes:

```json
{
  "message_id": "uuid",
  "source_agent": "de_market",
  "target_agent": "orchestrator",
  "message_type": "PRICE_REPORT",
  "payload": { ... },
  "confidence": 0.87,
  "timestamp": "2026-04-04T10:30:00Z",
  "reasoning_chain": "...",
  "ttl_seconds": 3600
}
```

**Rules:**
- Every agent MUST include a `confidence` score (0.0-1.0) with every output
- Every agent MUST include a `reasoning_chain` explaining how it reached its conclusion
- Messages expire after `ttl_seconds` — stale data is never consumed
- If an agent cannot produce output with confidence >0.5, it MUST return `STATUS: UNCERTAIN` and trigger human review

---

## 5. Agent 1: DE Market Research Agent

### 5.1 Identity & Mandate

| Field | Value |
|---|---|
| **Name** | DE Market Research Agent |
| **Codename** | `de_market` |
| **Domain** | German & European luxury car market intelligence |
| **Core Question** | "What should we buy, and what is it worth in Germany?" |
| **Criticality** | HIGHEST — all purchasing decisions depend on this agent's accuracy |
| **LLM Tier** | Claude Sonnet (primary), Claude Opus (quarterly trend analysis) |

### 5.2 Responsibilities (STRICT)

This agent is SOLELY responsible for:
1. Maintaining real-time price maps for every target vehicle make/model/year/spec combination
2. Quantifying the value impact of specific configurations (color, options, service history)
3. Measuring demand velocity (how fast vehicles sell, inquiry frequency, price resilience)
4. Detecting emerging trends (appreciating models, seasonal patterns, new model release impacts)
5. Monitoring competitor pricing, inventory, and turnover rates

This agent MUST NOT:
- Make purchasing decisions (that's the Orchestrator)
- Communicate with buyers (that's the Concierge Agent)
- Calculate import costs (that's the JP Sourcing Agent)
- Set listing prices (that's the Listing Agent, using this agent's data as input)

### 5.3 Data Sources

| Source | Type | Frequency | Method |
|---|---|---|---|
| mobile.de | Primary marketplace | Every 4 hours | Dealer API (structured queries) |
| AutoScout24 | Secondary marketplace | Every 6 hours | Dealer API |
| elferspot.com | Porsche specialist | Daily | Scraper (Playwright) |
| ClassicDriver | Exotics & collectors | Daily | Scraper (Playwright) |
| RM Sotheby's / Bonhams | Auction results | Weekly | Scraper + manual feed |
| Hagerty / Classic Analytics | Valuation indices | Weekly | API or scraper |
| Major dealer websites | Pricing intelligence | Daily | Scrapers (Saker, Luft Auto, Hollmann) |

### 5.4 Core Functions

#### 5.4.1 Real-Time Price Mapping

For each target model/year/mileage/spec combination, maintain:

```json
{
  "vehicle_key": "ferrari_488_gtb_2017",
  "spec_filter": {
    "year_range": [2016, 2019],
    "mileage_max_km": 50000,
    "drive_side": "LHD"
  },
  "pricing": {
    "median_eur": 168000,
    "mean_eur": 172500,
    "p25_eur": 155000,
    "p75_eur": 185000,
    "sample_size": 47,
    "data_freshness_hours": 4
  },
  "trend": {
    "direction": "STABLE",
    "30d_change_pct": -1.2,
    "90d_change_pct": 2.8,
    "180d_change_pct": 5.1
  },
  "demand": {
    "velocity_score": 78,
    "avg_days_on_market": 24,
    "inquiry_rate": "HIGH",
    "price_resilience": "STRONG"
  },
  "confidence": 0.91,
  "last_updated": "2026-04-04T10:00:00Z"
}
```

#### 5.4.2 Specification Value Analysis

Model the price impact of specific configurations:

| Factor | Example | Impact |
|---|---|---|
| Exterior color | Ferrari Rosso Corsa vs Nero | +€5,000 to +€12,000 |
| Interior spec | Daytona seats vs standard | +€3,000 to +€8,000 |
| Options packages | Porsche PCCB + Sport Chrono | +€8,000 to +€15,000 |
| Service history | Full dealer stamps vs gaps | +€5,000 to +€20,000 |
| Low mileage | <10K km vs 30-50K km | +€10,000 to +€30,000 |

Each modifier is expressed as a percentage premium/discount with confidence interval.

#### 5.4.3 Demand Velocity Scoring (0-100)

| Score | Meaning | Avg Days to Sale |
|---|---|---|
| 90-100 | Extreme demand, sells within days | <14 |
| 70-89 | High demand, reliable turnover | 14-28 |
| 50-69 | Moderate demand, acceptable | 28-45 |
| 30-49 | Low demand, risky hold | 45-60 |
| 0-29 | Very low, avoid unless exceptional margin | >60 |

#### 5.4.4 Competitive Intelligence

Track competitors with structured profiles:

```json
{
  "competitor": "Hollmann International",
  "current_inventory_count": 23,
  "avg_listing_price_eur": 195000,
  "avg_days_on_market": 31,
  "price_strategy": "PREMIUM_POSITIONING",
  "turnover_rate": "MODERATE",
  "threat_level": "MEDIUM"
}
```

### 5.5 Output Contract: Target Vehicle Report

This is the PRIMARY output consumed by JP Sourcing Agent and Orchestrator.

```json
{
  "report_type": "TARGET_VEHICLE_REPORT",
  "vehicle_spec": {
    "make": "Ferrari",
    "model": "488 GTB",
    "year_range": [2016, 2019],
    "critical_specs": ["LHD", "sub-30k-km", "EU-spec"],
    "preferred_colors": ["Rosso Corsa", "Grigio Silverstone", "Bianco Avus"],
    "avoid_colors": ["custom wraps", "aftermarket modifications"]
  },
  "market_value": {
    "median_eur": 168000,
    "p25_eur": 155000,
    "p75_eur": 185000,
    "spec_premium_modifiers": {
      "rosso_corsa": 1.05,
      "daytona_seats": 1.03,
      "full_dealer_history": 1.08,
      "sub_15k_km": 1.12
    }
  },
  "demand": {
    "velocity_score": 78,
    "trend_direction": "STABLE",
    "seasonal_factor": "NEUTRAL"
  },
  "recommended_max_landed_cost_eur": 135000,
  "minimum_acceptable_margin_eur": 20000,
  "confidence": 0.91,
  "data_sources_used": 4,
  "sample_size": 47,
  "generated_at": "2026-04-04T10:00:00Z",
  "valid_until": "2026-04-04T22:00:00Z",
  "reasoning_chain": "Based on 47 active listings across mobile.de (31), AutoScout24 (12), and specialist platforms (4). Median price stable over 30 days (-1.2%). High velocity score driven by 3 sales in last 7 days on mobile.de. Recommended max landed cost = median - minimum margin - 5% safety buffer."
}
```

### 5.6 Failure Modes & Safeguards

| Failure | Detection | Response |
|---|---|---|
| Scraper blocked by platform | HTTP 403/429 detection | Rotate proxy, alert operator, use cached data (mark as stale) |
| Insufficient data (<10 listings) | Sample size check | Lower confidence score proportionally, flag as LOW_DATA |
| Price anomaly (>20% shift in <24h) | Statistical outlier detection | HOLD report, alert operator, re-scrape from all sources |
| Stale data (>12h without refresh) | TTL monitoring | Mark all reports as STALE, trigger emergency re-scrape |

### 5.7 Performance Requirements

| Metric | Target | Hard Limit |
|---|---|---|
| Price prediction accuracy | Within 8% of actual sale price | 15% max deviation |
| Report generation time | <30 seconds | <120 seconds |
| Data freshness | <6 hours | <12 hours |
| Uptime | 99.5% | 99.0% |

---

## 6. Agent 2: JP Sourcing Agent

### 6.1 Identity & Mandate

| Field | Value |
|---|---|
| **Name** | JP Sourcing Agent |
| **Codename** | `jp_sourcing` |
| **Domain** | Japanese auction/dealer inventory scanning & evaluation |
| **Core Question** | "Is this vehicle profitable after all costs, and is it safe to buy?" |
| **Criticality** | HIGHEST — this is where the core arbitrage decision is made |
| **LLM Tier** | Claude Sonnet (scanning), Claude Opus (final margin evaluation), Claude Vision (photo analysis) |

### 6.2 Responsibilities (STRICT)

This agent is SOLELY responsible for:
1. Scanning Japanese auction platforms and dealer inventories for target vehicles
2. Performing deep condition assessment (auction sheet OCR + photo analysis)
3. Verifying provenance (matching numbers, service history, ownership chain)
4. Calculating total landed cost from auction hammer to DE-ready vehicle
5. Producing margin-ranked opportunity lists with risk assessment

This agent MUST NOT:
- Set German selling prices (that's DE Market Agent + Listing Agent)
- Approve purchases (that's the Orchestrator)
- Arrange shipping (that's the Logistics Agent)
- Handle buyer inquiries (that's the Concierge Agent)

### 6.3 Data Sources

| Source | Type | Coverage | Method |
|---|---|---|---|
| USS (Used Car System Solutions) | Largest auction network (~30% share) | USS Tokyo, Nagoya, Kobe | Broker API + scraper |
| BH Auction | High-end exotic specialist | Ferrari, Lamborghini, Porsche | Broker API |
| TAA (Toyota Auto Auction) | Multi-brand | Major locations | Broker API |
| Arai Auction | Sports car specialist | Nationwide | Broker API |
| Goo-net.com | Dealer aggregator | Fixed-price inventory | Scraper (Playwright) |
| carsensor.net | Dealer aggregator | Fixed-price inventory | Scraper |

### 6.4 Core Functions

#### 6.4.1 Vehicle Discovery & Filtering

**Mandatory Filters (STRICT — no exceptions):**
- LHD priority (RHD only if margin >€40K AND demand velocity >70)
- Auction grade >= 4.0 (luxury threshold — non-negotiable)
- Mileage <= 50,000 km
- No salvage/rebuilt titles
- No flood/fire damage history
- Must match an active Target Vehicle Report from DE Market Agent

**Scan frequency:** Every auction day (3-5 times per week depending on auction house).

#### 6.4.2 Condition Deep-Dive

For every shortlisted vehicle, perform a 4-layer condition assessment:

**Layer 1: Auction Sheet OCR**
```
Input:  Scanned Japanese auction inspection sheet (image)
Process: Tesseract OCR → Claude Vision for Japanese text interpretation
Output: Structured condition report
```

**Layer 2: Photo Analysis (Claude Vision)**
```
Input:  All auction photos (typically 20-40 per vehicle)
Analyze:
  - Paint condition (original, respray indicators, swirl marks)
  - Interior wear (seat bolster condition, dashboard, headliner)
  - Wheel condition (curb rash, brake dust staining, tire age)
  - Modification detection (aftermarket parts, non-OEM components)
  - Underbody/engine bay condition
Output: Condition grade (EXCELLENT / GOOD / FAIR / POOR) per area
```

**Layer 3: VIN Cross-Reference**
```
Input:  17-character VIN
Process: Query manufacturer databases where accessible
Output: Build sheet, original spec, recall history, known issues
```

**Layer 4: Provenance Verification (for vehicles >€100K)**
```
Check:
  - Matching numbers (engine/chassis)
  - Original color vs build sheet
  - Service history completeness
  - Dealer stamp authenticity
  - Limited edition numbering
Output: PROVENANCE_VERIFIED / PROVENANCE_PARTIAL / PROVENANCE_CONCERN
```

#### 6.4.3 Landed Cost Calculator

**EVERY line item must be calculated. No estimates. No "approximately."**

```json
{
  "vehicle_id": "uuid",
  "source": "USS Tokyo",
  "auction_lot": "T-2024-8847",

  "costs": {
    "purchase_price_jpy": 16500000,
    "fx_rate_jpy_eur": 167.00,
    "fx_buffer_pct": 3.0,
    "purchase_price_eur": 98802,

    "auction_fees_pct": 4.0,
    "auction_fees_eur": 3952,

    "jp_inland_transport_eur": 400,
    "jp_export_docs_eur": 150,

    "container_freight_eur": 2800,
    "marine_insurance_pct": 2.0,
    "marine_insurance_eur": 1976,

    "cif_value_eur": 108080,

    "customs_duty_pct": 10.0,
    "customs_duty_eur": 10808,

    "import_vat_pct": 19.0,
    "import_vat_eur": 22589,
    "import_vat_reclaimable": true,

    "port_handling_eur": 600,
    "tuv_estimate_eur": 400,
    "de_transport_eur": 500,
    "presale_detail_eur": 1200,
    "photography_eur": 500,

    "total_landed_cost_excl_vat_eur": 121888,
    "total_landed_cost_incl_vat_eur": 144477
  },

  "margin_analysis": {
    "de_market_value_median": 168000,
    "de_market_value_p25": 155000,
    "de_market_value_p75": 185000,

    "margin_vs_median": 46112,
    "margin_vs_p25": 33112,
    "margin_vs_p75": 63112,

    "margin_pct_vs_median": 27.4,
    "margin_confidence": 0.87,
    "margin_confidence_interval": [28000, 58000]
  },

  "fx_sensitivity": {
    "current_rate": 167.00,
    "breakeven_rate": 142.50,
    "margin_at_160": 39500,
    "margin_at_150": 28200,
    "margin_at_140": 16900
  }
}
```

#### 6.4.4 Risk Assessment Matrix

Every candidate vehicle receives a composite risk score:

| Dimension | Low Risk (1) | Medium Risk (2) | High Risk (3) | Weight |
|---|---|---|---|---|
| **Condition** | Grade 4.5+, no flags | Grade 4.0-4.5, minor flags | Grade <4.0 or major flags | 25% |
| **Provenance** | Full history, matching numbers | Partial history | Gaps or inconsistencies | 20% |
| **TUV Forecast** | EU-spec, LHD, no mods | Minor mods, clear path | Significant mods, uncertain | 20% |
| **Market Liquidity** | Velocity >70, <21 day avg | Velocity 50-70, 21-45 days | Velocity <50, >45 days | 20% |
| **Currency Exposure** | Rate within 2% of 90-day avg | 2-5% deviation | >5% deviation | 15% |

**Composite Score:**
- 1.0-1.5: LOW RISK → Auto-approve eligible
- 1.5-2.0: MEDIUM RISK → Standard review
- 2.0-2.5: HIGH RISK → Mandatory human review with detailed brief
- 2.5-3.0: CRITICAL RISK → Auto-reject unless Orchestrator override

### 6.5 Output Contract: Opportunity Report

```json
{
  "report_type": "OPPORTUNITY_REPORT",
  "vehicle_id": "uuid",
  "auction_source": "USS Tokyo",
  "auction_date": "2026-04-06",
  "auction_lot": "T-2024-8847",

  "vehicle": {
    "make": "Ferrari",
    "model": "488 GTB",
    "year": 2017,
    "drive_side": "LHD",
    "mileage_km": 18000,
    "auction_grade": 4.5,
    "exterior_color": "Rosso Corsa",
    "interior_color": "Nero Leather",
    "specification": { "daytona_seats": true, "carbon_fibre_pkg": true }
  },

  "condition_assessment": {
    "overall": "EXCELLENT",
    "paint": "EXCELLENT",
    "interior": "EXCELLENT",
    "mechanical": "GOOD",
    "wheels": "GOOD",
    "modifications": "NONE",
    "provenance": "PROVENANCE_VERIFIED"
  },

  "financials": {
    "total_landed_cost_eur": 121888,
    "de_market_value_median": 168000,
    "expected_margin_eur": 46112,
    "expected_margin_pct": 27.4,
    "margin_confidence": 0.87
  },

  "risk": {
    "composite_score": 1.3,
    "level": "LOW",
    "flags": [],
    "fx_breakeven_rate": 142.50
  },

  "recommendation": "STRONG_BUY",
  "recommended_max_bid_jpy": 17000000,

  "reasoning_chain": "Vehicle matches Ferrari 488 GTB target report (conf 0.91). Grade 4.5 LHD Rosso Corsa with Daytona seats = spec premium of +8%. Full dealer history verified. Landed cost €121,888 vs market median €168,000 = €46,112 margin (27.4%) at current FX. Breakeven FX at ¥142.50 provides 14.7% buffer. Risk composite 1.3 (LOW). All dimensions within acceptable range. Recommend STRONG_BUY with max bid ¥17,000,000.",

  "generated_at": "2026-04-04T14:30:00Z",
  "valid_until": "2026-04-06T09:00:00Z"
}
```

### 6.6 Failure Modes & Safeguards

| Failure | Detection | Response |
|---|---|---|
| Auction data feed down | Connection timeout / empty response | Switch to backup broker, alert operator |
| OCR misread on auction sheet | Confidence <0.7 on parsed fields | Flag for manual review, never auto-approve |
| FX rate API down | Stale rate >1 hour | Use last known rate with +5% buffer, alert |
| Photo analysis inconclusive | Claude Vision confidence <0.6 | Request additional photos from broker |
| Grade/condition mismatch | Parsed grade disagrees with photo analysis | ALWAYS trust the worse assessment |

### 6.7 Performance Requirements

| Metric | Target | Hard Limit |
|---|---|---|
| Condition assessment accuracy | >85% match with actual post-arrival condition | >75% |
| Cost prediction accuracy | Within 5% of actual landed cost | Within 10% |
| Opportunity report generation | <60 seconds per vehicle | <180 seconds |
| Daily scan coverage | >90% of target auction listings | >80% |

---

## 7. Agent 3: Listing & Presentation Agent

### 7.1 Identity & Mandate

| Field | Value |
|---|---|
| **Name** | Listing & Presentation Agent |
| **Codename** | `listing` |
| **Domain** | Vehicle presentation, listing creation, pricing, multi-platform publishing |
| **Core Question** | "How do we present this vehicle to maximize sale price and speed?" |
| **Criticality** | HIGH — presentation quality directly impacts sale price (+5-10% on premium listings) |
| **LLM Tier** | Claude Sonnet (description generation), Claude Haiku (platform formatting) |

### 7.2 Responsibilities (STRICT)

This agent is SOLELY responsible for:
1. Curating and optimizing professional photography (sequencing, cropping, watermarking)
2. Generating compelling, platform-specific listing descriptions in multiple languages
3. Setting and dynamically adjusting listing prices based on DE Market Agent data
4. Publishing and managing listings across all sales platforms simultaneously
5. Implementing graduated price reduction schedules

This agent MUST NOT:
- Respond to customer inquiries (that's the Concierge Agent)
- Determine vehicle market value (that's the DE Market Agent — this agent uses it as input)
- Make purchase decisions (that's the Orchestrator)
- Handle payment or invoicing (that's the Finance Agent)

### 7.3 Listing Creation Pipeline

```
STEP 1: Photo Curation
  Input:  Professional photography set (30-50 images)
  Process:
    - Auto-select optimal sequence: hero shot → front 3/4 → rear 3/4 →
      profile → interior overview → dashboard → engine bay → wheel detail →
      unique spec features
    - Apply consistent color grading and LuxJD watermark
    - Generate platform-specific crops (mobile.de ratio, Instagram square, website banner)
  Output: Ordered image set per platform

STEP 2: Specification Documentation
  Input:  Vehicle CoC, build sheet, option codes
  Process:
    - Generate comprehensive spec sheet from option codes
    - Translate Japanese documentation → German + English
    - List every factory option with original code and market value
  Output: Structured specification document

STEP 3: Description Generation
  Input:  Vehicle data, spec sheet, condition report, market context
  Process:
    - mobile.de: Structured, factual, SEO-optimized, legally compliant (German)
    - AutoScout24: Cross-border optimized (German + English)
    - ClassicDriver/elferspot: Narrative, provenance-focused, aspirational
    - Instagram: Visual-led, aspirational, strategic hashtags
  Output: Platform-specific descriptions

STEP 4: Pricing
  Input:  DE Market Agent valuation for exact spec
  Process:
    - Base price = DE Market Agent median for spec
    - Adjust for condition (+/- based on assessment)
    - Adjust for season (convertibles spring premium, GT autumn)
    - Adjust for competitive landscape
  Output: Initial listing price + reduction schedule

STEP 5: Publishing
  Process: Simultaneously publish on all target platforms via APIs
  Output: Live listings with tracking IDs
```

### 7.4 Dynamic Pricing Schedule (STRICT)

| Day | Action | Logic |
|---|---|---|
| 1-14 | Hold initial price | No change — test market response |
| 15 | Reduce 3-5% | If zero qualified inquiries in 14 days |
| 28 | Reduce additional 3-5% | If still no serious offers |
| 42 | Orchestrator review | Strategic decision: hold, reduce further, or wholesale |
| 56 | Wholesale trigger | If no sale, offer to dealer network at -15% |

### 7.5 Platform-Specific Requirements

| Platform | Language | Tone | Key Requirements |
|---|---|---|---|
| mobile.de | German | Factual, structured | All data fields populated, legal disclosures, §38 GewO info |
| AutoScout24 | German + English | Cross-border | Bilingual descriptions, shipping calculator integration |
| elferspot.com | German + English | Enthusiast | Porsche option codes detailed, build history narrative |
| ClassicDriver | English | Premium narrative | Provenance story, specification analysis, collector context |
| Instagram | English | Aspirational | Short captions, strategic hashtags, Stories + Reels formats |

### 7.6 Performance Requirements

| Metric | Target | Hard Limit |
|---|---|---|
| Time from vehicle-ready to live listing | <4 hours | <12 hours |
| Time to first qualified inquiry | <72 hours | <168 hours |
| Description quality score (human eval) | >4.5/5.0 | >3.5/5.0 |
| Multi-platform sync accuracy | 100% price/spec consistency | 100% (non-negotiable) |

---

## 8. Agent 4: Logistics Agent

### 8.1 Identity & Mandate

| Field | Value |
|---|---|
| **Name** | Logistics Agent |
| **Codename** | `logistics` |
| **Domain** | Physical vehicle movement: shipping, customs, TUV, transport |
| **Core Question** | "Where is every vehicle right now, and what's the next action?" |
| **Criticality** | HIGH — logistics errors on €100K+ vehicles are extremely expensive |
| **LLM Tier** | Claude Haiku (status updates), Claude Sonnet (customs document preparation) |

### 8.2 Responsibilities (STRICT)

This agent is SOLELY responsible for:
1. Coordinating container freight from Japan to Germany
2. Preparing and managing all customs documentation
3. Scheduling and managing TUV Einzelabnahme inspections
4. Arranging enclosed vehicle transport within Germany
5. Maintaining real-time pipeline dashboard with 10-stage tracking

This agent MUST NOT:
- Decide which vehicles to purchase (that's the Orchestrator)
- Calculate costs for sourcing decisions (that's the JP Sourcing Agent)
- Generate financial reports (that's the Finance Agent)
- Communicate with buyers about delivery (that's the Concierge Agent)

### 8.3 Pipeline Stages (STRICT — 10 stages, no skipping)

```
STAGE 1:  SOURCED          Vehicle identified by JP Sourcing Agent
STAGE 2:  BID_PLACED       Bid submitted at auction
STAGE 3:  PURCHASED        Auction won, payment confirmed
STAGE 4:  JP_TRANSPORT     Japan inland transport to port (enclosed)
STAGE 5:  AT_PORT_JP       At Yokohama/Kobe port, awaiting vessel
STAGE 6:  IN_TRANSIT       On vessel, ocean transit
STAGE 7:  AT_PORT_DE       Arrived Bremerhaven/Hamburg
STAGE 8:  CUSTOMS          Customs clearance in progress
STAGE 9:  WORKSHOP         TUV prep + pre-sale detailing
STAGE 10: READY_FOR_SALE   Vehicle listed and available
```

**Every stage transition MUST be:**
- Timestamped
- Logged with responsible party
- Accompanied by photo documentation (stages 3, 4, 5, 7, 9, 10)
- Validated (cannot skip stages; cannot reverse without Orchestrator approval)

### 8.4 Shipping Requirements (NON-NEGOTIABLE)

| Rule | Details |
|---|---|
| **Dedicated container** | Vehicles >€100K MUST have dedicated 20ft container (not shared) |
| **Marine insurance** | ALL vehicles: all-risk cover, minimum 110% of CIF value |
| **Pre-ship inspection** | Photo documentation of all 4 sides + interior + odometer BEFORE loading |
| **Post-arrival inspection** | Same photo documentation within 2 hours of container opening |
| **Damage protocol** | Any discrepancy between pre/post photos → immediate insurance claim + operator alert |

### 8.5 TUV Management

**The Logistics Agent maintains a database of TUV stations with:**
- Specialist experience level (luxury/exotic vehicles)
- Average wait times
- Pass rates by vehicle type
- Inspector contact details

**Pre-assessment checklist (generated BEFORE appointment):**
```json
{
  "vehicle_id": "uuid",
  "tuv_station": "TUV Rheinland Bremen",
  "appointment_date": "2026-05-15",
  "vehicle_type_approval": "EU_WVTA",
  "coc_available": true,
  "expected_modifications": [],
  "estimated_cost_eur": 400,
  "estimated_duration_hours": 2,
  "risk_level": "LOW",
  "notes": "EU-spec Ferrari with valid CoC. Standard inspection expected."
}
```

### 8.6 Performance Requirements

| Metric | Target | Hard Limit |
|---|---|---|
| ETA accuracy | Within 3 days of predicted arrival | Within 7 days |
| Port dwell time | <3 business days | <7 business days |
| TUV pass rate (first attempt) | >90% | >80% |
| Stage transition logging | Real-time (<5 min after event) | <30 min |

---

## 9. Agent 5: Finance & Compliance Agent

### 9.1 Identity & Mandate

| Field | Value |
|---|---|
| **Name** | Finance & Compliance Agent |
| **Codename** | `finance` |
| **Domain** | Financial tracking, currency management, tax optimization, regulatory compliance |
| **Core Question** | "Are we making money, and are we compliant?" |
| **Criticality** | CRITICAL — financial precision is non-negotiable in a capital-intensive business |
| **LLM Tier** | Claude Sonnet (tax analysis), Claude Haiku (transaction logging) |

### 9.2 Responsibilities (STRICT)

This agent is SOLELY responsible for:
1. Per-vehicle P&L tracking from purchase to sale (EVERY cost recorded)
2. Portfolio-level financial dashboard (capital deployed, margins, cash flow)
3. JPY/EUR currency monitoring, hedging recommendations, rate alerts
4. Tax optimization (Differenzbesteuerung vs Regelbesteuerung modeling per vehicle)
5. Monthly VAT declaration data (Umsatzsteuer-Voranmeldung)
6. Regulatory change monitoring (import rules, duty rates, emissions)

This agent MUST NOT:
- Make purchasing decisions (that's the Orchestrator)
- Negotiate with buyers on price (that's the Concierge Agent)
- Set listing prices (that's the Listing Agent)
- Communicate financial details to external parties (that's the Concierge Agent or human operator)

### 9.3 Per-Vehicle P&L (STRICT — every cent tracked)

```json
{
  "vehicle_id": "uuid",
  "pnl_status": "IN_PIPELINE",

  "revenue": {
    "listing_price_eur": 175000,
    "actual_sale_price_eur": null,
    "sale_date": null
  },

  "costs": {
    "purchase_price_eur": 98802,
    "auction_fees_eur": 3952,
    "jp_transport_eur": 400,
    "export_docs_eur": 150,
    "freight_eur": 2800,
    "marine_insurance_eur": 1976,
    "customs_duty_eur": 10808,
    "import_vat_eur": 22589,
    "port_handling_eur": 600,
    "tuv_eur": 400,
    "de_transport_eur": 500,
    "detailing_eur": 1200,
    "photography_eur": 500,
    "listing_fees_eur": 350,
    "storage_eur": 0,
    "miscellaneous_eur": 0,

    "total_costs_excl_vat": 122438,
    "total_costs_incl_vat": 145027,
    "vat_reclaimable": 22589
  },

  "margin": {
    "estimated_gross_margin_eur": 52562,
    "estimated_margin_pct": 30.0,
    "actual_gross_margin_eur": null,
    "cost_tracking_completeness_pct": 100.0
  },

  "fx": {
    "purchase_rate_jpy_eur": 167.00,
    "current_rate_jpy_eur": 165.50,
    "fx_impact_eur": -780,
    "hedged": false
  }
}
```

**STRICT RULE: `cost_tracking_completeness_pct` must be 100% before a vehicle can transition to READY_FOR_SALE. If any cost is missing, the Logistics Agent CANNOT advance the pipeline stage.**

### 9.4 Currency Management (STRICT)

| Trigger | Action |
|---|---|
| JPY/EUR moves >2% from 90-day average | ALERT: "Currency deviation detected" to Orchestrator |
| JPY/EUR moves >5% from 90-day average | CRITICAL ALERT + automatic margin recalculation on all pipeline vehicles |
| New vehicle purchase planned | Calculate margin at current rate, +3% buffer, and +5% buffer |
| JPY/EUR enters favorable zone (<¥160/€) | OPPORTUNITY ALERT: "Favorable FX window — consider accelerating purchases" |

### 9.5 Tax Optimization

For every vehicle, the agent MUST model BOTH tax treatments and recommend the optimal one:

**Regelbesteuerung (Standard):**
- Import VAT (19%) is RECLAIMABLE
- Sale VAT (19%) charged on full sale price
- Best when: import VAT is high and margin is modest

**Differenzbesteuerung (Margin Scheme):**
- Import VAT is NOT reclaimable
- VAT charged only on profit margin (sale price - purchase price)
- Best when: margin is low relative to vehicle value

```json
{
  "vehicle_id": "uuid",
  "regelbesteuerung": {
    "vat_paid_on_import": 22589,
    "vat_reclaimed": 22589,
    "vat_on_sale": 33250,
    "net_vat_liability": 33250,
    "effective_margin_eur": 52562
  },
  "differenzbesteuerung": {
    "vat_paid_on_import": 22589,
    "vat_reclaimed": 0,
    "vat_on_margin": 8397,
    "net_vat_liability": 8397,
    "effective_margin_eur": 29973
  },
  "recommendation": "REGELBESTEUERUNG",
  "reason": "Standard taxation yields €22,589 higher net margin due to VAT reclaim on import.",
  "confidence": 0.95
}
```

### 9.6 Performance Requirements

| Metric | Target | Hard Limit |
|---|---|---|
| Cost tracking completeness | >98% of all costs captured before sale | 100% before READY_FOR_SALE |
| FX alert latency | <5 minutes after rate threshold breach | <15 minutes |
| Monthly VAT data accuracy | 100% | 100% (legal requirement) |
| Cash flow forecast accuracy (4-week) | Within 10% | Within 20% |

---

## 10. Agent 6: Concierge Agent

### 10.1 Identity & Mandate

| Field | Value |
|---|---|
| **Name** | Concierge Agent |
| **Codename** | `concierge` |
| **Domain** | High-touch customer interaction, lead management |
| **Core Question** | "Is this buyer serious, and how do we close the sale?" |
| **Criticality** | HIGH — luxury buyers expect exceptional service; one bad interaction loses the sale |
| **LLM Tier** | Claude Sonnet (customer responses), Claude Haiku (lead scoring) |

### 10.2 Responsibilities (STRICT)

This agent is SOLELY responsible for:
1. Responding to all inbound customer inquiries within 10 minutes
2. Classifying and scoring leads by buyer type and intent
3. Providing detailed, enthusiast-level vehicle information
4. Handling price negotiations within pre-set parameters
5. Multi-language communication (DE, EN, FR, IT, NL)

This agent MUST NOT:
- Accept offers below 90% of asking price without human approval
- Share internal cost data, margin information, or sourcing details
- Handle complaints or disputes (immediate human escalation)
- Modify listings or prices (that's the Listing Agent)
- Process payments (that's Finance Agent + human)

### 10.3 Response Requirements (STRICT)

| Metric | Target | Hard Limit |
|---|---|---|
| Initial response time | <10 minutes | <30 minutes |
| Response quality | Personalized, addresses specific questions asked | Never generic templates |
| Vehicle knowledge depth | Enthusiast-level (option codes, engine types, performance packages) | Basic spec at minimum |
| Languages | DE (primary), EN (always available), FR/IT/NL (on request) | DE + EN mandatory |

### 10.4 Lead Classification (STRICT)

| Type | Indicators | Strategy | Priority |
|---|---|---|---|
| **End-User Collector** | Questions about provenance, history, spec details | Trust-building, detailed documentation, viewing invitation | HIGH |
| **Dealer/Trade** | Asks for "best price", bulk inquiries, industry language | Price-focused, quick turnaround, volume discount if applicable | MEDIUM |
| **Serious Buyer** | Requests viewing, asks about payment/delivery, returns within 24h | Priority response, human escalation for close | HIGHEST |
| **Information Seeker** | Generic questions, no urgency indicators | Engage but limit investment; auto-follow-up in 7 days | LOW |
| **Competitor Research** | Asks about sourcing, margins, process | Minimal information, polite but vague on operations | LOWEST |

### 10.5 Negotiation Framework (STRICT)

```
PRICING AUTHORITY:

  Asking Price to -5%    → Agent can accept immediately
  -5% to -8%             → Agent can counter at -5%
  -8% to -10%            → Agent escalates to human with recommendation
  Below -10%             → Agent politely declines, offers to notify if price drops
  Below -15%             → Agent flags as potential wholesale, routes to Orchestrator
```

### 10.6 Escalation Triggers (IMMEDIATE — no delay)

The Concierge Agent MUST immediately escalate to a human operator when:
1. Any offer below 90% of asking price
2. Part-exchange or trade-in proposed
3. Request for independent mechanical inspection
4. Any complaint or expression of dissatisfaction
5. Legal questions (warranty, Gewahrleistung, return rights)
6. Requests for vehicle history requiring manufacturer database access
7. Any communication that appears threatening or fraudulent

### 10.7 Performance Requirements

| Metric | Target | Hard Limit |
|---|---|---|
| Response time | <10 minutes | <30 minutes |
| Lead classification accuracy | >80% correct | >65% |
| Inquiry-to-viewing conversion | >15% | >8% |
| Customer satisfaction (post-sale survey) | >4.5/5.0 | >4.0/5.0 |

---

## 11. Orchestrator & Decision Engine

### 11.1 Identity & Mandate

| Field | Value |
|---|---|
| **Name** | Orchestrator |
| **Codename** | `orchestrator` |
| **Domain** | Pipeline coordination, portfolio strategy, purchase authorization |
| **Core Question** | "Should we buy this vehicle — and does it fit our portfolio?" |
| **Criticality** | SUPREME — this is the brain; all financial commitments flow through here |
| **LLM Tier** | Claude Opus (purchase decisions), Claude Sonnet (portfolio monitoring) |

### 11.2 Responsibilities (STRICT)

The Orchestrator is SOLELY responsible for:
1. Evaluating every Opportunity Report against portfolio strategy
2. Authorizing or rejecting purchase bids
3. Managing portfolio diversification (brand, price segment, risk)
4. Triggering pipeline-wide alerts (capital constraints, market shifts)
5. Enforcing human-in-the-loop checkpoints

### 11.3 Portfolio Rules (NON-NEGOTIABLE)

| Rule | Threshold | Enforcement |
|---|---|---|
| Maximum brand concentration | 30% of capital in any single brand | Auto-reject if exceeded |
| Minimum expected margin | €15,000 OR 20% (whichever is higher) | Auto-reject below threshold |
| Maximum capital deployment | 80% of available capital in pipeline | Auto-reject if exceeded |
| Price segment diversification | No more than 50% in any single segment | Flag for review |
| Maximum single vehicle value | 25% of total available capital | Mandatory human approval |

### 11.4 Purchase Decision Framework (STRICT)

When the JP Sourcing Agent presents an Opportunity Report, the Orchestrator evaluates this decision tree **in order**:

```
STEP 1: MARGIN CHECK
  Expected margin >= €15,000 AND >= 20%?
  NO  → REJECT (reason: "Below minimum margin threshold")
  YES → Continue

STEP 2: CONFIDENCE CHECK
  Margin confidence >= 0.70?
  NO  → FLAG for human review (reason: "Low confidence margin estimate")
  YES → Continue

STEP 3: RISK CHECK
  Composite risk score <= 2.0?
  NO  → FLAG for human review (reason: "Elevated risk score: [details]")
  YES → Continue

STEP 4: PORTFOLIO FIT
  Does vehicle violate any portfolio rule?
  YES → REJECT or FLAG depending on which rule (reason: "[specific rule violation]")
  NO  → Continue

STEP 5: CAPITAL CHECK
  Sufficient capital available (within 80% deployment limit)?
  NO  → REJECT (reason: "Capital deployment limit exceeded")
  YES → Continue

STEP 6: TIMING CHECK
  Is expected sale window favorable?
  (No convertibles arriving in November, no GT cars arriving in peak summer)
  NO  → FLAG for human review (reason: "Seasonal timing concern")
  YES → Continue

STEP 7: FINAL CHECK
  Vehicle value > 25% of total capital?
  YES → MANDATORY human approval regardless of all other checks
  NO  → AUTO-APPROVE

OUTCOME:
  AUTO-APPROVE → Send bid authorization to JP Sourcing Agent
  FLAG → Generate 1-page decision brief for human operator
  REJECT → Log with full reasoning, do not bid
```

### 11.5 Human-in-the-Loop Checkpoints (MANDATORY)

Human approval is REQUIRED at these stages (NO exceptions, NO auto-override):

1. Any vehicle purchase above €80,000
2. Any vehicle with risk composite >2.0
3. Any pricing deviation >10% from automated recommendation
4. Acceptance of any offer below 92% of asking price
5. Any external communication involving complaints or legal matters
6. Any process deviation from established procedures
7. Monthly portfolio strategy review
8. Any agent restart or configuration change

### 11.6 Decision Brief Format (for human review)

```
═══════════════════════════════════════════════
DECISION BRIEF — [Vehicle Make Model Year]
═══════════════════════════════════════════════

RECOMMENDATION: [BUY / REVIEW / REJECT]
CONFIDENCE: [0.XX]
REASON FOR REVIEW: [Why human input needed]

VEHICLE SUMMARY:
  Make/Model: Ferrari 488 GTB 2017
  Source: USS Tokyo, Lot T-2024-8847
  Grade: 4.5 | Mileage: 18,000 km | LHD
  Spec: Rosso Corsa / Nero, Daytona seats

FINANCIALS:
  Landed Cost:  €121,888
  Market Value: €168,000 (median, conf 0.91)
  Est. Margin:  €46,112 (27.4%)
  FX Risk:      Breakeven at ¥142.50 (14.7% buffer)

RISK ASSESSMENT:
  Condition:    LOW (Grade 4.5)
  Provenance:   LOW (Full history verified)
  TUV:          LOW (EU-spec, CoC available)
  Liquidity:    LOW (Velocity 78, avg 24 days)
  Currency:     LOW (Rate within 1.2% of 90d avg)
  Composite:    1.3 / 3.0

PORTFOLIO IMPACT:
  Ferrari concentration: 18% → 24% (within 30% limit)
  Capital deployed: 62% → 71% (within 80% limit)
  Pipeline count: 4 → 5

ACTION REQUIRED: [APPROVE BID / REJECT / REQUEST MORE INFO]
MAX BID: ¥17,000,000
DEADLINE: 2026-04-06 09:00 JST

═══════════════════════════════════════════════
```

---

## 12. Data Model & Entity Relationships

### 12.1 Core Entity: Vehicle

The `vehicles` table is the central entity. ALL agents read from and write to it.

| Column | Type | Constraint | Owner Agent |
|---|---|---|---|
| id | UUID | PK | System |
| status | Enum | NOT NULL | Logistics (transitions), Orchestrator (approvals) |
| make | VARCHAR(50) | NOT NULL, indexed | JP Sourcing |
| model | VARCHAR(100) | NOT NULL, indexed | JP Sourcing |
| year | INTEGER | NOT NULL | JP Sourcing |
| variant | VARCHAR(100) | NULLABLE | JP Sourcing |
| vin | VARCHAR(17) | UNIQUE | JP Sourcing (set after purchase) |
| drive_side | Enum(LHD,RHD) | NOT NULL | JP Sourcing |
| mileage_km | INTEGER | NULLABLE | JP Sourcing |
| exterior_color | VARCHAR(80) | NULLABLE | JP Sourcing |
| interior_color | VARCHAR(80) | NULLABLE | JP Sourcing |
| specification | JSONB | DEFAULT {} | JP Sourcing |
| auction_source | VARCHAR(100) | NULLABLE | JP Sourcing |
| auction_grade | DECIMAL(2,1) | NULLABLE | JP Sourcing |
| purchase_price_jpy | BIGINT | NULLABLE | JP Sourcing |
| fx_rate_at_purchase | DECIMAL(8,4) | NULLABLE | Finance |
| landed_cost_eur | DECIMAL(12,2) | NULLABLE | Finance (running total) |
| estimated_sale_price | DECIMAL(12,2) | NULLABLE | DE Market |
| listing_price_eur | DECIMAL(12,2) | NULLABLE | Listing |
| actual_sale_price | DECIMAL(12,2) | NULLABLE | Finance |
| margin_estimate | DECIMAL(12,2) | NULLABLE | JP Sourcing |
| margin_actual | DECIMAL(12,2) | NULLABLE | Finance |
| margin_confidence | DECIMAL(3,2) | NULLABLE | JP Sourcing |
| condition_report | JSONB | DEFAULT {} | JP Sourcing |
| provenance_record | JSONB | DEFAULT {} | JP Sourcing |
| risk_flags | ARRAY(VARCHAR) | DEFAULT {} | JP Sourcing + Orchestrator |
| cost_breakdown | JSONB | DEFAULT {} | Finance |
| documents | JSONB | DEFAULT {} | Logistics |
| listing_ids | JSONB | DEFAULT {} | Listing |
| photos | ARRAY(TEXT) | DEFAULT {} | Listing + Logistics |
| timeline | JSONB | DEFAULT [] | Logistics |
| created_at | TIMESTAMP | DEFAULT NOW() | System |
| updated_at | TIMESTAMP | AUTO-UPDATE | System |

### 12.2 Supporting Entities

| Entity | Purpose | Primary Agent |
|---|---|---|
| `market_snapshots` | Time-series pricing data per model/spec/date | DE Market |
| `transactions` | Every financial event (purchase, duty, sale) linked to vehicle_id | Finance |
| `leads` | Customer inquiry records, linked to listing and vehicle | Concierge |
| `shipment_tracking` | Vessel movements, customs events, transport legs | Logistics |
| `audit_log` | Every agent decision with full reasoning chain | All agents |
| `agent_health` | Health check results, uptime, error counts per agent | System |

### 12.3 Data Ownership Rules (STRICT)

- Each column has ONE owner agent that can WRITE to it
- Other agents can READ any column
- The Finance Agent has READ access to ALL tables and WRITE access to all financial columns
- The Orchestrator has OVERRIDE access to any field (logged in audit_log)
- No agent can DELETE records — only status changes and soft deletes

---

## 13. Inter-Agent Communication Contracts

### 13.1 Redis Streams Topology

```
Stream: events.de_market
  → Consumed by: jp_sourcing, listing, orchestrator
  Messages: TARGET_VEHICLE_REPORT, PRICE_UPDATE, TREND_ALERT

Stream: events.jp_sourcing
  → Consumed by: orchestrator, finance, logistics
  Messages: OPPORTUNITY_REPORT, VEHICLE_DISCOVERED, BID_RESULT

Stream: events.orchestrator
  → Consumed by: ALL agents
  Messages: PURCHASE_AUTHORIZED, PURCHASE_REJECTED, PORTFOLIO_ALERT, AGENT_DIRECTIVE

Stream: events.logistics
  → Consumed by: orchestrator, finance, listing, concierge
  Messages: STATUS_CHANGE, ETA_UPDATE, CUSTOMS_COMPLETE, TUV_RESULT

Stream: events.listing
  → Consumed by: concierge, finance, orchestrator
  Messages: LISTING_LIVE, PRICE_CHANGE, LISTING_EXPIRED, INQUIRY_RECEIVED

Stream: events.finance
  → Consumed by: orchestrator, all agents
  Messages: FX_ALERT, COST_RECORDED, PNL_UPDATE, CASH_FLOW_ALERT

Stream: events.concierge
  → Consumed by: orchestrator, listing
  Messages: LEAD_QUALIFIED, OFFER_RECEIVED, ESCALATION, VIEWING_SCHEDULED
```

### 13.2 Message Priority Levels

| Priority | Use | SLA |
|---|---|---|
| CRITICAL | FX breach >5%, purchase deadline, system failure | Process within 60 seconds |
| HIGH | Purchase recommendations, customer offers, escalations | Process within 5 minutes |
| NORMAL | Status updates, price reports, routine logs | Process within 30 minutes |
| LOW | Analytics, trend reports, weekly summaries | Process within 4 hours |

---

## 14. KPI Framework & Success Metrics

### 14.1 Business KPIs

| KPI | Month 3 | Month 6 | Month 12 | Month 24 |
|---|---|---|---|---|
| Vehicles Sold / Month | 1-2 | 3-5 | 6-10 | 12-20 |
| Avg. Gross Margin / Vehicle | €15K+ | €20K+ | €25K+ | €30K+ |
| Avg. Days to Sale | <50 | <35 | <28 | <21 |
| Margin Prediction Accuracy | ±25% | ±15% | ±10% | ±7% |
| Capital Turnover (annualized) | 2.5x | 3.5x | 4.5x | 5.5x |
| Customer Review Score | 4.2+ | 4.5+ | 4.7+ | 4.8+ |
| Operational Cost / Vehicle | <€1,500 | <€1,000 | <€750 | <€500 |

### 14.2 Agent Performance KPIs

| Agent | Primary KPI | Month 6 Target | Month 12 Target |
|---|---|---|---|
| DE Market Agent | Price prediction accuracy | Within 12% | Within 8% |
| JP Sourcing Agent | Condition assessment accuracy | >80% | >85% |
| Listing Agent | Time to first qualified inquiry | <96h | <72h |
| Logistics Agent | ETA accuracy | Within 5 days | Within 3 days |
| Finance Agent | Cost tracking completeness | >95% | >98% |
| Concierge Agent | Response time + lead accuracy | <15min, >70% | <10min, >80% |
| Orchestrator | Purchase decision quality (approved ROI) | >80% predicted margin | >90% predicted margin |

### 14.3 System Health KPIs

| Metric | Target | Alert Threshold |
|---|---|---|
| Agent uptime | >99.5% | <99.0% |
| Inter-agent message latency | <500ms | >2000ms |
| Database query latency (p95) | <100ms | >500ms |
| Dashboard load time | <2s | >5s |
| Error rate (all agents) | <0.1% | >1.0% |

---

## 15. Implementation Roadmap

### Phase 1: Market Intelligence Foundation (Weeks 1-8)
**Goal:** Validate the arbitrage thesis with real data. ZERO capital risk.

| Week | Deliverable | Agent |
|---|---|---|
| 1-2 | mobile.de scraper + data pipeline + DB schema | DE Market v0.1 |
| 2-3 | AutoScout24 + specialist platform scrapers | DE Market v0.2 |
| 3-4 | Japanese auction data pipeline (USS, BH Auction) | JP Sourcing v0.1 |
| 4-5 | Auction sheet OCR + Claude Vision condition parsing | JP Sourcing v0.2 |
| 5-6 | Landed cost calculator with FX integration | Finance v0.1 |
| 6-7 | Margin estimator connecting DE pricing + JP costs | Orchestrator v0.1 |
| 7-8 | Historical backtesting + thesis validation | All |

**Exit criteria:** Confirmed that X% of candidates meet margin threshold using real data.

### Phase 2: First Acquisitions (Weeks 9-18)
**Goal:** Execute first 1-2 vehicle purchases. Validate end-to-end.

| Week | Deliverable | Agent |
|---|---|---|
| 9-10 | First 1-2 purchases using Phase 1 intelligence | Manual + agent assistance |
| 11-12 | Listing Agent — description gen, mobile.de API integration | Listing v0.1 |
| 13-14 | Logistics Agent — shipping tracker, customs docs, pipeline dashboard | Logistics v0.1 |
| 15-16 | First vehicles arrive. Execute TUV, prep, list. | Logistics + Listing |
| 17-18 | First sales completed. Full post-mortem. | All |

**Exit criteria:** First vehicle sold with actual margin within 20% of predicted margin.

### Phase 3: Full Pipeline Automation (Weeks 19-30)
**Goal:** All 6 agents + Orchestrator operational. 5-8 vehicles/month capacity.

| Week | Deliverable | Agent |
|---|---|---|
| 19-22 | Concierge Agent with multi-language, lead scoring | Concierge v1.0 |
| 23-26 | Finance Agent — full P&L, FX management, tax optimization | Finance v1.0 |
| 27-30 | Orchestrator — automated portfolio management, decision engine | Orchestrator v1.0 |

### Phase 4: Scale & Expansion (Month 8+)
- European market expansion (Switzerland, Netherlands, Belgium, Austria)
- Specialist platform integrations (ClassicDriver, Collecting Cars)
- Machine learning for margin prediction improvement
- B2B dealer supply model
- Physical showroom consideration for highest-value vehicles

---

## 16. Risk Register

| Risk | Probability | Impact | Mitigation | Responsible Agent |
|---|---|---|---|---|
| JPY appreciation ≥10% | Medium | High | Forward contracts, JPY account, 3% buffer in all calculations | Finance |
| Vehicle condition worse than graded | Low | Very High | Min grade 4.0, AI photo analysis, pre-ship inspection | JP Sourcing |
| TUV failure or expensive modifications | Low | High | Pre-import feasibility check, EU-spec vehicles only | Logistics |
| Shipping damage or loss | Low | Very High | Dedicated container, all-risk insurance, pre/post photo docs | Logistics |
| Extended time-to-sale (>60 days) | Medium | Medium | Dynamic pricing, multi-platform, dealer wholesale network | Listing + Orchestrator |
| Capital constraints limit growth | Medium | Medium | Phased scaling, inventory financing, cash reserve | Finance |
| Regulatory changes (tariffs, emissions) | Low | High | Compliance monitoring, diversified vehicle mix | Finance |
| Fraudulent auction listing | Low | Very High | Grade threshold, VIN verification, trusted auctions only | JP Sourcing |
| Competitor price pressure | Medium | Medium | Quality differentiation, speed advantage, niche positioning | DE Market + Listing |
| Warranty/legal claims from buyers | Low-Med | Medium-High | Professional contracts, Gewahrleistung disclaimers, legal counsel | Concierge (escalate) |
| Agent hallucination / wrong data | Medium | Very High | Confidence thresholds, human-in-the-loop, cross-validation between agents | Orchestrator |
| Single agent failure | Low | Medium | Circuit breakers, health checks, graceful degradation, manual fallback | System |

---

## 17. Appendix: Glossary & References

### Glossary

| Term | Definition |
|---|---|
| **Shaken** | Japan's mandatory biennial vehicle inspection. Costs escalate with vehicle value. |
| **CIF** | Cost, Insurance, and Freight — the total value of goods at the destination port. |
| **TUV Einzelabnahme** | German individual vehicle technical inspection (§21 StVZO). |
| **CoC** | Certificate of Conformity — EU type approval document. |
| **WVTA** | Whole Vehicle Type Approval — EU-wide type certification. |
| **Differenzbesteuerung** | German margin scheme taxation (§25a UStG) — VAT only on profit margin. |
| **Regelbesteuerung** | Standard German VAT treatment — full VAT on sale, input VAT deductible. |
| **USS** | Used Car System Solutions — Japan's largest auction network. |
| **LHD/RHD** | Left-Hand Drive / Right-Hand Drive. |
| **Gewerbeanmeldung** | German business registration for vehicle trading. |
| **§38 GewO** | German trade regulation requiring permit for vehicle dealing. |
| **Widerrufsrecht** | 14-day consumer return right under German distance selling law. |

### References

- Original architecture document: `luxury_auto_arbitrage_1.docx`
- Developer sprint specification: `dev_sprint_tasks.docx`
- Valuation agent specification: `valuation_agent_spec.docx`

---

**END OF DOCUMENT**

*This PRD is a living document. All agents must be re-validated against this specification after every major update. Any deviation from STRICT rules requires Orchestrator-level override logged in the audit trail.*
