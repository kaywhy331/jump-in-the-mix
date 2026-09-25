"use server";
import { safeAdminReturnTo } from "@/lib/admin-navigation";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePlatformAdmin } from "@/lib/auth";
import { SIGNED_ERROR_PARAMS, withViewerError } from "@/lib/form-errors";
import { consumeRateLimit } from "@/lib/rate-limit";
import { JobRetryError, retryFailedJob } from "@/lib/admin-job-retry";

export async function retryFailedJobAction(formData: FormData): Promise<void> {
  const { user, session } = await requirePlatformAdmin("jobs.retry");
  const returnTo = safeAdminReturnTo(String(formData.get("returnTo") ?? ""), "/admin/operations");
  const destination = (key?: string, value = "") => { const url = new URL(returnTo, "https://admin.invalid"); for (const name of SIGNED_ERROR_PARAMS) url.searchParams.delete(name); if (key) url.searchParams.set(key, value); return `${url.pathname}${url.search}`; };
  let task: string;
  try {
    if (!(await consumeRateLimit({ scope: "admin.job-retry", identifiers: [user.id], limit: 20, windowMs: 5 * 60_000 })).allowed) throw new JobRetryError("Too many retries. Please wait five minutes.");
    const job = await retryFailedJob({ actorUserId: user.id, actorSessionId: session.id, jobId: String(formData.get("jobId") ?? ""), expectedFailedAt: String(formData.get("failedAt") ?? "") });
    task = job.task;
  } catch (error) {
    if (error instanceof Error && "digest" in error) throw error;
    redirect(withViewerError(destination(), error instanceof JobRetryError ? error.message : "The job could not be retried. Reload Operations.", session));
  }
  revalidatePath("/admin"); revalidatePath("/admin/operations"); revalidatePath("/admin/reports/exports"); revalidatePath("/admin/reports/history");
  redirect(destination("retried", "1"));
}
