import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createAdminImpersonationGrant,
  endAdminImpersonationGrant,
  hashImpersonationToken,
  resolveAdminImpersonationGrant
} from "../src/lib/impersonation";
import { prisma } from "../src/lib/prisma";

describe.sequential("administrator view-only impersonation", () => {
  const suffix = randomUUID().replaceAll("-", "");
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    const [admin, target, regular] = await Promise.all([
      prisma.user.create({ data: { email: `admin-${suffix}@example.com`, name: "Support Admin", passwordHash: "test-only", isPlatformAdmin: true } }),
      prisma.user.create({ data: { email: `target-${suffix}@example.com`, name: "Target User", passwordHash: "test-only" } }),
      prisma.user.create({ data: { email: `regular-${suffix}@example.com`, name: "Regular User", passwordHash: "test-only" } })
    ]);
    ids.admin = admin.id;
    ids.target = target.id;
    ids.regular = regular.id;

    const workspace = await prisma.workspace.create({
      data: {
        name: "Target Workspace",
        slug: `impersonation-${suffix}`,
        ownerId: target.id,
        members: { create: { userId: target.id, role: "OWNER" } },
        profile: { create: {} }
      }
    });
    ids.workspace = workspace.id;
  });

  afterAll(async () => {
    await prisma.adminImpersonation.deleteMany({ where: { actorUserId: { in: [ids.admin, ids.regular] } } });
    if (ids.workspace) await prisma.workspace.deleteMany({ where: { id: ids.workspace } });
    await prisma.user.deleteMany({ where: { id: { in: [ids.admin, ids.target, ids.regular].filter(Boolean) } } });
  });

  it("stores only a token hash and resolves the target workspace for the actor", async () => {
    const { rawToken, grant } = await createAdminImpersonationGrant({
      actorUserId: ids.admin,
      targetUserId: ids.target,
      workspaceId: ids.workspace,
      reason: "Investigating support ticket 1842"
    });

    expect(grant.tokenHash).toBe(hashImpersonationToken(rawToken));
    expect(grant.tokenHash).not.toContain(rawToken);
    expect(grant.expiresAt.getTime()).toBeGreaterThan(Date.now());

    const resolved = await resolveAdminImpersonationGrant(rawToken, ids.admin);
    expect(resolved?.targetUser.id).toBe(ids.target);
    expect(resolved?.targetUser.memberships[0]?.workspace.id).toBe(ids.workspace);
    expect(resolved?.reason).toContain("ticket 1842");
    expect(await resolveAdminImpersonationGrant(rawToken, ids.regular)).toBeNull();

    const audit = await prisma.auditLog.findFirst({
      where: { workspaceId: ids.workspace, action: "admin.impersonation.start", entityId: ids.target }
    });
    expect(audit?.actorUserId).toBe(ids.admin);
    expect(audit?.metadata).toMatchObject({ mode: "VIEW_ONLY" });

    expect(await endAdminImpersonationGrant(rawToken, ids.admin)).toBe(true);
    expect(await resolveAdminImpersonationGrant(rawToken, ids.admin)).toBeNull();
    expect(await prisma.auditLog.findFirst({ where: { workspaceId: ids.workspace, action: "admin.impersonation.end" } })).not.toBeNull();
  });

  it("rejects non-admin actors and unrelated workspace targets", async () => {
    await expect(createAdminImpersonationGrant({
      actorUserId: ids.regular,
      targetUserId: ids.target,
      workspaceId: ids.workspace,
      reason: "Trying to access another account"
    })).rejects.toThrow(/administrator/i);

    await expect(createAdminImpersonationGrant({
      actorUserId: ids.admin,
      targetUserId: ids.regular,
      workspaceId: ids.workspace,
      reason: "Investigating an account membership issue"
    })).rejects.toThrow(/does not belong/i);
  });

  it("invalidates expired support sessions", async () => {
    const { rawToken, grant } = await createAdminImpersonationGrant({
      actorUserId: ids.admin,
      targetUserId: ids.target,
      workspaceId: ids.workspace,
      reason: "Checking an expired support session"
    });
    await prisma.adminImpersonation.update({ where: { id: grant.id }, data: { expiresAt: new Date(Date.now() - 1_000) } });
    expect(await resolveAdminImpersonationGrant(rawToken, ids.admin)).toBeNull();
  });
});
