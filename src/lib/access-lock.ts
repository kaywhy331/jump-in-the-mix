import type { Prisma } from "@/generated/prisma/client";

// All admission paths take this transaction-scoped lock before reading eligibility.
// Low-volume launch traffic benefits from one simple gate, including schedule claims.
export async function lockAccess(tx: Prisma.TransactionClient): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(814733, 1)`;
}
