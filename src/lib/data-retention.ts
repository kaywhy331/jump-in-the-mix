import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { lockAccess } from "@/lib/access-lock";
import { lockStaff } from "@/lib/staff-access";
import { RETENTION_BATCH_SIZE, RETENTION_DAYS } from "@/lib/data-retention-policy";

const DAY = 24 * 60 * 60_000;
const before = (now: Date, days: number) => new Date(now.getTime() - days * DAY);
type Counts = Record<string, number>;

async function retainEmailData(now: Date, limit: number): Promise<Counts> {
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SET LOCAL statement_timeout = '15000ms'`;
    await lockAccess(tx);
    // Sending reserves capacity under this lock; provider receipts take Access
    // first. Never remove a reservation or retire a ledger across either path.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(814733, 4)`;
    const payloadBefore = before(now, RETENTION_DAYS.unusableInvitationPayload);
    const unusable = Prisma.sql`(
      (i.id IS NOT NULL AND (i."acceptedAt" IS NOT NULL OR i."revokedAt" IS NOT NULL)
        AND GREATEST(i."acceptedAt", i."revokedAt") < ${payloadBefore}) OR
      (s.id IS NOT NULL AND COALESCE(GREATEST(s."acceptedAt", s."revokedAt"), s."expiresAt") < ${payloadBefore})
    )`;
    const payloads = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      WITH selected AS (
        SELECT d.id FROM "WaitlistDelivery" d
        LEFT JOIN "ReferralAccessInvite" i ON i.id=d."inviteId"
        LEFT JOIN "StaffInvitation" s ON s.id=d."staffInvitationId"
        WHERE d."payloadPurgedAt" IS NULL AND d."updatedAt" < ${payloadBefore}
          AND d."generationStartedAt" < ${payloadBefore} AND d."leaseId" IS NULL AND d."lockedAt" IS NULL
          AND d.status IN ('SENT','CANCELED','QUEUED','REVIEW') AND ${unusable}
        ORDER BY d."updatedAt", d.id LIMIT ${limit} FOR UPDATE OF d SKIP LOCKED
      ) UPDATE "WaitlistDelivery" d SET "messageCiphertext"='', "payloadPurgedAt"=${now},
          status=CASE WHEN d.status='SENT' THEN 'SENT'::"WaitlistDeliveryStatus" ELSE 'CANCELED'::"WaitlistDeliveryStatus" END,
          "lastError"=NULL, "updatedAt"=${now}
        FROM selected WHERE d.id=selected.id RETURNING d.id`);
    const tokens = await tx.$queryRaw<Array<{ id: string }>>`
      WITH selected AS (
        SELECT id FROM "ReferralAccessInvite" WHERE "tokenPurgedAt" IS NULL AND "createdAt" < ${payloadBefore}
          AND ("acceptedAt" IS NOT NULL OR "revokedAt" IS NOT NULL) AND GREATEST("acceptedAt", "revokedAt") < ${payloadBefore}
        ORDER BY "createdAt", id LIMIT ${limit} FOR UPDATE SKIP LOCKED
      ) UPDATE "ReferralAccessInvite" i SET "tokenCiphertext"='', "tokenPurgedAt"=${now}
        FROM selected WHERE i.id=selected.id RETURNING i.id`;
    const detailsBefore = before(now, RETENTION_DAYS.emailDetails);
    const messages = await tx.$queryRaw<Array<{ id: string }>>`
      WITH selected AS (
        SELECT m.id FROM "EmailMessage" m WHERE m."detailsRetiredAt" IS NULL
          AND GREATEST(m."createdAt", m."firstAttemptAt", m."acceptedAt", m."deliveredAt", m."delayedAt", m."bouncedAt", m."complainedAt", m."suppressedAt", m."failedAt") < ${detailsBefore}
          AND NOT EXISTS (SELECT 1 FROM "EmailSendAttempt" a WHERE a."messageId"=m.id AND a."createdAt">=${detailsBefore})
          AND NOT EXISTS (
            SELECT 1 FROM (
              SELECT d.id FROM "WaitlistDelivery" d WHERE d."emailMessageId"=m.id
              UNION ALL SELECT h."deliveryId" FROM "InvitationDeliveryHistory" h WHERE h."emailMessageId"=m.id
            ) refs JOIN "WaitlistDelivery" d ON d.id=refs.id
              LEFT JOIN "ReferralAccessInvite" i ON i.id=d."inviteId"
              LEFT JOIN "StaffInvitation" s ON s.id=d."staffInvitationId"
            WHERE d.status IN ('QUEUED','SENDING','REVIEW')
              OR (i.id IS NOT NULL AND i."acceptedAt" IS NULL AND i."revokedAt" IS NULL)
              OR (s.id IS NOT NULL AND s."acceptedAt" IS NULL AND s."revokedAt" IS NULL AND s."expiresAt">${now})
          )
          AND NOT EXISTS (SELECT 1 FROM "SupportEmailDelivery" d WHERE d."emailMessageId"=m.id AND d.status IN ('QUEUED','SENDING','REVIEW'))
        ORDER BY m."createdAt", m.id LIMIT ${limit} FOR UPDATE OF m SKIP LOCKED
      ) UPDATE "EmailMessage" m SET "recipientHash"=NULL, "providerId"=NULL, "detailsRetiredAt"=${now}
        FROM selected WHERE m.id=selected.id RETURNING m.id`;
    const ids = messages.map(row => row.id);
    if (ids.length) {
      await tx.supportEmailDelivery.updateMany({ where: { emailMessageId: { in: ids } }, data: { providerId: null } });
      await tx.invitationDeliveryHistory.updateMany({ where: { emailMessageId: { in: ids } }, data: { providerId: null } });
      await tx.waitlistDelivery.updateMany({ where: { emailMessageId: { in: ids }, providerId: { not: null } }, data: { providerId: null } });
    }
    // Legacy records can have a provider reference without a retained ledger.
    // They still expire once their payload is unusable and the reference is old.
    const deliveryReferences = await tx.$executeRaw`
      UPDATE "WaitlistDelivery" SET "providerId"=NULL WHERE id IN (
        SELECT d.id FROM "WaitlistDelivery" d WHERE d."payloadPurgedAt" IS NOT NULL AND d."providerId" IS NOT NULL AND d."updatedAt" < ${detailsBefore}
          AND NOT EXISTS (SELECT 1 FROM "EmailMessage" m WHERE m.id=d."emailMessageId" AND m."detailsRetiredAt" IS NULL)
        ORDER BY d."updatedAt", d.id LIMIT ${limit}
      )`;
    const historyReferences = await tx.$executeRaw`
      UPDATE "InvitationDeliveryHistory" SET "providerId"=NULL WHERE id IN (
        SELECT h.id FROM "InvitationDeliveryHistory" h JOIN "WaitlistDelivery" d ON d.id=h."deliveryId"
        WHERE d."payloadPurgedAt" IS NOT NULL AND h."providerId" IS NOT NULL
          AND GREATEST(h."archivedAt", h."firstAttemptAt", h."generationStartedAt") < ${detailsBefore}
          AND NOT EXISTS (SELECT 1 FROM "EmailMessage" m WHERE m.id=h."emailMessageId" AND m."detailsRetiredAt" IS NULL)
        ORDER BY h."archivedAt", h.id LIMIT ${limit}
      )`;
    const events = await tx.$queryRaw<Array<{ id: string }>>`
      WITH selected AS (
        SELECT e.id FROM "EmailProviderEvent" e WHERE e."detailsRetiredAt" IS NULL AND e."receivedAt" < ${before(now, RETENTION_DAYS.providerDetails)}
          -- Uncertain acceptance may still need a provider lookup to associate
          -- this receipt. Keep that evidence while a matching ledger needs it.
          AND NOT EXISTS (SELECT 1 FROM "EmailMessage" m WHERE m."detailsRetiredAt" IS NULL
            AND (m."acceptedAt" IS NULL OR m."providerId" IS NULL) AND m."recipientHash"=ANY(e."recipientHashes"))
        ORDER BY e."receivedAt", e.id LIMIT ${limit} FOR UPDATE OF e SKIP LOCKED
      ) UPDATE "EmailProviderEvent" e SET "providerId"=NULL, "recipientHashes"=ARRAY[]::text[], "detailsRetiredAt"=${now}
        FROM selected WHERE e.id=selected.id RETURNING e.id`;
    const attempts = await tx.$executeRaw`
      DELETE FROM "EmailSendAttempt" WHERE id IN (
        SELECT id FROM "EmailSendAttempt" WHERE "createdAt" < ${before(now, RETENTION_DAYS.emailAttempts)} ORDER BY "createdAt", id LIMIT ${limit}
      )`;
    const unconfirmed = await tx.$executeRaw`
      DELETE FROM "WaitlistEntry" WHERE id IN (
        SELECT e.id FROM "WaitlistEntry" e WHERE e.status='WAITING' AND e."verifiedAt" IS NULL AND e."accessGrantedAt" IS NULL
          AND e."createdAt" < ${before(now, RETENTION_DAYS.unconfirmedWaitlist)} AND e."updatedAt" < ${before(now, RETENTION_DAYS.unconfirmedWaitlist)}
          AND NOT EXISTS (SELECT 1 FROM "VerificationToken" v WHERE v.email=e.email AND v.purpose='waitlist' AND v."usedAt" IS NULL AND v."expiresAt">${now})
          AND NOT EXISTS (SELECT 1 FROM "ReferralAccessInvite" i WHERE i."recipientEmail"=e.email AND i."acceptedAt" IS NULL AND i."revokedAt" IS NULL)
        ORDER BY e."createdAt", e.id LIMIT ${limit}
      )`;
    const verification = await tx.$executeRaw`
      DELETE FROM "VerificationToken" WHERE id IN (
        SELECT id FROM "VerificationToken" WHERE "expiresAt" < ${before(now, RETENTION_DAYS.expiredVerification)} ORDER BY "expiresAt", id LIMIT ${limit}
      )`;
    return { invitationPayloads: payloads.length, invitationTokens: tokens.length, emailDetails: messages.length, providerReferences: deliveryReferences + historyReferences, providerDetails: events.length, emailAttempts: attempts, unconfirmedWaitlist: unconfirmed, expiredVerification: verification };
  }, { timeout: 20_000 });
}

async function retainSupportData(now: Date, limit: number): Promise<Counts> {
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SET LOCAL statement_timeout = '15000ms'`;
    await lockStaff(tx);
    const cutoff = before(now, RETENTION_DAYS.completedSupport);
    const tickets = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT t.id FROM "SupportTicket" t WHERE t.status IN ('RESOLVED','CLOSED')
        AND t."lastActivityAt" < ${cutoff} AND t."updatedAt" < ${cutoff}
        AND GREATEST(t."resolvedAt", t."closedAt") < ${cutoff}
        AND NOT EXISTS (SELECT 1 FROM "SupportTicketMessage" m WHERE m."ticketId"=t.id AND (m."emailStatus"='PENDING' OR m."createdAt">=${cutoff}))
        AND NOT EXISTS (SELECT 1 FROM "SupportEmailDelivery" d JOIN "SupportTicketMessage" m ON m.id=d."messageId" WHERE m."ticketId"=t.id AND (d.status IN ('QUEUED','SENDING') OR GREATEST(d."createdAt",d."updatedAt")>=${cutoff}))
        AND NOT EXISTS (SELECT 1 FROM "AdminImpersonation" v WHERE v."ticketId"=t.id AND v."endedAt" IS NULL AND v."expiresAt">${now})
      ORDER BY t."lastActivityAt", t.id LIMIT ${limit} FOR UPDATE OF t SKIP LOCKED`;
    const ids = tickets.map(row => row.id);
    let messages = 0;
    if (ids.length) {
      messages = await tx.supportTicketMessage.count({ where: { ticketId: { in: ids } } });
      await tx.adminImpersonation.deleteMany({ where: { ticketId: { in: ids } } });
      await tx.supportTicket.deleteMany({ where: { id: { in: ids } } });
      await tx.platformAuditEvent.createMany({ data: ids.map(id => ({ action: "privacy.support.purge", entityType: "SupportTicket", entityId: id, afterData: { inactiveDays: RETENTION_DAYS.completedSupport } })) });
    }
    const views = await tx.$executeRaw`
      DELETE FROM "AdminImpersonation" WHERE id IN (
        SELECT id FROM "AdminImpersonation" WHERE "expiresAt" < ${before(now, RETENTION_DAYS.platformAudit)}
          AND "lastSeenAt" < ${before(now, RETENTION_DAYS.platformAudit)} ORDER BY "expiresAt", id LIMIT ${limit}
      )`;
    const audits = await tx.$executeRaw`
      DELETE FROM "PlatformAuditEvent" WHERE id IN (
        SELECT id FROM "PlatformAuditEvent" WHERE "createdAt" < ${before(now, RETENTION_DAYS.platformAudit)} ORDER BY "createdAt", id LIMIT ${limit}
      )`;
    return { supportConversations: ids.length, supportMessages: messages, expiredSupportViews: views, platformAudit: audits };
  }, { timeout: 20_000 });
}

// Separate, bounded transactions keep customer operations ahead of large
// backlogs. Only successful complete passes advance the visible checkpoint.
export async function runDataRetention(now = new Date(), limit = RETENTION_BATCH_SIZE): Promise<Counts> {
  if (!Number.isFinite(now.getTime()) || !Number.isSafeInteger(limit) || limit < 1 || limit > 500) throw new Error("Invalid data retention pass.");
  const startedAt = new Date();
  try {
    const counts = { ...await retainEmailData(now, limit), ...await retainSupportData(now, limit) };
    await prisma.$transaction(async tx => {
      const completedAt = new Date();
      await tx.dataRetentionState.upsert({ where: { id: "primary" }, create: { id: "primary", completedAt, counts }, update: { completedAt, failedAt: null, lastError: null, counts } });
      if (Object.values(counts).some(value => value > 0)) await tx.platformAuditEvent.create({ data: { action: "privacy.retention.complete", entityType: "DataRetentionState", entityId: "primary", afterData: counts } });
    });
    return counts;
  } catch {
    const failure = { failedAt: new Date(), lastError: "Data retention did not finish. The worker will retry." };
    await prisma.dataRetentionState.upsert({ where: { id: "primary" }, create: { id: "primary", ...failure }, update: {} }).catch(() => undefined);
    await prisma.dataRetentionState.updateMany({ where: { id: "primary", OR: [{ completedAt: null }, { completedAt: { lte: startedAt } }] }, data: failure }).catch(() => undefined);
    throw new Error(failure.lastError);
  }
}
