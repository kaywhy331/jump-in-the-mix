"use server";

import { createHash, randomUUID } from "node:crypto";
import type { Channel } from "@/generated/prisma/client";
import { redirect } from "next/navigation";
import { requireWorkspace } from "@/lib/auth";
import { renderJumpSnapshot } from "@/lib/jump-render";
import { containsPrivateNotesPlaceholder, findUnknownPlaceholders } from "@/lib/placeholders";
import { PLAN_LIMITS } from "@/lib/plans";
import { prisma } from "@/lib/prisma";

function value(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function selectedContactIds(formData: FormData): string[] {
  return [...new Set(formData.getAll("contactIds").map(String).filter(Boolean))];
}

function fail(message: string): never {
  redirect(`/contacts?error=${encodeURIComponent(message)}`);
}

async function scopedContacts(workspaceId: string, contactIds: string[]) {
  if (!contactIds.length) fail("Select at least one Contact.");
  const contacts = await prisma.contact.findMany({
    where: { workspaceId, archivedAt: null, id: { in: contactIds } },
    include: {
      emails: true,
      phones: true,
      addresses: true,
      customFieldValues: { include: { definition: true } }
    },
    orderBy: { displayName: "asc" }
  });
  if (contacts.length !== contactIds.length) fail("One or more selected Contacts are unavailable.");
  return contacts;
}

async function queueWorkspaceReconciliation(workspaceId: string): Promise<void> {
  await prisma.job.create({ data: { workspaceId, task: "generate-jumps", payload: {} } });
}

export async function bulkAssignGroupAction(formData: FormData): Promise<void> {
  const { workspace } = await requireWorkspace();
  const contactIds = selectedContactIds(formData);
  const groupId = value(formData, "groupId");
  const [contacts, group] = await Promise.all([
    scopedContacts(workspace.id, contactIds),
    prisma.group.findFirst({ where: { id: groupId, workspaceId: workspace.id }, select: { id: true } })
  ]);
  if (!group) fail("Choose an available Contact Group.");
  await prisma.contactGroupMembership.createMany({
    data: contacts.map((contact) => ({ contactId: contact.id, groupId: group.id })),
    skipDuplicates: true
  });
  await queueWorkspaceReconciliation(workspace.id);
  redirect(`/contacts?bulkAssigned=${contacts.length}`);
}

export async function bulkRemoveGroupAction(formData: FormData): Promise<void> {
  const { workspace } = await requireWorkspace();
  const contactIds = selectedContactIds(formData);
  const groupId = value(formData, "groupId");
  const [contacts, group] = await Promise.all([
    scopedContacts(workspace.id, contactIds),
    prisma.group.findFirst({ where: { id: groupId, workspaceId: workspace.id }, select: { id: true } })
  ]);
  if (!group) fail("Choose an available Contact Group.");
  await prisma.contactGroupMembership.deleteMany({ where: { groupId: group.id, contactId: { in: contacts.map((contact) => contact.id) } } });
  await queueWorkspaceReconciliation(workspace.id);
  redirect(`/contacts?bulkRemoved=${contacts.length}`);
}

export async function bulkArchiveContactsAction(formData: FormData): Promise<void> {
  const { workspace } = await requireWorkspace();
  const contacts = await scopedContacts(workspace.id, selectedContactIds(formData));
  const contactIds = contacts.map((contact) => contact.id);
  const archivedAt = new Date();
  await prisma.$transaction([
    prisma.contact.updateMany({ where: { workspaceId: workspace.id, id: { in: contactIds } }, data: { archivedAt } }),
    prisma.mixAssignment.updateMany({ where: { workspaceId: workspace.id, contactId: { in: contactIds } }, data: { isActive: false } }),
    prisma.jump.updateMany({
      where: { workspaceId: workspace.id, contactId: { in: contactIds }, status: { in: ["PENDING", "COPIED"] } },
      data: { status: "CANCELED", completedAt: null, completionMethod: "contacts_archived" }
    })
  ]);
  redirect(`/contacts?bulkArchived=${contacts.length}`);
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

function validateManualContent(formData: FormData, planTier: "FREE" | "PLUS" | "PRO") {
  const channel = channelFromForm(value(formData, "manualChannel"));
  const subject = value(formData, "manualSubject");
  const body = value(formData, "manualBody");
  const script = value(formData, "manualScript");
  if (!channel) throw new Error("Choose a valid one-time Jump channel.");
  if (channel === "VOICEMAIL" && planTier !== "PRO") throw new Error("Ringless Voicemail content is available on Pro.");
  if (channel === "EMAIL" && (!subject || !body)) throw new Error("Email Jumps require a subject and body.");
  if (["SMS", "WHATSAPP"].includes(channel) && !body) throw new Error("This one-time Jump requires message content.");
  if (["PHONE_CALL", "VOICEMAIL"].includes(channel) && !script) throw new Error("This one-time Jump requires a script or notes.");
  const content = [subject, body, script].filter(Boolean).join("\n");
  const unknown = findUnknownPlaceholders(content);
  if (unknown.length) throw new Error(`Unsupported placeholders: ${unknown.join(", ")}`);
  if (channel !== "PHONE_CALL" && containsPrivateNotesPlaceholder(content)) {
    throw new Error("Private Notes placeholders may only be used in Phone Call Jumps.");
  }
  return { channel, subject: subject || null, body: body || null, script: script || null };
}

function oneTimeId(prefix: string, value: string): string {
  const digest = createHash("sha256").update(value).digest("hex").slice(0, 28);
  return `${prefix}_${digest}`;
}

export async function applyJumpToContactsAction(formData: FormData): Promise<void> {
  const { workspace, user } = await requireWorkspace();
  const contacts = await scopedContacts(workspace.id, selectedContactIds(formData));
  const mode = value(formData, "applyMode") === "manual" ? "manual" : "existing";
  const reason = value(formData, "reason");
  const batchId = randomUUID();
  const hiddenMixId = oneTimeId("one_time_mix", workspace.id);

  let prepared: OneTimeContent;
  if (mode === "existing") {
    const stepTemplateId = value(formData, "stepTemplateId");
    const template = await prisma.stepTemplate.findFirst({
      where: { id: stepTemplateId, workspaceId: workspace.id, isActive: true },
      include: { versions: { orderBy: { version: "desc" }, take: 1 } }
    });
    const version = template?.versions[0];
    if (!template || !version) fail("Choose an available reusable Jump.");
    if (template.channel === "VOICEMAIL" && workspace.planTier !== "PRO") fail("Ringless Voicemail content is available on Pro.");
    prepared = {
      name: template.name,
      channel: template.channel,
      subject: version.subject,
      body: version.body,
      script: version.script,
      templateId: template.id,
      versionId: version.id
    };
  } else {
    let manual: ReturnType<typeof validateManualContent>;
    try {
      manual = validateManualContent(formData, workspace.planTier);
    } catch (error) {
      fail(error instanceof Error ? error.message : "The one-time Jump could not be prepared.");
    }
    const templateId = randomUUID();
    const versionId = randomUUID();
    prepared = {
      name: value(formData, "manualName") || `One-time ${manual.channel.replaceAll("_", " ").toLowerCase()}`,
      channel: manual.channel,
      subject: manual.subject,
      body: manual.body,
      script: manual.script,
      templateId,
      versionId
    };
  }

  const mixStepId = mode === "existing"
    ? oneTimeId("one_time_step", `${workspace.id}:${prepared.templateId}`)
    : oneTimeId("one_time_step", `${workspace.id}:${batchId}`);
  const scheduledAt = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.mix.upsert({
      where: { id: hiddenMixId },
      create: {
        id: hiddenMixId,
        workspaceId: workspace.id,
        name: "One-time Jumps",
        description: "Internal history container for directly applied Jumps.",
        triggerMode: "MANUAL_START",
        status: "ARCHIVED",
        source: "ONE_TIME"
      },
      update: { name: "One-time Jumps", status: "ARCHIVED", source: "ONE_TIME" }
    });

    if (mode === "manual") {
      await tx.stepTemplate.create({
        data: {
          id: prepared.templateId,
          workspaceId: workspace.id,
          name: prepared.name,
          channel: prepared.channel,
          isActive: false,
          currentVersion: 1
        }
      });
      await tx.stepVersion.create({
        data: {
          id: prepared.versionId,
          stepTemplateId: prepared.templateId,
          version: 1,
          subject: prepared.subject,
          body: prepared.body,
          script: prepared.script,
          longSms: prepared.channel === "SMS" && (prepared.body?.length ?? 0) > 160
        }
      });
      await tx.mixStep.create({
        data: { id: mixStepId, mixId: hiddenMixId, stepVersionId: prepared.versionId, dayOffset: 0, sortOrder: 1, isActive: false }
      });
    } else {
      await tx.mixStep.upsert({
        where: { id: mixStepId },
        create: { id: mixStepId, mixId: hiddenMixId, stepVersionId: prepared.versionId, dayOffset: 0, sortOrder: 1, isActive: false },
        update: { stepVersionId: prepared.versionId, isActive: false }
      });
    }

    for (const contact of contacts) {
      const renderedSnapshot = renderJumpSnapshot(
        { subject: prepared.subject, body: prepared.body, script: prepared.script },
        contact,
        workspace.profile,
        user,
        prepared.channel
      );
      const uniquenessKey = createHash("sha256")
        .update(["one-time", workspace.id, batchId, contact.id, mixStepId].join(":"))
        .digest("hex");
      await tx.jump.create({
        data: {
          workspaceId: workspace.id,
          contactId: contact.id,
          mixId: hiddenMixId,
          mixStepId,
          stepVersionId: prepared.versionId,
          scheduledAt,
          status: "PENDING",
          reason: reason || prepared.name,
          templateSnapshot: {
            subject: prepared.subject,
            body: prepared.body,
            script: prepared.script,
            channel: prepared.channel,
            oneTime: true,
            batchId
          },
          renderedSnapshot,
          uniquenessKey
        }
      });
    }

    await tx.auditLog.create({
      data: {
        workspaceId: workspace.id,
        actorType: "USER",
        actorUserId: user.id,
        action: "contacts.apply_jump",
        entityType: "JumpBatch",
        entityId: batchId,
        source: "contacts.bulk",
        metadata: { contactCount: contacts.length, templateId: prepared.templateId, channel: prepared.channel, mode }
      }
    });
  });

  redirect(`/jumps?applied=${contacts.length}`);
}
