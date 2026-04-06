/**
 * Database Service — Prisma 7 + pg adapter for AWS RDS PostgreSQL.
 */

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const globalForPrisma = globalThis;
let _checked = false;

function isRealUrl() {
  const url = process.env.DATABASE_URL;
  return !!url && !url.includes("placeholder") && url.includes("rds.amazonaws.com");
}

export function isDbAvailable() {
  return isRealUrl();
}

export async function getDb() {
  if (!isRealUrl()) return null;
  if (globalForPrisma.__prisma) return globalForPrisma.__prisma;
  if (_checked) return null;
  _checked = true;

  try {
    // Strip sslmode from connection string (we handle SSL separately)
    const connStr = process.env.DATABASE_URL.replace(/[?&]sslmode=[^&]*/g, "");
    const pool = new pg.Pool({
      connectionString: connStr,
      ssl: { rejectUnauthorized: false },
    });
    const adapter = new PrismaPg(pool);
    const prisma = new PrismaClient({ adapter });
    globalForPrisma.__prisma = prisma;
    return prisma;
  } catch (e) {
    console.warn("Prisma connection failed, using JSON fallback:", e.message);
    return null;
  }
}
