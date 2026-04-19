/**
 * Logistics Orchestrator — manages the full vehicle pipeline lifecycle.
 *
 * Core operations:
 * 1. Add vehicle to pipeline (from Orchestrator purchase approval)
 * 2. Advance vehicle to next stage (with validation)
 * 3. Create shipment when vehicle reaches AT_PORT_JP
 * 4. Prepare customs when approaching AT_PORT_DE
 * 5. Schedule TUV when at WORKSHOP
 * 6. Mark READY_FOR_SALE (triggers Listing Agent)
 */

import { after } from "next/server";
import { validateTransition, calculateETAs, STAGES, isPhotoRequired, estimateTotalDaysRemaining } from "../pipeline";
import { createShipment, getShipmentProgress } from "./shipping-tracker";
import { generateCustomsDeclaration, reviewCustomsDocuments } from "./customs-engine";
import { generateTuvAssessment, recommendStation, scheduleTuvAppointment } from "./tuv-manager";
import { bookInlandTransport, defaultWorkshopOrigin } from "./inland-transport";
import {
  savePipelineVehicle, getVehicleById, addPipelineEvent,
  saveShipment, saveCustomsDeclaration, saveTuvAppointment,
  updateAgentStatus, getPipelineVehicles,
  getPreShipInspection, getInlandTransports, addInlandTransport,
} from "../storage";
// Spec §6.4.2 point 1 + KPI §11.2: Finance is the authority on "98%+ cost
// tracking completeness before sale". Logistics used to gate READY_FOR_SALE
// on a two-field existence check of the landedCost blob; now routes through
// the Finance ledger's real category coverage instead.
import { getTransactionsByVehicle } from "@/lib/agents/finance/storage";
import { calculateCompleteness } from "@/lib/agents/finance/ledger";

const FINANCE_COMPLETENESS_THRESHOLD = 98;

/**
 * Add a new vehicle to the pipeline at SOURCED stage.
 */
export function addVehicleToPipeline(vehicleData) {
  const vehicle = {
    id: vehicleData.id || `veh-${Date.now()}`,
    ...vehicleData,
    currentStage: "SOURCED",
    stageEnteredAt: new Date().toISOString(),
    stageHistory: [{ stage: "SOURCED", enteredAt: new Date().toISOString(), agent: "logistics" }],
    etas: calculateETAs("SOURCED"),
    estimatedDaysToReady: estimateTotalDaysRemaining("SOURCED"),
    tuvPassed: false,
    costsComplete: false,
    customsDocsReady: false,
    shipment: null,
    customsDeclaration: null,
    tuvAssessment: null,
    tuvAppointment: null,
    addedAt: new Date().toISOString(),
  };

  savePipelineVehicle(vehicle);

  addPipelineEvent({
    vehicleId: vehicle.id,
    type: "PIPELINE_ENTRY",
    fromStage: null,
    toStage: "SOURCED",
    agent: "logistics",
    message: `${vehicleData.make} ${vehicleData.model} ${vehicleData.year} added to pipeline`,
    metadata: { source: vehicleData.auctionSource, price: vehicleData.purchasePriceJpy },
  });

  updateStatus();
  return vehicle;
}

/**
 * Advance a vehicle to the next stage.
 * This is the core operation — includes validation, side effects, and event logging.
 */
