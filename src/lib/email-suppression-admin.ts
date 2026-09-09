import { createHash } from "node:crypto";
import bcrypt from "bcryptjs";
import type { EmailSuppression, Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { hasAdminPermission } from "@/lib/admin-permissions";
import { lockStaff } from "@/lib/staff-access";
import { lockAccess } from "@/lib/access-lock";
import { emailRecipientHash } from "@/lib/email-budget";

export class EmailReviewError extends Error {
  constructor(message: string, public readonly needsMfa = false) { super(message); }
}
type Actor = { actorUserId: string; actorSessionId: string };

export function suppressionReviewState(rows: Pick<EmailSuppression, "id" | "revision" | "clearedAt">[]) {
  return createHash("sha256").update(JSON.stringify(rows.map(row => [row.id, row.revision, row.clearedAt?.toISOString() ?? null]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))))).digest("hex");
}

export async function assertEmailReviewer(tx: Prisma.TransactionClient, actor: Actor, password?: string) {
  const now = new Date();
  const user = await tx.user.findUnique({ where: { id: actor.actorUserId }, select: { passwordHash: true, suspendedAt: true, emailVerifiedAt: true, staffMembership: true } });
  const session = await tx.session.findFirst({ where: { id: actor.actorSessionId, userId: actor.actorUserId, expiresAt: { gt: now } }, select: { id: true } });
  if (!session || !user?.emailVerifiedAt || user.suspendedAt || !hasAdminPermission(user.staffMembership, "email.manage")) throw new EmailReviewError("Your current staff session cannot review email recovery.");
  if (env.requireAdminMfa && (!await tx.adminMfaCredential.findFirst({ where: { userId: actor.actorUserId, enabledAt: { not: null } }, select: { userId: true } }) || !await tx.adminMfaSession.findFirst({ where: { userId: actor.actorUserId, sessionId: session.id, expiresAt: { gt: now }, ...(password !== undefined ? { verifiedAt: { gte: new Date(now.getTime() - 10 * 60_000) } } : {}) }, select: { sessionId: true } }))) throw new EmailReviewError("Verify your authenticator again before continuing email recovery.", true);
  if (password !== undefined && (!user.passwordHash || password.length > 72 || !await bcrypt.compare(password, user.passwordHash))) throw new EmailReviewError("Enter your current administrator password.");
}

export async function clearRecipientSuppression(input: Actor & {
  suppressionId: string; expectedState: string; password: string; reason: string;
  providerReference: string; requestReference: string; providerReviewed: boolean; recipientRequested: boolean;
}) {
  const reason = input.reason.trim(), providerReference = input.providerReference.trim(), requestReference = input.requestReference.trim();
  if (!input.suppressionId || input.suppressionId.length > 100 || !/^[a-f0-9]{64}$/.test(input.expectedState)) throw new EmailReviewError("Reload the recipient review before saving.");
  if (reason.length < 10 || reason.length > 500 || providerReference.length < 5 || providerReference.length > 200 || requestReference.length < 5 || requestReference.length > 200) throw new EmailReviewError("Add a reason of 10–500 characters and short references for the provider review and recipient request.");
  if (input.providerReviewed !== true || input.recipientRequested !== true) throw new EmailReviewError("Confirm the provider review and the recipient’s request before clearing the local block.");
  return prisma.$transaction(async tx => {
    await lockStaff(tx); await lockAccess(tx); await assertEmailReviewer(tx, input, input.password);
    const selected = await tx.emailSuppression.findUnique({ where: { id: input.suppressionId }, select: { email: true } });
    if (!selected) throw new EmailReviewError("This suppression record is unavailable.");
    const rows = await tx.emailSuppression.findMany({ where: { email: selected.email } });
    if (suppressionReviewState(rows) !== input.expectedState) throw new EmailReviewError("The recipient’s suppression changed. Reload and review the latest records.");
    const active = rows.filter(row => !row.clearedAt && row.reason !== "INVITATION_OPTOUT");
    if (!active.length) throw new EmailReviewError("There are no provider blocks to clear. Only the recipient can reverse an invitation opt-out.");
    const clearedAt = new Date();
    // Preserve all facts and revoked grants. Rejoining needs a new email proof;
    // essential account mail can resume, subject to provider rules and budgets.
    await tx.emailSuppression.updateMany({ where: { id: { in: active.map(row => row.id) }, clearedAt: null }, data: { clearedAt, revision: { increment: 1 } } });
    await tx.platformAuditEvent.create({ data: {
      actorUserId: input.actorUserId, action: "email.suppression.clear", entityType: "EmailRecipient", entityId: emailRecipientHash(selected.email), reason,
      beforeData: { records: active.map(row => ({ id: row.id, reason: row.reason, revision: row.revision })) },
      afterData: { clearedAt: clearedAt.toISOString(), providerReference, requestReference, providerReviewed: true, recipientRequested: true, invitationOptoutRemains: rows.some(row => row.reason === "INVITATION_OPTOUT" && !row.clearedAt) }
    } });
    return { cleared: active.length };
  });
}
