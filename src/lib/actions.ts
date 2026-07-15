"use server";

import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import type { Channel, JumpStatus } from "@/generated/prisma/client";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { createSession, destroySession, requireWorkspace } from "@/lib/auth";
import { slugify } from "@/lib/slug";
import { PLAN_LIMITS } from "@/lib/plans";
import { generateMixDraft } from "@/lib/mix-generator";
import { env } from "@/lib/env";
import { ensureStarterMix } from "@/lib/starter-mix";

function value(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function fail(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

export async function registerAction(formData: FormData): Promise<void> {
  const name = value(formData, "name");
  const email = value(formData, "email").toLowerCase();
  const password = value(formData, "password");
  if (!name || !email || !email.includes("@")) fail("/register", "Enter your name and a valid email.");
  if (password.length < 10) fail("/register", "Use a password with at least 10 characters.");
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) fail("/login", "An account with that email already exists.");
  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({ data: { email, name, passwordHash } });
  await prisma.workspace.create({
    data: {
      name: `${name}'s Workspace`,
      slug: slugify(name),
      ownerId: user.id,
      members: { create: { userId: user.id, role: "OWNER" } },
      profile: { create: { timezone: "America/New_York" } },
      groups: { create: [
        { name: "Leads", description: "People who may become customers." },
        { name: "Clients", description: "Active customer relationships." },
        { name: "Referrals", description: "People introduced by your network." }
      ] }
    }
  });
  await createSession(user.id);
  redirect("/onboarding");
}

export async function loginAction(formData: FormData): Promise<void> {
  const email = value(formData, "email").toLowerCase();
  const password = value(formData, "password");
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) fail("/login", "The email or password is incorrect.");
  await createSession(user.id);
  const membership = await prisma.workspaceMember.findFirst({ where: { userId: user.id }, include: { workspace: { include: { profile: true } } } });
  redirect(membership?.workspace.profile?.onboardingDone ? "/dashboard" : "/onboarding");
}

export async function demoLoginAction(): Promise<void> {
  if (!env.demoMode) fail("/login", "The demo workspace is disabled in this environment.");
  const user = await prisma.user.findUnique({ where: { email: env.demoEmail } });
  if (!user) fail("/login", "The demo workspace is not ready yet. Run the seed command and try again.");
  await createSession(user.id);
  redirect("/dashboard?demo=1");
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/");
}

export async function completeOnboardingAction(formData: FormData): Promise<void> {
  const { workspace } = await requireWorkspace();
  const company = value(formData, "company");
  const industry = value(formData, "industry");
  const primaryGoal = value(formData, "primaryGoal");
  const product1 = value(formData, "product1");
  const smsSignature = value(formData, "smsSignature");
  const emailSignature = value(formData, "emailSignature");
  const timezone = value(formData, "timezone") || "America/New_York";
  await prisma.$transaction([
    prisma.workspace.update({ where: { id: workspace.id }, data: company ? { name: company } : {} }),
    prisma.workspaceProfile.upsert({
      where: { workspaceId: workspace.id },
      create: { workspaceId: workspace.id, company: company || null, industry: industry || null, primaryGoal: primaryGoal || null, product1: product1 || null, smsSignature: smsSignature || null, emailSignature: emailSignature || null, timezone, onboardingStep: 5, onboardingDone: true },
      update: { company: company || null, industry: industry || null, primaryGoal: primaryGoal || null, product1: product1 || null, smsSignature: smsSignature || null, emailSignature: emailSignature || null, timezone, onboardingStep: 5, onboardingDone: true }
    })
  ]);
  if (formData.get("createStarterMix") === "on") await ensureStarterMix(workspace.id);
  redirect("/dashboard?welcome=1");
}

export async function skipOnboardingAction(): Promise<void> {
  const { workspace } = await requireWorkspace();
  await prisma.workspaceProfile.upsert({
    where: { workspaceId: workspace.id },
    create: { workspaceId: workspace.id, company: workspace.name, timezone: "America/New_York", onboardingStep: 5, onboardingDone: true },
    update: { onboardingStep: 5, onboardingDone: true }
  });
  await ensureStarterMix(workspace.id);
  redirect("/dashboard?welcome=1");
}

