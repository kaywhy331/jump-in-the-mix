import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { lockStaff, staffSessionHasPermissions } from "@/lib/staff-access";
import { OPERATIONS_CHECKS, OPERATIONS_CODES, OPERATIONS_LEASE_MS, OPERATIONS_REMINDER_MS, OPERATIONS_NOTICE_MAX_AGE_MS, OPERATIONS_NOTICE_ATTEMPTS, severityRank, validateOperationsObservations, type OperationsCode, type OperationsObservation } from "@/lib/operations-policy";
import { operationsWebhook, postOperationsNotice } from "@/lib/operations-notifications";

export class OperationsReviewError extends Error {}
export async function lockOperations(tx: Prisma.TransactionClient) { await tx.$executeRaw`SELECT pg_advisory_xact_lock(814733, 6)`; }

export async function acquireOperationsMonitor(now = new Date(), db: PrismaClient = prisma) {
  return db.$transaction(async tx => {
    await lockOperations(tx);
    const prior = await tx.operationsMonitor.upsert({ where: { id: "primary" }, create: { id: "primary" }, update: {} });
    if (prior.leaseId && prior.leaseUntil && prior.leaseUntil > now) return null;
    const leaseId = randomUUID();
    await tx.operationsMonitor.update({ where: { id: "primary" }, data: { leaseId, leaseUntil: new Date(now.getTime() + OPERATIONS_LEASE_MS), startedAt: now, lastError: null } });
    return leaseId;
  });
}
export async function failOperationsMonitor(leaseId: string, db: PrismaClient = prisma, completedAt?: Date) {
  await db.operationsMonitor.updateMany({ where: { id: "primary", OR: [{ leaseId }, ...(completedAt ? [{ leaseId: null, observedAt: completedAt }] : [])] }, data: { leaseId: null, leaseUntil: null, lastError: "The independent monitor could not complete its checks." } });
}
export async function saveOperationsObservations(leaseId: string, observations: OperationsObservation[], now = new Date(), db: PrismaClient = prisma) {
  validateOperationsObservations(observations);
  return db.$transaction(async tx => {
    await lockOperations(tx);
    const monitor = await tx.operationsMonitor.findUnique({ where: { id: "primary" } });
    if (monitor?.leaseId !== leaseId || !monitor.leaseUntil || monitor.leaseUntil <= now || monitor.observedAt && monitor.observedAt >= now) throw new OperationsReviewError("The monitor lease expired or a newer observation exists.");
    await tx.operationsNotice.updateMany({ where: { status: { in: ["QUEUED", "SENDING"] }, createdAt: { lte: new Date(now.getTime() - OPERATIONS_NOTICE_MAX_AGE_MS) } }, data: { status: "FAILED", leaseId: null, lockedAt: null, lastError: "Operational notification expired before confirmed acceptance." } });
    await tx.operationsNotice.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - 90 * 24 * 3600_000) } } });
    let notices = 0;
    for (const observation of observations) {
      const prior = await tx.operationsCheck.findUnique({ where: { code: observation.code } });
      const opened = observation.state !== "OK" && (!prior || prior.state === "OK");
      const resolved = observation.state === "OK" && prior && prior.state !== "OK";
      const changed = prior && prior.state !== observation.state;
      const escalated = prior && severityRank(observation.state) > severityRank(prior.state);
      const reminder = !changed && prior && prior.state !== "OK" && !prior.acknowledgedAt && prior.nextReminderAt && prior.nextReminderAt <= now;
      const kind = opened ? "OPENED" : resolved ? "RESOLVED" : changed ? "CHANGED" : reminder ? "REMINDER" : null;
      const episode = (prior?.episode ?? 0) + (opened ? 1 : 0);
      const evidenceChanged = prior && Object.entries(observation.evidence).some(([key, value]) => (prior.evidence as Record<string, unknown>)[key] !== value);
      const clearAcknowledgment = opened || resolved || escalated;
      await tx.operationsCheck.upsert({ where: { code: observation.code }, create: { code: observation.code, state: observation.state, episode, evidence: observation.evidence, openedAt: opened ? now : null, observedAt: now, changedAt: now, nextReminderAt: opened ? new Date(now.getTime() + OPERATIONS_REMINDER_MS) : null }, update: {
        state: observation.state, episode, evidence: observation.evidence, observedAt: now,
        ...(changed || evidenceChanged ? { revision: { increment: 1 } } : {}),
        ...(changed ? { changedAt: now } : {}), ...(opened ? { openedAt: now, resolvedAt: null } : {}),
        ...(resolved ? { resolvedAt: now, nextReminderAt: null } : {}),
        ...(clearAcknowledgment ? { acknowledgedAt: null, acknowledgedBy: null } : {}),
        ...(kind && !resolved ? { nextReminderAt: new Date(now.getTime() + OPERATIONS_REMINDER_MS) } : {})
      } });
      if (!kind) continue;
      if (changed) await tx.operationsNotice.updateMany({ where: { code: observation.code, status: { in: ["QUEUED", "SENDING"] } }, data: { status: "CANCELED", leaseId: null, lockedAt: null } });
      const event = await tx.platformAuditEvent.create({ data: { action: `ops.check.${kind.toLowerCase()}`, entityType: "OperationsCheck", entityId: observation.code, beforeData: prior ? { state: prior.state, episode: prior.episode } : undefined, afterData: { state: observation.state, episode, evidence: observation.evidence }, createdAt: now }, select: { id: true } });
      // Don't announce a recovery when no warning was ever attempted. An uncertain
      // attempt may have reached the channel, so it still merits a recovery notice.
      const shouldNotify = resolved ? Boolean(await tx.operationsNotice.findFirst({ where: { code: observation.code, episode, attempts: { gt: 0 } }, select: { id: true } })) : !prior?.acknowledgedAt || opened || escalated;
      if (shouldNotify) {
        await tx.operationsNotice.create({ data: { id: event.id, code: observation.code, episode, kind, state: observation.state, evidence: observation.evidence, observedAt: now, nextAttemptAt: now, createdAt: now } });
        notices++;
      }
    }
    await tx.operationsMonitor.update({ where: { id: "primary" }, data: { observedAt: now, leaseId: null, leaseUntil: null, lastError: null } });
    return { notices };
  });
}

