import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Only a test the email service accepted counts against the hourly limit, and the limit reply names
// the time to try again (JITM-UXS-09, F-07). The limit runs through the real rate-limit module over an
// in-memory AuthRateLimit table, so no database is written.
type Row = { key: string; scope: string; attempts: number; windowStartedAt: Date; blockedUntil: Date | null };
const mocks = vi.hoisted(() => ({
  rows: new Map<string, Row>(),
  workspace: vi.fn(), send: vi.fn(), digest: vi.fn(), preferences: vi.fn()
}));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`REDIRECT ${url}`); } }));
vi.mock("@/lib/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/env")>();
  return { ...actual, env: { ...actual.env, authRateLimitSecret: "notification-actions-test-secret-0001" } };
});
vi.mock("@/lib/auth", () => ({ requireWorkspace: mocks.workspace }));
vi.mock("@/lib/prisma", () => {
  const copy = (row: Row | undefined) => row ? { ...row } : null;
  const authRateLimit = {
    findUnique: async ({ where }: { where: { key: string } }) => copy(mocks.rows.get(where.key)),
    create: async ({ data }: { data: Omit<Row, "blockedUntil"> }) => { const row = { blockedUntil: null, ...data }; mocks.rows.set(row.key, row); return copy(row); },
    update: async ({ where, data }: { where: { key: string }; data: Partial<Row> }) => {
      const row = { ...mocks.rows.get(where.key)!, ...data }; mocks.rows.set(where.key, row); return copy(row);
    },
    updateMany: async ({ where, data }: { where: { key: string; attempts: { gt: number }; blockedUntil: null }; data: { attempts: { decrement: number } } }) => {
      const row = mocks.rows.get(where.key);
      if (!row || row.attempts <= where.attempts.gt || row.blockedUntil !== where.blockedUntil) return { count: 0 };
      row.attempts -= data.attempts.decrement;
      return { count: 1 };
    }
  };
  return { prisma: { authRateLimit, $transaction: (run: (tx: { authRateLimit: typeof authRateLimit }) => unknown) => run({ authRateLimit }) } };
});
vi.mock("@/lib/transactional-email", () => ({ transactionalEmailConfigured: () => true, sendTransactionalEmail: mocks.send }));
vi.mock("@/lib/notification-delivery", () => ({ digestMessage: mocks.digest }));
vi.mock("@/lib/display-preferences", () => ({ displayPreferencesForUser: mocks.preferences }));

import { sendReminderTestFormAction } from "./notification-actions";

const NOW = new Date("2026-11-10T20:30:00.000Z"); // 2:30 PM in Chicago
const PREFERENCES = { locale: "en-US", timeZone: "America/Chicago" };
const MESSAGE = { subject: "1 person to reach today", text: "Fictional digest", html: "<p>Fictional digest</p>" };
const NOT_SENT = "We couldn’t confirm that the email service accepted the test, so it may not have been sent. Check your inbox, then try again.";
const limitReached = (time: string) => `Two test emails are allowed per hour. No new test was sent. Check your inbox, or try again after ${time}.`;

const sendTest = () => sendReminderTestFormAction({}, new FormData());
async function accepted(action: Promise<unknown>) {
  try { await action; } catch (error) { if (error instanceof Error && error.message.startsWith("REDIRECT ")) return error.message.slice("REDIRECT ".length); throw error; }
  throw new Error("The test was not accepted.");
}
const attempts = () => [...mocks.rows.values()].map(row => row.attempts);

beforeEach(() => {
  vi.resetAllMocks();
  mocks.rows.clear();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  mocks.workspace.mockResolvedValue({
    user: { id: "owner-1", name: "Sam Owner", email: "owner@example.test", emailVerifiedAt: new Date("2026-01-01T00:00:00Z") },
    workspace: { id: "workspace-1", name: "Sam's Plumbing" }, session: { authUser: { id: "owner-1" } }, impersonation: null
  });
  mocks.preferences.mockResolvedValue(PREFERENCES);
  mocks.digest.mockReturnValue(MESSAGE);
});
afterEach(() => { vi.useRealTimers(); });

describe("sending a test reminder", () => {
  it("does not spend the hourly limit on tests the email service did not accept", async () => {
    mocks.send.mockResolvedValueOnce({ delivered: false, providerId: null });
    expect(await sendTest()).toEqual({ error: NOT_SENT });
    mocks.send.mockRejectedValueOnce(new Error("Email acceptance could not be confirmed (status 503)."));
    expect(await sendTest()).toEqual({ error: NOT_SENT });
    expect(attempts()).toEqual([0]);

    mocks.send.mockResolvedValueOnce({ delivered: true, providerId: "provider-1" });
    expect(await accepted(sendTest())).toBe("/settings/notifications?testAccepted=1");
    expect(mocks.send).toHaveBeenCalledTimes(3);
    expect(attempts()).toEqual([1]);
  });

  it("sends the same fictional reminder, only to the owner's verified address", async () => {
    mocks.send.mockResolvedValue({ delivered: true, providerId: "provider-1" });
    await accepted(sendTest());
    expect(mocks.preferences).toHaveBeenCalledWith("owner-1");
    expect(mocks.digest).toHaveBeenCalledWith({
      ownerName: "Sam Owner", company: "Sam's Plumbing", overdueCount: 0, preferences: PREFERENCES,
      due: [{ scheduledAt: NOW, reason: "Fictional example follow-up", contact: { displayName: "Alex (example)" } }]
    });
    expect(mocks.send).toHaveBeenCalledWith({ ...MESSAGE, subject: "Test reminder: 1 person to reach today", to: "owner@example.test" });
  });

  it("refuses a third accepted test within the hour, sends nothing, and names the time it opens again", async () => {
    mocks.send.mockResolvedValue({ delivered: true, providerId: "provider-1" });
    await accepted(sendTest());
    await accepted(sendTest());
    expect(await sendTest()).toEqual({ error: limitReached("3:30 PM") });
    expect(mocks.send).toHaveBeenCalledTimes(2);

    vi.setSystemTime(new Date(NOW.getTime() + 30 * 60_000));
    expect(await sendTest()).toEqual({ error: limitReached("3:30 PM") });
    expect(mocks.send).toHaveBeenCalledTimes(2);

    vi.setSystemTime(new Date(NOW.getTime() + 60 * 60_000));
    expect(await accepted(sendTest())).toBe("/settings/notifications?testAccepted=1");
    expect(mocks.send).toHaveBeenCalledTimes(3);
  });

  it("names the time in the owner's own locale and timezone", async () => {
    mocks.preferences.mockResolvedValue({ locale: "en-GB", timeZone: "Europe/London" });
    mocks.send.mockResolvedValue({ delivered: true, providerId: "provider-1" });
    await accepted(sendTest());
    await accepted(sendTest());
    expect(await sendTest()).toEqual({ error: limitReached("9:30 pm") });
  });
});
