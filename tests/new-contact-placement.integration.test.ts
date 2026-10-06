import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
const session = vi.hoisted(() => ({ context: {} }));
vi.mock("@/lib/auth", () => ({ requireWorkspace: async () => session.context }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));
import { prisma } from "../src/lib/prisma";
import { saveMixAction } from "../src/lib/mix-editor-actions";
import { placeNewContacts } from "../src/lib/new-contact-placement";
import { saveQuickCapture } from "../src/lib/quick-capture";
import { saveNewContactPlacementAction } from "../src/lib/new-contact-actions";
import { receiveIntake } from "../src/lib/intake";
import { createConnectionToken } from "../src/lib/connection-tokens";
import { commitContactImportBatch } from "../src/lib/contact-import-service";
import { applyJourneyEvent } from "../src/lib/journey";
import { UserFacingError } from "../src/lib/user-facing-error";

const local = /^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? "");
describe.skipIf(!local).sequential("where new people go (JITM-09 §2.78)", () => {
  const suffix = randomUUID().replaceAll("-", "").slice(0, 8);
  let userId = "", workspaceId = "", otherWorkspaceId = "";
  const minute = 60_000;

  async function mix(name: string, data: Record<string, unknown> = {}, workspace = workspaceId) {
    const created = await prisma.mix.create({ data: { workspaceId: workspace, name, status: "ACTIVE", triggerMode: "MANUAL_START", ...data } });
    const template = await prisma.stepTemplate.create({ data: { workspaceId: workspace, name: `${name} beat`, channel: "SMS", versions: { create: { version: 1, body: "Checking in" } } }, include: { versions: true } });
    await prisma.mixStep.create({ data: { mixId: created.id, stepVersionId: template.versions[0].id, dayOffset: 0, sortOrder: 1 } });
    return created;
  }
  const person = async (name: string) => (await prisma.contact.create({ data: { workspaceId, displayName: `${name} ${suffix}` } })).id;
  const assignmentsOf = (contactId: string) => prisma.mixAssignment.findMany({ where: { contactId, isActive: true }, select: { mixId: true, startDate: true, mode: true, assignmentKey: true } });
  const form = (fields: Record<string, string>) => {
    const data = new FormData();
    for (const [key, value] of Object.entries({ status: "ACTIVE", triggerMode: "MANUAL_START", dayOffset: "0", mixStepId: "", sendTimeMinutes: "", plannedAt: "", anchor: "CALENDAR_DAY", offsetMinutes: "", "inlineName-0": "Check in", "inlineChannel-0": "PHONE_CALL", "inlineScript-0": "Ask how it went.", activationConfirmed: "1", ...fields })) data.set(key, value);
    return data;
  };

  beforeAll(async () => {
    const user = await prisma.user.create({ data: { email: `placement-${suffix}@example.test`, name: "Placement fixture", passwordHash: "fixture-only" } }); userId = user.id;
    const workspace = await prisma.workspace.create({ data: { ownerId: userId, slug: `placement-${suffix}`, name: "Placement fixture", profile: { create: {} } }, include: { profile: true } }); workspaceId = workspace.id;
    otherWorkspaceId = (await prisma.workspace.create({ data: { ownerId: userId, slug: `placement-other-${suffix}`, name: "Placement other", profile: { create: {} } } })).id;
    session.context = { session: { authUser: user }, user, workspace, impersonation: null };
  });
  afterAll(async () => {
    if (workspaceId) await prisma.workspace.deleteMany({ where: { id: { in: [workspaceId, otherWorkspaceId] } } });
    if (userId) { await prisma.userPreference.deleteMany({ where: { userId } }); await prisma.user.deleteMany({ where: { id: userId } }); }
  });

  describe("Everyone includes people added later", () => {
    it("remembers Everyone when the Mix is saved, and forgets it when it is unticked", async () => {
      await person("Existing");
      await expect(saveMixAction(form({ name: `Welcome ${suffix}`, assignAllContacts: "on" }))).rejects.toThrow(/redirect:\/mixes\/[^/]+\/edit\?created=manual/);
      const saved = await prisma.mix.findFirstOrThrow({ where: { workspaceId, name: `Welcome ${suffix}` } });
      expect(saved.audienceEveryone).toBe(true);
      const edit = form({ name: `Welcome ${suffix}`, mixId: saved.id, openedAt: saved.updatedAt.toISOString() });
      edit.set("mixStepId", (await prisma.mixStep.findFirstOrThrow({ where: { mixId: saved.id, isActive: true } })).id);
      await expect(saveMixAction(edit)).rejects.toThrow(/redirect:\/mixes\/[^/]+\/edit\?updated=manual/);
      expect((await prisma.mix.findUniqueOrThrow({ where: { id: saved.id } })).audienceEveryone).toBe(false);
      await prisma.mix.delete({ where: { id: saved.id } });
    });

    it("starts each active Everyone Mix for a newcomer from the moment they were added", async () => {
      const now = new Date();
      const welcome = await mix("Everyone welcome", { audienceEveryone: true });
      const tagged = await mix("Tag only");
      const draft = await mix("Everyone draft", { audienceEveryone: true, status: "DRAFT" });
      const paused = await mix("Everyone paused", { audienceEveryone: true, status: "PAUSED" });
      const elsewhere = await mix("Other account", { audienceEveryone: true }, otherWorkspaceId);
      const newcomer = await person("Newcomer");
      const jobsBefore = await prisma.job.count({ where: { workspaceId, task: "generate-jumps" } });
      await prisma.$transaction(tx => placeNewContacts(tx, { workspaceId, contactIds: [newcomer], now }));
      const assignments = await assignmentsOf(newcomer);
      expect(assignments).toEqual([{ mixId: welcome.id, startDate: now, mode: "DYNAMIC", assignmentKey: `${workspaceId}:${welcome.id}:audience:${newcomer}` }]);
      expect([tagged.id, draft.id, paused.id, elsewhere.id].some(id => assignments.some(item => item.mixId === id))).toBe(false);
      expect(await prisma.job.count({ where: { workspaceId, task: "generate-jumps" } })).toBe(jobsBefore + 1);
      // Placing them again changes nothing.
      await prisma.$transaction(tx => placeNewContacts(tx, { workspaceId, contactIds: [newcomer], now }));
      expect(await assignmentsOf(newcomer)).toHaveLength(1);
      await prisma.mix.update({ where: { id: welcome.id }, data: { status: "PAUSED" } });
    });

    it("leaves out a broadcast that has already gone out, so nobody gets it late", async () => {
      const now = new Date();
      const past = await mix("Spring note", { audienceEveryone: true, triggerMode: "BROADCAST" });
      const future = await mix("Holiday note", { audienceEveryone: true, triggerMode: "BROADCAST" });
      const at = (date: Date) => ({ localDate: new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())), timeMinutes: date.getUTCHours() * 60 + date.getUTCMinutes(), timezone: "UTC" });
      await prisma.mixBroadcastSchedule.create({ data: { workspaceId, mixId: past.id, ...at(new Date(now.getTime() - 10 * minute)) } });
      await prisma.mixBroadcastSchedule.create({ data: { workspaceId, mixId: future.id, ...at(new Date(now.getTime() + 3 * 86_400_000)) } });
      const newcomer = await person("Late joiner");
      await prisma.$transaction(tx => placeNewContacts(tx, { workspaceId, contactIds: [newcomer], now }));
      expect((await assignmentsOf(newcomer)).map(item => [item.mixId, item.startDate])).toEqual([[future.id, null]]);
      await prisma.mix.updateMany({ where: { id: { in: [past.id, future.id] } }, data: { status: "PAUSED" } });
    });

    it("adds people from Quick Add, as from every other way people arrive", async () => {
      const welcome = await mix("Quick welcome", { audienceEveryone: true });
      const receipt = await saveQuickCapture({ workspaceId, actorUserId: userId, timezone: "UTC" }, { requestId: randomUUID(), person: { mode: "new", name: `Quick ${suffix}`, phone: "", email: "", allowDuplicate: true }, note: null, event: null, followUp: null });
      expect((await assignmentsOf(receipt.contactId)).map(item => item.mixId)).toEqual([welcome.id]);
      await prisma.mix.update({ where: { id: welcome.id }, data: { status: "PAUSED" } });
    });
  });

  describe("the New contacts setting", () => {
    let defaultMix = { id: "", name: "" };
    let otherMix = { id: "", name: "" };
    const setting = (fields: Record<string, string>) => { const data = new FormData(); for (const [key, value] of Object.entries(fields)) data.set(key, value); return saveNewContactPlacementAction(data); };
    const directStart = (contactId: string, mixId: string) => prisma.mixAssignment.findUnique({ where: { assignmentKey: `${workspaceId}:${mixId}:${contactId}` }, select: { isActive: true, startDate: true } });
    const place = (contactIds: string[], options: { mixId?: string | null; chosenByOwner?: boolean } = {}) => prisma.$transaction(tx => placeNewContacts(tx, { workspaceId, contactIds, timezone: "UTC", ...options }));

    beforeAll(async () => {
      defaultMix = await mix("New lead welcome");
      otherMix = await mix("Referral thanks");
    });

    it("saves a chosen Mix only when it starts when the owner starts it", async () => {
      await expect(setting({ placement: "MIX" })).rejects.toThrow(/redirect:\/settings\/new-contacts\?.*error/);
      const dated = await mix("Birthday", { triggerMode: "DATE_TRIGGERED" });
      await expect(setting({ placement: "MIX", mixId: dated.id })).rejects.toThrow(/redirect:\/settings\/new-contacts\?.*error/);
      await expect(setting({ placement: "ASK", mixId: defaultMix.id })).rejects.toThrow("redirect:/settings/new-contacts?saved=1");
      expect(await prisma.workspacePreference.findUnique({ where: { workspaceId }, select: { newContactPlacement: true, newContactMixId: true } })).toEqual({ newContactPlacement: "ASK", newContactMixId: null });
      await expect(setting({ placement: "MIX", mixId: defaultMix.id })).rejects.toThrow("redirect:/settings/new-contacts?saved=1");
      expect(await prisma.workspacePreference.findUnique({ where: { workspaceId }, select: { newContactPlacement: true, newContactMixId: true } })).toEqual({ newContactPlacement: "MIX", newContactMixId: defaultMix.id });
    });

    it("starts the chosen Mix from today, and an owner's own choice wins over the setting", async () => {
      const [followed, none, own] = await Promise.all([person("Followed"), person("None"), person("Own choice")]);
      const placed = await place([followed]);
      expect(placed).toMatchObject({ mix: { id: defaultMix.id }, started: [followed], skipped: [] });
      expect(await directStart(followed, defaultMix.id)).toMatchObject({ isActive: true });
      expect(await prisma.auditLog.findFirst({ where: { workspaceId, action: "mix.assignment.activate", metadata: { path: ["contactId"], equals: followed } }, select: { actorType: true } })).toEqual({ actorType: "SYSTEM" });
      await place([none], { mixId: null });
      expect(await directStart(none, defaultMix.id)).toBeNull();
      await place([own], { mixId: otherMix.id, chosenByOwner: true });
      expect(await directStart(own, otherMix.id)).toMatchObject({ isActive: true });
      expect(await directStart(own, defaultMix.id)).toBeNull();
    });

    it("leaves people out when the setting asks or leaves them out", async () => {
      const asked = await person("Asked");
      await prisma.workspacePreference.update({ where: { workspaceId }, data: { newContactPlacement: "ASK" } });
      expect((await place([asked])).mix).toBeNull();
      await prisma.workspacePreference.update({ where: { workspaceId }, data: { newContactPlacement: "NONE" } });
      expect((await place([asked])).mix).toBeNull();
      expect(await directStart(asked, defaultMix.id)).toBeNull();
      await prisma.workspacePreference.update({ where: { workspaceId }, data: { newContactPlacement: "MIX" } });
    });

    it("isn't added on top of the Mix a Contact stage starts", async () => {
      const stageMix = await mix("Stage welcome");
      await prisma.journeyPreference.create({ data: { workspaceId } });
      const stage = await prisma.journeyStage.create({ data: { workspaceId, name: `Lead ${suffix}`, position: 0, planId: stageMix.id } });
      try {
        const lead = await person("Staged");
        await prisma.$transaction(tx => applyJourneyEvent(tx, { workspaceId, contactId: lead, eventKey: `contact-created:${lead}`, eventType: "CONTACT_RECEIVED", source: "Test" }));
        expect(await directStart(lead, stageMix.id)).toMatchObject({ isActive: true });
        expect(await place([lead])).toMatchObject({ started: [], skipped: [lead] });
        expect(await directStart(lead, defaultMix.id)).toBeNull();
      } finally {
        await prisma.journeyPreference.delete({ where: { workspaceId } });
        await prisma.contactJourney.deleteMany({ where: { workspaceId } });
        await prisma.journeyEvent.deleteMany({ where: { workspaceId } });
        await prisma.journeyStage.delete({ where: { id: stage.id } });
      }
    });

    it("skips someone who can't start it, unless the owner chose it just now", async () => {
      const restricted = await person("Restricted");
      await prisma.contactRelationshipState.create({ data: { workspaceId, contactId: restricted, doNotContact: true } });
      expect(await place([restricted])).toMatchObject({ started: [], skipped: [restricted] });
      await expect(place([restricted], { mixId: defaultMix.id, chosenByOwner: true })).rejects.toBeInstanceOf(UserFacingError);
      const off = await mix("Turned off", { status: "PAUSED" });
      await expect(place([await person("Off")], { mixId: off.id, chosenByOwner: true })).rejects.toThrow("Choose a Mix that is on");
    });

    it("lets each lead connection follow the setting, choose its own Mix, or start none", async () => {
      const connection = await prisma.intakeConnection.create({ data: { workspaceId, name: "Website", kind: "HOSTED_FORM", ...createConnectionToken() } });
      const send = async (email: string) => (await receiveIntake(connection.id, { eventId: randomUUID(), email, displayName: email, eventType: "CONTACT_RECEIVED" }, { publicForm: true })).contactId!;
      expect(await directStart(await send(`setting-${suffix}@example.test`), defaultMix.id)).toMatchObject({ isActive: true });
      await prisma.intakeConnection.update({ where: { id: connection.id }, data: { newContactPlacement: "MIX", newContactMixId: otherMix.id } });
      const own = await send(`own-${suffix}@example.test`);
      expect(await directStart(own, otherMix.id)).toMatchObject({ isActive: true });
      expect(await directStart(own, defaultMix.id)).toBeNull();
      await prisma.intakeConnection.update({ where: { id: connection.id }, data: { newContactPlacement: "NONE", newContactMixId: null } });
      const none = await send(`none-${suffix}@example.test`);
      expect(await prisma.mixAssignment.count({ where: { contactId: none, isActive: true } })).toBe(0);
    });

    it("starts the Mix confirmed in an import's review, and the setting for phone contacts", async () => {
      const row = (name: string) => {
        const rowId = `row-${randomUUID()}`;
        return { record: { rowId, sourceRow: 1, source: "CSV" as const, firstName: name, lastName: null, displayName: `${name} ${suffix}`, company: null, publicNotes: null, emails: [{ value: `${name.toLowerCase()}-${suffix}@example.test`, label: null, isPrimary: true }], phones: [], addresses: [], groupIds: [], customFields: [], jumpDates: [] }, resolution: { rowId, action: "CREATE" as const, targetContactId: null } };
      };
      const commit = async (name: string, mixId?: string | null) => (await commitContactImportBatch({ workspaceId, actorUserId: userId, timezone: "UTC", importId: `import-${randomUUID()}`, items: [row(name)], ...(mixId === undefined ? {} : { mixId }) }))[0].contactId!;
      const chosen = await commit("Chosen", otherMix.id);
      expect(await directStart(chosen, otherMix.id)).toMatchObject({ isActive: true });
      expect(await directStart(chosen, defaultMix.id)).toBeNull();
      const declined = await commit("Declined", null);
      expect(await prisma.mixAssignment.count({ where: { contactId: declined, isActive: true } })).toBe(0);
      const phone = await commit("Phone");
      expect(await directStart(phone, defaultMix.id)).toMatchObject({ isActive: true });
    });

    it("starts a Mix chosen in Quick Add's review, or none, whatever the setting says", async () => {
      const capture = async (name: string, mixId?: string | null) => (await saveQuickCapture({ workspaceId, actorUserId: userId, timezone: "UTC" }, { requestId: randomUUID(), person: { mode: "new", name: `${name} ${suffix}`, phone: "", email: "", allowDuplicate: true }, note: null, event: null, followUp: null, ...(mixId === undefined ? {} : { mixId }) }));
      const chosen = await capture("Picked", otherMix.id);
      expect(chosen.mixName).toBe(otherMix.name);
      expect(await directStart(chosen.contactId, otherMix.id)).toMatchObject({ isActive: true });
      const none = await capture("Nothing", null);
      expect(none.mixName).toBeNull();
      expect(await directStart(none.contactId, defaultMix.id)).toBeNull();
      const followed = await capture("Followed");
      expect(followed.mixName).toBe(defaultMix.name);
    });
  });
});
