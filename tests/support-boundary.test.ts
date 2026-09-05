import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("Help and support boundaries", () => {
  it("places Help under More and separates hosted from self-hosted support", () => {
    const nav = read("src/components/Nav.tsx");
    const more = read("src/app/(app)/more/page.tsx");
    const help = read("src/app/(app)/help/page.tsx");
    expect(nav).not.toContain('href: "/help", label: "Help"');
    expect(nav).toContain('href: "/more", label: "More"');
    expect(more).toContain('["/help", "Help"');
    expect(help).toContain("<SupportFaq />");
    expect(help).toContain('id="contact-support"');
    expect(help).toContain("if (env.pilotMode)");
    expect(help).toContain("<SelfHostedHelp />");
    expect(help).toContain("SUPPORT_CATEGORIES");
    expect(help).toContain("createSupportTicketAction");
  });

  it("scopes user ticket reads and writes to the authenticated requester and workspace", () => {
    const page = read("src/app/(app)/account/tickets/[ticketId]/page.tsx");
    const actions = read("src/lib/support-actions.ts");
    const service = read("src/lib/support-service.ts");
    expect(page).toContain("requireWorkspace(");
    expect(page).toContain("workspaceId: workspace.id");
    expect(page).toContain("requesterUserId: user.id");
    expect(actions).toContain("requireWorkspace(");
    expect(actions).toContain("Administrator support sessions are view-only");
    expect(actions).not.toMatch(/formData\.get\(["']workspaceId/);
    expect(actions).not.toMatch(/formData\.get\(["']requesterUserId/);
    expect(service).toContain("workspaceId: input.workspaceId");
    expect(service).toContain("requesterUserId: input.requesterUserId");
  });

  it("requires platform administrator access for the support queue and controls", () => {
    for (const path of [
      "src/app/(app)/admin/support/page.tsx",
      "src/app/(app)/admin/support/[ticketId]/page.tsx",
      "src/lib/support-admin-actions.ts"
    ]) {
      expect(read(path), `${path} must require a platform administrator`).toContain("requirePlatformAdmin(");
    }
    const adminActions = read("src/lib/support-admin-actions.ts");
    expect(adminActions).toContain("adminReplyToSupportTicketRecord");
    expect(adminActions).toContain("updateSupportTicketTriage");
    expect(adminActions).toContain("updateSupportTicketStatus");
    expect(adminActions).toContain("adminRetrySupportEmailAction");
  });

  it("uses the required response label, timestamps, and delivery diagnostics", () => {
    const userThread = read("src/app/(app)/account/tickets/[ticketId]/page.tsx");
    const adminThread = read("src/app/(app)/admin/support/[ticketId]/page.tsx");
    const email = read("src/lib/support-email.ts");
    expect(userThread).toContain("Jump in the Mix Response");
    expect(userThread).toContain("formatDateTime(message.createdAt, displayPreferences)");
    expect(adminThread).toContain('message.authorType === "ADMIN" ? "Support"');
    expect(adminThread).toContain("emailStatus");
    expect(email).toContain("Ticket title");
    expect(email).toContain("View and reply to ticket");
    expect(email).toContain("/account/tickets/");
  });

  it("persists the administrator response before attempting email delivery", () => {
    const actions = read("src/lib/support-admin-actions.ts");
    const saveIndex = actions.indexOf("adminReplyToSupportTicketRecord");
    const emailIndex = actions.indexOf("deliverAdminReplyEmail", saveIndex);
    expect(saveIndex).toBeGreaterThan(-1);
    expect(emailIndex).toBeGreaterThan(saveIndex);
    expect(actions).toContain('status: "FAILED"');
    expect(actions).toContain('status: result.delivered ? "SENT" : "PREVIEWED"');
  });
});
