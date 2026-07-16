"use server";

import { redirect } from "next/navigation";
import { requireWorkspace } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function value(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function safeReturnTo(raw: string, contactId: string): string {
  if (raw === "/jumps") return raw;
  if (raw === `/contacts/${contactId}`) return raw;
  return `/contacts/${contactId}`;
}

function withFlag(path: string, flag: string): string {
  return `${path}${path.includes("?") ? "&" : "?"}${flag}=1`;
}

export async function stopMixForContactAction(formData: FormData): Promise<void> {
  const { workspace, user } = await requireWorkspace();
  const contactId = value(formData, "contactId");
  const mixId = value(formData, "mixId");
  const reason = value(formData, "reason");
  const returnTo = safeReturnTo(value(formData, "returnTo"), contactId);
  const [contact, mix] = await Promise.all([
    prisma.contact.findFirst({ where: { id: contactId, workspaceId: workspace.id, archivedAt: null }, select: { id: true } }),
    prisma.mix.findFirst({ where: { id: mixId, workspaceId: workspace.id, source: { not: "ONE_TIME" } }, select: { id: true, name: true } })
  ]);
  if (!contact || !mix) redirect(withFlag(returnTo, "mixStopError"));

  await prisma.$transaction([
    prisma.mixStop.upsert({
      where: { workspaceId_mixId_contactId: { workspaceId: workspace.id, mixId: mix.id, contactId: contact.id } },
      create: { workspaceId: workspace.id, mixId: mix.id, contactId: contact.id, stoppedByUserId: user.id, reason: reason || null },
      update: { stoppedByUserId: user.id, reason: reason || null, stoppedAt: new Date() }
    }),
    prisma.jump.updateMany({
      where: { workspaceId: workspace.id, mixId: mix.id, contactId: contact.id, status: { in: ["PENDING", "COPIED"] } },
      data: { status: "CANCELED", completedAt: null, completionMethod: "mix_stopped_for_contact" }
    }),
    prisma.auditLog.create({
      data: {
        workspaceId: workspace.id,
        actorType: "USER",
        actorUserId: user.id,
        action: "mix.stop_for_contact",
        entityType: "Mix",
        entityId: mix.id,
        source: "user",
        metadata: { contactId: contact.id, reason: reason || null }
      }
    })
  ]);
  redirect(withFlag(returnTo, "mixStopped"));
}

export async function resumeMixForContactAction(formData: FormData): Promise<void> {
  const { workspace, user } = await requireWorkspace();
  const contactId = value(formData, "contactId");
  const mixId = value(formData, "mixId");
  const returnTo = safeReturnTo(value(formData, "returnTo"), contactId);
  const stop = await prisma.mixStop.findUnique({
    where: { workspaceId_mixId_contactId: { workspaceId: workspace.id, mixId, contactId } },
    select: { id: true }
  });
  if (!stop) redirect(withFlag(returnTo, "mixResumeError"));

  await prisma.$transaction([
    prisma.mixStop.delete({ where: { id: stop.id } }),
    prisma.job.create({ data: { workspaceId: workspace.id, task: "generate-jumps", payload: { contactId, mixId } } }),
    prisma.auditLog.create({
      data: {
        workspaceId: workspace.id,
        actorType: "USER",
        actorUserId: user.id,
        action: "mix.resume_for_contact",
        entityType: "Mix",
        entityId: mixId,
        source: "user",
        metadata: { contactId }
      }
    })
  ]);
  redirect(withFlag(returnTo, "mixResumed"));
}
