import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Test-only transport capture. No production transport, auth guard or provider configuration changes.
const context = vi.hoisted(() => ({ cookies: new Map<string, string>(), options: new Map<string, Record<string, unknown>>(), ip: `2001:db8:${Math.floor(Math.random() * 0xffff).toString(16)}::42` }));
vi.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({
  get: (key: string) => context.cookies.has(key) ? { name: key, value: context.cookies.get(key) } : undefined,
  set: (key: string, value: string, options: Record<string, unknown> = {}) => { context.cookies.set(key, value); context.options.set(key, options); },
  delete: (key: string) => context.cookies.delete(key)
}) }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw Object.assign(new Error("test redirect"), { digest: "NEXT_REDIRECT", target: path }); } }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/request-context", () => ({ getRequestMetadata: async () => ({ ipAddress: context.ip, userAgent: "Synthetic local account flow" }) }));
vi.mock("@/lib/worker-dispatch-after", () => ({ wakeWorkerAfterResponse: vi.fn() }));
vi.mock("@/lib/env", async original => {
  const mod = await original<typeof import("../src/lib/env")>();
  return { ...mod, env: { ...mod.env, appUrl: "http://127.0.0.1:3147", pilotMode: false, requireEmailVerification: true,
    cookieName: "jitm_session", secureSessionCookie: true, resendApiKey: "re_local_capture_only", emailFrom: "Synthetic test <test@example.test>", emailReplyTo: "" } };
});

import { prisma } from "../src/lib/prisma";
import { registerAction, loginAction, logoutAction, requestPasswordResetAction, resetPasswordAction, resendVerificationAction } from "../src/lib/auth-actions";
import { GET as verifyEmail } from "../src/app/api/auth/verify-email/route";
import { hashAuthToken } from "../src/lib/auth-tokens";
import { emailRecipientHash } from "../src/lib/email-budget";
import { rateLimitKey } from "../src/lib/rate-limit";

const local = (() => { try { const u = new URL(process.env.DATABASE_URL ?? ""); return ["postgres:", "postgresql:"].includes(u.protocol) && ["127.0.0.1", "localhost", "[::1]"].includes(u.hostname) && /^\/jitm_design_[a-z0-9_]+$/.test(u.pathname) && !u.search && !u.hash; } catch { return false; } })();
const enabled = process.env.LOCAL_AUTH_MAIL_CAPTURE === "1" && local && process.env.BILLING_ENABLED === "false" && process.env.AUTOMATIC_CUSTOMER_EMAIL === "false";
const email = `jitm-mail-${randomUUID()}@example.test`;
const password = "Synthetic first account password 42!";
const replacement = "Synthetic replacement password 43!";
const messages: Array<{ subject: string; text: string }> = [];
let inviteId = "", errorCount = 0;
const form = (values: Record<string, string>) => { const data = new FormData(); for (const [key, value] of Object.entries(values)) data.set(key, value); return data; };
async function destination(action: Promise<unknown>): Promise<URL> {
  try { await action; } catch (error) {
    if (error && typeof error === "object" && "digest" in error && "target" in error && error.digest === "NEXT_REDIRECT") return new URL(String(error.target), "http://127.0.0.1:3147");
    // Do not put emailed bearer links in reporter output on failure.
    throw new Error("Account action failed before its expected redirect.");
  }
  throw new Error("Account action did not redirect.");
}
function capturedLink(subject: string, route: string, index = -1): URL {
  const selected = messages.filter(message => message.subject === subject).at(index);
  if (!selected) throw new Error("Expected synthetic email was not captured.");
  const url = selected.text.match(/http:\/\/127\.0\.0\.1:3147\/[^\s]+/);
  if (!url) throw new Error("Captured message lacked a loopback action link.");
  const link = new URL(url[0]);
  if (link.pathname !== route || !link.searchParams.get("token")) throw new Error("Unexpected captured action link.");
  return link;
}

