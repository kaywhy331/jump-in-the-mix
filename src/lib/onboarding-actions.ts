"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { requireWorkspace } from "@/lib/auth";
import { generateJumps } from "@/lib/jump-engine";
import { isValidTimezone } from "@/lib/mix-broadcast";
import { prisma } from "@/lib/prisma";
import { splitContactName } from "@/lib/quick-add-capture";
import { ensureStarterMix } from "@/lib/starter-mix";
import { buildEmailInputs, buildPhoneInputs } from "@/lib/contact-input";
import { onboardingUse } from "@/lib/onboarding-options";
import { storedMarketingScenario } from "@/lib/marketing-scenarios";

function value(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function fail(path: string, message: string): never {
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
  const { workspace, user } = await requireWorkspace();
  const use = onboardingUse(value(formData, "useCase") || "business");
  if (!use) fail("/onboarding", "Choose how you want to use Jump in the Mix.");
  const path = `/onboarding?useCase=${use.id}`;
  const businessType = use.id === "business" ? value(formData, "businessType") || "Other" : null;
  const businessName = use.id === "personal" ? "" : value(formData, "businessName").slice(0, 200);
  const smsSignature = value(formData, "smsSignature") || user.name;
  const contactName = value(formData, "contactName");
  const { firstName, lastName } = splitContactName(contactName);
  const contactEmail = value(formData, "contactEmail").toLowerCase();
  const contactPhone = value(formData, "contactPhone");
  const marketingPreference = await prisma.workspaceMarketingPreference.findUnique({ where: { workspaceId: workspace.id } });
  const scenario = storedMarketingScenario(marketingPreference?.scenario, marketingPreference?.version);
  const starterChoice = value(formData, "starterChoice");
  const reason = starterChoice === "suggested" && use.id === "business" && scenario ? scenario.reason : value(formData, "reason") || use.reasons[0];
  if (!(use.reasons as readonly string[]).includes(reason)) fail(path, "Choose a follow-up that fits your selected use.");
  const followUpDate = value(formData, "followUpDate");
  const privateContext = value(formData, "privateContext").slice(0, 1000);
  const timezone = value(formData, "timezone");
  const displayName = [firstName, lastName].filter(Boolean).join(" ");
  if (use.id === "business" && !businessName) fail(path, "Add your business name.");
  if (!displayName || !followUpDate) fail(path, "Add a person and choose when you want to follow up.");
  if (!isValidTimezone(timezone)) fail(path, "Choose a valid timezone before creating the first follow-up.");
  let emails;
  let phones;
  try {
    emails = buildEmailInputs(contactEmail ? [contactEmail] : [], ["Email"]);
    phones = buildPhoneInputs(contactPhone ? [contactPhone] : [], ["Mobile"]);
  } catch (error) {
    fail(path, error instanceof Error ? error.message : "Check the contact details and try again.");
  }
  const dateValue = new Date(`${followUpDate}T12:00:00Z`);
  if (Number.isNaN(dateValue.getTime())) fail(path, "Choose a valid follow-up date.");

  const followUpType = await prisma.dateType.findFirst({ where: { scopeKey: "system", slug: "follow-up", isActive: true } });
  if (!followUpType) fail(path, "The follow-up date type is unavailable. Run setup again.");
  const starterMix = await ensureStarterMix(workspace.id, businessType, reason, starterChoice === "suggested" ? scenario?.id : null);
  const contactId = randomUUID();
  await prisma.$transaction(async (tx) => {
    await tx.contact.create({
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
      create: { workspaceId: workspace.id, company: businessName || null, industry: businessType, smsSignature, emailSignature: user.name, primaryGoal: reason, onboardingStep: 5, onboardingDone: true },
      update: { company: businessName || null, industry: businessType, smsSignature, emailSignature: user.name, primaryGoal: reason, onboardingStep: 5, onboardingDone: true }
    });
    await tx.workspace.update({ where: { id: workspace.id }, data: { name: businessName || `${user.name}'s connections` } });
    await tx.userPreference.upsert({ where: { userId: user.id }, create: { userId: user.id, timezone }, update: { timezone } });
  });
  await generateJumps({ workspaceId: workspace.id, contactId, mixId: starterMix.id });
  redirect(welcomePath(displayName));
}

export async function skipOnboardingAction(formData: FormData): Promise<void> {
  const { workspace, user } = await requireWorkspace();
  const use = onboardingUse(value(formData, "useCase") || "business");
  const submittedTimezone = value(formData, "timezone");
  const existingTimezone = (await prisma.userPreference.findUnique({ where: { userId: user.id } }))?.timezone ?? "UTC";
  const timezone = isValidTimezone(submittedTimezone)
    ? submittedTimezone
    : isValidTimezone(existingTimezone)
      ? existingTimezone
      : "UTC";
  await prisma.workspaceProfile.upsert({
    where: { workspaceId: workspace.id },
    create: { workspaceId: workspace.id, company: use?.id === "business" ? workspace.name : null, smsSignature: user.name, emailSignature: user.name, onboardingStep: 5, onboardingDone: true },
    update: { smsSignature: workspace.profile?.smsSignature ?? user.name, emailSignature: workspace.profile?.emailSignature ?? user.name, onboardingStep: 5, onboardingDone: true }
  });
  await prisma.userPreference.upsert({ where: { userId: user.id }, create: { userId: user.id, timezone }, update: { timezone } });
  await ensureStarterMix(workspace.id, null, use && use.id !== "business" ? use.reasons[0] : undefined);
  await queueJumpReconciliation(workspace.id);
  redirect(welcomePath(null));
}
