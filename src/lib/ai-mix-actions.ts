"use server";

import type { Channel } from "@/generated/prisma/client";
import { redirect } from "next/navigation";
import {
  AI_MIX_CHANNELS,
  AI_MIX_FRAMEWORKS,
  AI_MIX_OBJECTIVES,
  AI_MIX_PRODUCT_PLACEHOLDERS,
  generateAiMix,
  manualAiMixValidation,
  parseAiMixPreflight,
  parseAiMixValidation,
  refineAiMix,
  validateAiMixDraft,
  type AiMixGeneratedDraft,
  type AiMixPreflight
} from "@/lib/ai-mix";
import {
  cancelAiMixDraftRecord,
  createAiMixDraftRecord,
  publishAiMixDraft,
  saveAiMixDraftRecord
} from "@/lib/ai-mix-service";
import { requireWorkspace } from "@/lib/auth";
import { parseBroadcastScheduleInput, parseTimeInput } from "@/lib/mix-broadcast";
import { PLAN_LIMITS } from "@/lib/plans";
import { prisma } from "@/lib/prisma";
import { consumeRateLimit } from "@/lib/rate-limit";
import { MIX_TEMPLATE_CATEGORIES, MIX_TEMPLATE_INDUSTRIES } from "@/lib/shared-mix";