export async function advanceStage(vehicleId, targetStage, options = {}) {
  // `getVehicleById` is async — without awaiting, the prerequisite checks below
  // would see `undefined` for all state fields. Hydrate the vehicle with the
  // keyValueStore-backed records (pre-ship inspection, inland transports) that
  // aren't part of the Prisma Vehicle row.
  const vehicle = await getVehicleById(vehicleId);
  if (!vehicle) return { error: `Vehicle ${vehicleId} not found` };

  vehicle.preShipInspection = await getPreShipInspection(vehicleId);
  vehicle.inlandTransports = await getInlandTransports(vehicleId);

  const currentStage = vehicle.currentStage;

  // ─── Pre-validation: set flags for READY_FOR_SALE transition ───
  // Finance's calculateCompleteness is the spec-authoritative check. Cache
  // the result on the vehicle so the side-effect block below can reuse it
  // without another DB round-trip.
  let financeCompleteness = null;
  if (targetStage === "READY_FOR_SALE") {
    vehicle.tuvPassed = true;
    const txns = await getTransactionsByVehicle(vehicleId);
    financeCompleteness = calculateCompleteness(txns);
    vehicle.costsComplete =
      financeCompleteness.completeness >= FINANCE_COMPLETENESS_THRESHOLD || !!options.override;
  }

  // ─── Validate transition ───
  const validation = validateTransition(currentStage, targetStage, vehicle, options.override);
  if (!validation.valid) {
    return { error: `Invalid transition: ${validation.errors.join("; ")}`, validation };
  }

  // ─── Execute stage-specific side effects ───
  let sideEffects = {};

  // AT_PORT_JP → IN_TRANSIT: Create shipment and carry forward pre-ship inspection
  if (targetStage === "IN_TRANSIT" && !vehicle.shipment) {
    const shipment = createShipment(vehicle, options.shipping);
    // Spec §6.5.2: the pre-loading inspection done in Japan is the authoritative
    // condition record shipping insurance relies on. Hydrate the shipment's
    // preShipInspection from the vehicle's submitted data so the shipment record
    // carries the full condition evidence.
    if (vehicle.preShipInspection?.completed) {
      shipment.preShipInspection = {
        completed: true,
        odometerReading: vehicle.preShipInspection.odometerReading ?? vehicle.mileageKm ?? null,
        conditionNotes: vehicle.preShipInspection.conditionNotes || null,
        photos: Array.isArray(vehicle.preShipInspection.photos) ? vehicle.preShipInspection.photos : [],
        inspectedAt: vehicle.preShipInspection.inspectedAt || new Date().toISOString(),
        inspectedBy: vehicle.preShipInspection.inspectedBy || null,
      };
    }
    saveShipment(shipment);
    vehicle.shipment = shipment;
    sideEffects.shipmentCreated = shipment.shipmentId;
    sideEffects.preShipInspection = shipment.preShipInspection?.completed ? "documented" : "missing";
  }

  // AT_PORT_DE: Prepare customs
  if (targetStage === "CUSTOMS" || targetStage === "AT_PORT_DE") {
    if (!vehicle.customsDeclaration) {
      const declaration = generateCustomsDeclaration(vehicle, vehicle.shipment);
      saveCustomsDeclaration(declaration);
      vehicle.customsDeclaration = declaration;
      vehicle.customsDocsReady = true;

      // AI review if available
      const review = await reviewCustomsDocuments(declaration);
      if (review) {
        vehicle.customsReview = review;
        sideEffects.customsReview = review.status;
      }
      sideEffects.customsDeclarationPrepared = declaration.documentId;
    }
  }

  // CUSTOMS → WORKSHOP: Book enclosed inland transport, port → workshop.
  // Spec §6.5.2: "Arrange enclosed vehicle transport for all movements within
  // Germany. Never expose a €100,000+ vehicle to open transport or weather risk."
  if (targetStage === "WORKSHOP") {
    const existing = vehicle.inlandTransports || [];
    const alreadyBooked = existing.some((t) => t.legType === "PORT_TO_WORKSHOP");
    if (!alreadyBooked) {
      const fromPort = defaultWorkshopOrigin(
        vehicle.shipment?.route?.destination || vehicle.customsDeclaration?.portOfEntry
      );
      const toCity = options.workshopCity || vehicle.tuvAssessment?.recommended_station_city || "Bremen";
      const transport = bookInlandTransport(vehicle, "PORT_TO_WORKSHOP", fromPort, toCity, options.inlandTransport);
      await addInlandTransport(vehicleId, transport);
      vehicle.inlandTransports = [...existing, transport];
      sideEffects.inlandTransportBooked = transport.transportId;
      sideEffects.inlandTransportLeg = `${fromPort} → ${toCity} (enclosed, ${transport.carrier.name})`;
    }
  }

  // WORKSHOP → TUV: Generate assessment and schedule
  if (targetStage === "TUV" && !vehicle.tuvAssessment) {
    const assessment = await generateTuvAssessment(vehicle);
    vehicle.tuvAssessment = assessment;

    const station = recommendStation(vehicle);
    const appointment = scheduleTuvAppointment(vehicle, station);
    saveTuvAppointment(appointment);
    vehicle.tuvAppointment = appointment;

    sideEffects.tuvAssessment = assessment.complexity;
    sideEffects.tuvAppointment = appointment.appointmentId;
  }

  // TUV → READY_FOR_SALE: Book enclosed workshop → storage leg.
  // Spec §6.5.2 final inland movement before the car is listed for sale.
  if (targetStage === "READY_FOR_SALE") {
    const existing = vehicle.inlandTransports || [];
    const alreadyBooked = existing.some((t) => t.legType === "WORKSHOP_TO_STORAGE");
    if (!alreadyBooked) {
      const fromCity = vehicle.tuvAppointment?.station?.city || "Bremen";
      const toCity = options.storageCity || "Bremen";
      const transport = bookInlandTransport(vehicle, "WORKSHOP_TO_STORAGE", fromCity, toCity, options.inlandTransport);
      await addInlandTransport(vehicleId, transport);
      vehicle.inlandTransports = [...existing, transport];
      sideEffects.storageTransportBooked = transport.transportId;
      sideEffects.storageTransportLeg = `${fromCity} → ${toCity} (enclosed, ${transport.carrier.name})`;
    }
  }

  // TUV → READY_FOR_SALE: Verify TUV passed + Finance completeness ≥98%
  if (targetStage === "READY_FOR_SALE") {
    vehicle.tuvPassed = true;

    if (financeCompleteness) {
      sideEffects.costCompleteness = financeCompleteness.completeness;
      sideEffects.recordedCategories = financeCompleteness.recordedCategories.length;
      sideEffects.transactionCount = financeCompleteness.totalTransactions;

      if (financeCompleteness.completeness >= FINANCE_COMPLETENESS_THRESHOLD) {
        vehicle.costsComplete = true;
        sideEffects.costsConfirmed = true;
      } else if (options.override) {
        vehicle.costsComplete = true;
        sideEffects.costsOverridden = true;
        sideEffects.missingCategories = financeCompleteness.missingCategories;
        sideEffects.costWarning = `Finance completeness ${financeCompleteness.completeness}% (threshold ${FINANCE_COMPLETENESS_THRESHOLD}%) — override used. Missing: ${financeCompleteness.missingCategories.slice(0, 5).join(", ")}`;
      } else {
        vehicle.costsComplete = false;
        sideEffects.costsPending = true;
        sideEffects.missingCategories = financeCompleteness.missingCategories;
        sideEffects.costWarning = `Finance Agent reports ${financeCompleteness.completeness}% cost completeness (need ${FINANCE_COMPLETENESS_THRESHOLD}%). Missing: ${financeCompleteness.missingCategories.slice(0, 5).join(", ")}. Use override to proceed.`;
      }
    }
    sideEffects.readyForSale = vehicle.costsComplete;

    // Spec §6.3.1 — hand off to Listing Agent once the vehicle is cleared for
    // sale (TUV passed + costs confirmed). Fire-and-forget so the Logistics
    // transition returns fast; the Listing Agent is idempotent per vehicle
    // (checks for existing listings before creating).
    if (vehicle.costsComplete && !options.skipListingHandoff) {
      sideEffects.listingHandoff = "queued";
      after(async () => {
        try {
          const { getAllListings } = await import("@/lib/agents/listing/storage");
          const existing = (await getAllListings()).listings || [];
          if (existing.some((l) => l.vehicleId === vehicleId && l.status !== "LOST")) {
            console.log(`Listing handoff skipped: ${vehicleId} already has a listing`);
            return;
          }
          const { createListing } = await import("@/lib/agents/listing/ai/listing-orchestrator");
          await createListing({
            ...vehicle,
            id: vehicleId,
            estimatedSalePrice: vehicle.estimatedSalePrice,
            landedCostEur: vehicle.landedCostEur || vehicle.landedCost?.totalLandedCostEur,
          });
        } catch (err) {
          console.warn(`Listing auto-handoff failed for ${vehicleId}:`, err.message);
        }
      });
    }
  }

  // ─── Update vehicle state ───
  const previousStage = vehicle.currentStage;
  vehicle.currentStage = targetStage;
  vehicle.stageEnteredAt = new Date().toISOString();
  vehicle.stageHistory.push({
    stage: targetStage,
    enteredAt: new Date().toISOString(),
    agent: options.agent || "logistics",
    notes: options.notes,
  });
  vehicle.etas = calculateETAs(targetStage, new Date());
  vehicle.estimatedDaysToReady = estimateTotalDaysRemaining(targetStage);

  // Calculate days in previous stage
  const prevEntry = vehicle.stageHistory.find((h) => h.stage === previousStage);
  if (prevEntry) {
    const daysInStage = Math.round((Date.now() - new Date(prevEntry.enteredAt).getTime()) / (1000 * 60 * 60 * 24));
    sideEffects.daysInPreviousStage = daysInStage;
  }

  savePipelineVehicle(vehicle);

  // ─── Log event ───
  addPipelineEvent({
    vehicleId,
    type: "STAGE_TRANSITION",
    fromStage: previousStage,
    toStage: targetStage,
    agent: options.agent || "logistics",
    message: `${vehicle.make} ${vehicle.model}: ${previousStage} → ${targetStage}`,
    metadata: {
      photoRequired: isPhotoRequired(targetStage),
      sideEffects,
      notes: options.notes,
    },
  });

  updateStatus();

  return {
    success: true,
    vehicle,
    previousStage,
    newStage: targetStage,
    photoRequired: isPhotoRequired(targetStage),
    sideEffects,
    etas: vehicle.etas,
  };
}

