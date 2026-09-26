import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "../src/generated/prisma/client";

const mocks = vi.hoisted(() => ({ send: vi.fn(), budget: vi.fn() }));
vi.mock("@/lib/env", () => ({ env: { appUrl: "https://jumpinthemix.com", emailVerificationHours: 24, passwordResetMinutes: 30, dataEncryptionKey: "reserve-test-key", emailDailyLimit: 90, emailMonthlyLimit: 2700, emailDailyAuthReserve: 20, emailMonthlyAuthReserve: 300 } }));
vi.mock("@/lib/prisma", () => ({ prisma: { job: { count: async () => 0, findMany: async () => [] }, workerHeartbeat: { count: async () => 1, findMany: async () => [] }, dataRetentionState: { findUnique: async () => null } } }));
vi.mock("@/lib/transactional-email", () => ({ sendTransactionalEmail: mocks.send, escapeHtml: (value: string) => value }));
vi.mock("@/lib/email-budget", async importOriginal => ({ ...await importOriginal<typeof import("../src/lib/email-budget")>(), readEmailBudget: mocks.budget }));
vi.mock("next/link", () => ({ default: ({ href, children, ...props }: { href: string; children?: ReactNode }) => createElement("a", { href, ...props }, children) }));
vi.mock("@/lib/auth", () => ({ requirePlatformAdmin: async () => ({ user: { id: "admin" }, permissions: ["operations.read"] }) }));
vi.mock("@/lib/display-preferences", () => ({ displayPreferencesForUser: async () => ({}) }));
vi.mock("@/lib/admin-operations-actions", () => ({ retryFailedJobAction: vi.fn() }));
vi.mock("@/components/AdminRefresh", () => ({ AdminRefresh: () => null }));
import { sendMagicLoginEmail, sendPasswordResetEmail, sendVerificationEmail } from "../src/lib/auth-email";
import { AUTH_EMAIL_KEY_PREFIXES, authReserveUse } from "../src/lib/email-budget";
import { hashAuthToken } from "../src/lib/auth-tokens";
import { collectOperationsSignals } from "../src/lib/operations-signals";
import AdminOperationsPage from "../src/app/(staff)/admin/operations/page";

// Budget windows as readEmailBudget reports them: `authDay` account emails and 30 others in the last day.
const windows = (authDay: number, authMonth = authDay) => [
  { name: "day", since: new Date(), duration: 1, used: authDay + 30, total: 90, otherUsed: 30, other: 70 },
  { name: "month", since: new Date(), duration: 1, used: authMonth + 100, total: 2700, otherUsed: 100, other: 2400 }
];

beforeEach(() => { vi.clearAllMocks(); });

describe("per-address limits read the keys account emails are sent with", () => {
  it("matches each account email's idempotency key in the send ledger", async () => {
    mocks.send.mockResolvedValue({ delivered: true, providerId: "provider-id" });
    await sendMagicLoginEmail("person@example.test", "magic-token");
    await sendPasswordResetEmail("person@example.test", "Person", "reset-token");
    await sendVerificationEmail("person@example.test", "Person", "verify-token");
    expect(mocks.send.mock.calls.map(([message]) => [message.idempotencyKey, message.category])).toEqual([
      [`${AUTH_EMAIL_KEY_PREFIXES.magicLogin}:${hashAuthToken("magic-token")}`, "AUTH"],
      [`${AUTH_EMAIL_KEY_PREFIXES.resetPassword}:${hashAuthToken("reset-token")}`, "AUTH"],
      [`${AUTH_EMAIL_KEY_PREFIXES.verifyEmail}:${hashAuthToken("verify-token")}`, "AUTH"]
    ]);
  });
});

describe("the account-email reserve alert", () => {
  it("warns at half of the reserve in either window", () => {
    expect(authReserveUse(windows(9, 9)).some(window => window.warning)).toBe(false);
    expect(authReserveUse(windows(10, 10))[0]).toEqual({ name: "day", used: 10, reserve: 20, warning: true });
    expect(authReserveUse(windows(0, 150))[1]).toEqual({ name: "month", used: 150, reserve: 300, warning: true });
  });

  it("turns the independent monitor's email check to WARNING from the evidence it already reports", async () => {
    const tx = {
      $executeRaw: async () => 0, $queryRaw: async () => [{ bytes: BigInt(1000) }],
      workerHeartbeat: { findFirst: async () => ({ lastSeenAt: new Date() }) }, job: { count: async () => 0 }, waitlistDelivery: { count: async () => 0 },
      authRateLimit: { count: async () => 0 }, platformAuditEvent: { count: async () => 0 }, supportTicketMessage: { count: async () => 0 }, supportEmailDelivery: { count: async () => 0 }
    };
    const database = { $transaction: async (callback: (client: typeof tx) => unknown) => callback(tx) } as unknown as PrismaClient;
    const input = { webReady: true, backupAgeHours: 1, restoreAgeDays: 1, notificationsConfigured: true };
    const email = async (authEmails: number) => {
      mocks.budget.mockResolvedValue(windows(authEmails, authEmails));
      return (await collectOperationsSignals(input, new Date(), database)).find(row => row.code === "email")!;
    };
    expect((await email(9)).state).toBe("OK");
    const warning = await email(10);
    expect(warning.state).toBe("WARNING");
    expect(warning.evidence).toMatchObject({ dayUsed: 40, dayOtherUsed: 30, dayLimit: 90, dayOtherLimit: 70 });
  });

  it("shows the same condition on Admin → Operations, where no monitor is needed to see it", async () => {
    // React separates adjacent text with comments in static markup; the reader sees one sentence.
    const render = async () => renderToStaticMarkup(await AdminOperationsPage({ searchParams: Promise.resolve({}) })).replaceAll("<!-- -->", "");
    mocks.budget.mockResolvedValue(windows(9, 9));
    expect(await render()).not.toContain("Account email (sign-in links");
    mocks.budget.mockResolvedValue(windows(12, 12));
    const page = await render();
    expect(page).toContain("Account email (sign-in links, verification and password resets) sent 12 emails in the last 24 hours, at least half of the 20 reserved for it.");
    expect(page).toContain('href="/admin/email"');
  });
});
