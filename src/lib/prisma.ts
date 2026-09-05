import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
const configuredConnectionString = process.env.DATABASE_URL?.trim() || process.env.NETLIFY_DB_URL?.trim();
if (!configuredConnectionString && process.env.NODE_ENV === "production") {
  throw new Error("DATABASE_URL is required in production.");
}
const connectionString = configuredConnectionString ?? "postgresql://jitm:jitm@localhost:5432/jitm?schema=public";

const adapter = new PrismaPg({ connectionString });

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"]
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
