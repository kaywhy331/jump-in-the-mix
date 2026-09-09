import bcrypt from "bcryptjs";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { lockStaff } from "@/lib/staff-access";
import { hasAdminPermission } from "@/lib/admin-permissions";
import { SystemMixError, validateSystemMixContent, type SystemMixContent } from "@/lib/system-mix";
import { lockSystemMix, systemMixState } from "@/lib/system-mix-store";

type Actor = { actorUserId: string; actorSessionId: string; reason: string; expectedRevision: number };
async function authorize(tx: Prisma.TransactionClient, input: Actor, password?: string) {
  const now = new Date();
  if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0) throw new SystemMixError("Reload System Mix before saving.");
  if (input.reason.trim().length < 10 || input.reason.length > 500) throw new SystemMixError("Give a reason between 10 and 500 characters.");
  const actor = await tx.user.findUnique({ where: { id: input.actorUserId }, select: { emailVerifiedAt: true, suspendedAt: true, passwordHash: true, staffMembership: true } });
  const session = await tx.session.findFirst({ where: { id: input.actorSessionId, userId: input.actorUserId, expiresAt: { gt: now } } });
  if (!session || !actor?.emailVerifiedAt || actor.suspendedAt || !hasAdminPermission(actor.staffMembership, "mixes.edit") || password !== undefined && !hasAdminPermission(actor.staffMembership, "mixes.publish")) throw new SystemMixError("Your current staff access does not allow this System Mix change.");
  if (env.requireAdminMfa && !await tx.adminMfaSession.findFirst({ where: { sessionId: session.id, userId: input.actorUserId, expiresAt: { gt: now }, ...(password !== undefined ? { verifiedAt: { gte: new Date(now.getTime() - 10 * 60_000) } } : {}) } })) throw new SystemMixError("Verify your authenticator before changing System Mix.", true);
  if (password !== undefined && (!actor.passwordHash || password.length > 72 || !await bcrypt.compare(password, actor.passwordHash))) throw new SystemMixError("Enter your current administrator password.");
}
export async function saveSystemMixDraft(input: Actor & { content: SystemMixContent }) {
  const content = validateSystemMixContent(input.content);
  return prisma.$transaction(async tx => {
    await lockStaff(tx); await lockSystemMix(tx); await authorize(tx, input);
    const { config } = await systemMixState(tx);
    if (input.expectedRevision !== config.controlRevision) throw new SystemMixError("System Mix changed. Reload before saving your draft.");
    const version = config.draftVersion + 1;
    await tx.systemMixRevision.create({ data: { version, ...content, actorUserId: input.actorUserId, reason: input.reason.trim() } });
    await tx.systemMixConfig.update({ where: { id: config.id }, data: { draftVersion: version, controlRevision: { increment: 1 } } });
    await tx.platformAuditEvent.create({ data: { actorUserId: input.actorUserId, action: "system_mix.draft.save", entityType: "SystemMix", entityId: config.id, reason: input.reason.trim(), afterData: { version } } });
    return { version };
  });
}
export async function releaseSystemMix(input: Actor & { password: string; version: number; operation: "publish" | "rollback" }) {
  if (!Number.isSafeInteger(input.version) || input.version < 1 || !["publish", "rollback"].includes(input.operation)) throw new SystemMixError("Choose a listed System Mix version.");
  return prisma.$transaction(async tx => {
    await lockStaff(tx); await lockSystemMix(tx); await authorize(tx, input, input.password);
    const { config } = await systemMixState(tx);
    if (input.expectedRevision !== config.controlRevision) throw new SystemMixError("System Mix changed. Reload and review the saved wording before publishing.");
    if (input.operation === "publish" && input.version !== config.draftVersion) throw new SystemMixError("Review the latest saved draft before publishing.");
    if (input.operation === "rollback" && !await tx.systemMixRelease.findFirst({ where: { systemMixId: config.id, version: input.version } })) throw new SystemMixError("Rollback requires a previously published version.");
    const selected = await tx.systemMixRevision.findUnique({ where: { systemMixId_version: { systemMixId: config.id, version: input.version } } });
    if (!selected) throw new SystemMixError("This System Mix version is unavailable.");
    validateSystemMixContent(selected);
    const revision = config.controlRevision + 1;
    await tx.systemMixConfig.update({ where: { id: config.id }, data: { publishedVersion: input.version, controlRevision: revision } });
    await tx.systemMixRelease.create({ data: { version: input.version, action: input.operation.toUpperCase(), controlRevision: revision, actorUserId: input.actorUserId, reason: input.reason.trim() } });
    await tx.platformAuditEvent.create({ data: { actorUserId: input.actorUserId, action: `system_mix.${input.operation}`, entityType: "SystemMix", entityId: config.id, reason: input.reason.trim(), beforeData: { version: config.publishedVersion, revision: config.controlRevision }, afterData: { version: input.version, revision } } });
    return { revision };
  });
}
