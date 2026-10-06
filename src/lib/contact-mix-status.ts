import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import type { ContactMixCounts, ContactMixFilter, ContactMixStatus } from "@/lib/contact-mix-status-labels";

export { bulkMixStartNotice, bulkMixUndoNotice, CONTACT_MIX_FILTERS, contactMixFilter, NO_MIX_NEEDED_NOTICE, noMixClearedNotice, noMixNeededNotice, noMixTodayLine, type ContactMixCounts, type ContactMixFilter, type ContactMixStatus, type MixStartCounts, type MixStartResult } from "@/lib/contact-mix-status-labels";

/**
 * Whether a person is in a Mix (JITM-09 §2.76, D33). One definition serves the Contacts row, filter and
 * count, the profile, Today and Journey, so they always agree.
 *
 * In a Mix: at least one Mix still has work to come for the person — a pending Beat, running or paused
 * Journey work, Beats a paused Mix holds for them, a Mix whose Beats for them are being prepared right now,
 * or a date-based Mix waiting for their next date. A paused Mix counts for all of its people (D45). One-time
 * follow-ups don't count, and neither does a finished or stopped Mix.
 * "No Mix needed" is the owner's confirmation; it lapses once any Mix starts or resumes for the person after it.
 */

/** The filter's id list stays well inside one statement's bind limit. */
export const MIX_FILTER_LIMIT = 30_000;

/**
 * Preparation still to run: the account's generate-jumps jobs that have neither completed nor failed
 * (src/worker/index.ts). Read once per statement, so each person's check looks only at these few rows.
 */
function preparingCte(workspaceId: string) {
  return Prisma.sql`WITH preparing AS MATERIALIZED (
    SELECT q.payload ->> 'contactId' AS "contactId", q.payload ->> 'mixId' AS "mixId" FROM "Job" q
    WHERE q."workspaceId" = ${workspaceId} AND q.task = 'generate-jumps' AND q."completedAt" IS NULL AND q."failedAt" IS NULL)`;
}

