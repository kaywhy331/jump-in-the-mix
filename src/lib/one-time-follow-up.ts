import { createHash } from "node:crypto";
import type { Channel, Prisma } from "@/generated/prisma/client";
import { renderJumpSnapshot } from "@/lib/jump-render";

const digest = (value: string) => createHash("sha256").update(value).digest("hex");

export function oneTimeMixId(workspaceId: string): string {
  return `one_time_mix_${digest(workspaceId).slice(0, 28)}`;
}

export type OneTimeFollowUpInput = {
  workspaceId: string;
  contactId: string;
  actorUserId: string;
  scheduledAt: Date;
  reason: string;
  channel: Channel;
  content: { subject: string | null; body: string | null; script: string | null };
  /** Reuse wording that already exists (a follow-up being carried forward) instead of writing new wording. */
  stepVersionId?: string;
  /** Stable per request, so a retried save cannot create a second follow-up. */
  key: string;
  batchId?: string;
};

/**
 * One follow-up at exactly the chosen time, outside every Mix. It lives in the workspace's hidden
 * one-time Mix, which the reconciler never reads, so no plan replays around it and no settings
 * change moves it.
 */
export async function createOneTimeFollowUp(tx: Prisma.TransactionClient, input: OneTimeFollowUpInput): Promise<string> {
  const { workspaceId, contactId, actorUserId, scheduledAt, reason, channel, content } = input;
  const mixId = oneTimeMixId(workspaceId);
  await tx.mix.upsert({ where: { id: mixId }, create: { id: mixId, workspaceId, name: "One-time follow-ups", triggerMode: "MANUAL_START", status: "ARCHIVED", source: "ONE_TIME" }, update: {} });
  let stepVersionId = input.stepVersionId;
  if (!stepVersionId) {
    const template = await tx.stepTemplate.create({ data: { workspaceId, name: reason.slice(0, 200), channel, isActive: false, versions: { create: { version: 1, ...content, longSms: channel === "SMS" && (content.body?.length ?? 0) > 160 } } }, include: { versions: true } });
    stepVersionId = template.versions[0].id;
  }
  const step = await tx.mixStep.create({ data: { mixId, stepVersionId, dayOffset: 0, sortOrder: 1, isActive: false } });
  const [person, workspace, user] = await Promise.all([
    tx.contact.findUniqueOrThrow({ where: { id: contactId }, include: { phones: true, emails: true, addresses: true, customFieldValues: { include: { definition: true } } } }),
    tx.workspace.findUniqueOrThrow({ where: { id: workspaceId }, include: { profile: true } }),
    tx.user.findUniqueOrThrow({ where: { id: actorUserId } })
  ]);
  const jump = await tx.jump.create({ data: {
    workspaceId, contactId, mixId, mixStepId: step.id, stepVersionId, manualOnly: true, scheduledAt, baseScheduledAt: scheduledAt, status: "PENDING",
    reason: reason.slice(0, 300),
    templateSnapshot: { ...content, channel, oneTime: true, batchId: input.batchId ?? input.key },
    renderedSnapshot: renderJumpSnapshot(content, person, workspace.profile, user, channel),
    uniquenessKey: digest(input.key)
  } });
  return jump.id;
}
