"use server";

import { captureFormFailure, recoverableFormAction, withViewerError, type ErrorViewer, type FormResult } from "@/lib/form-errors";
import { randomUUID } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
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
import { placeNewContacts } from "@/lib/new-contact-placement";

function value(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function fail(path: string, message: string, viewer: ErrorViewer): never {
  captureFormFailure(message);
  redirect(withViewerError(path, message, viewer));
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

type OnboardingReceipt = { contactId: string; mixId: string };

async function earlierOnboarding(db: Pick<Prisma.TransactionClient, "idempotencyKey">, workspaceId: string, key: string | null): Promise<OnboardingReceipt | null> {
  if (!key) return null;
  const row = await db.idempotencyKey.findUnique({ where: { workspaceId_key: { workspaceId, key } }, select: { response: true } });
  const saved = row?.response;
  if (!saved || typeof saved !== "object" || Array.isArray(saved)) return null;
  return typeof saved.contactId === "string" && typeof saved.mixId === "string" ? { contactId: saved.contactId, mixId: saved.mixId } : null;
}

async function finishOnboarding(workspaceId: string, receipt: OnboardingReceipt): Promise<never> {
  const contact = await prisma.contact.findFirst({ where: { id: receipt.contactId, workspaceId, archivedAt: null }, select: { displayName: true } });
  // An old form must not recreate a person who was removed or reactivate a stopped Mix.
  if (!contact) redirect("/contacts");
  const assignment = await prisma.mixAssignment.findFirst({ where: { workspaceId, contactId: receipt.contactId, mixId: receipt.mixId, isActive: true, mix: { workspaceId, status: { not: "ARCHIVED" } } }, select: { id: true } });
  if (!assignment) redirect("/jumps");
  // The receipt commits with the data, before preparation. A retry can finish this idempotent
  // phase if the original request failed after committing; settled occurrences stay settled.
  await generateJumps({ workspaceId, contactId: receipt.contactId, mixId: receipt.mixId });
  redirect(welcomePath(contact.displayName));
}

export async function completeOnboardingAction(formData: FormData): Promise<void> {
  const { session, workspace, user } = await requireWritableWorkspace((message, viewer) => fail("/onboarding", message, viewer));
  // Match the existing Add-contact contract: one request per opened form, scoped to its
  // authenticated workspace and member. An uncertain save always recovers the original data.
  const requestId = value(formData, "requestId").slice(0, 120);
  const key = requestId ? `onboarding:${user.id}:${requestId}` : null;
  const earlier = await earlierOnboarding(prisma, workspace.id, key);
  if (earlier) return finishOnboarding(workspace.id, earlier);
  const uses = onboardingUses(formData.getAll("useCase").map(String));
  const business = uses.includes("business");
  if (!uses.length) fail("/onboarding", "Choose how you want to use Jump in the Mix.", session);
  const path = `/onboarding?${new URLSearchParams(uses.map(use => ["useCase", use])).toString()}`;
  const businessType = business ? value(formData, "businessType") || "Other" : null;
  const businessName = !business && !uses.includes("networking") ? "" : value(formData, "businessName").slice(0, 200);
  const smsSignature = value(formData, "smsSignature") || user.name;
  const savedContactId = value(formData, "contactId");
  const savedContact = savedContactId ? await prisma.contact.findFirst({ where: { id: savedContactId, workspaceId: workspace.id, archivedAt: null } }) : null;
  if (savedContactId && !savedContact) fail(path, "Choose an active person from your contacts.", session);
  const contactName = value(formData, "contactName");
  const { firstName, lastName } = splitContactName(contactName);
  const contactEmail = value(formData, "contactEmail").toLowerCase();
  const contactPhone = value(formData, "contactPhone");
  const marketingPreference = await prisma.workspaceMarketingPreference.findUnique({ where: { workspaceId: workspace.id } });
  const scenario = storedMarketingScenario(marketingPreference?.scenario, marketingPreference?.version);
  const starterChoice = value(formData, "starterChoice");
  // The example the person tried brings its own reason; any other choice must be one this business type offers.
  const suggested = starterChoice === "suggested" && business && scenario;
  const reason = suggested ? suggested.reason : value(formData, "reason") || onboardingReasons(uses, businessType)[0];
  if (!suggested && !onboardingReasons(uses, businessType).includes(reason)) fail(path, "Choose a follow-up that fits your selected use.", session);
  const followUpDate = value(formData, "followUpDate");
  const privateContext = value(formData, "privateContext").slice(0, 1000);
  const timezone = value(formData, "timezone");
  const displayName = savedContact?.displayName ?? [firstName, lastName].filter(Boolean).join(" ");

  if (!displayName || !followUpDate) fail(path, "Add a person and choose when you want to follow up.", session);
  if (!isValidTimezone(timezone)) fail(path, "Choose a valid timezone before creating the first follow-up.", session);
  const phoneRegion = contactPhone ? await workspacePhoneRegion(prisma, workspace.id) : null;
  let emails;
  let phones;
  try {
    emails = buildEmailInputs(contactEmail ? [contactEmail] : [], ["Email"]);
    phones = buildPhoneInputs(contactPhone ? [contactPhone] : [], ["Mobile"], undefined, (typed) => canonicalPhoneKey(typed, phoneRegion ?? DEFAULT_PHONE_REGION));
  } catch (error) {
    // Pure validators (no database or network inside this try): what they throw is their own wording about what was typed.
    fail(path, error instanceof Error ? error.message : "Check the contact details and try again.", session);
  }
  const dateValue = new Date(`${followUpDate}T12:00:00Z`);
  if (Number.isNaN(dateValue.getTime())) fail(path, "Choose a valid follow-up date.", session);

  const followUpType = await prisma.dateType.findFirst({ where: { scopeKey: "system", slug: "follow-up", isActive: true } });
  if (!followUpType) fail(path, "The follow-up date type is unavailable. Run setup again.", session);
  const receipt = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Workspace" WHERE id = ${workspace.id} FOR NO KEY UPDATE`;
    const raced = await earlierOnboarding(tx, workspace.id, key);
    if (raced) return raced;
    const currentContact = savedContact ? await tx.contact.findFirst({ where: { id: savedContact.id, workspaceId: workspace.id, archivedAt: null } }) : null;
    if (savedContact && !currentContact) fail(path, "Choose an active person from your contacts.", session);
    const starterMix = await ensureStarterMix(workspace.id, businessType, reason, starterChoice === "suggested" ? scenario?.id : null, tx);
    const contactId = currentContact?.id ?? randomUUID();
    if (!currentContact) await tx.contact.create({
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
    if (!currentContact) await placeNewContacts(tx, { workspaceId: workspace.id, contactIds: [contactId] });
    if (currentContact && privateContext) await tx.contact.update({ where: { id: contactId, workspaceId: workspace.id }, data: { privateNotes: [currentContact.privateNotes, privateContext].filter(Boolean).join("\n\n") } });
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
    const saved = { contactId, mixId: starterMix.id };
    if (key) await tx.idempotencyKey.create({ data: { workspaceId: workspace.id, key, response: saved, expiresAt: new Date(Date.now() + 7 * 86_400_000) } });
    return saved;
  });
  return finishOnboarding(workspace.id, receipt);
}

export async function skipOnboardingAction(formData: FormData): Promise<void> {
  const { workspace, user } = await requireWritableWorkspace((message, viewer) => fail("/onboarding", message, viewer));
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
    // The guard runs first so the refusal below has its viewer; inside this form action it comes back as the form's error.
    const { session } = await requireWritableWorkspace((message, viewer) => fail("/onboarding", message, viewer));
    if (data.get("starterReviewed") !== "on" || data.get("starterPreviewAvailable") !== "1") fail("/onboarding", "Review your starter and its timing before continuing.", session);
    await completeOnboardingAction(data);
  });
}
