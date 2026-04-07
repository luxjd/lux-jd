import { NextResponse } from "next/server";
import { validateCredentials, COOKIE_NAME } from "@/lib/auth";

export async function POST(request) {
  const { email, password } = await request.json();

  if (!validateCredentials(email, password)) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const response = NextResponse.json({ success: true });
  response.cookies.set(COOKIE_NAME, "authenticated", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7, // 7 days
  });

  return response;
}
