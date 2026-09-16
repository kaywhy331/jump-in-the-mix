"use server";
import { safeAdminReturnTo } from "@/lib/admin-navigation";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePlatformAdmin } from "@/lib/auth";
import { consumeRateLimit } from "@/lib/rate-limit";
import { JobRetryError, retryFailedJob } from "@/lib/admin-job-retry";

export async function retryFailedJobAction(formData: FormData): Promise<void> {
  const { user, session } = await requirePlatformAdmin("jobs.retry");
  const returnTo = safeAdminReturnTo(String(formData.get("returnTo") ?? ""), "/admin/operations");
  const destination = (key: string, value: string) => { const url = new URL(returnTo, "https://admin.invalid"); url.searchParams.delete("error"); url.searchParams.set(key, value); return `${url.pathname}${url.search}`; };
  let task: string;
  try {
    if (!(await consumeRateLimit({ scope: "admin.job-retry", identifiers: [user.id], limit: 20, windowMs: 5 * 60_000 })).allowed) throw new JobRetryError("Too many retries. Please wait five minutes.");
    const job = await retryFailedJob({ actorUserId: user.id, actorSessionId: session.id, jobId: String(formData.get("jobId") ?? ""), expectedFailedAt: String(formData.get("failedAt") ?? "") });
    task = job.task;
  } catch (error) {
    if (error instanceof Error && "digest" in error) throw error;
    redirect(destination("error", error instanceof JobRetryError ? error.message : "The job could not be retried. Reload Operations."));
  }
  revalidatePath("/admin"); revalidatePath("/admin/operations"); revalidatePath("/admin/reports/exports"); revalidatePath("/admin/reports/history");
  redirect(destination("retried", "1"));
}
