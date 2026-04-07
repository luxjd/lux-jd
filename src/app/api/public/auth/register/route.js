import { NextResponse } from "next/server";
import { registerCustomer, createSessionToken, CUSTOMER_COOKIE } from "@/lib/customer-auth";

export async function POST(request) {
  const { name, email, phone, password } = await request.json();

  if (!name || !email || !password) {
    return Response.json({ error: "Name, email, and password are required" }, { status: 400 });
  }

  if (password.length < 6) {
    return Response.json({ error: "Password must be at least 6 characters" }, { status: 400 });
  }

  const result = await registerCustomer({ name, email, phone, password });

  if (result.error) {
    return Response.json({ error: result.error }, { status: 409 });
  }

  const token = createSessionToken(result.customer.id);
  const response = NextResponse.json({ success: true, customer: result.customer });
  response.cookies.set(CUSTOMER_COOKIE, token, {
    httpOnly: true, secure: process.env.NODE_ENV === "production", path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 7,
  });

  return response;
}
