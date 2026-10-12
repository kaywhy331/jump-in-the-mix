import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ workspace: vi.fn(), marketing: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw Object.assign(new Error(path), { digest: "NEXT_REDIRECT" }); } }));
vi.mock("@/lib/env", () => ({ env: { authRateLimitSecret: "onboarding-error-signing-secret-000001" } }));
vi.mock("@/lib/auth", () => ({ requireWorkspace: mocks.workspace }));
vi.mock("@/lib/prisma", () => ({ prisma: { workspaceMarketingPreference: { findUnique: mocks.marketing } } }));
vi.mock("@/lib/jump-engine", () => ({ generateJumps: vi.fn() }));
vi.mock("@/lib/starter-mix", () => ({ ensureStarterMix: vi.fn() }));
import { completeOnboardingAction, completeOnboardingFormAction, skipOnboardingAction } from "../src/lib/onboarding-actions";
import { UNVERIFIED_ERROR_MESSAGE, viewerErrorMessage } from "../src/lib/form-errors";
import { VIEW_ONLY_SUPPORT_MESSAGE } from "../src/lib/writable-workspace";

const owner = { authUser: { id: "user-owner" } }, staff = { authUser: { id: "user-staff" } };
const form = (fields: Record<string, string>) => { const data = new FormData(); for (const [key, value] of Object.entries(fields)) data.set(key, value); return data; };
const params = (location: string) => Object.fromEntries(new URL(location, "https://jumpinthemix.com").searchParams);
async function redirectOf(action: Promise<unknown>): Promise<string> {
  try { await action; } catch (error) { if (error instanceof Error && "digest" in error) return error.message; throw error; }
  throw new Error("Expected a redirect");
}
const context = (session: typeof owner, impersonation: object | null = null) => ({ session: { id: "session-1", ...session }, user: { id: "user-owner", name: "Casey Owner" }, workspace: { id: "workspace-1", name: "Casey's business", profile: null }, impersonation });

beforeEach(() => {
  vi.resetAllMocks();
  mocks.workspace.mockResolvedValue(context(owner));
  mocks.marketing.mockResolvedValue(null);
});

describe("setup errors are signed for the person who sees them", () => {
  it("signs the plain action's validation, typed details included, for its viewer", async () => {
    const missing = await redirectOf(completeOnboardingAction(form({})));
    expect(missing).toMatch(/^\/onboarding\?error=.+&at=\d+&sig=[\w-]+$/);
    expect(viewerErrorMessage(params(missing), owner)).toBe("Choose how you want to use Jump in the Mix.");
    const typed = await redirectOf(completeOnboardingAction(form({ useCase: "business", contactName: "Pat Lee", contactEmail: "pat-at-example", followUpDate: "2026-10-01", timezone: "UTC" })));
    expect(typed.startsWith("/onboarding?useCase=business&error=")).toBe(true);
    expect(viewerErrorMessage(params(typed), owner)).toBe("Invalid email address: pat-at-example");
    expect(viewerErrorMessage(params(typed), staff)).toBe(UNVERIFIED_ERROR_MESSAGE);
  });

  it("signs a support view's refusal for the staff member, not the customer", async () => {
    mocks.workspace.mockResolvedValue(context(staff, { id: "support-view" }));
    const location = await redirectOf(skipOnboardingAction(form({ useCase: "business" })));
    expect(viewerErrorMessage(params(location), staff)).toBe(VIEW_ONLY_SUPPORT_MESSAGE);
    expect(viewerErrorMessage(params(location), owner)).toBe(UNVERIFIED_ERROR_MESSAGE);
  });

  it("checks who is signed in before the form's own preview check, which still comes back as the form's error", async () => {
    await expect(completeOnboardingFormAction({}, form({ useCase: "business" }))).resolves.toEqual({ error: "The first follow-up’s preview hasn’t loaded yet. Try again in a moment." });
    expect(mocks.workspace).toHaveBeenCalledTimes(1);
    expect(mocks.marketing).not.toHaveBeenCalled();
    mocks.workspace.mockResolvedValue(context(staff, { id: "support-view" }));
    await expect(completeOnboardingFormAction({}, form({ useCase: "business" }))).resolves.toEqual({ error: VIEW_ONLY_SUPPORT_MESSAGE });
  });
});
