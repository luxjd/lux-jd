import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

import { validateCredentials } from "@/lib/auth";
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import {
  COOKIE_NAME,
  encryptSession,
  sessionCookieOptions,
} from "@/lib/session";

const LoginSchema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(1).max(200),
});

export async function POST(request) {
  const ip = getClientIp(request);
  const limited = rateLimit({ key: `login:${ip}`, limit: 5, windowMs: 15 * 60 * 1000 });
  if (!limited.ok) {
    return NextResponse.json(
      { error: "Too many attempts. Try again later." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((limited.resetAt - Date.now()) / 1000)) } }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const parsed = LoginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 400 });
  }

  let user;
  try {
    user = validateCredentials(parsed.data.email, parsed.data.password);
  } catch (err) {
    console.error("Auth config error:", err.message);
    return NextResponse.json({ error: "Authentication not configured" }, { status: 503 });
  }

  if (!user) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

  const token = await encryptSession({ authed: true, email: user.email });
  const store = await cookies();
  store.set(COOKIE_NAME, token, sessionCookieOptions());

  return NextResponse.json({ success: true, email: user.email });
}
