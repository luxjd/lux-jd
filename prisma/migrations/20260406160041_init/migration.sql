-- CreateEnum
CREATE TYPE "VehicleStatus" AS ENUM ('SOURCED', 'PURCHASED', 'JP_TRANSPORT', 'AT_PORT_JP', 'IN_TRANSIT', 'AT_PORT_DE', 'CUSTOMS', 'WORKSHOP', 'TUV', 'READY_FOR_SALE', 'LISTED', 'RESERVED', 'SOLD', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DriveSide" AS ENUM ('LHD', 'RHD');

-- CreateEnum
CREATE TYPE "TransactionCategory" AS ENUM ('PURCHASE', 'AUCTION_FEE', 'TRANSPORT_JP', 'EXPORT_DOCS', 'FREIGHT', 'INSURANCE', 'CUSTOMS_DUTY', 'IMPORT_VAT', 'PORT_HANDLING', 'TUV', 'REGISTRATION', 'TRANSPORT_DE', 'DETAILING', 'PHOTOGRAPHY', 'LISTING_FEE', 'STORAGE', 'MISCELLANEOUS', 'SALE_PROCEEDS');

-- CreateEnum
CREATE TYPE "ListingStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'SOLD', 'EXPIRED');

-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'CONTACTED', 'QUALIFIED', 'ESCALATED', 'VIEWING', 'NEGOTIATING', 'CONVERTED', 'LOST');

