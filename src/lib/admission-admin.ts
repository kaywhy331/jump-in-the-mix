import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { lockStaff } from "@/lib/staff-access";
import { lockAccess } from "@/lib/access-lock";
import { hasAdminPermission } from "@/lib/admin-permissions";
import { AdmissionError, getAdmissionPolicy, type AdmissionConfiguration } from "@/lib/admission";

export async function changeAdmissionPolicy(input: {
  actorUserId: string; actorSessionId: string; password: string; reason: string;
  expectedRevision: number; configuration: AdmissionConfiguration;
}) {
  const config = input.configuration, reason = input.reason.trim();
  if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0) throw new AdmissionError("Reload admission controls before saving.");
  if (reason.length < 10 || reason.length > 500) throw new AdmissionError("Give a reason between 10 and 500 characters.");
  if (![config.accountCeiling, config.outstandingCeiling].every(n => Number.isSafeInteger(n) && n >= 0 && n <= 1_000_000) || config.outstandingCeiling > config.accountCeiling) throw new AdmissionError("Use whole-number limits from 0 to 1,000,000. The outstanding invitation limit cannot exceed the total account limit.");
  if (![config.collectionPaused, config.grantsPaused, config.referralsPaused, config.redemptionPaused].every(value => typeof value === "boolean")) throw new AdmissionError("Choose valid pause controls.");
  // Explicit fields prevent runtime input from smuggling another ID or revision.
  const data = { accountCeiling: config.accountCeiling, outstandingCeiling: config.outstandingCeiling,
    collectionPaused: config.collectionPaused, grantsPaused: config.grantsPaused,
    referralsPaused: config.referralsPaused, redemptionPaused: config.redemptionPaused };
  return prisma.$transaction(async tx => {
    await lockStaff(tx); await lockAccess(tx);
    const now = new Date();
    const actor = await tx.user.findUnique({ where: { id: input.actorUserId }, select: { passwordHash: true, emailVerifiedAt: true, suspendedAt: true, staffMembership: true } });
    const session = await tx.session.findFirst({ where: { id: input.actorSessionId, userId: input.actorUserId, expiresAt: { gt: now } } });
    if (!session || !actor?.emailVerifiedAt || actor.suspendedAt || !hasAdminPermission(actor.staffMembership, "settings.manage")) throw new AdmissionError("Your current staff access does not allow admission changes.");
    if (env.requireAdminMfa && !await tx.adminMfaSession.findFirst({ where: { sessionId: session.id, userId: input.actorUserId, verifiedAt: { gte: new Date(now.getTime() - 10 * 60_000) }, expiresAt: { gt: now } } })) throw new AdmissionError("Verify your authenticator again before changing admission controls.", true);
    if (!actor.passwordHash || input.password.length > 72 || !await bcrypt.compare(input.password, actor.passwordHash)) throw new AdmissionError("Enter your current administrator password.");
    const current = await getAdmissionPolicy(tx);
    if (current.revision !== input.expectedRevision) throw new AdmissionError("Admission controls changed. Reload before saving.");
    const updated = await tx.admissionPolicy.upsert({ where: { id: "default" }, create: { id: "default", ...data, revision: 1 }, update: { ...data, revision: { increment: 1 } } });
    const { id: _id, updatedAt: _time, ...beforeData } = current;
    await tx.platformAuditEvent.create({ data: { actorUserId: input.actorUserId, action: "admission.policy.change", entityType: "AdmissionPolicy", entityId: "default", reason, beforeData, afterData: { ...data, revision: updated.revision } } });
    return updated;
  });
}
