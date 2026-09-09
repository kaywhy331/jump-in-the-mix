import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { configuredReportExclusions, parseReportRange, type ReportRange } from "@/lib/admin-report-range";

export type SourceReport = { source: string; issued: number; accepted: number; activated: number; invitingMembers: number; providerAccepted: number; delivered: number; revoked: number; queued: number; review: number; medianJoinHours: number | null };
export type ReportData = {
  waitlist: { requested: number; confirmed: number; granted: number; joined: number; withdrawn: number; waitingNow: number; oldestWaitingDays: number | null };
  accounts: { created: number; verified: number; setup: number; withContact: number; withMix: number; activated: number; activeInRange: number; d7Eligible: number; d7Returned: number; d30Eligible: number; d30Returned: number };
  sources: SourceReport[];
  waves: Array<{ scheduledFor: string; releasedAt: string; fifo: number; random: number; retainedInvites: number; accepted: number; activated: number; providerAccepted: number; delivered: number; queued: number; review: number }>;
  library: Array<{ title: string; version: number | null; copies: number; completed: number; skipped: number; connected: number }>;
  daily: Array<{ day: string; accounts: number; requests: number; issued: number; accepted: number; active: number; completed: number; skipped: number; emailAttempts: number; emailFailures: number; jobFailures: number }>;
  operations: { queuedInvitations: number; invitationReviews: number; oldestInvitationHours: number | null; overdueJobs: number; failedJobs: number; databaseBytes: number; emailDayUsed: number; emailMonthUsed: number };
};

