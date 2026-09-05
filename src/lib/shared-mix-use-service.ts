import type { MixStatus, MixTriggerMode, Prisma } from "@/generated/prisma/client";
import { parseBroadcastScheduleInput } from "@/lib/mix-broadcast";
import { prisma } from "@/lib/prisma";
import { normalizeSharedMixSteps } from "@/lib/shared-mix";
import { slugify } from "@/lib/slug";

function clean(value: string | null | undefined, maximum: number): string {
  return (value ?? "").trim().slice(0, maximum);
}

async function resolveDateType(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  triggerMode: MixTriggerMode,
  nameValue: string | null,
  slugValue: string | null
): Promise<string | null> {
  if (triggerMode !== "DATE_TRIGGERED") return null;
  const name = clean(nameValue, 120);
  const slug = slugify(slugValue || name);
  if (!name || !slug) throw new Error("This plan does not identify its saved date type.");
  const existing = await tx.dateType.findFirst({
    where: { slug, OR: [{ workspaceId, isSystem: false }, { workspaceId: null, isSystem: true }] },
    orderBy: { isSystem: "desc" }
  });
  if (existing) {
    if (!existing.isActive) throw new Error(`Turn on the ${existing.name} date type before using this plan.`);
    return existing.id;
  }
  return (await tx.dateType.create({ data: { workspaceId, scopeKey: workspaceId, name, slug, isSystem: false, isActive: true } })).id;
}

