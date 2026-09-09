import { createHash } from "node:crypto";
import { configuredReportExclusions } from "@/lib/admin-report-range";
export const REPORT_EXPORT_TASK = "admin-report-export";
export const REPORT_SNAPSHOT_TASK = "admin-report-snapshot";
export const REPORT_EXPORT_BYTES = 524_288;
export const REPORT_SNAPSHOT_BYTES = 1_000_000;
export const REPORT_DEFINITION_VERSION = 2;
export function reportDefinitionKey(source: NodeJS.ProcessEnv = process.env) {
  return createHash("sha256").update(JSON.stringify({ version: REPORT_DEFINITION_VERSION,
    ids: [...new Set(["demo_user", ...configuredReportExclusions(source.REPORT_EXCLUDED_USER_IDS, "ids")])].sort(),
    emails: configuredReportExclusions(source.REPORT_EXCLUDED_EMAILS, "emails").sort()
  })).digest("hex");
}
