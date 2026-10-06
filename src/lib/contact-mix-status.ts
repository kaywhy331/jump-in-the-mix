import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import type { ContactMixCounts, ContactMixFilter, ContactMixStatus } from "@/lib/contact-mix-status-labels";

export { CONTACT_MIX_FILTERS, contactMixFilter, noMixTodayLine, type ContactMixCounts, type ContactMixFilter, type ContactMixStatus } from "@/lib/contact-mix-status-labels";

/**
 * Whether a person is in a Mix (JITM-09 §2.76, D33). One definition serves the Contacts row, filter and
 * count, the profile, Today and Journey, so they always agree.
 *
 * In a Mix: at least one Mix still has work to come for the person — a pending Beat, running or paused
 * Journey work, a Mix started in the last day whose Beats are still being prepared, or a date-based Mix
 * waiting for their next date. One-time follow-ups don't count, and neither does a finished or stopped Mix.
 * "No Mix needed" is the owner's confirmation; it lapses once any Mix starts for the person after it.
 */

/** A Mix just started gets this long for its Beats to be prepared before the person reads as No Mix. */
export const PREPARATION_GRACE_MS = 86_400_000;
/** The filter's id list stays well inside one statement's bind limit. */
export const MIX_FILTER_LIMIT = 30_000;

function inMixSql(workspaceId: string, now: Date) {
  const since = new Date(now.getTime() - PREPARATION_GRACE_MS);
  const notStopped = (mix: Prisma.Sql) => Prisma.sql`NOT EXISTS (SELECT 1 FROM "MixStop" s WHERE s."workspaceId" = ${workspaceId} AND s."mixId" = ${mix} AND s."contactId" = c.id)`;
  const tagShown = Prisma.sql`NOT EXISTS (SELECT 1 FROM "ContactGroupState" gs WHERE gs."groupId" = a."groupId" AND gs."isActive" = false)`;
  return Prisma.sql`(
    EXISTS (SELECT 1 FROM "Jump" j JOIN "Mix" m ON m.id = j."mixId"
      WHERE j."workspaceId" = ${workspaceId} AND j."contactId" = c.id AND j.status = 'PENDING' AND m.source <> 'ONE_TIME')
    OR EXISTS (SELECT 1 FROM "MixWorkflowInstance" w
      WHERE w."workspaceId" = ${workspaceId} AND w."contactId" = c.id AND w.status IN ('ACTIVE', 'PAUSED'))
    OR EXISTS (SELECT 1 FROM "MixAssignment" a JOIN "Mix" m ON m.id = a."mixId"
      WHERE a."workspaceId" = ${workspaceId} AND a."contactId" = c.id AND a."isActive" AND m.status = 'ACTIVE' AND m.source <> 'ONE_TIME'
        AND a."updatedAt" > ${since} AND ${notStopped(Prisma.sql`a."mixId"`)}
        AND NOT EXISTS (SELECT 1 FROM "Jump" j WHERE j."workspaceId" = ${workspaceId} AND j."contactId" = c.id AND j."mixId" = a."mixId" AND j."createdAt" >= a."updatedAt"))
    OR EXISTS (SELECT 1 FROM "ContactGroupMembership" gm
      JOIN "MixAssignment" a ON a."groupId" = gm."groupId" AND a."workspaceId" = ${workspaceId} AND a."isActive"
      JOIN "Mix" m ON m.id = a."mixId"
      WHERE gm."contactId" = c.id AND gm."createdAt" > ${since} AND m.status = 'ACTIVE' AND m.source <> 'ONE_TIME' AND ${tagShown} AND ${notStopped(Prisma.sql`a."mixId"`)}
        AND NOT EXISTS (SELECT 1 FROM "Jump" j WHERE j."workspaceId" = ${workspaceId} AND j."contactId" = c.id AND j."mixId" = a."mixId" AND j."createdAt" >= gm."createdAt"))
    OR EXISTS (SELECT 1 FROM "MixAssignment" a JOIN "Mix" m ON m.id = a."mixId"
      JOIN "JumpDate" d ON d."contactId" = c.id AND d."workspaceId" = ${workspaceId} AND d."dateTypeId" = m."dateTypeId" AND d."isActive"
      WHERE a."workspaceId" = ${workspaceId} AND a."isActive" AND m.status = 'ACTIVE' AND m."triggerMode" = 'DATE_TRIGGERED' AND m.source <> 'ONE_TIME'
        AND (a."contactId" = c.id OR (a."groupId" IS NOT NULL AND ${tagShown} AND EXISTS (SELECT 1 FROM "ContactGroupMembership" gm WHERE gm."groupId" = a."groupId" AND gm."contactId" = c.id)))
        AND (d.recurrence <> 'NONE' OR d."dateValue" > ${now}) AND ${notStopped(Prisma.sql`a."mixId"`)})
  )`;
}