export async function acknowledgeOperationsCheck(input: { actorUserId: string; actorSessionId: string; code: string; expectedRevision: number; reason: string }) {
  const reason = input.reason.trim();
  if (!OPERATIONS_CODES.includes(input.code as OperationsCode) || !Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 1 || reason.length < 10 || reason.length > 500) throw new OperationsReviewError("Choose a current alert and give a reason of 10–500 characters.");
  return prisma.$transaction(async tx => {
    await lockStaff(tx); await lockOperations(tx);
    if (!await staffSessionHasPermissions(tx, { userId: input.actorUserId, sessionId: input.actorSessionId }, ["operations.read", "operations.manage"])) throw new OperationsReviewError("Your current staff session cannot acknowledge operational alerts.");
    const row = await tx.operationsCheck.findUnique({ where: { code: input.code } });
    if (!row || row.state === "OK" || row.acknowledgedAt || row.revision !== input.expectedRevision) throw new OperationsReviewError("This alert changed. Reload before acknowledging it.");
    await tx.operationsCheck.update({ where: { code: row.code }, data: { acknowledgedAt: new Date(), acknowledgedBy: input.actorUserId, revision: { increment: 1 } } });
    await tx.operationsNotice.updateMany({ where: { code: row.code, episode: row.episode, kind: { not: "RESOLVED" }, status: { in: ["QUEUED", "SENDING"] } }, data: { status: "CANCELED", leaseId: null, lockedAt: null } });
    await tx.platformAuditEvent.create({ data: { actorUserId: input.actorUserId, action: "ops.check.acknowledge", entityType: "OperationsCheck", entityId: row.code, reason, afterData: { state: row.state, episode: row.episode, stoppedReminders: true, resolved: false } } });
  });
}

export async function deliverOperationsNotices(now = new Date(), limit = 5, db: PrismaClient = prisma) {
  const destination = operationsWebhook();
  if (!destination) return { accepted: 0, configured: false };
  let accepted = 0;
  for (let index = 0; index < Math.max(0, Math.min(20, limit)); index++) {
    const notice = await db.$transaction(async tx => {
      await lockOperations(tx);
      const candidate = await tx.operationsNotice.findFirst({ where: { OR: [{ status: "QUEUED", nextAttemptAt: { lte: now } }, { status: "SENDING", lockedAt: { lte: new Date(now.getTime() - OPERATIONS_LEASE_MS) } }] }, orderBy: [{ nextAttemptAt: "asc" }, { id: "asc" }] });
      if (!candidate) return null;
      const check = await tx.operationsCheck.findUniqueOrThrow({ where: { code: candidate.code } });
      if (candidate.episode !== check.episode || candidate.state !== check.state || candidate.kind !== "RESOLVED" && check.acknowledgedAt) { await tx.operationsNotice.update({ where: { id: candidate.id }, data: { status: "CANCELED", leaseId: null, lockedAt: null } }); return { skipped: true } as const; }
      if (candidate.attempts >= OPERATIONS_NOTICE_ATTEMPTS || now.getTime() - candidate.createdAt.getTime() >= OPERATIONS_NOTICE_MAX_AGE_MS) { await tx.operationsNotice.update({ where: { id: candidate.id }, data: { status: "FAILED", leaseId: null, lockedAt: null, lastError: "Operational notification retry limit reached." } }); return { skipped: true } as const; }
      const leaseId = randomUUID();
      return tx.operationsNotice.update({ where: { id: candidate.id }, data: { status: "SENDING", leaseId, lockedAt: now, attempts: { increment: 1 } } });
    });
    if (!notice) break;
    if ("skipped" in notice) continue;
    const result = await postOperationsNotice(destination, { id: notice.id, code: notice.code as OperationsCode, kind: notice.kind, state: notice.state, observedAt: notice.observedAt.toISOString(), evidence: notice.evidence as Record<string, number | null> });
    await db.$transaction(async tx => {
      await lockOperations(tx);
      if (result.accepted) {
        await tx.operationsNotice.updateMany({ where: { id: notice.id, status: "SENDING", leaseId: notice.leaseId }, data: { status: "SENT", acceptedAt: new Date(), leaseId: null, lockedAt: null, lastError: null } });
        // The channel can accept while an operator acknowledges or a check recovers.
        await tx.operationsNotice.updateMany({ where: { id: notice.id, status: "CANCELED", acceptedAt: null }, data: { acceptedAt: new Date() } });
      } else {
        await tx.operationsNotice.updateMany({ where: { id: notice.id, status: "SENDING", leaseId: notice.leaseId }, data: { status: notice.attempts >= OPERATIONS_NOTICE_ATTEMPTS ? "FAILED" : "QUEUED", leaseId: null, lockedAt: null, nextAttemptAt: new Date(now.getTime() + Math.min(3600, 60 * 2 ** notice.attempts) * 1000), lastError: "The operational notification endpoint did not confirm acceptance." } });
      }
    });
    if (result.accepted) accepted++;
  }
  return { accepted, configured: true };
}
