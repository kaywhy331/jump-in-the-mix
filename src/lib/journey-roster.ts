import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import type { JourneyDueFilter, journeyDates } from "@/lib/journey-view";

/** Page the entire roster by the next pending follow-up, not just each alphabetical page. */
export async function journeyRosterIds(input: {
  workspaceId: string; stageId?: string; mixId?: string; query: string;
  due: JourneyDueFilter; dates: ReturnType<typeof journeyDates>; page: number;
}) {
  const { workspaceId, stageId, mixId, query, due, dates, page } = input;
  const membership = stageId
    ? Prisma.sql`EXISTS (SELECT 1 FROM "ContactJourney" cj WHERE cj."contactId" = c.id AND cj."workspaceId" = ${workspaceId} AND cj."stageId" = ${stageId})`
    : mixId ? Prisma.sql`(EXISTS (SELECT 1 FROM "MixAssignment" ma WHERE ma."workspaceId" = ${workspaceId} AND ma."mixId" = ${mixId} AND ma."isActive" = true AND (ma."contactId" = c.id OR EXISTS (SELECT 1 FROM "ContactGroupMembership" gm JOIN "Group" g ON g.id = gm."groupId" WHERE gm."contactId" = c.id AND gm."groupId" = ma."groupId" AND g."workspaceId" = ${workspaceId}))) OR EXISTS (SELECT 1 FROM "Jump" j WHERE j."contactId" = c.id AND j."workspaceId" = ${workspaceId} AND j."mixId" = ${mixId} AND j.status = 'PENDING'))`
    : Prisma.sql`EXISTS (SELECT 1 FROM "ContactJourney" cj JOIN "JourneyStage" s ON s.id = cj."stageId" WHERE cj."contactId" = c.id AND cj."workspaceId" = ${workspaceId} AND s."isActive" = true)`;
  const timing = due === "late" ? Prisma.sql`n.at < ${dates.start}`
    : due === "today" ? Prisma.sql`n.at >= ${dates.start} AND n.at < ${dates.tomorrow}`
    : due === "week" ? Prisma.sql`n.at >= ${dates.tomorrow} AND n.at < ${dates.week}`
    : due === "later" ? Prisma.sql`n.at >= ${dates.week}`
    : due === "quiet" ? Prisma.sql`n.at IS NULL` : Prisma.sql`true`;
  return prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT c.id FROM "Contact" c
    LEFT JOIN LATERAL (SELECT MIN(j."scheduledAt") AS at FROM "Jump" j
      WHERE j."workspaceId" = ${workspaceId} AND j."contactId" = c.id AND j.status = 'PENDING'
      ${mixId ? Prisma.sql`AND j."mixId" = ${mixId}` : Prisma.empty}) n ON true
    WHERE c."workspaceId" = ${workspaceId} AND c."archivedAt" IS NULL AND ${membership} AND (${timing})
      ${query ? Prisma.sql`AND c."displayName" ILIKE ${`%${query}%`}` : Prisma.empty}
    ORDER BY n.at ASC NULLS LAST, c."displayName" ASC, c.id ASC
    LIMIT 50 OFFSET ${(page - 1) * 50}`);
}
