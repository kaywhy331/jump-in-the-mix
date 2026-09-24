import { describe, expect, it } from "vitest";
import { cleanPublicName, listingFacts, reasonHides, shareWarnings } from "@/lib/marketplace";
import type { PortablePackage } from "@/lib/mix-portable";

const pack = (body: string, extra: Partial<PortablePackage["mixes"][number]["steps"][number]> = {}): PortablePackage => ({
  format: "jump-in-the-mix", version: 1, kind: "mix", name: "Estimate follow-up", description: null, rules: [], waitingBeats: [], finishes: [],
  mixes: [{ key: "m1", name: "Estimate follow-up", description: null, category: null, industry: null, framework: null, triggerMode: "MANUAL_START", dateType: null,
    steps: [{ key: "b1", name: "Check in", channel: "SMS", dayOffset: 0, sendTimeMinutes: null, anchor: "CALENDAR_DAY", offsetMinutes: null, subject: null, body, script: null, longSms: false, includeOptOut: false, variants: [], ...extra }] }]
});

describe("Marketplace sharing checks", () => {
  it("passes ordinary wording that uses merge fields", () => {
    expect(shareWarnings(pack("Hi {{First Name}}, thanks again for having us out. Any questions? {{SMS Signature}}"))).toEqual([]);
    expect(shareWarnings(pack("Hi there, just checking in. Thanks everyone!"))).toEqual([]);
  });

  it("flags emails, phone numbers, links and greetings that name a person", () => {
    const warnings = shareWarnings(pack("Hi Maria, call me on (555) 123-4567 or write to maria.lopez@example.com. Photos at www.example.com/jobs"));
    expect(warnings.map(item => item.kind).sort()).toEqual(["email", "link", "name", "phone"]);
    expect(warnings.find(item => item.kind === "name")).toMatchObject({ text: "Maria", where: "Estimate follow-up · Check in" });
  });

  it("checks channel versions too", () => {
    const value = pack("Hi {{First Name}}", { variants: [{ family: "EMAIL", subject: "Hello", body: "Reach Dan at dan@example.org", script: null }] });
    expect(shareWarnings(value)).toEqual([expect.objectContaining({ kind: "email", text: "dan@example.org" })]);
  });

  it("does not mistake dates, times or prices for phone numbers", () => {
    expect(shareWarnings(pack("See you on 2026-09-24 at 10:30. The estimate is $12,500."))).toEqual([]);
  });

  it("hides automatically only for serious reasons", () => {
    expect(["PRIVATE_INFO", "OFFENSIVE", "SPAM"].every(reasonHides)).toBe(true);
    expect(["MISLEADING", "COPYRIGHT", "OTHER"].some(reasonHides)).toBe(false);
  });

  it("keeps public names free of contact details", () => {
    expect(cleanPublicName("  Rivera   Renovations ")).toBe("Rivera Renovations");
    expect(() => cleanPublicName("kevin@example.com")).toThrow(/not an email/);
    expect(() => cleanPublicName("Call 555 123 4567")).toThrow(/not an email/);
    expect(() => cleanPublicName(" ")).toThrow(/Choose the name/);
  });

  it("summarizes channels and size for the directory", () => {
    expect(listingFacts(pack("Hi"))).toEqual({ title: "Estimate follow-up", mixCount: 1, beatCount: 1, channels: ["TEXT"] });
  });
});
