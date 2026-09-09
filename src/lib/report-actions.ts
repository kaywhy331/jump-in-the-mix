"use server";
import { redirect } from "next/navigation";
import { requirePlatformAdmin } from "@/lib/auth";
import { consumeRateLimit } from "@/lib/rate-limit";
import { requestReportExport } from "@/lib/report-exports";
import { ReportError } from "@/lib/admin-report-range";

export async function requestReportExportAction(data: FormData): Promise<void> {
  const { user, session } = await requirePlatformAdmin("reports.read");
  try {
    if (!(await consumeRateLimit({ scope: "admin.report-export", identifiers: [user.id], limit: 20, windowMs: 5 * 60_000 })).allowed) throw new ReportError("Too many export requests. Please try again in five minutes.");
    await requestReportExport({ actorUserId: user.id, actorSessionId: session.id }, { from: data.get("from"), through: data.get("through"), requestKey: data.get("requestKey") });
  } catch (cause) {
    if (cause instanceof Error && "digest" in cause) throw cause;
    redirect(`/admin/reports/exports?error=${encodeURIComponent(cause instanceof ReportError ? cause.message : "The export could not be requested. Please try again.")}`);
  }
  redirect("/admin/reports/exports?queued=1");
}
