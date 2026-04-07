/**
 * Public Inquiry API — customers submit inquiries about vehicles.
 * NO authentication required. Connects to Concierge Agent.
 */

import { handleInquiry } from "@/lib/agents/concierge/ai/concierge-orchestrator";
import { getListingById } from "@/lib/agents/listing/storage";
import { db } from "@/lib/db-storage";

export async function POST(request) {
  const body = await request.json();

  if (!body.message || !body.listingId) {
    return Response.json({ error: "Missing message or listingId" }, { status: 400 });
  }

  if (!body.name || !body.email) {
    return Response.json({ error: "Name and email are required" }, { status: 400 });
  }

  // Get vehicle data from listing
  const listing = getListingById(body.listingId);
  if (!listing) {
    return Response.json({ error: "Vehicle not found" }, { status: 404 });
  }

  const vehicle = {
    ...listing.vehicle,
    listingPrice: listing.currentPrice,
    currentPrice: listing.currentPrice,
    id: listing.vehicleId || listing.id,
    conditionNotes: "Excellent condition, meticulously maintained",
    specNotes: listing.content?.specification_sheet?.notable_options?.join(", ") || "",
  };

  try {
    const result = await handleInquiry({
      inquiry: body.message,
      customerName: body.name,
      customerEmail: body.email,
      customerPhone: body.phone || null,
      vehicle,
      source: "website",
      offerPrice: body.offerPrice ? parseFloat(body.offerPrice) : null,
    });

    // Save to PostgreSQL
    try {
      const dbLead = await db.leads.create({
        name: body.name,
        email: body.email,
        phone: body.phone || null,
        source: "website",
        status: result.lead?.status || "NEW",
        buyerType: result.classification?.buyerType || "UNKNOWN",
        score: result.classification?.score || 0,
        language: result.classification?.language || "EN",
        inquiryText: body.message,
        responseText: result.response?.response_text || null,
        offerPrice: body.offerPrice || null,
        escalated: result.escalation?.shouldEscalate || false,
        suggestedAction: result.response?.suggested_next_action || null,
      });
      if (dbLead) {
        await db.messages.create({ leadId: dbLead.id, role: "customer", text: body.message, source: "website" });
        if (result.response?.response_text) {
          await db.messages.create({ leadId: dbLead.id, role: "concierge", text: result.response.response_text, aiPowered: true });
        }
      }
    } catch (e) { console.warn("DB save inquiry failed:", e.message); }

    // Return only public-safe response
    return Response.json({
      success: true,
      response: result.response?.response_text || "Thank you for your inquiry. We will respond shortly.",
      nextAction: result.response?.suggested_next_action,
      responseTime: result.duration,
    });
  } catch (error) {
    return Response.json({
      success: true,
      response: "Thank you for your inquiry. Our team will get back to you within 10 minutes.",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
}
