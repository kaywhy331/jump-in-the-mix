import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../src/lib/prisma";
import {
  importSharedMixIntoWorkspace,
  publishWorkspaceMix,
  snapshotWorkspaceMix,
  toggleSharedMixVote,
  updateSharedMixAsAdmin
} from "../src/lib/shared-mix-service";

describe.sequential("Mix Template service", () => {
  const suffix = randomUUID().replaceAll("-", "");
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    const [publisherUser, importerUser, freeUser] = await Promise.all([
      prisma.user.create({ data: { email: `template-publisher-${suffix}@example.com`, name: "Template Publisher", passwordHash: "test-only" } }),
      prisma.user.create({ data: { email: `template-importer-${suffix}@example.com`, name: "Template Importer", passwordHash: "test-only" } }),
      prisma.user.create({ data: { email: `template-free-${suffix}@example.com`, name: "Template Free", passwordHash: "test-only" } })
    ]);
    Object.assign(ids, { publisherUser: publisherUser.id, importerUser: importerUser.id, freeUser: freeUser.id });

    const [publisherWorkspace, importerWorkspace, freeWorkspace] = await Promise.all([
      prisma.workspace.create({ data: { name: "Publisher Workspace", slug: `template-publisher-${suffix}`, ownerId: publisherUser.id, planTier: "PLUS", profile: { create: {} } } }),
      prisma.workspace.create({ data: { name: "Importer Workspace", slug: `template-importer-${suffix}`, ownerId: importerUser.id, planTier: "PLUS", profile: { create: {} } } }),
      prisma.workspace.create({ data: { name: "Free Workspace", slug: `template-free-${suffix}`, ownerId: freeUser.id, planTier: "FREE", profile: { create: {} } } })
    ]);
    Object.assign(ids, { publisherWorkspace: publisherWorkspace.id, importerWorkspace: importerWorkspace.id, freeWorkspace: freeWorkspace.id });

    await prisma.sharedMixContributorProfile.create({
      data: {
        workspaceId: publisherWorkspace.id,
        enabled: true,
        displayName: "Thoughtful Growth Studio",
        title: "Client Success Advisor",
        bio: "Builds respectful follow-through systems."
      }
    });

    const dateType = await prisma.dateType.create({
      data: {
        workspaceId: publisherWorkspace.id,
        scopeKey: publisherWorkspace.id,
        name: `Policy Review ${suffix}`,
        slug: `policy-review-${suffix}`,
        isSystem: false,
        isActive: true
      }
    });
    ids.dateType = dateType.id;

    const mix = await prisma.mix.create({
      data: {
        workspaceId: publisherWorkspace.id,
        name: "Policy Review Conversation",
        description: "A respectful sequence that prepares a client for a useful review conversation.",
        category: "Client Success / Retention",
        industry: "Insurance",
        framework: "Question-Led Consultative",
        triggerMode: "DATE_TRIGGERED",
        dateTypeId: dateType.id,
        status: "DRAFT",
        durationDays: 7
      }
    });
    ids.mix = mix.id;

    const emailTemplate = await prisma.stepTemplate.create({
      data: {
        workspaceId: publisherWorkspace.id,
        name: "Review preparation email",
        channel: "EMAIL",
        versions: {
          create: {
            version: 1,
            subject: "Before our review, {{First Name}}",
            body: "Hi {{First Name}}, what has changed since we last reviewed your priorities?\n\n{{Email Signature}}"
          }
        }
      },
      include: { versions: true }
    });
    const callTemplate = await prisma.stepTemplate.create({
      data: {
        workspaceId: publisherWorkspace.id,
        name: "Review conversation",
        channel: "PHONE_CALL",
        versions: {
          create: {
            version: 1,
            script: "Review {{Private Notes}}, then ask what has changed and what should be protected next."
          }
        }
      },
      include: { versions: true }
    });
    await prisma.mixStep.createMany({
      data: [
        { mixId: mix.id, stepVersionId: emailTemplate.versions[0]!.id, dayOffset: -7, sortOrder: 1 },
        { mixId: mix.id, stepVersionId: callTemplate.versions[0]!.id, dayOffset: 0, sortOrder: 2 }
      ]
    });
  });

  afterAll(async () => {
    const sharedMixIds = ids.sharedMix ? [ids.sharedMix] : [];
    if (sharedMixIds.length) {
      const importIds = await prisma.sharedMixImport.findMany({ where: { sharedMixId: { in: sharedMixIds } }, select: { id: true } });
      if (importIds.length) await prisma.sharedMixImportMetadata.deleteMany({ where: { importId: { in: importIds.map((item) => item.id) } } });
      await prisma.sharedMixVote.deleteMany({ where: { sharedMixId: { in: sharedMixIds } } });
      await prisma.sharedMixMetadata.deleteMany({ where: { sharedMixId: { in: sharedMixIds } } });
      await prisma.sharedMix.deleteMany({ where: { id: { in: sharedMixIds } } });
    }
    await prisma.sharedMixContributorProfile.deleteMany({ where: { workspaceId: { in: [ids.publisherWorkspace, ids.importerWorkspace, ids.freeWorkspace].filter(Boolean) } } });
    await prisma.workspace.deleteMany({ where: { id: { in: [ids.publisherWorkspace, ids.importerWorkspace, ids.freeWorkspace].filter(Boolean) } } });
    await prisma.user.deleteMany({ where: { id: { in: [ids.publisherUser, ids.importerUser, ids.freeUser].filter(Boolean) } } });
  });

  it("snapshots a workspace Mix without Contact or workspace data", async () => {
    const snapshot = await snapshotWorkspaceMix(ids.publisherWorkspace, ids.mix);
    expect(snapshot).toMatchObject({
      name: "Policy Review Conversation",
      triggerMode: "DATE_TRIGGERED",
      category: "Client Success / Retention",
      industry: "Insurance",
      steps: [
        expect.objectContaining({ channel: "EMAIL", dayOffset: -7 }),
        expect.objectContaining({ channel: "PHONE_CALL", dayOffset: 0 })
      ]
    });
    expect(JSON.stringify(snapshot)).not.toContain(ids.publisherWorkspace);
    await expect(snapshotWorkspaceMix(ids.importerWorkspace, ids.mix)).rejects.toThrow("Mix not found");
  });

  it("submits, moderates, and versions a Community Mix", async () => {
    const submitted = await publishWorkspaceMix({
      workspaceId: ids.publisherWorkspace,
      actorUserId: ids.publisherUser,
      mixId: ids.mix,
      metadata: {
        title: "Policy Review Conversation",
        description: "A respectful sequence that prepares a client for a useful policy review conversation.",
        category: "Client Success / Retention",
        industry: "Insurance",
        framework: "Question-Led Consultative"
      }
    });
    ids.sharedMix = submitted.sharedMixId;
    expect(submitted.reviewState).toBe("PENDING");

    const shared = await prisma.sharedMix.findUniqueOrThrow({ where: { id: submitted.sharedMixId } });
    const metadata = await prisma.sharedMixMetadata.findUniqueOrThrow({ where: { sharedMixId: submitted.sharedMixId } });
    expect(shared.status).toBe("PENDING");
    expect(metadata).toMatchObject({ publisherMixId: ids.mix, reviewState: "PENDING", version: 1, triggerMode: "DATE_TRIGGERED" });

    await updateSharedMixAsAdmin({
      actorUserId: ids.publisherUser,
      auditWorkspaceId: ids.publisherWorkspace,
      sharedMixId: shared.id,
      metadata: {
        title: shared.title,
        description: shared.description,
        category: shared.category,
        industry: shared.industry!,
        framework: shared.framework
      },
      reviewState: "APPROVED",
      triggerMode: metadata.triggerMode,
      dateTypeName: metadata.dateTypeName,
      dateTypeSlug: metadata.dateTypeSlug,
      steps: JSON.parse(JSON.stringify(shared.steps)),
      moderationNote: null,
      featured: true
    });
    expect((await prisma.sharedMix.findUniqueOrThrow({ where: { id: shared.id } })).status).toBe("APPROVED");
    expect(await prisma.sharedMixMetadata.findUnique({ where: { sharedMixId: shared.id } })).toMatchObject({ reviewState: "APPROVED", version: 2 });
  });

  it("imports an independent Draft atomically and records repeated imports", async () => {
    const first = await importSharedMixIntoWorkspace({ workspaceId: ids.importerWorkspace, actorUserId: ids.importerUser, sharedMixId: ids.sharedMix });
    const imported = await prisma.mix.findUnique({
      where: { id: first.mixId },
      include: { steps: { include: { stepVersion: { include: { stepTemplate: true } } }, orderBy: { sortOrder: "asc" } }, dateType: true }
    });
    expect(imported).toMatchObject({
      workspaceId: ids.importerWorkspace,
      status: "DRAFT",
      category: "Client Success / Retention",
      industry: "Insurance",
      triggerMode: "DATE_TRIGGERED"
    });
    expect(imported?.dateType).toMatchObject({ name: expect.stringContaining("Policy Review"), workspaceId: ids.importerWorkspace, isSystem: false });
    expect(imported?.steps.map((item) => item.stepVersion.stepTemplate.channel)).toEqual(["EMAIL", "PHONE_CALL"]);
    expect(await prisma.sharedMixImport.count({ where: { workspaceId: ids.importerWorkspace, sharedMixId: ids.sharedMix } })).toBe(1);

    const second = await importSharedMixIntoWorkspace({ workspaceId: ids.importerWorkspace, actorUserId: ids.importerUser, sharedMixId: ids.sharedMix });
    expect(second.importNumber).toBe(2);
    expect(second.mixId).not.toBe(first.mixId);
    expect(await prisma.sharedMixImport.count({ where: { workspaceId: ids.importerWorkspace, sharedMixId: ids.sharedMix } })).toBe(2);
    expect((await prisma.sharedMix.findUniqueOrThrow({ where: { id: ids.sharedMix } })).importCount).toBe(2);
  });

  it("toggles one vote per workspace and blocks self-voting", async () => {
    const first = await toggleSharedMixVote({ workspaceId: ids.importerWorkspace, actorUserId: ids.importerUser, sharedMixId: ids.sharedMix });
    expect(first).toMatchObject({ voted: true, voteCount: 1 });
    const second = await toggleSharedMixVote({ workspaceId: ids.importerWorkspace, actorUserId: ids.importerUser, sharedMixId: ids.sharedMix });
    expect(second).toMatchObject({ voted: false, voteCount: 0 });
    await expect(toggleSharedMixVote({ workspaceId: ids.publisherWorkspace, actorUserId: ids.publisherUser, sharedMixId: ids.sharedMix })).rejects.toThrow("own Mix");
  });

  it("enforces the Free community-sharing limit without deleting a Mix", async () => {
    const freeMix = await prisma.mix.create({
      data: { workspaceId: ids.freeWorkspace, name: "Free Mix", triggerMode: "MANUAL_START", status: "DRAFT" }
    });
    const jump = await prisma.stepTemplate.create({
      data: {
        workspaceId: ids.freeWorkspace,
        name: "Free text",
        channel: "SMS",
        versions: { create: { version: 1, body: "Hi {{First Name}}" } }
      },
      include: { versions: true }
    });
    await prisma.mixStep.create({ data: { mixId: freeMix.id, stepVersionId: jump.versions[0]!.id, dayOffset: 0, sortOrder: 1 } });
    await prisma.sharedMixContributorProfile.create({ data: { workspaceId: ids.freeWorkspace, enabled: true, displayName: "Free Contributor" } });

    await expect(publishWorkspaceMix({
      workspaceId: ids.freeWorkspace,
      actorUserId: ids.freeUser,
      mixId: freeMix.id,
      metadata: {
        title: "Free Mix",
        description: "A valid Mix that remains private because the Free plan cannot publish it.",
        category: "General / Other",
        industry: "General / Other",
        framework: null
      }
    })).rejects.toThrow("allows 0 shared Mixes");
    expect(await prisma.mix.findUnique({ where: { id: freeMix.id } })).not.toBeNull();
  });
});
