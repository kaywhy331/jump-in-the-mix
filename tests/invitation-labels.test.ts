import { describe, expect, it } from "vitest";
import { invitationPromptDismissed, withInvitationPromptDismissed } from "../src/lib/invitation-labels";

// The cookie behind a dismissed invitation prompt lists browser scopes, so one account's dismissal never hides another's.
describe("the invitation prompt's dismissal cookie", () => {
  it("lists the accounts that dismissed it, the latest three", () => {
    expect(withInvitationPromptDismissed(undefined, "a")).toBe("a");
    expect(withInvitationPromptDismissed("a.b", "a")).toBe("b.a");
    expect(withInvitationPromptDismissed("a.b.c", "d")).toBe("b.c.d");
  });

  it("matches whole scopes only", () => {
    expect(invitationPromptDismissed("b.a", "a")).toBe(true);
    expect(invitationPromptDismissed("ab.c", "a")).toBe(false);
    expect(invitationPromptDismissed(undefined, "a")).toBe(false);
    expect(invitationPromptDismissed("a", null)).toBe(false);
  });
});
