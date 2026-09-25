import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import type { ImportContactRecord } from "../src/lib/contact-import-types";
import { prisma } from "../src/lib/prisma";

const auth = vi.hoisted(() => ({ context: {} as Record<string, unknown> }));
vi.mock("@/lib/auth", () => ({ requireWorkspace: async () => auth.context }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`REDIRECT ${url}`); } }));

import { updatePhoneRegionFormAction } from "../src/lib/account-preference-actions";
import { collapseImportPhones, commitContactImportBatch, findImportMatches } from "../src/lib/contact-import-service";
import { mergeContactsAction } from "../src/lib/contact-merge-actions";
import { PHONE_KEYS_TASK, PhoneSweepInterruptedError, countPhonesReadAgain, planContactPhoneKeys, runPhoneKeySweep } from "../src/lib/phone-canonicalization";
import { canonicalPhoneKey } from "../src/lib/phone-number";
import { searchQuickCaptureContacts } from "../src/lib/quick-capture";

// Committed transactions and row locks: never against a hosted or shared business database.
const local = /^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? "");
// A sweep across every workspace rewrites other suites' rows, so it runs only in an isolated database (npm run test:isolated).
const isolated = /\/jitm_design_isolated_/.test(process.env.DATABASE_URL ?? "");
const running = { shouldStop: () => false };

type PhoneSeed = { phone: string; normalized: string; label?: string | null; isPrimary?: boolean; createdAt?: Date };

const users: string[] = [];
const workspaces: string[] = [];

async function business(phoneRegion?: string) {
  const suffix = randomUUID();
  const owner = await prisma.user.create({ data: { email: `phone-keys-${suffix}@example.com`, name: "Phone key owner", passwordHash: "test-only" } });
  const workspace = await prisma.workspace.create({ data: { name: "Phone keys", slug: `phone-keys-${suffix}`, ownerId: owner.id, profile: { create: {} } } });
  await prisma.workspaceMember.create({ data: { workspaceId: workspace.id, userId: owner.id, role: "OWNER" } });
  if (phoneRegion) await prisma.workspacePreference.create({ data: { workspaceId: workspace.id, phoneRegion } });
  users.push(owner.id);
  workspaces.push(workspace.id);
  return { owner, workspace };
}

function at(minutes: number): Date {
  return new Date(Date.UTC(2026, 0, 1, 12, minutes));
}

async function contactWith(workspaceId: string, displayName: string, phones: PhoneSeed[]) {
  const contact = await prisma.contact.create({ data: { workspaceId, displayName, firstName: displayName.split(" ")[0] } });
  for (const phone of phones) await prisma.contactPhone.create({ data: { contactId: contact.id, phone: phone.phone, normalized: phone.normalized, label: phone.label ?? null, isPrimary: phone.isPrimary ?? false, ...(phone.createdAt ? { createdAt: phone.createdAt } : {}) } });
  return contact;
}

async function phonesOf(contactId: string) {
  return (await prisma.contactPhone.findMany({ where: { contactId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] })).map((row) => ({ phone: row.phone, normalized: row.normalized, label: row.label, isPrimary: row.isPrimary }));
}

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.set(key, value);
  return data;
}

function importRecord(rowId: string, phones: string[], name = "Imported Person"): ImportContactRecord {
  return {
    rowId, sourceRow: 1, source: "CSV", firstName: name.split(" ")[0], lastName: name.split(" ")[1] ?? null, displayName: name, company: null, publicNotes: null,
    emails: [], phones: phones.map((value, index) => ({ value, label: index ? "Other" : null, isPrimary: index === 0 })),
    addresses: [], groupIds: [], customFields: [], jumpDates: []
  };
}

afterAll(async () => {
  for (const id of workspaces) {
    await prisma.contactActivity.deleteMany({ where: { workspaceId: id } });
    await prisma.workspace.deleteMany({ where: { id } });
  }
  await prisma.user.deleteMany({ where: { id: { in: users } } });
});

