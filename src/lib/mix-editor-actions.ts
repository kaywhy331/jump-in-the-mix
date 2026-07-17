"use server";

import { randomUUID } from "node:crypto";
import type { MixStatus, MixTriggerMode } from "@/generated/prisma/client";
import { redirect } from "next/navigation";
import { requireWorkspace } from "@/lib/auth";
import { listGroupStates, mergeGroupActivity } from "@/lib/group-activity";
import { parseBroadcastScheduleInput } from "@/lib/mix-broadcast";
import { PLAN_LIMITS } from "@/lib/plans";
import { prisma } from "@/lib/prisma";

function value(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function values(formData: FormData, key: string): string[] {
  return formData.getAll(key).map((item) => String(item));
}

function fail(path: string, message: string): never {
  redirect(`${path}${path.includes("?") ? "&" : "?"}error=${encodeURIComponent(message)}`);
}

async function queueMixReconciliation(workspaceId: string, mixId: string): Promise<void> {
  await prisma.job.create({ data: { workspaceId, task: "generate-jumps", payload: { mixId } } });
}

export async function saveMixAction(formData: FormData): Promise<void> {
  const { workspace, user } = await requireWorkspace();
  const mixIdRaw = value(formData, "mixId");
  const name = value(formData, "name");
  const description = value(formData, "description");
  const framework = value(formData, "framework");
  const category = value(formData, "category");
  const industry = value(formData, "industry");
  const triggerMode = value(formData, "triggerMode") as MixTriggerMode;
  const status = value(formData, "status") as MixStatus;
  const dateTypeId = value(formData, "dateTypeId");
  const path = mixIdRaw ? `/mixes/${mixIdRaw}/edit` : "/mixes/new";
  const allowedTriggers: MixTriggerMode[] = ["DATE_TRIGGERED", "MANUAL_START", "BROADCAST"];
  const allowedStatuses: MixStatus[] = ["DRAFT", "ACTIVE", "PAUSED"];

  if (!name) fail(path, "Give the Mix a name.");
  if (!allowedTriggers.includes(triggerMode)) fail(path, "Choose a valid trigger mode.");
  if (!allowedStatuses.includes(status)) fail(path, "Choose Draft, Active, or Paused.");

  if (triggerMode === "DATE_TRIGGERED") {
    const dateType = await prisma.dateType.findFirst({
      where: { id: dateTypeId, isActive: true, OR: [{ workspaceId: workspace.id }, { workspaceId: null, isSystem: true }] },
      select: { id: true }
    });
    if (!dateType) fail(path, "Choose a valid Target Jump Date Type.");
  }

  let broadcastSchedule: ReturnType<typeof parseBroadcastScheduleInput> | null = null;
  if (triggerMode === "BROADCAST") {
    try {
      broadcastSchedule = parseBroadcastScheduleInput(
        value(formData, "broadcastDate"),
        value(formData, "broadcastTime"),
        value(formData, "broadcastTimezone") || workspace.profile?.timezone || "UTC"
      );
    } catch (error) {
      fail(path, error instanceof Error ? error.message : "Choose a valid broadcast schedule.");
    }
  }

  const mixStepIds = values(formData, "mixStepId");
  const stepTemplateIds = values(formData, "stepTemplateId");
  const offsets = values(formData, "dayOffset");
  const sendTimes = values(formData, "sendTimeMinutes");
  if (!stepTemplateIds.length || stepTemplateIds.some((id) => !id)) fail(path, "Add at least one reusable Jump to the Mix.");

  const [templates, existingMix] = await Promise.all([
    prisma.stepTemplate.findMany({
      where: { id: { in: [...new Set(stepTemplateIds)] }, workspaceId: workspace.id, isActive: true },
      include: { versions: { orderBy: { version: "desc" }, take: 1 } }
    }),
    mixIdRaw
      ? prisma.mix.findFirst({
          where: { id: mixIdRaw, workspaceId: workspace.id, status: { not: "ARCHIVED" } },
          include: { steps: { where: { isActive: true } }, assignments: { where: { mode: "DYNAMIC" } } }
        })
      : Promise.resolve(null)
  ]);
  if (mixIdRaw && !existingMix) fail("/mixes", "Mix not found.");

  const templateById = new Map(templates.map((template) => [template.id, template]));
  if (stepTemplateIds.some((id) => !templateById.get(id)?.versions[0])) fail(path, "One or more selected Jumps are unavailable.");

  const groupIds = [...new Set(values(formData, "groupIds").filter(Boolean))];
  if (groupIds.length) {
    const [availableGroups, groupStates] = await Promise.all([
      prisma.group.findMany({ where: { workspaceId: workspace.id, id: { in: groupIds } }, select: { id: true } }),
      listGroupStates(workspace.id)
    ]);
    if (availableGroups.length !== groupIds.length) fail(path, "One or more selected Contact Groups are unavailable.");
    const existingGroupIds = new Set((existingMix?.assignments ?? []).flatMap((assignment) => assignment.groupId ? [assignment.groupId] : []));
    const unavailableNewGroup = mergeGroupActivity(availableGroups, groupStates)
      .some((group) => !group.isActive && !existingGroupIds.has(group.id));
    if (unavailableNewGroup) {
      fail(path, "Inactive Contact Groups cannot be added to a Mix. Reactivate the group from Contacts or choose an active group.");
    }
  }

  const assignAllContacts = formData.get("assignAllContacts") === "on";
  if (triggerMode === "BROADCAST" && !assignAllContacts && !groupIds.length) {
    fail(path, "Choose All active Contacts or at least one Contact Group for the broadcast.");
  }
  const allContactIds = assignAllContacts
    ? (await prisma.contact.findMany({ where: { workspaceId: workspace.id, archivedAt: null }, select: { id: true } })).map((contact) => contact.id)
    : [];

  if (status === "ACTIVE" && existingMix?.status !== "ACTIVE") {
    const activeCount = await prisma.mix.count({
      where: { workspaceId: workspace.id, status: "ACTIVE", ...(mixIdRaw ? { id: { not: mixIdRaw } } : {}) }
    });
    const limit = PLAN_LIMITS[workspace.planTier].mixes;
    if (Number.isFinite(limit) && activeCount >= limit) fail(path, `Your plan allows ${limit} active Mixes.`);
  }

  const mixId = existingMix?.id ?? randomUUID();
  const existingAssignmentByKey = new Map((existingMix?.assignments ?? []).map((assignment) => [assignment.assignmentKey, assignment]));
  const now = new Date();

  try {
    await prisma.$transaction(async (tx) => {
      const durationDays = Math.max(...offsets.map((offset) => Math.abs(Number(offset) || 0)), 0);
      const mixData = {
        name,
        description: description || null,
        framework: framework || null,
        category: category || null,
        industry: industry || null,
        triggerMode,
        dateTypeId: triggerMode === "DATE_TRIGGERED" ? dateTypeId : null,
        status,
        durationDays
      };
      if (existingMix) await tx.mix.update({ where: { id: mixId }, data: mixData });
      else await tx.mix.create({ data: { id: mixId, workspaceId: workspace.id, ...mixData, source: "USER" } });

      if (broadcastSchedule) {
        await tx.mixBroadcastSchedule.upsert({
          where: { mixId },
          create: {
            workspaceId: workspace.id,
            mixId,
            localDate: broadcastSchedule.localDate,
            timeMinutes: broadcastSchedule.timeMinutes,
            timezone: broadcastSchedule.timezone
          },
          update: {
            workspaceId: workspace.id,
            localDate: broadcastSchedule.localDate,
            timeMinutes: broadcastSchedule.timeMinutes,
            timezone: broadcastSchedule.timezone
          }
        });
      } else {
        await tx.mixBroadcastSchedule.deleteMany({ where: { workspaceId: workspace.id, mixId } });
      }

      const retainedIds = new Set<string>();
      for (let index = 0; index < stepTemplateIds.length; index += 1) {
        const template = templateById.get(stepTemplateIds[index])!;
        const version = template.versions[0]!;
        const requestedId = mixStepIds[index] || "";
        const existingStep = existingMix?.steps.find((step) => step.id === requestedId);
        const dayOffset = Number.isFinite(Number(offsets[index])) ? Number(offsets[index]) : 0;
        const parsedTime = Number(sendTimes[index]);
        const sendTimeMinutes = Number.isFinite(parsedTime) && parsedTime >= 0 && parsedTime <= 1439 ? parsedTime : null;
        if (existingStep) {
          await tx.mixStep.update({
            where: { id: existingStep.id },
            data: { stepVersionId: version.id, dayOffset, sendTimeMinutes, sortOrder: index + 1, isActive: true }
          });
          retainedIds.add(existingStep.id);
        } else {
          const created = await tx.mixStep.create({
            data: { mixId, stepVersionId: version.id, dayOffset, sendTimeMinutes, sortOrder: index + 1, isActive: true }
          });
          retainedIds.add(created.id);
        }
      }

      for (const [index, oldStep] of (existingMix?.steps ?? []).filter((step) => !retainedIds.has(step.id)).entries()) {
        const historyCount = await tx.jump.count({ where: { mixStepId: oldStep.id } });
        if (historyCount) await tx.mixStep.update({ where: { id: oldStep.id }, data: { isActive: false, sortOrder: 10000 + index } });
        else await tx.mixStep.delete({ where: { id: oldStep.id } });
      }

      await tx.mixAssignment.updateMany({ where: { workspaceId: workspace.id, mixId, mode: "DYNAMIC" }, data: { isActive: false } });
      for (const groupId of groupIds) {
        const assignmentKey = `${workspace.id}:${mixId}:group:${groupId}`;
        const existing = existingAssignmentByKey.get(assignmentKey);
        const startDate = triggerMode === "MANUAL_START" ? existing?.startDate ?? now : null;
        await tx.mixAssignment.upsert({
          where: { assignmentKey },
          create: { assignmentKey, workspaceId: workspace.id, mixId, groupId, mode: "DYNAMIC", startDate },
          update: { isActive: true, startDate, mode: "DYNAMIC" }
        });
      }
      for (const contactId of allContactIds) {
        const assignmentKey = `${workspace.id}:${mixId}:audience:${contactId}`;
        const existing = existingAssignmentByKey.get(assignmentKey);
        const startDate = triggerMode === "MANUAL_START" ? existing?.startDate ?? now : null;
        await tx.mixAssignment.upsert({
          where: { assignmentKey },
          create: { assignmentKey, workspaceId: workspace.id, mixId, contactId, mode: "DYNAMIC", startDate },
          update: { isActive: true, startDate, mode: "DYNAMIC" }
        });
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
          metadata: {
            triggerMode,
            status,
            jumpCount: stepTemplateIds.length,
            groupCount: groupIds.length,
            allContactCount: allContactIds.length,
            broadcastDate: broadcastSchedule?.dateInput ?? null,
            broadcastTime: broadcastSchedule?.timeInput ?? null,
            broadcastTimezone: broadcastSchedule?.timezone ?? null
          }
        }
      });
    });
  } catch (error) {
    fail(path, error instanceof Error ? error.message : "The Mix could not be saved.");
  }

  await queueMixReconciliation(workspace.id, mixId);
  redirect(`/mixes?${existingMix ? "updated" : "created"}=manual`);
}
