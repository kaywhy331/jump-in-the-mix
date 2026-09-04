import type { ContactImportBatchStatus, PlanTier, Prisma } from "@/generated/prisma/client";
import { commitContactImportBatch, type ImportCommitItem } from "@/lib/contact-import-service";
import type { ImportCommitResult } from "@/lib/contact-import-types";
import { prisma } from "@/lib/prisma";
import { timezoneForUser } from "@/lib/display-preferences";

export const CONTACT_IMPORT_JOB_TASK = "contact-import";
const MAX_IMPORT_ROWS = 5000;
const PROCESSING_BATCH_SIZE = 25;

type ContactImportBatchPayload = {
  items: ImportCommitItem[];
  initialResults: ImportCommitResult[];
};

export type ContactImportBatchView = {
  id: string;
  importId: string;
  sourceFileName: string | null;
  status: ContactImportBatchStatus;
  totalRows: number;
  processedRows: number;
  progress: number;
  createdCount: number;
  mergedCount: number;
  replacedCount: number;
  skippedCount: number;
  failedCount: number;
  results: ImportCommitResult[];
  errorSummary: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
};

function inputJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function resultArray(value: Prisma.JsonValue | null | undefined): ImportCommitResult[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const object = item as Record<string, unknown>;
    if (typeof object.rowId !== "string" || typeof object.sourceRow !== "number" || typeof object.status !== "string" || typeof object.message !== "string") return [];
    return [{
      rowId: object.rowId,
      sourceRow: object.sourceRow,
      status: object.status as ImportCommitResult["status"],
      contactId: typeof object.contactId === "string" ? object.contactId : null,
      message: object.message
    }];
  });
}

function payloadValue(value: Prisma.JsonValue): ContactImportBatchPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("The Contact import batch payload is invalid.");
  const object = value as Record<string, unknown>;
  if (!Array.isArray(object.items) || !Array.isArray(object.initialResults)) throw new Error("The Contact import batch payload is incomplete.");
  return {
    items: object.items as unknown as ImportCommitItem[],
    initialResults: resultArray(object.initialResults as Prisma.JsonValue)
  };
}

function counts(results: ImportCommitResult[]) {
  return {
    createdCount: results.filter((item) => item.status === "CREATED").length,
    mergedCount: results.filter((item) => item.status === "MERGED").length,
    replacedCount: results.filter((item) => item.status === "REPLACED").length,
    skippedCount: results.filter((item) => item.status === "SKIPPED").length,
    failedCount: results.filter((item) => item.status === "FAILED").length
  };
}

function batchView(batch: {
  id: string;
  importId: string;
  sourceFileName: string | null;
  status: ContactImportBatchStatus;
  totalRows: number;
  processedRows: number;
  createdCount: number;
  mergedCount: number;
  replacedCount: number;
  skippedCount: number;
  failedCount: number;
  results: Prisma.JsonValue | null;
  errorSummary: string | null;
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
}): ContactImportBatchView {
  return {
    ...batch,
    progress: batch.totalRows ? Math.min(100, Math.round((batch.processedRows / batch.totalRows) * 100)) : 100,
    results: resultArray(batch.results),
    createdAt: batch.createdAt.toISOString(),
    startedAt: batch.startedAt?.toISOString() ?? null,
    completedAt: batch.completedAt?.toISOString() ?? null
  };
}

export async function queueContactImportBatch(input: {
  workspaceId: string;
  actorUserId: string;
  importId: string;
  sourceFileName?: string | null;
  items: ImportCommitItem[];
  initialResults?: ImportCommitResult[];
}): Promise<ContactImportBatchView> {
  if (!/^[a-zA-Z0-9_-]{8,120}$/.test(input.importId)) throw new Error("The import identifier is invalid.");
  const initialResults = input.initialResults ?? [];
  const totalRows = input.items.length + initialResults.length;
  if (!totalRows) throw new Error("Add at least one Contact row to the import.");
  if (totalRows > MAX_IMPORT_ROWS) throw new Error(`Import no more than ${MAX_IMPORT_ROWS.toLocaleString()} rows at a time.`);

  const existing = await prisma.contactImportBatch.findUnique({
    where: { workspaceId_importId: { workspaceId: input.workspaceId, importId: input.importId } }
  });
  if (existing) return batchView(existing);

  const initialCounts = counts(initialResults);
  const created = await prisma.$transaction(async (tx) => {
    const batch = await tx.contactImportBatch.create({
      data: {
        workspaceId: input.workspaceId,
        actorUserId: input.actorUserId,
        importId: input.importId,
        sourceFileName: input.sourceFileName?.trim().slice(0, 240) || null,
        status: "QUEUED",
        totalRows,
        processedRows: initialResults.length,
        ...initialCounts,
        payload: inputJson({ items: input.items, initialResults }),
        results: inputJson(initialResults)
      }
    });
    await tx.job.create({
      data: {
        workspaceId: input.workspaceId,
        task: CONTACT_IMPORT_JOB_TASK,
        payload: { batchId: batch.id },
        maxAttempts: 8
      }
    });
    await tx.auditLog.create({
      data: {
        workspaceId: input.workspaceId,
        actorType: "USER",
        actorUserId: input.actorUserId,
        action: "contact.import.queued",
        entityType: "ContactImportBatch",
        entityId: batch.id,
        source: "contacts.import",
        metadata: { importId: input.importId, totalRows, sourceFileName: batch.sourceFileName }
      }
    });
    return batch;
  });
  return batchView(created);
}

