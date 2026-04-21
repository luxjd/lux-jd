/**
 * Session management — signed JWTs via jose.
 *
 * Edge-compatible: no Node-only imports (Prisma, bcrypt). Usable from proxy.js.
 * The JWT payload carries only operator id + role + expiry — no PII, no secrets.
 */

import { SignJWT, jwtVerify } from "jose";

export const COOKIE_NAME = "luxjd-session";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

function getSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "SESSION_SECRET must be set to a 32+ character random string. Generate with: openssl rand -base64 32"
    );
  }
  return new TextEncoder().encode(secret);
}

export async function encryptSession(payload) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(getSecret());
}

export async function decryptSession(token) {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret(), {
      algorithms: ["HS256"],
    });
    return payload;
  } catch {
    return null;
  }
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  };
}
