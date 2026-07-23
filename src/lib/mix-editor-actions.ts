"use server";

import { randomUUID } from "node:crypto";
import type { Channel, MixStatus, MixTriggerMode } from "@/generated/prisma/client";
import { redirect } from "next/navigation";
import { requireWorkspace } from "@/lib/auth";
import { listGroupStates, mergeGroupActivity } from "@/lib/group-activity";
import { parseBroadcastScheduleInput } from "@/lib/mix-broadcast";
import { containsPrivateNotesPlaceholder, findUnknownPlaceholders } from "@/lib/placeholders";
import { prisma } from "@/lib/prisma";

const MAX_STEP_OFFSET_DAYS = 365;
const CHANNELS: Channel[] = ["SMS", "EMAIL", "PHONE_CALL", "VOICEMAIL", "WHATSAPP"];

type InlineAction = {
  name: string;
  channel: Channel;
  subject: string | null;
  body: string | null;
  script: string | null;
  saveAsTemplate: boolean;
};

function value(formData: FormData, key: string, maximum = 4000): string {
  return String(formData.get(key) ?? "").trim().slice(0, maximum);
}

function values(formData: FormData, key: string): string[] {
  return formData.getAll(key).map((item) => String(item));
}

function fail(path: string, message: string): never {
  redirect(`${path}${path.includes("?") ? "&" : "?"}error=${encodeURIComponent(message)}`);
}

function validateInlineAction(formData: FormData, index: number, path: string): InlineAction {
  const name = value(formData, `inlineName-${index}`, 160);
  const channel = value(formData, `inlineChannel-${index}`, 40) as Channel;
  const subject = value(formData, `inlineSubject-${index}`, 300) || null;
  const body = value(formData, `inlineBody-${index}`, 20_000) || null;
  const script = value(formData, `inlineScript-${index}`, 20_000) || null;
  if (!name) fail(path, `Give action #${index + 1} an internal name.`);
  if (!CHANNELS.includes(channel)) fail(path, `Choose a valid channel for action #${index + 1}.`);
  if (channel === "EMAIL" && (!subject || !body)) fail(path, `Email action #${index + 1} requires a subject and message.`);
  if (["SMS", "WHATSAPP"].includes(channel) && !body) fail(path, `Action #${index + 1} requires a prepared message.`);
  if (["PHONE_CALL", "VOICEMAIL"].includes(channel) && !script) fail(path, `Action #${index + 1} requires call or voicemail notes.`);
  const content = [subject, body, script].filter(Boolean).join("\n");
  const unknown = findUnknownPlaceholders(content);
  if (unknown.length) fail(path, `Action #${index + 1} uses unsupported placeholders: ${unknown.join(", ")}`);
  if (channel !== "PHONE_CALL" && containsPrivateNotesPlaceholder(content)) {
    fail(path, `Private relationship updates may only be inserted into Phone Call action #${index + 1}.`);
  }
  return {
    name,
    channel,
    subject,
    body,
    script,
    saveAsTemplate: formData.get(`saveAsTemplate-${index}`) === "on"
  };
}

