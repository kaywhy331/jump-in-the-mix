import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseVcardDeviceContacts, parseVcfText } from "../src/lib/contact-file-parser";
import { quickAddSentence, type QuickAddResult } from "../src/lib/contact-quick-add";
import { deviceContactToImportRecord } from "../src/lib/device-contact";
import { iphoneContactsShortcutUrl, productionConfigurationIssues } from "../src/lib/env";

const read = (path: string) => readFileSync(path, "utf8");

// The shape an iPhone writes when a contact is shared from Contacts: vCard 3.0, grouped item lines,
// folded long lines and an inline photo.
const iphoneCard = [
  "BEGIN:VCARD",
  "VERSION:3.0",
  "PRODID:-//Apple Inc.//iPhone OS 18.0//EN",
  "N:Lee;Jordan;;;",
  "FN:Jordan Lee",
  "ORG:Lee Plumbing\\, Inc.;",
  "item1.EMAIL;type=INTERNET;type=pref:jordan@example.com",
  "item1.X-ABLabel:_$!<Work>!$_",
  "TEL;type=CELL;type=VOICE;type=pref:(555) 555-0123",
  "item2.ADR;type=HOME;type=pref:;;12 Main St;Springfield;IL;62701;United States",
  "NOTE:Met at the open house",
  "BDAY:1990-04-02",
  "PHOTO;ENCODING=b;TYPE=JPEG:/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEx",
  " Q8Hh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIy",
  "END:VCARD"
].join("\r\n");

describe("contact cards shared from a phone", () => {
  it("reads an iPhone card into the picker's shape, leaving out notes, dates and the photo", () => {
    const [contact] = parseVcardDeviceContacts(iphoneCard);
    expect(contact).toEqual({
      names: ["Jordan Lee"],
      company: "Lee Plumbing, Inc.",
      structuredName: { firstName: "Jordan", lastName: "Lee" },
      emails: ["jordan@example.com"],
      phones: ["(555) 555-0123"],
      addresses: [{ addressLines: ["12 Main St"], city: "Springfield", region: "IL", postalCode: "62701", country: "United States" }]
    });
    const record = deviceContactToImportRecord(contact, 0, "phone-share-test");
    expect(record).toMatchObject({ firstName: "Jordan", lastName: "Lee", displayName: "Jordan Lee", company: "Lee Plumbing, Inc.", publicNotes: null, jumpDates: [] });
  });

  it("reads every card in an exported list and drops empty ones", () => {
    const list = [
      iphoneCard,
      "BEGIN:VCARD\nVERSION:3.0\nN:;;;;\nFN:\nEND:VCARD",
      "BEGIN:VCARD\nVERSION:3.0\nN:Rivera;Sam;;;\nTEL:+1 555 555 0199\nEND:VCARD",
      "BEGIN:VCARD\nVERSION:3.0\nORG:Corner Hardware;\nEND:VCARD"
    ].join("\n");
    const contacts = parseVcardDeviceContacts(list);
    expect(contacts.map(contact => contact.names[0] ?? contact.company)).toEqual(["Jordan Lee", "Sam Rivera", "Corner Hardware"]);
    expect(parseVcardDeviceContacts("hello")).toEqual([]);
  });

  it("keeps the file import's columns unchanged", () => {
    const table = parseVcfText(iphoneCard, "jordan.vcf");
    expect(table.headers).toEqual(["First Name", "Last Name", "Display Name", "Company", "Email 1", "Phone 1", "Address 1", "Birthday", "Notes", "Email 1 Label", "Phone 1 Label", "Address 1 Label"]);
    expect(table.rows[0]).toMatchObject({ "Display Name": "Jordan Lee", Company: "Lee Plumbing, Inc.", "Address 1": "12 Main St, Springfield, IL, 62701, United States", Birthday: "1990-04-02", Notes: "Met at the open house" });
  });

  it("answers the shortcut in one plain sentence", () => {
    const item = (status: QuickAddResult["items"][number]["status"], matchKind: QuickAddResult["items"][number]["matchKind"] = "NONE") => ({ rowId: "r", displayName: "Jordan Lee", matchKind, status, message: "", existingContactName: null });
    const one = (status: QuickAddResult["items"][number]["status"], matchKind?: QuickAddResult["items"][number]["matchKind"]): QuickAddResult => ({ summary: { selected: 1, created: 0, merged: 0, reviewNeeded: 0, skipped: 0, failed: 0 }, items: [item(status, matchKind)] });
    expect(quickAddSentence(one("CREATED"))).toBe("Added Jordan Lee to Jump in the Mix.");
    expect(quickAddSentence(one("MERGED", "EXACT"))).toBe("Jordan Lee was already in Jump in the Mix. Any new details were added.");
    expect(quickAddSentence(one("SKIPPED", "AMBIGUOUS"))).toBe("Jordan Lee may already be in Jump in the Mix, so nothing changed. Check Contacts.");
    expect(quickAddSentence(one("FAILED"))).toBe("Jordan Lee couldn't be added. Add them in Jump in the Mix instead.");
    expect(quickAddSentence({ summary: { selected: 4, created: 2, merged: 1, reviewNeeded: 1, skipped: 1, failed: 0 }, items: [item("CREATED"), item("CREATED"), item("MERGED"), item("SKIPPED")] }))
      .toBe("Added 2 people. 1 person already saved; any new details were added. 1 person may already be saved, so nothing changed. Check Contacts.");
  });

  it("accepts only an iCloud shortcut link for the shortcut", () => {
    expect(iphoneContactsShortcutUrl("https://www.icloud.com/shortcuts/0f1e2d3c4b5a69788796a5b4c3d2e1f0")).toBe("https://www.icloud.com/shortcuts/0f1e2d3c4b5a69788796a5b4c3d2e1f0");
    expect(iphoneContactsShortcutUrl(" https://www.icloud.com/shortcuts/0f1e2d3c4b5a69788796a5b4c3d2e1f0 ")).toBe("https://www.icloud.com/shortcuts/0f1e2d3c4b5a69788796a5b4c3d2e1f0");
    for (const value of [undefined, "", "http://www.icloud.com/shortcuts/0f1e2d3c4b5a69788796a5b4c3d2e1f0", "https://evil.example/shortcuts/0f1e2d3c4b5a6978", "https://www.icloud.com/shortcuts/../x"]) {
      expect(iphoneContactsShortcutUrl(value)).toBe("");
    }
    const issue = "IPHONE_CONTACTS_SHORTCUT_URL must be the shortcut's https://www.icloud.com/shortcuts/ link";
    const base = { NODE_ENV: "production", PILOT_MODE: "true", APP_URL: "http://localhost:3000", DATABASE_URL: "postgres://x", DATA_ENCRYPTION_KEY: "k".repeat(32) } as NodeJS.ProcessEnv;
    expect(productionConfigurationIssues({ ...base, IPHONE_CONTACTS_SHORTCUT_URL: "https://example.com" })).toContain(issue);
    expect(productionConfigurationIssues({ ...base, IPHONE_CONTACTS_SHORTCUT_URL: "https://www.icloud.com/shortcuts/0f1e2d3c4b5a69788796a5b4c3d2e1f0" })).not.toContain(issue);
    expect(productionConfigurationIssues(base)).not.toContain(issue);
  });
});

