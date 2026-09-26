import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { ImportPausedError, queueContactImportBatch, runContactImportBatch } from "../src/lib/contact-import-jobs";
import { ImportInterruptedError } from "../src/lib/contact-import-lease";
import type { ImportCommitItem } from "../src/lib/contact-import-service";
import { prisma } from "../src/lib/prisma";

// A worker shutdown stops a contact import only between its 25-row chunks (Release B, B9). Every
// finished chunk is in the batch results when the import stops, and the next run resumes after it
// without applying any row twice.
const local = /^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? "");
const workspaceIds: string[] = [];
const userIds: string[] = [];

afterAll(async () => {
  if (workspaceIds.length) await prisma.workspace.deleteMany({ where: { id: { in: workspaceIds } } });
  if (userIds.length) await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});

function items(count: number): ImportCommitItem[] {
  return Array.from({ length: count }, (_, index) => {
    const rowId = `row-${String(index + 1).padStart(2, "0")}`;
    return {
      record: { rowId, sourceRow: index + 2, source: "CSV", displayName: `Paused import ${rowId}`, firstName: null, lastName: null, company: null, publicNotes: null, emails: [], phones: [], addresses: [], groupIds: [], customFields: [], jumpDates: [] },
      resolution: { rowId, action: "CREATE", targetContactId: null }
    };
  });
}

async function fixture(rows: number) {
  const id = randomUUID().replaceAll("-", "");
  const user = await prisma.user.create({ data: { email: `import-pause-${id}@example.test`, name: "Import pause owner", passwordHash: "test-only" } });
  userIds.push(user.id);
  const workspace = await prisma.workspace.create({ data: { name: "Import pause", slug: `import-pause-${id}`, ownerId: user.id, profile: { create: {} } } });
  workspaceIds.push(workspace.id);
  const batch = await queueContactImportBatch({ workspaceId: workspace.id, actorUserId: user.id, importId: `pause_${id}`, items: items(rows) });
  const job = await prisma.job.findFirstOrThrow({ where: { workspaceId: workspace.id, task: "contact-import" } });
  const lease = { jobId: job.id, leaseId: `pause-test:${id}` };
  await prisma.job.update({ where: { id: job.id }, data: { lockedBy: lease.leaseId, lockedAt: new Date(), attempts: 1 } });
  const counts = async () => ({
    contacts: await prisma.contact.count({ where: { workspaceId: workspace.id } }),
    receipts: await prisma.idempotencyKey.count({ where: { workspaceId: workspace.id, key: { startsWith: `contact-import:${batch.importId}:` } } }),
    created: await prisma.auditLog.count({ where: { workspaceId: workspace.id, action: "contact.import.create" } }),
    completed: await prisma.auditLog.count({ where: { workspaceId: workspace.id, action: "contact.import.completed" } })
  });
  return { batch, lease, counts };
}

// A lease whose shouldStop() answers from a list: one answer per check, then the last answer again.
function stoppingLease(lease: { jobId: string; leaseId: string }, answers: boolean[]) {
  let checks = 0;
  return { ...lease, shouldStop: () => answers[Math.min(checks++, answers.length - 1)], checks: () => checks };
}

describe.skipIf(!local).sequential("contact import stopped by a worker shutdown", () => {
  it("stops after a saved chunk and resumes without repeating a row", async () => {
    const f = await fixture(30);
    const lease = stoppingLease(f.lease, [false, true]);
    const stopped = await runContactImportBatch(f.batch.id, lease).then(() => null, (error: unknown) => error);
    expect(stopped).toBeInstanceOf(ImportPausedError);
    expect(stopped).toBeInstanceOf(ImportInterruptedError);
    expect(lease.checks()).toBe(2);
    const paused = await prisma.contactImportBatch.findUniqueOrThrow({ where: { id: f.batch.id } });
    expect(paused).toMatchObject({ status: "RUNNING", processedRows: 25, createdCount: 25, failedCount: 0, completedAt: null, errorSummary: null });
    expect(paused.results).toHaveLength(25);
    expect(await f.counts()).toEqual({ contacts: 25, receipts: 25, created: 25, completed: 0 });

    await runContactImportBatch(f.batch.id, f.lease);
    expect(await prisma.contactImportBatch.findUniqueOrThrow({ where: { id: f.batch.id } })).toMatchObject({ status: "COMPLETED", processedRows: 30, createdCount: 30, failedCount: 0, errorSummary: null });
    expect(await f.counts()).toEqual({ contacts: 30, receipts: 30, created: 30, completed: 1 });
  });

  it("stops before the first chunk without writing a row", async () => {
    const f = await fixture(3);
    await expect(runContactImportBatch(f.batch.id, stoppingLease(f.lease, [true]))).rejects.toBeInstanceOf(ImportPausedError);
    expect(await prisma.contactImportBatch.findUniqueOrThrow({ where: { id: f.batch.id } })).toMatchObject({ status: "RUNNING", processedRows: 0, errorSummary: null });
    expect(await f.counts()).toEqual({ contacts: 0, receipts: 0, created: 0, completed: 0 });
    await runContactImportBatch(f.batch.id, stoppingLease(f.lease, [false]));
    expect(await f.counts()).toEqual({ contacts: 3, receipts: 3, created: 3, completed: 1 });
  });

  it("finishes the last chunk it started instead of stopping after it", async () => {
    const f = await fixture(20);
    const lease = stoppingLease(f.lease, [false, true]);
    await runContactImportBatch(f.batch.id, lease);
    expect(lease.checks()).toBe(1);
    expect(await prisma.contactImportBatch.findUniqueOrThrow({ where: { id: f.batch.id } })).toMatchObject({ status: "COMPLETED", processedRows: 20, createdCount: 20 });
    expect(await f.counts()).toEqual({ contacts: 20, receipts: 20, created: 20, completed: 1 });
  });
});
