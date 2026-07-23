"use server";

import type { JumpStatus } from "@/generated/prisma/client";
import { redirect } from "next/navigation";
import { requireWorkspace } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function value(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function returnPath(formData: FormData): string {
  const candidate = value(formData, "returnTo");
  return candidate.startsWith("/jumps") && !candidate.startsWith("//") ? candidate : "/jumps";
}

function withResult(path: string, value: string): string {
  const url = new URL(path, "https://jump-in-the-mix.local");
  url.searchParams.set("jumpUpdated", value);
  return `${url.pathname}${url.search}${url.hash}`;
}

export async function updateJumpStatusAction(formData: FormData): Promise<void> {
  const { workspace, user, impersonation } = await requireWorkspace();
  const destination = returnPath(formData);
  if (impersonation) redirect(withResult(destination, "readonly"));

  const jumpId = value(formData, "jumpId");
  const status = value(formData, "status") as JumpStatus;
  const allowedTargets: JumpStatus[] = ["PENDING", "DONE", "SKIPPED"];
  if (!allowedTargets.includes(status)) redirect(withResult(destination, "invalid"));

  const currentStatuses: JumpStatus[] = status === "PENDING"
    ? ["DONE", "SENT", "SKIPPED"]
    : ["PENDING", "COPIED"];
  const completedAt = status === "DONE" || status === "SKIPPED" ? new Date() : null;
  const result = await prisma.$transaction(async (tx) => {
    const changed = await tx.jump.updateMany({
      where: { id: jumpId, workspaceId: workspace.id, status: { in: currentStatuses } },
      data: {
        status,
        completedAt,
        completionMethod: status === "PENDING" ? null : status.toLowerCase()
      }
    });
    if (changed.count) {
      await tx.auditLog.create({
        data: {
          workspaceId: workspace.id,
          actorType: "USER",
          actorUserId: user.id,
          action: status === "PENDING" ? "jump.reopen" : `jump.${status.toLowerCase()}`,
          entityType: "Jump",
          entityId: jumpId,
          source: "jumps.today",
          metadata: { nextStatus: status }
        }
      });
    }
    return changed.count;
  });

  redirect(withResult(destination, result ? status.toLowerCase() : "stale"));
}
