import { describe, expect, it } from "vitest";
import { detachedChanges, draftFieldsForFamily, preparationFamilyForChannel, tokenLabel } from "./preparation-family";

describe("preparation families", () => {
  it("maps channels to families and keeps only a family's fields", () => {
    expect(["SMS", "WHATSAPP", "EMAIL", "PHONE_CALL", "VOICEMAIL"].map(preparationFamilyForChannel)).toEqual(["TEXT", "TEXT", "EMAIL", "CALL", "CALL"]);
    expect(draftFieldsForFamily("TEXT", { subject: "s", body: "b", script: "c" })).toEqual({ subject: null, body: "b", script: null });
    expect(draftFieldsForFamily("EMAIL", { subject: "s", body: "b", script: "c" })).toEqual({ subject: "s", body: "b", script: null });
    expect(draftFieldsForFamily("CALL", { subject: "s", body: "b", script: "c" })).toEqual({ subject: null, body: null, script: "c" });
  });

  it("names tokens in plain words", () => {
    expect(tokenLabel("{{First Name}}")).toBe("first name");
    expect(tokenLabel("{{contact.first_name}}")).toBe("first name");
    expect(tokenLabel("{{my.sms_signature}}")).toBe("sms signature");
    expect(tokenLabel("{{contact.custom.job_site}}")).toBe("job site");
  });

  it("reports only recorded details whose value has changed since removal", () => {
    const detached = { "{{First Name}}": "Alex", "{{Company}}": "Rivera Roofing" };
    expect(detachedChanges(detached, { "{{First Name}}": "Alex", "{{Company}}": "Rivera Roofing" })).toEqual([]);
    expect(detachedChanges(detached, { "{{First Name}}": "Alexandra", "{{Company}}": "Rivera Roofing" })).toEqual([
      { token: "{{First Name}}", label: "first name", before: "Alex", after: "Alexandra" }
    ]);
    expect(detachedChanges(detached, {})).toHaveLength(2);
    expect(detachedChanges(null, { "{{First Name}}": "x" })).toEqual([]);
  });
});
