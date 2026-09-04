import { describe, expect, it } from "vitest";
import { automaticDeliveryEligibleAt, automaticSmsConfigured, preparedDelivery } from "../src/lib/automatic-delivery";

describe("opt-in automatic delivery", () => {
  it("starts the review window no earlier than both schedule and preparation", () => {
    const scheduled = new Date("2026-09-04T10:00:00Z");
    const prepared = new Date("2026-09-04T10:20:00Z");
    expect(automaticDeliveryEligibleAt(scheduled, prepared, 30).toISOString()).toBe("2026-09-04T10:50:00.000Z");
    expect(automaticDeliveryEligibleAt(prepared, scheduled, 30).toISOString()).toBe("2026-09-04T10:50:00.000Z");
  });

  it("requires all Twilio credentials", () => {
    expect(automaticSmsConfigured({ twilioAccountSid: "sid", twilioAuthToken: "token", twilioFromNumber: "+15555550100" })).toBe(true);
    expect(automaticSmsConfigured({ twilioAccountSid: "sid", twilioAuthToken: "", twilioFromNumber: "+15555550100" })).toBe(false);
  });

  it("accepts only rendered email and text bodies", () => {
    expect(preparedDelivery({ subject: "Estimate", body: "Hi Jordan" }, "EMAIL")).toEqual({ subject: "Estimate", body: "Hi Jordan" });
    expect(preparedDelivery({ body: "Hi Jordan" }, "SMS")).toEqual({ subject: null, body: "Hi Jordan" });
    expect(preparedDelivery({ script: "Call Jordan" }, "PHONE_CALL")).toBeNull();
    expect(preparedDelivery({ body: " " }, "SMS")).toBeNull();
  });
});
