import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../src/lib/prisma";
import { APPROVED_STAGING_TARGETS, SMOKE_ACCOUNT_NAME, SMOKE_WORKSPACE_NAME, StagingSmokeAccountError, assertApprovedStagingTarget, seedStagingSmokeAccount } from "../src/lib/staging-smoke-account";

const local = /^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? "");
const target = APPROVED_STAGING_TARGETS[0];
const password = "synthetic-smoke-password-".padEnd(32, "x");
const hash = async (value: string) => `hashed:${value}`;
const emails: string[] = [];
const seed = (email: string, overrides: Partial<Parameters<typeof seedStagingSmokeAccount>[1]> = {}) => seedStagingSmokeAccount(prisma, { target, email, password, hash, ...overrides });

describe("approved staging target", () => {
  it("accepts only the approved site, with or without a trailing slash, before touching anything", () => {
    expect(assertApprovedStagingTarget(`${target}/`)).toBe(target);
    for (const wrong of [undefined, "", "https://jumpinthemix.com", "https://jump-in-the-mix.netlify.app", "http://jump-in-the-mix-test.netlify.app", "https://jump-in-the-mix-test.netlify.app.example"]) {
      expect(() => assertApprovedStagingTarget(wrong)).toThrow(StagingSmokeAccountError);
    }
  });
});

describe.skipIf(!local)("staging smoke account seeding", () => {
  afterAll(async () => {
    const users = await prisma.user.findMany({ where: { email: { in: emails } }, select: { id: true } });
    await prisma.workspace.deleteMany({ where: { ownerId: { in: users.map((user) => user.id) } } });
    await prisma.user.deleteMany({ where: { id: { in: users.map((user) => user.id) } } });
  });
  const address = (label: string) => { const email = `${label}-${randomUUID().slice(0, 8)}@example.test`; emails.push(email); return email; };

  it("refuses a wrong target or weak credentials without any write", async () => {
    const email = address("guard");
    await expect(seed(email, { target: "https://jumpinthemix.com" })).rejects.toThrow(/approved staging site/);
    await expect(seed(email, { password: "short" })).rejects.toThrow(/24 to 72/);
    await expect(seed("not-an-address", {})).rejects.toThrow(/valid address/);
    expect(await prisma.user.count({ where: { email } })).toBe(0);
  });

  it("creates the synthetic account with its markers, then resets only that account", async () => {
    const email = address("fresh");
    const created = await seed(email);
    expect(created.outcome).toBe("created");
    const user = await prisma.user.findUniqueOrThrow({ where: { email }, include: { ownedWorkspaces: { include: { profile: true } } } });
    expect(user).toMatchObject({ name: SMOKE_ACCOUNT_NAME, passwordHash: `hashed:${password}`, isPlatformAdmin: false });
    expect(user.emailVerifiedAt).toBeInstanceOf(Date);
    expect(user.ownedWorkspaces).toHaveLength(1);
    expect(user.ownedWorkspaces[0]).toMatchObject({ name: SMOKE_WORKSPACE_NAME, profile: { onboardingDone: true } });
    await prisma.session.create({ data: { userId: user.id, tokenHash: randomUUID(), expiresAt: new Date(Date.now() + 3_600_000) } });
    const reset = await seed(email, { password: `${password}-rotated` });
    expect(reset).toMatchObject({ outcome: "reset", userId: user.id, workspaceId: user.ownedWorkspaces[0].id });
    expect((await prisma.user.findUniqueOrThrow({ where: { email } })).passwordHash).toBe(`hashed:${password}-rotated`);
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(0);
    expect(await prisma.workspace.count({ where: { ownerId: user.id } })).toBe(1);
  });

  it("refuses to reset an ordinary account at the same address and writes nothing", async () => {
    const email = address("ordinary");
    const person = await prisma.user.create({ data: { email, name: "A real customer", passwordHash: "their-own-hash", emailVerifiedAt: new Date() } });
    const workspace = await prisma.workspace.create({ data: { name: "Their business", slug: `their-business-${person.id.slice(-7)}`, ownerId: person.id, members: { create: { userId: person.id, role: "OWNER" } }, profile: { create: {} } } });
    await prisma.session.create({ data: { userId: person.id, tokenHash: randomUUID(), expiresAt: new Date(Date.now() + 3_600_000) } });
    await expect(seed(email)).rejects.toThrow(/already uses this address and the account's name is not the synthetic marker/);
    const after = await prisma.user.findUniqueOrThrow({ where: { id: person.id } });
    expect(after).toMatchObject({ passwordHash: "their-own-hash", name: "A real customer" });
    expect(after.updatedAt.toISOString()).toBe(person.updatedAt.toISOString());
    expect(await prisma.session.count({ where: { userId: person.id } })).toBe(1);
    expect(await prisma.workspace.count({ where: { ownerId: person.id } })).toBe(1);
    expect((await prisma.workspace.findUniqueOrThrow({ where: { id: workspace.id } })).name).toBe("Their business");
  });

  it("refuses an account that carries the markers but is not purely synthetic", async () => {
    const email = address("lookalike");
    const created = await seed(email);
    const workspaceId = created.workspaceId;
    // Operator access, or a shared workspace, or customer data: each disqualifies the reset.
    await prisma.user.update({ where: { id: created.userId }, data: { isPlatformAdmin: true } });
    await expect(seed(email)).rejects.toThrow(/operator access/);
    await prisma.user.update({ where: { id: created.userId }, data: { isPlatformAdmin: false } });
    const other = await prisma.user.create({ data: { email: address("member"), name: "Teammate", passwordHash: "x", emailVerifiedAt: new Date() } });
    await prisma.workspaceMember.create({ data: { workspaceId, userId: other.id, role: "OWNER" } });
    await expect(seed(email)).rejects.toThrow(/shares a workspace/);
    await prisma.workspaceMember.deleteMany({ where: { workspaceId, userId: other.id } });
    await prisma.contact.create({ data: { workspaceId, displayName: "Someone" } });
    await expect(seed(email)).rejects.toThrow(/holds contacts/);
    expect((await prisma.user.findUniqueOrThrow({ where: { email } })).passwordHash).toBe(`hashed:${password}`);
  });
});