export async function createContactAction(formData: FormData): Promise<void> {
  const { workspace } = await requireWorkspace();
  const firstName = value(formData, "firstName");
  const lastName = value(formData, "lastName");
  const company = value(formData, "company");
  const email = value(formData, "email").toLowerCase();
  const phone = value(formData, "phone");
  const notes = value(formData, "notes");
  const displayName = [firstName, lastName].filter(Boolean).join(" ") || company || email || phone;
  if (!displayName) fail("/contacts/new", "Add a name, company, email, or phone number.");
  const currentCount = await prisma.contact.count({ where: { workspaceId: workspace.id, archivedAt: null } });
  const limit = PLAN_LIMITS[workspace.planTier].contacts;
  if (currentCount >= limit) fail("/contacts/new", `Your ${workspace.planTier.toLowerCase()} plan allows ${limit} active contacts.`);
  const normalizedEmail = email || null;
  const normalizedPhone = phone.replace(/\D/g, "") || null;
  if (normalizedEmail) {
    const duplicate = await prisma.contactEmail.findFirst({ where: { normalized: normalizedEmail, contact: { workspaceId: workspace.id } } });
    if (duplicate) fail("/contacts/new", "A contact with this email already exists.");
  }
  await prisma.contact.create({
    data: {
      workspaceId: workspace.id,
      firstName: firstName || null,
      lastName: lastName || null,
      displayName,
      company: company || null,
      publicNotes: notes || null,
      emails: normalizedEmail ? { create: { email, normalized: normalizedEmail, isPrimary: true, label: "Primary" } } : undefined,
      phones: normalizedPhone ? { create: { phone, normalized: normalizedPhone, isPrimary: true, label: "Primary" } } : undefined
    }
  });
  redirect("/contacts?created=1");
}

export async function archiveContactAction(formData: FormData): Promise<void> {
  const { workspace } = await requireWorkspace();
  const contactId = value(formData, "contactId");
  await prisma.contact.updateMany({ where: { id: contactId, workspaceId: workspace.id }, data: { archivedAt: new Date() } });
  redirect("/contacts?archived=1");
}

export async function updateJumpStatusAction(formData: FormData): Promise<void> {
  const { workspace } = await requireWorkspace();
  const jumpId = value(formData, "jumpId");
  const status = value(formData, "status") as JumpStatus;
  const allowed: JumpStatus[] = ["PENDING", "COPIED", "SENT", "DONE", "SKIPPED"];
  if (!allowed.includes(status)) fail("/jumps", "Invalid Jump status.");
  await prisma.jump.updateMany({
    where: { id: jumpId, workspaceId: workspace.id },
    data: { status, completedAt: ["DONE", "SKIPPED", "SENT"].includes(status) ? new Date() : null, completionMethod: status.toLowerCase() }
  });
  redirect("/jumps");
}

export async function createWizardMixAction(formData: FormData): Promise<void> {
  const { workspace } = await requireWorkspace();
  if (!PLAN_LIMITS[workspace.planTier].aiWizard) fail("/mixes/wizard", "The AI Mix Wizard is available on Plus and Pro.");
  const objective = value(formData, "objective") || "Lead Follow-Up";
  const tone = value(formData, "tone") || "Warm";
  const durationDays = Number(value(formData, "durationDays") || 14);
  const touches = Number(value(formData, "touches") || 5);
  const channels = formData.getAll("channels").map(String) as Channel[];
  const productPlaceholder = value(formData, "productPlaceholder") || "{{My Product 1}}";
  const draft = generateMixDraft({ objective, tone, durationDays, touches, channels, productPlaceholder });
  const activeMixes = await prisma.mix.count({ where: { workspaceId: workspace.id, status: { in: ["ACTIVE", "DRAFT"] } } });
  if (activeMixes >= PLAN_LIMITS[workspace.planTier].mixes) fail("/mixes/wizard", "Your plan's Mix limit has been reached.");
  const mixId = randomUUID();
  await prisma.$transaction(async (tx) => {
    await tx.mix.create({
      data: { id: mixId, workspaceId: workspace.id, name: draft.name, description: draft.description, framework: "Question-Led Consultative", category: "Sales", triggerMode: "MANUAL_START", status: "DRAFT", durationDays, source: "AI_WIZARD" }
    });
    for (const [index, step] of draft.steps.entries()) {
      const template = await tx.stepTemplate.create({ data: { workspaceId: workspace.id, name: `${draft.name} — ${step.name}`, channel: step.channel } });
      const version = await tx.stepVersion.create({ data: { stepTemplateId: template.id, version: 1, subject: step.subject ?? null, body: step.body ?? null, script: step.script ?? null } });
      await tx.mixStep.create({ data: { mixId, stepVersionId: version.id, dayOffset: step.dayOffset, sortOrder: index + 1 } });
    }
  });
  redirect("/mixes?created=wizard");
}

