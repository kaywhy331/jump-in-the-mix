import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ complete: vi.fn(), failurePath: vi.fn(), session: vi.fn(), findUser: vi.fn(), cookies: new Map<string, string>(), writes: [] as Array<{ name: string; value: string; options: Record<string, unknown> }> }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw Object.assign(new Error(path), { digest: "NEXT_REDIRECT" }); } }));
vi.mock("next/headers", () => ({ cookies: async () => ({
  get: (name: string) => mocks.cookies.has(name) ? { name, value: mocks.cookies.get(name) } : undefined,
  set: (name: string, value: string, options: Record<string, unknown>) => { mocks.writes.push({ name, value, options }); mocks.cookies.set(name, value); }
}) }));
vi.mock("@/lib/env", () => ({ env: { authRateLimitSecret: "oauth-callback-test-secret-000000000001", cookieName: "jitm_session", secureSessionCookie: true, sessionMaxDays: 90, appUrl: "https://jumpinthemix.com" } }));
vi.mock("@/lib/prisma", () => ({ prisma: { user: { findUnique: mocks.findUser } } }));
vi.mock("@/lib/auth", () => ({ createSession: mocks.session }));
vi.mock("@/lib/social-auth", () => ({ completeSocialAuthorization: mocks.complete, socialAuthFailurePath: mocks.failurePath }));
import { GET as googleCallback } from "../src/app/api/auth/oauth/google/callback/route";
import { GET as appleGet, POST as applePost } from "../src/app/api/auth/oauth/apple/callback/route";
import { isKnownDevice } from "../src/lib/rate-limit";
import { verifiedErrorMessage } from "../src/lib/form-errors";

async function redirectOf(response: Promise<unknown>): Promise<string> {
  try { await response; } catch (error) { if (error instanceof Error && "digest" in error) return error.message; throw error; }
  throw new Error("Expected a redirect");
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.cookies.clear(); mocks.writes.length = 0;
  mocks.complete.mockResolvedValue({ userId: "member", returnTo: "/contacts" });
  mocks.failurePath.mockResolvedValue("/register?invite=back&error=x&sig=y");
  mocks.findUser.mockResolvedValue({ suspendedAt: null });
});

describe("Google and Apple callbacks", () => {
  it("signs in, remembers this browser for the account and follows the return path", async () => {
    expect(await redirectOf(googleCallback(new Request("https://jumpinthemix.com/api/auth/oauth/google/callback?state=s&code=c")))).toBe("/contacts");
    expect(mocks.complete).toHaveBeenCalledWith({ provider: "GOOGLE", state: "s", code: "c", canceled: false });
    expect(mocks.session).toHaveBeenCalledWith("member");
    const marker = mocks.writes.find(write => write.name === "jitm_session_device")!;
    expect(marker.options).toMatchObject({ httpOnly: true, sameSite: "lax", secure: true, path: "/" });
    expect(isKnownDevice(marker.value, "member")).toBe(true);
    expect(isKnownDevice(marker.value, "someone-else")).toBe(false);
  });

  it("hands a canceled or failed sign-in to the failure path, which returns an invitation to its link", async () => {
    const failure = new Error("anything");
    mocks.complete.mockRejectedValue(failure);
    expect(await redirectOf(googleCallback(new Request("https://jumpinthemix.com/api/auth/oauth/google/callback?state=s&error=access_denied")))).toBe("/register?invite=back&error=x&sig=y");
    expect(mocks.complete).toHaveBeenCalledWith(expect.objectContaining({ canceled: true }));
    expect(mocks.failurePath).toHaveBeenCalledWith("GOOGLE", failure);
    expect(mocks.session).not.toHaveBeenCalled();
    expect(mocks.writes).toHaveLength(0);
  });

  it("lets a redirect from session creation through untouched", async () => {
    mocks.session.mockRejectedValue(Object.assign(new Error("/login?error=suspended"), { digest: "NEXT_REDIRECT" }));
    expect(await redirectOf(googleCallback(new Request("https://jumpinthemix.com/api/auth/oauth/google/callback?state=s&code=c")))).toBe("/login?error=suspended");
    expect(mocks.failurePath).not.toHaveBeenCalled();
  });

  it("answers Apple's cross-site post with 303s, so the browser follows with a GET the origin check accepts", async () => {
    const body = new URLSearchParams({ state: "s", code: "c", user: JSON.stringify({ name: { firstName: "Jo" } }) });
    const signedIn = await applePost(new Request("https://0.0.0.0:10000/api/auth/oauth/apple/callback", { method: "POST", body }));
    expect(signedIn.status).toBe(303);
    expect(signedIn.headers.get("location")).toBe("https://jumpinthemix.com/contacts");
    expect(mocks.complete).toHaveBeenCalledWith({ provider: "APPLE", state: "s", code: "c", appleUser: JSON.stringify({ name: { firstName: "Jo" } }), canceled: false });
    expect(mocks.session).toHaveBeenCalledWith("member");
    expect(isKnownDevice(mocks.writes.find(write => write.name === "jitm_session_device")!.value, "member")).toBe(true);
    mocks.complete.mockRejectedValue(new Error("user_cancelled_authorize"));
    const canceled = await applePost(new Request("https://0.0.0.0:10000/api/auth/oauth/apple/callback", { method: "POST", body: new URLSearchParams({ state: "s", error: "user_cancelled_authorize" }) }));
    expect([canceled.status, canceled.headers.get("location")]).toEqual([303, "https://jumpinthemix.com/register?invite=back&error=x&sig=y"]);
    expect(mocks.complete).toHaveBeenLastCalledWith(expect.objectContaining({ provider: "APPLE", canceled: true }));
    expect(mocks.failurePath).toHaveBeenCalledWith("APPLE", expect.any(Error));
    expect((await appleGet(new Request("https://jumpinthemix.com/api/auth/oauth/apple/callback?state=s&code=c"))).status).toBe(303);
  });

  it("turns a suspended Apple account away with a 303 and no session", async () => {
    mocks.findUser.mockResolvedValue({ suspendedAt: new Date() });
    const refused = await applePost(new Request("https://jumpinthemix.com/api/auth/oauth/apple/callback", { method: "POST", body: new URLSearchParams({ state: "s", code: "c" }) }));
    expect(refused.status).toBe(303);
    const location = new URL(refused.headers.get("location")!);
    expect(location.pathname).toBe("/login");
    expect(verifiedErrorMessage(Object.fromEntries(location.searchParams))).toBe("Account access is unavailable. Contact support for help.");
    expect(mocks.session).not.toHaveBeenCalled();
    expect(mocks.writes).toHaveLength(0);
  });
});
