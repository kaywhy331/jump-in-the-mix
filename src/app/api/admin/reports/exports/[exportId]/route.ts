import { requirePlatformAdmin } from "@/lib/auth";
import { downloadReportExport } from "@/lib/report-exports";
import { ReportError } from "@/lib/admin-report-range";
import { consumeRateLimit } from "@/lib/rate-limit";

export async function GET(_request: Request, { params }: { params: Promise<{ exportId: string }> }) {
  const { user, session } = await requirePlatformAdmin("reports.read");
  const headers = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow", "Referrer-Policy": "no-referrer" };
  if (!(await consumeRateLimit({ scope: "admin.report-download", identifiers: [user.id], limit: 20, windowMs: 60_000 })).allowed) return new Response("Please wait a minute before downloading again.", { status: 429, headers: { ...headers, "Retry-After": "60" } });
  const { exportId } = await params;
  if (exportId.length > 100) return new Response("Report unavailable.", { status: 404, headers });
  try {
    const file = await downloadReportExport({ actorUserId: user.id, actorSessionId: session.id }, exportId);
    return new Response(file.csv, { headers: { ...headers, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${file.filename}"`, "X-Content-Type-Options": "nosniff" } });
  } catch (cause) {
    return new Response(cause instanceof ReportError ? cause.message : "This report could not be opened. Request a new export.", { status: cause instanceof ReportError ? 404 : 500, headers });
  }
}
