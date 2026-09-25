import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { CONTACT_REVISION_INCLUDE, STALE_CONTACT_SAVE, contactRevision } from "../src/lib/contact-revision";
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
    expect(saved.phones.map((item) => item.normalized)).toEqual(["5550100001"]);
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
    expect(kept.phones.map((item) => item.normalized).sort()).toEqual(["5550100002", "5550100098"]);
    expect(await prisma.auditLog.count({ where: { workspaceId, action: "contact.update", entityId: riley.id } })).toBe(0);
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