describe.skipIf(!enabled)("full account flow with in-memory mail capture and real local PostgreSQL", () => {
  beforeAll(() => {
    vi.stubEnv("NODE_ENV", "production");
    vi.spyOn(console, "error").mockImplementation(() => { errorCount++; });
    // Never delegate to the real fetch. Unexpected requests fail closed without a URL in the error.
    vi.stubGlobal("fetch", async (input: string | URL | Request, init?: RequestInit) => {
      const target = input instanceof Request ? input.url : String(input);
      const headers = new Headers(init?.headers);
      if (target !== "https://api.resend.com/emails" || init?.method !== "POST" || headers.get("Authorization") !== "Bearer re_local_capture_only") throw new Error("Unexpected request blocked by local mail capture.");
      const body = JSON.parse(String(init.body)) as { to?: string[]; subject?: string; text?: string };
      if (body.to?.length !== 1 || body.to[0] !== email || typeof body.subject !== "string" || typeof body.text !== "string") throw new Error("Non-fixture mail blocked by local capture.");
      messages.push({ subject: body.subject, text: body.text });
      return new Response(JSON.stringify({ id: randomUUID() }), { status: 200 });
    });
  });
  afterAll(async () => {
    const users = await prisma.user.findMany({ where: { email }, select: { id: true } });
    await prisma.workspace.deleteMany({ where: { ownerId: { in: users.map(user => user.id) } } });
    await prisma.referralAccessInvite.deleteMany({ where: { id: inviteId || "no-fixture" } });
    await prisma.user.deleteMany({ where: { email } });
    await prisma.verificationToken.deleteMany({ where: { email } });
    await prisma.emailMessage.deleteMany({ where: { recipientHash: emailRecipientHash(email) } });
    const scopes: Array<[string, string[]]> = [
      ...["auth.register.ip", "auth.verify.consume.ip", "auth.verify.resend.ip", "auth.reset.request.ip", "auth.reset.consume.ip", "auth.login.ip"].map(scope => [scope, [context.ip]] as [string, string[]]),
      ...["auth.register.email", "auth.verify.resend.email", "auth.reset.request.email", "auth.login.email"].map(scope => [scope, [email]] as [string, string[]]),
      ["auth.login.email-ip", [email, context.ip]]
    ];
    await prisma.authRateLimit.deleteMany({ where: { key: { in: scopes.map(([scope, ids]) => rateLimitKey(scope, ids)) } } });
    messages.length = 0; context.cookies.clear(); context.options.clear();
    vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks();
  });

  it("claims one invitation, verifies a captured replacement link, logs in/out, resets once, and invalidates old sessions", async () => {
    const token = randomBytes(32).toString("base64url");
    inviteId = (await prisma.referralAccessInvite.create({ data: { recipientEmail: email, source: "WAITLIST_MANUAL", tokenHash: hashAuthToken(token), tokenCiphertext: "unused-synthetic-fixture" } })).id;
    const pending = await destination(registerAction(form({ name: "Synthetic Tester", email, password, invite: token })));
    expect(pending.pathname).toBe("/verify-email/pending");
    expect(pending.searchParams.has("devToken")).toBe(false);
    expect(pending.searchParams.has("delivery")).toBe(false);
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(user.emailVerifiedAt).toBeNull();
    expect((await destination(loginAction(form({ email, password })))).pathname).toBe("/verify-email/pending");
    const first = capturedLink("Verify your Jump in the Mix email", "/api/auth/verify-email");
    await destination(resendVerificationAction(form({ email })));
    const fresh = capturedLink("Verify your Jump in the Mix email", "/api/auth/verify-email");
    expect(first.href === fresh.href).toBe(false);
    const obsolete = await verifyEmail(new Request(first));
    expect(new URL(obsolete.headers.get("location")!).pathname).toBe("/verify-email/pending");
    expect((await prisma.user.findUniqueOrThrow({ where: { email } })).emailVerifiedAt).toBeNull();
    const verified = await verifyEmail(new Request(fresh));
    expect(new URL(verified.headers.get("location")!).pathname).toBe("/onboarding");
    expect((await prisma.user.findUniqueOrThrow({ where: { email } })).emailVerifiedAt).not.toBeNull();
    expect(context.options.get("jitm_session")).toMatchObject({ secure: true, httpOnly: true, sameSite: "lax" });
    const sessionCount = await prisma.session.count({ where: { userId: user.id } });
    await verifyEmail(new Request(fresh));
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(sessionCount);
    expect((await destination(logoutAction())).pathname).toBe("/signed-out");
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(0);
    expect((await destination(loginAction(form({ email, password })))).pathname).toBe("/onboarding");
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(1);
    const resetPending = await destination(requestPasswordResetAction(form({ email })));
    expect(resetPending.pathname).toBe("/forgot-password");
    expect(resetPending.searchParams.has("devToken")).toBe(false);
    const reset = capturedLink("Reset your Jump in the Mix password", "/reset-password");
    const resetToken = reset.searchParams.get("token")!;
    const done = await destination(resetPasswordAction(form({ token: resetToken, password: replacement, confirmPassword: replacement })));
    expect(done.pathname).toBe("/login"); expect(done.searchParams.get("reset")).toBe("1");
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(0);
    expect((await destination(resetPasswordAction(form({ token: resetToken, password, confirmPassword: password })))).pathname).toBe("/forgot-password");
    expect((await destination(loginAction(form({ email, password })))).pathname).toBe("/login");
    expect((await destination(loginAction(form({ email, password: replacement })))).pathname).toBe("/onboarding");
    await vi.waitFor(() => expect(messages.some(message => message.subject === "Your Jump in the Mix password changed")).toBe(true));
    expect(messages.length).toBe(4);
    expect(errorCount).toBe(0);
  });
});
