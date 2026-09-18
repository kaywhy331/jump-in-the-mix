import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ transaction: vi.fn(), session: vi.fn(), token: vi.fn(), user: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw Object.assign(new Error(path), { digest: "NEXT_REDIRECT" }); } }));
vi.mock("@/lib/env", () => ({ env: { pilotMode: false } }));
vi.mock("@/lib/auth", () => ({ createSession: mocks.session }));
vi.mock("@/lib/account-home", () => ({ accountHome: async (_id: string, path: string) => path }));
vi.mock("@/lib/account-provisioning", () => ({ createBusinessAccount: vi.fn(), nameFromEmail: vi.fn() }));
vi.mock("@/lib/auth-tokens", () => ({ AUTH_TOKEN_PURPOSES: { magicLogin: "magic_login" }, findUsableAuthToken: mocks.token, hashAuthToken: () => "hashed" }));
vi.mock("@/lib/prisma", () => ({ prisma: { $transaction: mocks.transaction } }));
import { GET } from "../src/app/api/auth/magic/route";
beforeEach(() => {
  vi.resetAllMocks(); mocks.token.mockResolvedValue({ id: "token", email: "member@example.test" });
  mocks.user.mockResolvedValue({ id: "member", memberships: [{ workspace: { profile: { onboardingDone: true } } }] });
  mocks.transaction.mockImplementation(callback => callback({ verificationToken: { updateMany: async () => ({ count: 1 }) }, user: { findUnique: mocks.user, update: async () => ({}) } }));
});
it.each(["/contacts/person-1", "/account/tickets/case-1"])('returns a signed-in customer to %s', async destination => {
  await expect(GET(new Request(`https://jumpinthemix.com/api/auth/magic?token=synthetic&next=${encodeURIComponent(destination)}`))).rejects.toThrow(destination);
  expect(mocks.session).toHaveBeenCalledWith("member");
});
it.each(["https://outside.example", "//outside.example", "/admin", "/contacts/../admin"])('ignores unsafe return target %s', async destination => {
  await expect(GET(new Request(`https://jumpinthemix.com/api/auth/magic?token=synthetic&next=${encodeURIComponent(destination)}`))).rejects.toThrow("/jumps");
});
it('keeps unfinished setup ahead of the requested destination', async () => {
  mocks.user.mockResolvedValue({ id: "member", memberships: [{ workspace: { profile: { onboardingDone: false } } }] });
  await expect(GET(new Request('https://jumpinthemix.com/api/auth/magic?token=synthetic&next=%2Fcontacts%2Fperson-1'))).rejects.toThrow('/onboarding');
});