describe("the sweep's plan for one contact", () => {
  const row = (id: string, phone: string, normalized: string, extra: Partial<{ label: string | null; isPrimary: boolean; minute: number }> = {}) =>
    ({ id, phone, normalized, label: extra.label ?? null, isPrimary: extra.isPrimary ?? false, createdAt: at(extra.minute ?? 0) });

  it("changes nothing for rows that already hold their canonical keys", () => {
    expect(planContactPhoneKeys([row("a", "(555) 100-0001", "+15551000001", { isPrimary: true }), row("b", "555-1000", "5551000")], "US")).toEqual({ deletes: [], updates: [] });
  });

  it("keeps the primary row of a collapsing group, the first non-empty label, and the other rows' keys", () => {
    const rows = [
      row("old", "(555) 100-0002", "5551000002", { label: "Mobile", minute: 1 }),
      row("primary", "+1 555 100 0002", "+15551000002", { isPrimary: true, minute: 2 }),
      row("third", "1-555-100-0002", "15551000002", { label: "Work", minute: 3 }),
      row("desk", "555-100-0002 x7", "55510000027", { minute: 4 })
    ];
    const plan = planContactPhoneKeys(rows, "US");
    expect(plan.deletes.map((item) => item.id)).toEqual(["old", "third"]);
    expect(plan.updates.map(({ previous, ...item }) => ({ ...item, from: previous.normalized }))).toEqual([
      { id: "primary", normalized: "+15551000002", label: "Mobile", isPrimary: true, from: "+15551000002" },
      { id: "desk", normalized: "+15551000002;ext=7", label: null, isPrimary: false, from: "55510000027" }
    ]);
  });

  it("keeps the oldest row when no colliding row is primary, and leaves exactly one primary", () => {
    const plan = planContactPhoneKeys([row("new", "555.100.0003", "5551000003", { label: "Home", minute: 5 }), row("old", "+1 (555) 100-0003", "+15551000003", { label: " ", minute: 1 })], "US");
    expect(plan.deletes.map((item) => item.id)).toEqual(["new"]);
    expect(plan.updates.map(({ previous: _previous, ...item }) => item)).toEqual([{ id: "old", normalized: "+15551000003", label: "Home", isPrimary: true }]);
  });
});

