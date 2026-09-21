import { createHash } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import type { QuietDayPage } from "@/lib/quiet-day-types";

type Reader = Pick<Prisma.TransactionClient, "$queryRaw" | "workspacePreference">;
type Input = { workspaceId: string; timezone: string; query?: string; page?: number; contactId?: string; now?: Date };
const cycleFor = (contactId: string, baseline: Date, days: number, timezone: string) => createHash("sha256").update(`${contactId}:${baseline.toISOString()}:${days}:${timezone}`).digest("hex");

/** Read current facts rather than generate synthetic follow-ups or persist stale pending reminders. */
export async function readQuietDays(input: Input, db: Reader = prisma): Promise<QuietDayPage> {
  const { workspaceId, timezone } = input;
  const preference = await db.workspacePreference.findUnique({ where: { workspaceId }, select: { quietDaysEnabled: true, quietDays: true } });
  const days = preference?.quietDays ?? 60;
  const empty = { enabled: preference?.quietDaysEnabled ?? false, days, total: 0, stageIds: [], page: 1, pages: 1, items: [] };
  if (!empty.enabled) return empty;
  const now = input.now ?? new Date();
  const page = Math.max(1, Math.min(1_000_000, Math.floor(input.page ?? 1) || 1));
  const query = input.query?.trim().slice(0, 160).replace(/[\\%_]/g, "\\$&");
  const rows = await db.$queryRaw<Array<{ id: string | null; name: string | null; stage: string | null; baseline: Date | null; dueDate: string | null; nextJumpId: string | null; total: number; stageIds: string[] | null; page: number }>>(Prisma.sql`
    WITH candidates AS (
      SELECT c.id, c."displayName" AS name, cj."stageId", s.name AS stage,
        GREATEST(c."createdAt",
          (SELECT MAX(j."completedAt") FROM "Jump" j WHERE j."workspaceId" = ${workspaceId} AND j."contactId" = c.id AND j.status = 'DONE' AND j."completedAt" <= ${now}),
          (SELECT MAX(a."occurredAt") FROM "ContactActivity" a WHERE a."workspaceId" = ${workspaceId} AND a."contactId" = c.id AND a."occurredAt" <= ${now} AND (
            (a.kind IN ('CUSTOMER_NOTE', 'PRIVATE_UPDATE') AND a.metadata->>'conversation' = 'true') OR
            (a.kind = 'SYSTEM' AND a.metadata->>'quietDayResolution' IN ('COMPLETED', 'SKIPPED')))),
          (SELECT MAX(e."occurredAt") FROM "JourneyEvent" e WHERE e."workspaceId" = ${workspaceId} AND e."contactId" = c.id AND e."occurredAt" <= ${now} AND e."eventType" = 'CONVERSATION_STARTED' AND e."eventKey" NOT LIKE 'call:%'),
          (SELECT MAX(e."outcomeAt") FROM "CalendarEntry" e WHERE e."workspaceId" = ${workspaceId} AND e."contactId" = c.id AND e.outcome = 'COMPLETED' AND e."canceledAt" IS NULL AND e."outcomeAt" <= ${now})
        ) AS baseline
      FROM "Contact" c
      LEFT JOIN "ContactJourney" cj ON cj."contactId" = c.id AND cj."workspaceId" = ${workspaceId}
      LEFT JOIN "JourneyStage" s ON s.id = cj."stageId" AND s."workspaceId" = ${workspaceId} AND s."isActive" = true
      WHERE c."workspaceId" = ${workspaceId} AND c."archivedAt" IS NULL
        AND NOT EXISTS (SELECT 1 FROM "ContactRelationshipState" r WHERE r."workspaceId" = ${workspaceId} AND r."contactId" = c.id AND r."doNotContact" = true)
        ${input.contactId ? Prisma.sql`AND c.id = ${input.contactId}` : Prisma.empty}
        ${query ? Prisma.sql`AND c."displayName" ILIKE ${`%${query}%`}` : Prisma.empty}
    ), due AS (
      SELECT *, (((baseline AT TIME ZONE 'UTC') AT TIME ZONE ${timezone})::date + ${days}::int) AS "dueDay" FROM candidates
      WHERE (((baseline AT TIME ZONE 'UTC') AT TIME ZONE ${timezone})::date + ${days}::int) <= ((${now.toISOString()}::timestamptz AT TIME ZONE ${timezone})::date)
    ), stats AS (
      SELECT COUNT(*)::int AS total, ARRAY_AGG(DISTINCT "stageId") FILTER (WHERE stage IS NOT NULL) AS "stageIds",
        LEAST(${page}::int, GREATEST(1, CEIL(COUNT(*)::numeric / 20)::int)) AS page FROM due
    )
    SELECT p.*, stats.total, stats."stageIds", stats.page FROM stats LEFT JOIN LATERAL (
      SELECT d.id, d.name, d.stage, d.baseline, TO_CHAR(d."dueDay", 'YYYY-MM-DD') AS "dueDate",
        (SELECT j.id FROM "Jump" j WHERE j."workspaceId" = ${workspaceId} AND j."contactId" = d.id AND j.status = 'PENDING' ORDER BY j."scheduledAt", j.id LIMIT 1) AS "nextJumpId"
      FROM due d ORDER BY d.baseline, d.name, d.id LIMIT 20 OFFSET ((stats.page - 1) * 20)
    ) p ON true
  `);
  const stats = rows[0];
  return { enabled: true, days, total: stats.total, stageIds: stats.stageIds ?? [], page: stats.page, pages: Math.max(1, Math.ceil(stats.total / 20)), items: rows.flatMap(row => row.id && row.baseline ? [{ contactId: row.id, name: row.name!, stage: row.stage, dueDate: row.dueDate!, cycle: cycleFor(row.id, row.baseline, days, timezone), nextJumpId: row.nextJumpId }] : []) };
}

