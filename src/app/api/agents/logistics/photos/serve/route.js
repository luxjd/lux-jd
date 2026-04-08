import { readFileSync, existsSync } from "fs";
import { join } from "path";

const PHOTOS_DIR = join(process.cwd(), "data", "logistics", "photos");

/**
 * GET — Serve a vehicle photo file.
 * /api/agents/logistics/photos/serve?vehicleId=xxx&stage=yyy&file=zzz.jpg
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const vehicleId = searchParams.get("vehicleId");
  const stage = searchParams.get("stage");
  const file = searchParams.get("file");

  if (!vehicleId || !stage || !file) {
    return new Response("Missing parameters", { status: 400 });
  }

  // Prevent path traversal
  if (file.includes("..") || vehicleId.includes("..") || stage.includes("..")) {
    return new Response("Invalid path", { status: 400 });
  }

  const filePath = join(PHOTOS_DIR, vehicleId, stage, file);

  if (!existsSync(filePath)) {
    return new Response("Photo not found", { status: 404 });
  }

  const buffer = readFileSync(filePath);
  const ext = file.split(".").pop().toLowerCase();
  const contentType = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";

  return new Response(buffer, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=86400",
    },
  });
}
