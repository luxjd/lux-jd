import { getAllLeads, getLeadById, getConversation, updateLeadStatus } from "@/lib/agents/concierge/storage";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const leadId = searchParams.get("leadId");

  if (leadId) {
    const lead = await getLeadById(leadId);
    const conv = await getConversation(leadId);
    return Response.json({ lead, messages: conv.messages || [] });
  }

  const data = await getAllLeads();
  let leads = data.leads || [];
  if (status && status !== "ALL") leads = leads.filter((l) => l.status === status);

  return Response.json({ leads, count: leads.length, updatedAt: data.updatedAt });
}

export async function PUT(request) {
  const body = await request.json();
  if (!body.leadId || !body.status) return Response.json({ error: "Missing leadId or status" }, { status: 400 });

  const lead = await updateLeadStatus(body.leadId, body.status);
  if (!lead) return Response.json({ error: "Lead not found" }, { status: 404 });
  return Response.json({ success: true, lead });
}
