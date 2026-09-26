import { randomBytes, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { afterAll, describe, expect, it, vi } from "vitest";
import { prisma } from "../src/lib/prisma";

vi.mock("@/lib/env", async importOriginal => {
  const original = await importOriginal<typeof import("../src/lib/env")>();
  return { ...original, env: { ...original.env, pilotMode: false, requireEmailVerification: true } };
});
import { AUTH_TOKEN_PURPOSES, hashAuthToken } from "../src/lib/auth-tokens";
import { claimMagicLink } from "../src/lib/magic-link";

const local = /^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? "");
const emails: string[] = [];
const address = (label: string) => { const email = `${label}-${randomUUID()}@example.test`; emails.push(email); return email; };
const hour = () => new Date(Date.now() + 3600_000);

async function link(email: string): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await prisma.verificationToken.create({ data: { email, purpose: AUTH_TOKEN_PURPOSES.magicLogin, tokenHash: hashAuthToken(token), expiresAt: hour() } });
  return token;
}

describe.skipIf(!local)("an emailed sign-in link and an unverified password account, with PostgreSQL", () => {
  afterAll(async () => {
    const users = await prisma.user.findMany({ where: { email: { in: emails } }, select: { id: true } });
    await prisma.workspace.deleteMany({ where: { ownerId: { in: users.map(user => user.id) } } });
    await prisma.user.deleteMany({ where: { id: { in: users.map(user => user.id) } } });
    await prisma.verificationToken.deleteMany({ where: { email: { in: emails } } });
  });

  it("takes the account away from whoever registered the address before its owner opened a link", async () => {
    const email = address("squatted");
    const squatter = await prisma.user.create({ data: { email, name: "Someone else", passwordHash: await bcrypt.hash("the squatter's password", 4) } });
    await prisma.session.create({ data: { userId: squatter.id, tokenHash: randomUUID(), expiresAt: hour() } });
    for (const purpose of [AUTH_TOKEN_PURPOSES.verifyEmail, AUTH_TOKEN_PURPOSES.resetPassword, AUTH_TOKEN_PURPOSES.magicLogin]) {
      await prisma.verificationToken.create({ data: { email, purpose, tokenHash: hashAuthToken(randomUUID()), expiresAt: hour() } });
    }
    const result = await claimMagicLink(await link(email), null);
    const owner = await prisma.user.findUniqueOrThrow({ where: { id: squatter.id } });
    expect(result.userId).toBe(squatter.id);
    expect(owner.passwordHash).toBeNull();
    expect(owner.emailVerifiedAt).not.toBeNull();
    expect(await prisma.session.count({ where: { userId: squatter.id } })).toBe(0);
    expect(await prisma.verificationToken.count({ where: { email, usedAt: null } })).toBe(0);
  });

  it("signs a verified account in without touching its password or sessions", async () => {
    const email = address("verified");
    const passwordHash = await bcrypt.hash("the owner's password", 4);
    const owner = await prisma.user.create({ data: { email, name: "Owner", passwordHash, emailVerifiedAt: new Date() } });
    await prisma.session.create({ data: { userId: owner.id, tokenHash: randomUUID(), expiresAt: hour() } });
    expect((await claimMagicLink(await link(email), null)).userId).toBe(owner.id);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: owner.id } })).passwordHash).toBe(passwordHash);
    expect(await prisma.session.count({ where: { userId: owner.id } })).toBe(1);
  });
});
