"use server";

import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import type { Channel, JumpStatus, MixStatus, MixTriggerMode } from "@/generated/prisma/client";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { createSession, destroySession, requireWorkspace } from "@/lib/auth";
import { slugify } from "@/lib/slug";
import { PLAN_LIMITS } from "@/lib/plans";
import { generateMixDraft } from "@/lib/mix-generator";
import { env } from "@/lib/env";
import { ensureStarterMix } from "@/lib/starter-mix";
import { buildAddressInputs, buildEmailInputs, buildPhoneInputs } from "@/lib/contact-input";
import { containsPrivateNotesPlaceholder, findUnknownPlaceholders } from "@/lib/placeholders";
import { generateJumps } from "@/lib/jump-engine";

function value(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function values(formData: FormData, key: string): string[] {
  return formData.getAll(key).map((item) => String(item));
}

function fail(path: string, message: string): never {
  const separator = path.includes("?") ? "&" : "?";
  redirect(`${path}${separator}error=${encodeURIComponent(message)}`);
}

async function queueJumpReconciliation(workspaceId: string, payload: { contactId?: string; mixId?: string } = {}): Promise<void> {
  await prisma.job.create({ data: { workspaceId, task: "generate-jumps", payload } });
}

function contactPayload(formData: FormData) {
  const firstName = value(formData, "firstName");
  const lastName = value(formData, "lastName");
  const company = value(formData, "company");
  const publicNotes = value(formData, "publicNotes");
  const privateNotes = value(formData, "privateNotes");
  const emails = buildEmailInputs(values(formData, "emailValue"), values(formData, "emailLabel"), value(formData, "emailPrimaryIndex"));
  const phones = buildPhoneInputs(values(formData, "phoneValue"), values(formData, "phoneLabel"), value(formData, "phonePrimaryIndex"));
  const addresses = buildAddressInputs(
    values(formData, "addressStreet1"),
    values(formData, "addressStreet2"),
    values(formData, "addressCity"),
    values(formData, "addressState"),
    values(formData, "addressPostalCode"),
    values(formData, "addressCountry"),
    values(formData, "addressLabel"),
    value(formData, "addressPrimaryIndex")
  );
  const displayName = [firstName, lastName].filter(Boolean).join(" ") || company || emails[0]?.value || phones[0]?.value;
  if (!displayName) throw new Error("Add a name, company, email, or phone number.");
  return {
    firstName: firstName || null,
    lastName: lastName || null,
    company: company || null,
    publicNotes: publicNotes || null,
    privateNotes: privateNotes || null,
    displayName,
    emails,
    phones,
    addresses,
    groupIds: [...new Set(values(formData, "groupIds").filter(Boolean))]
  };
}

async function validateContactScope(
  workspaceId: string,
  payload: ReturnType<typeof contactPayload>,
  excludeContactId?: string
): Promise<string[]> {
  const groups = payload.groupIds.length
    ? await prisma.group.findMany({ where: { workspaceId, id: { in: payload.groupIds } }, select: { id: true } })
    : [];
  if (groups.length !== payload.groupIds.length) throw new Error("One or more selected groups are not available in this workspace.");

  for (const email of payload.emails) {
    const duplicate = await prisma.contactEmail.findFirst({
      where: {
        normalized: email.normalized,
        ...(excludeContactId ? { contactId: { not: excludeContactId } } : {}),
        contact: { workspaceId }
      },
      select: { id: true }
    });
    if (duplicate) throw new Error(`Another contact already uses ${email.value}.`);
  }
  for (const phone of payload.phones) {
    const duplicate = await prisma.contactPhone.findFirst({
      where: {
        normalized: phone.normalized,
        ...(excludeContactId ? { contactId: { not: excludeContactId } } : {}),
        contact: { workspaceId }
      },
      select: { id: true }
    });
    if (duplicate) throw new Error(`Another contact already uses ${phone.value}.`);
  }
  return groups.map((group) => group.id);
}

function normalizedChannel(raw: string): Channel | null {
  const allowed: Channel[] = ["SMS", "EMAIL", "PHONE_CALL", "VOICEMAIL", "WHATSAPP"];
  return allowed.includes(raw as Channel) ? raw as Channel : null;
}

function validateReusableJump(formData: FormData) {
  const name = value(formData, "name");
  const channel = normalizedChannel(value(formData, "channel"));
  const subject = value(formData, "subject");
  const body = value(formData, "body");
  const script = value(formData, "script");
  if (!name) throw new Error("Give this Jump a name.");
  if (!channel) throw new Error("Choose a valid Jump channel.");
  if (channel === "EMAIL" && (!subject || !body)) throw new Error("Email Jumps require a subject and body.");
  if (["SMS", "WHATSAPP"].includes(channel) && !body) throw new Error("This Jump requires message content.");
  if (["PHONE_CALL", "VOICEMAIL"].includes(channel) && !script) throw new Error("This Jump requires a script or notes.");
  const content = [subject, body, script].filter(Boolean).join("\n");
  const unknown = findUnknownPlaceholders(content);
  if (unknown.length) throw new Error(`Unsupported placeholders: ${unknown.join(", ")}`);
  if (channel !== "PHONE_CALL" && containsPrivateNotesPlaceholder(content)) {
    throw new Error("Private Notes placeholders may only be used in Phone Call Jumps.");
  }
  return {
    name,
    channel,
    subject: subject || null,
    body: body || null,
    script: script || null,
    longSms: channel === "SMS" && body.length > 160
  };
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
  redirect(membership?.workspace.profile?.onboardingDone ? "/jumps" : "/onboarding");
}

export async function demoLoginAction(): Promise<void> {
  if (!env.demoMode) fail("/login", "The demo workspace is disabled in this environment.");
  const user = await prisma.user.findUnique({ where: { email: env.demoEmail } });
  if (!user) fail("/login", "The demo workspace is not ready yet. Run the seed command and try again.");
  await createSession(user.id);
  redirect("/jumps?demo=1");
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/");
}

export async function completeOnboardingAction(formData: FormData): Promise<void> {
  const { workspace } = await requireWorkspace();
  const contactName = value(formData, "contactName");
  const contactEmail = value(formData, "contactEmail").toLowerCase();
  const contactPhone = value(formData, "contactPhone");
  const reason = value(formData, "reason") || "Follow up";
  const followUpDate = value(formData, "followUpDate");
  const timezone = value(formData, "timezone") || "America/New_York";
  if (!contactName || !followUpDate) fail("/onboarding", "Add a person and choose when you want to follow up.");
  if (contactEmail && !contactEmail.includes("@")) fail("/onboarding", "Enter a valid email or leave it blank.");
  const dateValue = new Date(`${followUpDate}T12:00:00`);
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
        displayName: contactName,
        firstName: contactName,
        emails: contactEmail ? { create: { email: contactEmail, normalized: contactEmail, isPrimary: true } } : undefined,
        phones: contactPhone ? { create: { phone: contactPhone, normalized: contactPhone.replace(/\D/g, ""), isPrimary: true } } : undefined
      }
    });
    await tx.jumpDate.create({
      data: { workspaceId: workspace.id, contactId, dateTypeId: followUpType.id, dateValue, timezone, label: reason }
    });
    await tx.mixAssignment.create({
      data: { assignmentKey: `onboarding:${workspace.id}:${starterMix.id}:${contactId}`, workspaceId: workspace.id, mixId: starterMix.id, contactId, mode: "SNAPSHOT", isActive: true }
    });
    await tx.workspaceProfile.upsert({
      where: { workspaceId: workspace.id },
      create: { workspaceId: workspace.id, primaryGoal: reason, timezone, onboardingStep: 5, onboardingDone: true },
      update: { primaryGoal: reason, timezone, onboardingStep: 5, onboardingDone: true }
    });
  });
  await generateJumps({ workspaceId: workspace.id, contactId, mixId: starterMix.id });
  redirect(`/jumps?range=all&welcome=1&firstContact=${encodeURIComponent(contactName)}`);
}