// Only aggregate columns leave PostgreSQL. Never select contact/message content,
// email addresses, session data or provider payloads into the report response.
export async function readAdminReport(range: ReportRange, completeDimensions = false): Promise<ReportData> {
  range = parseReportRange({ from: range.fromDay, through: range.throughDay }, range.asOf);
  const excludedIds = ["demo_user", ...configuredReportExclusions(process.env.REPORT_EXCLUDED_USER_IDS, "ids")];
  const excludedEmails = configuredReportExclusions(process.env.REPORT_EXCLUDED_EMAILS, "emails");
  const emailFilter = (column: Prisma.Sql) => excludedEmails.length ? Prisma.sql`AND lower(${column}) NOT IN (${Prisma.join(excludedEmails)})` : Prisma.empty;
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SET LOCAL TIME ZONE 'UTC'`;
    await tx.$executeRaw`SET LOCAL statement_timeout = '15000ms'`;
    const rows = await tx.$queryRaw<Array<{ report: ReportData }>>(Prisma.sql`
WITH bounds AS (
  SELECT ${range.from.toISOString()}::timestamptz AT TIME ZONE 'UTC' AS lo,
         ${range.until.toISOString()}::timestamptz AT TIME ZONE 'UTC' AS hi,
         ${range.asOf.toISOString()}::timestamptz AT TIME ZONE 'UTC' AS now
), excluded_users AS (
  SELECT u.id, lower(u.email) AS email FROM "User" u
  WHERE u.id IN (${Prisma.join(excludedIds)})
    ${excludedEmails.length ? Prisma.sql`OR lower(u.email) IN (${Prisma.join(excludedEmails)})` : Prisma.empty}
    OR (EXISTS (SELECT 1 FROM "StaffMembership" sm WHERE sm."userId"=u.id)
      AND NOT EXISTS (SELECT 1 FROM "Workspace" w WHERE w."ownerId"=u.id)
      AND NOT EXISTS (SELECT 1 FROM "WorkspaceMember" wm WHERE wm."userId"=u.id))
), customers AS (
  SELECT u.id, u."createdAt", u."emailVerifiedAt" FROM "User" u, bounds b
  WHERE u."createdAt" <= b.now AND NOT EXISTS (SELECT 1 FROM excluded_users x WHERE x.id=u.id)
), spaces AS (
  SELECT w.id, w."ownerId", COALESCE(p."onboardingDone", false) AS setup
  FROM "Workspace" w JOIN customers u ON u.id=w."ownerId" LEFT JOIN "WorkspaceProfile" p ON p."workspaceId"=w.id
), signals AS (
  SELECT w."ownerId" AS uid, e."jumpId", e."occurredAt" AS at, false AS completion
  FROM "JumpActionEvent" e JOIN spaces w ON w.id=e."workspaceId" AND w."ownerId"=e."actorUserId"
    JOIN "Jump" j ON j.id=e."jumpId" AND j."workspaceId"=w.id, bounds b
  WHERE e.action IN ('COPIED','COMPOSED','CALLED','VOICEMAIL_STARTED') AND e."occurredAt">=b.lo AND e."occurredAt"<=b.now
  UNION ALL
  SELECT w."ownerId", a."jumpId", a."occurredAt", a.outcome IN ('COMPLETED','CONNECTED','LEFT_VOICEMAIL','NO_ANSWER','WRONG_NUMBER','RESCHEDULED')
  FROM "ContactActivity" a JOIN spaces w ON w.id=a."workspaceId" AND w."ownerId"=a."actorUserId"
    JOIN "Jump" j ON j.id=a."jumpId" AND j."workspaceId"=w.id, bounds b
  WHERE a.kind='JUMP_OUTCOME' AND a.outcome IS NOT NULL AND a."occurredAt">=b.lo AND a."occurredAt"<=b.now
  UNION ALL
  SELECT w."ownerId", a."entityId", a."createdAt", a.action='jump.done'
  FROM "AuditLog" a JOIN spaces w ON w.id=a."workspaceId" AND w."ownerId"=a."actorUserId"
    JOIN "Jump" j ON j.id=a."entityId" AND j."workspaceId"=w.id, bounds b
  WHERE a."actorType"='USER' AND a."entityType"='Jump' AND a.action IN ('jump.done','jump.skipped','jump.reopen') AND a."createdAt">=b.lo AND a."createdAt"<=b.now
), activity_flags AS (
  SELECT u.id,
    COALESCE(bool_or(s.completion AND s.at>=u."createdAt"),false) AS completed,
    COALESCE(bool_or(s.at>=u."createdAt" AND s.at<u."createdAt"+interval '7 days'),false) AS first_week,
    COALESCE(bool_or(s.at>=u."createdAt"+interval '7 days' AND s.at<u."createdAt"+interval '8 days'),false) AS d7,
    COALESCE(bool_or(s.at>=u."createdAt"+interval '30 days' AND s.at<u."createdAt"+interval '31 days'),false) AS d30
  FROM customers u LEFT JOIN signals s ON s.uid=u.id GROUP BY u.id
), flags AS (
  SELECT u.*,
    EXISTS (SELECT 1 FROM spaces w WHERE w."ownerId"=u.id AND w.setup) AS setup,
    EXISTS (SELECT 1 FROM "Contact" c JOIN spaces w ON w.id=c."workspaceId" WHERE w."ownerId"=u.id AND c."createdAt"<=b.now) AS contact,
    EXISTS (SELECT 1 FROM "Mix" m JOIN spaces w ON w.id=m."workspaceId" WHERE w."ownerId"=u.id AND m."createdAt"<=b.now AND EXISTS (SELECT 1 FROM "MixStep" s WHERE s."mixId"=m.id)) AS mix,
    a.completed, a.first_week, a.d7, a.d30
  FROM customers u JOIN activity_flags a ON a.id=u.id CROSS JOIN bounds b
), entries AS (
  SELECT e.status, e."createdAt", e."verifiedAt", e."accessGrantedAt", e."joinedAt" FROM "WaitlistEntry" e, bounds b WHERE e."createdAt"<=b.now ${emailFilter(Prisma.sql`e.email`)}
    AND NOT EXISTS (SELECT 1 FROM excluded_users x WHERE x.email=lower(e.email))
), grants AS (
  SELECT i.id, i.source, i."createdAt", i."acceptedAt", i."revokedAt", i."inviterUserId", i."waveId",
    LEAST(em.accepted_at, i."lastSentAt") AS provider_accepted, em.delivered_at AS delivered,
    d.status AS delivery_status, COALESCE(f.setup AND f.completed, false) AS activated
  FROM "ReferralAccessInvite" i LEFT JOIN "WaitlistDelivery" d ON d."inviteId"=i.id
    -- A reviewed repeat keeps one grant. Retain receipts from every generation,
    -- including late events, without multiplying that grant's cohort counts.
    LEFT JOIN LATERAL (
      SELECT min(m."acceptedAt") AS accepted_at, min(m."deliveredAt") AS delivered_at
      FROM (
        SELECT d."emailMessageId" AS id
        UNION ALL
        SELECT h."emailMessageId" FROM "InvitationDeliveryHistory" h WHERE h."deliveryId"=d.id
      ) refs JOIN "EmailMessage" m ON m.id=refs.id
    ) em ON true LEFT JOIN flags f ON f.id=i."acceptedUserId", bounds b
  WHERE i."createdAt"<=b.now ${emailFilter(Prisma.sql`i."recipientEmail"`)}
    AND NOT EXISTS (SELECT 1 FROM excluded_users x WHERE x.id=i."inviterUserId" OR x.id=i."acceptedUserId" OR x.email=lower(i."recipientEmail"))
), source_totals AS (
  SELECT source::text AS source, count(*)::int AS issued,
    count(*) FILTER (WHERE "acceptedAt"<=b.now)::int AS accepted,
    count(*) FILTER (WHERE "acceptedAt"<=b.now AND activated)::int AS activated,
    count(DISTINCT "inviterUserId")::int AS "invitingMembers",
    count(*) FILTER (WHERE provider_accepted<=b.now)::int AS "providerAccepted",
    count(*) FILTER (WHERE delivered<=b.now)::int AS delivered,
    count(*) FILTER (WHERE "revokedAt"<=b.now)::int AS revoked,
    count(*) FILTER (WHERE delivery_status IN ('QUEUED','SENDING'))::int AS queued,
    count(*) FILTER (WHERE delivery_status='REVIEW')::int AS review,
    round((percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM ("acceptedAt"-g."createdAt"))/3600)
      FILTER (WHERE "acceptedAt"<=b.now AND "acceptedAt">=g."createdAt"))::numeric,1) AS "medianJoinHours"
  FROM grants g, bounds b WHERE g."createdAt">=b.lo AND g."createdAt"<b.hi GROUP BY source
), wave_totals AS (
  SELECT w."scheduledFor", w."createdAt" AS "releasedAt", w."fifoCount" AS fifo, w."randomCount" AS random,
    count(g.id)::int AS "retainedInvites", count(g.id) FILTER (WHERE g."acceptedAt"<=b.now)::int AS accepted,
    count(g.id) FILTER (WHERE g."acceptedAt"<=b.now AND g.activated)::int AS activated,
    count(g.id) FILTER (WHERE g.provider_accepted<=b.now)::int AS "providerAccepted",
    count(g.id) FILTER (WHERE g.delivered<=b.now)::int AS delivered,
    count(g.id) FILTER (WHERE g.delivery_status IN ('QUEUED','SENDING'))::int AS queued,
    count(g.id) FILTER (WHERE g.delivery_status='REVIEW')::int AS review
  FROM "WaitlistWave" w CROSS JOIN bounds b LEFT JOIN grants g ON g."waveId"=w.id
  WHERE w."createdAt">=b.lo AND w."createdAt"<b.hi AND w."createdAt"<=b.now
  GROUP BY w.id ORDER BY w."createdAt" DESC, w.id DESC LIMIT ${completeDimensions ? 5001 : 30}
), library_totals AS (
  SELECT s.id, COALESCE(r.snapshot->>'title', s.title) AS title, im."sharedMixVersion" AS version,
    count(DISTINCT i.id) FILTER (WHERE i."createdAt">=b.lo AND i."createdAt"<b.hi AND i."createdAt"<=b.now)::int AS copies,
    count(DISTINCT j.id) FILTER (WHERE j.status='DONE' AND j."completedAt">=b.lo AND j."completedAt"<b.hi AND j."completedAt"<=b.now)::int AS completed,
    count(DISTINCT j.id) FILTER (WHERE j.status='SKIPPED' AND j."completedAt">=b.lo AND j."completedAt"<b.hi AND j."completedAt"<=b.now)::int AS skipped,
    count(DISTINCT j.id) FILTER (WHERE EXISTS (SELECT 1 FROM "ContactActivity" a WHERE a."jumpId"=j.id AND a."workspaceId"=w.id AND a."actorUserId"=w."ownerId" AND a.kind='JUMP_OUTCOME' AND a.outcome='CONNECTED' AND a."occurredAt">=b.lo AND a."occurredAt"<b.hi AND a."occurredAt"<=b.now))::int AS connected
  FROM "SharedMixImport" i JOIN spaces w ON w.id=i."workspaceId" JOIN "SharedMix" s ON s.id=i."sharedMixId"
    LEFT JOIN "SharedMixImportMetadata" im ON im."importId"=i.id LEFT JOIN "SharedMixRevision" r ON r."sharedMixId"=s.id AND r.version=im."sharedMixVersion"
    LEFT JOIN "Jump" j ON j."mixId"=i."mixId" AND j."workspaceId"=w.id CROSS JOIN bounds b
  WHERE i."createdAt"<=b.now
  GROUP BY s.id, r.snapshot->>'title', im."sharedMixVersion"
), days AS (SELECT d::date AS day FROM bounds b, generate_series(b.lo, b.hi-interval '1 day', interval '1 day') d),
account_days AS (SELECT u."createdAt"::date AS day,count(*)::int n FROM customers u CROSS JOIN bounds b WHERE u."createdAt">=b.lo AND u."createdAt"<b.hi GROUP BY 1),
request_days AS (SELECT e."createdAt"::date AS day,count(*)::int n FROM entries e CROSS JOIN bounds b WHERE e."createdAt">=b.lo AND e."createdAt"<b.hi GROUP BY 1),
issued_days AS (SELECT g."createdAt"::date AS day,count(*)::int n FROM grants g CROSS JOIN bounds b WHERE g."createdAt">=b.lo AND g."createdAt"<b.hi GROUP BY 1),
accepted_days AS (SELECT g."acceptedAt"::date AS day,count(*)::int n FROM grants g CROSS JOIN bounds b WHERE g."acceptedAt">=b.lo AND g."acceptedAt"<b.hi AND g."acceptedAt"<=b.now GROUP BY 1),
activity_days AS (SELECT s.at::date AS day,count(DISTINCT s.uid)::int n FROM signals s CROSS JOIN bounds b WHERE s.at<b.hi GROUP BY 1),
completion_days AS (SELECT j."completedAt"::date AS day,count(*) FILTER (WHERE j.status='DONE')::int completed,count(*) FILTER (WHERE j.status='SKIPPED')::int skipped
  FROM "Jump" j JOIN spaces w ON w.id=j."workspaceId" CROSS JOIN bounds b WHERE j.status IN ('DONE','SKIPPED') AND j."completedAt">=b.lo AND j."completedAt"<b.hi AND j."completedAt"<=b.now GROUP BY 1),
