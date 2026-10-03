import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// Keep the real page and Notice rendering; no action, provider or database runs.
vi.mock("@/lib/auth-actions", () => ({ changeUnverifiedEmailFormAction: vi.fn(), resendVerificationFormAction: vi.fn() }));
vi.mock("@/lib/email-budget", () => ({ AUTH_EMAILS_PER_RECIPIENT_PER_DAY: { verifyEmail: 5 } }));
vi.mock("@/lib/form-errors", () => ({ verifiedErrorMessage: () => "" }));
vi.mock("@/components/Logo", () => ({ Logo: () => null }));
vi.mock("@/components/ActionForm", () => ({ ActionForm: ({ children }: { children: ReactNode }) => createElement("form", null, children) }));
vi.mock("@/components/FormSubmitButton", () => ({ FormSubmitButton: ({ label }: { label: string }) => createElement("button", { type: "submit" }, label) }));
vi.mock("@/components/PasswordInput", () => ({ PasswordInput: () => createElement("input", { type: "password" }) }));
vi.mock("next/link", () => ({ default: ({ href, children }: { href: string; children: ReactNode }) => createElement("a", { href }, children) }));

import VerifyEmailPendingPage from "../src/app/verify-email/pending/page";

async function render(params: Record<string, string>) {
  return renderToStaticMarkup(await VerifyEmailPendingPage({ searchParams: Promise.resolve({ email: "person@example.test", ...params }) }));
}

describe("verification delivery-failure notices", () => {
  it.each([
    { registered: "1" },
    { sent: "1" },
    { registered: "1", sent: "1" }
  ] as Record<string, string>[])("shows failure instead of a success notice for %j", async flags => {
    const html = await render({ ...flags, delivery: "failed" });
    expect(html).toContain("The email provider could not deliver the message. You can try again below.");
    expect(html).not.toContain("We sent a verification link");
    expect(html).not.toContain("A new verification link was prepared");
    expect(html).not.toContain('class="notice success"');
    expect(html).toContain('class="notice error" role="alert"');
    expect(html).toContain("Send another verification link");
    expect(html).toContain("Change email and send link");
    expect(html).toContain('href="/contact"');
  });

  it.each([
    [{ registered: "1" }, "We sent a verification link"],
    [{ sent: "1" }, "A new verification link was prepared"]
  ] as [Record<string, string>, string][])("retains the corresponding successful notice for %j", async (flags, notice) => {
    const html = await render(flags);
    expect(html).toContain(notice);
    expect(html).not.toContain("The email provider could not deliver the message");
  });

  it("does not invent a success notice for a plain pending page", async () => {
    const html = await render({});
    expect(html).not.toContain("We sent a verification link");
    expect(html).not.toContain("A new verification link was prepared");
    expect(html).not.toContain("The email provider could not deliver the message");
  });
});
