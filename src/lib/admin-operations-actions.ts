"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePlatformAdmin } from "@/lib/auth";
import { consumeRateLimit } from "@/lib/rate-limit";
import { JobRetryError, retryFailedJob } from "@/lib/admin-job-retry";

export async function retryFailedJobAction(formData: FormData): Promise<void> {
  const { user, session } = await requirePlatformAdmin("jobs.retry");
  let task: string;
  try {
    if (!(await consumeRateLimit({ scope: "admin.job-retry", identifiers: [user.id], limit: 20, windowMs: 5 * 60_000 })).allowed) throw new JobRetryError("Too many retries. Please wait five minutes.");
    const job = await retryFailedJob({ actorUserId: user.id, actorSessionId: session.id, jobId: String(formData.get("jobId") ?? ""), expectedFailedAt: String(formData.get("failedAt") ?? "") });
    task = job.task;
  } catch (error) {
    if (error instanceof Error && "digest" in error) throw error;
    redirect(`/admin/operations?error=${encodeURIComponent(error instanceof JobRetryError ? error.message : "The job could not be retried. Reload Operations.")}`);
  }
  revalidatePath("/admin"); revalidatePath("/admin/operations"); revalidatePath("/admin/reports/exports"); revalidatePath("/admin/reports/history");
  redirect(`/admin/operations?status=pending&task=${encodeURIComponent(task)}&retried=1`);
}
