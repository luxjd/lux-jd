import { NextResponse } from "next/server";
import { authenticateCustomer, createSessionToken, CUSTOMER_COOKIE } from "@/lib/customer-auth";

export async function POST(request) {
  const { email, password } = await request.json();

  if (!email || !password) {
    return Response.json({ error: "Email and password are required" }, { status: 400 });
  }

  const customer = await authenticateCustomer(email, password);
  if (!customer) {
    return Response.json({ error: "Invalid email or password" }, { status: 401 });
  }

  const token = createSessionToken(customer.id);
  const response = NextResponse.json({ success: true, customer });
  response.cookies.set(CUSTOMER_COOKIE, token, {
    httpOnly: true, secure: process.env.NODE_ENV === "production", path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 7,
  });

  return response;
}
