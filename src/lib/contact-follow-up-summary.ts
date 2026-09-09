import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

type Summary = { contactId: string; lastInteraction: Date | null; nextJump: Date | null };

/** A contacts page needs two dates per person, irrespective of history size. */
export async function contactFollowUpSummary(workspaceId: string, contactIds: string[]) {
  const ids = [...new Set(contactIds)];
  if (ids.length > 50) throw new Error("Read follow-up summaries for at most one contacts page.");
  if (!ids.length) return new Map<string, Summary>();
  const rows = await prisma.$queryRaw<Summary[]>(Prisma.sql`
    SELECT "contactId", max("completedAt") AS "lastInteraction",
      min("scheduledAt") FILTER (WHERE status = 'PENDING') AS "nextJump"
    FROM "Jump"
    WHERE "workspaceId" = ${workspaceId} AND "contactId" IN (${Prisma.join(ids)}) AND status <> 'CANCELED'
    GROUP BY "contactId"
  `);
  return new Map(rows.map(row => [row.contactId, row]));
}