/** The owner's confirmation counts only if no Mix work began for the person after it. */
function noMixNeededSql(workspaceId: string) {
  return Prisma.sql`(rs."noMixNeededAt" IS NOT NULL AND rs."noMixNeededAt" >= COALESCE(GREATEST(
    (SELECT max(j."createdAt") FROM "Jump" j JOIN "Mix" m ON m.id = j."mixId" WHERE j."workspaceId" = ${workspaceId} AND j."contactId" = c.id AND m.source <> 'ONE_TIME'),
    (SELECT max(w."createdAt") FROM "MixWorkflowInstance" w WHERE w."workspaceId" = ${workspaceId} AND w."contactId" = c.id)
  ), '-infinity'::timestamp))`;
}

function statusSql(workspaceId: string, now: Date) {
  return Prisma.sql`CASE WHEN COALESCE(rs."doNotContact", false) THEN 'do-not-contact'
    WHEN ${inMixSql(workspaceId, now)} THEN 'in-mix'
    WHEN ${noMixNeededSql(workspaceId)} THEN 'no-mix-needed'
    ELSE 'no-mix' END`;
}

const contactsFrom = (workspaceId: string) => Prisma.sql`FROM "Contact" c LEFT JOIN "ContactRelationshipState" rs ON rs."contactId" = c.id AND rs."workspaceId" = c."workspaceId"
  WHERE c."workspaceId" = ${workspaceId} AND c."archivedAt" IS NULL`;

/** Each listed person's status; unknown, archived or other-workspace ids are left out. */
export async function contactMixStatuses(workspaceId: string, contactIds: string[], now = new Date()): Promise<Map<string, ContactMixStatus>> {
  const ids = [...new Set(contactIds)];
  if (!ids.length) return new Map();
  if (ids.length > 200) throw new Error("Read Mix status for at most one page of contacts.");
  const rows = await prisma.$queryRaw<Array<{ id: string; status: ContactMixStatus }>>(Prisma.sql`
    SELECT c.id, ${statusSql(workspaceId, now)} AS status ${contactsFrom(workspaceId)} AND c.id IN (${Prisma.join(ids)})`);
  return new Map(rows.map(row => [row.id, row.status]));
}

export async function contactMixStatus(workspaceId: string, contactId: string, now = new Date()): Promise<ContactMixStatus | null> {
  return (await contactMixStatuses(workspaceId, [contactId], now)).get(contactId) ?? null;
}

/** Ids of the workspace's people with one status, for the Contacts filter. */
export async function contactIdsWithMixStatus(workspaceId: string, status: ContactMixFilter, now = new Date()): Promise<string[]> {
  const rows = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT id FROM (SELECT c.id, ${statusSql(workspaceId, now)} AS status ${contactsFrom(workspaceId)}) people
    WHERE status = ${status} ORDER BY id LIMIT ${MIX_FILTER_LIMIT}`);
  return rows.map(row => row.id);
}

export async function contactMixCounts(workspaceId: string, now = new Date()): Promise<ContactMixCounts> {
  const rows = await prisma.$queryRaw<Array<{ status: ContactMixStatus; count: bigint }>>(Prisma.sql`
    SELECT status, count(*) AS count FROM (SELECT ${statusSql(workspaceId, now)} AS status ${contactsFrom(workspaceId)}) people GROUP BY status`);
  const counts: ContactMixCounts = { "in-mix": 0, "no-mix": 0, "no-mix-needed": 0, "do-not-contact": 0 };
  for (const row of rows) counts[row.status] = Number(row.count);
  return counts;
}
