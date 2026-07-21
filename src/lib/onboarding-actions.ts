"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { requireWorkspace } from "@/lib/auth";
import { generateJumps } from "@/lib/jump-engine";
import { prisma } from "@/lib/prisma";
import { splitContactName } from "@/lib/quick-add-capture";
import { ensureStarterMix } from "@/lib/starter-mix";

function value(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function fail(path: string, message: string): never {
  redirect(`${path}${path.includes("?") ? "&" : "?"}error=${encodeURIComponent(message)}`);
}

async function queueJumpReconciliation(workspaceId: string): Promise<void> {
  await prisma.job.create({ data: { workspaceId, task: "generate-jumps", payload: {} } });
}

function planIntentRedirect(formData: FormData): string | null {
  const planIntent = value(formData, "planIntent");
  if (!/^(plus|pro):(monthly|annual)$/.test(planIntent)) return null;
  const [plan, period] = planIntent.split(":");
  return `/plans?plan=${plan}&period=${period}`;
}

export async function completeOnboardingAction(formData: FormData): Promise<void> {
  const { workspace } = await requireWorkspace();
  const contactName = value(formData, "contactName");
  const { firstName, lastName } = splitContactName(contactName);
  const contactEmail = value(formData, "contactEmail").toLowerCase();
  const contactPhone = value(formData, "contactPhone");
  const reason = value(formData, "reason") || "Follow up";
  const followUpDate = value(formData, "followUpDate");
  const timezone = value(formData, "timezone") || "America/New_York";
  const displayName = [firstName, lastName].filter(Boolean).join(" ");
  if (!displayName || !followUpDate) fail("/onboarding", "Add a person and choose when you want to follow up.");
  if (contactEmail && !contactEmail.includes("@")) fail("/onboarding", "Enter a valid email or leave it blank.");
  const dateValue = new Date(`${followUpDate}T12:00:00Z`);
  if (Number.isNaN(dateValue.getTime())) fail("/onboarding", "Choose a valid follow-up date.");

  const followUpType = await prisma.dateType.findFirst({ where: { scopeKey: "system", slug: "follow-up", isActive: true } });
  if (!followUpType) fail("/onboarding", "The Follow-up Important Date type is unavailable. Run setup again.");
  const starterMix = await ensureStarterMix(workspace.id);
  const contactId = randomUUID();
  await prisma.$transaction(async (tx) => {
    await tx.contact.create({
      data: {
        id: contactId,
        workspaceId: workspace.id,
        displayName,
        firstName,
        lastName: lastName || null,
        emails: contactEmail ? { create: { email: contactEmail, normalized: contactEmail, isPrimary: true } } : undefined,
        phones: contactPhone ? { create: { phone: contactPhone, normalized: contactPhone.replace(/\D/g, ""), isPrimary: true } } : undefined
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
      create: { workspaceId: workspace.id, primaryGoal: reason, timezone, onboardingStep: 5, onboardingDone: true },
      update: { primaryGoal: reason, timezone, onboardingStep: 5, onboardingDone: true }
    });
  });
  await generateJumps({ workspaceId: workspace.id, contactId, mixId: starterMix.id });
  const billingRedirect = planIntentRedirect(formData);
  if (billingRedirect) redirect(billingRedirect);
  redirect(`/jumps?range=all&welcome=1&firstContact=${encodeURIComponent(displayName)}`);
}

export async function skipOnboardingAction(formData: FormData): Promise<void> {
  const { workspace } = await requireWorkspace();
  await prisma.workspaceProfile.upsert({
    where: { workspaceId: workspace.id },
    create: { workspaceId: workspace.id, company: workspace.name, timezone: "America/New_York", onboardingStep: 5, onboardingDone: true },
    update: { onboardingStep: 5, onboardingDone: true }
  });
  await ensureStarterMix(workspace.id);
  await queueJumpReconciliation(workspace.id);
  const billingRedirect = planIntentRedirect(formData);
  if (billingRedirect) redirect(billingRedirect);
  redirect("/jumps?welcome=1");
}
