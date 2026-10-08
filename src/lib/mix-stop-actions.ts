"use server";

import { redirect } from "next/navigation";
import { withViewerError, type ErrorViewer } from "@/lib/form-errors";
import { requireWritableWorkspace } from "@/lib/writable-workspace";
import { prisma } from "@/lib/prisma";
import { reservePeople } from "@/lib/plan-limits";

function value(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function safeReturnTo(raw: string, contactId: string): string {
  if (raw === "/jumps" || raw.startsWith("/jumps?")) return raw;
  if (raw === `/contacts/${contactId}`) return raw;
  return `/contacts/${contactId}`;
}

function withFlag(path: string, flag: string): string {
  return `${path}${path.includes("?") ? "&" : "?"}${flag}=1`;
}

/** During a view-only support session the person goes back to the page they came from, with the reason. */
function refuseTo(formData: FormData) {
  return (message: string, viewer: ErrorViewer): never => {
    const path = safeReturnTo(value(formData, "returnTo"), value(formData, "contactId"));
    redirect(withViewerError(path, message, viewer));
  };
}

export async function stopMixForContactAction(formData: FormData): Promise<void> {
  const { workspace, user } = await requireWritableWorkspace(refuseTo(formData));
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
      where: { workspaceId: workspace.id, mixId: mix.id, contactId: contact.id, status: "PENDING" },
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
  const { workspace, user, session } = await requireWritableWorkspace(refuseTo(formData));
  const contactId = value(formData, "contactId");
  const mixId = value(formData, "mixId");
  const returnTo = safeReturnTo(value(formData, "returnTo"), contactId);
  const stop = await prisma.mixStop.findUnique({
    where: { workspaceId_mixId_contactId: { workspaceId: workspace.id, mixId, contactId } },
    select: { id: true }
  });
  if (!stop) redirect(withFlag(returnTo, "mixResumeError"));
  // Resuming starts follow-ups again, which takes a place on the plan if the person has none.
  const refusal = await reservePeople(workspace.id, [contactId]);
  if (refusal) redirect(withViewerError(returnTo, refusal, session));
  // Someone removed from a Mix for Everyone was stopped in it (D64); resuming gives them their place back, from today.
  const everyone = await prisma.mix.findFirst({ where: { id: mixId, workspaceId: workspace.id, audienceEveryone: true, status: { in: ["ACTIVE", "PAUSED"] }, source: { not: "ONE_TIME" } }, select: { triggerMode: true } });

  await prisma.$transaction([
    prisma.mixStop.delete({ where: { id: stop.id } }),
    ...everyone ? [prisma.mixAssignment.updateMany({
      where: { workspaceId: workspace.id, mixId, contactId, assignmentKey: `${workspace.id}:${mixId}:audience:${contactId}`, isActive: false },
      data: { isActive: true, startDate: everyone.triggerMode === "MANUAL_START" ? new Date() : null }
    })] : [],
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
