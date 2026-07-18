import { escapeImportCsv, normalizedImportText } from "@/lib/contact-import-shared";
import type { ImportCommitResult, ImportContactRecord, ImportSummary } from "@/lib/contact-import-types";

export function contactNameForImport(record: ImportContactRecord): string {
  return record.displayName
    || [record.firstName, record.lastName].filter(Boolean).join(" ")
    || record.company
    || record.emails[0]?.value
    || record.phones[0]?.value
    || `Row ${record.sourceRow}`;
}

export function summarizeImportResults(results: ImportCommitResult[]): ImportSummary {
  return {
    created: results.filter((result) => result.status === "CREATED").length,
    merged: results.filter((result) => result.status === "MERGED").length,
    replaced: results.filter((result) => result.status === "REPLACED").length,
    skipped: results.filter((result) => result.status === "SKIPPED").length,
    failed: results.filter((result) => result.status === "FAILED").length,
    results
  };
}

export function createImportErrorCsv(results: ImportCommitResult[]): string {
  const failed = results.filter((result) => result.status === "FAILED");
  const rows = [["Source Row", "Row ID", "Error"], ...failed.map((result) => [result.sourceRow, result.rowId, result.message])];
  return rows.map((row) => row.map(escapeImportCsv).join(",")).join("\r\n");
}

export function createSampleImportCsv(): string {
  return [
    ["First Name", "Last Name", "Company", "Email", "Phone", "Birthday", "Anniversary", "Public Notes"],
    ["Jordan", "Lee", "Example Co", "jordan@example.com", "+1 626 555 0199", "1988-05-12", "2020-09-18", "Met at the neighborhood event"]
  ].map((row) => row.map(escapeImportCsv).join(",")).join("\r\n");
}

function bigrams(value: string): string[] {
  const normalized = normalizedImportText(value).replace(/\s+/g, "");
  if (normalized.length < 2) return normalized ? [normalized] : [];
  return Array.from({ length: normalized.length - 1 }, (_, index) => normalized.slice(index, index + 2));
}

export function textSimilarity(left: string | null | undefined, right: string | null | undefined): number {
  const leftPairs = bigrams(left ?? "");
  const rightPairs = bigrams(right ?? "");
  if (!leftPairs.length || !rightPairs.length) return 0;
  const remaining = [...rightPairs];
  let overlap = 0;
  for (const pair of leftPairs) {
    const index = remaining.indexOf(pair);
    if (index >= 0) {
      overlap += 1;
      remaining.splice(index, 1);
    }
  }
  return (2 * overlap) / (leftPairs.length + rightPairs.length);
}