export async function skipOnboardingAction(): Promise<void> {
  const { workspace } = await requireWorkspace();
  await prisma.workspaceProfile.upsert({
    where: { workspaceId: workspace.id },
    create: { workspaceId: workspace.id, company: workspace.name, timezone: "America/New_York", onboardingStep: 5, onboardingDone: true },
    update: { onboardingStep: 5, onboardingDone: true }
  });
  await ensureStarterMix(workspace.id);
  await queueJumpReconciliation(workspace.id);
  redirect("/jumps?welcome=1");
}

export async function createContactAction(formData: FormData): Promise<void> {
  const { workspace } = await requireWorkspace();
  let payload: ReturnType<typeof contactPayload>;
  try {
    payload = contactPayload(formData);
    await validateContactScope(workspace.id, payload);
  } catch (error) {
    fail("/contacts/new", error instanceof Error ? error.message : "The contact could not be saved.");
  }
  const currentCount = await prisma.contact.count({ where: { workspaceId: workspace.id, archivedAt: null } });
  const limit = PLAN_LIMITS[workspace.planTier].contacts;
  if (currentCount >= limit) fail("/contacts/new", `Your ${workspace.planTier.toLowerCase()} plan allows ${limit} active contacts.`);

  await prisma.contact.create({
    data: {
      workspaceId: workspace.id,
      firstName: payload.firstName,
      lastName: payload.lastName,
      displayName: payload.displayName,
      company: payload.company,
      publicNotes: payload.publicNotes,
      privateNotes: payload.privateNotes,
      emails: payload.emails.length ? { create: payload.emails.map((item) => ({ email: item.value, normalized: item.normalized, label: item.label, isPrimary: item.isPrimary })) } : undefined,
      phones: payload.phones.length ? { create: payload.phones.map((item) => ({ phone: item.value, normalized: item.normalized, label: item.label, isPrimary: item.isPrimary })) } : undefined,
      addresses: payload.addresses.length ? { create: payload.addresses } : undefined,
      groupMemberships: payload.groupIds.length ? { create: payload.groupIds.map((groupId) => ({ groupId })) } : undefined
    }
  });
  redirect("/contacts?created=1");
}