export async function useSharedMixTemplate(input: {
  workspaceId: string;
  actorUserId: string;
  sharedMixId: string;
  requestId: string;
  name: string;
  status: Extract<MixStatus, "DRAFT" | "ACTIVE">;
  assignAllContacts: boolean;
  groupIds: string[];
  broadcastDate?: string | null;
  broadcastTime?: string | null;
  broadcastTimezone?: string | null;
}): Promise<{ mixId: string; repeated: boolean }> {
  const requestId = clean(input.requestId, 120);
  if (!/^[a-zA-Z0-9_-]{8,120}$/.test(requestId)) throw new Error("The template setup request is invalid. Reload and try again.");
  const importKey = `${input.workspaceId}:${input.sharedMixId}:setup:${requestId}`;
  const existing = await prisma.sharedMixImport.findUnique({ where: { importKey }, select: { mixId: true } });
  if (existing?.mixId) return { mixId: existing.mixId, repeated: true };

  const [workspace, shared, metadata] = await Promise.all([
    prisma.workspace.findUnique({ where: { id: input.workspaceId }, select: { id: true } }),
    prisma.sharedMix.findFirst({ where: { id: input.sharedMixId, status: "APPROVED" } }),
    prisma.sharedMixMetadata.findUnique({ where: { sharedMixId: input.sharedMixId } })
  ]);
  if (!workspace || !shared) throw new Error("This ready-made plan is not currently available.");
  const steps = normalizeSharedMixSteps(shared.steps);
  const name = clean(input.name, 160) || shared.title;
  const triggerMode = metadata?.triggerMode ?? "MANUAL_START";
  const groupIds = [...new Set(input.groupIds.filter(Boolean))];
  if (!input.assignAllContacts && !groupIds.length) throw new Error("Choose everyone or at least one tag.");
  if (groupIds.length) {
    const [groupCount, inactiveCount] = await Promise.all([
      prisma.group.count({ where: { workspaceId: input.workspaceId, id: { in: groupIds } } }),
      prisma.contactGroupState.count({ where: { workspaceId: input.workspaceId, groupId: { in: groupIds }, isActive: false } })
    ]);
    if (groupCount !== groupIds.length || inactiveCount > 0) throw new Error("Choose only active tags.");
  }
  const contactIds = input.assignAllContacts
    ? (await prisma.contact.findMany({ where: { workspaceId: input.workspaceId, archivedAt: null }, select: { id: true } })).map((contact) => contact.id)
    : [];
  const broadcast = triggerMode === "BROADCAST"
    ? parseBroadcastScheduleInput(clean(input.broadcastDate, 10), clean(input.broadcastTime, 5), clean(input.broadcastTimezone, 120))
    : null;
  const mixId = crypto.randomUUID();
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    const duplicate = await tx.sharedMixImport.findUnique({ where: { importKey }, select: { mixId: true } });
    if (duplicate?.mixId) return;
    const dateTypeId = await resolveDateType(tx, input.workspaceId, triggerMode, metadata?.dateTypeName ?? null, metadata?.dateTypeSlug ?? null);
    await tx.mix.create({
      data: {
        id: mixId,
        workspaceId: input.workspaceId,
        name,
        description: shared.description,
        framework: shared.framework,
        category: shared.category,
        industry: shared.industry,
        triggerMode,
        dateTypeId,
        status: input.status,
        durationDays: Math.max(...steps.map((step) => step.dayOffset)) - Math.min(...steps.map((step) => step.dayOffset)),
        includeFutureGroupMembers: groupIds.length > 0,
        source: `SHARED_MIX:${shared.id}`
      }
    });
    if (broadcast) await tx.mixBroadcastSchedule.create({ data: { workspaceId: input.workspaceId, mixId, localDate: broadcast.localDate, timeMinutes: broadcast.timeMinutes, timezone: broadcast.timezone } });

    for (const [index, step] of steps.entries()) {
      const template = await tx.stepTemplate.create({
        data: {
          workspaceId: input.workspaceId,
          name: `${name} — ${step.name}`,
          channel: step.channel,
          isActive: false,
          versions: { create: { version: 1, subject: step.subject, body: step.body, script: step.script, longSms: step.longSms, includeOptOut: step.includeOptOut } }
        },
        include: { versions: true }
      });
      const version = template.versions[0];
      if (!version) throw new Error(`Action #${index + 1} could not be created.`);
      await tx.mixStep.create({ data: { mixId, stepVersionId: version.id, dayOffset: step.dayOffset, sendTimeMinutes: step.sendTimeMinutes, sortOrder: index + 1, isActive: true } });
    }

    const startDate = triggerMode === "MANUAL_START" ? now : null;
    for (const groupId of groupIds) {
      await tx.mixAssignment.create({ data: { assignmentKey: `${input.workspaceId}:${mixId}:group:${groupId}`, workspaceId: input.workspaceId, mixId, groupId, mode: "DYNAMIC", startDate } });
    }
    for (const contactId of contactIds) {
      await tx.mixAssignment.create({ data: { assignmentKey: `${input.workspaceId}:${mixId}:audience:${contactId}`, workspaceId: input.workspaceId, mixId, contactId, mode: "DYNAMIC", startDate } });
    }

    const importRecord = await tx.sharedMixImport.create({ data: { importKey, workspaceId: input.workspaceId, sharedMixId: shared.id, mixId } });
    await tx.sharedMixImportMetadata.create({ data: { importId: importRecord.id, sharedMixVersion: metadata?.version ?? 1 } });
    await tx.sharedMix.update({ where: { id: shared.id }, data: { importCount: { increment: 1 } } });
    await tx.auditLog.create({
      data: {
        workspaceId: input.workspaceId,
        actorType: "USER",
        actorUserId: input.actorUserId,
        action: input.status === "ACTIVE" ? "shared-mix.use-and-activate" : "shared-mix.use",
        entityType: "SharedMix",
        entityId: shared.id,
        source: "templates.setup",
        metadata: { mixId, sharedMixVersion: metadata?.version ?? 1, triggerMode, status: input.status, groupCount: groupIds.length, allContactCount: contactIds.length, projectedJumpCount: contactIds.length * steps.length }
      }
    });
    if (input.status === "ACTIVE") await tx.job.create({ data: { workspaceId: input.workspaceId, task: "generate-jumps", payload: { mixId } } });
  });
  const resolved = await prisma.sharedMixImport.findUnique({ where: { importKey }, select: { mixId: true } });
  return { mixId: resolved?.mixId ?? mixId, repeated: Boolean(resolved?.mixId && resolved.mixId !== mixId) };
}
