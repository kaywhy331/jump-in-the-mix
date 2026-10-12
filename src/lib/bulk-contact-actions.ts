"use server";

import { createHash, randomUUID } from "node:crypto";
import type { Channel } from "@/generated/prisma/client";
import { redirect } from "next/navigation";
import { withViewerError, type ErrorViewer } from "@/lib/form-errors";
import { addLogicalDays, daysInMonth, logicalDateInTimezone, zonedDateTimeToUtc, type LogicalDate } from "@/lib/jump-schedule";
import { renderJumpSnapshot } from "@/lib/jump-render";
import { containsPrivateNotesPlaceholder, findUnknownPlaceholders } from "@/lib/placeholders";
import { prisma } from "@/lib/prisma";
import { setStagesFromTagJoins } from "@/lib/mix-stage";
import { requireWritableWorkspace } from "@/lib/writable-workspace";
import { channelName, channelWord } from "@/lib/display-labels";

function value(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function selectedContactIds(formData: FormData): string[] {
  return [...new Set(formData.getAll("contactIds").map(String).filter(Boolean))];
}

function fail(message: string, viewer: ErrorViewer): never {
  redirect(withViewerError("/contacts", message, viewer));
}

async function scopedContacts(workspaceId: string, contactIds: string[], viewer: ErrorViewer) {
  if (!contactIds.length) fail("Select at least one Contact.", viewer);
  const contacts = await prisma.contact.findMany({
    where: { workspaceId, archivedAt: null, id: { in: contactIds } },
    include: { emails: true, phones: true, addresses: true, customFieldValues: { include: { definition: true } } },
    orderBy: { displayName: "asc" }
  });
  if (contacts.length !== contactIds.length) fail("One or more selected Contacts are unavailable.", viewer);
  return contacts;
}

async function assertContactable(workspaceId: string, contacts: Array<{ id: string; displayName: string }>, viewer: ErrorViewer): Promise<void> {
  const blocked = await prisma.contactRelationshipState.findMany({
    where: { workspaceId, contactId: { in: contacts.map((contact) => contact.id) }, doNotContact: true },
    select: { contactId: true }
  });
  if (!blocked.length) return;
  const blockedIds = new Set(blocked.map((item) => item.contactId));
  const names = contacts.filter((contact) => blockedIds.has(contact.id)).map((contact) => contact.displayName);
  fail(`Do-not-contact is enabled for ${names.join(", ")}. Clear that permission before creating outreach.`, viewer);
}

async function queueWorkspaceReconciliation(workspaceId: string): Promise<void> {
  await prisma.job.create({ data: { workspaceId, task: "generate-jumps", payload: {} } });
}

export async function bulkAssignGroupAction(formData: FormData): Promise<void> {
  const { workspace, user, session } = await requireWritableWorkspace();
  const contactIds = selectedContactIds(formData);
  const groupId = value(formData, "groupId");
  const [contacts, group] = await Promise.all([
    scopedContacts(workspace.id, contactIds, session),
    prisma.group.findFirst({ where: { id: groupId, workspaceId: workspace.id }, select: { id: true } })
  ]);
  if (!group) fail("Choose an available tag.", session);
  const added = await prisma.$transaction(async (tx) => {
    const tagged = new Set((await tx.contactGroupMembership.findMany({ where: { groupId: group.id, contactId: { in: contacts.map((contact) => contact.id) } }, select: { contactId: true } })).map((item) => item.contactId));
    await tx.contactGroupMembership.createMany({ data: contacts.map((contact) => ({ contactId: contact.id, groupId: group.id })), skipDuplicates: true });
    // A tag's Mix that names a Contact stage starts for the people newly given the tag, so it sets that stage (JITM-09 §2.79).
    await setStagesFromTagJoins(tx, { workspaceId: workspace.id, joins: contacts.filter((contact) => !tagged.has(contact.id)).map((contact) => ({ contactId: contact.id, groupId: group.id })), actorUserId: user.id });
    return contacts.length - tagged.size;
  });
  await queueWorkspaceReconciliation(workspace.id);
  // The notice names the tag and how many people newly have it (TRU-07).
  redirect(`/contacts?bulkAssigned=${added}&bulkTag=${encodeURIComponent(group.id)}`);
}

export async function bulkRemoveGroupAction(formData: FormData): Promise<void> {
  const { workspace, session } = await requireWritableWorkspace();
  const contactIds = selectedContactIds(formData);
  const groupId = value(formData, "groupId");
  const [contacts, group] = await Promise.all([
    scopedContacts(workspace.id, contactIds, session),
    prisma.group.findFirst({ where: { id: groupId, workspaceId: workspace.id }, select: { id: true } })
  ]);
  if (!group) fail("Choose an available tag.", session);
  const removed = await prisma.contactGroupMembership.deleteMany({ where: { groupId: group.id, contactId: { in: contacts.map((contact) => contact.id) } } });
  await queueWorkspaceReconciliation(workspace.id);
  redirect(`/contacts?bulkRemoved=${removed.count}&bulkTag=${encodeURIComponent(group.id)}`);
}

export async function bulkArchiveContactsAction(formData: FormData): Promise<void> {
  const { workspace, user, session } = await requireWritableWorkspace();
  const contacts = await scopedContacts(workspace.id, selectedContactIds(formData), session);
  const contactIds = contacts.map((contact) => contact.id);
  const archivedAt = new Date();
  // Archiving several people works exactly like archiving one: their Mix assignments stay in
  // place (the engine skips archived people), pending follow-ups are held under the same reason
  // so Restore brings them back, each person gets an audit row, and one reconciliation is queued.
  await prisma.$transaction([
    prisma.contact.updateMany({ where: { workspaceId: workspace.id, id: { in: contactIds } }, data: { archivedAt } }),
    prisma.jump.updateMany({ where: { workspaceId: workspace.id, contactId: { in: contactIds }, status: "PENDING" }, data: { status: "CANCELED", completedAt: null, completionMethod: "contact_archived" } }),
    prisma.auditLog.createMany({
      data: contacts.map((contact) => ({
        workspaceId: workspace.id,
        actorType: "USER" as const,
        actorUserId: user.id,
        action: "contact.archive",
        entityType: "Contact",
        entityId: contact.id,
        source: "contacts.bulk",
        metadata: { displayName: contact.displayName, archivedAt: archivedAt.toISOString(), selectedCount: contacts.length }
      }))
    }),
    prisma.job.create({ data: { workspaceId: workspace.id, task: "generate-jumps", payload: {} } })
  ]);
  // The notice's Undo restores exactly these people; a selection beyond one page gets no Undo.
  const result = new URLSearchParams({ bulkArchived: String(contacts.length) });
  if (contactIds.length <= 50) result.set("archivedContacts", contactIds.join(","));
  redirect(`/contacts?${result.toString()}`);
}

type OneTimeContent = {
  name: string;
  channel: Channel;
  subject: string | null;
  body: string | null;
  script: string | null;
  templateId: string;
  versionId: string;
};

function channelFromForm(raw: string): Channel | null {
  const channels: Channel[] = ["SMS", "EMAIL", "PHONE_CALL", "VOICEMAIL", "WHATSAPP"];
  return channels.includes(raw as Channel) ? raw as Channel : null;
}

/** A one-time follow-up the owner typed that cannot be prepared; its message is shown to them as written. */
class ManualContentError extends Error {}

function validateManualContent(formData: FormData) {
  const channel = channelFromForm(value(formData, "manualChannel"));
  const subject = value(formData, "manualSubject");
  const body = value(formData, "manualBody");
  const script = value(formData, "manualScript");
  if (!channel) throw new ManualContentError("Choose a valid message type.");
  if (channel === "EMAIL" && (!subject || !body)) throw new ManualContentError("Email follow-ups require a subject and message.");
  if (["SMS", "WHATSAPP"].includes(channel) && !body) throw new ManualContentError("This follow-up needs a message.");
  if (["PHONE_CALL", "VOICEMAIL"].includes(channel) && !script) throw new ManualContentError("This follow-up needs call notes.");
  const content = [subject, body, script].filter(Boolean).join("\n");
  const unknown = findUnknownPlaceholders(content);
  if (unknown.length) throw new ManualContentError(`Unsupported placeholders: ${unknown.join(", ")}`);
  if (channel !== "PHONE_CALL" && containsPrivateNotesPlaceholder(content)) throw new ManualContentError("Private-note placeholders may only be used in phone-call follow-ups.");
  return { channel, subject: subject || null, body: body || null, script: script || null };
}

function oneTimeId(prefix: string, input: string): string {
  return `${prefix}_${createHash("sha256").update(input).digest("hex").slice(0, 28)}`;
}

function selectedDate(raw: string): LogicalDate | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!match) return null;
  const date = { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
  if (date.month < 1 || date.month > 12 || date.day < 1 || date.day > daysInMonth(date.year, date.month)) return null;
  return date;
}

