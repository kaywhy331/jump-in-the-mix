import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ admin: vi.fn(), selected: vi.fn(), ready: vi.fn(), rate: vi.fn(), request: vi.fn(), confirm: vi.fn(), send: vi.fn(), configured: vi.fn(), transaction: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`REDIRECT ${url}`); } }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requirePlatformAdmin: mocks.admin }));
vi.mock("@/lib/env", () => ({ env: { pilotMode: false, appUrl: "https://example.test" } }));
vi.mock("@/lib/auth-tokens", () => ({ hashAuthToken: () => "token-hash" }));
vi.mock("@/lib/prisma", () => ({ prisma: { $transaction: mocks.transaction } }));
vi.mock("@/lib/request-context", () => ({ getRequestMetadata: async () => ({ ipAddress: "127.0.0.1" }) }));
vi.mock("@/lib/rate-limit", () => ({ consumeRateLimit: mocks.rate }));
vi.mock("@/lib/waitlist-delivery", () => ({ WAITLIST_RETRY_WINDOW_MS: 23 * 60 * 60_000 }));
vi.mock("@/lib/waitlist", () => ({
  inviteSelectedWaitlistEntries: mocks.selected, waitlistSendingReady: mocks.ready, WAITLIST_MANUAL_LIMIT: 50, WAITLIST_INTERVAL_MS: 7 * 24 * 60 * 60_000,
  normalizeWaitlistEmail: (v: string) => v.includes("@") ? v.trim().toLowerCase() : null, requestWaitlistEntry: mocks.request, confirmWaitlistEntry: mocks.confirm
}));
vi.mock("@/lib/transactional-email", () => ({ transactionalEmailConfigured: mocks.configured, sendTransactionalEmail: mocks.send, escapeHtml: (v: string) => v }));
import { inviteWaitlistSelectionAction, retryWaitlistDeliveryAction, setWaitlistScheduleAction } from "../src/lib/waitlist-admin-actions";
import { confirmWaitlistAction, joinWaitlistAction, joinWaitlistFormAction } from "../src/lib/waitlist-actions";
function form(values: Record<string, string | string[]>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) for (const item of Array.isArray(value) ? value : [value]) data.append(key, item);
  return data;
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.admin.mockResolvedValue({ user: { id: "admin" } }); mocks.ready.mockReturnValue(true); mocks.configured.mockReturnValue(true);
  mocks.selected.mockResolvedValue({ queued: 1, skipped: 0 }); mocks.rate.mockResolvedValue({ allowed: true }); mocks.send.mockResolvedValue({ delivered: true });
});
describe("waitlist server action boundaries", () => {
  it.each([inviteWaitlistSelectionAction, setWaitlistScheduleAction, retryWaitlistDeliveryAction])("requires administrator authorization before any mutation", async action => {
    mocks.admin.mockRejectedValue(new Error("Not authorized"));
    await expect(action(form({ entryId: "entry", reason: "Launch" }))).rejects.toThrow("Not authorized");
    expect(mocks.selected).not.toHaveBeenCalled(); expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it("deduplicates manual selection and records the authenticated actor", async () => {
    await expect(inviteWaitlistSelectionAction(form({ entryId: ["entry", "entry"], reason: "Launch" }))).rejects.toThrow("queued=1&skipped=0");
    expect(mocks.selected).toHaveBeenCalledWith(["entry"], "admin", "Launch");
  });
  it.each([{ entryId: [] }, { entryId: Array.from({ length: 51 }, (_, i) => String(i)) }])("rejects empty or oversized selections", async ({ entryId }) => {
    await expect(inviteWaitlistSelectionAction(form({ entryId, reason: "Launch" }))).rejects.toThrow("Select%20between");
    expect(mocks.selected).not.toHaveBeenCalled();
  });
  it("requires a reason and configured email before reserving access", async () => {
    await expect(inviteWaitlistSelectionAction(form({ entryId: "entry" }))).rejects.toThrow("reason");
    mocks.ready.mockReturnValue(false);
    await expect(inviteWaitlistSelectionAction(form({ entryId: "entry", reason: "Launch" }))).rejects.toThrow("Configure");
    expect(mocks.selected).not.toHaveBeenCalled();
  });
  it("normalizes public input and sends confirmation rather than an access link", async () => {
    mocks.request.mockResolvedValue("confirmation-token");
    await expect(joinWaitlistAction(form({ email: " PERSON@Example.test " }))).rejects.toThrow("/waitlist?submitted=1");
    expect(mocks.request).toHaveBeenCalledWith("person@example.test");
    expect(mocks.send.mock.calls[0][0]).toMatchObject({ to: "person@example.test", text: expect.stringContaining("/waitlist/confirm?token=") });
    expect(mocks.send.mock.calls[0][0].text).not.toContain("/register");
  });
  it("passes only an allowlisted scenario into a new request", async () => {
    mocks.request.mockResolvedValue(null);
    await expect(joinWaitlistAction(form({ email: "person@example.test", scenario: "painting" }))).rejects.toThrow("submitted=1");
    expect(mocks.request).toHaveBeenCalledWith("person@example.test", "painting");
    mocks.request.mockClear();
    await expect(joinWaitlistAction(form({ email: "person@example.test", scenario: "painting?draft=private" }))).rejects.toThrow("submitted=1");
    expect(mocks.request).toHaveBeenCalledWith("person@example.test");
  });
  it("returns an inline generic receipt and preserves entered email on a recoverable failure", async () => {
    mocks.request.mockResolvedValue(null);
    await expect(joinWaitlistFormAction({ status: "idle" }, form({ email: " PERSON@Example.test " }))).resolves.toMatchObject({ status: "submitted", email: "person@example.test" });
    mocks.request.mockRejectedValueOnce(new Error("provider details must stay private"));
    await expect(joinWaitlistFormAction({ status: "idle" }, form({ email: "person@example.test" }))).resolves.toEqual({ status: "error", email: "person@example.test", message: "We couldn’t submit that. Your email is still here—please try again." });
  });
  it("uses a generic receipt for an existing account or waitlist entry", async () => {
    mocks.request.mockResolvedValue(null);
    await expect(joinWaitlistAction(form({ email: "person@example.test" }))).rejects.toThrow("submitted=1");
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("blocks IP abuse and does not leak email quota state", async () => {
    mocks.rate.mockResolvedValueOnce({ allowed: false });
    await expect(joinWaitlistAction(form({ email: "person@example.test" }))).rejects.toThrow("Too%20many");
    mocks.rate.mockResolvedValueOnce({ allowed: true }).mockResolvedValueOnce({ allowed: false });
    await expect(joinWaitlistAction(form({ email: "person@example.test" }))).rejects.toThrow("submitted=1");
    expect(mocks.request).not.toHaveBeenCalled();
  });
  it("does not report a confirmed signup when sending failed", async () => {
    mocks.request.mockResolvedValue("token"); mocks.send.mockRejectedValue(new Error("provider failure"));
    await expect(joinWaitlistAction(form({ email: "person@example.test" }))).rejects.toThrow("couldn%E2%80%99t");
  });
  it("only confirms through the explicit action and rejects used links", async () => {
    mocks.confirm.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    await expect(confirmWaitlistAction(form({ token: "token" }))).rejects.toThrow("confirmed=1");
    await expect(confirmWaitlistAction(form({ token: "token" }))).rejects.toThrow("expired%20or%20was%20already%20used");
  });
});