export async function createImportantDateAction(formData: FormData): Promise<void> {
  const { workspace } = await requireWorkspace();
  const contactId = value(formData, "contactId");
  const dateTypeId = value(formData, "dateTypeId");
  const dateValueRaw = value(formData, "dateValue");
  const recurrence = value(formData, "recurrence") as "NONE" | "MONTHLY" | "YEARLY";
  const label = value(formData, "label");
  const autoAssignRecommended = formData.get("autoAssignRecommended") === "on";
  const contact = await prisma.contact.findFirst({ where: { id: contactId, workspaceId: workspace.id, archivedAt: null } });
  if (!contact) fail("/contacts", "Contact not found.");
  const dateType = await prisma.dateType.findFirst({ where: { id: dateTypeId, OR: [{ workspaceId: workspace.id }, { workspaceId: null }] } });
  if (!dateType) fail(`/contacts/${contactId}`, "Choose a valid date type.");
  const parsed = new Date(`${dateValueRaw}T12:00:00`);
  if (!dateValueRaw || Number.isNaN(parsed.getTime())) fail(`/contacts/${contactId}`, "Choose a valid date.");
  const timezone = workspace.profile?.timezone ?? "America/New_York";
  await prisma.jumpDate.create({
    data: { workspaceId: workspace.id, contactId, dateTypeId, dateValue: parsed, month: parsed.getMonth() + 1, day: parsed.getDate(), recurrence: ["NONE", "MONTHLY", "YEARLY"].includes(recurrence) ? recurrence : "NONE", timezone, label: label || null }
  });
  let assignedMixId: string | null = null;
  if (autoAssignRecommended) {
    const matchingMix = await prisma.mix.findFirst({ where: { workspaceId: workspace.id, status: "ACTIVE", triggerMode: "DATE_TRIGGERED", dateTypeId }, orderBy: [{ source: "asc" }, { createdAt: "asc" }] });
    if (matchingMix) {
      const assignmentKey = `${workspace.id}:${matchingMix.id}:${contactId}`;
      await prisma.mixAssignment.upsert({ where: { assignmentKey }, create: { assignmentKey, workspaceId: workspace.id, mixId: matchingMix.id, contactId }, update: { isActive: true } });
      assignedMixId = matchingMix.id;
    }
  }
  await prisma.job.create({ data: { workspaceId: workspace.id, task: "generate-jumps", payload: { contactId, ...(assignedMixId ? { mixId: assignedMixId } : {}) } } });
  redirect(`/contacts/${contactId}?dateCreated=1${assignedMixId ? "&mixAssigned=1" : ""}`);
}

export async function createStarterMixAction(): Promise<void> {
  const { workspace } = await requireWorkspace();
  const existingStarter = await prisma.mix.findFirst({ where: { workspaceId: workspace.id, source: "STARTER", status: { not: "ARCHIVED" } } });
  if (existingStarter) redirect("/mixes?starter=exists");
  const current = await prisma.mix.count({ where: { workspaceId: workspace.id, status: { in: ["DRAFT", "ACTIVE"] } } });
  if (current >= PLAN_LIMITS[workspace.planTier].mixes) fail("/mixes", "Your plan's Mix limit has been reached.");
  try { await ensureStarterMix(workspace.id); } catch (error) { fail("/mixes", error instanceof Error ? error.message : "The starter Mix could not be created."); }
  redirect("/mixes?created=starter");
}

export async function activateMixAction(formData: FormData): Promise<void> {
  const { workspace } = await requireWorkspace();
  const mixId = value(formData, "mixId");
  await prisma.mix.updateMany({ where: { id: mixId, workspaceId: workspace.id, status: { in: ["DRAFT", "PAUSED"] } }, data: { status: "ACTIVE" } });
  await prisma.job.create({ data: { workspaceId: workspace.id, task: "generate-jumps", payload: { mixId } } });
  redirect("/mixes?activated=1");
}

export async function assignMixToContactAction(formData: FormData): Promise<void> {
  const { workspace } = await requireWorkspace();
  const mixId = value(formData, "mixId");
  const contactId = value(formData, "contactId");
  const [mix, contact] = await Promise.all([
    prisma.mix.findFirst({ where: { id: mixId, workspaceId: workspace.id, status: "ACTIVE" } }),
    prisma.contact.findFirst({ where: { id: contactId, workspaceId: workspace.id, archivedAt: null } })
  ]);
  if (!mix || !contact) fail(`/contacts/${contactId}`, "Choose an active Mix.");
  const assignmentKey = `${workspace.id}:${mixId}:${contactId}`;
  await prisma.mixAssignment.upsert({
    where: { assignmentKey },
    create: { assignmentKey, workspaceId: workspace.id, mixId, contactId, startDate: mix.triggerMode === "MANUAL_START" ? new Date() : null },
    update: { isActive: true }
  });
  await prisma.job.create({ data: { workspaceId: workspace.id, task: "generate-jumps", payload: { contactId, mixId } } });
  redirect(`/contacts/${contactId}?mixAssigned=1`);
}

export async function updateWorkspaceSettingsAction(formData: FormData): Promise<void> {
  const { workspace } = await requireWorkspace();
  await prisma.workspaceProfile.upsert({
    where: { workspaceId: workspace.id },
    create: { workspaceId: workspace.id, company: value(formData, "company") || null, industry: value(formData, "industry") || null, product1: value(formData, "product1") || null, smsSignature: value(formData, "smsSignature") || null, emailSignature: value(formData, "emailSignature") || null, timezone: value(formData, "timezone") || "America/New_York", onboardingDone: true },
    update: { company: value(formData, "company") || null, industry: value(formData, "industry") || null, product1: value(formData, "product1") || null, smsSignature: value(formData, "smsSignature") || null, emailSignature: value(formData, "emailSignature") || null, timezone: value(formData, "timezone") || "America/New_York" }
  });
  redirect("/settings?saved=1");
}
