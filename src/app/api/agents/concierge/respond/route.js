import { handleInquiry } from "@/lib/agents/concierge/ai/concierge-orchestrator";

export async function POST(request) {
  const body = await request.json();

  if (!body.inquiry || !body.vehicle) {
    return Response.json({ error: "Missing inquiry text or vehicle data" }, { status: 400 });
  }

  try {
    const result = await handleInquiry({
      inquiry: body.inquiry,
      customerName: body.customerName || "Unknown",
      customerEmail: body.customerEmail || "",
      customerPhone: body.customerPhone,
      vehicle: body.vehicle,
      source: body.source || "platform",
      offerPrice: body.offerPrice || null,
    });

    return Response.json(result);
  } catch (error) {
    return Response.json({ error: `Response generation failed: ${error.message}` }, { status: 500 });
  }
}
