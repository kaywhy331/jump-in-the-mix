import { describe, expect, it } from "vitest";
import { AUTO_HIDE_LIMIT, cleanPublicName, cleanReviewNote, listingFacts, MARKETPLACE_REVIEW_NOTE_MAX, reasonHides, reportHidesAtOnce, REVIEW_REQUEST_REFUSALS, reviewReplyOutcome, reviewRequestBlock, shareWarnings, textWarnings } from "@/lib/marketplace";
import type { PortablePackage } from "@/lib/mix-portable";

const pack = (body: string, extra: Partial<PortablePackage["mixes"][number]["steps"][number]> = {}): PortablePackage => ({
  format: "jump-in-the-mix", version: 1, kind: "mix", name: "Estimate follow-up", description: null, rules: [], waitingBeats: [], finishes: [],
  mixes: [{ key: "m1", name: "Estimate follow-up", description: null, category: null, industry: null, framework: null, triggerMode: "MANUAL_START", dateType: null,
    steps: [{ key: "b1", name: "Check in", channel: "SMS", dayOffset: 0, sendTimeMinutes: null, anchor: "CALENDAR_DAY", offsetMinutes: null, subject: null, body, script: null, longSms: false, includeOptOut: false, variants: [], ...extra }] }]
});

const connection = (rule: Partial<PortablePackage["rules"][number]> = {}, route: Partial<PortablePackage["rules"][number]["routes"][number]> = {}): PortablePackage["rules"][number] => ({
  key: "c1", name: "After the estimate", enabled: true, mode: "PARALLEL", source: { mix: "m1", beat: null }, join: null,
  routes: [{ key: "r1", label: "Wants to go ahead", when: "OUTCOME", outcome: "Yes", delayMinutes: 0, target: null, maxVisits: null, replace: false, ...route }], ...rule
});
const megaPack = (...rules: PortablePackage["rules"]): PortablePackage => ({ ...pack("Hi {{First Name}}"), kind: "mega-mix", rules });

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

  it("checks connection names, path labels and outcomes, which every public outline prints", () => {
    const label = "Called Maria Gonzalez back, 555-201-4477 — wants June";
    expect(shareWarnings(megaPack(connection({}, { label })))).toEqual([expect.objectContaining({ kind: "phone", text: "555-201-4477", where: `Path: After the estimate · ${label}` })]);
    expect(shareWarnings(megaPack(connection({ name: "Send to dan@example.org" })))).toEqual([expect.objectContaining({ kind: "email", text: "dan@example.org", where: "Path: Send to dan@example.org" })]);
    expect(shareWarnings(megaPack(connection({}, { outcome: "Thanks Maria" })))).toEqual([expect.objectContaining({ kind: "name", text: "Maria" })]);
    expect(shareWarnings(megaPack(connection()))).toEqual([]);
  });

  it("checks the Mix facts that travel in the file too", () => {
    const value = pack("Hi {{First Name}}");
    value.mixes[0].industry = "Plumbing · www.example.com";
    value.mixes[0].dateType = { name: "Maria's birthday", slug: "birthday" };
    expect(shareWarnings(value)).toEqual([expect.objectContaining({ kind: "link", text: "www.example.com", where: "Estimate follow-up" })]);
  });

  it("does not mistake dates, times or prices for phone numbers", () => {
    expect(shareWarnings(pack("See you on 2026-09-24 at 10:30. The estimate is $12,500."))).toEqual([]);
  });

  it("hides automatically only for private information, from a verified account under its daily limit", () => {
    expect(reasonHides("PRIVATE_INFO")).toBe(true);
    expect(["OFFENSIVE", "SPAM", "MISLEADING", "COPYRIGHT", "OTHER"].some(reasonHides)).toBe(false);
    expect(AUTO_HIDE_LIMIT).toEqual({ count: 2, windowMs: 86_400_000 });
    expect(reportHidesAtOnce({ reason: "PRIVATE_INFO", reporterEmailVerified: true, recentAutoHides: 0 })).toBe(true);
    expect(reportHidesAtOnce({ reason: "PRIVATE_INFO", reporterEmailVerified: true, recentAutoHides: AUTO_HIDE_LIMIT.count - 1 })).toBe(true);
    expect(reportHidesAtOnce({ reason: "PRIVATE_INFO", reporterEmailVerified: true, recentAutoHides: AUTO_HIDE_LIMIT.count })).toBe(false);
    expect(reportHidesAtOnce({ reason: "PRIVATE_INFO", reporterEmailVerified: false, recentAutoHides: 0 })).toBe(false);
    expect(reportHidesAtOnce({ reason: "SPAM", reporterEmailVerified: true, recentAutoHides: 0 })).toBe(false);
    expect(reportHidesAtOnce({ reason: "OFFENSIVE", reporterEmailVerified: true, recentAutoHides: 0 })).toBe(false);
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

describe("asking for another review", () => {
  it("scans one piece of text the way the share check does", () => {
    expect(textWarnings("Hi Maria, call (555) 123-4567, write to maria@example.com or see www.example.com", "Note").map(item => item.kind)).toEqual(["email", "phone", "link", "name"]);
    expect(textWarnings("Hi {{First Name}}, see you on 2026-09-24 at 10:30 for the $12,500 job.", "Note")).toEqual([]);
  });

  it("keeps the note optional, one paragraph and at most 500 characters", () => {
    expect(cleanReviewNote(undefined)).toBeNull();
    expect(cleanReviewNote("   \n ")).toBeNull();
    expect(cleanReviewNote("  I replaced the name\n\nin Beat 2   with {{First Name}}. ")).toBe("I replaced the name in Beat 2 with {{First Name}}.");
    expect(cleanReviewNote("x".repeat(900))).toHaveLength(MARKETPLACE_REVIEW_NOTE_MAX);
    // A greeting is not contact information; the share's own wording is what staff judge.
    expect(cleanReviewNote("Thanks Maria for the tip, I removed her number.")).toBe("Thanks Maria for the tip, I removed her number.");
  });

  it("refuses a note that carries an email address, a phone number or a link", () => {
    for (const note of ["Write to me at rivera@example.com", "Call 555 201 4477 to discuss", "See https://example.com/proof", "Details at rivera-renovations.com"]) {
      expect(() => cleanReviewNote(note), note).toThrow("Leave email addresses, phone numbers and links out of the note. Our team can already read your share.");
    }
  });

  const hidden = { status: "HIDDEN", requestedAt: null, openReports: 0, available: true, fingerprint: "new", reviewedFingerprint: "old" };
  it("allows a request only for a hidden, decided, changed share with something to show and none waiting", () => {
    expect(reviewRequestBlock(hidden)).toBeNull();
    expect(reviewRequestBlock({ ...hidden, status: "LIVE" })).toBe("not-hidden");
    expect(reviewRequestBlock({ ...hidden, status: "UNSHARED" })).toBe("not-hidden");
    expect(reviewRequestBlock({ ...hidden, requestedAt: new Date() })).toBe("pending");
    expect(reviewRequestBlock({ ...hidden, openReports: 1 })).toBe("open-report");
    expect(reviewRequestBlock({ ...hidden, available: false })).toBe("unavailable");
    expect(reviewRequestBlock({ ...hidden, fingerprint: "old" })).toBe("unchanged");
    // A share hidden before decisions recorded their wording gets one request without a change.
    expect(reviewRequestBlock({ ...hidden, fingerprint: "old", reviewedFingerprint: null })).toBeNull();
    for (const reason of ["not-hidden", "pending", "open-report", "unavailable", "unchanged"] as const) expect(REVIEW_REQUEST_REFUSALS[reason]).toMatch(/^[A-Z].*\.$/);
  });

  it("says where a share stands after a staff reply", () => {
    expect(reviewReplyOutcome("LIVE")).toBe("It’s shared on the Marketplace.");
    expect(reviewReplyOutcome("HIDDEN")).toBe("It stays hidden.");
    expect(reviewReplyOutcome("UNSHARED")).toBe("It isn’t hidden any more, and it isn’t shared right now.");
  });
});