function value(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function values(formData: FormData, key: string): string[] {
  return formData.getAll(key).map((item) => String(item).trim()).filter(Boolean);
}

function fail(path: string, message: string): never {
  redirect(`${path}${path.includes("?") ? "&" : "?"}error=${encodeURIComponent(message)}`);
}

function finiteInteger(raw: string, fallback: number): number {
  const parsed = Number(raw);
  return Number.isInteger(parsed) ? parsed : fallback;
}

function selectedProductContext(
  profile: {
    product1: string | null;
    product2: string | null;
    product3: string | null;
    product4: string | null;
    product5: string | null;
  } | null,
  placeholder: AiMixPreflight["productPlaceholder"]
): string | null {
  if (!profile || !placeholder) return null;
  const index = AI_MIX_PRODUCT_PLACEHOLDERS.indexOf(placeholder) + 1;
  if (index === 1) return profile.product1;
  if (index === 2) return profile.product2;
  if (index === 3) return profile.product3;
  if (index === 4) return profile.product4;
  if (index === 5) return profile.product5;
  return null;
}

async function buildPreflight(formData: FormData): Promise<{
  workspaceId: string;
  actorUserId: string;
  preflight: AiMixPreflight;
}> {
  const { workspace, user, impersonation } = await requireWorkspace();
  if (impersonation) fail("/mixes/wizard", "Administrator support sessions are view-only.");
  if (!PLAN_LIMITS[workspace.planTier].aiWizard) fail("/mixes/wizard", "The AI Mix Wizard is available on Plus and Pro.");

  const objectiveChoice = value(formData, "objective");
  const objective = objectiveChoice === "Other" ? value(formData, "customObjective") : objectiveChoice;
  if (!objective) fail("/mixes/wizard", "Describe what this Mix should accomplish.");
  if (objectiveChoice && !AI_MIX_OBJECTIVES.includes(objectiveChoice as typeof AI_MIX_OBJECTIVES[number])) {
    fail("/mixes/wizard", "Choose a supported objective.");
  }

  const frameworkChoice = value(formData, "framework");
  const framework = frameworkChoice === "Other" ? value(formData, "customFramework") : frameworkChoice;
  if (!framework) fail("/mixes/wizard", "Choose or describe a strategic framework.");
  if (frameworkChoice && !AI_MIX_FRAMEWORKS.includes(frameworkChoice as typeof AI_MIX_FRAMEWORKS[number])) {
    fail("/mixes/wizard", "Choose a supported framework.");
  }

  const triggerMode = value(formData, "triggerMode") as AiMixPreflight["triggerMode"];
  if (!["DATE_TRIGGERED", "MANUAL_START", "BROADCAST"].includes(triggerMode)) {
    fail("/mixes/wizard", "Choose how the Mix should start.");
  }

  const dateTypeId = value(formData, "dateTypeId") || null;
  const dateType = triggerMode === "DATE_TRIGGERED" && dateTypeId
    ? await prisma.dateType.findFirst({
        where: {
          id: dateTypeId,
          isActive: true,
          OR: [{ workspaceId: workspace.id }, { workspaceId: null, isSystem: true }]
        },
        select: { id: true, name: true }
      })
    : null;
  if (triggerMode === "DATE_TRIGGERED" && !dateType) {
    fail("/mixes/wizard", "Choose an active Target Jump Date Type.");
  }

  const assignAllContacts = formData.get("assignAllContacts") === "on";
  const groupIds = assignAllContacts ? [] : [...new Set(values(formData, "groupIds"))];
  const groups = groupIds.length
    ? await prisma.group.findMany({ where: { workspaceId: workspace.id, id: { in: groupIds } }, select: { id: true, name: true } })
    : [];
  if (groups.length !== groupIds.length) fail("/mixes/wizard", "One or more selected Contact Groups are unavailable.");
  if (!assignAllContacts && !groupIds.length) {
    fail("/mixes/wizard", "Choose All active Contacts or at least one Contact Group.");
  }

  const channels = [...new Set(values(formData, "channels"))] as Channel[];
  if (!channels.length || channels.some((channel) => !AI_MIX_CHANNELS.includes(channel))) {
    fail("/mixes/wizard", "Choose at least one supported channel.");
  }
  if (channels.includes("VOICEMAIL") && PLAN_LIMITS[workspace.planTier].ringlessVoicemailsPerMonth === 0) {
    fail("/mixes/wizard", "Voicemail Jumps are available on Pro.");
  }

  const productValue = value(formData, "productPlaceholder");
  const productPlaceholder = productValue
    ? AI_MIX_PRODUCT_PLACEHOLDERS.find((item) => item === productValue) ?? null
    : null;
  if (productValue && !productPlaceholder) fail("/mixes/wizard", "Choose a supported My Product placeholder.");

  const industryChoice = value(formData, "industryContext");
  const industryContext = industryChoice === "MY_INFO"
    ? workspace.profile?.industry?.trim() || null
    : industryChoice === "CUSTOM"
      ? value(formData, "customIndustry") || null
      : null;
  if (industryChoice === "CUSTOM" && !industryContext) fail("/mixes/wizard", "Enter the industry or market context.");

  const preferredTimeRaw = value(formData, "preferredSendTime");
  const preferredSendTimeMinutes = preferredTimeRaw ? parseTimeInput(preferredTimeRaw) : null;
  if (preferredTimeRaw && preferredSendTimeMinutes === null) fail("/mixes/wizard", "Choose a valid preferred send time.");

  const broadcastDate = value(formData, "broadcastDate") || null;
  const broadcastTime = value(formData, "broadcastTime") || null;
  const broadcastTimezone = value(formData, "broadcastTimezone") || workspace.profile?.timezone || "UTC";
  if (triggerMode === "BROADCAST") {
    try {
      parseBroadcastScheduleInput(broadcastDate ?? "", broadcastTime ?? "", broadcastTimezone);
    } catch (error) {
      fail("/mixes/wizard", error instanceof Error ? error.message : "Choose a valid broadcast schedule.");
    }
  }

  const preflight = parseAiMixPreflight({
    objective,
    tone: value(formData, "tone") || "Warm",
    framework,
    triggerMode,
    dateTypeId: dateType?.id ?? null,
    dateTypeName: dateType?.name ?? null,
    groupIds,
    groupNames: groups.map((group) => group.name),
    assignAllContacts,
    broadcastDate: triggerMode === "BROADCAST" ? broadcastDate : null,
    broadcastTime: triggerMode === "BROADCAST" ? broadcastTime : null,
    broadcastTimezone,
    durationDays: finiteInteger(value(formData, "durationDays"), 14),
    touches: finiteInteger(value(formData, "touches"), 5),
    cadence: value(formData, "cadence") || "BALANCED",
    channels,
    productPlaceholder,
    productContext: selectedProductContext(workspace.profile, productPlaceholder),
    industryContext,
    customContext: value(formData, "customContext") || null,
    preferredSendTimeMinutes,
    includeOptOut: formData.get("includeOptOut") === "on",
    quietHoursStart: workspace.profile?.quietHoursStart ?? 1200,
    quietHoursEnd: workspace.profile?.quietHoursEnd ?? 480
  });

  return { workspaceId: workspace.id, actorUserId: user.id, preflight };
}

async function requireEditableDraft(draftId: string) {
  const { workspace, user, impersonation } = await requireWorkspace();
  const path = `/mixes/wizard/${draftId}`;
  if (impersonation) fail(path, "Administrator support sessions are view-only.");
  if (!PLAN_LIMITS[workspace.planTier].aiWizard) fail("/mixes", "The AI Mix Wizard is available on Plus and Pro.");
  const draft = await prisma.aiMixDraft.findFirst({ where: { id: draftId, workspaceId: workspace.id } });
  if (!draft) fail("/mixes/wizard", "AI Mix draft not found.");
  if (draft.status !== "DRAFT") fail("/mixes/wizard", "This AI Mix draft is no longer editable.");
  if (draft.expiresAt <= new Date()) {
    await prisma.aiMixDraft.updateMany({ where: { id: draft.id, workspaceId: workspace.id, status: "DRAFT" }, data: { status: "EXPIRED" } });
    fail("/mixes/wizard", "This AI Mix draft expired. Start a new draft.");
  }
  return { workspace, user, draft, path, preflight: parseAiMixPreflight(draft.preflightPayload) };
}

function editorDraft(formData: FormData, preflight: AiMixPreflight, path: string): AiMixGeneratedDraft {
  const stepCount = finiteInteger(value(formData, "stepCount"), 0);
  if (stepCount < 1 || stepCount > 7) fail(path, "The draft must contain between one and seven Jumps.");

  const steps: AiMixGeneratedDraft["steps"] = [];
  for (let index = 0; index < stepCount; index += 1) {
    if (formData.get(`stepKeep-${index}`) !== "on") continue;
    const channel = value(formData, `stepChannel-${index}`) as Channel;
    if (!AI_MIX_CHANNELS.includes(channel)) fail(path, `Jump #${index + 1} uses an unsupported channel.`);
    const timeRaw = value(formData, `stepSendTime-${index}`);
    const sendTimeMinutes = timeRaw ? parseTimeInput(timeRaw) : null;
    if (timeRaw && sendTimeMinutes === null) fail(path, `Jump #${index + 1} has an invalid send time.`);
    const body = value(formData, `stepBody-${index}`) || null;
    steps.push({
      name: value(formData, `stepName-${index}`),
      channel,
      dayOffset: finiteInteger(value(formData, `stepDayOffset-${index}`), 0),
      sendTimeMinutes,
      subject: value(formData, `stepSubject-${index}`) || null,
      body,
      script: value(formData, `stepScript-${index}`) || null,
      longSms: channel === "SMS" && (body?.length ?? 0) > 160,
      includeOptOut: formData.get(`stepIncludeOptOut-${index}`) === "on"
    });
  }
  if (!steps.length) fail(path, "Keep at least one Jump in the draft.");

  try {
    return validateAiMixDraft({
      name: value(formData, "name"),
      description: value(formData, "description"),
      category: value(formData, "category") || MIX_TEMPLATE_CATEGORIES[0],
      industry: value(formData, "industry") || MIX_TEMPLATE_INDUSTRIES.at(-1),
      framework: value(formData, "draftFramework"),
      durationDays: preflight.durationDays,
      steps
    }, preflight);
  } catch (error) {
    fail(path, error instanceof Error ? error.message : "The AI Mix draft is invalid.");
  }
}

export async function generateAiMixDraftAction(formData: FormData): Promise<void> {
  const { workspaceId, actorUserId, preflight } = await buildPreflight(formData);
  const decision = await consumeRateLimit({
    scope: "ai-mix.generate",
    identifiers: [workspaceId, actorUserId],
    limit: 12,
    windowMs: 60 * 60 * 1000,
    blockMs: 15 * 60 * 1000
  });
  if (!decision.allowed) fail("/mixes/wizard", `Too many AI Mix requests. Try again in ${decision.retryAfterSeconds} seconds.`);

  await prisma.aiMixDraft.updateMany({
    where: { workspaceId, status: "DRAFT", expiresAt: { lte: new Date() } },
    data: { status: "EXPIRED" }
  });

  let result: Awaited<ReturnType<typeof generateAiMix>>;
  try {
    result = await generateAiMix(preflight);
  } catch (error) {
    fail("/mixes/wizard", error instanceof Error ? error.message : "The Mix draft could not be generated.");
  }
  const draftId = await createAiMixDraftRecord({
    workspaceId,
    actorUserId,
    preflight,
    generatedMix: result.draft,
    validation: result.validation
  });
  redirect(`/mixes/wizard/${draftId}?generated=1`);
}

export async function saveAiMixDraftAction(formData: FormData): Promise<void> {
  const draftId = value(formData, "draftId");
  const context = await requireEditableDraft(draftId);
  const generatedMix = editorDraft(formData, context.preflight, context.path);
  const validation = manualAiMixValidation(context.draft.validation);
  try {
    await saveAiMixDraftRecord({
      workspaceId: context.workspace.id,
      actorUserId: context.user.id,
      draftId,
      generatedMixValue: generatedMix,
      validationValue: validation
    });
  } catch (error) {
    fail(context.path, error instanceof Error ? error.message : "The AI Mix draft could not be saved.");
  }
  redirect(`${context.path}?saved=1`);
}

export async function refineAiMixDraftAction(formData: FormData): Promise<void> {
  const draftId = value(formData, "draftId");
  const context = await requireEditableDraft(draftId);
  const currentDraft = editorDraft(formData, context.preflight, context.path);
  const decision = await consumeRateLimit({
    scope: "ai-mix.refine",
    identifiers: [context.workspace.id, context.user.id],
    limit: 30,
    windowMs: 60 * 60 * 1000,
    blockMs: 15 * 60 * 1000
  });
  if (!decision.allowed) fail(context.path, `Too many refinement requests. Try again in ${decision.retryAfterSeconds} seconds.`);

  let result: Awaited<ReturnType<typeof refineAiMix>>;
  try {
    result = await refineAiMix({
      preflightValue: context.preflight,
      draftValue: currentDraft,
      presetValue: value(formData, "refinementPreset"),
      customInstruction: value(formData, "customRefinement") || null,
      revision: parseAiMixValidation(context.draft.validation).revision
    });
    await saveAiMixDraftRecord({
      workspaceId: context.workspace.id,
      actorUserId: context.user.id,
      draftId,
      generatedMixValue: result.draft,
      validationValue: result.validation
    });
  } catch (error) {
    fail(context.path, error instanceof Error ? error.message : "The AI Mix draft could not be refined.");
  }
  redirect(`${context.path}?refined=1`);
}

export async function publishAiMixDraftAction(formData: FormData): Promise<void> {
  const draftId = value(formData, "draftId");
  const context = await requireEditableDraft(draftId);
  const generatedMix = editorDraft(formData, context.preflight, context.path);
  let mixId: string;
  try {
    mixId = await publishAiMixDraft({
      workspaceId: context.workspace.id,
      actorUserId: context.user.id,
      draftId,
      generatedMixValue: generatedMix,
      validationValue: context.draft.validation
    });
  } catch (error) {
    fail(context.path, error instanceof Error ? error.message : "The editable Mix Draft could not be created.");
  }
  redirect(`/mixes/${mixId}/edit?created=wizard`);
}

export async function cancelAiMixDraftAction(formData: FormData): Promise<void> {
  const draftId = value(formData, "draftId");
  const context = await requireEditableDraft(draftId);
  await cancelAiMixDraftRecord(context.workspace.id, context.user.id, draftId);
  redirect("/mixes/wizard?canceled=1");
}
