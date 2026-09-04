import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { getContactImportBatch, queueContactImportBatch, runContactImportBatch } from "../src/lib/contact-import-jobs";
import { prisma } from "../src/lib/prisma";

const workspaceIds: string[] = [];
const userIds: string[] = [];

afterAll(async () => {
  if (workspaceIds.length) await prisma.workspace.deleteMany({ where: { id: { in: workspaceIds } } });
  if (userIds.length) await prisma.user.deleteMany({ where: { id: { in: userIds } } });
});

describe.sequential("Contact import jobs", () => {
  it("queues, resumes, and completes a durable import batch", async () => {
    const suffix = randomUUID().replaceAll("-", "");
    const user = await prisma.user.create({ data: { email: `import-job-${suffix}@example.com`, name: "Import Owner", passwordHash: "test-only" } });
    userIds.push(user.id);
    const workspace = await prisma.workspace.create({
      data: { name: "Import Job", slug: `import-job-${suffix}`, ownerId: user.id, profile: { create: {} } }
    });
    workspaceIds.push(workspace.id);
    const importId = `import-${suffix}`;
    const rowId = `row-${suffix}`;

    const queued = await queueContactImportBatch({
      workspaceId: workspace.id,
      actorUserId: user.id,
      importId,
      sourceFileName: "contacts.csv",
      items: [{
        record: {
          rowId,
          sourceRow: 2,
          source: "CSV",
          firstName: "Import",
          lastName: "Tester",
          displayName: "Import Tester",
          company: null,
          publicNotes: "Created by the resumable import test.",
          emails: [{ value: `import-${suffix}@example.com`, label: "Work", isPrimary: true }],
          phones: [],
          addresses: [],
          groupIds: [],
          customFields: [],
          jumpDates: []
        },
        resolution: { rowId, action: "CREATE", targetContactId: null }
      }]
    });
    expect(queued.status).toBe("QUEUED");
    expect(await prisma.job.count({ where: { workspaceId: workspace.id, task: "contact-import" } })).toBe(1);

    await runContactImportBatch(queued.id);
    const completed = await getContactImportBatch(workspace.id, queued.id);
    expect(completed).toMatchObject({ status: "COMPLETED", processedRows: 1, createdCount: 1, failedCount: 0 });
    expect(await prisma.contact.count({ where: { workspaceId: workspace.id, displayName: "Import Tester" } })).toBe(1);

    await runContactImportBatch(queued.id);
    expect(await prisma.contact.count({ where: { workspaceId: workspace.id, displayName: "Import Tester" } })).toBe(1);
  });
});
