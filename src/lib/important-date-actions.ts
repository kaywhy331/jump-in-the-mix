"use server";

import type { DateRecurrence } from "@/generated/prisma/client";
import { redirect } from "next/navigation";
import { requireWorkspace } from "@/lib/auth";
import { daysInMonth } from "@/lib/jump-schedule";
import { prisma } from "@/lib/prisma";

function value(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function fail(path: string, message: string): never {
  redirect(`${path}${path.includes("?") ? "&" : "?"}error=${encodeURIComponent(message)}`);
}

function recurrenceValue(raw: string): DateRecurrence {
  return ["NONE", "MONTHLY", "YEARLY"].includes(raw) ? raw as DateRecurrence : "NONE";
}

function parseDateFields(formData: FormData, path: string): {
  dateValue: Date | null;
  month: number;
  day: number;
  recurrence: DateRecurrence;
} {
  const recurrence = recurrenceValue(value(formData, "recurrence"));
  const monthDayOnly = formData.get("monthDayOnly") === "1";
  if (monthDayOnly) {
    const month = Number(value(formData, "month"));
    const day = Number(value(formData, "day"));
    if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(day) || day < 1 || day > daysInMonth(2000, month)) {
      fail(path, "Choose a valid month and day.");
    }
    if (recurrence === "NONE") fail(path, "A month-and-day Important Date must repeat monthly or yearly.");
    return { dateValue: null, month, day, recurrence };
  }

  const dateValueRaw = value(formData, "dateValue");
  const parsed = new Date(`${dateValueRaw}T12:00:00Z`);
  if (!dateValueRaw || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== dateValueRaw) {
    fail(path, "Choose a valid date.");
  }
  return {
    dateValue: parsed,
    month: parsed.getUTCMonth() + 1,
    day: parsed.getUTCDate(),
    recurrence
  };
}

export async function createImportantDateAction(formData: FormData): Promise<void> {
  const { workspace, user, impersonation } = await requireWorkspace();
  const contactId = value(formData, "contactId");
  const path = `/contacts/${contactId}`;
  if (impersonation) fail(path, "Administrator support sessions are view-only.");
  const dateTypeId = value(formData, "dateTypeId");
  const label = value(formData, "label");
  const fields = parseDateFields(formData, path);
  const autoAssignRecommended = formData.get("autoAssignRecommended") === "on";

  const [contact, dateType] = await Promise.all([
    prisma.contact.findFirst({ where: { id: contactId, workspaceId: workspace.id, archivedAt: null }, select: { id: true } }),
    prisma.dateType.findFirst({
      where: { id: dateTypeId, isActive: true, OR: [{ workspaceId: workspace.id }, { workspaceId: null, isSystem: true }] },
      select: { id: true }
    })
  ]);
  if (!contact) fail("/contacts", "Contact not found.");
  if (!dateType) fail(path, "Choose a valid Important Date Type.");

  const matchingMix = autoAssignRecommended
    ? await prisma.mix.findFirst({
        where: {
          workspaceId: workspace.id,
          status: "ACTIVE",
          triggerMode: "DATE_TRIGGERED",
          dateTypeId: dateType.id,
          source: { not: "ONE_TIME" }
        },
        orderBy: [{ source: "asc" }, { createdAt: "asc" }],
        select: { id: true }
      })
    : null;

  const jumpDate = await prisma.$transaction(async (tx) => {
    const created = await tx.jumpDate.create({
      data: {
        workspaceId: workspace.id,
        contactId: contact.id,
        dateTypeId: dateType.id,
        ...fields,
        timezone: workspace.profile?.timezone ?? "UTC",
        label: label || null,
        isActive: true
      }
    });
    if (matchingMix) {
      const assignmentKey = `${workspace.id}:${matchingMix.id}:${contact.id}`;
      await tx.mixAssignment.upsert({
        where: { assignmentKey },
        create: { assignmentKey, workspaceId: workspace.id, mixId: matchingMix.id, contactId: contact.id, isActive: true },
        update: { isActive: true }
      });
    }
    await tx.job.create({
      data: {
        workspaceId: workspace.id,
        task: "generate-jumps",
        payload: { contactId: contact.id, ...(matchingMix ? { mixId: matchingMix.id } : {}) }
      }
    });
    await tx.auditLog.create({
      data: {
        workspaceId: workspace.id,
        actorType: "USER",
        actorUserId: user.id,
        action: "important-date.create",
        entityType: "JumpDate",
        entityId: created.id,
        source: "contacts.detail",
        metadata: { contactId: contact.id, dateTypeId: dateType.id, assignedMixId: matchingMix?.id ?? null }
      }
    });
    return created;
  });

  redirect(`${path}?dateCreated=1${matchingMix ? "&mixAssigned=1" : ""}#important-date-${jumpDate.id}`);
}

