import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../src/lib/prisma";

// A fresh documentation address per run keeps these limits apart from other suites.
const context = vi.hoisted(() => ({ cookies: new Map<string, string>(), ip: `2001:db8:${Math.floor(Math.random() * 0xffff).toString(16)}::${Math.floor(Math.random() * 0xffff).toString(16)}` }));
vi.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ get: (key: string) => context.cookies.has(key) ? { name: key, value: context.cookies.get(key) } : undefined, set: (key: string, value: string) => context.cookies.set(key, value), delete: (key: string) => context.cookies.delete(key) }) }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw Object.assign(new Error(path), { digest: "NEXT_REDIRECT" }); } }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/request-context", () => ({ getRequestMetadata: async () => ({ ipAddress: context.ip, userAgent: "Local sign-in limits test" }) }));
vi.mock("@/lib/worker-dispatch-after", () => ({ wakeWorkerAfterResponse: vi.fn() }));
vi.mock("@/lib/env", async original => {
  const mod = await original<typeof import("../src/lib/env")>();
  // A configured sender with provider HTTP stubbed below, and room in the allowance so other suites' mail cannot interfere.
  return { ...mod, env: { ...mod.env, cookieName: "jitm_session", pilotMode: false, requireEmailVerification: true, dataEncryptionKey: "auth-abuse-integration-key-000000000001", resendApiKey: "re_local_test_only", emailFrom: "Jump in the Mix <test@example.test>", emailDailyLimit: 1_000_000, emailMonthlyLimit: 1_000_000, emailDailyAuthReserve: 1_000, emailMonthlyAuthReserve: 1_000 } };
});
import { changeUnverifiedEmailFormAction, requestMagicLinkFormAction } from "../src/lib/auth-actions";
import { AUTH_TOKEN_PURPOSES, hashAuthToken } from "../src/lib/auth-tokens";
import { authEmailLimitReached, authEmailsSentToday, emailMessageId, emailRecipientHash } from "../src/lib/email-budget";
import { knownDeviceCookie, rateLimitKey } from "../src/lib/rate-limit";

const local = /^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? "");
const REFUSED = "We couldn’t change the email. Check the email and password you signed up with. Only an account created from a text invitation can change its email here, before it is verified.";
const password = "Local sign-in limits test 25!";
const created = { emails: [] as string[], users: [] as string[], invites: [] as string[] };
const address = (label: string) => { const email = `${label}-${randomUUID()}@example.test`; created.emails.push(email); return email; };
function form(values: Record<string, string>) { const data = new FormData(); for (const [key, value] of Object.entries(values)) data.set(key, value); return data; }
async function run(action: Promise<{ error?: string }>): Promise<{ error?: string; redirect?: string }> {
  try { return await action; } catch (error) { if (error instanceof Error && "digest" in error) return { redirect: error.message }; throw error; }
}
async function account(email: string, options: { verified: boolean; invitation?: "text" | "email" }) {
  const user = await prisma.user.create({ data: { email, name: "Invited Member", passwordHash: await bcrypt.hash(password, 4), emailVerifiedAt: options.verified ? new Date() : null } });
  created.users.push(user.id);
  await prisma.workspace.create({ data: { ownerId: user.id, name: "Limits fixture", slug: `limits-${randomUUID()}`, members: { create: { userId: user.id, role: "OWNER" } } } });
  if (options.invitation) {
    const invite = await prisma.referralAccessInvite.create({ data: { ...(options.invitation === "text" ? { recipientPhone: `+1555${String(Date.now()).slice(-7)}`, manualDelivery: true } : { recipientEmail: email }), source: "WAITLIST_MANUAL", tokenHash: hashAuthToken(randomUUID()), tokenCiphertext: "test-only", acceptedAt: new Date(), acceptedUserId: user.id } });
    created.invites.push(invite.id);
  }
  return user;
}
const fetchMock = vi.fn();

