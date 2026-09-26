import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ reserve: vi.fn(), accept: vi.fn(), fetch: vi.fn() }));
vi.mock("@/lib/env", () => ({ env: { resendApiKey: "test-only", emailFrom: "sender@example.test", emailReplyTo: "" } }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/email-budget", () => ({ reserveEmailAttempt: mocks.reserve, emailMessageId: (key: string) => `message:${key}`, emailRecipientHash: (email: string) => `recipient:${email}` }));
vi.mock("@/lib/email-events", () => ({ recordEmailAcceptance: mocks.accept }));
import { sendTransactionalEmail, withEmailAttempts } from "../src/lib/transactional-email";
import { EmailDeliveryError } from "../src/lib/email-errors";

const message = { category: "AUTH" as const, to: "owner@example.test", subject: "Sign in", text: "private link", html: "<p>private link</p>", idempotencyKey: "magic-login:fixture" };
// Provider errors that the loop treats as uncertain and would otherwise retry.
const unavailable = () => new Response("{}", { status: 503 });

beforeEach(() => {
  vi.resetAllMocks();
  mocks.reserve.mockResolvedValue({ cached: false, message: { id: "message", firstAttemptAt: new Date(), providerId: null } });
  mocks.fetch.mockImplementation(async () => unavailable());
  vi.stubGlobal("fetch", mocks.fetch);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("provider attempts per email", () => {
  it("makes one attempt when the caller asks for one and reports a failure the caller can retry", async () => {
    const failure = await sendTransactionalEmail(message, { attempts: 1 }).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(EmailDeliveryError);
    expect(failure).toMatchObject({ code: "PROVIDER", attempted: true });
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(mocks.reserve).toHaveBeenCalledTimes(1);
  });

  it("limits every email inside an interactive scope to one attempt", async () => {
    await expect(withEmailAttempts(1, () => sendTransactionalEmail(message))).rejects.toThrow("could not be confirmed");
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    mocks.fetch.mockResolvedValueOnce(Response.json({ id: "accepted" }));
    await expect(withEmailAttempts(1, () => sendTransactionalEmail(message))).resolves.toMatchObject({ delivered: true, providerId: "accepted" });
  });

  it.each([undefined, 0, 4, Number.NaN, 1.5])("keeps three attempts with backoff for background email (attempts: %s)", async attempts => {
    vi.useFakeTimers();
    const sending = sendTransactionalEmail(message, attempts === undefined ? {} : { attempts }).catch((error: unknown) => error);
    await vi.runAllTimersAsync();
    expect(await sending).toBeInstanceOf(EmailDeliveryError);
    expect(mocks.fetch).toHaveBeenCalledTimes(3);
    // The identical request and key are retried.
    expect(new Set(mocks.fetch.mock.calls.map(([, init]) => (init as RequestInit & { headers: Record<string, string> }).headers["Idempotency-Key"]))).toEqual(new Set(["magic-login:fixture"]));
  });
});
