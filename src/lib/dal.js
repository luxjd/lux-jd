import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { cache } from "react";

import { COOKIE_NAME, decryptSession } from "@/lib/session";

export const verifySession = cache(async () => {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  const payload = await decryptSession(token);
  if (!payload?.authed) return null;
  return { email: payload.email, exp: payload.exp };
});

export async function requireSession() {
  const session = await verifySession();
  if (!session) redirect("/login");
  return session;
}

export async function requireAuth() {
  const session = await verifySession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return session;
}
