import { describe, expect, it } from "vitest";
import { buildSupportReplyEmail } from "../src/lib/support-email";

describe("support reply email", () => {
  it("includes the ticket title, branded response label, readable structure, and direct ticket link", () => {
    const email = buildSupportReplyEmail({
      to: "customer@example.com",
      recipientName: "Jordan",
      ticketId: "ticket-123",
      reference: "JITM-ABC-1234",
      title: "Contact import is missing a label",
      responseBody: "Thank you for reporting this.\n\nPlease review the Contact import mapping and try the file again."
    });

    expect(email.subject).toContain("JITM-ABC-1234");
    expect(email.subject).toContain("Contact import is missing a label");
    expect(email.text).toContain("Jump in the Mix Response");
    expect(email.text).toContain("/account/tickets/ticket-123");
    expect(email.html).toContain("Jump in the Mix Support");
    expect(email.html).toContain("Jump in the Mix Response");
    expect(email.html).toContain("Ticket title");
    expect(email.html).toContain("View and reply to ticket");
    expect(email.html).toContain("<p");
  });

  it("escapes customer-controlled HTML and removes header line breaks", () => {
    const email = buildSupportReplyEmail({
      to: "customer@example.com",
      recipientName: "<Jordan>\r\nBcc: attacker@example.com",
      ticketId: "ticket/unsafe",
      reference: "JITM-<123>",
      title: "A <script>alert(1)</script>\r\nInjected title",
      responseBody: "Use <strong>this</strong> safely."
    });

    expect(email.subject).not.toContain("\r");
    expect(email.subject).not.toContain("\n");
    expect(email.html).not.toContain("<script>");
    expect(email.html).not.toContain("<strong>this</strong>");
    expect(email.html).toContain("&lt;script&gt;");
    expect(email.html).toContain("&lt;strong&gt;this&lt;/strong&gt;");
    expect(email.html).toContain("ticket%2Funsafe");
    expect(email.text).toContain("Use <strong>this</strong> safely.");
  });
});