-- CreateEnum
CREATE TYPE "BuyerType" AS ENUM ('COLLECTOR', 'SERIOUS', 'TRADE', 'BROWSER', 'COMPETITOR', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "DecisionType" AS ENUM ('AUTO_APPROVE', 'HUMAN_REVIEW', 'REJECT');

-- CreateTable
CREATE TABLE "Vehicle" (
    "id" TEXT NOT NULL,
    "status" "VehicleStatus" NOT NULL DEFAULT 'SOURCED',
    "make" VARCHAR(50) NOT NULL,
    "model" VARCHAR(100) NOT NULL,
    "year" INTEGER NOT NULL,
    "variant" VARCHAR(100),
    "vin" VARCHAR(17),
    "driveSide" "DriveSide" NOT NULL,
    "mileageKm" INTEGER,
    "exteriorColor" VARCHAR(80),
    "interiorColor" VARCHAR(80),
    "specification" JSONB NOT NULL DEFAULT '{}',
    "engineSpec" TEXT,
    "auctionSource" VARCHAR(100),
    "auctionGrade" DECIMAL(2,1),
    "auctionLot" TEXT,
    "purchasePriceJpy" BIGINT,
    "fxRateAtPurchase" DECIMAL(8,4),
    "landedCostEur" DECIMAL(12,2),
    "estimatedSalePrice" DECIMAL(12,2),
    "listingPriceEur" DECIMAL(12,2),
    "actualSalePrice" DECIMAL(12,2),
    "marginEstimate" DECIMAL(12,2),
    "marginActual" DECIMAL(12,2),
    "marginConfidence" DECIMAL(3,2),
    "conditionReport" JSONB NOT NULL DEFAULT '{}',
    "provenanceRecord" JSONB NOT NULL DEFAULT '{}',
    "riskFlags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "costBreakdown" JSONB NOT NULL DEFAULT '{}',
    "documents" JSONB NOT NULL DEFAULT '{}',
    "photos" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "listingIds" JSONB NOT NULL DEFAULT '{}',
    "stageEnteredAt" TIMESTAMP(3),
    "stageHistory" JSONB NOT NULL DEFAULT '[]',
    "estimatedReadyDate" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "category" "TransactionCategory" NOT NULL,
    "amountEur" DECIMAL(12,2) NOT NULL,
    "amountOriginal" DECIMAL(12,2),
    "currency" VARCHAR(3) NOT NULL DEFAULT 'EUR',
    "fxRate" DECIMAL(8,4),
    "description" TEXT,
    "documentRef" VARCHAR(255),
    "transactionDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketSnapshot" (
    "id" SERIAL NOT NULL,
    "make" VARCHAR(50) NOT NULL,
    "model" VARCHAR(100) NOT NULL,
    "yearFrom" INTEGER NOT NULL,
    "yearTo" INTEGER NOT NULL,
    "avgPriceEur" DECIMAL(12,2) NOT NULL,
    "medianPriceEur" DECIMAL(12,2) NOT NULL,
    "minPrice" DECIMAL(12,2),
    "maxPrice" DECIMAL(12,2),
    "listingCount" INTEGER NOT NULL,
    "avgDaysOnMarket" INTEGER,
    "demandScore" INTEGER,
    "trend7d" DECIMAL(5,2),
    "trend30d" DECIMAL(5,2),
    "trend90d" DECIMAL(5,2),
    "specPremiums" JSONB NOT NULL DEFAULT '{}',
    "dataSource" VARCHAR(50) NOT NULL,
    "snapshotAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PipelineEvent" (
    "id" SERIAL NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "fromStatus" "VehicleStatus",
    "toStatus" "VehicleStatus" NOT NULL,
    "agent" VARCHAR(50) NOT NULL,
    "message" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PipelineEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shipment" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "vesselName" TEXT NOT NULL,
    "containerId" TEXT NOT NULL,
    "containerType" TEXT NOT NULL DEFAULT 'DEDICATED_20FT',
    "originPort" TEXT NOT NULL DEFAULT 'Yokohama',
    "destinationPort" TEXT NOT NULL DEFAULT 'Bremerhaven',
    "carrier" TEXT,
    "departureDate" TIMESTAMP(3),
    "estimatedArrival" TIMESTAMP(3),
    "actualArrival" TIMESTAMP(3),
    "insuranceProvider" TEXT,
    "insurancePolicy" TEXT,
    "preShipPhotos" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "postArrivalPhotos" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "damageDetected" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TuvAppointment" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "stationName" TEXT NOT NULL,
    "stationCity" TEXT NOT NULL,
    "appointmentDate" TIMESTAMP(3),
    "complexity" TEXT NOT NULL DEFAULT 'LOW',
    "estimatedCost" DECIMAL(8,2),
    "passProbability" INTEGER,
    "checklist" JSONB NOT NULL DEFAULT '[]',
    "result" TEXT,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TuvAppointment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Listing" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "status" "ListingStatus" NOT NULL DEFAULT 'DRAFT',
    "currentPrice" DECIMAL(12,2) NOT NULL,
    "initialPrice" DECIMAL(12,2) NOT NULL,
    "pricingStrategy" TEXT,
    "platforms" JSONB NOT NULL DEFAULT '{}',
    "content" JSONB NOT NULL DEFAULT '{}',
    "priceHistory" JSONB NOT NULL DEFAULT '[]',
    "daysOnMarket" INTEGER NOT NULL DEFAULT 0,
    "totalViews" INTEGER NOT NULL DEFAULT 0,
    "totalInquiries" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Listing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT,
    "name" VARCHAR(200) NOT NULL,
    "email" VARCHAR(200),
    "phone" VARCHAR(50),
    "source" VARCHAR(50) NOT NULL,
    "status" "LeadStatus" NOT NULL DEFAULT 'NEW',
    "buyerType" "BuyerType" NOT NULL DEFAULT 'UNKNOWN',
    "score" INTEGER NOT NULL DEFAULT 0,
    "language" VARCHAR(5) NOT NULL DEFAULT 'DE',
    "inquiryText" TEXT,
    "responseText" TEXT,
    "offerPrice" DECIMAL(12,2),
    "escalated" BOOLEAN NOT NULL DEFAULT false,
    "escalationReason" TEXT,
    "suggestedAction" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "role" VARCHAR(20) NOT NULL,
    "text" TEXT NOT NULL,
    "source" VARCHAR(50),
    "aiPowered" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Valuation" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT,
    "make" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "inputData" JSONB NOT NULL,
    "reportData" JSONB NOT NULL,
    "verdict" VARCHAR(20),
    "marginEur" DECIMAL(12,2),
    "confidence" DECIMAL(3,2),
    "aiPowered" BOOLEAN NOT NULL DEFAULT false,
    "processingTime" DECIMAL(6,1),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Valuation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrchestratorDecision" (
    "id" TEXT NOT NULL,
    "vehicleName" TEXT NOT NULL,
    "opportunityId" TEXT,
    "decision" "DecisionType" NOT NULL,
    "decisionReason" TEXT NOT NULL,
    "steps" JSONB NOT NULL DEFAULT '[]',
    "financials" JSONB NOT NULL DEFAULT '{}',
    "risk" JSONB NOT NULL DEFAULT '{}',
    "portfolio" JSONB NOT NULL DEFAULT '{}',
    "brief" JSONB,
    "flagReasons" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrchestratorDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FxRate" (
    "id" SERIAL NOT NULL,
    "rate" DECIMAL(8,4) NOT NULL,
    "source" VARCHAR(50) NOT NULL DEFAULT 'frankfurter.app',
    "live" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FxRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FxAlert" (
    "id" SERIAL NOT NULL,
    "level" VARCHAR(20) NOT NULL,
    "type" VARCHAR(50) NOT NULL,
    "message" TEXT NOT NULL,
    "impact" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FxAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentStatus" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'IDLE',
    "lastAction" TEXT,
    "lastActionAt" TIMESTAMP(3),
    "errorCount24h" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentStatus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" SERIAL NOT NULL,
    "agent" VARCHAR(50) NOT NULL,
    "action" VARCHAR(100) NOT NULL,
    "entityType" VARCHAR(50),
    "entityId" TEXT,
    "inputHash" VARCHAR(64),
    "modelUsed" VARCHAR(100),
    "tokensUsed" INTEGER,
    "latencyMs" INTEGER,
    "reasoning" TEXT,
    "result" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle_vin_key" ON "Vehicle"("vin");

-- CreateIndex
CREATE INDEX "Vehicle_make_idx" ON "Vehicle"("make");

-- CreateIndex
CREATE INDEX "Vehicle_model_idx" ON "Vehicle"("model");

-- CreateIndex
CREATE INDEX "Vehicle_status_idx" ON "Vehicle"("status");

-- CreateIndex
CREATE INDEX "Vehicle_createdAt_idx" ON "Vehicle"("createdAt");

-- CreateIndex
CREATE INDEX "Transaction_vehicleId_idx" ON "Transaction"("vehicleId");

-- CreateIndex
CREATE INDEX "Transaction_category_idx" ON "Transaction"("category");

-- CreateIndex
CREATE INDEX "Transaction_transactionDate_idx" ON "Transaction"("transactionDate");

-- CreateIndex
CREATE INDEX "MarketSnapshot_make_model_idx" ON "MarketSnapshot"("make", "model");

-- CreateIndex
CREATE INDEX "MarketSnapshot_snapshotAt_idx" ON "MarketSnapshot"("snapshotAt");

-- CreateIndex
CREATE INDEX "PipelineEvent_vehicleId_idx" ON "PipelineEvent"("vehicleId");

-- CreateIndex
CREATE INDEX "PipelineEvent_createdAt_idx" ON "PipelineEvent"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Shipment_vehicleId_key" ON "Shipment"("vehicleId");

-- CreateIndex
CREATE UNIQUE INDEX "TuvAppointment_vehicleId_key" ON "TuvAppointment"("vehicleId");

-- CreateIndex
CREATE INDEX "Listing_vehicleId_idx" ON "Listing"("vehicleId");

-- CreateIndex
CREATE INDEX "Listing_status_idx" ON "Listing"("status");

-- CreateIndex
CREATE INDEX "Lead_status_idx" ON "Lead"("status");

-- CreateIndex
CREATE INDEX "Lead_vehicleId_idx" ON "Lead"("vehicleId");

-- CreateIndex
CREATE INDEX "Lead_createdAt_idx" ON "Lead"("createdAt");

-- CreateIndex
CREATE INDEX "Message_leadId_idx" ON "Message"("leadId");

-- CreateIndex
CREATE INDEX "Valuation_createdAt_idx" ON "Valuation"("createdAt");

-- CreateIndex
CREATE INDEX "OrchestratorDecision_decision_idx" ON "OrchestratorDecision"("decision");

-- CreateIndex
CREATE INDEX "OrchestratorDecision_createdAt_idx" ON "OrchestratorDecision"("createdAt");

-- CreateIndex
CREATE INDEX "FxRate_createdAt_idx" ON "FxRate"("createdAt");

-- CreateIndex
CREATE INDEX "FxAlert_level_idx" ON "FxAlert"("level");

-- CreateIndex
CREATE INDEX "FxAlert_createdAt_idx" ON "FxAlert"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_agent_idx" ON "AuditLog"("agent");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PipelineEvent" ADD CONSTRAINT "PipelineEvent_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TuvAppointment" ADD CONSTRAINT "TuvAppointment_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Valuation" ADD CONSTRAINT "Valuation_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;