export async function updateImportantDateAction(formData: FormData): Promise<void> {
  const { workspace, user, impersonation } = await requireWorkspace();
  const contactId = value(formData, "contactId");
  const jumpDateId = value(formData, "jumpDateId");
  const dateTypeId = value(formData, "dateTypeId");
  const label = value(formData, "label");
  const path = `/contacts/${contactId}`;
  if (impersonation) fail(path, "Administrator support sessions are view-only.");
  const fields = parseDateFields(formData, path);

  const [contact, dateType, existing] = await Promise.all([
    prisma.contact.findFirst({ where: { id: contactId, workspaceId: workspace.id, archivedAt: null }, select: { id: true } }),
    prisma.dateType.findFirst({
      where: { id: dateTypeId, isActive: true, OR: [{ workspaceId: workspace.id }, { workspaceId: null, isSystem: true }] },
      select: { id: true }
    }),
    prisma.jumpDate.findFirst({ where: { id: jumpDateId, contactId, workspaceId: workspace.id, isActive: true }, select: { id: true } })
  ]);
  if (!contact || !existing) fail("/contacts", "Important Date not found.");
  if (!dateType) fail(path, "Choose a valid Important Date Type.");

  await prisma.$transaction([
    prisma.jumpDate.update({
      where: { id: existing.id },
      data: {
        dateTypeId: dateType.id,
        ...fields,
        label: label || null,
        timezone: workspace.profile?.timezone ?? "UTC"
      }
    }),
    prisma.job.create({ data: { workspaceId: workspace.id, task: "generate-jumps", payload: { contactId } } }),
    prisma.auditLog.create({
      data: {
        workspaceId: workspace.id,
        actorType: "USER",
        actorUserId: user.id,
        action: "important-date.update",
        entityType: "JumpDate",
        entityId: existing.id,
        source: "contacts.detail",
        metadata: { contactId, dateTypeId: dateType.id }
      }
    })
  ]);
  redirect(`${path}?dateUpdated=1#important-date-${existing.id}`);
}

export async function deactivateImportantDateAction(formData: FormData): Promise<void> {
  const { workspace, user, impersonation } = await requireWorkspace();
  const contactId = value(formData, "contactId");
  const jumpDateId = value(formData, "jumpDateId");
  const path = `/contacts/${contactId}`;
  if (impersonation) fail(path, "Administrator support sessions are view-only.");
  const existing = await prisma.jumpDate.findFirst({
    where: { id: jumpDateId, contactId, workspaceId: workspace.id, isActive: true },
    select: { id: true }
  });
  if (!existing) fail(path, "Important Date not found.");

  await prisma.$transaction([
    prisma.jumpDate.update({ where: { id: existing.id }, data: { isActive: false } }),
    prisma.job.create({ data: { workspaceId: workspace.id, task: "generate-jumps", payload: { contactId } } }),
    prisma.auditLog.create({
      data: {
        workspaceId: workspace.id,
        actorType: "USER",
        actorUserId: user.id,
        action: "important-date.deactivate",
        entityType: "JumpDate",
        entityId: existing.id,
        source: "contacts.detail",
        metadata: { contactId }
      }
    })
  ]);
  redirect(`${path}?dateDeleted=1`);
}