describe("phone share boundaries", () => {
  it("authenticates the shortcut by key, outside the browser origin check, with bounded input", () => {
    const route = read("src/app/api/webhooks/phone-contacts/route.ts");
    // Only /api/webhooks/ skips the origin check (src/proxy.ts), and the shortcut sends no Origin.
    expect(read("src/proxy.ts")).toContain('pathname.startsWith("/api/webhooks/")');
    expect(route).toContain('request.headers.get("x-jitm-key")');
    expect(route).toContain("resolveContactShareKey(");
    expect(route).toContain("boundedRequestText(request, MAX_BODY_BYTES)");
    expect(route).toContain('scope: "phone-contacts.address"');
    expect(route).toContain('scope: "phone-contacts.key"');
    expect(route).toContain('source: "contacts.phone-share"');
    expect(route).not.toMatch(/console\.(log|error)\([^)]*body/);
    // The workspace comes from the key, never from the request.
    expect(route).not.toMatch(/workspaceId:\s*(body|request|url)/);
  });

  it("keeps only the key's hash and lets only the owner make or remove it", () => {
    const keys = read("src/lib/contact-share-keys.ts");
    const actions = read("src/lib/contact-share-key-actions.ts");
    expect(keys).toContain("hashConnectionToken(key)");
    expect(keys).not.toContain("tokenEncrypted");
    expect(keys).toContain("found.workspace.ownerId !== found.userId");
    expect(actions.startsWith('"use server";')).toBe(true);
    expect(actions).toContain("if (impersonation)");
    expect(actions).toContain("workspace.ownerId !== user.id");
  });

  it("offers the phone path on Add a contact, in the Contacts tools and from Import", () => {
    expect(read("src/app/(app)/contacts/new/page.tsx")).toContain('<DeviceContactQuickAdd placement="new-contact" />');
    expect(read("src/components/DeviceContactQuickAdd.tsx")).toContain('href="/contacts/from-phone"');
    expect(read("src/components/ContactImportWizardV2.tsx")).toContain('href="/contacts/from-phone"');
  });
});

describe("names and addresses on shared cards", () => {
  const record = (lines: string[]) => deviceContactToImportRecord(parseVcardDeviceContacts(["BEGIN:VCARD", "VERSION:3.0", ...lines, "END:VCARD"].join("\r\n"))[0], 0, "phone-share-names");

  it("takes first and last names from the card, not from splitting the full name", () => {
    expect(record(["N:Lee Jr.;Jordan;;Dr.;", "FN:Dr. Jordan Lee Jr.", "TEL:(555) 555-0101"])).toMatchObject({ firstName: "Jordan", lastName: "Lee Jr.", displayName: "Dr. Jordan Lee Jr." });
    expect(record(["N:Smith;Mary Ann;;;", "FN:Mary Ann Smith", "TEL:(555) 555-0102"])).toMatchObject({ firstName: "Mary Ann", lastName: "Smith" });
  });

  it("gives a company card no first name and names it after the company", () => {
    expect(record(["N:;;;;", "FN:Acme Roofing", "ORG:Acme Roofing;", "X-ABShowAs:COMPANY", "TEL:(555) 555-0103"])).toMatchObject({ firstName: null, lastName: null, displayName: "Acme Roofing", company: "Acme Roofing" });
    expect(record(["N:;;;;", "ORG:Corner Hardware;"])).toMatchObject({ firstName: null, displayName: "Corner Hardware" });
  });

  it("splits a two-line street into address lines", () => {
    expect(record(["FN:Sam Rivera", "N:Rivera;Sam;;;", "ADR;type=HOME:;;12 Main St\\nApt 4;Springfield;IL;62701;"]).addresses[0]).toMatchObject({ street1: "12 Main St", street2: "Apt 4", city: "Springfield" });
  });
});
