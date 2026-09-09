import type { Prisma } from "@/generated/prisma/client";
import type { ImportCommitResult } from "@/lib/contact-import-types";

export function importResults(value: Prisma.JsonValue | null | undefined): ImportCommitResult[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(item => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    if (typeof item.rowId !== "string" || typeof item.sourceRow !== "number" || typeof item.message !== "string" || !["CREATED", "MERGED", "REPLACED", "SKIPPED", "FAILED"].includes(String(item.status))) return [];
    return [{ rowId: item.rowId, sourceRow: item.sourceRow, status: item.status as ImportCommitResult["status"], contactId: typeof item.contactId === "string" ? item.contactId : null, message: item.message }];
  });
}

export function importCounts(results: ImportCommitResult[]) {
  return {
    createdCount: results.filter(item => item.status === "CREATED").length,
    mergedCount: results.filter(item => item.status === "MERGED").length,
    replacedCount: results.filter(item => item.status === "REPLACED").length,
    skippedCount: results.filter(item => item.status === "SKIPPED").length,
    failedCount: results.filter(item => item.status === "FAILED").length
  };
}