export async function updateContactAction(formData: FormData): Promise<void> {
  const { workspace } = await requireWorkspace();
  const contactId = value(formData, "contactId");
  const path = `/contacts/${contactId}/edit`;
  const existing = await prisma.contact.findFirst({ where: { id: contactId, workspaceId: workspace.id, archivedAt: null }, select: { id: true } });
  if (!existing) fail("/contacts", "Contact not found.");

  let payload: ReturnType<typeof contactPayload>;
  try {
    payload = contactPayload(formData);
    await validateContactScope(workspace.id, payload, contactId);
  } catch (error) {
    fail(path, error instanceof Error ? error.message : "The contact could not be updated.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.contact.update({
      where: { id: contactId },
      data: {
        firstName: payload.firstName,
        lastName: payload.lastName,
        displayName: payload.displayName,
        company: payload.company,
        publicNotes: payload.publicNotes,
        privateNotes: payload.privateNotes
      }
    });
    await Promise.all([
      tx.contactEmail.deleteMany({ where: { contactId } }),
      tx.contactPhone.deleteMany({ where: { contactId } }),
      tx.contactAddress.deleteMany({ where: { contactId } }),
      tx.contactGroupMembership.deleteMany({ where: { contactId } })
    ]);
    if (payload.emails.length) await tx.contactEmail.createMany({ data: payload.emails.map((item) => ({ contactId, email: item.value, normalized: item.normalized, label: item.label, isPrimary: item.isPrimary })) });
    if (payload.phones.length) await tx.contactPhone.createMany({ data: payload.phones.map((item) => ({ contactId, phone: item.value, normalized: item.normalized, label: item.label, isPrimary: item.isPrimary })) });
    if (payload.addresses.length) await tx.contactAddress.createMany({ data: payload.addresses.map((item) => ({ contactId, ...item })) });
    if (payload.groupIds.length) await tx.contactGroupMembership.createMany({ data: payload.groupIds.map((groupId) => ({ contactId, groupId })) });
  });
  await queueJumpReconciliation(workspace.id, { contactId });
  redirect(`/contacts/${contactId}?updated=1`);
}

