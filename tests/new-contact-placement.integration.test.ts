import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
const session = vi.hoisted(() => ({ context: {} }));
vi.mock("@/lib/auth", () => ({ requireWorkspace: async () => session.context }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));
import { prisma } from "../src/lib/prisma";
import { saveMixAction } from "../src/lib/mix-editor-actions";
import { newContactPlacementSetting, placeNewContacts } from "../src/lib/new-contact-placement";
import { saveContactFormAction } from "../src/lib/contact-actions";
import { activateMixAction } from "../src/lib/mix-lifecycle-actions";
import { queueContactImportBatch } from "../src/lib/contact-import-jobs";
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
    const place = (contactIds: string[], options: { mixId?: string | null; chosenByOwner?: boolean; explicit?: boolean } = {}) => prisma.$transaction(tx => placeNewContacts(tx, { workspaceId, contactIds, timezone: "UTC", ...options }));

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

    it("isn't started again for someone a tag already puts in it", async () => {
      const tag = await prisma.group.create({ data: { workspaceId, name: `Referrals ${suffix}` } });
      await prisma.mixAssignment.create({ data: { workspaceId, mixId: defaultMix.id, groupId: tag.id, assignmentKey: `${workspaceId}:${defaultMix.id}:group:${tag.id}`, mode: "DYNAMIC", startDate: new Date() } });
      try {
        const tagged = await person("Tagged");
        await prisma.contactGroupMembership.create({ data: { groupId: tag.id, contactId: tagged } });
        expect(await place([tagged])).toMatchObject({ started: [], skipped: [tagged] });
        expect(await directStart(tagged, defaultMix.id)).toBeNull();
        // A hidden tag runs nothing, so the setting's Mix starts.
        const hidden = await person("Hidden tag");
        await prisma.contactGroupMembership.create({ data: { groupId: tag.id, contactId: hidden } });
        await prisma.contactGroupState.create({ data: { groupId: tag.id, workspaceId, isActive: false } });
        expect(await place([hidden])).toMatchObject({ started: [hidden] });
      } finally {
        await prisma.contactGroupState.deleteMany({ where: { groupId: tag.id } });
        await prisma.mixAssignment.deleteMany({ where: { groupId: tag.id } });
        await prisma.group.delete({ where: { id: tag.id } });
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

    // The first review of #128: the stage's Mix comes first everywhere, a Mix starts once, Mixes that start after
    // another Mix are never offered, and imports queue one preparation job per person.
    describe("after the first review", () => {
      const row = (name: string) => {
        const rowId = `row-${randomUUID()}`;
        return { record: { rowId, sourceRow: 1, source: "CSV" as const, firstName: name, lastName: null, displayName: `${name} ${suffix}`, company: null, publicNotes: null, emails: [{ value: `${name.toLowerCase()}-${suffix}@example.test`, label: null, isPrimary: true }], phones: [], addresses: [], groupIds: [], customFields: [], jumpDates: [] }, resolution: { rowId, action: "CREATE" as const, targetContactId: null } };
      };
      const commit = async (name: string, mixId?: string | null) => (await commitContactImportBatch({ workspaceId, actorUserId: userId, timezone: "UTC", importId: `import-${randomUUID()}`, items: [row(name)], ...(mixId === undefined ? {} : { mixId }) }))[0].contactId!;
      const addForm = (fields: Record<string, string>) => { const data = new FormData(); for (const [key, value] of Object.entries({ requestId: randomUUID(), ...fields })) data.append(key, value); return data; };
      const created = (error: unknown) => /\/contacts\/([^/?]+)\?/.exec(String(error))?.[1] ?? "";
      const inDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
      let followUpTypeId = "";

      beforeAll(async () => {
        followUpTypeId = (await prisma.dateType.findFirst({ where: { scopeKey: "system", slug: "follow-up", isActive: true }, select: { id: true } }))?.id
          ?? (await prisma.dateType.create({ data: { workspaceId, scopeKey: workspaceId, name: "Follow-up", slug: `follow-up-${suffix}` } })).id;
      });
      async function withStage(run: (stageMix: { id: string; name: string }) => Promise<void>) {
        const stageMix = await mix(`Stage start ${randomUUID().slice(0, 6)}`);
        await prisma.journeyPreference.create({ data: { workspaceId } });
        const stage = await prisma.journeyStage.create({ data: { workspaceId, name: `Lead ${suffix}`, position: 0, planId: stageMix.id } });
        try { await run(stageMix); }
        finally {
          await prisma.journeyPreference.delete({ where: { workspaceId } });
          await prisma.contactJourney.deleteMany({ where: { workspaceId } });
          await prisma.journeyEvent.deleteMany({ where: { workspaceId } });
          await prisma.journeyStage.delete({ where: { id: stage.id } });
        }
      }

      it("doesn't add the setting's Mix on top of the Mix a stage will start for imported and phone contacts (PLC-01)", async () => {
        await withStage(async () => {
          // Phone contacts follow the setting, which the stage's Mix takes the place of; the worker's stage pass starts it.
          const phone = await commit("StagedPhone");
          expect(await directStart(phone, defaultMix.id)).toBeNull();
          // A Mix the owner picked in the import's review is their own choice, so it starts.
          const picked = await commit("StagedPick", otherMix.id);
          expect(await directStart(picked, otherMix.id)).toMatchObject({ isActive: true });
          // The same for a placement with no stage event yet, and an explicit choice.
          const later = await person("Later stage");
          expect(await place([later])).toMatchObject({ started: [], skipped: [later], skippedBecause: { [later]: "stage" } });
          expect(await place([later], { mixId: otherMix.id, explicit: true })).toMatchObject({ started: [later] });
        });
      });

      it("runs Add a contact's stage first, so the stage manages its Mix and the form's own choice starts beside it (PLC-01)", async () => {
        await withStage(async stageMix => {
          await expect(saveContactFormAction({}, addForm({ firstName: "Stagey", lastName: suffix, scheduleFollowUp: "on", followUpDateTypeId: followUpTypeId, followUpDate: inDays(0), followUpReason: "Follow up", followUpMixId: otherMix.id }))).rejects.toThrow(/redirect:\/contacts\/[^?]+\?created=1&mixAssigned=1/);
          const staged = await prisma.contact.findFirstOrThrow({ where: { workspaceId, firstName: "Stagey" } });
          expect((await assignmentsOf(staged.id)).map(item => item.mixId).sort()).toEqual([otherMix.id, stageMix.id].sort());
          // Choosing the stage's own Mix keeps one enrollment, which the stage manages.
          let error: unknown;
          try { await saveContactFormAction({}, addForm({ firstName: "Samestage", lastName: suffix, scheduleFollowUp: "on", followUpDateTypeId: followUpTypeId, followUpDate: inDays(2), followUpReason: "Follow up", followUpMixId: stageMix.id })); } catch (caught) { error = caught; }
          const same = created(error);
          const enrollments = await prisma.mixAssignment.findMany({ where: { contactId: same, isActive: true }, select: { id: true, mixId: true } });
          expect(enrollments.map(item => item.mixId)).toEqual([stageMix.id]);
          expect((await prisma.contactJourney.findUniqueOrThrow({ where: { contactId: same } })).managedAssignmentId).toBe(enrollments[0].id);
        });
      });

      it("starts Add a contact's Mix once, even when it is for Everyone or a tag runs it (PLC-02)", async () => {
        const everyone = await mix("Everyone check-in", { audienceEveryone: true });
        try {
          let error: unknown;
          try { await saveContactFormAction({}, addForm({ firstName: "Fran", lastName: suffix, scheduleFollowUp: "on", followUpDateTypeId: followUpTypeId, followUpDate: inDays(7), followUpReason: "Follow up", followUpMixId: everyone.id })); } catch (caught) { error = caught; }
          const fran = created(error);
          const runs = await prisma.mixAssignment.findMany({ where: { contactId: fran, mixId: everyone.id, isActive: true }, select: { assignmentKey: true, startDate: true } });
          // One run, from the day the owner chose, and no second one from the Everyone audience.
          expect(runs.map(item => item.assignmentKey)).toEqual([`${workspaceId}:${everyone.id}:${fran}`]);
          expect(runs[0].startDate?.toISOString().slice(0, 10)).toBe(inDays(7));
        } finally { await prisma.mix.update({ where: { id: everyone.id }, data: { status: "PAUSED" } }); }

        const tag = await prisma.group.create({ data: { workspaceId, name: `Runs it ${suffix}` } });
        await prisma.mixAssignment.create({ data: { workspaceId, mixId: otherMix.id, groupId: tag.id, assignmentKey: `${workspaceId}:${otherMix.id}:group:${tag.id}`, mode: "DYNAMIC", startDate: new Date() } });
        try {
          await expect(saveContactFormAction({}, addForm({ firstName: "Tagg", lastName: suffix, groupIds: tag.id, scheduleFollowUp: "on", followUpDateTypeId: followUpTypeId, followUpDate: inDays(1), followUpReason: "Follow up", followUpMixId: otherMix.id }))).rejects.toThrow(/created=1&mixKept=1/);
          const tagged = await prisma.contact.findFirstOrThrow({ where: { workspaceId, firstName: "Tagg" } });
          expect(await directStart(tagged.id, otherMix.id)).toBeNull();
        } finally {
          await prisma.mixAssignment.deleteMany({ where: { groupId: tag.id } });
          await prisma.contactGroupMembership.deleteMany({ where: { groupId: tag.id } });
          await prisma.group.delete({ where: { id: tag.id } });
        }
      });

      it("never offers or starts a Mix set to start after another Mix (D49)", async () => {
        const after = await mix("Thank-you after the job");
        const rule = { id: `mix-start:${after.id}`, name: "Start Thank-you", source: { mixId: otherMix.id, stepId: null }, enabled: true, mode: "PARALLEL", join: null,
          routes: [{ id: `mix-start:${after.id}:next`, label: "After this Mix finishes", when: "FINISHED", outcome: "", delayMinutes: 0, target: { mixId: after.id, stepId: null }, maxVisits: null, replace: false }] };
        await prisma.mixWorkflow.create({ data: { workspaceId, configuration: { rules: [rule], gatedStepIds: [], intentionalEnds: [] } } });
        try {
          await expect(setting({ placement: "MIX", mixId: after.id })).rejects.toThrow(/redirect:\/settings\/new-contacts\?.*error/);
          await prisma.workspacePreference.update({ where: { workspaceId }, data: { newContactMixId: after.id } });
          expect((await newContactPlacementSetting(prisma, workspaceId)).mix).toBeNull();
          await expect(place([await person("After")], { mixId: after.id, chosenByOwner: true })).rejects.toThrow("Choose a Mix that is on");
        } finally {
          await prisma.workspacePreference.update({ where: { workspaceId }, data: { newContactMixId: defaultMix.id } });
          await prisma.mixWorkflow.delete({ where: { workspaceId } });
        }
      });

      it("queues one preparation job for each imported person (PERF-01), and a retried queue returns its batch (IMP-01)", async () => {
        const everyone = await mix("Everyone import", { audienceEveryone: true });
        try {
          const phone = await commit("OneJob");
          expect(await directStart(phone, defaultMix.id)).toMatchObject({ isActive: true });
          expect(await prisma.job.count({ where: { workspaceId, task: "generate-jumps", payload: { path: ["contactId"], equals: phone } } })).toBe(1);
        } finally { await prisma.mix.update({ where: { id: everyone.id }, data: { status: "PAUSED" } }); }

        const importId = `import-${randomUUID()}`;
        const queued = await queueContactImportBatch({ workspaceId, actorUserId: userId, importId, items: [row("Queued")], mixId: otherMix.id });
        await prisma.mix.update({ where: { id: otherMix.id }, data: { status: "PAUSED" } });
        try {
          // The response was lost and the owner retries after turning that Mix off: the queued batch comes back.
          expect((await queueContactImportBatch({ workspaceId, actorUserId: userId, importId, items: [row("Queued")], mixId: otherMix.id })).id).toBe(queued.id);
        } finally {
          await prisma.mix.update({ where: { id: otherMix.id }, data: { status: "ACTIVE" } });
          await prisma.job.deleteMany({ where: { workspaceId, task: "contact-import" } });
          await prisma.contactImportBatch.deleteMany({ where: { workspaceId, importId } });
        }
      });

      it("brings people added while an Everyone Mix was off into it when it is turned back on (EVR-01)", async () => {
        const paused = await mix("Paused for everyone", { audienceEveryone: true, status: "PAUSED" });
        await prisma.userPreference.upsert({ where: { userId }, create: { userId, timezone: "UTC", reviewMixActivation: false }, update: { reviewMixActivation: false } });
        const newcomer = await person("Added while off");
        const data = new FormData(); data.set("mixId", paused.id);
        await expect(activateMixAction(data)).rejects.toThrow("redirect:/mixes?activated=1");
        expect(await prisma.mixAssignment.findUnique({ where: { assignmentKey: `${workspaceId}:${paused.id}:audience:${newcomer}` }, select: { isActive: true, mode: true } })).toEqual({ isActive: true, mode: "DYNAMIC" });
        await prisma.mix.update({ where: { id: paused.id }, data: { status: "PAUSED" } });
      });
    });
  });
});
