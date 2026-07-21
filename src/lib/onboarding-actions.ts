"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { requireWorkspace } from "@/lib/auth";
import { generateJumps } from "@/lib/jump-engine";
import { isValidTimezone } from "@/lib/mix-broadcast";
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

type PlanIntent = { plan: "plus" | "pro"; period: "monthly" | "annual" };

function planIntent(formData: FormData): PlanIntent | null {
  const raw = value(formData, "planIntent");
  if (!/^(plus|pro):(monthly|annual)$/.test(raw)) return null;
  const [plan, period] = raw.split(":") as [PlanIntent["plan"], PlanIntent["period"]];
  return { plan, period };
}

function welcomePath(firstContact: string | null, intent: PlanIntent | null): string {
  const params = new URLSearchParams({ welcome: "1" });
  if (firstContact) {
    params.set("range", "all");
    params.set("firstContact", firstContact);
  }
  if (intent) {
    params.set("plan", intent.plan);
    params.set("period", intent.period);
  }
  return `/jumps?${params.toString()}`;
}

export async function completeOnboardingAction(formData: FormData): Promise<void> {
  const { workspace } = await requireWorkspace();
  const contactName = value(formData, "contactName");
  const { firstName, lastName } = splitContactName(contactName);
  const contactEmail = value(formData, "contactEmail").toLowerCase();
  const contactPhone = value(formData, "contactPhone");
  const reason = value(formData, "reason") || "Follow up";
  const followUpDate = value(formData, "followUpDate");
  const timezone = value(formData, "timezone");
  const displayName = [firstName, lastName].filter(Boolean).join(" ");
  if (!displayName || !followUpDate) fail("/onboarding", "Add a person and choose when you want to follow up.");
  if (!isValidTimezone(timezone)) fail("/onboarding", "Confirm a valid timezone before creating the first follow-up.");
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
  redirect(welcomePath(displayName, planIntent(formData)));
}

export async function skipOnboardingAction(formData: FormData): Promise<void> {
  const { workspace } = await requireWorkspace();
  const submittedTimezone = value(formData, "timezone");
  const existingTimezone = workspace.profile?.timezone ?? "UTC";
  const timezone = isValidTimezone(submittedTimezone)
    ? submittedTimezone
    : isValidTimezone(existingTimezone)
      ? existingTimezone
      : "UTC";
  await prisma.workspaceProfile.upsert({
    where: { workspaceId: workspace.id },
    create: { workspaceId: workspace.id, company: workspace.name, timezone, onboardingStep: 5, onboardingDone: true },
    update: { timezone, onboardingStep: 5, onboardingDone: true }
  });
  await ensureStarterMix(workspace.id);
  await queueJumpReconciliation(workspace.id);
  redirect(welcomePath(null, planIntent(formData)));
}
