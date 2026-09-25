"use server";

import { captureFormFailure, recoverableFormAction, type FormResult } from "@/lib/form-errors";
import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { requireWritableWorkspace } from "@/lib/writable-workspace";
import { generateJumps } from "@/lib/jump-engine";
import { isValidTimezone } from "@/lib/mix-broadcast";
import { prisma } from "@/lib/prisma";
import { splitContactName } from "@/lib/quick-add-capture";
import { ensureStarterMix } from "@/lib/starter-mix";
import { buildEmailInputs, buildPhoneInputs } from "@/lib/contact-input";
import { DEFAULT_PHONE_REGION, canonicalPhoneKey, workspacePhoneRegion } from "@/lib/phone-number";
import { onboardingUses, onboardingReasons } from "@/lib/onboarding-options";
import { storedMarketingScenario } from "@/lib/marketing-scenarios";

function value(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function fail(path: string, message: string): never {
  captureFormFailure(message);
  redirect(`${path}${path.includes("?") ? "&" : "?"}error=${encodeURIComponent(message)}`);
}

async function queueJumpReconciliation(workspaceId: string): Promise<void> {
  await prisma.job.create({ data: { workspaceId, task: "generate-jumps", payload: {} } });
}

function welcomePath(firstContact: string | null): string {
  const params = new URLSearchParams({ welcome: "1" });
  if (firstContact) {
    params.set("range", "all");
    params.set("firstContact", firstContact);
  }
  return `/jumps?${params.toString()}`;
}

export async function completeOnboardingAction(formData: FormData): Promise<void> {
  const { workspace, user } = await requireWritableWorkspace((message) => fail("/onboarding", message));
  const uses = onboardingUses(formData.getAll("useCase").map(String));
  const business = uses.includes("business");
  if (!uses.length) fail("/onboarding", "Choose how you want to use Jump in the Mix.");
  const path = `/onboarding?${new URLSearchParams(uses.map(use => ["useCase", use])).toString()}`;
  const businessType = business ? value(formData, "businessType") || "Other" : null;
  const businessName = !business && !uses.includes("networking") ? "" : value(formData, "businessName").slice(0, 200);
  const smsSignature = value(formData, "smsSignature") || user.name;
  const savedContactId = value(formData, "contactId");
  const savedContact = savedContactId ? await prisma.contact.findFirst({ where: { id: savedContactId, workspaceId: workspace.id, archivedAt: null } }) : null;
  if (savedContactId && !savedContact) fail(path, "Choose an active person from your contacts.");
  const contactName = value(formData, "contactName");
  const { firstName, lastName } = splitContactName(contactName);
  const contactEmail = value(formData, "contactEmail").toLowerCase();
  const contactPhone = value(formData, "contactPhone");
  const marketingPreference = await prisma.workspaceMarketingPreference.findUnique({ where: { workspaceId: workspace.id } });
  const scenario = storedMarketingScenario(marketingPreference?.scenario, marketingPreference?.version);
  const starterChoice = value(formData, "starterChoice");
  const reason = starterChoice === "suggested" && business && scenario ? scenario.reason : value(formData, "reason") || onboardingReasons(uses)[0];
  if (!onboardingReasons(uses).includes(reason)) fail(path, "Choose a follow-up that fits your selected use.");
  const followUpDate = value(formData, "followUpDate");
  const privateContext = value(formData, "privateContext").slice(0, 1000);
  const timezone = value(formData, "timezone");
  const displayName = savedContact?.displayName ?? [firstName, lastName].filter(Boolean).join(" ");

  if (!displayName || !followUpDate) fail(path, "Add a person and choose when you want to follow up.");
  if (!isValidTimezone(timezone)) fail(path, "Choose a valid timezone before creating the first follow-up.");
  const phoneRegion = contactPhone ? await workspacePhoneRegion(prisma, workspace.id) : null;
  let emails;
  let phones;
  try {
    emails = buildEmailInputs(contactEmail ? [contactEmail] : [], ["Email"]);
    phones = buildPhoneInputs(contactPhone ? [contactPhone] : [], ["Mobile"], undefined, (typed) => canonicalPhoneKey(typed, phoneRegion ?? DEFAULT_PHONE_REGION));
  } catch (error) {
    fail(path, error instanceof Error ? error.message : "Check the contact details and try again.");
  }
  const dateValue = new Date(`${followUpDate}T12:00:00Z`);
  if (Number.isNaN(dateValue.getTime())) fail(path, "Choose a valid follow-up date.");

  const followUpType = await prisma.dateType.findFirst({ where: { scopeKey: "system", slug: "follow-up", isActive: true } });
  if (!followUpType) fail(path, "The follow-up date type is unavailable. Run setup again.");
  const starterMix = await ensureStarterMix(workspace.id, businessType, reason, starterChoice === "suggested" ? scenario?.id : null);
  const contactId = savedContact?.id ?? randomUUID();
  await prisma.$transaction(async (tx) => {
    if (!savedContact) await tx.contact.create({
      data: {
        id: contactId,
        workspaceId: workspace.id,
        displayName,
        firstName,
        lastName: lastName || null,
        privateNotes: privateContext || null,
        emails: emails.length ? { create: emails.map((item) => ({ email: item.value, normalized: item.normalized, label: item.label, isPrimary: item.isPrimary })) } : undefined,
        phones: phones.length ? { create: phones.map((item) => ({ phone: item.value, normalized: item.normalized, label: item.label, isPrimary: item.isPrimary })) } : undefined
      }
    });
    if (savedContact && privateContext) await tx.contact.update({ where: { id: contactId }, data: { privateNotes: [savedContact.privateNotes, privateContext].filter(Boolean).join("\n\n") } });
    await tx.jumpDate.create({
      data: {
        workspaceId: workspace.id,
        contactId,
        dateTypeId: followUpType.id,
        dateValue,
        month: dateValue.getUTCMonth() + 1,
        day: dateValue.getUTCDate(),
        recurrence: "NONE",
        timezone,
        label: reason
      }
    });
    await tx.mixAssignment.create({
      data: {
        assignmentKey: `onboarding:${workspace.id}:${starterMix.id}:${contactId}`,
        workspaceId: workspace.id,
        mixId: starterMix.id,
        contactId,
        mode: "SNAPSHOT",
        isActive: true
      }
    });
    await tx.workspaceProfile.upsert({
      where: { workspaceId: workspace.id },
      create: { workspaceId: workspace.id, useCases: uses, company: businessName || null, industry: businessType, smsSignature, emailSignature: user.name, primaryGoal: reason, onboardingStep: 5, onboardingDone: true },
      update: { useCases: uses, company: businessName || null, industry: businessType, smsSignature, emailSignature: user.name, primaryGoal: reason, onboardingStep: 5, onboardingDone: true }
    });
    await tx.workspace.update({ where: { id: workspace.id }, data: { name: businessName || `${user.name}'s connections` } });
    await tx.userPreference.upsert({ where: { userId: user.id }, create: { userId: user.id, timezone }, update: { timezone } });
  });
  await generateJumps({ workspaceId: workspace.id, contactId, mixId: starterMix.id });
  redirect(welcomePath(displayName));
}

export async function skipOnboardingAction(formData: FormData): Promise<void> {
  const { workspace, user } = await requireWritableWorkspace((message) => fail("/onboarding", message));
  const uses = onboardingUses(formData.getAll("useCase").map(String));
  const business = uses.includes("business");
  const submittedTimezone = value(formData, "timezone");
  const existingTimezone = (await prisma.userPreference.findUnique({ where: { userId: user.id } }))?.timezone ?? "UTC";
  const timezone = isValidTimezone(submittedTimezone)
    ? submittedTimezone
    : isValidTimezone(existingTimezone)
      ? existingTimezone
      : "UTC";
  await prisma.workspaceProfile.upsert({
    where: { workspaceId: workspace.id },
    create: { workspaceId: workspace.id, useCases: uses, company: business ? workspace.name : null, smsSignature: user.name, emailSignature: user.name, onboardingStep: 5, onboardingDone: true },
    update: { useCases: uses, smsSignature: workspace.profile?.smsSignature ?? user.name, emailSignature: workspace.profile?.emailSignature ?? user.name, onboardingStep: 5, onboardingDone: true }
  });
  await prisma.userPreference.upsert({ where: { userId: user.id }, create: { userId: user.id, timezone }, update: { timezone } });
  await ensureStarterMix(workspace.id, null, !business ? onboardingReasons(uses)[0] : undefined);
  await queueJumpReconciliation(workspace.id);
  redirect(welcomePath(null));
}

export async function completeOnboardingFormAction(_previous: FormResult, data: FormData): Promise<FormResult> {
  return recoverableFormAction(async () => {
    if (data.get("starterReviewed") !== "on" || data.get("starterPreviewAvailable") !== "1") fail("/onboarding", "Review your starter and its timing before continuing.");
    await completeOnboardingAction(data);
  });
}
