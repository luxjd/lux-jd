/**
 * Hardcoded credential validation — reads from env, never from source.
 *
 * Only one operator. Env vars AUTH_EMAIL + AUTH_PASSWORD are the source of
 * truth. Session cookies are still signed JWTs (see session.js) so they
 * cannot be forged client-side.
 */

export { COOKIE_NAME } from "@/lib/session";

function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const aBytes = new TextEncoder().encode(a);
  const bBytes = new TextEncoder().encode(b);
  if (aBytes.length !== bBytes.length) {
    // Still run the full comparison against a length-matched buffer so the
    // branch timing doesn't leak length info.
    let diff = aBytes.length ^ bBytes.length;
    const len = Math.max(aBytes.length, bBytes.length);
    for (let i = 0; i < len; i++) {
      diff |= (aBytes[i] ?? 0) ^ (bBytes[i] ?? 0);
    }
    return diff === 0;
  }
  let diff = 0;
  for (let i = 0; i < aBytes.length; i++) diff |= aBytes[i] ^ bBytes[i];
  return diff === 0;
}

/**
 * Returns { email } on success, null on failure.
 */
export function validateCredentials(email, password) {
  if (typeof email !== "string" || typeof password !== "string") return null;

  const expectedEmail = (process.env.AUTH_EMAIL || "").trim().toLowerCase();
  const expectedPassword = process.env.AUTH_PASSWORD || "";

  if (!expectedEmail || !expectedPassword) {
    throw new Error("AUTH_EMAIL and AUTH_PASSWORD must be set in the environment.");
  }

  const emailOk = timingSafeEqual(email.trim().toLowerCase(), expectedEmail);
  const passwordOk = timingSafeEqual(password, expectedPassword);

  return emailOk && passwordOk ? { email: expectedEmail } : null;
}