export async function saveMixAction(formData: FormData): Promise<void> {
  const { workspace, user, impersonation } = await requireWorkspace();
  const mixIdRaw = value(formData, "mixId", 100);
  const name = value(formData, "name", 160);
  const description = value(formData, "description", 1200);
  const framework = value(formData, "framework", 160);
  const category = value(formData, "category", 120);
  const industry = value(formData, "industry", 120);
  const triggerMode = value(formData, "triggerMode", 40) as MixTriggerMode;
  const status = value(formData, "status", 40) as MixStatus;
  const dateTypeId = value(formData, "dateTypeId", 100);
  const path = mixIdRaw ? `/mixes/${mixIdRaw}/edit` : "/mixes/new";
  const allowedTriggers: MixTriggerMode[] = ["DATE_TRIGGERED", "MANUAL_START", "BROADCAST"];
  const allowedStatuses: MixStatus[] = ["DRAFT", "ACTIVE", "PAUSED"];

  if (impersonation) fail(path, "Administrator support sessions are view-only.");
  if (!name) fail(path, "Give the Mix a name.");
  if (!allowedTriggers.includes(triggerMode)) fail(path, "Choose a valid trigger mode.");
  if (!allowedStatuses.includes(status)) fail(path, "Choose Draft, Active, or Paused.");
  if (status === "ACTIVE" && value(formData, "activationConfirmed", 4) !== "1") fail(path, "Review the activation impact before activating this Mix.");

  if (triggerMode === "DATE_TRIGGERED") {
    const dateType = await prisma.dateType.findFirst({
      where: { id: dateTypeId, isActive: true, OR: [{ workspaceId: workspace.id }, { workspaceId: null, isSystem: true }] },
      select: { id: true }
    });
    if (!dateType) fail(path, "Choose a valid Target Important Date Type.");
  }

  let broadcastSchedule: ReturnType<typeof parseBroadcastScheduleInput> | null = null;
  if (triggerMode === "BROADCAST") {
    try {
      broadcastSchedule = parseBroadcastScheduleInput(
        value(formData, "broadcastDate", 10),
        value(formData, "broadcastTime", 5),
        value(formData, "broadcastTimezone", 120) || workspace.profile?.timezone || "UTC"
      );
    } catch (error) {
      fail(path, error instanceof Error ? error.message : "Choose a valid broadcast schedule.");
    }
  }

  const mixStepIds = values(formData, "mixStepId");
  const actionModes = values(formData, "actionMode");
  const stepTemplateIds = values(formData, "stepTemplateId");
  const offsets = values(formData, "dayOffset");
  const sendTimes = values(formData, "sendTimeMinutes");
  const stepCount = actionModes.length;
  if (!stepCount || stepCount > 50) fail(path, "Add between one and fifty actions to the Mix.");
  if ([mixStepIds, stepTemplateIds, offsets, sendTimes].some((items) => items.length !== stepCount)) fail(path, "The action sequence is incomplete. Reload and try again.");
  if (actionModes.some((mode) => mode !== "INLINE" && mode !== "TEMPLATE")) fail(path, "Choose a valid authoring mode for every action.");

  const parsedOffsets = offsets.map((raw, index) => {
    const parsed = Number(raw);
    if (!Number.isInteger(parsed) || parsed < -MAX_STEP_OFFSET_DAYS || parsed > MAX_STEP_OFFSET_DAYS) {
      fail(path, `Action #${index + 1} must be between -${MAX_STEP_OFFSET_DAYS} and ${MAX_STEP_OFFSET_DAYS} days.`);
    }
    return parsed;
  });
  if (triggerMode === "MANUAL_START" && parsedOffsets.some((offset) => offset < 0)) {
    fail(path, "Manual-start Mix actions cannot use negative day offsets.");
  }
  const parsedSendTimes = sendTimes.map((raw, index) => {
    if (!raw) return null;
    const parsed = Number(raw);
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > 1439) fail(path, `Action #${index + 1} has an invalid local time.`);
    return parsed;
  });
  const inlineActions = actionModes.map((mode, index) => mode === "INLINE" ? validateInlineAction(formData, index, path) : null);
  const requestedTemplateIds = [...new Set(actionModes.flatMap((mode, index) => mode === "TEMPLATE" && stepTemplateIds[index] ? [stepTemplateIds[index]] : []))];

  const [templates, existingMix] = await Promise.all([
    requestedTemplateIds.length ? prisma.stepTemplate.findMany({
      where: { id: { in: requestedTemplateIds }, workspaceId: workspace.id },
      include: { versions: { orderBy: { version: "desc" }, take: 1 } }
    }) : Promise.resolve([]),
    mixIdRaw
      ? prisma.mix.findFirst({
          where: { id: mixIdRaw, workspaceId: workspace.id, status: { not: "ARCHIVED" } },
          include: {
            steps: { include: { stepVersion: { include: { stepTemplate: true } } } },
            assignments: { where: { mode: "DYNAMIC" } }
          }
        })
      : Promise.resolve(null)
  ]);
  if (mixIdRaw && !existingMix) fail("/mixes", "Mix not found.");
  const templateById = new Map(templates.map((template) => [template.id, template]));
  for (let index = 0; index < stepCount; index += 1) {
    if (actionModes[index] !== "TEMPLATE") continue;
    const template = templateById.get(stepTemplateIds[index]);
    if (!template?.versions[0]) fail(path, `Action Template #${index + 1} is unavailable.`);
    const existingUsesTemplate = existingMix?.steps.some((step) => step.stepVersion.stepTemplateId === template.id);
    if (!template.isActive && !existingUsesTemplate) fail(path, `Action Template #${index + 1} is archived.`);
  }

  const groupIds = [...new Set(values(formData, "groupIds").filter(Boolean))];
  if (groupIds.length) {
    const [availableGroups, groupStates] = await Promise.all([
      prisma.group.findMany({ where: { workspaceId: workspace.id, id: { in: groupIds } }, select: { id: true } }),
      listGroupStates(workspace.id)
    ]);
    if (availableGroups.length !== groupIds.length) fail(path, "One or more selected Contact Groups are unavailable.");
    const existingGroupIds = new Set((existingMix?.assignments ?? []).flatMap((assignment) => assignment.groupId ? [assignment.groupId] : []));
    const unavailableNewGroup = mergeGroupActivity(availableGroups, groupStates).some((group) => !group.isActive && !existingGroupIds.has(group.id));
    if (unavailableNewGroup) fail(path, "Inactive Contact Groups cannot be added to a Mix.");
  }
  const assignAllContacts = formData.get("assignAllContacts") === "on";
  if (status === "ACTIVE" && !assignAllContacts && !groupIds.length) fail(path, "Choose All active Contacts or at least one active Contact Group before activation.");
  if (triggerMode === "BROADCAST" && !assignAllContacts && !groupIds.length) fail(path, "Choose an audience for the broadcast.");

  const allContactIds = assignAllContacts
    ? (await prisma.contact.findMany({ where: { workspaceId: workspace.id, archivedAt: null }, select: { id: true } })).map((contact) => contact.id)
    : [];
  const mixId = existingMix?.id ?? randomUUID();
  const existingAssignmentByKey = new Map((existingMix?.assignments ?? []).map((assignment) => [assignment.assignmentKey, assignment]));
  const now = new Date();
  const durationDays = Math.max(...parsedOffsets) - Math.min(...parsedOffsets);

  try {
    await prisma.$transaction(async (tx) => {
      const mixData = {
        name,
        description: description || null,
        framework: framework || null,
        category: category || null,
        industry: industry || null,
        triggerMode,
        dateTypeId: triggerMode === "DATE_TRIGGERED" ? dateTypeId : null,
        status,
        durationDays,
        includeFutureGroupMembers: groupIds.length > 0
      };
      if (existingMix) await tx.mix.update({ where: { id: mixId }, data: mixData });
      else await tx.mix.create({ data: { id: mixId, workspaceId: workspace.id, ...mixData, source: "USER" } });

      if (broadcastSchedule) {
        await tx.mixBroadcastSchedule.upsert({
          where: { mixId },
          create: { workspaceId: workspace.id, mixId, localDate: broadcastSchedule.localDate, timeMinutes: broadcastSchedule.timeMinutes, timezone: broadcastSchedule.timezone },
          update: { workspaceId: workspace.id, localDate: broadcastSchedule.localDate, timeMinutes: broadcastSchedule.timeMinutes, timezone: broadcastSchedule.timezone }
        });
      } else {
        await tx.mixBroadcastSchedule.deleteMany({ where: { workspaceId: workspace.id, mixId } });
      }

      if (existingMix?.steps.length) {
        await tx.mixStep.updateMany({ where: { mixId, isActive: true }, data: { sortOrder: { increment: 10_000 } } });
      }
      const retainedIds = new Set<string>();
      const replacedInternalTemplateIds = new Set<string>();
      for (let index = 0; index < stepCount; index += 1) {
        const requestedId = mixStepIds[index] || "";
        const existingStep = existingMix?.steps.find((step) => step.id === requestedId);
        let stepVersionId: string;
        if (actionModes[index] === "TEMPLATE") {
          stepVersionId = templateById.get(stepTemplateIds[index])!.versions[0]!.id;
        } else {
          const action = inlineActions[index]!;
          const template = await tx.stepTemplate.create({
            data: {
              workspaceId: workspace.id,
              name: action.saveAsTemplate ? action.name : `${name} — ${action.name}`,
              channel: action.channel,
              isActive: action.saveAsTemplate,
              versions: { create: { version: 1, subject: action.subject, body: action.body, script: action.script, longSms: action.channel === "SMS" && (action.body?.length ?? 0) > 160 } }
            },
            include: { versions: true }
          });
          const version = template.versions[0];
          if (!version) throw new Error(`Inline action #${index + 1} could not be created.`);
          stepVersionId = version.id;
          if (existingStep && !existingStep.stepVersion.stepTemplate.isActive) replacedInternalTemplateIds.add(existingStep.stepVersion.stepTemplateId);
        }
        if (existingStep) {
          await tx.mixStep.update({ where: { id: existingStep.id }, data: { stepVersionId, dayOffset: parsedOffsets[index], sendTimeMinutes: parsedSendTimes[index], sortOrder: index + 1, isActive: true } });
          retainedIds.add(existingStep.id);
        } else {
          const created = await tx.mixStep.create({ data: { mixId, stepVersionId, dayOffset: parsedOffsets[index], sendTimeMinutes: parsedSendTimes[index], sortOrder: index + 1, isActive: true } });
          retainedIds.add(created.id);
        }
      }

      for (const [index, oldStep] of (existingMix?.steps ?? []).filter((step) => !retainedIds.has(step.id)).entries()) {
        const historyCount = await tx.jump.count({ where: { mixStepId: oldStep.id } });
        if (historyCount) await tx.mixStep.update({ where: { id: oldStep.id }, data: { isActive: false, sortOrder: 20_000 + index } });
        else await tx.mixStep.delete({ where: { id: oldStep.id } });
        if (!oldStep.stepVersion.stepTemplate.isActive) replacedInternalTemplateIds.add(oldStep.stepVersion.stepTemplateId);
      }
      for (const templateId of replacedInternalTemplateIds) {
        const activeUses = await tx.mixStep.count({ where: { isActive: true, stepVersion: { stepTemplateId: templateId } } });
        if (!activeUses) await tx.stepTemplate.updateMany({ where: { id: templateId, workspaceId: workspace.id }, data: { isActive: false } });
      }

      await tx.mixAssignment.updateMany({ where: { workspaceId: workspace.id, mixId, mode: "DYNAMIC" }, data: { isActive: false } });
      for (const groupId of groupIds) {
        const assignmentKey = `${workspace.id}:${mixId}:group:${groupId}`;
        const existing = existingAssignmentByKey.get(assignmentKey);
        const startDate = triggerMode === "MANUAL_START" ? existing?.startDate ?? now : null;
        await tx.mixAssignment.upsert({ where: { assignmentKey }, create: { assignmentKey, workspaceId: workspace.id, mixId, groupId, mode: "DYNAMIC", startDate }, update: { isActive: true, startDate, mode: "DYNAMIC" } });
      }
      for (const contactId of allContactIds) {
        const assignmentKey = `${workspace.id}:${mixId}:audience:${contactId}`;
        const existing = existingAssignmentByKey.get(assignmentKey);
        const startDate = triggerMode === "MANUAL_START" ? existing?.startDate ?? now : null;
        await tx.mixAssignment.upsert({ where: { assignmentKey }, create: { assignmentKey, workspaceId: workspace.id, mixId, contactId, mode: "DYNAMIC", startDate }, update: { isActive: true, startDate, mode: "DYNAMIC" } });
      }

      await tx.auditLog.create({
        data: {
          workspaceId: workspace.id,
          actorType: "USER",
          actorUserId: user.id,
          action: existingMix ? "mix.update" : "mix.create",
          entityType: "Mix",
          entityId: mixId,
          source: "mixes.editor",
          metadata: { triggerMode, status, actionCount: stepCount, inlineActionCount: actionModes.filter((mode) => mode === "INLINE").length, groupCount: groupIds.length, allContactCount: allContactIds.length, projectedJumpCount: (groupIds.length ? null : allContactIds.length * stepCount) }
        }
      });
      await tx.job.create({ data: { workspaceId: workspace.id, task: "generate-jumps", payload: { mixId } } });
    });
  } catch (error) {
    fail(path, error instanceof Error ? error.message : "The Mix could not be saved.");
  }

  redirect(`/mixes/${mixId}/edit?${existingMix ? "updated" : "created"}=manual`);
}
