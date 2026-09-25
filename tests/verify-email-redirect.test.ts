import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ rate: vi.fn(), transaction: vi.fn(), session: vi.fn(), membership: vi.fn() }));
vi.mock("@/lib/env", () => ({ env: { appUrl: "https://jumpinthemix.com" } }));
vi.mock("@/lib/auth", () => ({ createSession: mocks.session }));
vi.mock("@/lib/auth-tokens", () => ({ AUTH_TOKEN_PURPOSES: { verifyEmail: "verify_email" }, hashAuthToken: () => "hashed" }));
vi.mock("@/lib/request-context", () => ({ getRequestMetadata: async () => ({ ipAddress: "127.0.0.1" }) }));
vi.mock("@/lib/rate-limit", () => ({ consumeRateLimit: mocks.rate }));
vi.mock("@/lib/prisma", () => ({ prisma: { $transaction: mocks.transaction, workspaceMember: { findFirst: mocks.membership } } }));
import { GET } from "../src/app/api/auth/verify-email/route";
const request = (token = "valid") => new Request(`https://0.0.0.0:10000/api/auth/verify-email?token=${token}`, { headers: { host: "attacker.example", "x-forwarded-host": "attacker.example", "x-forwarded-proto": "https" } });
beforeEach(() => { vi.resetAllMocks(); mocks.rate.mockResolvedValue({ allowed: true }); mocks.transaction.mockResolvedValue({ status: "verified", user: { id: "user", email: "person@example.com" } }); mocks.membership.mockResolvedValue({ workspace: { profile: { onboardingDone: false } } }); });
describe("verification redirects behind the hosted proxy", () => {
  it("sends a verified new user to the configured public onboarding URL", async () => {
    expect((await GET(request())).headers.get("location")).toBe("https://jumpinthemix.com/onboarding?verified=1");
    expect(mocks.session).toHaveBeenCalledWith("user");
  });
  it("sends an existing user to Today on the public origin", async () => {
    mocks.membership.mockResolvedValue({ workspace: { profile: { onboardingDone: true } } });
    expect((await GET(request())).headers.get("location")).toBe("https://jumpinthemix.com/jumps?verified=1");
  });
  it("sends an already verified address to sign in on the public origin", async () => {
    mocks.transaction.mockResolvedValue({ status: "already-verified" });
    expect((await GET(request("spent"))).headers.get("location")).toBe("https://jumpinthemix.com/login?verified=1");
    expect(mocks.session).not.toHaveBeenCalled();
  });
  it.each(["missing", "used", "limited", "error"])("keeps the %s recovery path on the public origin", async state => {
    if (state === "used") mocks.transaction.mockResolvedValue({ status: "invalid" });
    if (state === "limited") mocks.rate.mockResolvedValue({ allowed: false });
    if (state === "error") { mocks.transaction.mockRejectedValue(new Error("database unavailable")); vi.spyOn(console, "error").mockImplementation(() => {}); }
    const result = await GET(request(state === "missing" ? "" : "valid"));
    expect(result.headers.get("location")).toMatch(/^https:\/\/jumpinthemix.com\/verify-email\/pending\?error=/);
    expect(mocks.session).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });
});
