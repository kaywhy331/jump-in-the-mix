import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const settings = vi.hoisted(() => ({ resendApiKey: "test-key", emailFrom: "new@example.test", emailReplyTo: "new-reply@example.test" }));
vi.mock("@/lib/env", () => ({ env: settings }));
vi.mock("@/lib/email-budget", () => ({ reserveEmailAttempt: async () => ({ cached: false, message: { id: "message", firstAttemptAt: new Date() } }) }));
vi.mock("@/lib/email-events", () => ({ recordEmailAcceptance: async () => {} }));
import { sendTransactionalEmail } from "../src/lib/transactional-email";
const fetchMock = vi.fn();
beforeEach(() => {
  settings.emailFrom = "new@example.test"; settings.emailReplyTo = "new-reply@example.test";
  fetchMock.mockReset().mockImplementation(async () => new Response(JSON.stringify({ id: "provider-id" }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());
const message = { to: "recipient@example.test", subject: "Invitation", text: "Invitation text", html: "<p>Invitation</p>", idempotencyKey: "waitlist-fixed-key" };
describe("durable invitation email identity", () => {
  it("retains queued sender and explicit absent reply address across configuration changes", async () => {
    await sendTransactionalEmail({ ...message, from: "original@example.test", replyTo: null });
    const first = fetchMock.mock.calls[0][1];
    settings.emailFrom = "changed@example.test"; settings.emailReplyTo = "changed-reply@example.test";
    await sendTransactionalEmail({ ...message, from: "original@example.test", replyTo: null });
    const second = fetchMock.mock.calls[1][1];
    expect(second.body).toBe(first.body);
    expect(JSON.parse(first.body)).toMatchObject({ from: "original@example.test" });
    expect(JSON.parse(first.body)).not.toHaveProperty("reply_to");
    expect(second.headers["Idempotency-Key"]).toBe("waitlist-fixed-key");
  });
  it("retains an explicitly queued reply address", async () => {
    await sendTransactionalEmail({ ...message, replyTo: "original-reply@example.test" });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).reply_to).toBe("original-reply@example.test");
  });
  it("keeps environment defaults for existing callers", async () => {
    await sendTransactionalEmail(message);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ from: settings.emailFrom, reply_to: settings.emailReplyTo });
  });
});
