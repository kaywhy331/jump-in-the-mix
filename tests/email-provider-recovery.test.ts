import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({ env: { resendApiKey: "sending-key", resendRecoveryApiKey: "recovery-key" } }));
vi.mock("@/lib/email-budget", () => ({ EMAIL_RETRY_WINDOW_MS: 23 * 60 * 60_000 }));
vi.mock("@/lib/email-suppression-admin", () => ({ EmailReviewError: class EmailReviewError extends Error {} }));
vi.mock("@/lib/transactional-email", () => ({
  preparedEmail: (message: { to: string; subject: string; text: string; html: string; replyTo?: string | null }) => ({
    body: JSON.stringify({ from: "Sender <sender@example.test>", to: [message.to], subject: message.subject, text: message.text, html: message.html, ...(message.replyTo ? { reply_to: message.replyTo } : {}) })
  })
}));

import { verifyProviderInvitation } from "../src/lib/email-provider-recovery";

const id = "01a0b63e-1a67-736b-b6d4-552323df7325";
const message = { to: "recipient@example.test", subject: "Private invitation", text: "Frozen text", html: "<p>Frozen text</p>", replyTo: null };
function receipt(overrides: Record<string, unknown> = {}) {
  return { object: "email", id, from: "Sender <sender@example.test>", to: [message.to], subject: message.subject, text: message.text, html: message.html, cc: null, bcc: null, reply_to: null, scheduled_at: null, last_event: "delivered", created_at: new Date().toISOString(), ...overrides };
}
function provider(data: Record<string, unknown>) {
  const fetcher = vi.fn(async () => Response.json(data));
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}
afterEach(() => vi.unstubAllGlobals());

describe("provider receipt validation", () => {
  it.each([{ empty: null }, { empty: [] }])("accepts explicitly empty provider recipient headers: $empty", ({ empty }) => {
    const fetcher = provider(receipt({ cc: empty, bcc: empty, reply_to: empty }));
    return expect(verifyProviderInvitation(id, message, new Date(Date.now() - 1000))).resolves.toMatchObject({ providerId: id }).then(() => {
      expect(fetcher).toHaveBeenCalledOnce();
      expect(fetcher).toHaveBeenCalledWith(`https://api.resend.com/emails/${id}`, expect.objectContaining({ method: "GET", redirect: "error", headers: { Authorization: "Bearer recovery-key" } }));
    });
  });

  it("matches a configured reply-to alongside live nullable CC/BCC", async () => {
    provider(receipt({ reply_to: ["support@example.test"] }));
    await expect(verifyProviderInvitation(id, { ...message, replyTo: "support@example.test" }, new Date(Date.now() - 1000))).resolves.toMatchObject({ providerId: id });
  });

  it.each(["cc", "bcc", "reply_to"])("rejects extra recipients in %s", async field => {
    provider(receipt({ [field]: ["other@example.test"] }));
    await expect(verifyProviderInvitation(id, message, new Date(Date.now() - 1000))).rejects.toThrow("does not exactly match");
  });

  it.each(["to", "cc", "bcc", "reply_to"])("rejects an omitted %s field", async field => {
    const data = receipt(); delete data[field as keyof typeof data];
    provider(data);
    await expect(verifyProviderInvitation(id, message, new Date(Date.now() - 1000))).rejects.toThrow("does not exactly match");
  });

  it.each([null, [], ["other@example.test"], [message.to, "other@example.test"]].map(to => ({ to })))("rejects a missing or different sole recipient: $to", async ({ to }) => {
    provider(receipt({ to }));
    await expect(verifyProviderInvitation(id, message, new Date(Date.now() - 1000))).rejects.toThrow("does not exactly match");
  });

  it("does not accept null when a reply-to was configured", async () => {
    provider(receipt());
    await expect(verifyProviderInvitation(id, { ...message, replyTo: "support@example.test" }, new Date(Date.now() - 1000))).rejects.toThrow("does not exactly match");
  });

  it.each(["", false, {}])("rejects malformed empty-looking recipient lists: %j", async cc => {
    provider(receipt({ cc }));
    await expect(verifyProviderInvitation(id, message, new Date(Date.now() - 1000))).rejects.toThrow("does not exactly match");
  });

  it.each(["subject", "text", "html", "from"])("still rejects changed frozen %s", async field => {
    provider(receipt({ [field]: "Changed content" }));
    await expect(verifyProviderInvitation(id, message, new Date(Date.now() - 1000))).rejects.toThrow("does not exactly match");
  });

  it.each(["bounced", "complained", "failed", "unknown"])("does not recover adverse or unknown status %s as success", async last_event => {
    provider(receipt({ last_event }));
    await expect(verifyProviderInvitation(id, message, new Date(Date.now() - 1000))).rejects.toThrow("adverse or unsupported");
  });
});
