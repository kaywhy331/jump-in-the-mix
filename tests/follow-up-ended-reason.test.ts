import { describe, expect, it } from "vitest";
import { followUpEndedReason } from "../src/lib/display-labels";

describe("followUpEndedReason (TRU-10)", () => {
  it("says in a sentence why a follow-up ended, for every stored completion method", () => {
    const methods = ["done", "skipped", "outcome:completed", "outcome:skipped", "outcome:connected", "outcome:left_voicemail", "outcome:no_answer", "outcome:wrong_number", "outcome:rescheduled", "mix_stopped_for_contact", "mix_paused", "mix_archived", "contact_archived", "contact_merged", "do_not_contact", "reconciled", "workflow_held", "workflow_updated", "workflow_stopped", "journey_stage_changed", "invitation_accepted", "invitation_revoked", "appointment_held", "appointment_canceled", "appointment_unresolved", "appointment_no_show", "appointment_completed", "appointment_outcome_pending", "appointment_passed", "automatic:email", "automatic:sms", "automatic:whatsapp"];
    for (const method of methods) {
      const reason = followUpEndedReason(method);
      expect(reason, method).toMatch(/^[A-Z].*\.$/);
      expect(reason, method).not.toMatch(/_|:|\bmix\b|reconcil|workflow/);
    }
    expect(followUpEndedReason("mix_stopped_for_contact")).toBe("The Mix was stopped for this person.");
    expect(followUpEndedReason("automatic:email")).toBe("It was sent automatically by email.");
  });
  it("says nothing for a missing or unknown method, so the page keeps its plain notice", () => {
    expect(followUpEndedReason(null)).toBeNull();
    expect(followUpEndedReason("")).toBeNull();
    expect(followUpEndedReason("journey.stage.exit.unknown")).toBeNull();
  });
});
