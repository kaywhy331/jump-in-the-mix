import { ContactImportInputError } from "@/lib/contact-import-errors";
import type { ContactImportBatchStatus, Prisma } from "@/generated/prisma/client";
import { commitContactImportBatch, type ImportCommitItem } from "@/lib/contact-import-service";
import type { ImportCommitResult } from "@/lib/contact-import-types";
import { prisma } from "@/lib/prisma";
import { lockAccess } from "@/lib/access-lock";
import { importResults as resultArray, importCounts as counts } from "@/lib/contact-import-state";
import { lockImportJob, lockRunningImport, type ImportJobLease } from "@/lib/contact-import-lease";
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

function payloadValue(value: Prisma.JsonValue): ContactImportBatchPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("The Contact import batch payload is invalid.");
  const object = value as Record<string, unknown>;
  if (!Array.isArray(object.items) || !Array.isArray(object.initialResults)) throw new Error("The Contact import batch payload is incomplete.");
  return {
    items: object.items as unknown as ImportCommitItem[],
    initialResults: resultArray(object.initialResults as Prisma.JsonValue)
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
  if (!/^[a-zA-Z0-9_-]{8,120}$/.test(input.importId)) throw new ContactImportInputError("The import identifier is invalid.");
  const initialResults = input.initialResults ?? [];
  const totalRows = input.items.length + initialResults.length;
  if (!totalRows) throw new ContactImportInputError("Add at least one Contact row to the import.");
  if (totalRows > MAX_IMPORT_ROWS) throw new ContactImportInputError(`Import no more than ${MAX_IMPORT_ROWS.toLocaleString()} rows at a time.`);

  const rowIds = [...input.items.map(item => item.record.rowId), ...initialResults.map(item => item.rowId)];
  if (rowIds.some(id => typeof id !== "string" || !id || id.length > 160) || new Set(rowIds).size !== totalRows || input.items.some(item => item.resolution.rowId !== item.record.rowId)) throw new ContactImportInputError("Each import row needs its own matching identifier.");

  const initialCounts = counts(initialResults);
  const created = await prisma.$transaction(async (tx) => {
    await lockAccess(tx);
    if (!await tx.workspace.findFirst({ where: { id: input.workspaceId, ownerId: input.actorUserId, owner: { suspendedAt: null } }, select: { id: true } })) throw new ContactImportInputError("This account cannot import contacts right now.");
    const existing = await tx.contactImportBatch.findUnique({ where: { workspaceId_importId: { workspaceId: input.workspaceId, importId: input.importId } } });
    if (existing) return existing;
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
    await lockAccess(tx);
    await tx.$queryRaw`SELECT id FROM "Job" WHERE "workspaceId"=${workspaceId} AND task='contact-import' AND payload->>'batchId'=${batchId} AND "completedAt" IS NULL ORDER BY id FOR UPDATE`;
    const batch = await tx.contactImportBatch.findFirst({ where: { id: batchId, workspaceId, status: { in: ["QUEUED", "RUNNING"] } } });
    if (!batch) return false;
    // A stopped chunk may contain committed rows not yet in the progress report.
    const rowKeys = payloadValue(batch.payload).items.map(item => `contact-import:${batch.importId}:${item.record.rowId}`);
    const receipts = await tx.idempotencyKey.findMany({ where: { workspaceId, key: { in: rowKeys } }, select: { response: true } });
    const saved = new Map(resultArray(batch.results).map(item => [item.rowId, item]));
    for (const receipt of receipts) for (const result of resultArray([receipt.response])) if (!saved.has(result.rowId)) saved.set(result.rowId, result);
    const results = [...saved.values()];
    const canceled = await tx.contactImportBatch.updateMany({
      where: { id: batchId, workspaceId, status: { in: ["QUEUED", "RUNNING"] } },
      data: { status: "CANCELED", canceledAt: now, completedAt: now, errorSummary: "Canceled by user.", results: inputJson(results), processedRows: results.length, ...counts(results) }
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

export async function runContactImportBatch(batchId: string, lease: ImportJobLease): Promise<void> {
  const initial = await prisma.contactImportBatch.findUnique({ where: { id: batchId }, select: { workspaceId: true } });
  if (!initial) throw new Error("The Contact import batch no longer exists.");
  const workspaceId = initial.workspaceId;
  const batch = await prisma.$transaction(async tx => {
    await lockAccess(tx);
    await lockImportJob(tx, batchId, lease, workspaceId);
    await tx.$queryRaw`SELECT id FROM "ContactImportBatch" WHERE id=${batchId} AND "workspaceId"=${workspaceId} FOR UPDATE`;
    const current = await tx.contactImportBatch.findUniqueOrThrow({ where: { id: batchId } });
    if (["COMPLETED", "PARTIAL", "CANCELED"].includes(current.status) || current.canceledAt) return null;
    if (!current.actorUserId || !await tx.workspace.findFirst({ where: { id: workspaceId, ownerId: current.actorUserId, owner: { suspendedAt: null } }, select: { id: true } })) throw new Error("The import account is unavailable. Restore access before retrying.");
    await tx.contactImportBatch.update({ where: { id: batchId }, data: { status: "RUNNING", startedAt: current.startedAt ?? new Date(), completedAt: null, errorSummary: null } });
    return current;
  });
  if (!batch) return;
  const payload = payloadValue(batch.payload);
  const actorUserId = batch.actorUserId!;
  const timezone = await timezoneForUser(actorUserId);
  const processed = new Set(resultArray(batch.results).map(item => item.rowId));
  const pendingItems = payload.items.filter(item => !processed.has(item.record.rowId));
  try {
    for (let index = 0; index < pendingItems.length; index += PROCESSING_BATCH_SIZE) {
      const chunkResults = await commitContactImportBatch({ workspaceId, actorUserId, timezone, importId: batch.importId, items: pendingItems.slice(index, index + PROCESSING_BATCH_SIZE), background: { ...lease, batchId } });
      await prisma.$transaction(async tx => {
        await lockAccess(tx);
        await lockImportJob(tx, batchId, lease, workspaceId);
        await lockRunningImport(tx, batchId, workspaceId);
        const current = await tx.contactImportBatch.findUniqueOrThrow({ where: { id: batchId }, select: { results: true } });
        const saved = new Map(resultArray(current.results).map(item => [item.rowId, item]));
        for (const result of chunkResults) if (!saved.has(result.rowId)) saved.set(result.rowId, result);
        const results = [...saved.values()];
        await tx.contactImportBatch.update({ where: { id: batchId }, data: { processedRows: results.length, ...counts(results), results: inputJson(results), errorSummary: results.some(item => item.status === "FAILED") ? "Some rows need review." : null } });
      });
    }
    await prisma.$transaction(async tx => {
      await lockAccess(tx);
      await lockImportJob(tx, batchId, lease, workspaceId);
      await lockRunningImport(tx, batchId, workspaceId);
      const current = await tx.contactImportBatch.findUniqueOrThrow({ where: { id: batchId }, select: { results: true, totalRows: true } });
      const results = resultArray(current.results), aggregate = counts(results);
      if (results.length !== current.totalRows) throw new Error("The saved import results are incomplete. Review the batch before retrying.");
      const status = aggregate.failedCount ? "PARTIAL" : "COMPLETED";
      await tx.contactImportBatch.update({ where: { id: batchId }, data: { status, processedRows: results.length, ...aggregate, completedAt: new Date(), errorSummary: aggregate.failedCount ? `${aggregate.failedCount} row${aggregate.failedCount === 1 ? "" : "s"} could not be imported.` : null } });
      await tx.auditLog.create({ data: { workspaceId, actorType: "SYSTEM", actorUserId, action: "contact.import.completed", entityType: "ContactImportBatch", entityId: batchId, source: "worker.contact-import", metadata: { status, totalRows: current.totalRows, ...aggregate } } });
    });
  } catch (error) {
    await prisma.$transaction(async tx => {
      await lockAccess(tx);
      await lockImportJob(tx, batchId, lease, workspaceId);
      await lockRunningImport(tx, batchId, workspaceId);
      await tx.contactImportBatch.update({ where: { id: batchId }, data: { errorSummary: "Import processing was interrupted. Saved rows will be reused on retry." } });
    }).catch(() => undefined);
    throw error;
  }
}
