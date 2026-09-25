"use server";

import { randomUUID } from "node:crypto";
import { validateStepTiming } from "@/lib/step-timing";
import type { Channel, MixStatus, MixTriggerMode } from "@/generated/prisma/client";
import { redirect } from "next/navigation";
import { requireWorkspace } from "@/lib/auth";
import { type ErrorViewer, withViewerError } from "@/lib/form-errors";
import { listGroupStates, mergeGroupActivity } from "@/lib/group-activity";
import { parseBroadcastScheduleInput } from "@/lib/mix-broadcast";
import { containsPrivateNotesPlaceholder, findUnknownPlaceholders } from "@/lib/placeholders";
import { preparationFamilyForChannel, type PreparationFamily } from "@/lib/preparation-family";
import { variantFieldsForFamily } from "@/lib/preparation-variants";
import { prisma } from "@/lib/prisma";
import { readWorkflowDefinition, saveWorkflowConfiguration } from "@/lib/mix-workflow";
import { refreshSharesOf } from "@/lib/marketplace-service";
import { startDraftMix } from "@/lib/mix-start";
import { timezoneForUser } from "@/lib/display-preferences";
import { zonedDateTimeToUtc } from "@/lib/jump-schedule";
import { UserFacingError } from "@/lib/user-facing-error";

const MAX_STEP_OFFSET_DAYS = 365;
const MIX_CHANGED_ELSEWHERE = "This Mix was changed on another device after you opened it. Reload to compare, then apply your changes again.";
/** A newer save exists. Nothing was written; the open editor keeps the owner's entries and shows why. */
class MixChangedElsewhere extends Error {}
/** A refusal this module writes in its own words during the save; the page shows it as it is. */
class MixSaveRefusal extends Error {}
const CHANNELS: Channel[] = ["SMS", "EMAIL", "PHONE_CALL", "VOICEMAIL", "WHATSAPP"];

type InlineVariant = { family: PreparationFamily; subject: string | null; body: string | null; script: string | null };

type InlineAction = {
  name: string;
  channel: Channel;
  subject: string | null;
  body: string | null;
  script: string | null;
  /** Authored wording for the beat's other channel families (Slice 3); a blank version is not offered. */
  variants: InlineVariant[];
};

/**
 * The beat's alternatives. A version is authored when its wording is present; the beat's own family
 * is never an alternative. Outward wording (text, email) refuses private-note tokens exactly as a
 * non-call beat does; an email version needs a subject; every version uses only known tokens.
 */
function validateInlineVariants(formData: FormData, index: number, channel: Channel, path: string, viewer: ErrorViewer): InlineVariant[] {
  const primary = preparationFamilyForChannel(channel);
  const beat = `Beat ${index + 1}`;
  const candidates: Array<{ family: PreparationFamily; label: string; content: { subject: string | null; body: string | null; script: string | null } }> = [
    { family: "TEXT", label: "text version", content: { subject: null, body: value(formData, `variantTextBody-${index}`, 20_000) || null, script: null } },
    { family: "EMAIL", label: "email version", content: { subject: value(formData, `variantEmailSubject-${index}`, 300) || null, body: value(formData, `variantEmailBody-${index}`, 20_000) || null, script: null } },
    { family: "CALL", label: "call version", content: { subject: null, body: null, script: value(formData, `variantCallScript-${index}`, 20_000) || null } }
  ];
  const variants: InlineVariant[] = [];
  for (const candidate of candidates) {
    if (candidate.family === primary) continue;
    const content = variantFieldsForFamily(candidate.family, candidate.content);
    const wording = candidate.family === "CALL" ? content.script : content.body;
    if (!wording) {
      if (candidate.family === "EMAIL" && content.subject) fail(path, `${beat}'s email version has a subject but no message.`, viewer);
      continue;
    }
    if (candidate.family === "EMAIL" && !content.subject) fail(path, `${beat}'s email version needs a subject.`, viewer);
    const text = [content.subject, content.body, content.script].filter(Boolean).join("\n");
    const unknown = findUnknownPlaceholders(text);
    if (unknown.length) fail(path, `${beat}'s ${candidate.label} uses unsupported placeholders: ${unknown.join(", ")}`, viewer);
    if (candidate.family !== "CALL" && containsPrivateNotesPlaceholder(text)) fail(path, `Private notes may only be inserted into ${beat}'s call version.`, viewer);
    variants.push({ family: candidate.family, ...content });
  }
  return variants;
}

