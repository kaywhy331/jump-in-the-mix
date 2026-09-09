import type { ReportData } from "@/lib/admin-report-data";
import type { ReportRange } from "@/lib/admin-report-range";
import { csvCell } from "@/lib/contact-export";
import { REPORT_DEFINITION_VERSION, REPORT_EXPORT_BYTES } from "@/lib/report-storage-policy";
import { ReportError } from "@/lib/admin-report-range";

export function reportCsv(report: ReportData, range: ReportRange) {
  const rows: string[][] = [["section", "dimension", "metric", "value"]];
  const add = (section: string, dimension: string, value: object, keys: string[]) => {
    for (const key of keys) rows.push([section, dimension, key, String((value as Record<string, unknown>)[key] ?? "")]);
  };
  add("report", "definition", { version: REPORT_DEFINITION_VERSION, from: range.fromDay, through: range.throughDay, observedAt: range.asOf.toISOString(),
    population: "Retained customer records; demo, staff-only and configured test identities excluded from growth. All traffic in operational usage.",
    activation: "Current setup plus owner-recorded completion; automation excluded.",
    retention: "First-week meaningful use and a fully elapsed [7,8) or [30,31) day return window after creation.",
    invitationReceipts: "Each grant counts once for provider acceptance or delivery across current and archived email generations. Queue/review status describes the current generation.",
    limits: "Live retained data can restate history. Email transport is not proof of inbox placement, a read or a reply. See ADMIN_REPORTS.md."
  }, ["version", "from", "through", "observedAt", "population", "activation", "retention", "invitationReceipts", "limits"]);
  add("waitlist", "request cohort and current queue", report.waitlist, ["requested", "confirmed", "granted", "joined", "withdrawn", "waitingNow", "oldestWaitingDays"]);
  add("accounts", "new account cohort; activeInRange includes all ages", report.accounts, ["created", "verified", "setup", "withContact", "withMix", "activated", "activeInRange", "d7Eligible", "d7Returned", "d30Eligible", "d30Returned"]);
  for (const s of report.sources) add("invitation cohort", s.source, s, ["issued", "accepted", "activated", "invitingMembers", "providerAccepted", "delivered", "revoked", "queued", "review", "medianJoinHours"]);
  report.waves.forEach((w, i) => add("wave", `${i + 1}: ${w.releasedAt} UTC`, w, ["scheduledFor", "releasedAt", "fifo", "random", "retainedInvites", "accepted", "activated", "providerAccepted", "delivered", "queued", "review"]));
  report.library.forEach((m, i) => add("public library", `${i + 1}: ${m.title}`, m, ["version", "copies", "completed", "skipped", "connected"]));
  for (const day of report.daily) add("daily UTC", day.day, day, ["accounts", "requests", "issued", "accepted", "active", "completed", "skipped", "emailAttempts", "emailFailures", "jobFailures"]);
  add("operations", "observation time; all traffic", report.operations, ["queuedInvitations", "invitationReviews", "oldestInvitationHours", "overdueJobs", "failedJobs", "databaseBytes", "emailDayUsed", "emailMonthUsed"]);
  const csv = `${rows.map(row => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
  if (Buffer.byteLength(csv, "utf8") > REPORT_EXPORT_BYTES) throw new ReportError("This report exceeds the export size limit. Choose a shorter range.");
  return csv;
}
