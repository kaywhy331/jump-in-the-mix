import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../src/lib/prisma";
import {
  importSharedMixIntoWorkspace,
  snapshotWorkspaceMix
} from "../src/lib/shared-mix-service";

import { saveLibraryDraft, releaseLibraryVersion } from "../src/lib/library-admin";

describe.sequential("ready-made plan service", () => {
  const suffix = randomUUID().replaceAll("-", "");
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    const [curator, customer] = await Promise.all([
      prisma.user.create({ data: { email: `plan-curator-${suffix}@example.com`, name: "Plan Curator", passwordHash: await bcrypt.hash("Library fixture password!", 4), emailVerifiedAt: new Date(), staffMembership: { create: { role: "EDITOR", grants: ["mixes.publish"] } } } }),
      prisma.user.create({ data: { email: `plan-customer-${suffix}@example.com`, name: "Plan Customer", passwordHash: "test-only" } })
    ]);
    Object.assign(ids, { curator: curator.id, customer: customer.id });
    const session = await prisma.session.create({ data: { userId: curator.id, tokenHash: randomUUID(), expiresAt: new Date(Date.now() + 3600_000) } });
    ids.session = session.id;
    await prisma.adminMfaSession.create({ data: { userId: curator.id, sessionId: session.id, expiresAt: session.expiresAt } });

    const [sourceWorkspace, customerWorkspace] = await Promise.all([
      prisma.workspace.create({ data: { name: "Curator Business", slug: `plan-curator-${suffix}`, ownerId: curator.id, profile: { create: {} } } }),
      prisma.workspace.create({ data: { name: "Customer Business", slug: `plan-customer-${suffix}`, ownerId: customer.id, profile: { create: {} } } })
    ]);
    Object.assign(ids, { sourceWorkspace: sourceWorkspace.id, customerWorkspace: customerWorkspace.id });

    const dateType = await prisma.dateType.create({
      data: {
        workspaceId: sourceWorkspace.id,
        scopeKey: sourceWorkspace.id,
        name: `Policy Review ${suffix}`,
        slug: `policy-review-${suffix}`,
        isSystem: false,
        isActive: true
      }
    });
    const plan = await prisma.mix.create({
      data: {
        workspaceId: sourceWorkspace.id,
        name: "Policy Review",
        description: "A warm reminder before an annual policy review.",
        category: "Current clients",
        industry: "Insurance & finance",
        triggerMode: "DATE_TRIGGERED",
        dateTypeId: dateType.id,
        status: "DRAFT",
        durationDays: 7
      }
    });
    ids.plan = plan.id;
    const message = await prisma.stepTemplate.create({
      data: {
        workspaceId: sourceWorkspace.id,
        name: "Review reminder",
        channel: "EMAIL",
        versions: { create: { version: 1, subject: "Your annual review", body: "Hi {{First Name}}, are there any changes we should cover?\n\n{{Email Signature}}" } }
      },
      include: { versions: true }
    });
    await prisma.mixStep.create({
      data: { mixId: plan.id, stepVersionId: message.versions[0]!.id, dayOffset: -7, sortOrder: 1 }
    });
  }, 30_000);

  afterAll(async () => {
    if (ids.sharedMix) {
      const imports = await prisma.sharedMixImport.findMany({ where: { sharedMixId: ids.sharedMix }, select: { id: true } });
      if (imports.length) await prisma.sharedMixImportMetadata.deleteMany({ where: { importId: { in: imports.map((item) => item.id) } } });
      await prisma.sharedMixMetadata.deleteMany({ where: { sharedMixId: ids.sharedMix } });
      await prisma.sharedMix.deleteMany({ where: { id: ids.sharedMix } });
    }
    await prisma.workspace.deleteMany({ where: { id: { in: [ids.sourceWorkspace, ids.customerWorkspace].filter(Boolean) } } });
    await prisma.adminMfaSession.deleteMany({ where: { userId: ids.curator } });
    await prisma.platformAuditEvent.deleteMany({ where: { actorUserId: ids.curator } });
    await prisma.user.deleteMany({ where: { id: { in: [ids.curator, ids.customer].filter(Boolean) } } });
  });

  it("snapshots only plan content", async () => {
    const snapshot = await snapshotWorkspaceMix(ids.sourceWorkspace, ids.plan);
    expect(snapshot).toMatchObject({
      name: "Policy Review",
      triggerMode: "DATE_TRIGGERED",
      industry: "Insurance & finance",
      steps: [expect.objectContaining({ channel: "EMAIL", dayOffset: -7 })]
    });
    expect(JSON.stringify(snapshot)).not.toContain(ids.sourceWorkspace);
    await expect(snapshotWorkspaceMix(ids.customerWorkspace, ids.plan)).rejects.toThrow("Mix not found");
  });

  it("creates a draft and separately publishes reviewed versions", async () => {
    const snapshot = await snapshotWorkspaceMix(ids.sourceWorkspace, ids.plan);
    const actor = { actorUserId: ids.curator, actorSessionId: ids.session, reason: "Review the annual policy reminder" };
    const content = { title: "Annual Policy Review", description: "A warm reminder before an annual policy review meeting.", category: "Current clients", industry: "Insurance & finance", framework: null,
      triggerMode: snapshot.triggerMode, dateTypeName: snapshot.dateTypeName, dateTypeSlug: snapshot.dateTypeSlug, steps: snapshot.steps, featured: false };
    const draft = await saveLibraryDraft({ ...actor, expectedRevision: 0, content }); ids.sharedMix = draft.id;
    expect((await prisma.sharedMix.findUniqueOrThrow({ where: { id: draft.id } })).status).toBe("UNPUBLISHED");
    await releaseLibraryVersion({ ...actor, sharedMixId: draft.id, expectedRevision: 1, version: 1, operation: "publish", password: "Library fixture password!" });
    expect(await prisma.sharedMixMetadata.findUnique({ where: { sharedMixId: draft.id } })).toMatchObject({ version: 1, triggerMode: "DATE_TRIGGERED" });
    await saveLibraryDraft({ ...actor, sharedMixId: draft.id, expectedRevision: 2, content: { ...content, featured: true } });
    expect(await prisma.sharedMixMetadata.findUnique({ where: { sharedMixId: draft.id } })).toMatchObject({ version: 1, draftVersion: 2, featuredAt: null });
    await releaseLibraryVersion({ ...actor, sharedMixId: draft.id, expectedRevision: 3, version: 2, operation: "publish", password: "Library fixture password!" });
    expect(await prisma.sharedMixMetadata.findUnique({ where: { sharedMixId: draft.id } })).toMatchObject({ version: 2, featuredAt: expect.any(Date) });
  });

  it("imports an independent draft and records repeated use", async () => {
    const first = await importSharedMixIntoWorkspace({
      workspaceId: ids.customerWorkspace,
      actorUserId: ids.customer,
      sharedMixId: ids.sharedMix
    });
    const imported = await prisma.mix.findUnique({
      where: { id: first.mixId },
      include: { steps: { include: { stepVersion: { include: { stepTemplate: true } } } }, dateType: true }
    });
    expect(imported).toMatchObject({
      workspaceId: ids.customerWorkspace,
      status: "DRAFT",
      industry: "Insurance & finance",
      triggerMode: "DATE_TRIGGERED"
    });
    expect(imported?.dateType).toMatchObject({ workspaceId: ids.customerWorkspace, isSystem: false });
    expect(imported?.steps[0]?.stepVersion.stepTemplate.channel).toBe("EMAIL");

    const second = await importSharedMixIntoWorkspace({
      workspaceId: ids.customerWorkspace,
      actorUserId: ids.customer,
      sharedMixId: ids.sharedMix
    });
    expect(second.importNumber).toBe(2);
    expect(second.mixId).not.toBe(first.mixId);
    expect((await prisma.sharedMix.findUniqueOrThrow({ where: { id: ids.sharedMix } })).importCount).toBe(2);
  });
});