function inMixSql(workspaceId: string, now: Date) {
  const notStopped = (mix: Prisma.Sql) => Prisma.sql`NOT EXISTS (SELECT 1 FROM "MixStop" s WHERE s."workspaceId" = ${workspaceId} AND s."mixId" = ${mix} AND s."contactId" = c.id)`;
  const tagShown = Prisma.sql`NOT EXISTS (SELECT 1 FROM "ContactGroupState" gs WHERE gs."groupId" = a."groupId" AND gs."isActive" = false)`;
  // Being prepared (DEF-01): a job still to run covers this person and this Mix. A job that names both is
  // their own start, a restart included. A job for the whole Mix or the whole account (a save, a new tag
  // member) counts only for a Mix started by hand with a calendar-day Beat that has prepared nothing for
  // them yet: editing a Mix never makes someone who finished it read as in it again, and a date-based Mix
  // (counted by its dates below) or one that waits for a visit is never "being prepared" for everyone.
  const preparing = Prisma.sql`EXISTS (SELECT 1 FROM preparing p
    WHERE (p."contactId" IS NULL OR p."contactId" = c.id) AND (p."mixId" IS NULL OR p."mixId" = a."mixId")
      AND ((p."contactId" = c.id AND p."mixId" = a."mixId")
        OR (m."triggerMode" = 'MANUAL_START'
          AND EXISTS (SELECT 1 FROM "MixStep" st WHERE st."mixId" = a."mixId" AND st."isActive" AND st.anchor = 'CALENDAR_DAY')
          AND NOT EXISTS (SELECT 1 FROM "Jump" j WHERE j."workspaceId" = ${workspaceId} AND j."contactId" = c.id AND j."mixId" = a."mixId"))))`;
  // Still enrolled in the Mix: their own active assignment, or a shown tag the Mix runs for.
  const enrolled = (mix: Prisma.Sql) => Prisma.sql`(EXISTS (SELECT 1 FROM "MixAssignment" a
      WHERE a."workspaceId" = ${workspaceId} AND a."contactId" = c.id AND a."mixId" = ${mix} AND a."isActive")
    OR EXISTS (SELECT 1 FROM "ContactGroupMembership" gm
      JOIN "MixAssignment" a ON a."groupId" = gm."groupId" AND a."workspaceId" = ${workspaceId} AND a."mixId" = ${mix} AND a."isActive"
      WHERE gm."contactId" = c.id AND ${tagShown}))`;
  // Held by a pause (D45): a paused Mix's Beats wait as cancelled rows that resuming brings back. Pausing marks
  // the future ones mix_paused, the worker's next pass marks overdue ones reconciled, and holds that lifted
  // during the pause (Do not contact, archiving) keep their own reason until the Mix resumes. A row only
  // counts while its Beat is still in the Mix and nothing newer replaced it for the person, so an old row a
  // retimed Beat left behind never makes someone who finished the Mix read as in it.
  const heldByPause = Prisma.sql`EXISTS (SELECT 1 FROM "Jump" j JOIN "Mix" m ON m.id = j."mixId" JOIN "MixStep" st ON st.id = j."mixStepId"
    WHERE j."workspaceId" = ${workspaceId} AND j."contactId" = c.id AND j.status = 'CANCELED'
      AND j."completionMethod" IN ('mix_paused', 'reconciled', 'do_not_contact', 'contact_archived')
      AND m.status = 'PAUSED' AND m.source <> 'ONE_TIME' AND st."isActive"
      AND NOT EXISTS (SELECT 1 FROM "Jump" later WHERE later."workspaceId" = ${workspaceId} AND later."contactId" = c.id AND later."mixStepId" = j."mixStepId" AND later."createdAt" > j."createdAt")
      AND ${notStopped(Prisma.sql`j."mixId"`)} AND ${enrolled(Prisma.sql`j."mixId"`)})`;
  return Prisma.sql`(
    EXISTS (SELECT 1 FROM "Jump" j JOIN "Mix" m ON m.id = j."mixId"
      WHERE j."workspaceId" = ${workspaceId} AND j."contactId" = c.id AND j.status = 'PENDING' AND m.source <> 'ONE_TIME')
    OR EXISTS (SELECT 1 FROM "MixWorkflowInstance" w
      WHERE w."workspaceId" = ${workspaceId} AND w."contactId" = c.id AND w.status IN ('ACTIVE', 'PAUSED'))
    OR (EXISTS (SELECT 1 FROM "Mix" pm WHERE pm."workspaceId" = ${workspaceId} AND pm.status = 'PAUSED' AND pm.source <> 'ONE_TIME') AND ${heldByPause})
    OR (EXISTS (SELECT 1 FROM preparing) AND (
      EXISTS (SELECT 1 FROM "MixAssignment" a JOIN "Mix" m ON m.id = a."mixId"
        WHERE a."workspaceId" = ${workspaceId} AND a."contactId" = c.id AND a."isActive" AND m.status = 'ACTIVE' AND m.source <> 'ONE_TIME'
          AND ${notStopped(Prisma.sql`a."mixId"`)} AND ${preparing})
      OR EXISTS (SELECT 1 FROM "ContactGroupMembership" gm
        JOIN "MixAssignment" a ON a."groupId" = gm."groupId" AND a."workspaceId" = ${workspaceId} AND a."isActive"
        JOIN "Mix" m ON m.id = a."mixId"
        WHERE gm."contactId" = c.id AND m.status = 'ACTIVE' AND m.source <> 'ONE_TIME' AND ${tagShown} AND ${notStopped(Prisma.sql`a."mixId"`)} AND ${preparing})))
    OR EXISTS (SELECT 1 FROM "MixAssignment" a JOIN "Mix" m ON m.id = a."mixId"
      JOIN "JumpDate" d ON d."contactId" = c.id AND d."workspaceId" = ${workspaceId} AND d."dateTypeId" = m."dateTypeId" AND d."isActive"
      WHERE a."workspaceId" = ${workspaceId} AND a."isActive" AND m.status IN ('ACTIVE', 'PAUSED') AND m."triggerMode" = 'DATE_TRIGGERED' AND m.source <> 'ONE_TIME'
        AND (a."contactId" = c.id OR (a."groupId" IS NOT NULL AND ${tagShown} AND EXISTS (SELECT 1 FROM "ContactGroupMembership" gm WHERE gm."groupId" = a."groupId" AND gm."contactId" = c.id)))
        AND (d.recurrence <> 'NONE' OR d."dateValue" > ${now}) AND ${notStopped(Prisma.sql`a."mixId"`)})
  )`;
}

