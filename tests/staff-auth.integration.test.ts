import { createHash, randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../src/lib/prisma";
const context = vi.hoisted(() => ({ token: "" }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (key: string) => key === "jitm_session" ? { value: context.token } : undefined }) }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`REDIRECT ${path}`); } }));
vi.mock("@/lib/env", async original => {
  const mod = await original<typeof import("../src/lib/env")>();
  return { ...mod, env: { ...mod.env, cookieName: "jitm_session", requireAdminMfa: true } };
});
import { getCurrentSession, requirePlatformAdmin } from "../src/lib/auth";
const local = /^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? "");
const users: string[] = [];
describe.skipIf(!local)("staff request authorization with real memberships and MFA records", () => {
  afterEach(async () => {
    await prisma.adminMfaSession.deleteMany({ where: { userId: { in: users } } });
    await prisma.adminMfaCredential.deleteMany({ where: { userId: { in: users } } });
    await prisma.platformAuditEvent.deleteMany({ where: { actorUserId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } }); users.length = 0;
  });
  it("requires enrollment and session MFA, then rechecks permissions on every request", async () => {
    const id = `staff-auth-${randomUUID()}`; users.push(id); context.token = randomUUID();
    await prisma.user.create({ data: { id, email: `${id}@example.test`, name: "Growth staff", emailVerifiedAt: new Date(), staffMembership: { create: { role: "GROWTH" } } } });
    const session = await prisma.session.create({ data: { userId: id, tokenHash: createHash("sha256").update(context.token).digest("hex"), expiresAt: new Date(Date.now() + 3600_000) } });
    await expect(requirePlatformAdmin("waitlist.manage")).rejects.toThrow("setup=1");
    await prisma.adminMfaCredential.create({ data: { userId: id, secretCiphertext: "test-record", enabledAt: new Date() } });
    await expect(requirePlatformAdmin("waitlist.manage")).rejects.toThrow("verify=1");
    await prisma.adminMfaSession.create({ data: { userId: id, sessionId: session.id, expiresAt: new Date(Date.now() + 3600_000) } });
    await expect(requirePlatformAdmin("waitlist.manage")).resolves.toMatchObject({ user: { id } });
    await expect(requirePlatformAdmin("staff.manage")).rejects.toThrow("access-denied");
    await prisma.staffMembership.update({ where: { userId: id }, data: { denies: ["waitlist.manage"] } });
    await expect(requirePlatformAdmin("waitlist.manage")).rejects.toThrow("access-denied");
    expect(await prisma.platformAuditEvent.count({ where: { actorUserId: id, outcome: "DENIED" } })).toBe(2);
    await prisma.staffMembership.update({ where: { userId: id }, data: { status: "DISABLED" } });
    await expect(requirePlatformAdmin()).rejects.toThrow("/jumps");
  });
  it("treats a user removed during session resolution as signed out", async () => {
    const id = `staff-auth-${randomUUID()}`; users.push(id); context.token = randomUUID();
    await prisma.user.create({ data: { id, email: `${id}@example.test`, name: "Removed during request" } });
    const session = await prisma.session.create({ data: { userId: id, tokenHash: createHash("sha256").update(context.token).digest("hex"), expiresAt: new Date(Date.now() + 3600_000) } });
    // Prisma resolves relations in a separate read; the user can disappear between reads.
    const lookup = vi.spyOn(prisma.session, "findUnique").mockResolvedValueOnce({ ...session, user: null } as never);
    try { expect(await getCurrentSession()).toBeNull(); } finally { lookup.mockRestore(); }
    expect(await prisma.session.findUnique({ where: { id: session.id } })).toBeNull();
  });
});
