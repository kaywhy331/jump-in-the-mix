import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import type { ContactMixCounts, ContactMixFilter, ContactMixStatus } from "@/lib/contact-mix-status-labels";

export { bulkMixStartNotice, bulkMixUndoNotice, CONTACT_MIX_FILTERS, contactMixFilter, NO_MIX_NEEDED_NOTICE, noMixClearedNotice, noMixNeededNotice, noMixTodayLine, type ContactMixCounts, type ContactMixFilter, type ContactMixStatus, type MixStartCounts, type MixStartResult } from "@/lib/contact-mix-status-labels";

/**
 * Whether a person is in a Mix (JITM-09 §2.76, D33). One definition serves the Contacts row, filter and
 * count, the profile, Today and Journey, so they always agree.
 *
 * In a Mix: at least one Mix still has work to come for the person — a pending Beat, Journey work that is
 * still waiting on something, Beats a paused Mix holds for them, a Mix whose Beats for them are being
 * prepared right now, or a date-based Mix waiting for their next date. A paused Mix counts for all of its
 * people (D45). One-time follow-ups don't count, and neither does a finished or stopped Mix. A Journey record
 * counts only through its follow-ups and its real waiting state, never by its status alone (JRN-01).
 * "No Mix needed" is the owner's confirmation; it lapses once any Mix starts or resumes for the person after it.
 */

/** The filter's id list stays well inside one statement's bind limit. */
export const MIX_FILTER_LIMIT = 30_000;

/**
 * Preparation still to run: the account's generate-jumps jobs that have neither completed nor failed
 * (src/worker/index.ts). Read once per statement, so each person's check looks only at these few rows.
 * A bulk start queues one job for its Mix that also lists the people it started (`contactIds`).
 */
function preparingCte(workspaceId: string) {
  return Prisma.sql`WITH preparing AS MATERIALIZED (
    SELECT q.payload ->> 'contactId' AS "contactId", q.payload -> 'contactIds' AS "contactIds", q.payload ->> 'mixId' AS "mixId" FROM "Job" q
    WHERE q."workspaceId" = ${workspaceId} AND q.task = 'generate-jumps' AND q."completedAt" IS NULL AND q."failedAt" IS NULL)`;
}

/** Cancellation reasons a pause leaves on rows that resuming brings back (src/lib/jump-engine.ts, src/lib/mix-workflow.ts). */
const PAUSE_HELD_METHODS = ["mix_paused", "reconciled", "workflow_held", "do_not_contact", "contact_archived"];

