import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "../src/lib/prisma";
import { saveQuickCapture, searchQuickCaptureContacts } from "../src/lib/quick-capture";
import type { QuickCaptureInput } from "../src/lib/quick-capture-input";
import { runAutomaticDeliveries } from "../src/lib/automatic-delivery";

const local = /^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? "");
describe.skipIf(!local).sequential("Reviewed Quick Add transaction", () => {
  let workspaceId: string, userId: string, otherWorkspace: string;
  const context = () => ({ workspaceId, actorUserId: userId, timezone: "America/Los_Angeles" });
  const capture = (): QuickCaptureInput => ({ requestId: randomUUID(), person: { mode: "new", name: `Jordan ${randomUUID()}`, phone: "", email: "", allowDuplicate: false }, note: "Discuss revised proposal", event: { title: "Coffee with Jordan", startsAt: "2027-02-04T09:00", endsAt: "2027-02-04T10:00", location: "Blue Door", allowOverlap: false }, followUp: { reason: "Review proposal", when: "2027-02-05T10:00", channel: "PHONE_CALL", subject: "", wording: "Ask about the revised proposal." } });
  beforeAll(async () => {
    userId = (await prisma.user.create({ data: { email: `capture-${randomUUID()}@example.test`, name: "Capture fixture", passwordHash: "fixture-only" } })).id;
    workspaceId = (await prisma.workspace.create({ data: { ownerId: userId, slug: randomUUID(), name: "Capture", profile: { create: {} } } })).id;
    otherWorkspace = (await prisma.workspace.create({ data: { ownerId: userId, slug: randomUUID(), name: "Other" } })).id;
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    if (workspaceId) { await prisma.contactActivity.deleteMany({ where: { workspaceId } }); await prisma.workspace.deleteMany({ where: { id: { in: [workspaceId, otherWorkspace] } } }); }
    if (userId) { await prisma.userPreference.deleteMany({ where: { userId } }); await prisma.user.deleteMany({ where: { id: userId } }); }
  });
  it("saves all four items once, including simultaneous retries and local event time", async () => {
    const input = capture();
    const [first, second] = await Promise.all([saveQuickCapture(context(), input), saveQuickCapture(context(), input)]);
    expect(second).toEqual(first); expect(first.createdPerson).toBe(true);
    expect(first.eventId && first.jumpId && first.noteId).toBeTruthy();
    const event = await prisma.calendarEntry.findUniqueOrThrow({ where: { id: first.eventId! } });
    expect(event.startsAt.toISOString()).toBe("2027-02-04T17:00:00.000Z");
    expect(event.contactId).toBe(first.contactId);
    const note = await prisma.contactActivity.findUniqueOrThrow({ where: { id: first.noteId! } });
    expect(note.visibility).toBe("PRIVATE"); expect(note.summary).toBe(input.note);
    const jump = await prisma.jump.findUniqueOrThrow({ where: { id: first.jumpId! } });
    expect(jump).toMatchObject({ status: "PENDING", contactId: first.contactId, manualOnly: true });
    expect(await prisma.jump.count({ where: { contactId: first.contactId } })).toBe(1);
    await expect(saveQuickCapture(context(), { ...input, note: "Changed after save" })).rejects.toMatchObject({ message: "Your earlier capture was saved. Later edits have not been applied.", receipt: first });
  });
  it("rolls back person, note, journey and retry receipt when the event conflicts", async () => {
    const input = capture();
    await expect(saveQuickCapture(context(), input)).rejects.toThrow(/overlap|conflict|already|busy/i);
    expect(await prisma.contact.count({ where: { workspaceId, displayName: input.person.mode === "new" ? input.person.name : "" } })).toBe(0);
    expect(await prisma.idempotencyKey.count({ where: { workspaceId, key: { endsWith: input.requestId } } })).toBe(0);
    input.event!.allowOverlap = true;
    expect((await saveQuickCapture(context(), input)).eventId).toBeTruthy();
  });
  it("never returns another workspace or actor's saved receipt for the same request ID", async () => {
    const input = capture(); input.event = null; input.followUp = null;
    const first = await saveQuickCapture(context(), input);
    const other = await saveQuickCapture({ ...context(), workspaceId: otherWorkspace }, { ...input, note: "Other workspace" });
    expect(other.contactId).not.toBe(first.contactId);
    const actor = await prisma.user.create({ data: { email: `other-actor-${randomUUID()}@example.test`, name: "Other actor", passwordHash: "fixture-only" } });
    try {
      const result = await saveQuickCapture({ ...context(), actorUserId: actor.id }, { ...input, person: { mode: "new", name: `Other actor ${randomUUID()}`, phone: "", email: "", allowDuplicate: false }, note: "Other actor" });
      expect(result.contactId).not.toBe(first.contactId);
    } finally {
      await prisma.contactActivity.deleteMany({ where: { actorUserId: actor.id } });
      await prisma.user.delete({ where: { id: actor.id } });
    }
  });
  it("requires an explicit match and never overwrites an existing person's details", async () => {
    const person = await prisma.contact.create({ data: { workspaceId, displayName: "Existing Avery", emails: { create: { email: "avery@example.test", normalized: "avery@example.test", isPrimary: true } } } });
    const input = capture(); input.event = null; input.followUp = null;
    input.person = { mode: "new", name: "Other name", email: "AVERY@example.test", phone: "", allowDuplicate: false };
    await expect(saveQuickCapture(context(), input)).rejects.toMatchObject({ contacts: [expect.objectContaining({ id: person.id })] });
    input.person = { mode: "existing", id: person.id };
    const result = await saveQuickCapture(context(), input);
    expect(result).toMatchObject({ contactId: person.id, createdPerson: false, eventId: null, jumpId: null });
    expect((await prisma.contact.findUniqueOrThrow({ where: { id: person.id } })).displayName).toBe("Existing Avery");
  });
  it("supports explicit different people with the same name", async () => {
    const input = capture(); input.event = null; input.followUp = null;
    input.person = { mode: "new", name: "Existing Avery", email: "", phone: "", allowDuplicate: true };
    expect((await saveQuickCapture(context(), input)).createdPerson).toBe(true);
  });
  it("keeps contact search and selection inside the authenticated workspace", async () => {
    const foreign = await prisma.contact.create({ data: { workspaceId: otherWorkspace, displayName: "Foreign person" } });
    expect(await searchQuickCaptureContacts(workspaceId, "Foreign")).toEqual([]);
    const input = capture(); input.person = { mode: "existing", id: foreign.id };
    await expect(saveQuickCapture(context(), input)).rejects.toThrow("available person");
    expect((await searchQuickCaptureContacts(workspaceId, "Existing Avery")).length).toBe(2);
  });
  it("rolls back a note and calendar event if outreach is blocked", async () => {
    const person = await prisma.contact.create({ data: { workspaceId, displayName: "Do not contact", relationshipState: { create: { workspaceId, doNotContact: true } } } });
    const input = capture(); input.person = { mode: "existing", id: person.id }; input.event!.allowOverlap = true;
    await expect(saveQuickCapture(context(), input)).rejects.toThrow("Do-not-contact");
    expect(await prisma.calendarEntry.count({ where: { contactId: person.id } })).toBe(0);
    expect(await prisma.contactActivity.count({ where: { contactId: person.id } })).toBe(0);
    input.followUp = null;
    expect((await saveQuickCapture(context(), input)).eventId).toBeTruthy();
  });
  it("rejects impossible local times and incomplete email drafts without partial records", async () => {
    const input = capture(); input.event!.startsAt = "2027-03-14T02:30"; input.event!.endsAt = "2027-03-14T03:30";
    await expect(saveQuickCapture(context(), input)).rejects.toThrow("does not exist");
    input.event = null; input.followUp!.channel = "EMAIL";
    await expect(saveQuickCapture(context(), input)).rejects.toThrow("email subject");
  });
  it("never enters automatic delivery even when the workspace enables it", async () => {
    const input = capture(); input.event = null;
    input.person = { mode: "new", name: "Manual email", email: "manual@example.test", phone: "", allowDuplicate: false };
    input.followUp = { reason: "Check in", when: "2026-01-01T10:00", channel: "EMAIL", subject: "Hello", wording: "Would you like to catch up?" };
    const receipt = await saveQuickCapture(context(), input);
    await prisma.automationPreference.create({ data: { workspaceId, enabled: true, emailEnabled: true, reviewWindowMinutes: 30 } });
    const preferences = await prisma.automationPreference.findMany({ where: { workspaceId } });
    vi.spyOn(prisma.automationPreference, "findMany").mockResolvedValueOnce(preferences);
    const fetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("No network delivery allowed in this test"));
    try {
      const result = await runAutomaticDeliveries("quick-capture-fixture", new Date("2027-01-02T18:00:00Z"));
      expect(result).toEqual({ attempted: 0, delivered: 0, failed: 0 });
      expect(fetch).not.toHaveBeenCalled();
      expect((await prisma.jump.findUniqueOrThrow({ where: { id: receipt.jumpId! } })).status).toBe("PENDING");
    } finally { vi.restoreAllMocks(); }
  });
});