export class QuietDayError extends Error {}
export async function resolveQuietDay(input: { workspaceId: string; userId: string; timezone: string; contactId: string; cycle: string; resolution: "COMPLETED" | "SKIPPED"; now?: Date }) {
  if (!/^[a-f0-9]{64}$/.test(input.cycle) || !["COMPLETED", "SKIPPED"].includes(input.resolution)) throw new QuietDayError("Choose an available check-in and an outcome.");
  const { workspaceId, contactId, userId } = input;
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "Workspace" WHERE id = ${workspaceId} FOR NO KEY UPDATE`;
    const key = `quiet-day:${contactId}:${input.cycle}`;
    // A duplicate resolution must not extend the quiet period, even after another period has passed.
    const existing = await tx.contactActivity.findFirst({ where: { workspaceId, contactId, kind: "SYSTEM", metadata: { path: ["quietDayCycle"], equals: input.cycle } }, select: { id: true } });
    if (existing) return { resolved: true, repeated: true };
    const current = await readQuietDays({ workspaceId, timezone: input.timezone, contactId, now: input.now }, tx);
    if (!current.enabled || current.items[0]?.cycle !== input.cycle) return { resolved: false, stale: true };
    await tx.contactActivity.create({ data: { workspaceId, contactId, actorUserId: userId, kind: "SYSTEM", occurredAt: input.now ?? new Date(), summary: input.resolution === "SKIPPED" ? `Skipped the quiet-day check-in. Suggest again after ${current.days} quiet days.` : `Completed the quiet-day check-in. Suggest again after ${current.days} quiet days.`, metadata: { quietDayCycle: input.cycle, quietDayResolution: input.resolution, days: current.days } } });
    await tx.auditLog.create({ data: { workspaceId, actorUserId: userId, actorType: "USER", action: "quiet-day.resolve", entityType: "Contact", entityId: contactId, source: "quiet-days", metadata: { resolution: input.resolution, key } } });
    return { resolved: true, repeated: false };
  });
}