function value(formData: FormData, key: string, maximum = 4000): string {
  return String(formData.get(key) ?? "").trim().slice(0, maximum);
}

function values(formData: FormData, key: string): string[] {
  return formData.getAll(key).map((item) => String(item));
}

function fail(path: string, message: string, viewer: ErrorViewer): never {
  redirect(withViewerError(path, message, viewer));
}

function validateInlineAction(formData: FormData, index: number, path: string, viewer: ErrorViewer): InlineAction {
  const name = value(formData, `inlineName-${index}`, 160);
  const channel = value(formData, `inlineChannel-${index}`, 40) as Channel;
  const subject = value(formData, `inlineSubject-${index}`, 300) || null;
  const body = value(formData, `inlineBody-${index}`, 20_000) || null;
  const script = value(formData, `inlineScript-${index}`, 20_000) || null;
  if (!name) fail(path, `Give action #${index + 1} an internal name.`, viewer);
  if (!CHANNELS.includes(channel)) fail(path, `Choose a valid channel for action #${index + 1}.`, viewer);
  if (channel === "EMAIL" && (!subject || !body)) fail(path, `Email action #${index + 1} requires a subject and message.`, viewer);
  if (["SMS", "WHATSAPP"].includes(channel) && !body) fail(path, `Beat ${index + 1} requires a prepared message.`, viewer);
  if (["PHONE_CALL", "VOICEMAIL"].includes(channel) && !script) fail(path, `Beat ${index + 1} requires call or voicemail notes.`, viewer);
  const content = [subject, body, script].filter(Boolean).join("\n");
  const unknown = findUnknownPlaceholders(content);
  if (unknown.length) fail(path, `Beat ${index + 1} uses unsupported placeholders: ${unknown.join(", ")}`, viewer);
  if (channel !== "PHONE_CALL" && containsPrivateNotesPlaceholder(content)) {
    fail(path, `Private notes may only be inserted into phone-call follow-up #${index + 1}.`, viewer);
  }
  return {
    name,
    channel,
    subject,
    body,
    script,
    variants: validateInlineVariants(formData, index, channel, path, viewer)
  };
}

/**
 * Saves the editor. Every outcome redirects except a save refused because the Mix changed on another
 * device: that one returns its message, so the open editor keeps what the owner typed.
 */
