import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ transaction: vi.fn(), session: vi.fn(), rate: vi.fn(), usable: vi.fn(), spent: vi.fn(), account: vi.fn(), claim: vi.fn(), verify: vi.fn(), membership: vi.fn() }));
vi.mock("@/lib/env", () => ({ env: { appUrl: "https://jumpinthemix.com", cookieName: "jitm_session" } }));
vi.mock("@/lib/auth", () => ({ createSession: mocks.session }));
vi.mock("@/lib/auth-tokens", () => ({ AUTH_TOKEN_PURPOSES: { verifyEmail: "verify_email" }, hashAuthToken: (token: string) => `hash:${token}` }));
vi.mock("@/lib/rate-limit", () => ({ consumeRateLimit: mocks.rate }));
vi.mock("@/lib/request-context", () => ({ getRequestMetadata: async () => ({ ipAddress: "203.0.113.5", userAgent: "vitest" }) }));
vi.mock("@/lib/prisma", () => ({ prisma: { $transaction: mocks.transaction, workspaceMember: { findFirst: mocks.membership } } }));
import { GET } from "../src/app/api/auth/verify-email/route";

const request = (token: string, cookie?: string) => new Request(`https://jumpinthemix.com/api/auth/verify-email?token=${token}`, { headers: cookie ? { cookie } : {} });
const location = (response: Response) => { const url = new URL(response.headers.get("location")!); return `${url.pathname}${url.search}`; };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.rate.mockResolvedValue({ allowed: true, remaining: 1, retryAfterSeconds: 0 });
  mocks.transaction.mockImplementation(callback => callback({
    verificationToken: { findFirst: mocks.usable, findUnique: mocks.spent, updateMany: mocks.claim },
    user: { findUnique: mocks.account, update: mocks.verify }
  }));
  mocks.usable.mockResolvedValue(null);
  mocks.spent.mockResolvedValue({ email: "member@example.test", purpose: "verify_email" });
  mocks.account.mockResolvedValue({ emailVerifiedAt: new Date() });
  mocks.claim.mockResolvedValue({ count: 1 });
  mocks.verify.mockResolvedValue({ id: "member", email: "member@example.test" });
  mocks.membership.mockResolvedValue({ workspace: { profile: { onboardingDone: false } } });
});

describe("verification link handling", () => {
  it("sends a used link for an already verified account to sign in instead of reporting an error", async () => {
    const response = await GET(request("used"));
    expect(response.status).toBeGreaterThanOrEqual(300);
    expect(location(response)).toBe("/login?verified=1");
    expect(mocks.claim).not.toHaveBeenCalled();
    expect(mocks.session).not.toHaveBeenCalled();
  });

  it("returns a signed-in browser to Today when the used link belongs to a verified account", async () => {
    expect(location(await GET(request("used", "theme=dark; jitm_session=abc")))).toBe("/jumps?verified=1");
    expect(location(await GET(request("used", "jitm_session=")))).toBe("/login?verified=1");
  });

  it("still reports an invalid link when the account is not verified or the token is unknown", async () => {
    mocks.account.mockResolvedValue({ emailVerifiedAt: null });
    expect(location(await GET(request("used")))).toContain("/verify-email/pending?error=");
    mocks.spent.mockResolvedValue(null);
    expect(location(await GET(request("unknown")))).toContain("/verify-email/pending?error=");
    mocks.spent.mockResolvedValue({ email: "member@example.test", purpose: "magic_login" });
    expect(location(await GET(request("other-purpose")))).toContain("/verify-email/pending?error=");
    expect(mocks.session).not.toHaveBeenCalled();
  });

  it("consumes a usable link, signs the person in and continues to onboarding", async () => {
    mocks.usable.mockResolvedValue({ id: "token", email: "member@example.test" });
    const response = await GET(request("fresh"));
    expect(mocks.claim).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: "token", usedAt: null }) }));
    expect(mocks.verify).toHaveBeenCalledWith(expect.objectContaining({ where: { email: "member@example.test" } }));
    expect(mocks.session).toHaveBeenCalledWith("member");
    expect(location(response)).toBe("/onboarding?verified=1");
  });
});
