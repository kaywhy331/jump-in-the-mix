import { describe, expect, it } from "vitest";
import { automaticSendingLine, followUpHandoffUrl } from "@/components/EditableFollowUpAction";

const body = "Hi Alex, your estimate is ready.";
const encoded = encodeURIComponent(body);

describe("followUpHandoffUrl", () => {
  // The dial target is computed on the server from the stored canonical key (phone-number.ts), so
  // these calls pass what Today's server render passes: the display value and its dial target.
  it("dials the server's E.164 target however the owner typed the number", () => {
    expect(followUpHandoffUrl("SMS", null, "(555) 234-5678", "+15552345678", "", body)).toBe(`sms:+15552345678?&body=${encoded}`);
    expect(followUpHandoffUrl("PHONE_CALL", null, "555.234.5678 x12", "+15552345678", "", body)).toBe("tel:+15552345678");
    expect(followUpHandoffUrl("VOICEMAIL", null, "+1 555 234 5678", "+15552345678", "", body)).toBe("tel:+15552345678");
    expect(followUpHandoffUrl("WHATSAPP", null, "1-555-234-5678", "+15552345678", "", body)).toBe(`https://wa.me/15552345678?text=${encoded}`);
  });

  it("keeps an international number, including one read in the workspace's region", () => {
    expect(followUpHandoffUrl("SMS", null, "+44 20 7946 0958", "+442079460958", "", body)).toBe(`sms:+442079460958?&body=${encoded}`);
    expect(followUpHandoffUrl("WHATSAPP", null, "+61 412 345 678", "+61412345678", "", body)).toBe(`https://wa.me/61412345678?text=${encoded}`);
    expect(followUpHandoffUrl("SMS", null, "07911 123456", "+447911123456", "", body)).toBe(`sms:+447911123456?&body=${encoded}`);
  });

  it("never passes the typed display value, never guesses a country, and offers WhatsApp only with a full number", () => {
    expect(followUpHandoffUrl("SMS", null, "0412 345 678", null, "", body)).toBe(`sms:0412345678?&body=${encoded}`);
    expect(followUpHandoffUrl("PHONE_CALL", null, "020 7946 0958", null, "", body)).toBe("tel:02079460958");
    expect(followUpHandoffUrl("PHONE_CALL", null, "555-1234 x9", null, "", body)).toBe("tel:5551234");
    expect(followUpHandoffUrl("WHATSAPP", null, "0412 345 678", null, "", body)).toBeNull();
    expect(followUpHandoffUrl("SMS", null, "call me", null, "", body)).toBeNull();
    expect(followUpHandoffUrl("SMS", null, null, null, "", body)).toBeNull();
  });

  it("builds mail links from the address and needs one", () => {
    expect(followUpHandoffUrl("EMAIL", "alex@example.com", "(555) 234-5678", "+15552345678", "Your estimate", body)).toBe(`mailto:alex@example.com?subject=${encodeURIComponent("Your estimate")}&body=${encoded}`);
    expect(followUpHandoffUrl("EMAIL", null, "(555) 234-5678", "+15552345678", "Your estimate", body)).toBeNull();
  });
});

describe("automaticSendingLine", () => {
  it("names the computed time when it is known", () => {
    expect(automaticSendingLine("Sep 24, 10:00 AM", false)).toEqual({ state: "scheduled", text: "Sends automatically at Sep 24, 10:00 AM unless you send, snooze or skip it first." });
  });

  it("says the next pass sends it once the time has passed", () => {
    expect(automaticSendingLine("Sep 24, 10:00 AM", true)).toEqual({ state: "now", text: "Sends automatically any minute now unless you send, snooze or skip it first." });
  });

  it("keeps the fixed wording when no time could be computed", () => {
    expect(automaticSendingLine(null, false)).toEqual({ state: "window", text: "Automatic sending is on: this sends by itself after your review window unless you send, snooze or skip it first." });
    expect(automaticSendingLine(undefined, false).state).toBe("window");
  });
});
