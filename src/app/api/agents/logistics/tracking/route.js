import { getShipments } from "@/lib/agents/logistics/storage";
import { trackShipmentLive } from "@/lib/agents/logistics/ai/vessel-tracker";

/**
 * GET — Get live tracking data for all active shipments.
 */
export async function GET() {
  const data = getShipments();
  const shipments = data.shipments || [];

  if (shipments.length === 0) {
    return Response.json({ shipments: [], count: 0 });
  }

  const tracking = await Promise.all(
    shipments.map((s) => trackShipmentLive(s))
  );

  return Response.json({
    shipments: tracking,
    count: tracking.length,
    hasLiveData: tracking.some((t) => t.position.live),
  });
}
