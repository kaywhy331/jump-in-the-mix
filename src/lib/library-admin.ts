import bcrypt from "bcryptjs";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { lockStaff } from "@/lib/staff-access";
import { hasAdminPermission } from "@/lib/admin-permissions";
import { LibraryError, validateLibraryContent, type LibraryContent } from "@/lib/library-content";
import { applyLibraryPublication, captureLibraryBaseline, libraryJson, libraryState, lockLibrary } from "@/lib/library-store";

type Actor = { actorUserId: string; actorSessionId: string; reason: string };
async function authorize(tx: Prisma.TransactionClient, input: Actor, password?: string) {
  const now = new Date();
  if (input.reason.trim().length < 10 || input.reason.length > 500) throw new LibraryError("Give a reason between 10 and 500 characters.");
  const actor = await tx.user.findUnique({ where: { id: input.actorUserId }, select: { emailVerifiedAt: true, suspendedAt: true, passwordHash: true, staffMembership: true } });
  const session = await tx.session.findFirst({ where: { id: input.actorSessionId, userId: input.actorUserId, expiresAt: { gt: now } } });
  if (!session || !actor?.emailVerifiedAt || actor.suspendedAt || !hasAdminPermission(actor.staffMembership, "mixes.edit") || password !== undefined && !hasAdminPermission(actor.staffMembership, "mixes.publish")) throw new LibraryError("Your current staff access does not allow this library change.");
  if (env.requireAdminMfa && !await tx.adminMfaSession.findFirst({ where: { sessionId: session.id, userId: input.actorUserId, expiresAt: { gt: now }, ...(password !== undefined ? { verifiedAt: { gte: new Date(now.getTime() - 10 * 60_000) } } : {}) } })) throw new LibraryError("Verify your authenticator before changing the library.", true);
  if (password !== undefined && (!actor.passwordHash || password.length > 72 || !await bcrypt.compare(password, actor.passwordHash))) throw new LibraryError("Enter your current administrator password.");
}

export async function saveLibraryDraft(input: Actor & { sharedMixId?: string; expectedRevision: number; content: LibraryContent }) {
  const content = validateLibraryContent(input.content);
  if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0) throw new LibraryError("Reload the mix before saving.");
  return prisma.$transaction(async tx => {
    await lockStaff(tx); await lockLibrary(tx); await authorize(tx, input);
    let id = input.sharedMixId, version = 1;
    if (id) {
      const state = await libraryState(tx, id);
      if (state.controlRevision !== input.expectedRevision) throw new LibraryError("This mix changed. Reload before saving your draft.");
      await captureLibraryBaseline(tx, state);
      version = state.draftVersion + 1;
      await tx.sharedMixMetadata.update({ where: { sharedMixId: id }, data: { draftVersion: version, controlRevision: { increment: 1 } } });
      if (state.shared.status === "UNPUBLISHED") await tx.sharedMix.update({ where: { id }, data: { title: content.title, description: content.description } });
    } else {
      if (input.expectedRevision !== 0) throw new LibraryError("Start a new mix from the library page.");
      const { triggerMode, dateTypeName, dateTypeSlug, featured: _featured, ...fields } = content;
      id = (await tx.sharedMix.create({ data: { ...fields, steps: content.steps as unknown as Prisma.InputJsonValue, durationDays: 0, status: "UNPUBLISHED" } })).id;
      await tx.sharedMixMetadata.create({ data: { sharedMixId: id, version: 1, draftVersion: 1, controlRevision: 1, triggerMode, dateTypeName, dateTypeSlug } });
    }
    await tx.sharedMixRevision.create({ data: { sharedMixId: id, version, snapshot: libraryJson(content), actorUserId: input.actorUserId, reason: input.reason.trim() } });
    await tx.platformAuditEvent.create({ data: { actorUserId: input.actorUserId, action: "library.draft.save", entityType: "SharedMix", entityId: id, reason: input.reason.trim(), afterData: { version } } });
    return { id, version };
  });
}

export async function releaseLibraryVersion(input: Actor & { sharedMixId: string; expectedRevision: number; version: number; operation: "publish" | "rollback" | "unpublish"; password: string }) {
  if (!["publish", "rollback", "unpublish"].includes(input.operation) || !Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0 || !Number.isSafeInteger(input.version) || input.version < 1) throw new LibraryError("Reload the mix and choose a listed publication action.");
  return prisma.$transaction(async tx => {
    await lockStaff(tx); await lockLibrary(tx); await authorize(tx, input, input.password);
    const state = await libraryState(tx, input.sharedMixId);
    if (state.controlRevision !== input.expectedRevision) throw new LibraryError("This mix changed. Reload and review the version before publishing.");
    await captureLibraryBaseline(tx, state);
    if (input.operation === "unpublish") {
      if (state.shared.status !== "APPROVED" || input.version !== state.version) throw new LibraryError("This version is no longer published.");
      await tx.sharedMix.update({ where: { id: input.sharedMixId }, data: { status: "UNPUBLISHED" } });
      await tx.sharedMixMetadata.update({ where: { sharedMixId: input.sharedMixId }, data: { controlRevision: { increment: 1 }, publishedAt: null } });
    } else {
      if (input.operation === "publish" && input.version !== state.draftVersion) throw new LibraryError("Review the latest saved draft before publishing.");
      if (input.operation === "rollback" && !await tx.sharedMixRelease.findFirst({ where: { sharedMixId: input.sharedMixId, version: input.version, action: { in: ["PUBLISH", "ROLLBACK"] } } })) throw new LibraryError("Rollback requires a previously published version.");
      const revision = await tx.sharedMixRevision.findUnique({ where: { sharedMixId_version: { sharedMixId: input.sharedMixId, version: input.version } } });
      if (!revision) throw new LibraryError("This version is unavailable.");
      await applyLibraryPublication(tx, input.sharedMixId, input.version, validateLibraryContent(revision.snapshot));
    }
    const revision = state.controlRevision + 1;
    await tx.sharedMixRelease.create({ data: { sharedMixId: input.sharedMixId, version: input.version, action: input.operation.toUpperCase(), controlRevision: revision, actorUserId: input.actorUserId, reason: input.reason.trim() } });
    await tx.platformAuditEvent.create({ data: { actorUserId: input.actorUserId, action: `library.${input.operation}`, entityType: "SharedMix", entityId: input.sharedMixId, reason: input.reason.trim(),
      beforeData: { version: state.version, status: state.shared.status, revision: state.controlRevision }, afterData: { version: input.version, status: input.operation === "unpublish" ? "UNPUBLISHED" : "APPROVED", revision } } });
    return { revision };
  });
}
