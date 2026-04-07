/**
 * Customer Auth — simple cookie-based auth for car buyers.
 * Separate from admin auth (different cookie, different storage).
 *
 * Storage: PostgreSQL via Prisma (works on Vercel).
 */

import crypto from "crypto";
import { getDb } from "./db";

export const CUSTOMER_COOKIE = "luxjd-customer";

function hashPassword(password) {
  return crypto.createHash("sha256").update(password + "luxjd-salt-2026").digest("hex");
}

// ─── Accounts ───

export async function findCustomerByEmail(email) {
  const db = await getDb();
  if (!db) return null;
  return db.customer.findUnique({ where: { email: email.toLowerCase() } });
}

export async function findCustomerById(id) {
  const db = await getDb();
  if (!db) return null;
  return db.customer.findUnique({ where: { id } });
}

export async function registerCustomer({ name, email, phone, password }) {
  const db = await getDb();
  if (!db) return { error: "Database not available" };

  const existing = await db.customer.findUnique({ where: { email: email.toLowerCase() } });
  if (existing) {
    return { error: "Email already registered" };
  }

  const customer = await db.customer.create({
    data: {
      name,
      email: email.toLowerCase(),
      phone: phone || null,
      passwordHash: hashPassword(password),
      savedVehicles: [],
    },
  });

  const { passwordHash, ...safe } = customer;
  return { success: true, customer: safe };
}

export async function authenticateCustomer(email, password) {
  const customer = await findCustomerByEmail(email);
  if (!customer) return null;
  if (customer.passwordHash !== hashPassword(password)) return null;

  const { passwordHash, ...safe } = customer;
  return safe;
}

// ─── Session Token ───

export function createSessionToken(customerId) {
  return Buffer.from(JSON.stringify({ id: customerId, ts: Date.now() })).toString("base64");
}

export function parseSessionToken(token) {
  try {
    const decoded = JSON.parse(Buffer.from(token, "base64").toString("utf-8"));
    // Expire after 7 days
    if (Date.now() - decoded.ts > 7 * 24 * 60 * 60 * 1000) return null;
    return decoded;
  } catch {
    return null;
  }
}

// ─── Saved Vehicles ───

export async function saveVehicle(customerId, listingId) {
  const db = await getDb();
  if (!db) return false;

  const customer = await db.customer.findUnique({ where: { id: customerId } });
  if (!customer) return false;

  const saved = customer.savedVehicles || [];
  if (!saved.includes(listingId)) {
    await db.customer.update({
      where: { id: customerId },
      data: { savedVehicles: [...saved, listingId] },
    });
  }
  return true;
}

export async function unsaveVehicle(customerId, listingId) {
  const db = await getDb();
  if (!db) return false;

  const customer = await db.customer.findUnique({ where: { id: customerId } });
  if (!customer) return false;

  await db.customer.update({
    where: { id: customerId },
    data: { savedVehicles: (customer.savedVehicles || []).filter((id) => id !== listingId) },
  });
  return true;
}
