import { NextResponse } from "next/server";
import { parseSessionToken, findCustomerById, CUSTOMER_COOKIE } from "@/lib/customer-auth";

export async function GET(request) {
  const token = request.cookies.get(CUSTOMER_COOKIE)?.value;
  if (!token) return Response.json({ authenticated: false }, { status: 401 });

  const session = parseSessionToken(token);
  if (!session) return Response.json({ authenticated: false }, { status: 401 });

  const customer = await findCustomerById(session.id);
  if (!customer) return Response.json({ authenticated: false }, { status: 401 });

  const { passwordHash, ...safe } = customer;
  return Response.json({ authenticated: true, customer: safe });
}

export async function DELETE(request) {
  const response = NextResponse.json({ success: true });
  response.cookies.delete(CUSTOMER_COOKIE);
  return response;
}
