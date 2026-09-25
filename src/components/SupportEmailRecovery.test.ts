import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/support-admin-actions", () => ({
  adminCancelSupportEmailAction: async () => undefined,
  adminRecoverSupportEmailAction: async () => undefined,
  adminRepeatSupportEmailAction: async () => undefined,
  adminRetrySupportEmailAction: async () => undefined
}));
import { AdminDraftProvider } from "@/components/AdminDraftProvider";
import { SupportEmailRecovery } from "@/components/SupportEmailRecovery";

const started = new Date("2026-09-20T12:00:00Z");
function render(canManageEmail: boolean, hasFrozenContent = true): string {
  const delivery = { id: "delivery-1", generation: 1, status: "REVIEW", attempts: 3, updatedAt: new Date("2026-09-24T12:00:00Z"), createdAt: started, firstAttemptAt: started, availableAt: started, hasFrozenContent };
  return renderToStaticMarkup(createElement(AdminDraftProvider, { scope: "staff-test", children: createElement(SupportEmailRecovery, { ticketId: "ticket-1", delivery, canManageEmail }) }));
}
const buttons = (html: string) => [...html.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/g)].map((match) => match[1].replace(/<[^>]+>/g, ""));

describe("SupportEmailRecovery", () => {
  it("offers the acceptance receipt check only to staff with email management", () => {
    const support = render(false);
    expect(buttons(support)).not.toContain("Check acceptance receipt");
    expect(support).not.toContain("Checking a receipt makes no send request.");
    expect(support).not.toContain("Provider email record ID");
    expect(support).toContain("Checking the acceptance receipt is limited to staff with the email management permission.");
    expect(buttons(support)).toEqual(expect.arrayContaining(["Queue same email again", "Close without another email"]));

    const email = render(true);
    expect(buttons(email)).toEqual(expect.arrayContaining(["Check acceptance receipt", "Queue same email again", "Close without another email"]));
    expect(email).toContain("Checking a receipt makes no send request.");
    expect(email).toContain("Provider email record ID");
    expect(email).not.toContain("limited to staff with the email management permission");
  });

  it("does not mention a receipt check when the email has no saved original", () => {
    for (const canManageEmail of [false, true]) {
      const html = render(canManageEmail, false);
      expect(buttons(html)).not.toContain("Check acceptance receipt");
      expect(html).not.toMatch(/Checking a receipt|Checking the acceptance receipt/);
      expect(html).toContain("This notification has no saved original content and key.");
    }
  });
});
