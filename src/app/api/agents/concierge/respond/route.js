import { handleInquiry } from "@/lib/agents/concierge/ai/concierge-orchestrator";
import { agentGuard } from "@/lib/settings";

export async function POST(request) {
  const blocked = await agentGuard("concierge");
  if (blocked) return blocked;

  const body = await request.json();

  if (!body.inquiry || !body.vehicle) {
    return Response.json({ error: "Missing inquiry text or vehicle data" }, { status: 400 });
  }

  try {
    // `handleInquiry` persists the lead + messages + SLA record through the
    // concierge storage helpers (Prisma upserts + keyValueStore). The route
    // used to wrap a second `db.leads.create(...)` in `after()`, which wrote a
    // duplicate row with a different ID and cloned every message.
    const result = await handleInquiry({
      inquiry: body.inquiry,
      customerName: body.customerName || "Unknown",
      customerEmail: body.customerEmail || "",
      customerPhone: body.customerPhone,
      vehicle: body.vehicle,
      source: body.source || "platform",
      offerPrice: body.offerPrice || null,
      // Spec §6.6.2 point 1: "Within 10 minutes of receiving an inquiry".
      // Callers (platform webhooks, email poller) should pass the actual
      // receipt time so the SLA clock measures end-to-end delay.
      inquiryReceivedAt: body.inquiryReceivedAt || body.receivedAt || null,
    });

    return Response.json(result);
  } catch (error) {
    return Response.json({ error: `Response generation failed: ${error.message}` }, { status: 500 });
  }
}
