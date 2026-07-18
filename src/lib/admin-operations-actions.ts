"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function value(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

export async function retryFailedJobAction(formData: FormData): Promise<void> {
  const { user } = await requirePlatformAdmin();
  const jobId = value(formData, "jobId");
  if (!jobId) throw new Error("Job ID is required.");

  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) throw new Error("The background job no longer exists.");
  if (!job.failedAt && !job.lastError) throw new Error("Only failed jobs can be retried from this control.");

  await prisma.$transaction(async (tx) => {
    await tx.job.update({
      where: { id: job.id },
      data: {
        runAt: new Date(),
        attempts: 0,
        lockedAt: null,
        lockedBy: null,
        completedAt: null,
        failedAt: null,
        lastError: null
      }
    });
    if (job.workspaceId) {
      await tx.auditLog.create({
        data: {
          workspaceId: job.workspaceId,
          actorType: "ADMIN",
          actorUserId: user.id,
          action: "admin.job.retry",
          entityType: "Job",
          entityId: job.id,
          source: "admin.operations",
          metadata: { task: job.task, previousAttempts: job.attempts }
        }
      });
    }
  });
  revalidatePath("/admin");
  revalidatePath("/admin/operations");
}
