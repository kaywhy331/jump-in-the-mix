import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { commitContactImportBatch, findImportMatches } from "../src/lib/contact-import-service";
import type { ImportContactRecord, ImportResolution } from "../src/lib/contact-import";
import { prisma } from "../src/lib/prisma";

function record(overrides: Partial<ImportContactRecord> = {}): ImportContactRecord {
  return {
    rowId: "row-2-example",
    sourceRow: 2,
    source: "CSV",
    firstName: "Jordan",
    lastName: "Lee",
    displayName: "Jordan Lee",
    company: "Example Co",
    publicNotes: null,
    emails: [{ value: "jordan@example.com", label: "Work", isPrimary: true }],
    phones: [],
    addresses: [],
    groupIds: [],
    customFields: [],
    jumpDates: [],
    ...overrides
  };
}

function resolution(rowId: string, action: ImportResolution["action"], targetContactId: string | null = null): ImportResolution {
  return { rowId, action, targetContactId };
}

describe.sequential("Contact import service", () => {
  const suffix = randomUUID().replaceAll("-", "");
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    const [userA, userB] = await Promise.all([
      prisma.user.create({ data: { email: `import-a-${suffix}@example.com`, name: "Import A", passwordHash: "test-only" } }),
      prisma.user.create({ data: { email: `import-b-${suffix}@example.com`, name: "Import B", passwordHash: "test-only" } })
    ]);
    ids.userA = userA.id;
    ids.userB = userB.id;

    const [workspaceA, workspaceB] = await Promise.all([
      prisma.workspace.create({ data: { name: "Import A", slug: `import-a-${suffix}`, ownerId: userA.id, profile: { create: { timezone: "America/Los_Angeles" } } } }),
      prisma.workspace.create({ data: { name: "Import B", slug: `import-b-${suffix}`, ownerId: userB.id, profile: { create: { timezone: "America/New_York" } } } })
    ]);
    ids.workspaceA = workspaceA.id;
    ids.workspaceB = workspaceB.id;

    const [contactA, contactB, groupA, fieldA] = await Promise.all([
      prisma.contact.create({
        data: {
          workspaceId: workspaceA.id,
          displayName: "Jordan Lee",
          firstName: "Jordan",
          lastName: "Lee",
          company: "Example Co",
          publicNotes: "Original note",
          emails: { create: { email: "shared@example.com", normalized: "shared@example.com", isPrimary: true } }
        }
      }),
      prisma.contact.create({
        data: {
          workspaceId: workspaceB.id,
          displayName: "Other Workspace",
          emails: { create: { email: "shared@example.com", normalized: "shared@example.com", isPrimary: true } }
        }
      }),
      prisma.group.create({ data: { workspaceId: workspaceA.id, name: `VIP ${suffix}` } }),
      prisma.contactCustomFieldDefinition.create({ data: { workspaceId: workspaceA.id, name: "Policy Number", key: `policy_${suffix.slice(0, 8)}` } })
    ]);
    Object.assign(ids, { contactA: contactA.id, contactB: contactB.id, groupA: groupA.id, fieldA: fieldA.id });

    for (let index = 0; index < 3; index += 1) {
      await prisma.dateType.create({
        data: {
          workspaceId: workspaceA.id,
          scopeKey: workspaceA.id,
          name: `Existing Type ${index} ${suffix}`,
          slug: `existing-type-${index}-${suffix}`,
          isSystem: false,
          isActive: true
        }
      });
    }
  });

  afterAll(async () => {
    if (ids.workspaceA && ids.workspaceB) {
      await prisma.workspace.deleteMany({ where: { id: { in: [ids.workspaceA, ids.workspaceB] } } });
    }
    if (ids.userA && ids.userB) {
      await prisma.user.deleteMany({ where: { id: { in: [ids.userA, ids.userB] } } });
    }
  });

  it("matches exact email only inside the active workspace", async () => {
    const row = record({ rowId: "row-match", emails: [{ value: "SHARED@example.com", label: null, isPrimary: true }] });
    const result = await findImportMatches(ids.workspaceA, "FREE", [row]);
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0]).toMatchObject({ kind: "EXACT", recommendedAction: "MERGE" });
    expect(result.matches[0].candidates.map((candidate) => candidate.contactId)).toEqual([ids.contactA]);
  });

  it("creates structured data and an active custom date type, then retries idempotently", async () => {
    const row = record({
      rowId: "row-create",
      firstName: "Avery",
      lastName: "Stone",
      displayName: "Avery Stone",
      company: "Stone Advisory",
      publicNotes: "Imported from conference list",
      emails: [{ value: "avery@example.com", label: "Work", isPrimary: true }],
      phones: [{ value: "+1 (626) 555-0100", label: "Mobile", isPrimary: true }],
      addresses: [{ label: "Office", street1: "100 Main St", street2: null, city: "Pasadena", state: "CA", postalCode: "91101", country: "US", isPrimary: true }],
      groupIds: [ids.groupA],
      customFields: [{ definitionId: ids.fieldA, value: "P-193" }],
      jumpDates: [{ dateTypeId: null, dateTypeName: `Policy Renewal ${suffix}`, label: "Policy Renewal", dateValue: "2026-08-20", month: 8, day: 20, recurrence: "NONE" }]
    });
    const importId = `import-create-${suffix}`;
    const first = await commitContactImportBatch({
      workspaceId: ids.workspaceA,
      actorUserId: ids.userA,
      planTier: "FREE",
      timezone: "America/Los_Angeles",
      importId,
      items: [{ record: row, resolution: resolution(row.rowId, "CREATE") }]
    });
    expect(first[0]).toMatchObject({ status: "CREATED" });
    const contactId = first[0].contactId!;

    const saved = await prisma.contact.findUnique({
      where: { id: contactId },
      include: { emails: true, phones: true, addresses: true, groupMemberships: true, customFieldValues: true, jumpDates: { include: { dateType: true } } }
    });
    expect(saved).toMatchObject({ displayName: "Avery Stone", publicNotes: "Imported from conference list" });
    expect(saved?.emails).toHaveLength(1);
    expect(saved?.phones[0]).toMatchObject({ normalized: "+16265550100", isPrimary: true });
    expect(saved?.groupMemberships.map((item) => item.groupId)).toContain(ids.groupA);
    expect(saved?.customFieldValues).toEqual(expect.arrayContaining([expect.objectContaining({ definitionId: ids.fieldA, value: "P-193" })]));
    expect(saved?.jumpDates[0]?.dateType.isActive).toBe(true);
    expect(first[0].message).toBe("Contact created.");

    const second = await commitContactImportBatch({
      workspaceId: ids.workspaceA,
      actorUserId: ids.userA,
      planTier: "FREE",
      timezone: "America/Los_Angeles",
      importId,
      items: [{ record: row, resolution: resolution(row.rowId, "CREATE") }]
    });
    expect(second).toEqual(first);
    expect(await prisma.contact.count({ where: { workspaceId: ids.workspaceA, emails: { some: { normalized: "avery@example.com" } } } })).toBe(1);
    const jobs = await prisma.job.findMany({ where: { workspaceId: ids.workspaceA, task: "generate-jumps" }, select: { payload: true } });
    expect(jobs.filter((job) => (job.payload as { contactId?: string }).contactId === contactId)).toHaveLength(1);
  });

  it("merges values without destroying existing values or the existing primary method", async () => {
    const row = record({
      rowId: "row-merge",
      displayName: "Jordan Lee",
      publicNotes: "New import context",
      emails: [
        { value: "shared@example.com", label: "Work", isPrimary: true },
        { value: "jordan.personal@example.com", label: "Personal", isPrimary: false }
      ],
      phones: [{ value: "+1 626 555 0199", label: "Mobile", isPrimary: true }],
      groupIds: [ids.groupA]
    });
    const results = await commitContactImportBatch({
      workspaceId: ids.workspaceA,
      actorUserId: ids.userA,
      planTier: "FREE",
      timezone: "America/Los_Angeles",
      importId: `import-merge-${suffix}`,
      items: [{ record: row, resolution: resolution(row.rowId, "MERGE", ids.contactA) }]
    });
    expect(results[0]).toMatchObject({ status: "MERGED", contactId: ids.contactA });

    const saved = await prisma.contact.findUnique({ where: { id: ids.contactA }, include: { emails: true, phones: true, groupMemberships: true } });
    expect(saved?.publicNotes).toContain("Original note");
    expect(saved?.publicNotes).toContain("New import context");
    expect(saved?.emails.map((item) => item.normalized).sort()).toEqual(["jordan.personal@example.com", "shared@example.com"]);
    expect(saved?.emails.find((item) => item.normalized === "shared@example.com")?.isPrimary).toBe(true);
    expect(saved?.phones.map((item) => item.normalized)).toContain("+16265550199");
    expect(saved?.groupMemberships.map((item) => item.groupId)).toContain(ids.groupA);
  });

  it("rejects a cross-workspace merge target without changing it", async () => {
    const row = record({ rowId: "row-cross", emails: [{ value: "new-value@example.com", label: null, isPrimary: true }] });
    const results = await commitContactImportBatch({
      workspaceId: ids.workspaceA,
      actorUserId: ids.userA,
      planTier: "FREE",
      timezone: "America/Los_Angeles",
      importId: `import-cross-${suffix}`,
      items: [{ record: row, resolution: resolution(row.rowId, "MERGE", ids.contactB) }]
    });
    expect(results[0].status).toBe("FAILED");
    expect(results[0].message).toContain("no longer available");
    expect(await prisma.contactEmail.count({ where: { contactId: ids.contactB } })).toBe(1);
  });
});