attempt_days AS (SELECT a."createdAt"::date AS day,count(*)::int n FROM "EmailSendAttempt" a CROSS JOIN bounds b WHERE a."createdAt">=b.lo AND a."createdAt"<b.hi AND a."createdAt"<=b.now GROUP BY 1),
mail_failure_days AS (SELECT m."failedAt"::date AS day,count(*)::int n FROM "EmailMessage" m CROSS JOIN bounds b WHERE m."failedAt">=b.lo AND m."failedAt"<b.hi AND m."failedAt"<=b.now GROUP BY 1),
job_failure_days AS (SELECT j."failedAt"::date AS day,count(*)::int n FROM "Job" j CROSS JOIN bounds b WHERE j."failedAt">=b.lo AND j."failedAt"<b.hi AND j."failedAt"<=b.now GROUP BY 1),
daily AS (
  SELECT to_char(d.day,'YYYY-MM-DD') AS day,COALESCE(a.n,0) accounts,COALESCE(r.n,0) requests,COALESCE(i.n,0) issued,COALESCE(g.n,0) accepted,
    COALESCE(s.n,0) active,COALESCE(c.completed,0) completed,COALESCE(c.skipped,0) skipped,COALESCE(e.n,0) "emailAttempts",COALESCE(m.n,0) "emailFailures",COALESCE(j.n,0) "jobFailures"
  FROM days d LEFT JOIN account_days a USING(day) LEFT JOIN request_days r USING(day) LEFT JOIN issued_days i USING(day) LEFT JOIN accepted_days g USING(day)
    LEFT JOIN activity_days s USING(day) LEFT JOIN completion_days c USING(day) LEFT JOIN attempt_days e USING(day) LEFT JOIN mail_failure_days m USING(day) LEFT JOIN job_failure_days j USING(day)
  ORDER BY d.day
)
SELECT jsonb_build_object(
  'waitlist', (SELECT jsonb_build_object(
    'requested',count(*) FILTER (WHERE e."createdAt">=b.lo AND e."createdAt"<b.hi),
    'confirmed',count(*) FILTER (WHERE e."createdAt">=b.lo AND e."createdAt"<b.hi AND e."verifiedAt"<=b.now),
    'granted',count(*) FILTER (WHERE e."createdAt">=b.lo AND e."createdAt"<b.hi AND e."accessGrantedAt"<=b.now),
    'joined',count(*) FILTER (WHERE e."createdAt">=b.lo AND e."createdAt"<b.hi AND e."joinedAt"<=b.now),
    'withdrawn',count(*) FILTER (WHERE e."createdAt">=b.lo AND e."createdAt"<b.hi AND e.status='WITHDRAWN'),
    'waitingNow',count(*) FILTER (WHERE e.status='WAITING' AND e."verifiedAt"<=b.now),
    'oldestWaitingDays',floor(max(extract(epoch FROM (b.now-e."createdAt"))/86400) FILTER (WHERE e.status='WAITING' AND e."verifiedAt"<=b.now))) FROM entries e CROSS JOIN bounds b),
  'accounts', (SELECT jsonb_build_object('created',count(*), 'verified',count(*) FILTER (WHERE f."emailVerifiedAt"<=b.now),
    'setup',count(*) FILTER (WHERE f.setup), 'withContact',count(*) FILTER (WHERE f.contact), 'withMix',count(*) FILTER (WHERE f.mix),
    'activated',count(*) FILTER (WHERE f.setup AND f.completed),
    'activeInRange',(SELECT count(DISTINCT s.uid) FROM signals s CROSS JOIN bounds x WHERE s.at<x.hi),
    'd7Eligible',count(*) FILTER (WHERE f.first_week AND f."createdAt"+interval '8 days'<=b.now),
    'd7Returned',count(*) FILTER (WHERE f.first_week AND f.d7 AND f."createdAt"+interval '8 days'<=b.now),
    'd30Eligible',count(*) FILTER (WHERE f.first_week AND f."createdAt"+interval '31 days'<=b.now),
    'd30Returned',count(*) FILTER (WHERE f.first_week AND f.d30 AND f."createdAt"+interval '31 days'<=b.now))
    FROM flags f CROSS JOIN bounds b WHERE f."createdAt">=b.lo AND f."createdAt"<b.hi),
  'sources',COALESCE((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.source) FROM source_totals s),'[]'::jsonb),
  'waves',COALESCE((SELECT jsonb_agg(to_jsonb(w) ORDER BY w."releasedAt" DESC) FROM wave_totals w),'[]'::jsonb),
  'library',COALESCE((SELECT jsonb_agg(to_jsonb(l)-'id') FROM (SELECT * FROM library_totals WHERE copies+completed+skipped+connected>0 ORDER BY completed DESC,copies DESC,id,version NULLS LAST LIMIT ${completeDimensions ? 5001 : 20}) l),'[]'::jsonb),
  'daily',COALESCE((SELECT jsonb_agg(to_jsonb(d) ORDER BY d.day) FROM daily d),'[]'::jsonb),
  'operations',(SELECT jsonb_build_object(
    'queuedInvitations',(SELECT count(*) FROM "WaitlistDelivery" WHERE status IN ('QUEUED','SENDING')),
    'invitationReviews',(SELECT count(*) FROM "WaitlistDelivery" WHERE status='REVIEW'),
    'oldestInvitationHours',(SELECT floor(max(extract(epoch FROM (b.now-"createdAt"))/3600)) FROM "WaitlistDelivery" WHERE status IN ('QUEUED','SENDING')),
    'overdueJobs',(SELECT count(*) FROM "Job" WHERE "completedAt" IS NULL AND "failedAt" IS NULL AND "runAt"<=b.now),
    'failedJobs',(SELECT count(*) FROM "Job" WHERE "failedAt" IS NOT NULL),
    'databaseBytes',pg_database_size(current_database()),
    'emailDayUsed',(SELECT count(*) FROM "EmailSendAttempt" WHERE "createdAt">b.now-interval '24 hours' AND "createdAt"<=b.now),
    'emailMonthUsed',(SELECT count(*) FROM "EmailSendAttempt" WHERE "createdAt">b.now-interval '31 days' AND "createdAt"<=b.now)) FROM bounds b)
) AS report`);
    const report = rows[0].report;
    if (completeDimensions && (report.library.length > 5000 || report.waves.length > 5000)) throw new Error("Report dimensions exceed the bounded processing limit.");
    return report;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 20_000 });
}
export function reportEmailLimits() { return { day: env.emailDailyLimit, month: env.emailMonthlyLimit }; }