/**
 * Get full pipeline overview — all vehicles grouped by stage.
 */
export function getPipelineOverview() {
  const data = getPipelineVehicles();
  const vehicles = data.vehicles || [];

  const byStage = {};
  for (const stage of STAGES) {
    byStage[stage] = vehicles.filter((v) => v.currentStage === stage);
  }

  return {
    totalVehicles: vehicles.length,
    byStage,
    stages: STAGES.map((s) => ({
      stage: s,
      count: byStage[s].length,
      vehicles: byStage[s].map((v) => ({
        id: v.id,
        make: v.make,
        model: v.model,
        year: v.year,
        daysInStage: Math.round((Date.now() - new Date(v.stageEnteredAt).getTime()) / (1000 * 60 * 60 * 24)),
        estimatedDaysToReady: v.estimatedDaysToReady,
        landedCostEur: v.landedCostEur || v.landedCost?.totalLandedCostEur,
        margin: v.margin?.grossMarginEur,
      })),
    })),
    updatedAt: new Date().toISOString(),
  };
}

function updateStatus() {
  const data = getPipelineVehicles();
  const vehicles = data.vehicles || [];
  updateAgentStatus({
    status: "ONLINE",
    lastActionTimestamp: new Date().toISOString(),
    totalVehiclesInPipeline: vehicles.length,
    vehiclesByStage: STAGES.reduce((acc, s) => {
      acc[s] = vehicles.filter((v) => v.currentStage === s).length;
      return acc;
    }, {}),
  });
}
