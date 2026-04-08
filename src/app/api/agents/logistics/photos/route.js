import { writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { getVehicleById, savePipelineVehicle, addPipelineEvent } from "@/lib/agents/logistics/storage";

const PHOTOS_DIR = join(process.cwd(), "data", "logistics", "photos");

function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

/**
 * POST — Upload photos for a vehicle at a specific pipeline stage.
 * Accepts multipart/form-data with vehicleId, stage, and photo files.
 */
export async function POST(request) {
  try {
    const formData = await request.formData();
    const vehicleId = formData.get("vehicleId");
    const stage = formData.get("stage");
    const photos = formData.getAll("photos");

    if (!vehicleId || !stage) {
      return Response.json({ error: "Missing vehicleId or stage" }, { status: 400 });
    }

    if (!photos || photos.length === 0) {
      return Response.json({ error: "No photos provided" }, { status: 400 });
    }

    const vehicle = await getVehicleById(vehicleId);
    if (!vehicle) {
      return Response.json({ error: "Vehicle not found" }, { status: 404 });
    }

    // Save photos to disk
    const vehicleDir = join(PHOTOS_DIR, vehicleId, stage.toLowerCase());
    ensureDir(vehicleDir);

    const savedPhotos = [];
    for (let i = 0; i < photos.length; i++) {
      const file = photos[i];
      if (!file || !file.size) continue;

      const bytes = await file.arrayBuffer();
      const ext = file.name?.split(".").pop() || "jpg";
      const filename = `${stage.toLowerCase()}_${Date.now()}_${i}.${ext}`;
      const filepath = join(vehicleDir, filename);

      writeFileSync(filepath, Buffer.from(bytes));
      savedPhotos.push({
        filename,
        path: `data/logistics/photos/${vehicleId}/${stage.toLowerCase()}/${filename}`,
        size: file.size,
        uploadedAt: new Date().toISOString(),
      });
    }

    // Update vehicle record
    if (!vehicle.stagePhotos) vehicle.stagePhotos = {};
    if (!vehicle.stagePhotos[stage]) vehicle.stagePhotos[stage] = [];
    vehicle.stagePhotos[stage].push(...savedPhotos);
    await savePipelineVehicle(vehicle);

    // Log event
    await addPipelineEvent({
      vehicleId,
      type: "PHOTO_UPLOAD",
      fromStage: stage,
      toStage: stage,
      agent: "operator",
      message: `${savedPhotos.length} photos uploaded for ${vehicle.make} ${vehicle.model} at ${stage}`,
      metadata: { photoCount: savedPhotos.length, stage },
    });

    return Response.json({
      success: true,
      uploaded: savedPhotos.length,
      stage,
      photos: savedPhotos,
    });
  } catch (err) {
    console.error("Photo upload error:", err);
    return Response.json({ error: "Failed to upload photos" }, { status: 500 });
  }
}

/**
 * GET — Get photos for a vehicle, optionally filtered by stage.
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const vehicleId = searchParams.get("vehicleId");

  if (!vehicleId) {
    return Response.json({ error: "Missing vehicleId" }, { status: 400 });
  }

  const vehicle = await getVehicleById(vehicleId);
  if (!vehicle) {
    return Response.json({ error: "Vehicle not found" }, { status: 404 });
  }

  const stage = searchParams.get("stage");
  const photos = vehicle.stagePhotos || {};

  if (stage) {
    return Response.json({ vehicleId, stage, photos: photos[stage] || [] });
  }

  return Response.json({ vehicleId, photos });
}
