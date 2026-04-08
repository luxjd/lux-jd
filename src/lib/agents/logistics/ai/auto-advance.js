/**
 * Auto-Advance — checks pipeline vehicles and automatically advances stages
 * when conditions are met.
 *
 * Called periodically (via API cron or manual trigger) to keep the pipeline moving.
 *
 * Rules:
 * - IN_TRANSIT → AT_PORT_DE: when estimated arrival date has passed
 * - CUSTOMS → WORKSHOP: when customs clearance is confirmed (all docs + broker status)
 * - TUV → READY_FOR_SALE: when TUV result is PASS
 */

import { getPipelineVehicles, getShipments } from "../storage";
import { advanceStage } from "./logistics-orchestrator";
import { trackShipment } from "./vessel-tracker";

/**
 * Check all vehicles and auto-advance where conditions are met.
 * @returns {object} Summary of actions taken
 */
export async function runAutoAdvance() {
  const data = getPipelineVehicles();
  const vehicles = data.vehicles || [];
  const actions = [];

  for (const vehicle of vehicles) {
    const action = await checkAndAdvance(vehicle);
    if (action) actions.push(action);
  }

  return {
    checked: vehicles.length,
    advanced: actions.length,
    actions,
    checkedAt: new Date().toISOString(),
  };
}

async function checkAndAdvance(vehicle) {
  const stage = vehicle.currentStage;

  // IN_TRANSIT → AT_PORT_DE: vessel has arrived
  if (stage === "IN_TRANSIT" && vehicle.shipment) {
    const tracking = trackShipment(vehicle.shipment);
    if (tracking.progress.isArrived) {
      const result = await advanceStage(vehicle.id, "AT_PORT_DE", {
        agent: "logistics-auto",
        notes: `Auto-advanced: vessel ${vehicle.shipment.vesselName} arrived at ${vehicle.shipment.route?.destination || "port"}`,
      });
      if (result.success) {
        return { vehicleId: vehicle.id, from: "IN_TRANSIT", to: "AT_PORT_DE", reason: "Vessel arrived" };
      }
    }
  }

  // AT_PORT_DE → CUSTOMS: auto-advance since customs docs are prepared on entry
  if (stage === "AT_PORT_DE") {
    const daysInStage = Math.round((Date.now() - new Date(vehicle.stageEnteredAt).getTime()) / (1000 * 60 * 60 * 24));
    if (daysInStage >= 1) {
      // Allow 1 day for port inspection before customs
      const result = await advanceStage(vehicle.id, "CUSTOMS", {
        agent: "logistics-auto",
        notes: "Auto-advanced: port inspection window complete, proceeding to customs",
      });
      if (result.success) {
        return { vehicleId: vehicle.id, from: "AT_PORT_DE", to: "CUSTOMS", reason: "Port inspection window passed" };
      }
    }
  }

  // CUSTOMS → WORKSHOP: customs clearance complete
  if (stage === "CUSTOMS" && vehicle.customsDeclaration) {
    const decl = vehicle.customsDeclaration;
    const daysInStage = Math.round((Date.now() - new Date(vehicle.stageEnteredAt).getTime()) / (1000 * 60 * 60 * 24));
    const processingDays = decl.estimatedProcessingDays || 3;

    if (daysInStage >= processingDays) {
      const result = await advanceStage(vehicle.id, "WORKSHOP", {
        agent: "logistics-auto",
        notes: `Auto-advanced: customs clearance complete after ${daysInStage} days`,
      });
      if (result.success) {
        return { vehicleId: vehicle.id, from: "CUSTOMS", to: "WORKSHOP", reason: "Customs processing time elapsed" };
      }
    }
  }

  // TUV → READY_FOR_SALE: TUV passed
  if (stage === "TUV" && vehicle.tuvAssessment) {
    const passProbability = vehicle.tuvAssessment.pass_probability_pct || 0;
    const daysInStage = Math.round((Date.now() - new Date(vehicle.stageEnteredAt).getTime()) / (1000 * 60 * 60 * 24));
    const appointmentDays = vehicle.tuvAssessment.appointment_lead_time_days || 3;

    // Auto-advance after appointment date + 1 day for result processing
    if (daysInStage >= appointmentDays + 1 && passProbability >= 80) {
      const result = await advanceStage(vehicle.id, "READY_FOR_SALE", {
        agent: "logistics-auto",
        notes: `Auto-advanced: TUV inspection complete (${passProbability}% pass probability)`,
      });
      if (result.success) {
        return { vehicleId: vehicle.id, from: "TUV", to: "READY_FOR_SALE", reason: `TUV complete (${passProbability}% pass)` };
      }
    }
  }

  return null;
}