export async function applyJumpToContactsAction(formData: FormData): Promise<void> {
  const { workspace, user, session } = await requireWritableWorkspace();
  const contacts = await scopedContacts(workspace.id, selectedContactIds(formData), session);
  await assertContactable(workspace.id, contacts, session);
  const mode = value(formData, "applyMode") === "manual" ? "manual" : "existing";
  const reason = value(formData, "reason");
  const batchId = randomUUID();
  const hiddenMixId = oneTimeId("one_time_mix", workspace.id);

  let prepared: OneTimeContent;
  if (mode === "existing") {
    const stepTemplateId = value(formData, "stepTemplateId");
    const template = await prisma.stepTemplate.findFirst({ where: { id: stepTemplateId, workspaceId: workspace.id, isActive: true }, include: { versions: { orderBy: { version: "desc" }, take: 1 } } });
    const version = template?.versions[0];
    if (!template || !version) fail("Choose an available reusable follow-up.", session);
    prepared = { name: template.name, channel: template.channel, subject: version.subject, body: version.body, script: version.script, templateId: template.id, versionId: version.id };
  } else {
    let manual: ReturnType<typeof validateManualContent>;
    try { manual = validateManualContent(formData); }
    catch (error) { fail(error instanceof ManualContentError ? error.message : "The one-time follow-up could not be prepared.", session); }
    prepared = {
      name: value(formData, "manualName") || `One-time ${channelWord(channelName(manual.channel))}`,
      channel: manual.channel,
      subject: manual.subject,
      body: manual.body,
      script: manual.script,
      templateId: randomUUID(),
      versionId: randomUUID()
    };
  }

  const mixStepId = mode === "existing" ? oneTimeId("one_time_step", `${workspace.id}:${prepared.templateId}`) : oneTimeId("one_time_step", `${workspace.id}:${batchId}`);
  const now = new Date();
  const sendWhen = value(formData, "sendWhen");
  let scheduledAt = now;
  if (sendWhen === "tomorrow" || sendWhen === "date") {
    const [userPreference, scheduling] = await Promise.all([
      prisma.userPreference.findUnique({ where: { userId: user.id } }),
      prisma.workspacePreference.findUnique({ where: { workspaceId: workspace.id } })
    ]);
    const timezone = userPreference?.timezone ?? "UTC";
    const date = sendWhen === "tomorrow"
      ? addLogicalDays(logicalDateInTimezone(now, timezone), 1)
      : selectedDate(value(formData, "scheduledDate"));
    if (!date) fail("Choose a valid message date.", session);
    scheduledAt = zonedDateTimeToUtc(date, scheduling?.defaultFollowUpMinutes ?? 600, timezone);
    if (scheduledAt <= now) fail("Choose a future message date.", session);
  }

  await prisma.$transaction(async (tx) => {
    await tx.mix.upsert({
      where: { id: hiddenMixId },
      create: { id: hiddenMixId, workspaceId: workspace.id, name: "One-time follow-ups", description: "Internal history for direct follow-ups.", triggerMode: "MANUAL_START", status: "ARCHIVED", source: "ONE_TIME" },
      update: { name: "One-time follow-ups", status: "ARCHIVED", source: "ONE_TIME" }
    });
    if (mode === "manual") {
      await tx.stepTemplate.create({ data: { id: prepared.templateId, workspaceId: workspace.id, name: prepared.name, channel: prepared.channel, isActive: false, currentVersion: 1 } });
      await tx.stepVersion.create({ data: { id: prepared.versionId, stepTemplateId: prepared.templateId, version: 1, subject: prepared.subject, body: prepared.body, script: prepared.script, longSms: prepared.channel === "SMS" && (prepared.body?.length ?? 0) > 160 } });
      await tx.mixStep.create({ data: { id: mixStepId, mixId: hiddenMixId, stepVersionId: prepared.versionId, dayOffset: 0, sortOrder: 1, isActive: false } });
    } else {
      await tx.mixStep.upsert({ where: { id: mixStepId }, create: { id: mixStepId, mixId: hiddenMixId, stepVersionId: prepared.versionId, dayOffset: 0, sortOrder: 1, isActive: false }, update: { stepVersionId: prepared.versionId, isActive: false } });
    }
    for (const contact of contacts) {
      const renderedSnapshot = renderJumpSnapshot({ subject: prepared.subject, body: prepared.body, script: prepared.script }, contact, workspace.profile, user, prepared.channel);
      const uniquenessKey = createHash("sha256").update(["one-time", workspace.id, batchId, contact.id, mixStepId].join(":")).digest("hex");
      await tx.jump.create({ data: { workspaceId: workspace.id, contactId: contact.id, mixId: hiddenMixId, mixStepId, stepVersionId: prepared.versionId, scheduledAt, baseScheduledAt: scheduledAt, status: "PENDING", reason: reason || prepared.name, templateSnapshot: { subject: prepared.subject, body: prepared.body, script: prepared.script, channel: prepared.channel, oneTime: true, batchId }, renderedSnapshot, uniquenessKey } });
    }
    await tx.auditLog.create({ data: { workspaceId: workspace.id, actorType: "USER", actorUserId: user.id, action: "contacts.apply_jump", entityType: "JumpBatch", entityId: batchId, source: "contacts.bulk", metadata: { contactCount: contacts.length, templateId: prepared.templateId, channel: prepared.channel, mode } } });
  });
  redirect(`/jumps?applied=${contacts.length}`);
}