/** One array from a Journey record's saved state, or an empty one: a record can start as `{}`. */
const stateArray = (key: string) => Prisma.sql`(CASE WHEN jsonb_typeof(w.state -> ${key}::text) = 'array' THEN w.state -> ${key}::text ELSE '[]'::jsonb END)`;

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
      AND ((p."mixId" = a."mixId" AND (p."contactId" = c.id OR p."contactIds" @> jsonb_build_array(c.id)))
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
  // the future ones mix_paused, the worker's next pass marks overdue ones reconciled (or workflow_held, when the
  // Journey pass reaches them first), and holds that lifted during the pause (Do not contact, archiving) keep
  // their own reason until the Mix resumes. A row only counts while its Beat is still in the Mix and nothing
  // newer replaced it for the person, so an old row a retimed Beat left behind never makes someone who
  // finished the Mix read as in it.
  const heldByPause = Prisma.sql`EXISTS (SELECT 1 FROM "Jump" j JOIN "Mix" m ON m.id = j."mixId" JOIN "MixStep" st ON st.id = j."mixStepId"
    WHERE j."workspaceId" = ${workspaceId} AND j."contactId" = c.id AND j.status = 'CANCELED'
      AND j."completionMethod" IN (${Prisma.join(PAUSE_HELD_METHODS)})
      AND m.status = 'PAUSED' AND m.source <> 'ONE_TIME' AND st."isActive"
      AND NOT EXISTS (SELECT 1 FROM "Jump" later WHERE later."workspaceId" = ${workspaceId} AND later."contactId" = c.id AND later."mixStepId" = j."mixStepId" AND later."createdAt" > j."createdAt")
      AND ${notStopped(Prisma.sql`j."mixId"`)} AND ${enrolled(Prisma.sql`j."mixId"`)})`;
  // Also held by a pause: someone enrolled in a paused Mix started by hand, with a calendar-day Beat, that has
  // prepared nothing for them yet, because they joined its tag during the pause or were started just before
  // it. The scheduler skips a paused Mix, so their Beats come when it resumes (PAUSE-01).
  const unpreparedInPause = Prisma.sql`EXISTS (SELECT 1 FROM "Mix" m WHERE m."workspaceId" = ${workspaceId} AND m.status = 'PAUSED' AND m."triggerMode" = 'MANUAL_START' AND m.source <> 'ONE_TIME'
      AND EXISTS (SELECT 1 FROM "MixStep" st WHERE st."mixId" = m.id AND st."isActive" AND st.anchor = 'CALENDAR_DAY')
      AND ${notStopped(Prisma.sql`m.id`)} AND ${enrolled(Prisma.sql`m.id`)}
      AND NOT EXISTS (SELECT 1 FROM "Jump" j WHERE j."workspaceId" = ${workspaceId} AND j."contactId" = c.id AND j."mixId" = m.id))`;
  // A Mix the person can still get work from: running or paused (D45), and not stopped for them.
  const mixOpen = (mix: Prisma.Sql) => Prisma.sql`(EXISTS (SELECT 1 FROM "Mix" om WHERE om.id = ${mix} AND om."workspaceId" = ${workspaceId}
    AND om.status IN ('ACTIVE', 'PAUSED') AND om.source <> 'ONE_TIME') AND ${notStopped(mix)})`;
  // Journey work (JRN-01). In an account with any Journey connection, every Mix start also gets a Journey record,
  // and that record stays ACTIVE after the person is stopped, removed or undone, or the Mix is archived, and
  // for a moment after its last Beat is done (its state is brought up to date by a job about ten seconds
  // later). So a record never counts by its status or by Beats its saved state still shows as open. It counts
  // through its follow-ups: a pending one is already counted above, and one cancelled by a pause counts here
  // (D45). Otherwise it counts only for real waiting state with no follow-up yet: a decision waiting for the
  // owner, a path waiting to start another Mix, an open check-back date, or a choice being applied. Each of
  // those needs its Mixes still open to the person; a Mix that finished, was archived or was stopped for them
  // has nothing left to wait for.
  const journeyWork = Prisma.sql`EXISTS (SELECT 1 FROM "MixWorkflowInstance" w
    WHERE w."workspaceId" = ${workspaceId} AND w."contactId" = c.id AND w.status IN ('ACTIVE', 'PAUSED') AND (
      EXISTS (SELECT 1 FROM "Jump" j WHERE j."workspaceId" = ${workspaceId} AND j."workflowInstanceId" = w.id AND j.status = 'CANCELED' AND (
        (j."workflowManaged" AND j."completionMethod" IN (${Prisma.join(PAUSE_HELD_METHODS)})
          AND EXISTS (SELECT 1 FROM "Mix" pm WHERE pm.id = j."mixId" AND pm.status = 'PAUSED') AND ${notStopped(Prisma.sql`j."mixId"`)})
        OR (w.status = 'PAUSED' AND j."completionMethod" = 'workflow_held' AND ${mixOpen(Prisma.sql`j."mixId"`)}
          AND (j."workflowManaged" OR ${enrolled(Prisma.sql`j."mixId"`)}))))
      OR EXISTS (SELECT 1 FROM jsonb_array_elements(${stateArray("evaluations")}) e
        JOIN jsonb_array_elements(${stateArray("runs")}) r ON r ->> 'id' = e ->> 'runId'
        WHERE e ->> 'status' = 'WAITING' AND r ->> 'status' <> 'CANCELED' AND ${mixOpen(Prisma.sql`r ->> 'mixId'`)})
      OR EXISTS (SELECT 1 FROM jsonb_array_elements(${stateArray("transitions")}) t
        JOIN jsonb_array_elements(${stateArray("evaluations")}) e ON e ->> 'id' = t ->> 'evaluationId'
        JOIN jsonb_array_elements(${stateArray("runs")}) r ON r ->> 'id' = e ->> 'runId'
        WHERE t ->> 'status' IN ('WAITING', 'HELD') AND e ->> 'status' <> 'CANCELED' AND jsonb_typeof(t -> 'target') = 'object'
          AND ${mixOpen(Prisma.sql`t -> 'target' ->> 'mixId'`)} AND ${mixOpen(Prisma.sql`r ->> 'mixId'`)})
      OR EXISTS (SELECT 1 FROM jsonb_array_elements(${stateArray("commitments")}) k
        JOIN jsonb_array_elements(${stateArray("runs")}) r ON r ->> 'id' = k ->> 'runId'
        WHERE k ->> 'status' = 'OPEN' AND ${mixOpen(Prisma.sql`r ->> 'mixId'`)})
      OR jsonb_array_length(${stateArray("pendingChoices")}) > 0
      OR jsonb_typeof(w.state -> 'pendingBusinessUpdate') = 'object'))`;
  return Prisma.sql`(
    EXISTS (SELECT 1 FROM "Jump" j JOIN "Mix" m ON m.id = j."mixId"
      WHERE j."workspaceId" = ${workspaceId} AND j."contactId" = c.id AND j.status = 'PENDING' AND m.source <> 'ONE_TIME')
    OR ${journeyWork}
    OR (EXISTS (SELECT 1 FROM "Mix" pm WHERE pm."workspaceId" = ${workspaceId} AND pm.status = 'PAUSED' AND pm.source <> 'ONE_TIME') AND (${heldByPause} OR ${unpreparedInPause}))
    OR (EXISTS (SELECT 1 FROM preparing) AND (
      EXISTS (SELECT 1 FROM "MixAssignment" a JOIN "Mix" m ON m.id = a."mixId"
        WHERE a."workspaceId" = ${workspaceId} AND a."contactId" = c.id AND a."isActive" AND m.status = 'ACTIVE' AND m.source <> 'ONE_TIME'
          AND ${notStopped(Prisma.sql`a."mixId"`)} AND ${preparing})
      OR EXISTS (SELECT 1 FROM "ContactGroupMembership" gm
        JOIN "MixAssignment" a ON a."groupId" = gm."groupId" AND a."workspaceId" = ${workspaceId} AND a."isActive"
        JOIN "Mix" m ON m.id = a."mixId"
        WHERE gm."contactId" = c.id AND m.status = 'ACTIVE' AND m.source <> 'ONE_TIME' AND ${tagShown} AND ${notStopped(Prisma.sql`a."mixId"`)} AND ${preparing})))
    OR EXISTS (SELECT 1 FROM "JumpDate" d JOIN "Mix" m ON m."workspaceId" = ${workspaceId} AND m."dateTypeId" = d."dateTypeId"
      WHERE d."workspaceId" = ${workspaceId} AND d."contactId" = c.id AND d."isActive" AND (d.recurrence <> 'NONE' OR d."dateValue" > ${now})
        AND m.status IN ('ACTIVE', 'PAUSED') AND m."triggerMode" = 'DATE_TRIGGERED' AND m.source <> 'ONE_TIME'
        AND ${notStopped(Prisma.sql`m.id`)} AND ${enrolled(Prisma.sql`m.id`)})
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
