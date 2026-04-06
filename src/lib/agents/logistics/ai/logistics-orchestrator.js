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

import { validateTransition, calculateETAs, STAGES, isPhotoRequired, estimateTotalDaysRemaining } from "../pipeline";
import { createShipment, getShipmentProgress } from "./shipping-tracker";
import { generateCustomsDeclaration, reviewCustomsDocuments } from "./customs-engine";
import { generateTuvAssessment, recommendStation, scheduleTuvAppointment } from "./tuv-manager";
import {
  savePipelineVehicle, getVehicleById, addPipelineEvent,
  saveShipment, saveCustomsDeclaration, saveTuvAppointment,
  updateAgentStatus, getPipelineVehicles,
} from "../storage";

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
  const vehicle = getVehicleById(vehicleId);
  if (!vehicle) return { error: `Vehicle ${vehicleId} not found` };

  const currentStage = vehicle.currentStage;

  // ─── Validate transition ───
  const validation = validateTransition(currentStage, targetStage, vehicle, options.override);
  if (!validation.valid) {
    return { error: `Invalid transition: ${validation.errors.join("; ")}`, validation };
  }

  // ─── Execute stage-specific side effects ───
  let sideEffects = {};

  // AT_PORT_JP → IN_TRANSIT: Create shipment
  if (targetStage === "IN_TRANSIT" && !vehicle.shipment) {
    const shipment = createShipment(vehicle, options.shipping);
    saveShipment(shipment);
    vehicle.shipment = shipment;
    sideEffects.shipmentCreated = shipment.shipmentId;
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

  // TUV → READY_FOR_SALE: Mark TUV as passed
  if (targetStage === "READY_FOR_SALE") {
    vehicle.tuvPassed = true;
    vehicle.costsComplete = true; // In production, Finance Agent confirms this
    sideEffects.readyForSale = true;
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
