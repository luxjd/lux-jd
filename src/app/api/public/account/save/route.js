import { parseSessionToken, findCustomerById, saveVehicle, unsaveVehicle, CUSTOMER_COOKIE } from "@/lib/customer-auth";

export async function POST(request) {
  const token = request.cookies.get(CUSTOMER_COOKIE)?.value;
  if (!token) return Response.json({ error: "Not authenticated" }, { status: 401 });
  const session = parseSessionToken(token);
  if (!session) return Response.json({ error: "Session expired" }, { status: 401 });

  const { listingId, action } = await request.json();
  if (!listingId) return Response.json({ error: "Missing listingId" }, { status: 400 });

  if (action === "unsave") {
    await unsaveVehicle(session.id, listingId);
  } else {
    await saveVehicle(session.id, listingId);
  }

  const customer = await findCustomerById(session.id);
  return Response.json({ success: true, savedVehicles: customer?.savedVehicles || [] });
}
