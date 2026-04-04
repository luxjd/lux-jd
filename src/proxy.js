import { NextResponse } from "next/server";

const PROTECTED_PATHS = [
  "/dashboard",
  "/pipeline",
  "/opportunities",
  "/listings",
  "/finance",
  "/leads",
  "/settings",
];

export function proxy(request) {
  const { pathname } = request.nextUrl;
  const session = request.cookies.get("luxjd-session");

  const isProtected = PROTECTED_PATHS.some((p) => pathname.startsWith(p));

  if (isProtected && !session) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (pathname === "/login" && session) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|hero).*)"],
};
