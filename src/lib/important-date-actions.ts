"use server";

import { redirect } from "next/navigation";
import { requireWorkspace } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function value(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function fail(path: string, message: string): never {
  redirect(`${path}${path.includes("?") ? "&" : "?"}error=${encodeURIComponent(message)}`);
}

export async function updateImportantDateAction(formData: FormData): Promise<void> {
  const { workspace } = await requireWorkspace();
  const contactId = value(formData, "contactId");
  const jumpDateId = value(formData, "jumpDateId");
  const dateTypeId = value(formData, "dateTypeId");
  const dateValueRaw = value(formData, "dateValue");
  const recurrenceRaw = value(formData, "recurrence");
  const label = value(formData, "label");
  const monthDayOnly = formData.get("monthDayOnly") === "1";
  const path = `/contacts/${contactId}`;

  const [contact, dateType, existing] = await Promise.all([
    prisma.contact.findFirst({ where: { id: contactId, workspaceId: workspace.id, archivedAt: null }, select: { id: true } }),
    prisma.dateType.findFirst({ where: { id: dateTypeId, isActive: true, OR: [{ workspaceId: workspace.id }, { workspaceId: null }] }, select: { id: true } }),
    prisma.jumpDate.findFirst({ where: { id: jumpDateId, contactId, workspaceId: workspace.id }, select: { id: true } })
  ]);
  if (!contact || !existing) fail("/contacts", "Important Date not found.");
  if (!dateType) fail(path, "Choose a valid Important Date Type.");

  const parsed = new Date(`${dateValueRaw}T12:00:00Z`);
  if (!dateValueRaw || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== dateValueRaw) {
    fail(path, "Choose a valid date.");
  }
  const recurrence = ["NONE", "MONTHLY", "YEARLY"].includes(recurrenceRaw)
    ? recurrenceRaw as "NONE" | "MONTHLY" | "YEARLY"
    : "NONE";

  await prisma.jumpDate.update({
    where: { id: existing.id },
    data: {
      dateTypeId: dateType.id,
      dateValue: monthDayOnly ? null : parsed,
      month: parsed.getUTCMonth() + 1,
      day: parsed.getUTCDate(),
      recurrence,
      label: label || null,
      timezone: workspace.profile?.timezone ?? "UTC"
    }
  });
  await prisma.job.create({ data: { workspaceId: workspace.id, task: "generate-jumps", payload: { contactId } } });
  redirect(`${path}?dateUpdated=1`);
}