export async function archiveContactAction(formData: FormData): Promise<void> {
  const { workspace } = await requireWorkspace();
  const contactId = value(formData, "contactId");
  await prisma.$transaction([
    prisma.contact.updateMany({ where: { id: contactId, workspaceId: workspace.id }, data: { archivedAt: new Date() } }),
    prisma.jump.updateMany({
      where: { contactId, workspaceId: workspace.id, status: { in: ["PENDING", "COPIED"] } },
      data: { status: "CANCELED", completionMethod: "contact_archived" }
    })
  ]);
  redirect("/contacts?archived=1");
}

export async function createGroupAction(formData: FormData): Promise<void> {
  const { workspace } = await requireWorkspace();
  const name = value(formData, "name");
  const description = value(formData, "description");
  const color = value(formData, "color");
  if (!name) fail("/contacts", "Give the group a name.");
  const count = await prisma.group.count({ where: { workspaceId: workspace.id } });
  const limit = PLAN_LIMITS[workspace.planTier].groups;
  if (Number.isFinite(limit) && count >= limit) fail("/contacts", `Your plan allows ${limit} Contact Groups.`);
  const duplicate = await prisma.group.findFirst({ where: { workspaceId: workspace.id, name: { equals: name, mode: "insensitive" } }, select: { id: true } });
  if (duplicate) fail("/contacts", "A group with that name already exists.");
  await prisma.group.create({ data: { workspaceId: workspace.id, name, description: description || null, color: color || null } });
  redirect("/contacts?groupCreated=1");
}

export async function deleteGroupAction(formData: FormData): Promise<void> {
  const { workspace } = await requireWorkspace();
  const groupId = value(formData, "groupId");
  const group = await prisma.group.findFirst({ where: { id: groupId, workspaceId: workspace.id }, select: { id: true } });
  if (!group) fail("/contacts", "Group not found.");
  await prisma.group.delete({ where: { id: group.id } });
  await queueJumpReconciliation(workspace.id);
  redirect("/contacts?groupDeleted=1");
}

export async function updateJumpStatusAction(formData: FormData): Promise<void> {
  const { workspace } = await requireWorkspace();
  const jumpId = value(formData, "jumpId");
  const status = value(formData, "status") as JumpStatus;
  const allowed: JumpStatus[] = ["PENDING", "DONE", "SKIPPED"];
  if (!allowed.includes(status)) fail("/jumps", "Choose Pending, Done, or Skipped.");
  await prisma.jump.updateMany({
    where: { id: jumpId, workspaceId: workspace.id, status: { not: "CANCELED" } },
    data: {
      status,
      completedAt: status === "DONE" || status === "SKIPPED" ? new Date() : null,
      completionMethod: status === "PENDING" ? null : status.toLowerCase()
    }
  });
  redirect("/jumps");
}

