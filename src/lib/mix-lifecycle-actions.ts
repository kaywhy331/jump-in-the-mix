"use server";

import { redirect } from "next/navigation";
import { requireWorkspace } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function value(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function fail(message: string): never {
  redirect(`/mixes?error=${encodeURIComponent(message)}`);
}

async function queueMixReconciliation(workspaceId: string, mixId: string): Promise<void> {
  await prisma.job.create({ data: { workspaceId, task: "generate-jumps", payload: { mixId } } });
}

export async function activateMixAction(formData: FormData): Promise<void> {
  const { workspace, user } = await requireWorkspace();
  const mixId = value(formData, "mixId");
  const mix = await prisma.mix.findFirst({
    where: { id: mixId, workspaceId: workspace.id, status: { in: ["DRAFT", "PAUSED"] }, source: { not: "ONE_TIME" } },
    select: { id: true, name: true }
  });
  if (!mix) fail("Plan not found or already active.");
  await prisma.$transaction([
    prisma.mix.update({ where: { id: mix.id }, data: { status: "ACTIVE" } }),
    prisma.auditLog.create({
      data: {
        workspaceId: workspace.id,
        actorType: "USER",
        actorUserId: user.id,
        action: "mix.activate",
        entityType: "Mix",
        entityId: mix.id,
        source: "mixes.list"
      }
    })
  ]);
  await queueMixReconciliation(workspace.id, mix.id);
  redirect("/mixes?activated=1");
}

export async function pauseMixAction(formData: FormData): Promise<void> {
  const { workspace, user } = await requireWorkspace();
  const mixId = value(formData, "mixId");
  const mix = await prisma.mix.findFirst({
    where: { id: mixId, workspaceId: workspace.id, status: "ACTIVE", source: { not: "ONE_TIME" } },
    select: { id: true }
  });
  if (!mix) fail("Active plan not found.");
  await prisma.$transaction([
    prisma.mix.update({ where: { id: mix.id }, data: { status: "PAUSED" } }),
    prisma.jump.updateMany({
      where: { mixId: mix.id, workspaceId: workspace.id, status: "PENDING", scheduledAt: { gte: new Date() } },
      data: { status: "CANCELED", completedAt: null, completionMethod: "mix_paused" }
    }),
    prisma.auditLog.create({
      data: {
        workspaceId: workspace.id,
        actorType: "USER",
        actorUserId: user.id,
        action: "mix.pause",
        entityType: "Mix",
        entityId: mix.id,
        source: "mixes.list"
      }
    })
  ]);
  await queueMixReconciliation(workspace.id, mix.id);
  redirect("/mixes?paused=1");
}

export async function archiveMixAction(formData: FormData): Promise<void> {
  const { workspace, user } = await requireWorkspace();
  const mixId = value(formData, "mixId");
  const mix = await prisma.mix.findFirst({
    where: { id: mixId, workspaceId: workspace.id, status: { not: "ARCHIVED" }, source: { not: "ONE_TIME" } },
    select: { id: true }
  });
  if (!mix) fail("Plan not found.");
  await prisma.$transaction([
    prisma.mix.update({ where: { id: mix.id }, data: { status: "ARCHIVED" } }),
    prisma.mixAssignment.updateMany({ where: { mixId: mix.id, workspaceId: workspace.id }, data: { isActive: false } }),
    prisma.mixBroadcastSchedule.deleteMany({ where: { mixId: mix.id, workspaceId: workspace.id } }),
    prisma.jump.updateMany({
      where: { mixId: mix.id, workspaceId: workspace.id, status: "PENDING" },
      data: { status: "CANCELED", completedAt: null, completionMethod: "mix_archived" }
    }),
    prisma.auditLog.create({
      data: {
        workspaceId: workspace.id,
        actorType: "USER",
        actorUserId: user.id,
        action: "mix.archive",
        entityType: "Mix",
        entityId: mix.id,
        source: "mixes.list"
      }
    })
  ]);
  redirect("/mixes?archived=1");
}
