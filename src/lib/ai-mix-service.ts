import { randomUUID } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import {
  parseAiMixPreflight,
  parseAiMixValidation,
  validateAiMixDraft,
  type AiMixDraftValidation,
  type AiMixGeneratedDraft,
  type AiMixPreflight
} from "@/lib/ai-mix";
import { parseBroadcastScheduleInput } from "@/lib/mix-broadcast";
import { prisma } from "@/lib/prisma";

function json(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

async function loadOpenDraft(workspaceId: string, draftId: string) {
  const draft = await prisma.aiMixDraft.findFirst({ where: { id: draftId, workspaceId } });
  if (!draft) throw new Error("AI Mix draft not found.");
  if (draft.status !== "DRAFT") throw new Error("This AI Mix draft is no longer editable.");
  if (draft.expiresAt <= new Date()) {
    await prisma.aiMixDraft.updateMany({ where: { id: draft.id, workspaceId, status: "DRAFT" }, data: { status: "EXPIRED" } });
    throw new Error("This AI Mix draft expired. Start a new wizard draft.");
  }
  return draft;
}

export async function createAiMixDraftRecord(input: {
  workspaceId: string;
  actorUserId: string;
  preflight: AiMixPreflight;
  generatedMix: AiMixGeneratedDraft;
  validation: AiMixDraftValidation;
  expiresAt?: Date;
}): Promise<string> {
  const expiresAt = input.expiresAt ?? new Date(Date.now() + 48 * 60 * 60 * 1000);
  return prisma.$transaction(async (tx) => {
    const draft = await tx.aiMixDraft.create({
      data: {
        workspaceId: input.workspaceId,
        preflightPayload: json(input.preflight),
        generatedMix: json(input.generatedMix),
        validation: json(input.validation),
        expiresAt
      }
    });
    await tx.auditLog.create({
      data: {
        workspaceId: input.workspaceId,
        actorType: "AI",
        actorUserId: input.actorUserId,
        action: "ai-mix.generate",
        entityType: "AiMixDraft",
        entityId: draft.id,
        source: "mixes.wizard",
        metadata: {
          provider: input.validation.provider,
          model: input.validation.model,
          objective: input.preflight.objective,
          triggerMode: input.preflight.triggerMode,
          touchCount: input.generatedMix.steps.length,
          channels: input.preflight.channels
        }
      }
    });
    return draft.id;
  });
}

export async function saveAiMixDraftRecord(input: {
  workspaceId: string;
  actorUserId: string;
  draftId: string;
  generatedMixValue: unknown;
  validationValue: unknown;
}): Promise<{ preflight: AiMixPreflight; generatedMix: AiMixGeneratedDraft; validation: AiMixDraftValidation }> {
  const draft = await loadOpenDraft(input.workspaceId, input.draftId);
  const preflight = parseAiMixPreflight(draft.preflightPayload);
  const generatedMix = validateAiMixDraft(input.generatedMixValue, preflight);
  const validation = parseAiMixValidation(input.validationValue);
  await prisma.$transaction([
    prisma.aiMixDraft.update({
      where: { id: draft.id },
      data: { generatedMix: json(generatedMix), validation: json(validation) }
    }),
    prisma.auditLog.create({
      data: {
        workspaceId: input.workspaceId,
        actorType: validation.provider === "MANUAL" ? "USER" : "AI",
        actorUserId: input.actorUserId,
        action: validation.provider === "MANUAL" ? "ai-mix.edit" : "ai-mix.refine",
        entityType: "AiMixDraft",
        entityId: draft.id,
        source: "mixes.wizard.review",
        metadata: {
          provider: validation.provider,
          model: validation.model,
          revision: validation.revision,
          touchCount: generatedMix.steps.length
        }
      }
    })
  ]);
  return { preflight, generatedMix, validation };
}

export async function cancelAiMixDraftRecord(workspaceId: string, actorUserId: string, draftId: string): Promise<boolean> {
  const result = await prisma.aiMixDraft.updateMany({
    where: { id: draftId, workspaceId, status: "DRAFT" },
    data: { status: "CANCELED" }
  });
  if (result.count) {
    await prisma.auditLog.create({
      data: {
        workspaceId,
        actorType: "USER",
        actorUserId,
        action: "ai-mix.cancel",
        entityType: "AiMixDraft",
        entityId: draftId,
        source: "mixes.wizard.review"
      }
    });
  }
  return result.count === 1;
}

export async function publishAiMixDraft(input: {
  workspaceId: string;
  actorUserId: string;
  draftId: string;
  generatedMixValue: unknown;
  validationValue: unknown;
}): Promise<string> {
  const storedDraft = await loadOpenDraft(input.workspaceId, input.draftId);
  const preflight = parseAiMixPreflight(storedDraft.preflightPayload);
  const generatedMix = validateAiMixDraft(input.generatedMixValue, preflight);
  const validation = parseAiMixValidation(input.validationValue);

  if (preflight.triggerMode === "DATE_TRIGGERED") {
    const dateType = preflight.dateTypeId
      ? await prisma.dateType.findFirst({
          where: {
            id: preflight.dateTypeId,
            isActive: true,
            OR: [{ workspaceId: input.workspaceId }, { workspaceId: null, isSystem: true }]
          },
          select: { id: true }
        })
      : null;
    if (!dateType) throw new Error("The selected Target Jump Date Type is no longer available.");
  }

  const groupIds = [...new Set(preflight.groupIds)];
  if (groupIds.length) {
    const groupCount = await prisma.group.count({ where: { workspaceId: input.workspaceId, id: { in: groupIds } } });
    if (groupCount !== groupIds.length) throw new Error("One or more selected Contact Groups are no longer available.");
  }

  if (!preflight.assignAllContacts && !groupIds.length) {
    throw new Error("Choose All active Contacts or at least one Contact Group before creating the Mix.");
  }

  const contactIds = preflight.assignAllContacts
    ? (await prisma.contact.findMany({
        where: { workspaceId: input.workspaceId, archivedAt: null },
        select: { id: true }
      })).map((contact) => contact.id)
    : [];

  const broadcastSchedule = preflight.triggerMode === "BROADCAST"
    ? parseBroadcastScheduleInput(
        preflight.broadcastDate ?? "",
        preflight.broadcastTime ?? "",
        preflight.broadcastTimezone
      )
    : null;

  const mixId = randomUUID();
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    const claimed = await tx.aiMixDraft.updateMany({
      where: { id: storedDraft.id, workspaceId: input.workspaceId, status: "DRAFT" },
      data: { status: "CONFIRMED", generatedMix: json(generatedMix), validation: json(validation) }
    });
    if (claimed.count !== 1) throw new Error("This AI Mix draft was already used or canceled.");

    await tx.mix.create({
      data: {
        id: mixId,
        workspaceId: input.workspaceId,
        name: generatedMix.name,
        description: generatedMix.description,
        framework: generatedMix.framework,
        category: generatedMix.category,
        industry: generatedMix.industry,
        triggerMode: preflight.triggerMode,
        dateTypeId: preflight.triggerMode === "DATE_TRIGGERED" ? preflight.dateTypeId : null,
        status: "DRAFT",
        durationDays: generatedMix.durationDays,
        includeFutureGroupMembers: groupIds.length > 0,
        source: "AI_WIZARD"
      }
    });

    if (broadcastSchedule) {
      await tx.mixBroadcastSchedule.create({
        data: {
          workspaceId: input.workspaceId,
          mixId,
          localDate: broadcastSchedule.localDate,
          timeMinutes: broadcastSchedule.timeMinutes,
          timezone: broadcastSchedule.timezone
        }
      });
    }

    for (const [index, step] of generatedMix.steps.entries()) {
      const template = await tx.stepTemplate.create({
        data: {
          workspaceId: input.workspaceId,
          name: `${generatedMix.name} — ${step.name}`,
          channel: step.channel
        }
      });
      const version = await tx.stepVersion.create({
        data: {
          stepTemplateId: template.id,
          version: 1,
          subject: step.subject,
          body: step.body,
          script: step.script,
          longSms: step.longSms,
          includeOptOut: step.includeOptOut
        }
      });
      await tx.mixStep.create({
        data: {
          mixId,
          stepVersionId: version.id,
          dayOffset: step.dayOffset,
          sendTimeMinutes: step.sendTimeMinutes,
          sortOrder: index + 1,
          isActive: true
        }
      });
    }

    const startDate = preflight.triggerMode === "MANUAL_START" ? now : null;
    for (const groupId of groupIds) {
      const assignmentKey = `${input.workspaceId}:${mixId}:group:${groupId}`;
      await tx.mixAssignment.create({
        data: {
          assignmentKey,
          workspaceId: input.workspaceId,
          mixId,
          groupId,
          mode: "DYNAMIC",
          startDate
        }
      });
    }
    for (const contactId of contactIds) {
      const assignmentKey = `${input.workspaceId}:${mixId}:audience:${contactId}`;
      await tx.mixAssignment.create({
        data: {
          assignmentKey,
          workspaceId: input.workspaceId,
          mixId,
          contactId,
          mode: "DYNAMIC",
          startDate
        }
      });
    }

    await tx.auditLog.create({
      data: {
        workspaceId: input.workspaceId,
        actorType: "USER",
        actorUserId: input.actorUserId,
        action: "mix.create.ai-wizard",
        entityType: "Mix",
        entityId: mixId,
        source: "mixes.wizard.review",
        metadata: {
          aiMixDraftId: storedDraft.id,
          provider: validation.provider,
          model: validation.model,
          triggerMode: preflight.triggerMode,
          jumpCount: generatedMix.steps.length,
          groupCount: groupIds.length,
          allContactCount: contactIds.length
        }
      }
    });
    await tx.job.create({ data: { workspaceId: input.workspaceId, task: "generate-jumps", payload: { mixId } } });
    await tx.aiMixDraft.update({ where: { id: storedDraft.id }, data: { status: "PUBLISHED" } });
  });

  return mixId;
}