export async function snoozeJumpAction(formData: FormData): Promise<void> {
  const { workspace } = await requireWorkspace();
  const jumpId = value(formData, "jumpId");
  const preset = value(formData, "preset");
  const now = new Date();
  let scheduledAt: Date;
  if (preset === "later-today") scheduledAt = new Date(now.getTime() + 4 * 60 * 60 * 1000);
  else if (preset === "tomorrow") scheduledAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  else if (preset === "next-week") scheduledAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  else if (preset === "next-monday") {
    const days = ((8 - now.getDay()) % 7) || 7;
    scheduledAt = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  } else {
    scheduledAt = new Date(value(formData, "customDate"));
    if (Number.isNaN(scheduledAt.getTime()) || scheduledAt <= now) fail("/jumps", "Choose a future date and time.");
  }
  const result = await prisma.jump.updateMany({
    where: { id: jumpId, workspaceId: workspace.id, status: { in: ["PENDING", "COPIED"] } },
    data: { scheduledAt }
  });
  if (!result.count) fail("/jumps", "This Jump is no longer available to snooze.");
  redirect("/jumps?snoozed=1");
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
  const mixId = randomUUID();
  await prisma.$transaction(async (tx) => {
    await tx.mix.create({
      data: { id: mixId, workspaceId: workspace.id, name: draft.name, description: draft.description, framework: "Question-Led Consultative", category: "Sales & Prospecting", triggerMode: "MANUAL_START", status: "DRAFT", durationDays, source: "AI_WIZARD" }
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
  if (!dateType) fail(`/contacts/${contactId}`, "Choose a valid Jump Date Type.");
  const parsed = new Date(`${dateValueRaw}T12:00:00Z`);
  if (!dateValueRaw || Number.isNaN(parsed.getTime())) fail(`/contacts/${contactId}`, "Choose a valid date.");
  const timezone = workspace.profile?.timezone ?? "America/New_York";
  await prisma.jumpDate.create({
    data: { workspaceId: workspace.id, contactId, dateTypeId, dateValue: parsed, month: parsed.getUTCMonth() + 1, day: parsed.getUTCDate(), recurrence: ["NONE", "MONTHLY", "YEARLY"].includes(recurrence) ? recurrence : "NONE", timezone, label: label || null }
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
  await queueJumpReconciliation(workspace.id, { contactId, ...(assignedMixId ? { mixId: assignedMixId } : {}) });
  redirect(`/contacts/${contactId}?dateCreated=1${assignedMixId ? "&mixAssigned=1" : ""}`);
}

export async function deleteJumpDateAction(formData: FormData): Promise<void> {
  const { workspace } = await requireWorkspace();
  const contactId = value(formData, "contactId");
  const jumpDateId = value(formData, "jumpDateId");
  await prisma.jumpDate.deleteMany({ where: { id: jumpDateId, contactId, workspaceId: workspace.id } });
  await queueJumpReconciliation(workspace.id, { contactId });
  redirect(`/contacts/${contactId}?dateDeleted=1`);
}

export async function createStarterMixAction(): Promise<void> {
  const { workspace } = await requireWorkspace();
  const existingStarter = await prisma.mix.findFirst({ where: { workspaceId: workspace.id, source: "STARTER", status: { not: "ARCHIVED" } } });
  if (existingStarter) redirect("/mixes?starter=exists");
  const current = await prisma.mix.count({ where: { workspaceId: workspace.id, status: "ACTIVE" } });
  if (Number.isFinite(PLAN_LIMITS[workspace.planTier].mixes) && current >= PLAN_LIMITS[workspace.planTier].mixes) fail("/mixes", "Your plan's active Mix limit has been reached.");
  try { await ensureStarterMix(workspace.id); } catch (error) { fail("/mixes", error instanceof Error ? error.message : "The starter Mix could not be created."); }
  await queueJumpReconciliation(workspace.id);
  redirect("/mixes?created=starter");
}

export async function activateMixAction(formData: FormData): Promise<void> {
  const { workspace } = await requireWorkspace();
  const mixId = value(formData, "mixId");
  const activeCount = await prisma.mix.count({ where: { workspaceId: workspace.id, status: "ACTIVE", id: { not: mixId } } });
  const limit = PLAN_LIMITS[workspace.planTier].mixes;
  if (Number.isFinite(limit) && activeCount >= limit) fail("/mixes", `Your plan allows ${limit} active Mixes.`);
  await prisma.mix.updateMany({ where: { id: mixId, workspaceId: workspace.id, status: { in: ["DRAFT", "PAUSED"] } }, data: { status: "ACTIVE" } });
  await queueJumpReconciliation(workspace.id, { mixId });
  redirect("/mixes?activated=1");
}

export async function pauseMixAction(formData: FormData): Promise<void> {
  const { workspace } = await requireWorkspace();
  const mixId = value(formData, "mixId");
  await prisma.$transaction([
    prisma.mix.updateMany({ where: { id: mixId, workspaceId: workspace.id, status: "ACTIVE" }, data: { status: "PAUSED" } }),
    prisma.jump.updateMany({
      where: { mixId, workspaceId: workspace.id, status: { in: ["PENDING", "COPIED"] }, scheduledAt: { gte: new Date() } },
      data: { status: "CANCELED", completedAt: null, completionMethod: "mix_paused" }
    })
  ]);
  await queueJumpReconciliation(workspace.id, { mixId });
  redirect("/mixes?paused=1");
}

export async function archiveMixAction(formData: FormData): Promise<void> {
  const { workspace } = await requireWorkspace();
  const mixId = value(formData, "mixId");
  await prisma.$transaction([
    prisma.mix.updateMany({ where: { id: mixId, workspaceId: workspace.id, status: { not: "ARCHIVED" } }, data: { status: "ARCHIVED" } }),
    prisma.mixAssignment.updateMany({ where: { mixId, workspaceId: workspace.id }, data: { isActive: false } }),
    prisma.jump.updateMany({
      where: { mixId, workspaceId: workspace.id, status: { in: ["PENDING", "COPIED"] }, scheduledAt: { gte: new Date() } },
      data: { status: "CANCELED", completedAt: null, completionMethod: "mix_archived" }
    })
  ]);
  redirect("/mixes?archived=1");
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
  await queueJumpReconciliation(workspace.id, { contactId, mixId });
  redirect(`/contacts/${contactId}?mixAssigned=1`);
}

export async function removeMixAssignmentAction(formData: FormData): Promise<void> {
  const { workspace } = await requireWorkspace();
  const assignmentId = value(formData, "assignmentId");
  const contactId = value(formData, "contactId");
  const assignment = await prisma.mixAssignment.findFirst({ where: { id: assignmentId, workspaceId: workspace.id, contactId }, select: { id: true, mixId: true } });
  if (!assignment) fail(`/contacts/${contactId}`, "Mix assignment not found.");
  await prisma.mixAssignment.update({ where: { id: assignment.id }, data: { isActive: false } });
  await queueJumpReconciliation(workspace.id, { contactId, mixId: assignment.mixId });
  redirect(`/contacts/${contactId}?mixRemoved=1`);
}

export async function createReusableJumpAction(formData: FormData): Promise<void> {
  const { workspace } = await requireWorkspace();
  let payload: ReturnType<typeof validateReusableJump>;
  try { payload = validateReusableJump(formData); } catch (error) { fail("/settings/jumps", error instanceof Error ? error.message : "The Jump could not be created."); }
  await prisma.stepTemplate.create({
    data: {
      workspaceId: workspace.id,
      name: payload.name,
      channel: payload.channel,
      versions: { create: { version: 1, subject: payload.subject, body: payload.body, script: payload.script, longSms: payload.longSms } }
    }
  });
  redirect("/settings/jumps?created=1");
}

export async function updateReusableJumpAction(formData: FormData): Promise<void> {
  const { workspace } = await requireWorkspace();
  const stepTemplateId = value(formData, "stepTemplateId");
  let payload: ReturnType<typeof validateReusableJump>;
  try { payload = validateReusableJump(formData); } catch (error) { fail("/settings/jumps", error instanceof Error ? error.message : "The Jump could not be updated."); }
  const template = await prisma.stepTemplate.findFirst({ where: { id: stepTemplateId, workspaceId: workspace.id }, select: { id: true, currentVersion: true } });
  if (!template) fail("/settings/jumps", "Jump not found.");
  const affected = await prisma.mixStep.findMany({
    where: { isActive: true, stepVersion: { stepTemplateId: template.id } },
    select: { id: true, mixId: true }
  });
  await prisma.$transaction(async (tx) => {
    const nextVersion = await tx.stepVersion.create({
      data: { stepTemplateId: template.id, version: template.currentVersion + 1, subject: payload.subject, body: payload.body, script: payload.script, longSms: payload.longSms }
    });
    await tx.stepTemplate.update({ where: { id: template.id }, data: { name: payload.name, channel: payload.channel, currentVersion: template.currentVersion + 1, isActive: true } });
    if (affected.length) await tx.mixStep.updateMany({ where: { id: { in: affected.map((item) => item.id) } }, data: { stepVersionId: nextVersion.id } });
  });
  await queueJumpReconciliation(workspace.id);
  redirect("/settings/jumps?updated=1");
}

export async function archiveReusableJumpAction(formData: FormData): Promise<void> {
  const { workspace } = await requireWorkspace();
  const stepTemplateId = value(formData, "stepTemplateId");
  const template = await prisma.stepTemplate.findFirst({ where: { id: stepTemplateId, workspaceId: workspace.id }, select: { id: true } });
  if (!template) fail("/settings/jumps", "Jump not found.");
  const activeUses = await prisma.mixStep.count({ where: { isActive: true, stepVersion: { stepTemplateId: template.id } } });
  if (activeUses) fail("/settings/jumps", `Remove this Jump from ${activeUses} active Mix sequence${activeUses === 1 ? "" : "s"} before archiving it.`);
  await prisma.stepTemplate.update({ where: { id: template.id }, data: { isActive: false } });
  redirect("/settings/jumps?archived=1");
}

export async function saveMixAction(formData: FormData): Promise<void> {
  const { workspace } = await requireWorkspace();
  const mixIdRaw = value(formData, "mixId");
  const name = value(formData, "name");
  const description = value(formData, "description");
  const framework = value(formData, "framework");
  const category = value(formData, "category");
  const industry = value(formData, "industry");
  const triggerMode = value(formData, "triggerMode") as MixTriggerMode;
  const status = value(formData, "status") as MixStatus;
  const dateTypeId = value(formData, "dateTypeId");
  const allowedTriggers: MixTriggerMode[] = ["DATE_TRIGGERED", "MANUAL_START", "BROADCAST"];
  const allowedStatuses: MixStatus[] = ["DRAFT", "ACTIVE", "PAUSED"];
  const path = mixIdRaw ? `/mixes/${mixIdRaw}/edit` : "/mixes/new";
  if (!name) fail(path, "Give the Mix a name.");
  if (!allowedTriggers.includes(triggerMode)) fail(path, "Choose a valid trigger mode.");
  if (!allowedStatuses.includes(status)) fail(path, "Choose Draft, Active, or Paused.");

  if (triggerMode === "DATE_TRIGGERED") {
    const dateType = await prisma.dateType.findFirst({ where: { id: dateTypeId, isActive: true, OR: [{ workspaceId: workspace.id }, { workspaceId: null }] }, select: { id: true } });
    if (!dateType) fail(path, "Choose a valid Target Jump Date Type.");
  }

  const mixStepIds = values(formData, "mixStepId");
  const stepTemplateIds = values(formData, "stepTemplateId");
  const offsets = values(formData, "dayOffset");
  const sendTimes = values(formData, "sendTimeMinutes");
  if (!stepTemplateIds.length || stepTemplateIds.some((id) => !id)) fail(path, "Add at least one reusable Jump to the Mix.");
  const templates = await prisma.stepTemplate.findMany({
    where: { id: { in: [...new Set(stepTemplateIds)] }, workspaceId: workspace.id, isActive: true },
    include: { versions: { orderBy: { version: "desc" }, take: 1 } }
  });
  const templateById = new Map(templates.map((template) => [template.id, template]));
  if (stepTemplateIds.some((id) => !templateById.get(id)?.versions[0])) fail(path, "One or more selected Jumps are unavailable.");

  const groupIds = [...new Set(values(formData, "groupIds").filter(Boolean))];
  if (groupIds.length) {
    const validGroups = await prisma.group.count({ where: { workspaceId: workspace.id, id: { in: groupIds } } });
    if (validGroups !== groupIds.length) fail(path, "One or more selected groups are unavailable.");
  }
  const assignAllContacts = formData.get("assignAllContacts") === "on";
  const allContactIds = assignAllContacts
    ? (await prisma.contact.findMany({ where: { workspaceId: workspace.id, archivedAt: null }, select: { id: true } })).map((contact) => contact.id)
    : [];

  const existingMix = mixIdRaw
    ? await prisma.mix.findFirst({ where: { id: mixIdRaw, workspaceId: workspace.id, status: { not: "ARCHIVED" } }, include: { steps: true } })
    : null;
  if (mixIdRaw && !existingMix) fail("/mixes", "Mix not found.");

  if (status === "ACTIVE" && existingMix?.status !== "ACTIVE") {
    const activeCount = await prisma.mix.count({ where: { workspaceId: workspace.id, status: "ACTIVE", ...(mixIdRaw ? { id: { not: mixIdRaw } } : {}) } });
    const limit = PLAN_LIMITS[workspace.planTier].mixes;
    if (Number.isFinite(limit) && activeCount >= limit) fail(path, `Your plan allows ${limit} active Mixes.`);
  }

  const mixId = existingMix?.id ?? randomUUID();
  await prisma.$transaction(async (tx) => {
    const durationDays = Math.max(...offsets.map((offset) => Math.abs(Number(offset) || 0)), 0);
    if (existingMix) {
      await tx.mix.update({
        where: { id: mixId },
        data: { name, description: description || null, framework: framework || null, category: category || null, industry: industry || null, triggerMode, dateTypeId: triggerMode === "DATE_TRIGGERED" ? dateTypeId : null, status, durationDays }
      });
    } else {
      await tx.mix.create({
        data: { id: mixId, workspaceId: workspace.id, name, description: description || null, framework: framework || null, category: category || null, industry: industry || null, triggerMode, dateTypeId: triggerMode === "DATE_TRIGGERED" ? dateTypeId : null, status, durationDays, source: "USER" }
      });
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
        await tx.mixStep.update({ where: { id: existingStep.id }, data: { stepVersionId: version.id, dayOffset, sendTimeMinutes, sortOrder: index + 1, isActive: true } });
        retainedIds.add(existingStep.id);
      } else {
        const created = await tx.mixStep.create({ data: { mixId, stepVersionId: version.id, dayOffset, sendTimeMinutes, sortOrder: index + 1, isActive: true } });
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
      await tx.mixAssignment.upsert({
        where: { assignmentKey },
        create: { assignmentKey, workspaceId: workspace.id, mixId, groupId, mode: "DYNAMIC", startDate: triggerMode === "DATE_TRIGGERED" ? null : new Date() },
        update: { isActive: true, startDate: triggerMode === "DATE_TRIGGERED" ? null : new Date(), mode: "DYNAMIC" }
      });
    }
    for (const contactId of allContactIds) {
      const assignmentKey = `${workspace.id}:${mixId}:audience:${contactId}`;
      await tx.mixAssignment.upsert({
        where: { assignmentKey },
        create: { assignmentKey, workspaceId: workspace.id, mixId, contactId, mode: "DYNAMIC", startDate: triggerMode === "DATE_TRIGGERED" ? null : new Date() },
        update: { isActive: true, startDate: triggerMode === "DATE_TRIGGERED" ? null : new Date(), mode: "DYNAMIC" }
      });
    }
  });

  await queueJumpReconciliation(workspace.id, { mixId });
  redirect(`/mixes?${existingMix ? "updated" : "created"}=manual`);
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