export async function saveMixAction(formData: FormData): Promise<{ error: string } | undefined> {
  const { session, workspace, user, impersonation } = await requireWorkspace();
  const workspaceTimezone = await timezoneForUser(user.id);
  const mixIdRaw = value(formData, "mixId", 100);
  // The Mix's last save as the editor saw it when it opened; blank on an older form or a new Mix.
  const openedAt = value(formData, "mixUpdatedAt", 40);
  const name = value(formData, "name", 160);
  const description = value(formData, "description", 1200);
  const framework = value(formData, "framework", 160);
  const category = value(formData, "category", 120);
  const industry = value(formData, "industry", 120);
  const afterMix = value(formData, "triggerMode", 40) === "AFTER_MIX";
  const previousCue = afterMix && mixIdRaw ? await prisma.mix.findFirst({ where: { id: mixIdRaw, workspaceId: workspace.id }, select: { triggerMode: true, dateTypeId: true } }) : null;
  const triggerMode = (afterMix ? previousCue?.triggerMode ?? "MANUAL_START" : value(formData, "triggerMode", 40)) as MixTriggerMode;
  const status = value(formData, "status", 40) as MixStatus;
  const dateTypeId = afterMix ? previousCue?.dateTypeId ?? "" : value(formData, "dateTypeId", 100);
  const path = mixIdRaw ? `/mixes/${mixIdRaw}/edit` : "/mixes/new";
  const allowedTriggers: MixTriggerMode[] = ["DATE_TRIGGERED", "MANUAL_START", "BROADCAST"];
  const allowedStatuses: MixStatus[] = ["DRAFT", "ACTIVE", "PAUSED"];

  if (impersonation) fail(path, "Administrator support sessions are view-only.", session);
  if (!name) fail(path, "Give the mix a name.", session);
  if (!allowedTriggers.includes(triggerMode)) fail(path, "Choose a valid cue.", session);
  if (!allowedStatuses.includes(status)) fail(path, "Choose Draft, Active, or Paused.", session);
  if (status === "ACTIVE" && value(formData, "activationConfirmed", 4) !== "1") {
    const preference = await prisma.userPreference.findUnique({ where: { userId: user.id }, select: { reviewMixActivation: true } });
    if (preference?.reviewMixActivation !== false) fail(path, "Review who gets the mix before turning it on.", session);
  }

  if (triggerMode === "DATE_TRIGGERED") {
    const dateType = await prisma.dateType.findFirst({
      where: { id: dateTypeId, isActive: true, OR: [{ workspaceId: workspace.id }, { workspaceId: null, isSystem: true }] },
      select: { id: true }
    });
    if (!dateType) fail(path, "Choose a valid saved date type.", session);
  }

  let broadcastSchedule: ReturnType<typeof parseBroadcastScheduleInput> | null = null;
  if (triggerMode === "BROADCAST") {
    const savedBroadcast = afterMix && mixIdRaw ? await prisma.mixBroadcastSchedule.findFirst({ where: { mixId: mixIdRaw, workspaceId: workspace.id } }) : null;
    try {
      broadcastSchedule = savedBroadcast ? { ...savedBroadcast, dateInput: savedBroadcast.localDate.toISOString().slice(0, 10), timeInput: `${String(Math.floor(savedBroadcast.timeMinutes / 60)).padStart(2, "0")}:${String(savedBroadcast.timeMinutes % 60).padStart(2, "0")}` } : parseBroadcastScheduleInput(
        value(formData, "broadcastDate", 10),
        value(formData, "broadcastTime", 5),
        value(formData, "broadcastTimezone", 120) || workspaceTimezone
      );
    } catch (error) {
      // Only the pure parser runs in this try (the saved schedule is read above it), so the text is its own wording.
      fail(path, error instanceof Error ? error.message : "Choose a valid fixed date and time.", session);
    }
  }

  const mixStepIds = values(formData, "mixStepId");
  const offsets = values(formData, "dayOffset");
  const sendTimes = values(formData, "sendTimeMinutes");
  const plannedAts = values(formData, "plannedAt");
  const anchors = values(formData, "anchor");
  const offsetMinutes = values(formData, "offsetMinutes");
  const stepCount = offsets.length;
  if (!stepCount || stepCount > 50) fail(path, "Add between one and fifty beats to the mix.", session);
  if ([mixStepIds, sendTimes, plannedAts, anchors, offsetMinutes].some((items) => items.length !== stepCount)) fail(path, "The beat sequence is incomplete. Reload and try again.", session);
  // Elapsed-minute timing for a plan bound to a visit; a calendar-day beat keeps its day rule. validateStepTiming is
  // pure, so what it throws is its own per-Beat wording.
  const parsedTimings = anchors.map((anchor, index) => {
    try { return validateStepTiming(anchor, offsetMinutes[index] ?? "", index + 1); }
    catch (error) { return fail(path, error instanceof Error ? error.message : `Beat ${index + 1} has an invalid timing.`, session); }
  });

  const parsedOffsets = offsets.map((raw, index) => {
    const parsed = Number(raw);
    if (!Number.isInteger(parsed) || parsed < -MAX_STEP_OFFSET_DAYS || parsed > MAX_STEP_OFFSET_DAYS) {
      fail(path, `Beat ${index + 1} must be between -${MAX_STEP_OFFSET_DAYS} and ${MAX_STEP_OFFSET_DAYS} days.`, session);
    }
    return parsed;
  });
  if (parsedTimings.some((timing) => timing.anchor !== "CALENDAR_DAY") && triggerMode !== "MANUAL_START") {
    fail(path, "Minutes from an appointment apply to a mix that starts when you bind it to a visit. Choose \"When I start it for someone\" as the cue, or time the beat by calendar day.", session);
  }
  if (triggerMode === "MANUAL_START" && parsedOffsets.some((offset, index) => offset < 0 && parsedTimings[index].anchor === "CALENDAR_DAY")) {
    fail(path, "A manually started mix cannot schedule a follow-up before its start date.", session);
  }
  const parsedSendTimes = sendTimes.map((raw, index) => {
    if (!raw) return null;
    const parsed = Number(raw);
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > 1439) fail(path, `Beat ${index + 1} has an invalid local time.`, session);
    return parsed;
  });
  // A planned beat carries a wall-clock instant in the workspace timezone ("YYYY-MM-DDTHH:mm").
  const parsedPlannedAts = plannedAts.map((raw, index) => {
    if (!raw) return null;
    const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(raw);
    if (!match) return fail(path, `Beat ${index + 1} has an invalid planned date.`, session);
    const [year, month, day, hours, minutes] = match.slice(1).map(Number);
    const at = zonedDateTimeToUtc({ year, month, day }, hours * 60 + minutes, workspaceTimezone);
    if (Number.isNaN(at.getTime())) return fail(path, `Beat ${index + 1} has an invalid planned date.`, session);
    return at;
  });
  const inlineActions = offsets.map((_, index) => validateInlineAction(formData, index, path, session));

  const existingMix = await (mixIdRaw
      ? prisma.mix.findFirst({
          where: { id: mixIdRaw, workspaceId: workspace.id, status: { not: "ARCHIVED" } },
          include: {
            steps: { include: { stepVersion: { include: { stepTemplate: true } } } },
            assignments: { where: { mode: "DYNAMIC" } }
          }
        })
      : Promise.resolve(null));
  if (mixIdRaw && !existingMix) fail("/mixes", "Mix not found.", session);

  const groupIds = [...new Set(values(formData, "groupIds").filter(Boolean))];
  if (groupIds.length) {
    const [availableGroups, groupStates] = await Promise.all([
      prisma.group.findMany({ where: { workspaceId: workspace.id, id: { in: groupIds } }, select: { id: true } }),
      listGroupStates(workspace.id)
    ]);
    if (availableGroups.length !== groupIds.length) fail(path, "One or more selected tags are unavailable.", session);
    const existingGroupIds = new Set((existingMix?.assignments ?? []).flatMap((assignment) => assignment.groupId ? [assignment.groupId] : []));
    const unavailableNewGroup = mergeGroupActivity(availableGroups, groupStates).some((group) => !group.isActive && !existingGroupIds.has(group.id));
    if (unavailableNewGroup) fail(path, "Hidden tags cannot be added to a mix.", session);
  }
  const assignAllContacts = formData.get("assignAllContacts") === "on";
  // A mix that starts when the owner chooses needs no audience to be on: it is started from one
  // person's page or lined up with a visit from the calendar. Elapsed beats never count as scheduled
  // for an enrollment without an appointment, so the projection below counts calendar-day beats only.
  if (status === "ACTIVE" && !afterMix && triggerMode !== "MANUAL_START" && !assignAllContacts && !groupIds.length) fail(path, "Choose everyone or at least one tag before turning on the mix.", session);
  const calendarStepCount = parsedTimings.filter((timing) => timing.anchor === "CALENDAR_DAY").length;
  if (triggerMode === "BROADCAST" && !assignAllContacts && !groupIds.length) fail(path, "Choose who gets the mix.", session);

  const allContactIds = assignAllContacts
    ? (await prisma.contact.findMany({ where: { workspaceId: workspace.id, archivedAt: null }, select: { id: true } })).map((contact) => contact.id)
    : [];
  const mixId = existingMix?.id ?? randomUUID();
  const existingAssignmentByKey = new Map((existingMix?.assignments ?? []).map((assignment) => [assignment.assignmentKey, assignment]));
  const now = new Date();
  const durationDays = Math.max(...parsedOffsets) - Math.min(...parsedOffsets);

  try {
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Workspace" WHERE id = ${workspace.id} FOR UPDATE`;
      // Saves queue on the workspace lock, so this read sees every save that finished since the editor
      // opened. A newer one from another device is refused rather than overwritten; the entries stay on
      // screen and the owner reloads to compare.
      if (existingMix && openedAt) {
        const current = await tx.mix.findUnique({ where: { id: mixId }, select: { updatedAt: true } });
        if (!current || current.updatedAt.getTime() !== Date.parse(openedAt)) throw new MixChangedElsewhere(MIX_CHANGED_ELSEWHERE);
      }
      const freshStart = Boolean(existingMix && status === "ACTIVE" && triggerMode === "MANUAL_START"
        && await startDraftMix(tx, { workspaceId: workspace.id, mixId, now }));
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
        const action = inlineActions[index];
        const template = await tx.stepTemplate.create({
          data: {
            workspaceId: workspace.id,
            // The editor displays this as the Beat's own name. Repeated saves must
            // retain that wording, rather than prepend the Mix name each time.
            name: action.name,
            channel: action.channel,
            isActive: false,
            versions: { create: { version: 1, subject: action.subject, body: action.body, script: action.script, longSms: action.channel === "SMS" && (action.body?.length ?? 0) > 160, variants: { create: action.variants } } }
          },
          include: { versions: true }
        });
        const version = template.versions[0];
        if (!version) throw new MixSaveRefusal(`Follow-up #${index + 1} could not be created.`);
        const stepVersionId = version.id;
        if (existingStep && !existingStep.stepVersion.stepTemplate.isActive) replacedInternalTemplateIds.add(existingStep.stepVersion.stepTemplateId);
        if (existingStep) {
          await tx.mixStep.update({ where: { id: existingStep.id }, data: { stepVersionId, dayOffset: parsedOffsets[index], sendTimeMinutes: parsedSendTimes[index], plannedAt: parsedPlannedAts[index], anchor: parsedTimings[index].anchor, offsetMinutes: parsedTimings[index].offsetMinutes, sortOrder: index + 1, isActive: true } });
          retainedIds.add(existingStep.id);
        } else {
          const created = await tx.mixStep.create({ data: { mixId, stepVersionId, dayOffset: parsedOffsets[index], sendTimeMinutes: parsedSendTimes[index], plannedAt: parsedPlannedAts[index], anchor: parsedTimings[index].anchor, offsetMinutes: parsedTimings[index].offsetMinutes, sortOrder: index + 1, isActive: true } });
          retainedIds.add(created.id);
        }
      }

      for (const [index, oldStep] of (existingMix?.steps ?? []).filter((step) => !retainedIds.has(step.id)).entries()) {
        const workflow = await readWorkflowDefinition(tx, workspace.id);
        if (workflow.rules.some(rule => rule.source.stepId === oldStep.id || rule.routes.some(route => route.target?.stepId === oldStep.id) || rule.join?.target.stepId === oldStep.id)) throw new MixSaveRefusal(`Remove the Journey connections for this Beat before removing it from the Mix.`);
        if (workflow.gatedStepIds.includes(oldStep.id)) throw new MixSaveRefusal("Restore this Beat’s scheduled start in Journey before removing it from the Mix.");
        // Saved workflow snapshots can refer to a future Beat before its Jump exists.
        // Retire its definition so those exact runs can still fulfill their obligations.
        await tx.mixStep.update({ where: { id: oldStep.id }, data: { isActive: false, sortOrder: 20_000 + index } });
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
        const startDate = triggerMode === "MANUAL_START" ? freshStart ? now : existing?.startDate ?? now : null;
        await tx.mixAssignment.upsert({ where: { assignmentKey }, create: { assignmentKey, workspaceId: workspace.id, mixId, groupId, mode: "DYNAMIC", startDate }, update: { isActive: true, startDate, mode: "DYNAMIC" } });
      }
      for (const contactId of allContactIds) {
        const assignmentKey = `${workspace.id}:${mixId}:audience:${contactId}`;
        const existing = existingAssignmentByKey.get(assignmentKey);
        const startDate = triggerMode === "MANUAL_START" ? freshStart ? now : existing?.startDate ?? now : null;
        await tx.mixAssignment.upsert({ where: { assignmentKey }, create: { assignmentKey, workspaceId: workspace.id, mixId, contactId, mode: "DYNAMIC", startDate }, update: { isActive: true, startDate, mode: "DYNAMIC" } });
      }

      if (afterMix) {
        const sourceId = value(formData, "completionSourceId", 160);
        if (!sourceId || sourceId === mixId) throw new MixSaveRefusal("Choose another Mix as the start. Configure deliberate loops in Journey with a repeat limit.");
        const definition = await readWorkflowDefinition(tx, workspace.id);
        const id = `mix-start:${mixId}`;
        await saveWorkflowConfiguration(tx, workspace.id, { rules: [...definition.rules.filter(rule => rule.id !== id), { id, name: `Start ${name}`, source: { mixId: sourceId, stepId: null }, enabled: status === "ACTIVE", mode: "PARALLEL", routes: [{ id: `${id}:next`, label: "After this Mix finishes", when: "FINISHED", outcome: "", delayMinutes: 0, target: { mixId, stepId: null }, maxVisits: null, replace: false }], join: null }], gatedStepIds: definition.gatedStepIds, intentionalEnds: definition.intentionalEnds }, Number(value(formData, "workflowRevision", 20)), user.id);
      }
      if (!afterMix && existingMix) {
        const definition = await readWorkflowDefinition(tx, workspace.id);
        const id = `mix-start:${mixId}`;
        if (definition.rules.some(rule => rule.id === id)) await saveWorkflowConfiguration(tx, workspace.id, { rules: definition.rules.filter(rule => rule.id !== id), gatedStepIds: definition.gatedStepIds, intentionalEnds: definition.intentionalEnds }, Number(value(formData, "workflowRevision", 20)), user.id);
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
          metadata: { triggerMode, status, followUpCount: stepCount, visitTimedCount: stepCount - calendarStepCount, tagCount: groupIds.length, allContactCount: allContactIds.length, projectedFollowUpCount: (groupIds.length ? null : allContactIds.length * calendarStepCount) }
        }
      });
      await tx.job.create({ data: { workspaceId: workspace.id, task: "generate-jumps", payload: { mixId } } });
    });
  } catch (error) {
    if (error instanceof MixChangedElsewhere) return { error: error.message };
    fail(path, error instanceof MixSaveRefusal || error instanceof UserFacingError ? error.message : "The mix could not be saved.", session);
  }

  // Committed. The Marketplace shares of this Mix and of its Mega-Mix now show what was saved. Refreshed out
  // here, because a Mega-Mix export inside the save would hold the workspace lock and risk its timeout; it
  // never throws.
  await refreshSharesOf({ workspaceId: workspace.id, mixIds: [mixId] });
  redirect(`/mixes/${mixId}/edit?${existingMix ? "updated" : "created"}=manual`);
}
