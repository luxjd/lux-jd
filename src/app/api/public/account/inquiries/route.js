import { parseSessionToken, findCustomerById, CUSTOMER_COOKIE } from "@/lib/customer-auth";
import { getAllLeads, getConversation } from "@/lib/agents/concierge/storage";

export async function GET(request) {
  const token = request.cookies.get(CUSTOMER_COOKIE)?.value;
  if (!token) return Response.json({ error: "Not authenticated" }, { status: 401 });

  const session = parseSessionToken(token);
  if (!session) return Response.json({ error: "Session expired" }, { status: 401 });

  const customer = await findCustomerById(session.id);
  if (!customer) return Response.json({ error: "Customer not found" }, { status: 401 });

  // Find leads matching this customer's email
  const allLeads = getAllLeads();
  const myLeads = (allLeads.leads || [])
    .filter((l) => l.email?.toLowerCase() === customer.email.toLowerCase())
    .map((l) => {
      const conv = getConversation(l.id);
      return {
        id: l.id,
        vehicle: l.vehicle,
        status: l.status,
        score: l.score,
        createdAt: l.createdAt,
        messages: (conv?.messages || []).map((m) => ({
          role: m.role,
          text: m.text,
          timestamp: m.timestamp,
        })),
        suggestedAction: l.suggestedAction,
        offerPrice: l.offerPrice,
      };
    });

  return Response.json({ inquiries: myLeads, count: myLeads.length });
}
