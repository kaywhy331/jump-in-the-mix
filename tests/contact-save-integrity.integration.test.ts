import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { CONTACT_REVISION_INCLUDE, STALE_CONTACT_SAVE, contactRevision } from "../src/lib/contact-revision";
import { runPhoneKeySweep } from "../src/lib/phone-canonicalization";
import { phoneLookupKeys } from "../src/lib/phone-number";
import { prisma } from "../src/lib/prisma";

const auth = vi.hoisted(() => ({ context: {} as Record<string, unknown> }));
vi.mock("@/lib/auth", () => ({ requireWorkspace: async () => auth.context }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`REDIRECT ${url}`); } }));
import { saveContactFormAction } from "../src/lib/contact-actions";
import { updateContactBasicsInlineAction, updateContactRelationshipStateAction } from "../src/lib/contact-state-actions";

const local = /^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? "");

function form(entries: Record<string, string | string[]>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) for (const item of Array.isArray(value) ? value : [value]) data.append(key, item);
  return data;
}

/** A save that succeeds redirects (thrown by the mock); one that is refused returns the form state. */
async function outcome(save: Promise<unknown>): Promise<string> {
  try { return JSON.stringify(await save); }
  catch (error) { return error instanceof Error ? error.message : String(error); }
}

describe.skipIf(!local)("contact edit and create integrity with PostgreSQL", () => {
  let workspaceId = "";
  let userId = "";

  beforeAll(async () => {
    const suffix = randomUUID();
    const owner = await prisma.user.create({ data: { email: `save-integrity-${suffix}@example.com`, name: "Integrity Owner", passwordHash: "test-only" } });
    const workspace = await prisma.workspace.create({ data: { name: "Contact save integrity", slug: `contact-save-integrity-${suffix}`, ownerId: owner.id, profile: { create: {} } } });
    await prisma.workspaceMember.create({ data: { workspaceId: workspace.id, userId: owner.id, role: "OWNER" } });
    workspaceId = workspace.id;
    userId = owner.id;
    auth.context = { user: owner, workspace, impersonation: null };
  });

  afterAll(async () => {
    if (!workspaceId) return;
    // Contact activity has no cascade from the workspace.
    await prisma.contactActivity.deleteMany({ where: { workspaceId } });
    await prisma.workspace.delete({ where: { id: workspaceId } });
    await prisma.user.deleteMany({ where: { id: userId } });
  });

  // Fixture phones are saved the way the previous release saved them (the format-based key), as rows
  // written before the phone-key change are; new writes store the canonical key.
  const person = (displayName: string, data: { company?: string; publicNotes?: string; phone?: string } = {}) => prisma.contact.create({
    data: {
      workspaceId,
      displayName,
      firstName: displayName.split(" ")[0],
      lastName: displayName.split(" ")[1] ?? null,
      company: data.company ?? null,
      publicNotes: data.publicNotes ?? null,
      ...(data.phone ? { phones: { create: { phone: data.phone, normalized: data.phone.replace(/\D/g, ""), label: "Mobile", isPrimary: true } } } : {})
    }
  });

  /** What the edit page loads and renders: the person as the form shows them and the fingerprint it carries. */
  async function openEditForm(contactId: string) {
    const contact = await prisma.contact.findUniqueOrThrow({ where: { id: contactId }, include: CONTACT_REVISION_INCLUDE });
    return { contact, revision: contactRevision(contact) };
  }

  /** The edit form's submission: every value it showed when opened, plus the owner's change. */
  function editSubmission(opened: Awaited<ReturnType<typeof openEditForm>>, changes: Record<string, string | string[]>): FormData {
    const { contact, revision } = opened;
    return form({
      contactId: contact.id,
      revision,
      firstName: contact.firstName ?? "",
      lastName: contact.lastName ?? "",
      company: contact.company ?? "",
      publicNotes: contact.publicNotes ?? "",
      privateNotes: contact.privateNotes ?? "",
      emailValue: contact.emails.map((item) => item.email),
      emailLabel: contact.emails.map((item) => item.label ?? ""),
      emailPrimaryIndex: String(Math.max(0, contact.emails.findIndex((item) => item.isPrimary))),
      phoneValue: contact.phones.map((item) => item.phone),
      phoneLabel: contact.phones.map((item) => item.label ?? ""),
      phonePrimaryIndex: String(Math.max(0, contact.phones.findIndex((item) => item.isPrimary))),
      groupIds: contact.groupMemberships.map((item) => item.groupId),
      ...changes
    });
  }

  it("does not refuse an open edit form after an inline save of the same company and notes or a relationship change", async () => {
    const casey = await person("Casey Inline", { company: "Acme Plumbing", publicNotes: "Gate code 12", phone: "(555) 010-0001" });
    const opened = await openEditForm(casey.id);

    // Another device re-saves the inline basics unchanged (this bumps updatedAt) and changes
    // the relationship state, which the edit form never shows or overwrites.
    await expect(updateContactBasicsInlineAction(form({ contactId: casey.id, company: "Acme Plumbing", publicNotes: "Gate code 12" }))).rejects.toThrow(`REDIRECT /contacts/${casey.id}?inlineUpdated=1`);
    await expect(updateContactRelationshipStateAction(form({ contactId: casey.id, version: "0", priority: "HIGH" }))).rejects.toThrow(`REDIRECT /contacts/${casey.id}?stateUpdated=1`);
    const touched = await prisma.contact.findUniqueOrThrow({ where: { id: casey.id } });
    expect(touched.updatedAt.getTime()).toBeGreaterThan(opened.contact.updatedAt.getTime());

    await expect(saveContactFormAction({}, editSubmission(opened, { lastName: "Inlined" }))).rejects.toThrow(`REDIRECT /contacts/${casey.id}?updated=1`);
    const saved = await prisma.contact.findUniqueOrThrow({ where: { id: casey.id }, include: { phones: true, relationshipState: true } });
    expect(saved).toMatchObject({ lastName: "Inlined", displayName: "Casey Inlined", company: "Acme Plumbing", publicNotes: "Gate code 12" });
    // The save rewrote the row's format-based key to the canonical key in place.
    expect(saved.phones.map((item) => item.normalized)).toEqual(["+15550100001"]);
    expect(saved.phones[0].id).toBe(opened.contact.phones[0].id);
    expect(saved.relationshipState).toMatchObject({ priority: "HIGH" });
  });

  it("refuses an open edit form after a phone was added on another device, and keeps that phone", async () => {
    const riley = await person("Riley Stale", { phone: "(555) 010-0002" });
    const opened = await openEditForm(riley.id);
    await expect(updateContactBasicsInlineAction(form({ contactId: riley.id, primaryPhone: "(555) 010-0098" }))).rejects.toThrow(`REDIRECT /contacts/${riley.id}?inlineUpdated=1`);

    const result = await saveContactFormAction({}, editSubmission(opened, { firstName: "Rylee" }));
    expect(result).toEqual({ error: STALE_CONTACT_SAVE });
    const kept = await prisma.contact.findUniqueOrThrow({ where: { id: riley.id }, include: { phones: true } });
    expect(kept.firstName).toBe("Riley");
    expect(kept.phones.map((item) => item.normalized).sort()).toEqual(["+15550100098", "5550100002"]);
    expect(await prisma.auditLog.count({ where: { workspaceId, action: "contact.update", entityId: riley.id } })).toBe(0);
  });

  it("does not refuse an open edit form after the phone-key sweep rewrote its keys", async () => {
    const quinn = await person("Quinn Swept", { phone: "(555) 010-0004" });
    await prisma.contactPhone.create({ data: { contactId: quinn.id, phone: "555-010-0005 x12", normalized: "555010000512", label: "Desk", isPrimary: false } });
    const opened = await openEditForm(quinn.id);
    const result = await runPhoneKeySweep({ workspaceId }, { shouldStop: () => false });
    expect(result.rewritten).toBeGreaterThanOrEqual(2);
    const swept = await openEditForm(quinn.id);
    expect(swept.contact.phones.map((item) => item.normalized).sort()).toEqual(["+15550100004", "+15550100005;ext=12"]);
    expect(swept.revision).toBe(opened.revision);
    await expect(saveContactFormAction({}, editSubmission(opened, { lastName: "Saved" }))).rejects.toThrow(`REDIRECT /contacts/${quinn.id}?updated=1`);
    const saved = await prisma.contact.findUniqueOrThrow({ where: { id: quinn.id }, include: { phones: true } });
    expect(saved.lastName).toBe("Saved");
    expect(saved.phones.map((item) => [item.phone, item.normalized, item.label]).sort()).toEqual([["(555) 010-0004", "+15550100004", "Mobile"], ["555-010-0005 x12", "+15550100005;ext=12", "Desk"]]);
  });

  it("looks up both keys: a number saved before the key change, and a swept one typed any way", async () => {
    const dana = await person("Dana Legacy", { phone: "(555) 010-0006" });
    await prisma.contact.create({ data: { workspaceId, displayName: "Eli Swept", firstName: "Eli", phones: { create: { phone: "(555) 010-0007", normalized: "+15550100007", isPrimary: true } } } });
    const conflict = (name: string) => `That phone already belongs to ${name}. Use Find duplicates if these are the same person.`;
    // A row that still holds its format-based key is found through that key (any punctuation, same digits)...
    expect(await saveContactFormAction({}, form({ firstName: "Copy", phoneValue: "555.010.0006" }))).toMatchObject({ error: conflict("Dana Legacy"), field: "phoneValue:0" });
    // ...and a swept row through its canonical key, however the number is typed.
    expect(await saveContactFormAction({}, form({ firstName: "Copy", phoneValue: ["555-010-0099", "1-555-010-0007"] }))).toMatchObject({ error: conflict("Eli Swept"), field: "phoneValue:1" });
    const frankie = await person("Frankie Inline");
    await expect(updateContactBasicsInlineAction(form({ contactId: frankie.id, primaryPhone: "555 010 0006" }))).rejects.toThrow(`REDIRECT /contacts/${frankie.id}?error=${encodeURIComponent("That phone already belongs to Dana Legacy. Use the duplicate center if these are the same person.")}`);
    // Until the sweep, another digit spelling of an unswept row is missed (as before this release); after it, found.
    const lookup = () => prisma.contactPhone.findFirst({ where: { normalized: { in: phoneLookupKeys("+1 555 010 0006", "US") }, contact: { workspaceId } }, select: { contactId: true } });
    expect(await lookup()).toBeNull();
    await runPhoneKeySweep({ workspaceId }, { shouldStop: () => false });
    expect(await lookup()).toEqual({ contactId: dana.id });
    expect(await saveContactFormAction({}, form({ firstName: "Copy", phoneValue: "+1 555 010 0006" }))).toMatchObject({ error: conflict("Dana Legacy") });
    // The owner's own number typed another way is the same row: the inline save updates it, never adds a second.
    await expect(updateContactBasicsInlineAction(form({ contactId: dana.id, primaryPhone: "+1 (555) 010-0006" }))).rejects.toThrow(`REDIRECT /contacts/${dana.id}?inlineUpdated=1`);
    const rows = await prisma.contactPhone.findMany({ where: { contactId: dana.id } });
    expect(rows.map((row) => [row.phone, row.normalized, row.isPrimary])).toEqual([["+1 (555) 010-0006", "+15550100006", true]]);
  });

  it("rewrites an unswept row's key in place when the inline primary phone names it", async () => {
    const gray = await person("Gray Inline", { phone: "(555) 010-0010" });
    const before = await prisma.contactPhone.findFirstOrThrow({ where: { contactId: gray.id } });
    await expect(updateContactBasicsInlineAction(form({ contactId: gray.id, primaryPhone: "555-010-0010" }))).rejects.toThrow(`REDIRECT /contacts/${gray.id}?inlineUpdated=1`);
    const after = await prisma.contactPhone.findMany({ where: { contactId: gray.id } });
    expect(after).toHaveLength(1);
    expect(after[0]).toMatchObject({ id: before.id, phone: "555-010-0010", normalized: "+15550100010", isPrimary: true });
  });

  it("saves one phone when an Add form holds the same number typed two ways", async () => {
    await expect(saveContactFormAction({}, form({ requestId: randomUUID(), firstName: "Gale", lastName: "Twofold", phoneValue: ["(555) 010-0008", "+1 555 010 0008"], phoneLabel: ["Mobile", "Cell"], phonePrimaryIndex: "1" }))).rejects.toThrow(/REDIRECT \/contacts\/[^/?]+\?created=1/);
    const gale = await prisma.contact.findFirstOrThrow({ where: { workspaceId, displayName: "Gale Twofold" }, include: { phones: true } });
    expect(gale.phones.map((row) => [row.phone, row.normalized, row.label, row.isPrimary])).toEqual([["(555) 010-0008", "+15550100008", "Mobile", true]]);
  });

  it("refuses an open edit form after an inline company change it would undo", async () => {
    const morgan = await person("Morgan Company", { company: "Old Co" });
    const opened = await openEditForm(morgan.id);
    await expect(updateContactBasicsInlineAction(form({ contactId: morgan.id, company: "New Co" }))).rejects.toThrow("REDIRECT");

    expect(await saveContactFormAction({}, editSubmission(opened, { lastName: "Changed" }))).toEqual({ error: STALE_CONTACT_SAVE });
    expect(await prisma.contact.findUniqueOrThrow({ where: { id: morgan.id } })).toMatchObject({ company: "New Co", lastName: "Company" });
  });

  it("still saves a form opened before fingerprints existed, as before this check", async () => {
    const avery = await person("Avery Older", { phone: "(555) 010-0003" });
    const opened = await openEditForm(avery.id);
    await expect(saveContactFormAction({}, editSubmission(opened, { revision: "", lastName: "Kept" }))).rejects.toThrow(`REDIRECT /contacts/${avery.id}?updated=1`);
    expect(await prisma.contact.findUniqueOrThrow({ where: { id: avery.id } })).toMatchObject({ lastName: "Kept", displayName: "Avery Kept" });
  });

  it("lets the first of two saves from one opened form win, one after the other or at the same moment", async () => {
    const taylor = await person("Taylor Twice");
    const opened = await openEditForm(taylor.id);
    await expect(saveContactFormAction({}, editSubmission(opened, { lastName: "One" }))).rejects.toThrow(`REDIRECT /contacts/${taylor.id}?updated=1`);
    expect(await saveContactFormAction({}, editSubmission(opened, { lastName: "Two" }))).toEqual({ error: STALE_CONTACT_SAVE });
    expect((await prisma.contact.findUniqueOrThrow({ where: { id: taylor.id } })).lastName).toBe("One");

    const reopened = await openEditForm(taylor.id);
    const results = await Promise.all([
      outcome(saveContactFormAction({}, editSubmission(reopened, { lastName: "Left" }))),
      outcome(saveContactFormAction({}, editSubmission(reopened, { lastName: "Right" })))
    ]);
    expect(results.filter((item) => item === `REDIRECT /contacts/${taylor.id}?updated=1`)).toHaveLength(1);
    expect(results.filter((item) => item === JSON.stringify({ error: STALE_CONTACT_SAVE }))).toHaveLength(1);
    const winner = results[0].startsWith("REDIRECT") ? "Left" : "Right";
    expect((await prisma.contact.findUniqueOrThrow({ where: { id: taylor.id } })).lastName).toBe(winner);
  });

  it("creates one contact per Add form even when the save is sent again", async () => {
    const requestId = randomUUID();
    const submission = () => form({ requestId, firstName: "Jordan", lastName: "Once", phoneValue: "(555) 010-0300", phoneLabel: "Mobile", phonePrimaryIndex: "0" });
    const first = await outcome(saveContactFormAction({}, submission()));
    expect(first).toMatch(/^REDIRECT \/contacts\/[^/?]+\?created=1$/);
    const contactId = first.slice("REDIRECT /contacts/".length).split("?")[0];

    // The retry after a lost response: same id, same entries. It must not stop at "that phone already belongs to Jordan".
    expect(await outcome(saveContactFormAction({}, submission()))).toBe(first);
    expect(await prisma.contact.count({ where: { workspaceId, displayName: "Jordan Once" } })).toBe(1);
    expect(await prisma.idempotencyKey.count({ where: { workspaceId, key: `contact-create:${userId}:${requestId}` } })).toBe(1);
    expect(await prisma.job.count({ where: { workspaceId, task: "generate-jumps", payload: { path: ["contactId"], equals: contactId } } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { workspaceId, action: "contact.create", entityId: contactId } })).toBe(1);
  });

  it("creates one contact when two submissions of one form arrive together, and replays the Journey return", async () => {
    const requestId = randomUUID();
    const submission = () => form({ requestId, firstName: "Avery", lastName: "Together", emailValue: "avery.together@example.com", returnTo: "/journey?mix=mix_sample&start=1" });
    const results = await Promise.all([outcome(saveContactFormAction({}, submission())), outcome(saveContactFormAction({}, submission()))]);
    const contacts = await prisma.contact.findMany({ where: { workspaceId, displayName: "Avery Together" }, select: { id: true } });
    expect(contacts).toHaveLength(1);
    expect(results).toEqual([`REDIRECT /journey?mix=mix_sample&start=1&contactId=${contacts[0].id}`, `REDIRECT /journey?mix=mix_sample&start=1&contactId=${contacts[0].id}`]);
  });

  it("still creates a new contact for each new Add form", async () => {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await expect(saveContactFormAction({}, form({ requestId: randomUUID(), firstName: "Sky", lastName: "Twice" }))).rejects.toThrow(/REDIRECT \/contacts\/[^/?]+\?created=1/);
    }
    await expect(saveContactFormAction({}, form({ firstName: "Sky", lastName: "Twice" }))).rejects.toThrow(/REDIRECT \/contacts\/[^/?]+\?created=1/);
    expect(await prisma.contact.count({ where: { workspaceId, displayName: "Sky Twice" } })).toBe(3);
  });
});
