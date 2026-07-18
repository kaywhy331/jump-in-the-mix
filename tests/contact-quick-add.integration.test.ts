import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  QuickAddPlanLimitError,
  quickAddDeviceContacts
} from "../src/lib/contact-quick-add";
import { PLAN_LIMITS } from "../src/lib/plans";
import { prisma } from "../src/lib/prisma";

describe.sequential("Device Contact Quick Add", () => {
  const suffix = randomUUID().replaceAll("-", "");
  const userIds: string[] = [];
  const workspaceIds: string[] = [];
  let actorUserId = "";
  let workspaceA = "";
  let workspaceB = "";
  let exactContactId = "";

  beforeAll(async () => {
    const [userA, userB] = await Promise.all([
      prisma.user.create({ data: { email: `quick-add-a-${suffix}@example.com`, name: "Quick Add A", passwordHash: "test-only" } }),
      prisma.user.create({ data: { email: `quick-add-b-${suffix}@example.com`, name: "Quick Add B", passwordHash: "test-only" } })
    ]);
    userIds.push(userA.id, userB.id);
    actorUserId = userA.id;

    const [createdA, createdB] = await Promise.all([
      prisma.workspace.create({
        data: {
          name: "Quick Add A",
          slug: `quick-add-a-${suffix}`,
          ownerId: userA.id,
          profile: { create: { timezone: "America/Los_Angeles" } }
        }
      }),
      prisma.workspace.create({
        data: {
          name: "Quick Add B",
          slug: `quick-add-b-${suffix}`,
          ownerId: userB.id,
          profile: { create: { timezone: "America/New_York" } }
        }
      })
    ]);
    workspaceA = createdA.id;
    workspaceB = createdB.id;
    workspaceIds.push(workspaceA, workspaceB);

    const exact = await prisma.contact.create({
      data: {
        workspaceId: workspaceA,
        displayName: "Existing Exact",
        emails: { create: { email: "exact@example.com", normalized: "exact@example.com", isPrimary: true } }
      }
    });
    exactContactId = exact.id;

    await Promise.all([
      prisma.contact.create({
        data: {
          workspaceId: workspaceA,
          displayName: "Ambiguous One",
          emails: { create: { email: "ambiguous@example.com", normalized: "ambiguous@example.com", isPrimary: true } }
        }
      }),
      prisma.contact.create({
        data: {
          workspaceId: workspaceA,
          displayName: "Ambiguous Two",
          emails: { create: { email: "ambiguous@example.com", normalized: "ambiguous@example.com", isPrimary: true } }
        }
      }),
      prisma.contact.create({
        data: {
          workspaceId: workspaceB,
          displayName: "Other Workspace Only",
          emails: { create: { email: "other-workspace@example.com", normalized: "other-workspace@example.com", isPrimary: true } }
        }
      })
    ]);
  });

  afterAll(async () => {
    if (workspaceIds.length) await prisma.workspace.deleteMany({ where: { id: { in: workspaceIds } } });
    if (userIds.length) await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  it("creates new Contacts, merges one exact match, and holds ambiguous matches", async () => {
    const input = {
      workspaceId: workspaceA,
      actorUserId,
      planTier: "FREE" as const,
      timezone: "America/Los_Angeles",
      requestId: `request-${suffix.slice(0, 20)}`,
      contacts: [
        { names: ["Avery Stone"], emails: ["avery@example.com"], phones: ["+1 626 555 0100"], addresses: [] },
        { names: ["Existing Exact Updated"], emails: ["EXACT@example.com"], phones: ["+1 626 555 0199"], addresses: [] },
        { names: ["Ambiguous Device"], emails: ["ambiguous@example.com"], phones: [], addresses: [] },
        { names: ["Workspace Scoped"], emails: ["other-workspace@example.com"], phones: [], addresses: [] }
      ]
    };

    const result = await quickAddDeviceContacts(input);
    expect(result.summary).toEqual({ selected: 4, created: 2, merged: 1, reviewNeeded: 1, skipped: 1, failed: 0 });

    const [exact, avery, workspaceScoped, ambiguousCount, audit, jobs] = await Promise.all([
      prisma.contact.findUniqueOrThrow({ where: { id: exactContactId }, include: { emails: true, phones: true } }),
      prisma.contact.findFirstOrThrow({ where: { workspaceId: workspaceA, emails: { some: { normalized: "avery@example.com" } } } }),
      prisma.contact.findFirstOrThrow({ where: { workspaceId: workspaceA, emails: { some: { normalized: "other-workspace@example.com" } } } }),
      prisma.contact.count({ where: { workspaceId: workspaceA, emails: { some: { normalized: "ambiguous@example.com" } } } }),
      prisma.auditLog.findFirst({ where: { workspaceId: workspaceA, action: "contact.quick-add" }, orderBy: { createdAt: "desc" } }),
      prisma.job.findMany({ where: { workspaceId: workspaceA, task: "generate-jumps" } })
    ]);

    expect(exact.displayName).toBe("Existing Exact");
    expect(exact.phones.map((phone) => phone.normalized)).toContain("+16265550199");
    expect(avery.source).toBe("API");
    expect(workspaceScoped.source).toBe("API");
    expect(ambiguousCount).toBe(2);
    expect(audit?.source).toBe("contacts.device-picker");
    expect(jobs).toHaveLength(3);

    const repeated = await quickAddDeviceContacts(input);
    expect(repeated.summary).toEqual(result.summary);
    expect(await prisma.contact.count({ where: { workspaceId: workspaceA } })).toBe(5);
  });

  it("rejects an over-limit selection before writing any row", async () => {
    const user = await prisma.user.create({
      data: { email: `quick-add-limit-${suffix}@example.com`, name: "Quick Add Limit", passwordHash: "test-only" }
    });
    userIds.push(user.id);
    const workspace = await prisma.workspace.create({
      data: {
        name: "Quick Add Limit",
        slug: `quick-add-limit-${suffix}`,
        ownerId: user.id,
        profile: { create: { timezone: "America/Los_Angeles" } }
      }
    });
    workspaceIds.push(workspace.id);
    await prisma.contact.createMany({
      data: Array.from({ length: PLAN_LIMITS.FREE.contacts - 1 }, (_, index) => ({
        workspaceId: workspace.id,
        displayName: `Capacity Contact ${index + 1}`
      }))
    });

    await expect(quickAddDeviceContacts({
      workspaceId: workspace.id,
      actorUserId: user.id,
      planTier: "FREE",
      timezone: "America/Los_Angeles",
      requestId: `limit-${suffix.slice(0, 20)}`,
      contacts: [
        { names: ["Over Limit One"], emails: ["over-one@example.com"], phones: [], addresses: [] },
        { names: ["Over Limit Two"], emails: ["over-two@example.com"], phones: [], addresses: [] }
      ]
    })).rejects.toMatchObject({
      code: "CONTACT_LIMIT",
      remainingContacts: 1,
      requestedCreates: 2
    });
    expect(await prisma.contact.count({ where: { workspaceId: workspace.id } })).toBe(PLAN_LIMITS.FREE.contacts - 1);
  });
});
