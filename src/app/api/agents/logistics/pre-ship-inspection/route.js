/**
 * POST /api/agents/logistics/pre-ship-inspection
 *
 * Submit the Japan-side pre-loading inspection for a vehicle (spec §6.5.2).
 * The completed record is required before the pipeline will allow
 * AT_PORT_JP → IN_TRANSIT (enforced in pipeline.js prerequisite check).
 *
 * Body: {
 *   vehicleId: string,
 *   odometerReading: number,
 *   conditionNotes: string,
 *   photos: string[],            // URLs of condition photos
 *   inspectedBy?: string,        // Inspector name / company
 *   inspectedAt?: string,        // ISO timestamp; defaults to now
 * }
 */

import { savePreShipInspection, addPipelineEvent, getVehicleById } from "@/lib/agents/logistics/storage";
import { agentGuard } from "@/lib/settings";

export async function POST(request) {
  const blocked = await agentGuard("logistics");
  if (blocked) return blocked;

  let body;
  try { body = await request.json(); }
  catch { return Response.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const { vehicleId, odometerReading, conditionNotes, photos, inspectedBy, inspectedAt } = body || {};
  if (!vehicleId) {
    return Response.json({ error: "vehicleId is required" }, { status: 400 });
  }
  if (!Array.isArray(photos) || photos.length === 0) {
    return Response.json({ error: "photos[] is required — at least one condition photo" }, { status: 400 });
  }
  if (typeof odometerReading !== "number" || odometerReading < 0) {
    return Response.json({ error: "odometerReading (km) is required" }, { status: 400 });
  }

  const vehicle = await getVehicleById(vehicleId);
  if (!vehicle) {
    return Response.json({ error: `Vehicle ${vehicleId} not found` }, { status: 404 });
  }

  const inspection = await savePreShipInspection(vehicleId, {
    completed: true,
    odometerReading,
    conditionNotes: conditionNotes || null,
    photos,
    inspectedBy: inspectedBy || null,
    inspectedAt: inspectedAt || new Date().toISOString(),
  });

  await addPipelineEvent({
    vehicleId,
    fromStatus: vehicle.currentStage,
    toStatus: vehicle.currentStage,
    agent: "logistics",
    message: `Pre-ship inspection recorded (${photos.length} photos, odometer ${odometerReading} km)`,
    metadata: {
      inspectedBy: inspectedBy || null,
      photoCount: photos.length,
    },
  });

  return Response.json({
    success: true,
    vehicleId,
    inspection,
    message: "Pre-ship inspection recorded. Vehicle may now proceed to IN_TRANSIT when ready.",
  });
}
