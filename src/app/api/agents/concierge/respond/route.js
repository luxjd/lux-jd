import { handleInquiry } from "@/lib/agents/concierge/ai/concierge-orchestrator";
import { db } from "@/lib/db-storage";

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

    // Save lead + messages to PostgreSQL
    try {
      const dbLead = await db.leads.create({
        name: body.customerName || "Unknown",
        email: body.customerEmail || "",
        phone: body.customerPhone || null,
        source: body.source || "platform",
        status: result.lead?.status || "NEW",
        buyerType: result.classification?.buyerType || "UNKNOWN",
        score: result.classification?.score || 0,
        language: result.classification?.language || "DE",
        inquiryText: body.inquiry,
        responseText: result.response?.response_text || null,
        offerPrice: body.offerPrice || null,
        escalated: result.escalation?.shouldEscalate || false,
        escalationReason: result.escalation?.triggers?.map((t) => t.reason).join("; ") || null,
        suggestedAction: result.response?.suggested_next_action || null,
      });

      if (dbLead) {
        await db.messages.create({ leadId: dbLead.id, role: "customer", text: body.inquiry, source: body.source || "platform" });
        if (result.response?.response_text) {
          await db.messages.create({ leadId: dbLead.id, role: "concierge", text: result.response.response_text, aiPowered: true });
        }
      }
    } catch (e) { console.warn("DB save lead failed:", e.message); }

    return Response.json(result);
  } catch (error) {
    return Response.json({ error: `Response generation failed: ${error.message}` }, { status: 500 });
  }
}