describe.skipIf(!local)("sign-in email limits and email correction with PostgreSQL", () => {
  beforeAll(() => { vi.stubGlobal("fetch", fetchMock); });
  beforeEach(() => {
    context.cookies.clear();
    fetchMock.mockReset().mockImplementation(async () => new Response(JSON.stringify({ id: `re_${randomUUID()}` }), { status: 200 }));
  });
  afterAll(async () => {
    await prisma.workspace.deleteMany({ where: { ownerId: { in: created.users } } });
    await prisma.referralAccessInvite.deleteMany({ where: { id: { in: created.invites } } });
    await prisma.user.deleteMany({ where: { id: { in: created.users } } });
    await prisma.verificationToken.deleteMany({ where: { email: { in: created.emails } } });
    await prisma.emailMessage.deleteMany({ where: { recipientHash: { in: created.emails.map(emailRecipientHash) } } });
    const keys = [["auth.magic.ip", [context.ip]], ["auth.login.ip", [context.ip]], ...created.emails.flatMap(email => [["auth.magic.email", [email]], ["auth.login.email", [email]], ["auth.login.email-ip", [email, context.ip]]])] as Array<[string, string[]]>;
    await prisma.authRateLimit.deleteMany({ where: { OR: [{ key: { in: keys.map(([scope, identifiers]) => rateLimitKey(scope, identifiers)) } }, { scope: "auth.email-change.account", key: { in: created.users.map(id => rateLimitKey("auth.email-change.account", [id])) } }] } });
    vi.unstubAllGlobals();
  });

  it("counts an address's account emails per kind from the send ledger over the last day", async () => {
    const email = address("ledger");
    const now = new Date(), dayAgo = new Date(now.getTime() - 25 * 3600_000);
    async function sent(purpose: string, prefix: string, options: { at?: Date; to?: string; inLedger?: boolean } = {}) {
      const tokenHash = hashAuthToken(randomUUID());
      await prisma.verificationToken.create({ data: { email, purpose, tokenHash, usedAt: now, expiresAt: now, createdAt: options.at ?? now } });
      if (options.inLedger !== false) await prisma.emailMessage.create({ data: { id: emailMessageId(`${prefix}:${tokenHash}`), recipientHash: emailRecipientHash(options.to ?? email), payloadHash: "test-only", category: "AUTH", firstAttemptAt: options.at ?? now } });
      return tokenHash;
    }
    await sent(AUTH_TOKEN_PURPOSES.magicLogin, "magic-login");
    await sent(AUTH_TOKEN_PURPOSES.magicLogin, "magic-login");
    const refused = await sent(AUTH_TOKEN_PURPOSES.magicLogin, "magic-login", { inLedger: false });
    await sent(AUTH_TOKEN_PURPOSES.magicLogin, "magic-login", { at: dayAgo });
    await sent(AUTH_TOKEN_PURPOSES.resetPassword, "reset-password");
    const other = address("other");
    await sent(AUTH_TOKEN_PURPOSES.magicLogin, "magic-login", { to: other });
    expect(await authEmailsSentToday(email, "magicLogin")).toBe(2);
    expect(await authEmailsSentToday(email, "resetPassword")).toBe(1);
    expect(await authEmailsSentToday(email, "verifyEmail")).toBe(0);
    expect(await authEmailLimitReached(email, "magicLogin")).toBe(false);
    // A link whose send was refused before the ledger does not use up the day; once it is sent, it does.
    await prisma.emailMessage.create({ data: { id: emailMessageId(`magic-login:${refused}`), recipientHash: emailRecipientHash(email), payloadHash: "test-only", category: "AUTH", firstAttemptAt: now } });
    expect(await authEmailLimitReached(email, "magicLogin")).toBe(true);
  });

  it("sends three sign-in links a day to an address, then answers the same without sending, except to a browser that signed in", async () => {
    const user = await account(address("magic"), { verified: true });
    for (let request = 0; request < 3; request++) expect((await run(requestMagicLinkFormAction({}, form({ email: user.email })))).redirect).toMatch(/^\/login\?magicSent=1&devToken=/);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(await authEmailsSentToday(user.email, "magicLogin")).toBe(3);
    expect(await run(requestMagicLinkFormAction({}, form({ email: user.email })))).toEqual({ redirect: "/login?magicSent=1" });
    expect(await run(requestMagicLinkFormAction({}, form({ email: address("nobody") })))).toEqual({ redirect: "/login?magicSent=1" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(await prisma.verificationToken.count({ where: { email: user.email, purpose: AUTH_TOKEN_PURPOSES.magicLogin } })).toBe(3);
    context.cookies.set("jitm_session_device", knownDeviceCookie(undefined, user.id).value);
    expect((await run(requestMagicLinkFormAction({}, form({ email: user.email })))).redirect).toMatch(/devToken=/);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("corrects a text invitee's mistyped address: the old address loses every link and the change is audited", async () => {
    const typo = address("typo"), right = address("right");
    const user = await account(typo, { verified: false, invitation: "text" });
    for (const purpose of Object.values(AUTH_TOKEN_PURPOSES)) await prisma.verificationToken.create({ data: { email: typo, purpose, tokenHash: hashAuthToken(randomUUID()), expiresAt: new Date(Date.now() + 3600_000) } });
    const outcome = await run(changeUnverifiedEmailFormAction({}, form({ email: typo, password, newEmail: right, confirmNewEmail: right })));
    expect(outcome.redirect).toMatch(new RegExp(`^/verify-email/pending\\?email=${encodeURIComponent(right)}&sent=1&devToken=`));
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).email).toBe(right);
    expect(await prisma.verificationToken.count({ where: { email: typo, usedAt: null } })).toBe(0);
    expect(await prisma.verificationToken.count({ where: { email: right, purpose: AUTH_TOKEN_PURPOSES.verifyEmail, usedAt: null } })).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { entityId: user.id, action: "account.email.change" } });
    expect(audit).toMatchObject({ actorType: "USER", actorUserId: user.id, beforeData: { emailHash: emailRecipientHash(typo) }, afterData: { emailHash: emailRecipientHash(right) } });
    expect(JSON.stringify(audit)).not.toContain(typo.split("@")[0]);
    // The old address no longer belongs to an account: the same refusal as every other failure.
    const again = address("again");
    expect(await run(changeUnverifiedEmailFormAction({}, form({ email: typo, password, newEmail: again, confirmNewEmail: again })))).toEqual({ error: REFUSED });
  });

  it("gives the same refusal for an email invitation, a verified account, a wrong password and no account", async () => {
    const emailInvited = await account(address("email-invited"), { verified: false, invitation: "email" });
    const verified = await account(address("verified"), { verified: true, invitation: "text" });
    const texted = await account(address("texted"), { verified: false, invitation: "text" });
    const fresh = address("fresh");
    for (const [email, attempt] of [[emailInvited.email, password], [verified.email, password], [texted.email, "not the password"], [address("nobody"), password]]) {
      expect(await run(changeUnverifiedEmailFormAction({}, form({ email, password: attempt, newEmail: fresh, confirmNewEmail: fresh })))).toEqual({ error: REFUSED });
    }
    expect(await prisma.user.count({ where: { email: fresh } })).toBe(0);
    const taken = await account(address("taken"), { verified: true });
    expect(await run(changeUnverifiedEmailFormAction({}, form({ email: texted.email, password, newEmail: taken.email, confirmNewEmail: taken.email })))).toEqual({ error: "An account with that email already exists. Choose another address." });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: texted.id } })).email).toBe(texted.email);
  });
});