export async function getContactImportBatch(workspaceId: string, batchId: string): Promise<ContactImportBatchView | null> {
  const batch = await prisma.contactImportBatch.findFirst({ where: { id: batchId, workspaceId } });
  return batch ? batchView(batch) : null;
}

export async function listRecentContactImportBatches(workspaceId: string, take = 10): Promise<ContactImportBatchView[]> {
  const batches = await prisma.contactImportBatch.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(take, 1), 25)
  });
  return batches.map(batchView);
}

export async function cancelContactImportBatch(workspaceId: string, batchId: string): Promise<boolean> {
  const now = new Date();
  const result = await prisma.$transaction(async (tx) => {
    const canceled = await tx.contactImportBatch.updateMany({
      where: { id: batchId, workspaceId, status: { in: ["QUEUED", "RUNNING"] } },
      data: { status: "CANCELED", canceledAt: now, completedAt: now, errorSummary: "Canceled by user." }
    });
    if (canceled.count) {
      await tx.job.updateMany({
        where: { workspaceId, task: CONTACT_IMPORT_JOB_TASK, completedAt: null, failedAt: null, payload: { path: ["batchId"], equals: batchId } },
        data: { failedAt: now, lastError: "Import canceled by user.", lockedAt: null, lockedBy: null }
      });
    }
    return canceled.count === 1;
  });
  return result;
}

export async function runContactImportBatch(batchId: string): Promise<void> {
  const batch = await prisma.contactImportBatch.findUnique({ where: { id: batchId } });
  if (!batch) throw new Error("The Contact import batch no longer exists.");
  if (["COMPLETED", "PARTIAL", "CANCELED"].includes(batch.status)) return;

  const payload = payloadValue(batch.payload);
  const workspace = await prisma.workspace.findUnique({
    where: { id: batch.workspaceId },
    include: { profile: true }
  });
  if (!workspace) throw new Error("The Contact import workspace no longer exists.");
  const actorUserId = batch.actorUserId;
  if (!actorUserId) throw new Error("The Contact import no longer has an owning user.");
  const timezone = await timezoneForUser(actorUserId);

  await prisma.contactImportBatch.updateMany({
    where: { id: batch.id, status: { in: ["QUEUED", "RUNNING", "FAILED"] }, canceledAt: null },
    data: { status: "RUNNING", startedAt: batch.startedAt ?? new Date(), completedAt: null, errorSummary: null }
  });

  let results = resultArray(batch.results);
  const processed = new Set(results.map((item) => item.rowId));
  const pendingItems = payload.items.filter((item) => !processed.has(item.record.rowId));

  try {
    for (let index = 0; index < pendingItems.length; index += PROCESSING_BATCH_SIZE) {
      const current = await prisma.contactImportBatch.findUnique({ where: { id: batch.id }, select: { status: true, canceledAt: true } });
      if (!current || current.status === "CANCELED" || current.canceledAt) return;
      const chunk = pendingItems.slice(index, index + PROCESSING_BATCH_SIZE);
      const chunkResults = await commitContactImportBatch({
        workspaceId: batch.workspaceId,
        actorUserId,
        planTier: workspace.planTier as PlanTier,
        timezone,
        importId: batch.importId,
        items: chunk
      });
      results = [...results, ...chunkResults];
      const aggregate = counts(results);
      await prisma.contactImportBatch.update({
        where: { id: batch.id },
        data: {
          processedRows: results.length,
          ...aggregate,
          results: inputJson(results),
          errorSummary: chunkResults.some((item) => item.status === "FAILED") ? "Some rows need review." : null
        }
      });
    }

    const aggregate = counts(results);
    const finalStatus: ContactImportBatchStatus = aggregate.failedCount ? "PARTIAL" : "COMPLETED";
    const completedAt = new Date();
    await prisma.$transaction([
      prisma.contactImportBatch.update({
        where: { id: batch.id },
        data: {
          status: finalStatus,
          processedRows: results.length,
          ...aggregate,
          results: inputJson(results),
          completedAt,
          errorSummary: aggregate.failedCount ? `${aggregate.failedCount} row${aggregate.failedCount === 1 ? "" : "s"} could not be imported.` : null
        }
      }),
      prisma.auditLog.create({
        data: {
          workspaceId: batch.workspaceId,
          actorType: "SYSTEM",
          actorUserId,
          action: "contact.import.completed",
          entityType: "ContactImportBatch",
          entityId: batch.id,
          source: "worker.contact-import",
          metadata: { status: finalStatus, totalRows: batch.totalRows, ...aggregate }
        }
      })
    ]);
  } catch (error) {
    await prisma.contactImportBatch.updateMany({
      where: { id: batch.id, status: "RUNNING", canceledAt: null },
      data: { errorSummary: error instanceof Error ? error.message.slice(0, 1000) : "The import was interrupted." }
    });
    throw error;
  }
}
