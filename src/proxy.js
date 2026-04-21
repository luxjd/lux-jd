import { NextResponse } from "next/server";

import { COOKIE_NAME, decryptSession } from "@/lib/session";

const PROTECTED_PAGE_PREFIXES = [
  "/dashboard",
  "/pipeline",
  "/opportunities",
  "/listings",
  "/finance",
  "/leads",
  "/notifications",
  "/settings",
  "/agents",
];

const PUBLIC_API_PREFIXES = ["/api/auth/"];

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
};

function applySecurityHeaders(response) {
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(key, value);
  }
  return response;
}

export async function proxy(request) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(COOKIE_NAME)?.value;
  const session = await decryptSession(token);
  const authed = !!session?.authed;

  const isApi = pathname.startsWith("/api/");
  const isPublicApi = PUBLIC_API_PREFIXES.some((p) => pathname.startsWith(p));
  const isProtectedPage = PROTECTED_PAGE_PREFIXES.some((p) =>
    pathname === p || pathname.startsWith(`${p}/`)
  );

  if (isApi && !isPublicApi && !authed) {
    return applySecurityHeaders(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    );
  }

  if (isProtectedPage && !authed) {
    const url = new URL("/login", request.url);
    url.searchParams.set("next", pathname);
    return applySecurityHeaders(NextResponse.redirect(url));
  }

  if (pathname === "/login" && authed) {
    return applySecurityHeaders(
      NextResponse.redirect(new URL("/dashboard", request.url))
    );
  }

  return applySecurityHeaders(NextResponse.next());
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|hero).*)"],
};