describe.skipIf(!local)("phone keys with PostgreSQL", () => {
  it("rewrites every key from the untouched display value, once", async () => {
    const { workspace } = await business();
    const person = await contactWith(workspace.id, "Rae Rewrite", [
      { phone: "(555) 201-0001", normalized: "5552010001", label: "Mobile", isPrimary: true },
      { phone: "555-201-0002 x12", normalized: "555201000212", label: "Desk" },
      { phone: "555-1234", normalized: "5551234" },
      { phone: "+44 20 7946 0958", normalized: "+442079460958" },
      { phone: "ask at the front desk", normalized: "5552010003" }
    ]);
    expect(await runPhoneKeySweep({ workspaceId: workspace.id }, running)).toEqual({ scanned: 5, rewritten: 2, merged: 0 });
    expect((await phonesOf(person.id)).map((item) => [item.phone, item.normalized])).toEqual([
      ["(555) 201-0001", "+15552010001"],
      ["555-201-0002 x12", "+15552010002;ext=12"],
      ["555-1234", "5551234"],
      ["+44 20 7946 0958", "+442079460958"],
      ["ask at the front desk", "5552010003"]
    ]);
    expect(await runPhoneKeySweep({ workspaceId: workspace.id }, running)).toEqual({ scanned: 5, rewritten: 0, merged: 0 });
  });

  it("merges one contact's rows that collapse onto one key and keeps other people's rows apart", async () => {
    const { workspace } = await business();
    const withPrimary = await contactWith(workspace.id, "Pat Primary", [
      { phone: "(555) 202-0001", normalized: "5552020001", label: "Mobile", createdAt: at(1) },
      { phone: "+1 555 202 0001", normalized: "+15552020001", isPrimary: true, createdAt: at(2) },
      { phone: "1-555-202-0001", normalized: "15552020001", label: "Work", createdAt: at(3) },
      { phone: "(555) 202-0009", normalized: "5552020009", createdAt: at(4) }
    ]);
    const withoutPrimary = await contactWith(workspace.id, "Nat Noprimary", [
      { phone: "(555) 203-0001", normalized: "5552030001", label: "", createdAt: at(1) },
      { phone: "1 555 203 0001", normalized: "15552030001", label: "Home", createdAt: at(2) },
      { phone: "(555) 203-0002", normalized: "5552030002", createdAt: at(3) }
    ]);
    const desks = await contactWith(workspace.id, "Dee Desks", [
      { phone: "555-204-0001 x1", normalized: "55520400011", isPrimary: true },
      { phone: "555-204-0001 x2", normalized: "55520400012" }
    ]);
    const sameNumberElsewhere = await contactWith(workspace.id, "Sam Samenumber", [{ phone: "555.202.0001", normalized: "5552020001", isPrimary: true }]);
    const result = await runPhoneKeySweep({ workspaceId: workspace.id }, running);
    expect(result).toMatchObject({ scanned: 10, merged: 3 });
    expect(await phonesOf(withPrimary.id)).toEqual([
      { phone: "+1 555 202 0001", normalized: "+15552020001", label: "Mobile", isPrimary: true },
      { phone: "(555) 202-0009", normalized: "+15552020009", label: null, isPrimary: false }
    ]);
    expect(await phonesOf(withoutPrimary.id)).toEqual([
      { phone: "(555) 203-0001", normalized: "+15552030001", label: "Home", isPrimary: true },
      { phone: "(555) 203-0002", normalized: "+15552030002", label: null, isPrimary: false }
    ]);
    expect((await phonesOf(desks.id)).map((item) => item.normalized)).toEqual(["+15552040001;ext=1", "+15552040001;ext=2"]);
    expect(await phonesOf(sameNumberElsewhere.id)).toEqual([{ phone: "555.202.0001", normalized: "+15552020001", label: null, isPrimary: true }]);
    expect(await runPhoneKeySweep({ workspaceId: workspace.id }, running)).toMatchObject({ rewritten: 0, merged: 0 });
  });

  it("rewrites two keys a contact's rows hold for each other", async () => {
    const { workspace } = await business();
    const swapped = await contactWith(workspace.id, "Swap Keys", [
      { phone: "(555) 205-0001", normalized: "+15552050002", isPrimary: true },
      { phone: "(555) 205-0002", normalized: "+15552050001" }
    ]);
    expect(await runPhoneKeySweep({ workspaceId: workspace.id }, running)).toMatchObject({ rewritten: 2, merged: 0 });
    expect((await phonesOf(swapped.id)).map((item) => [item.phone, item.normalized])).toEqual([["(555) 205-0001", "+15552050001"], ["(555) 205-0002", "+15552050002"]]);
  });

  it("reads each workspace in its own region and touches only the named workspace", async () => {
    const us = await business();
    const uk = await business("GB");
    const usPerson = await contactWith(us.workspace.id, "Una States", [{ phone: "07911 123456", normalized: "07911123456", isPrimary: true }]);
    const ukPerson = await contactWith(uk.workspace.id, "Kit Kingdom", [{ phone: "07911 123456", normalized: "07911123456", isPrimary: true }, { phone: "0114 496 0000", normalized: "01144960000" }]);
    await runPhoneKeySweep({ workspaceId: us.workspace.id }, running);
    expect((await phonesOf(usPerson.id)).map((item) => item.normalized)).toEqual(["07911123456"]);
    expect((await phonesOf(ukPerson.id)).map((item) => item.normalized)).toEqual(["07911123456", "01144960000"]);
    await runPhoneKeySweep({ workspaceId: uk.workspace.id }, running);
    expect((await phonesOf(ukPerson.id)).map((item) => item.normalized)).toEqual(["+447911123456", "+441144960000"]);
  });

  it("stops between contacts when the worker asks, and the next run finishes the work", async () => {
    const { workspace } = await business();
    const people = [];
    for (let index = 0; index < 3; index += 1) people.push(await contactWith(workspace.id, `Stop ${index}`, [{ phone: `(555) 206-000${index}`, normalized: `555206000${index}`, isPrimary: true }]));
    let checks = 0;
    // The first check opens the page, the second lets the first contact through, the third asks to stop.
    await expect(runPhoneKeySweep({ workspaceId: workspace.id }, { shouldStop: () => ++checks > 2 })).rejects.toBeInstanceOf(PhoneSweepInterruptedError);
    const keys = async () => (await prisma.contactPhone.findMany({ where: { contact: { workspaceId: workspace.id } }, select: { normalized: true } })).map((row) => row.normalized);
    expect((await keys()).filter((key) => key.startsWith("+"))).toHaveLength(1);
    expect(await runPhoneKeySweep({ workspaceId: workspace.id }, running)).toMatchObject({ rewritten: 2, merged: 0 });
    expect((await keys()).sort()).toEqual(["+15552060000", "+15552060001", "+15552060002"]);
  });

  it("counts the saved numbers a region change reads again, never those saved with a country code", async () => {
    const { workspace } = await business();
    await contactWith(workspace.id, "Count Me", [
      { phone: "(555) 207-0001", normalized: "+15552070001", isPrimary: true },
      { phone: "+1 555 207 0002", normalized: "+15552070002" },
      { phone: "+44 7911 123456", normalized: "+447911123456" }
    ]);
    expect(await countPhonesReadAgain(workspace.id, "US", "US")).toBe(0);
    expect(await countPhonesReadAgain(workspace.id, "US", "GB")).toBe(1);
    expect(await countPhonesReadAgain(workspace.id, "US", "CA")).toBe(0);
  });

  it("lets the owner change the region, which records it and queues this workspace's sweep", async () => {
    const { owner, workspace } = await business();
    const person = await contactWith(workspace.id, "Region Change", [{ phone: "07911 123456", normalized: "07911123456", isPrimary: true }]);
    auth.context = { user: owner, workspace, impersonation: null };
    await expect(updatePhoneRegionFormAction({}, form({ phoneRegion: "GB" }))).rejects.toThrow("REDIRECT /account/preferences?phoneRegionSaved=1#phone-region");
    expect(await prisma.workspacePreference.findUniqueOrThrow({ where: { workspaceId: workspace.id } })).toMatchObject({ phoneRegion: "GB" });
    const job = await prisma.job.findFirstOrThrow({ where: { workspaceId: workspace.id, task: PHONE_KEYS_TASK } });
    expect(job).toMatchObject({ task: "canonicalize-phones", payload: { workspaceId: workspace.id }, completedAt: null, failedAt: null });
    expect(job.updatedAt).toBeInstanceOf(Date);
    expect(await prisma.auditLog.findFirstOrThrow({ where: { workspaceId: workspace.id, action: "workspace.phone-region.update" } })).toMatchObject({
      actorUserId: owner.id, entityType: "WorkspacePreference", beforeData: { phoneRegion: "US" }, afterData: { phoneRegion: "GB" }, metadata: { numbersReadAgain: 1 }
    });
    await runPhoneKeySweep(job.payload as { workspaceId: string }, running);
    expect((await phonesOf(person.id)).map((item) => item.normalized)).toEqual(["+447911123456"]);

    // Saving the same country again queues nothing more.
    await expect(updatePhoneRegionFormAction({}, form({ phoneRegion: "GB" }))).rejects.toThrow("REDIRECT /account/preferences?phoneRegionSaved=1#phone-region");
    expect(await prisma.job.count({ where: { workspaceId: workspace.id, task: PHONE_KEYS_TASK } })).toBe(1);
  });

  it("refuses a region change from a support view, from someone other than the owner, or to an unlisted code", async () => {
    const { owner, workspace } = await business();
    auth.context = { user: owner, workspace, impersonation: { id: "support-view" } };
    expect(await updatePhoneRegionFormAction({}, form({ phoneRegion: "GB" }))).toEqual({ error: "Workspace settings are unavailable during a view-only support session." });
    auth.context = { user: { ...owner, id: "someone-else" }, workspace, impersonation: null };
    expect(await updatePhoneRegionFormAction({}, form({ phoneRegion: "GB" }))).toEqual({ error: "Only the account owner can change the country for phone numbers." });
    auth.context = { user: owner, workspace, impersonation: null };
    for (const phoneRegion of ["XX", "", "GBR"]) expect(await updatePhoneRegionFormAction({}, form({ phoneRegion }))).toEqual({ error: "Choose one of the listed countries." });
    expect(await prisma.workspacePreference.count({ where: { workspaceId: workspace.id } })).toBe(0);
    expect(await prisma.job.count({ where: { workspaceId: workspace.id, task: PHONE_KEYS_TASK } })).toBe(0);
  });

  it("imports one number typed two ways as one phone, and matches saved numbers under either key", async () => {
    const { owner, workspace } = await business();
    const saved = await contactWith(workspace.id, "Saved Canonical", [{ phone: "(555) 208-0001", normalized: "+15552080001", isPrimary: true }]);
    const legacy = await contactWith(workspace.id, "Saved Legacy", [{ phone: "(555) 208-0002", normalized: "5552080002", label: "Mobile", isPrimary: true }]);
    const records = [importRecord("row-canonical", ["555.208.0001"]), importRecord("row-legacy", ["+1 555 208 0002"]), importRecord("row-twice", ["(555) 208-0003", "+1 555 208 0003"], "Twice Typed")];
    const { matches } = await findImportMatches(workspace.id, records);
    expect(matches.map((match) => [match.rowId, match.kind, match.candidates[0]?.contactId ?? null])).toEqual([["row-canonical", "EXACT", saved.id], ["row-legacy", "EXACT", legacy.id], ["row-twice", "NONE", null]]);
    expect(collapseImportPhones(records[2], "US").phones).toEqual([{ value: "(555) 208-0003", label: "Other", isPrimary: true }]);
    // A value repeated exactly is still refused, as before.
    expect(collapseImportPhones(importRecord("row-same", ["555-208-0004", "(555) 208-0004"]), "US").phones).toHaveLength(2);

    const results = await commitContactImportBatch({
      workspaceId: workspace.id, actorUserId: owner.id, timezone: "UTC", importId: `phone-keys-${randomUUID()}`,
      items: [
        { record: records[1], resolution: { rowId: "row-legacy", action: "MERGE", targetContactId: legacy.id } },
        { record: records[2], resolution: { rowId: "row-twice", action: "CREATE", targetContactId: null } },
        { record: importRecord("row-same", ["555-208-0004", "555.208.0004"]), resolution: { rowId: "row-same", action: "CREATE", targetContactId: null } }
      ]
    });
    expect(results.map((item) => [item.rowId, item.status])).toEqual([["row-legacy", "MERGED"], ["row-twice", "CREATED"], ["row-same", "FAILED"]]);
    expect(results[2].message).toBe("One import row contains the same phone more than once.");
    // The merge found the row saved under its old key and rewrote the key in place instead of adding a second row.
    expect(await phonesOf(legacy.id)).toEqual([{ phone: "(555) 208-0002", normalized: "+15552080002", label: "Mobile", isPrimary: true }]);
    expect(await phonesOf(results[1].contactId!)).toEqual([{ phone: "(555) 208-0003", normalized: "+15552080003", label: "Other", isPrimary: true }]);
  });

  it("merges two people without copying a number the survivor already has under another key", async () => {
    const { owner, workspace } = await business();
    const survivor = await contactWith(workspace.id, "Keep Me", [{ phone: "(555) 209-0001", normalized: "5552090001", isPrimary: true }]);
    const source = await contactWith(workspace.id, "Merge Me", [{ phone: "+1 555 209 0001", normalized: "+15552090001", isPrimary: true }, { phone: "(555) 209-0002", normalized: "5552090002" }]);
    auth.context = { user: owner, workspace, impersonation: null };
    await expect(mergeContactsAction(form({ survivorContactId: survivor.id, sourceContactId: source.id, confirmation: "Merge Me" }))).rejects.toThrow(`REDIRECT /contacts/${survivor.id}?merged=1`);
    expect((await phonesOf(survivor.id)).map((item) => [item.phone, item.normalized])).toEqual([["(555) 209-0001", "5552090001"], ["(555) 209-0002", "+15552090002"]]);
    const record = await prisma.contactMergeRecord.findFirstOrThrow({ where: { survivorContactId: survivor.id } });
    expect(record.mergeSummary).toMatchObject({ copiedPhones: 1 });
  });

  it("finds a Quick Add match by a national number in the workspace's region", async () => {
    const { workspace } = await business("GB");
    const person = await contactWith(workspace.id, "Quick Find", [{ phone: "+44 7911 123456", normalized: canonicalPhoneKey("+44 7911 123456", "GB"), isPrimary: true }]);
    expect((await searchQuickCaptureContacts(workspace.id, "07911 123456")).map((item) => item.id)).toEqual([person.id]);
    expect((await searchQuickCaptureContacts(workspace.id, "07911 654321")).map((item) => item.id)).toEqual([]);
  });

  it.runIf(isolated)("sweeps every workspace, each in its own region, when no workspace is named", async () => {
    const us = await business();
    const uk = await business("GB");
    const usPerson = await contactWith(us.workspace.id, "All Us", [{ phone: "(555) 210-0001", normalized: "5552100001", isPrimary: true }]);
    const ukPerson = await contactWith(uk.workspace.id, "All Uk", [{ phone: "07911 123457", normalized: "07911123457", isPrimary: true }]);
    await runPhoneKeySweep({}, running);
    expect((await phonesOf(usPerson.id)).map((item) => item.normalized)).toEqual(["+15552100001"]);
    expect((await phonesOf(ukPerson.id)).map((item) => item.normalized)).toEqual(["+447911123457"]);
    expect(await runPhoneKeySweep({}, running)).toMatchObject({ rewritten: 0, merged: 0 });
  });
});
