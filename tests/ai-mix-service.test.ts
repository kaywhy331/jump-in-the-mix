import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { generateAiMix, parseAiMixPreflight } from "../src/lib/ai-mix";
import { createAiMixDraftRecord, publishAiMixDraft } from "../src/lib/ai-mix-service";
import { prisma } from "../src/lib/prisma";

describe.sequential("AI Mix draft service", () => {
  const suffix = randomUUID().replaceAll("-", "");
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    const [userA, userB] = await Promise.all([
      prisma.user.create({ data: { email: `ai-mix-a-${suffix}@example.com`, name: "AI Mix A", passwordHash: "test-only" } }),
      prisma.user.create({ data: { email: `ai-mix-b-${suffix}@example.com`, name: "AI Mix B", passwordHash: "test-only" } })
    ]);
    ids.userA = userA.id;
    ids.userB = userB.id;
    const [workspaceA, workspaceB] = await Promise.all([
      prisma.workspace.create({
        data: {
          name: "AI Mix Workspace A",
          slug: `ai-mix-a-${suffix}`,
          ownerId: userA.id,
          planTier: "PLUS",
          members: { create: { userId: userA.id, role: "OWNER" } },
          profile: { create: { timezone: "America/Los_Angeles", industry: "Coaching / Consulting", product1: "Business Growth Consulting" } }
        }
      }),
      prisma.workspace.create({
        data: {
          name: "AI Mix Workspace B",
          slug: `ai-mix-b-${suffix}`,
          ownerId: userB.id,
          planTier: "PLUS",
          members: { create: { userId: userB.id, role: "OWNER" } },
          profile: { create: { timezone: "America/New_York" } }
        }
      })
    ]);
    ids.workspaceA = workspaceA.id;
    ids.workspaceB = workspaceB.id;
    const group = await prisma.group.create({ data: { workspaceId: workspaceA.id, name: `Leads ${suffix}` } });
    ids.group = group.id;
  });

  afterAll(async () => {
    if (ids.workspaceA && ids.workspaceB) await prisma.workspace.deleteMany({ where: { id: { in: [ids.workspaceA, ids.workspaceB] } } });
    if (ids.userA && ids.userB) await prisma.user.deleteMany({ where: { id: { in: [ids.userA, ids.userB] } } });
  });

  it("keeps review drafts tenant-scoped and publishes an ordinary editable Mix atomically", async () => {
    const preflight = parseAiMixPreflight({
      objective: "Book Discovery Calls",
      tone: "Warm",
      framework: "Question-Led Consultative",
      triggerMode: "MANUAL_START",
      dateTypeId: null,
      dateTypeName: null,
      groupIds: [ids.group],
      groupNames: [`Leads ${suffix}`],
      assignAllContacts: false,
      broadcastDate: null,
      broadcastTime: null,
      broadcastTimezone: "America/Los_Angeles",
      durationDays: 14,
      touches: 5,
      cadence: "BALANCED",
      channels: ["EMAIL", "SMS", "PHONE_CALL"],
      productPlaceholder: "{{My Product 1}}",
      productContext: "Business Growth Consulting",
      industryContext: "Coaching / Consulting",
      customContext: null,
      preferredSendTimeMinutes: 600,
      includeOptOut: false,
      quietHoursStart: 1200,
      quietHoursEnd: 480
    });
    const generation = await generateAiMix(preflight);
    const draftId = await createAiMixDraftRecord({
      workspaceId: ids.workspaceA,
      actorUserId: ids.userA,
      preflight,
      generatedMix: generation.draft,
      validation: generation.validation
    });

    await expect(publishAiMixDraft({
      workspaceId: ids.workspaceB,
      actorUserId: ids.userB,
      draftId,
      generatedMixValue: generation.draft,
      validationValue: generation.validation
    })).rejects.toThrow(/not found/i);

    const mixId = await publishAiMixDraft({
      workspaceId: ids.workspaceA,
      actorUserId: ids.userA,
      draftId,
      generatedMixValue: generation.draft,
      validationValue: generation.validation
    });

    const [mix, draft, auditCount, jobCount] = await Promise.all([
      prisma.mix.findUniqueOrThrow({
        where: { id: mixId },
        include: {
          steps: { include: { stepVersion: { include: { stepTemplate: true } } }, orderBy: { sortOrder: "asc" } },
          assignments: true
        }
      }),
      prisma.aiMixDraft.findUniqueOrThrow({ where: { id: draftId } }),
      prisma.auditLog.count({ where: { workspaceId: ids.workspaceA, action: "mix.create.ai-wizard", entityId: mixId } }),
      prisma.job.count({ where: { workspaceId: ids.workspaceA, task: "generate-jumps", payload: { equals: { mixId } } } })
    ]);

    expect(mix).toMatchObject({ workspaceId: ids.workspaceA, status: "DRAFT", source: "AI_WIZARD", triggerMode: "MANUAL_START" });
    expect(mix.steps).toHaveLength(generation.draft.steps.length);
    expect(mix.steps[0].stepVersion.stepTemplate.workspaceId).toBe(ids.workspaceA);
    expect(mix.assignments).toEqual(expect.arrayContaining([expect.objectContaining({ groupId: ids.group, mode: "DYNAMIC", isActive: true })]));
    expect(draft.status).toBe("PUBLISHED");
    expect(auditCount).toBe(1);
    expect(jobCount).toBe(1);

    await expect(publishAiMixDraft({
      workspaceId: ids.workspaceA,
      actorUserId: ids.userA,
      draftId,
      generatedMixValue: generation.draft,
      validationValue: generation.validation
    })).rejects.toThrow(/no longer editable/i);
  });
});