/**
 * The owner's confirmation counts only while no Mix work began or resumed for the person after it (D45).
 * It is set only while they have No Mix, so any Beat of theirs that was created, brought back from a hold
 * or done after it means they joined or rejoined a Mix: a resumed Mix restores its rows rather than
 * creating new ones. A done or skipped Beat counts by when it was settled, since merging contacts moves
 * settled rows without any new work; an appointment hold can be re-labelled while it waits, so it counts
 * only by when it was created.
 */
function noMixNeededSql(workspaceId: string) {
  return Prisma.sql`CASE WHEN rs."noMixNeededAt" IS NULL THEN false ELSE rs."noMixNeededAt" >= COALESCE(GREATEST(
    (SELECT max(GREATEST(j."createdAt", CASE WHEN j.status IN ('DONE', 'SKIPPED') THEN j."completedAt"
        WHEN left(j."completionMethod", 12) = 'appointment_' THEN NULL ELSE j."updatedAt" END))
      FROM "Jump" j JOIN "Mix" m ON m.id = j."mixId" WHERE j."workspaceId" = ${workspaceId} AND j."contactId" = c.id AND m.source <> 'ONE_TIME'),
    (SELECT max(w."createdAt") FROM "MixWorkflowInstance" w WHERE w."workspaceId" = ${workspaceId} AND w."contactId" = c.id)
  ), '-infinity'::timestamp) END`;
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
  const rows = await prisma.$queryRaw<Array<{ id: string; status: ContactMixStatus }>>(Prisma.sql`${preparingCte(workspaceId)}
    SELECT c.id, ${statusSql(workspaceId, now)} AS status ${contactsFrom(workspaceId)} AND c.id IN (${Prisma.join(ids)})`);
  return new Map(rows.map(row => [row.id, row.status]));
}

export async function contactMixStatus(workspaceId: string, contactId: string, now = new Date()): Promise<ContactMixStatus | null> {
  return (await contactMixStatuses(workspaceId, [contactId], now)).get(contactId) ?? null;
}

/** Ids of the workspace's people with one status, for the Contacts filter. */
export async function contactIdsWithMixStatus(workspaceId: string, status: ContactMixFilter, now = new Date()): Promise<string[]> {
  const rows = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`${preparingCte(workspaceId)}
    SELECT id FROM (SELECT c.id, ${statusSql(workspaceId, now)} AS status ${contactsFrom(workspaceId)}) people
    WHERE status = ${status} ORDER BY id LIMIT ${MIX_FILTER_LIMIT}`);
  return rows.map(row => row.id);
}

/**
 * How many of the workspace's people have each status. With `among`, only those people count: the
 * Contacts list passes the people its search and other filters show, so the counts match the list (D47).
 */
export async function contactMixCounts(workspaceId: string, now = new Date(), among?: string[]): Promise<ContactMixCounts> {
  const scope = among ? Prisma.sql`AND c.id = ANY(${among}::text[])` : Prisma.empty;
  const rows = await prisma.$queryRaw<Array<{ status: ContactMixStatus; count: bigint }>>(Prisma.sql`${preparingCte(workspaceId)}
    SELECT status, count(*) AS count FROM (SELECT ${statusSql(workspaceId, now)} AS status ${contactsFrom(workspaceId)} ${scope}) people GROUP BY status`);
  const counts: ContactMixCounts = { "in-mix": 0, "no-mix": 0, "no-mix-needed": 0, "do-not-contact": 0 };
  for (const row of rows) counts[row.status] = Number(row.count);
  return counts;
}
