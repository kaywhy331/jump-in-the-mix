import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../src/lib/prisma";

const auth = vi.hoisted(() => ({ context: {} as Record<string, unknown> }));
vi.mock("@/lib/auth", () => ({ requireWorkspace: async () => auth.context }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`REDIRECT ${url}`); } }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/lib/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/env")>();
  return { ...actual, env: { ...actual.env, authRateLimitSecret: "mix-stage-integration-test-secret-1" } };
});
import { setStagesFromMixStarts, setStagesFromTagJoins, undoStageSet, addStageLabels, StageLimitRefusal, stageMovesForAudience } from "../src/lib/mix-stage";
import { assignMixToContactAction, bulkAssignMixAction, undoBulkMixStartAction } from "../src/lib/contact-mix-actions";
import { placeNewContacts } from "../src/lib/new-contact-placement";
import { saveMixAction } from "../src/lib/mix-editor-actions";
import { activateMixAction } from "../src/lib/mix-lifecycle-actions";
import { bulkAssignGroupAction } from "../src/lib/bulk-contact-actions";
import { saveJourneyStageAction } from "../src/lib/journey-actions";
import { applyJourneyEvent, enableJourney } from "../src/lib/journey";
import { installMegaMix } from "../src/lib/mega-mix-service";
import { MEGA_MIXES, megaMixStageOf } from "../src/lib/mega-mixes";
import { processWorkflowInstance, startWorkflowInstance, workflowState } from "../src/lib/mix-workflow";
import { emptyWorkflow, type WorkflowRule } from "../src/lib/mix-workflow-types";
import { generateJumps } from "../src/lib/jump-engine";
import { saveContactFormAction } from "../src/lib/contact-actions";
import { scheduleVisit } from "../src/lib/appointment-bindings";

const local = /^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? "");

function form(entries: Record<string, string | string[]>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) for (const item of Array.isArray(value) ? value : [value]) data.append(key, item);
  return data;
}
async function redirectOf(action: Promise<unknown>): Promise<URL> {
  try { await action; } catch (error) { if (error instanceof Error && error.message.startsWith("REDIRECT ")) return new URL(error.message.slice("REDIRECT ".length), "https://app.invalid"); throw error; }
  throw new Error("The action finished without redirecting.");
}

describe.skipIf(!local).sequential("a Mix sets the Contact stage its people are in (JITM-09 §2.79)", () => {
  let userId = "", workspaceId = "";
  let lead = "", prospect = "", client = "", retention = "";
  const today = () => new Date().toISOString().slice(0, 10);

  async function mix(name: string, data: Record<string, unknown> = {}) {
    const created = await prisma.mix.create({ data: { workspaceId, name, status: "ACTIVE", triggerMode: "MANUAL_START", ...data } });
    const template = await prisma.stepTemplate.create({ data: { workspaceId, name: `${name} beat`, channel: "SMS", versions: { create: { version: 1, body: "Checking in" } } }, include: { versions: true } });
    await prisma.mixStep.create({ data: { mixId: created.id, stepVersionId: template.versions[0].id, dayOffset: 0, sortOrder: 1 } });
    return created;
  }
  const person = async (name: string) => (await prisma.contact.create({ data: { workspaceId, displayName: name } })).id;
  // Someone added before Contact stages were turned on, with no stage: the only people an Everyone Mix moves (D66).
  const older = async (name: string) => (await prisma.contact.create({ data: { workspaceId, displayName: name, createdAt: new Date(Date.now() - 86_400_000) } })).id;
  const stageOf = async (contactId: string) => (await prisma.contactJourney.findUnique({ where: { contactId } }))?.stageId ?? null;
  const placeIn = async (contactId: string, stageId: string, data: Record<string, unknown> = {}) => prisma.contactJourney.create({ data: { workspaceId, contactId, stageId, ...data } });
  const set = (contactId: string, mixId: string) => prisma.$transaction(tx => setStagesFromMixStarts(tx, { workspaceId, starts: [{ contactId, mixId }] }));

  beforeEach(async () => {
    const user = await prisma.user.create({ data: { email: `mix-stage-${randomUUID()}@example.test`, name: "Stage fixture", passwordHash: "fixture-only" } }); userId = user.id;
    const workspace = await prisma.workspace.create({ data: { ownerId: userId, slug: `mix-stage-${randomUUID()}`, name: "Stage fixture", profile: { create: {} } }, include: { profile: true } }); workspaceId = workspace.id;
    auth.context = { session: { authUser: user }, user, workspace, impersonation: null };
    await enableJourney(workspaceId);
    const stages = await prisma.journeyStage.findMany({ where: { workspaceId }, orderBy: { position: "asc" } });
    [lead, prospect, client, retention] = stages.map(stage => stage.id);
  });
  afterAll(async () => {
    await prisma.workspace.deleteMany({ where: { name: "Stage fixture", slug: { startsWith: "mix-stage-" } } });
    await prisma.userPreference.deleteMany({ where: { user: { email: { startsWith: "mix-stage-" }, name: "Stage fixture" } } });
    await prisma.user.deleteMany({ where: { email: { startsWith: "mix-stage-" }, name: "Stage fixture" } });
    await prisma.$disconnect();
  });

  describe("the rule", () => {
    it("sets the stage, writes history and an activity line, and starts or stops no other Mix", async () => {
      const qualify = await mix("Qualify", { stageId: prospect });
      const prospectMix = await mix("Prospect care");
      await prisma.journeyStage.update({ where: { id: prospect }, data: { planId: prospectMix.id } });
      const leadMix = await mix("Lead care");
      const ana = await person("Ana");
      const managed = await prisma.mixAssignment.create({ data: { workspaceId, contactId: ana, mixId: leadMix.id, assignmentKey: `${workspaceId}:${leadMix.id}:${ana}`, isActive: true } });
      await placeIn(ana, lead, { managedAssignmentId: managed.id, version: 3 });
      const [change] = await set(ana, qualify.id);
      const record = await prisma.contactJourney.findUniqueOrThrow({ where: { contactId: ana } });
      expect(record).toMatchObject({ stageId: prospect, managedAssignmentId: null, version: 4, automatic: true });
      expect(change).toMatchObject({ contactId: ana, mixId: qualify.id, stageId: prospect, version: 4, previous: { stageId: lead, managedAssignmentId: managed.id } });
      // The previous stage's Mix keeps running, and the new stage's own Mix does not start.
      expect((await prisma.mixAssignment.findUniqueOrThrow({ where: { id: managed.id } })).isActive).toBe(true);
      expect(await prisma.mixStop.count({ where: { workspaceId } })).toBe(0);
      expect(await prisma.mixAssignment.count({ where: { workspaceId, mixId: prospectMix.id } })).toBe(0);
      expect(await prisma.journeyEvent.findFirstOrThrow({ where: { workspaceId, contactId: ana } })).toMatchObject({ eventType: "MANUAL", source: "Mix: Qualify", resultingStageId: prospect, eventKey: change.eventKey });
      expect((await prisma.contactActivity.findFirstOrThrow({ where: { workspaceId, contactId: ana } })).summary).toBe("Lead → Prospect, set by the Mix “Qualify”.");
      // Starting it again while already in that stage changes nothing.
      expect(await set(ana, qualify.id)).toEqual([]);
      expect(await prisma.journeyEvent.count({ where: { workspaceId, contactId: ana } })).toBe(1);
    });

    it("gives someone added before stages were on the Mix's stage, and the latest start wins", async () => {
      const first = await mix("First", { stageId: prospect });
      const second = await mix("Second", { stageId: client });
      // Added before Contact stages were turned on, so the worker's stage pass never takes them.
      const ben = (await prisma.contact.create({ data: { workspaceId, displayName: "Ben", createdAt: new Date(Date.now() - 86_400_000) } })).id;
      await prisma.$transaction(tx => setStagesFromMixStarts(tx, { workspaceId, starts: [{ contactId: ben, mixId: first.id }, { contactId: ben, mixId: second.id }] }));
      expect(await stageOf(ben)).toBe(client);
      expect((await prisma.contactActivity.findMany({ where: { workspaceId, contactId: ben } })).map(item => item.summary)).toEqual(["Joined Client, set by the Mix “Second”."]);
      await set(ben, first.id);
      expect(await stageOf(ben)).toBe(prospect);
    });

    it("an earlier start sets the stage when the person is stopped in the latest one (ORD-01)", async () => {
      const first = await mix("First", { stageId: prospect });
      const second = await mix("Second", { stageId: client });
      const cleo = await person("Cleo");
      await placeIn(cleo, lead);
      await prisma.mixStop.create({ data: { workspaceId, contactId: cleo, mixId: second.id, reason: "Owner stopped this" } });
      await prisma.$transaction(tx => setStagesFromMixStarts(tx, { workspaceId, starts: [{ contactId: cleo, mixId: first.id }, { contactId: cleo, mixId: second.id }] }));
      expect(await stageOf(cleo)).toBe(prospect);
    });

    it("leaves people alone when stage changes are paused, the stage is retired, or the Mix doesn't run for them", async () => {
      const qualify = await mix("Qualify", { stageId: prospect });
      const paused = await person("Paused person");
      await placeIn(paused, lead, { automatic: false });
      const restricted = await person("Do not contact");
      await prisma.contactRelationshipState.create({ data: { workspaceId, contactId: restricted, doNotContact: true } });
      const stopped = await person("Stopped");
      await prisma.mixStop.create({ data: { workspaceId, contactId: stopped, mixId: qualify.id, reason: "Owner stopped this" } });
      const archived = (await prisma.contact.create({ data: { workspaceId, displayName: "Archived", archivedAt: new Date() } })).id;
      const plain = await mix("No stage");
      const unnamed = await person("Unnamed");
      expect(await prisma.$transaction(tx => setStagesFromMixStarts(tx, { workspaceId, starts: [paused, restricted, stopped, archived].map(contactId => ({ contactId, mixId: qualify.id })).concat({ contactId: unnamed, mixId: plain.id }) }))).toEqual([]);
      expect(await stageOf(paused)).toBe(lead);
      for (const contactId of [restricted, stopped, archived, unnamed]) expect(await stageOf(contactId)).toBeNull();
      // Paused for the whole business.
      const someone = await person("Someone");
      await prisma.journeyPreference.update({ where: { workspaceId }, data: { enabled: false } });
      expect(await set(someone, qualify.id)).toEqual([]);
      await prisma.journeyPreference.update({ where: { workspaceId }, data: { enabled: true } });
      // A retired stage.
      await prisma.journeyStage.update({ where: { id: prospect }, data: { isActive: false } });
      expect(await set(someone, qualify.id)).toEqual([]);
      expect(await stageOf(someone)).toBeNull();
    });

    it("does nothing in a business without Contact stages", async () => {
      await prisma.journeyPreference.delete({ where: { workspaceId } });
      const qualify = await mix("Qualify", { stageId: prospect });
      const cara = await person("Cara");
      expect(await set(cara, qualify.id)).toEqual([]);
      expect(await stageOf(cara)).toBeNull();
    });

    it("puts the earlier stage back on Undo only while nothing changed it since", async () => {
      const qualify = await mix("Qualify", { stageId: prospect });
      const dee = await person("Dee");
      const since = new Date("2026-09-01T10:00:00Z");
      await placeIn(dee, lead, { stageSince: since });
      const [change] = await set(dee, qualify.id);
      expect(await prisma.$transaction(tx => undoStageSet(tx, { workspaceId, set: change }))).toBe(true);
      expect(await prisma.contactJourney.findUniqueOrThrow({ where: { contactId: dee } })).toMatchObject({ stageId: lead, stageSince: since });
      expect(await prisma.journeyEvent.count({ where: { workspaceId, contactId: dee } })).toBe(0);
      // A start that gave someone their first stage leaves them with none again: here someone added before stages.
      const eve = (await prisma.contact.create({ data: { workspaceId, displayName: "Eve", createdAt: new Date(Date.now() - 86_400_000) } })).id;
      const [created] = await set(eve, qualify.id);
      expect(await prisma.$transaction(tx => undoStageSet(tx, { workspaceId, set: created }))).toBe(true);
      expect(await stageOf(eve)).toBeNull();
      // Someone new joined the first stage on the way, as the worker's pass would have put them there; Undo keeps that.
      const fay = await person("Fay");
      const [joined] = await set(fay, qualify.id);
      expect(joined.previous).toMatchObject({ stageId: lead });
      expect(await prisma.$transaction(tx => undoStageSet(tx, { workspaceId, set: joined }))).toBe(true);
      expect(await stageOf(fay)).toBe(lead);
      // Moved by hand since: Undo leaves them where they are.
      const [again] = await set(dee, qualify.id);
      await prisma.$transaction(tx => applyJourneyEvent(tx, { workspaceId, contactId: dee, eventKey: `manual:${randomUUID()}`, eventType: "MANUAL", targetStageId: client, source: "Recorded by you" }));
      expect(await prisma.$transaction(tx => undoStageSet(tx, { workspaceId, set: again }))).toBe(false);
      expect(await stageOf(dee)).toBe(client);
    });
  });

  describe("every way a Mix starts", () => {
    it("a start from the profile sets the stage; a Mix already running keeps the stage as it is", async () => {
      const qualify = await mix("Qualify", { stageId: prospect });
      const fay = await person("Fay");
      await redirectOf(assignMixToContactAction(form({ mixId: qualify.id, contactId: fay, startDate: today() })));
      expect(await stageOf(fay)).toBe(prospect);
      // Once its follow-ups are prepared the Mix is running, and a second start keeps it, and the stage, as they are.
      await generateJumps({ workspaceId });
      await prisma.$transaction(tx => applyJourneyEvent(tx, { workspaceId, contactId: fay, eventKey: `manual:${randomUUID()}`, eventType: "MANUAL", targetStageId: retention, source: "Recorded by you" }));
      await redirectOf(assignMixToContactAction(form({ mixId: qualify.id, contactId: fay, startDate: today() })));
      expect(await stageOf(fay)).toBe(retention);
    });

    it("bulk Add sets each person's stage, and its Undo puts each one back", async () => {
      const qualify = await mix("Qualify", { stageId: prospect });
      const gil = await person("Gil"), hal = await person("Hal");
      await placeIn(gil, lead);
      const added = await redirectOf(bulkAssignMixAction(form({ mixId: qualify.id, contactIds: [gil, hal], startDate: today(), returnTo: "/contacts" })));
      expect([await stageOf(gil), await stageOf(hal)]).toEqual([prospect, prospect]);
      const undone = await redirectOf(undoBulkMixStartAction(form({ undoId: added.searchParams.get("mixUndo")!, returnTo: "/contacts" })));
      expect(undone.searchParams.get("mixUndone")).toBe("2");
      // Hal was new, so he joined the first stage on the way, as the worker's pass would have put him there.
      expect([await stageOf(gil), await stageOf(hal)]).toEqual([lead, lead]);
      const record = await prisma.auditLog.findFirstOrThrow({ where: { workspaceId, action: "mix.assignment.bulk-undo" } });
      expect(record.metadata).toMatchObject({ restoredStages: 2 });
    });

    it("an Everyone Mix takes a newcomer in and leaves their stage to the stage new people join (D66)", async () => {
      const welcome = await mix("Welcome", { stageId: prospect, audienceEveryone: true });
      const ivy = await person("Ivy");
      await prisma.$transaction(tx => placeNewContacts(tx, { workspaceId, contactIds: [ivy] }));
      expect(await prisma.mixAssignment.count({ where: { workspaceId, mixId: welcome.id, contactId: ivy, isActive: true } })).toBe(1);
      // The worker's stage pass puts Ivy in the first stage, as for any new person.
      expect(await stageOf(ivy)).toBeNull();
      expect(await prisma.journeyEvent.count({ where: { workspaceId, contactId: ivy } })).toBe(0);
    });

    it("saving a Mix starts it for the people its audience newly takes in; changing its stage moves no one", async () => {
      const jo = await older("Jo");
      const editor = (fields: Record<string, string>) => form({ status: "ACTIVE", activationConfirmed: "1", triggerMode: "MANUAL_START", dayOffset: "0", mixStepId: "", sendTimeMinutes: "", plannedAt: "", anchor: "CALENDAR_DAY", offsetMinutes: "", "inlineName-0": "Check in", "inlineChannel-0": "PHONE_CALL", "inlineScript-0": "Ask how it went.", ...fields });
      await redirectOf(saveMixAction(editor({ name: "Welcome", assignAllContacts: "on", stageId: prospect })));
      const saved = await prisma.mix.findFirstOrThrow({ where: { workspaceId, name: "Welcome" } });
      expect(saved.stageId).toBe(prospect);
      expect(await stageOf(jo)).toBe(prospect);
      const stepId = (await prisma.mixStep.findFirstOrThrow({ where: { mixId: saved.id, isActive: true } })).id;
      await redirectOf(saveMixAction(editor({ name: "Welcome", mixId: saved.id, mixStepId: stepId, mixUpdatedAt: saved.updatedAt.toISOString(), assignAllContacts: "on", stageId: client })));
      expect((await prisma.mix.findUniqueOrThrow({ where: { id: saved.id } })).stageId).toBe(client);
      expect(await stageOf(jo)).toBe(prospect);
      // A form without the field keeps the saved stage; another business's stage is refused.
      const kept = await prisma.mix.findUniqueOrThrow({ where: { id: saved.id } });
      await redirectOf(saveMixAction(editor({ name: "Welcome", mixId: saved.id, mixStepId: stepId, mixUpdatedAt: kept.updatedAt.toISOString(), assignAllContacts: "on" })));
      expect((await prisma.mix.findUniqueOrThrow({ where: { id: saved.id } })).stageId).toBe(client);
      const elsewhere = await prisma.workspace.create({ data: { ownerId: userId, slug: `mix-stage-${randomUUID()}`, name: "Stage fixture" } });
      const foreign = await prisma.journeyStage.create({ data: { workspaceId: elsewhere.id, name: "Elsewhere", position: 0 } });
      const refused = await redirectOf(saveMixAction(editor({ name: "Other", stageId: foreign.id })));
      expect(refused.pathname).toBe("/mixes/new");
      expect(await prisma.mix.count({ where: { workspaceId, name: "Other" } })).toBe(0);
    });

    it("turning on a draft that names a stage is always reviewed, then moves its whole audience; a tag given later moves them too", async () => {
      const tag = await prisma.group.create({ data: { workspaceId, name: "Clients" } });
      const quiet = await prisma.group.create({ data: { workspaceId, name: "Quiet" } });
      const kim = await person("Kim"), lou = await person("Lou"), max = await person("Max");
      await prisma.contactGroupMembership.createMany({ data: [{ contactId: kim, groupId: tag.id }, { contactId: max, groupId: quiet.id }] });
      await prisma.contactGroupState.create({ data: { workspaceId, groupId: quiet.id, isActive: false } });
      const care = await mix("Client care", { stageId: client, status: "DRAFT" });
      for (const group of [tag, quiet]) await prisma.mixAssignment.create({ data: { workspaceId, mixId: care.id, groupId: group.id, mode: "DYNAMIC", assignmentKey: `${workspaceId}:${care.id}:group:${group.id}` } });
      await prisma.userPreference.upsert({ where: { userId }, create: { userId, reviewMixActivation: false }, update: { reviewMixActivation: false } });
      // With the review preference off, Start Mix still opens the review, and the save refuses to skip it (UX-01).
      const review = await redirectOf(activateMixAction(form({ mixId: care.id })));
      expect(`${review.pathname}${review.search}`).toBe(`/mixes/${care.id}/edit?activate=1`);
      const step = await prisma.mixStep.findFirstOrThrow({ where: { mixId: care.id, isActive: true } });
      const editor = (fields: Record<string, string>) => form({ name: "Client care", mixId: care.id, mixStepId: step.id, mixUpdatedAt: care.updatedAt.toISOString(), status: "ACTIVE", triggerMode: "MANUAL_START", dayOffset: "0", sendTimeMinutes: "", plannedAt: "", anchor: "CALENDAR_DAY", offsetMinutes: "", "inlineName-0": "Check in", "inlineChannel-0": "PHONE_CALL", "inlineScript-0": "Ask how it went.", groupIds: [tag.id, quiet.id], stageId: client, ...fields });
      const refused = await redirectOf(saveMixAction(editor({})));
      expect(refused.pathname).toBe(`/mixes/${care.id}/edit`);
      expect(refused.searchParams.get("error")).not.toBeNull();
      expect((await prisma.mix.findUniqueOrThrow({ where: { id: care.id } })).status).toBe("DRAFT");
      expect(await stageOf(kim)).toBeNull();
      await redirectOf(saveMixAction(editor({ activationConfirmed: "1" })));
      expect(await stageOf(kim)).toBe(client);
      // A hidden tag runs nothing, so it moves no one.
      expect(await stageOf(max)).toBeNull();
      expect(await stageOf(lou)).toBeNull();
      await redirectOf(bulkAssignGroupAction(form({ groupId: tag.id, contactIds: [lou] })));
      expect(await stageOf(lou)).toBe(client);
    });

    it("Add a contact with a tag whose Mix names a stage puts them there, after the first stage's event", async () => {
      const tag = await prisma.group.create({ data: { workspaceId, name: "Referrals" } });
      const intro = await mix("Referral intro", { stageId: prospect });
      await prisma.mixAssignment.create({ data: { workspaceId, mixId: intro.id, groupId: tag.id, mode: "DYNAMIC", assignmentKey: `${workspaceId}:${intro.id}:group:${tag.id}`, startDate: new Date() } });
      const location = await redirectOf(saveContactFormAction({}, form({ requestId: randomUUID(), firstName: "Ola", lastName: "Tagged", groupIds: tag.id })));
      const ola = /\/contacts\/([^/?]+)/.exec(location.pathname)?.[1] ?? "";
      expect(await stageOf(ola)).toBe(prospect);
      // Joined Lead as a new contact first, then the tag's Mix moved them on.
      expect((await prisma.journeyEvent.findMany({ where: { workspaceId, contactId: ola }, orderBy: { occurredAt: "asc" } })).map(event => event.resultingStageId)).toEqual([lead, prospect]);
    });

    it("a Mix lined up with a visit sets the stage once", async () => {
      const visitMix = await mix("Visit follow-up", { stageId: client });
      const pia = await person("Pia");
      const startsAt = new Date(Date.now() + 2 * 86_400_000);
      const visit = await scheduleVisit({ workspaceId, actorUserId: userId, title: "Site visit", kind: "MEETING", contactId: pia, startsAt, endsAt: new Date(startsAt.getTime() + 3_600_000), timezone: "UTC", planId: visitMix.id });
      expect(await stageOf(pia)).toBe(client);
      await prisma.$transaction(tx => applyJourneyEvent(tx, { workspaceId, contactId: pia, eventKey: `manual:${randomUUID()}`, eventType: "MANUAL", targetStageId: lead, source: "Recorded by you" }));
      const entry = await prisma.calendarEntry.findUniqueOrThrow({ where: { id: visit.entryId } });
      await scheduleVisit({ workspaceId, actorUserId: userId, id: entry.id, version: entry.version, title: "Site visit, moved", kind: "MEETING", contactId: pia, startsAt, endsAt: new Date(startsAt.getTime() + 3_600_000), timezone: "UTC", planId: visitMix.id });
      expect(await stageOf(pia)).toBe(lead);
    });

    it("a Journey Start and a connection that starts the next Mix each set its stage", async () => {
      const estimate = await mix("Estimate", { stageId: prospect });
      const booked = await mix("Booked", { stageId: client });
      const rule: WorkflowRule = { id: randomUUID(), name: "What happened?", source: { mixId: estimate.id, stepId: null }, enabled: true, mode: "CHOICE", join: null,
        routes: [{ id: randomUUID(), label: "Accepted", when: "OUTCOME", outcome: "Accepted", delayMinutes: 0, target: { mixId: booked.id, stepId: null }, maxVisits: null, replace: false }] };
      await prisma.mixWorkflow.create({ data: { workspaceId, configuration: JSON.parse(JSON.stringify({ ...emptyWorkflow(), rules: [rule] })) } });
      const max = await person("Max");
      const start = new Date(Date.now() - 3 * 86_400_000);
      const instanceId = await startWorkflowInstance({ workspaceId, contactId: max, mixId: estimate.id, requestId: randomUUID(), now: start });
      expect(await stageOf(max)).toBe(prospect);
      await processWorkflowInstance(workspaceId, instanceId, start);
      await prisma.jump.updateMany({ where: { workflowInstanceId: instanceId }, data: { status: "DONE", completedAt: new Date(start.getTime() + 1000) } });
      const now = new Date();
      await processWorkflowInstance(workspaceId, instanceId, now);
      const instance = await prisma.mixWorkflowInstance.findUniqueOrThrow({ where: { id: instanceId } });
      expect(await stageOf(max)).toBe(prospect);
      // The route was due once the Beats were done, so recording the decision starts the next Mix.
      await processWorkflowInstance(workspaceId, instanceId, now, { requestId: randomUUID(), expectedRevision: instance.revision, evaluationId: workflowState(instance.state).evaluations[0].id, outcome: "Accepted" });
      expect(workflowState((await prisma.mixWorkflowInstance.findUniqueOrThrow({ where: { id: instanceId } })).state).runs.map(run => run.mixId)).toEqual([estimate.id, booked.id]);
      expect(await stageOf(max)).toBe(client);
      // Processing again starts nothing new, so nothing moves.
      await prisma.$transaction(tx => applyJourneyEvent(tx, { workspaceId, contactId: max, eventKey: `manual:${randomUUID()}`, eventType: "MANUAL", targetStageId: retention, source: "Recorded by you" }));
      await processWorkflowInstance(workspaceId, instanceId, new Date(now.getTime() + 20_000));
      expect(await stageOf(max)).toBe(retention);
    });
  });

  describe("Contact stages", () => {
    it("retiring a stage unlinks the Mixes that set it", async () => {
      const qualify = await mix("Qualify", { stageId: retention });
      await redirectOf(saveJourneyStageAction(form({ stageId: retention, intent: "archive" })));
      expect((await prisma.journeyStage.findUniqueOrThrow({ where: { id: retention } })).isActive).toBe(false);
      expect((await prisma.mix.findUniqueOrThrow({ where: { id: qualify.id } })).stageId).toBeNull();
    });

    it("refuses to retire a stage someone is in", async () => {
      const nia = await person("Nia");
      await placeIn(nia, retention);
      const refused = await redirectOf(saveJourneyStageAction(form({ stageId: retention, intent: "archive" })));
      expect(refused.searchParams.get("error")).toBeTruthy();
      expect((await prisma.journeyStage.findUniqueOrThrow({ where: { id: retention } })).isActive).toBe(true);
    });
  });

  describe("adding a Mega-Mix with its stage labels (P8)", () => {
    const realEstate = MEGA_MIXES.find(item => item.id === "real-estate")!;
    const install = (addStages: boolean) => installMegaMix({ workspaceId, actorUserId: userId, blueprintId: realEstate.id, expectedVersion: realEstate.version, addStages });

    it("turns Contact stages on with only its labels, links each Mix and starts no one", async () => {
      await prisma.journeyRule.deleteMany({ where: { workspaceId } });
      await prisma.journeyStage.deleteMany({ where: { workspaceId } });
      await prisma.journeyPreference.delete({ where: { workspaceId } });
      await person("Existing person");
      const result = await install(true);
      const stages = await prisma.journeyStage.findMany({ where: { workspaceId }, orderBy: { position: "asc" } });
      expect(stages.map(stage => stage.name)).toEqual(realEstate.stages.map(stage => stage.name));
      expect(await prisma.journeyRule.count({ where: { workspaceId } })).toBe(0);
      expect(await prisma.journeyPreference.findUnique({ where: { workspaceId } })).toMatchObject({ enabled: true });
      for (const node of realEstate.nodes) {
        const label = megaMixStageOf(realEstate, node.key);
        const saved = await prisma.mix.findUniqueOrThrow({ where: { id: result.mixIds[node.key] }, include: { stage: true } });
        expect(saved.stage?.name ?? null).toBe(label);
      }
      expect(await prisma.mixAssignment.count({ where: { workspaceId } })).toBe(0);
      expect(await prisma.contactJourney.count({ where: { workspaceId } })).toBe(0);
    });

    it("reuses labels the business has, under any case, and renames or removes nothing", async () => {
      const own = await prisma.journeyStage.create({ data: { workspaceId, name: "new lead", position: 9 } });
      const retired = await prisma.journeyStage.create({ data: { workspaceId, name: "Closed", position: 10, isActive: false } });
      const result = await install(true);
      const stages = await prisma.journeyStage.findMany({ where: { workspaceId }, orderBy: [{ position: "asc" }, { id: "asc" }] });
      expect(stages.slice(0, 4).map(stage => stage.name)).toEqual(["Lead", "Prospect", "Client", "Retention"]);
      expect(stages.find(stage => stage.id === own.id)).toMatchObject({ name: "new lead", position: 9, isActive: true });
      expect(stages.find(stage => stage.id === retired.id)).toMatchObject({ name: "Closed", isActive: true });
      expect(stages).toHaveLength(4 + realEstate.stages.length);
      expect((await prisma.mix.findUniqueOrThrow({ where: { id: result.mixIds.buyer } })).stageId).toBe(own.id);
      expect((await prisma.mix.findUniqueOrThrow({ where: { id: result.mixIds.closing } })).stageId).toBe(retired.id);
      expect(await prisma.journeyRule.count({ where: { workspaceId } })).toBe(7);
    });

    it("adds no labels when the owner leaves them out", async () => {
      const result = await install(false);
      expect(await prisma.journeyStage.count({ where: { workspaceId } })).toBe(4);
      expect(await prisma.mix.count({ where: { id: { in: Object.values(result.mixIds) }, stageId: { not: null } } })).toBe(0);
    });

    it("refuses labels that would pass the stage limit, adding nothing", async () => {
      for (let index = 0; index < 14; index++) await prisma.journeyStage.create({ data: { workspaceId, name: `Extra ${index}`, position: 10 + index } });
      await expect(install(true)).rejects.toBeInstanceOf(StageLimitRefusal);
      expect(await prisma.mix.count({ where: { workspaceId } })).toBe(0);
      expect(await prisma.journeyStage.count({ where: { workspaceId } })).toBe(18);
      await expect(prisma.$transaction(tx => addStageLabels(tx, workspaceId, ["Extra 0", "Extra 1"]))).resolves.toBeInstanceOf(Map);
    });
  });

  describe("new people, the stage's own Mix and the review (round 1 fixes)", () => {
    it("an Everyone Mix leaves someone waiting for the stage pass to it, and the New contacts Mix still isn't added (D66, D54)", async () => {
      const newLead = await mix("New lead");
      await prisma.journeyStage.update({ where: { id: lead }, data: { planId: newLead.id } });
      const welcome = await mix("Welcome");
      await prisma.workspacePreference.upsert({ where: { workspaceId }, create: { workspaceId, newContactPlacement: "MIX", newContactMixId: welcome.id }, update: { newContactPlacement: "MIX", newContactMixId: welcome.id } });
      const tips = await mix("Monthly tips", { stageId: retention, audienceEveryone: true });
      // A phone contact: added without a stage event, placed by the setting.
      const pat = await person("Pat");
      await prisma.$transaction(tx => placeNewContacts(tx, { workspaceId, contactIds: [pat] }));
      // Pat is new, so the Everyone Mix doesn't move them (D66): the worker's stage pass will put them in Lead and start
      // its Mix. The New contacts Mix isn't added on top of that Mix (D54).
      expect(await stageOf(pat)).toBeNull();
      const running = await prisma.mixAssignment.findMany({ where: { workspaceId, contactId: pat, isActive: true }, select: { mixId: true } });
      expect(running.map(item => item.mixId)).toEqual([tips.id]);
      expect(await prisma.journeyEvent.count({ where: { workspaceId, contactId: pat } })).toBe(0);
    });

    it("an imported person whose tag's Mix names a stage doesn't also get the New contacts Mix (STG-02, D54)", async () => {
      const newLead = await mix("New lead");
      await prisma.journeyStage.update({ where: { id: lead }, data: { planId: newLead.id } });
      const welcome = await mix("Welcome");
      await prisma.workspacePreference.upsert({ where: { workspaceId }, create: { workspaceId, newContactPlacement: "MIX", newContactMixId: welcome.id }, update: { newContactPlacement: "MIX", newContactMixId: welcome.id } });
      const tag = await prisma.group.create({ data: { workspaceId, name: "Referrals" } });
      const intro = await mix("Referral intro", { stageId: prospect });
      await prisma.mixAssignment.create({ data: { workspaceId, mixId: intro.id, groupId: tag.id, mode: "DYNAMIC", assignmentKey: `${workspaceId}:${intro.id}:group:${tag.id}`, startDate: new Date() } });
      const ray = await person("Ray");
      await prisma.contactGroupMembership.create({ data: { contactId: ray, groupId: tag.id } });
      const placed = await prisma.$transaction(async tx => {
        await setStagesFromTagJoins(tx, { workspaceId, joins: [{ contactId: ray, groupId: tag.id }] });
        return placeNewContacts(tx, { workspaceId, contactIds: [ray] });
      });
      expect(await stageOf(ray)).toBe(prospect);
      expect(placed.skippedBecause[ray]).toBe("stage");
      expect(await prisma.mixAssignment.count({ where: { workspaceId, contactId: ray, mixId: newLead.id, isActive: true } })).toBe(1);
      expect(await prisma.mixAssignment.count({ where: { workspaceId, contactId: ray, mixId: welcome.id } })).toBe(0);
    });

    it("a stage manages its own Mix when that Mix moves someone into it (STG-01)", async () => {
      const qualify = await mix("Qualify", { stageId: prospect });
      await prisma.journeyStage.update({ where: { id: prospect }, data: { planId: qualify.id } });
      const dana = await person("Dana");
      await placeIn(dana, lead);
      await redirectOf(assignMixToContactAction(form({ contactId: dana, mixId: qualify.id, startDate: today() })));
      const assignment = await prisma.mixAssignment.findUniqueOrThrow({ where: { assignmentKey: `${workspaceId}:${qualify.id}:${dana}` } });
      expect(await prisma.contactJourney.findUniqueOrThrow({ where: { contactId: dana } })).toMatchObject({ stageId: prospect, managedAssignmentId: assignment.id });
      // As for anyone the stage manages a Mix for, moving on stops it.
      await prisma.$transaction(tx => applyJourneyEvent(tx, { workspaceId, contactId: dana, eventKey: `manual:${randomUUID()}`, eventType: "MANUAL", targetStageId: client, source: "Recorded by you" }));
      expect((await prisma.mixAssignment.findUniqueOrThrow({ where: { id: assignment.id } })).isActive).toBe(false);
      // Someone new who starts the first stage's own Mix joins that stage, and the stage manages the Mix.
      const newLead = await mix("New lead", { stageId: lead });
      await prisma.journeyStage.update({ where: { id: lead }, data: { planId: newLead.id } });
      const eli = await person("Eli");
      await redirectOf(assignMixToContactAction(form({ contactId: eli, mixId: newLead.id, startDate: today() })));
      const started = await prisma.mixAssignment.findUniqueOrThrow({ where: { assignmentKey: `${workspaceId}:${newLead.id}:${eli}` } });
      expect(await prisma.contactJourney.findUniqueOrThrow({ where: { contactId: eli } })).toMatchObject({ stageId: lead, managedAssignmentId: started.id });
    });

    it("the Mix the owner picks while adding someone sets the stage over an Everyone Mix (ORD-01)", async () => {
      const qualify = await mix("Qualify", { stageId: prospect });
      await mix("Monthly tips", { stageId: retention, audienceEveryone: true });
      const uma = await person("Uma");
      await prisma.$transaction(tx => placeNewContacts(tx, { workspaceId, contactIds: [uma], mixId: qualify.id, chosenByOwner: true, explicit: true }));
      expect(await stageOf(uma)).toBe(prospect);
    });

    it("counts who turning a Mix on would move, as the start decides (UX-01)", async () => {
      const care = await mix("Client care", { stageId: client, status: "DRAFT" });
      const tag = await prisma.group.create({ data: { workspaceId, name: "Clients" } });
      const [inLead, fresh, already, restricted, paused, stopped] = await Promise.all(["In lead", "Fresh", "Already", "Restricted", "Paused", "Stopped"].map(person));
      await prisma.contactGroupMembership.createMany({ data: [inLead, fresh, already, restricted, paused, stopped].map(contactId => ({ contactId, groupId: tag.id })) });
      await placeIn(inLead, lead);
      await placeIn(already, client);
      await placeIn(paused, lead, { automatic: false });
      await prisma.contactRelationshipState.create({ data: { workspaceId, contactId: restricted, doNotContact: true } });
      await prisma.mixStop.create({ data: { workspaceId, contactId: stopped, mixId: care.id, reason: "Owner stopped this" } });
      const outsider = await person("Not tagged");
      await placeIn(outsider, lead);
      const before = await older("Before stages");
      expect(await stageMovesForAudience(prisma, { workspaceId, stageId: client, all: false, groupIds: [tag.id], mixId: care.id })).toEqual({ moving: 2, fromOtherStages: 1, starting: 6 });
      // Everyone moves only people with no stage who aren't new (D66): here, the person added before stages.
      expect(await stageMovesForAudience(prisma, { workspaceId, stageId: client, all: true, groupIds: [], mixId: care.id })).toEqual({ moving: 1, fromOtherStages: 0, starting: 8 });
      // Everyone and a tag together: the tag's members from any stage, plus Everyone's.
      expect(await stageMovesForAudience(prisma, { workspaceId, stageId: client, all: true, groupIds: [tag.id], mixId: care.id })).toEqual({ moving: 3, fromOtherStages: 1, starting: 8 });
      await prisma.journeyPreference.update({ where: { workspaceId }, data: { enabled: false } });
      expect(await stageMovesForAudience(prisma, { workspaceId, stageId: client, all: true, groupIds: [], mixId: care.id })).toEqual({ moving: 0, fromOtherStages: 0, starting: 8 });
      expect(before).toBeTruthy();
    });
  });

  describe("audience changes, Journey work and scale (round 2 fixes)", () => {
    it("ticking Everyone on an active Mix that names a stage is reviewed, and moves the people the review counted (UX-02)", async () => {
      const tag = await prisma.group.create({ data: { workspaceId, name: "Newsletter" } });
      const ann = await person("Ann"), bob = await person("Bob"), cy = await person("Cy"), dot = await older("Dot");
      await prisma.contactGroupMembership.createMany({ data: [ann, cy].map(contactId => ({ contactId, groupId: tag.id })) });
      await placeIn(bob, client);
      await placeIn(cy, retention);
      const tips = await mix("Monthly tips", { stageId: prospect });
      await prisma.mixAssignment.create({ data: { workspaceId, mixId: tips.id, groupId: tag.id, mode: "DYNAMIC", assignmentKey: `${workspaceId}:${tips.id}:group:${tag.id}`, startDate: new Date() } });
      await prisma.userPreference.upsert({ where: { userId }, create: { userId, reviewMixActivation: false }, update: { reviewMixActivation: false } });
      const editor = async (fields: Record<string, string | string[]>) => {
        const current = await prisma.mix.findUniqueOrThrow({ where: { id: tips.id } });
        const step = await prisma.mixStep.findFirstOrThrow({ where: { mixId: tips.id, isActive: true } });
        return form({ name: "Monthly tips", mixId: tips.id, mixStepId: step.id, mixUpdatedAt: current.updatedAt.toISOString(), status: "ACTIVE", triggerMode: "MANUAL_START", dayOffset: "0", sendTimeMinutes: "", plannedAt: "", anchor: "CALENDAR_DAY", offsetMinutes: "", "inlineName-0": "Check in", "inlineChannel-0": "PHONE_CALL", "inlineScript-0": "Ask how it went.", groupIds: tag.id, stageId: prospect, ...fields });
      };
      // Without the review, the save is refused and no one moves.
      const refused = await redirectOf(saveMixAction(await editor({ assignAllContacts: "on" })));
      expect(refused.pathname).toBe(`/mixes/${tips.id}/edit`);
      expect(refused.searchParams.get("error")).not.toBeNull();
      expect([await stageOf(bob), await stageOf(cy)]).toEqual([client, retention]);
      // The review's count is who the confirmed save moves: Everyone moves only Dot, who has no stage and isn't new;
      // Bob and Cy keep their stages, and Ann, who is new, waits for the stage new people join (D66).
      const counted = await stageMovesForAudience(prisma, { workspaceId, stageId: prospect, all: true, groupIds: [], mixId: tips.id });
      expect(counted).toEqual({ moving: 1, fromOtherStages: 0, starting: 4 });
      const saved = await redirectOf(saveMixAction(await editor({ assignAllContacts: "on", activationConfirmed: "1" })));
      expect(saved.searchParams.get("error")).toBeNull();
      expect([await stageOf(ann), await stageOf(bob), await stageOf(cy), await stageOf(dot)]).toEqual([null, client, retention, prospect]);
      expect(await prisma.journeyEvent.count({ where: { workspaceId, eventType: "MANUAL", source: "Mix: Monthly tips" } })).toBe(counted.moving);
      // A save that starts no one more needs no review.
      const again = await redirectOf(saveMixAction(await editor({ assignAllContacts: "on" })));
      expect(again.searchParams.get("error")).toBeNull();
      // Adding a tag starts its members, so it is reviewed too.
      const more = await prisma.group.create({ data: { workspaceId, name: "Referrals" } });
      const dee = await person("Dee");
      await prisma.contactGroupMembership.create({ data: { contactId: dee, groupId: more.id } });
      const unreviewed = await redirectOf(saveMixAction(await editor({ assignAllContacts: "", groupIds: [tag.id, more.id] })));
      expect(unreviewed.searchParams.get("error")).not.toBeNull();
      expect(await prisma.mixAssignment.count({ where: { workspaceId, mixId: tips.id, groupId: more.id } })).toBe(0);
      expect(await stageOf(dee)).toBeNull();
      expect(await stageMovesForAudience(prisma, { workspaceId, stageId: prospect, all: false, groupIds: [more.id], mixId: tips.id })).toEqual({ moving: 1, fromOtherStages: 0, starting: 1 });
    });

    it("a Journey Start of a stage's own Mix sets the stage, and the stage doesn't manage Journey work (STG-03)", async () => {
      const qualify = await mix("Qualify", { stageId: prospect });
      await prisma.journeyStage.update({ where: { id: prospect }, data: { planId: qualify.id } });
      const gus = await person("Gus");
      await placeIn(gus, lead);
      await startWorkflowInstance({ workspaceId, contactId: gus, mixId: qualify.id, requestId: randomUUID() });
      expect(await prisma.contactJourney.findUniqueOrThrow({ where: { contactId: gus } })).toMatchObject({ stageId: prospect, managedAssignmentId: null });
    });

    it("a tag's start doesn't take over a run the owner started by hand (STG-04)", async () => {
      const qualify = await mix("Qualify");
      await prisma.journeyStage.update({ where: { id: prospect }, data: { planId: qualify.id } });
      const hal = await person("Hal");
      await placeIn(hal, lead);
      await redirectOf(assignMixToContactAction(form({ contactId: hal, mixId: qualify.id, startDate: today() })));
      expect(await stageOf(hal)).toBe(lead);
      await prisma.mix.update({ where: { id: qualify.id }, data: { stageId: prospect } });
      const tag = await prisma.group.create({ data: { workspaceId, name: "Qualified" } });
      await prisma.contactGroupMembership.create({ data: { contactId: hal, groupId: tag.id } });
      await prisma.mixAssignment.create({ data: { workspaceId, mixId: qualify.id, groupId: tag.id, mode: "DYNAMIC", assignmentKey: `${workspaceId}:${qualify.id}:group:${tag.id}`, startDate: new Date() } });
      await prisma.$transaction(tx => setStagesFromTagJoins(tx, { workspaceId, joins: [{ contactId: hal, groupId: tag.id }] }));
      expect(await prisma.contactJourney.findUniqueOrThrow({ where: { contactId: hal } })).toMatchObject({ stageId: prospect, managedAssignmentId: null });
    });

    it("Add a contact's date-based pick sets the stage over an Everyone Mix (ORD-01)", async () => {
      const followUpType = (await prisma.dateType.create({ data: { workspaceId, scopeKey: workspaceId, name: "Follow-up", slug: `follow-up-${randomUUID()}` } })).id;
      const dated = await mix("Dated check-in", { stageId: prospect, triggerMode: "DATE_TRIGGERED", dateTypeId: followUpType });
      await mix("Monthly tips", { stageId: retention, audienceEveryone: true });
      const inTwoDays = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
      const location = await redirectOf(saveContactFormAction({}, form({ requestId: randomUUID(), firstName: "Ida", lastName: "Dated", scheduleFollowUp: "on", followUpDateTypeId: followUpType, followUpDate: inTwoDays, followUpReason: "Follow up", followUpMixId: dated.id })));
      const ida = /\/contacts\/([^/?]+)/.exec(location.pathname)?.[1] ?? "";
      expect(await stageOf(ida)).toBe(prospect);
    });

    it("leaves the worker's stage pass nothing to do after an arrival join", async () => {
      const tag = await prisma.group.create({ data: { workspaceId, name: "Imported" } });
      const intro = await mix("Intro", { stageId: retention });
      await prisma.mixAssignment.create({ data: { workspaceId, mixId: intro.id, groupId: tag.id, mode: "DYNAMIC", assignmentKey: `${workspaceId}:${intro.id}:group:${tag.id}`, startDate: new Date() } });
      const jay = await person("Jay");
      await prisma.contactGroupMembership.create({ data: { contactId: jay, groupId: tag.id } });
      await prisma.$transaction(tx => setStagesFromTagJoins(tx, { workspaceId, joins: [{ contactId: jay, groupId: tag.id }] }));
      expect(await stageOf(jay)).toBe(retention);
      // The pass's own selection (runJourneyMaintenance), for this business.
      const waiting = await prisma.$queryRaw<Array<{ id: string }>>`SELECT c.id FROM "Contact" c JOIN "JourneyPreference" p ON p."workspaceId" = c."workspaceId" LEFT JOIN "ContactJourney" j ON j."contactId" = c.id WHERE c."workspaceId" = ${workspaceId} AND p.enabled = true AND c."archivedAt" IS NULL AND j."contactId" IS NULL AND c."createdAt" >= p."enabledAt"`;
      expect(waiting.map(row => row.id)).not.toContain(jay);
      expect(await prisma.journeyEvent.count({ where: { workspaceId, contactId: jay, eventKey: `journey-new:${jay}` } })).toBe(1);
    });

    it("tagging 300 fresh imports whose tag's Mix names a stage fits one bulk action (PERF-01)", async () => {
      const newLead = await mix("New lead");
      await prisma.journeyStage.update({ where: { id: lead }, data: { planId: newLead.id } });
      const tag = await prisma.group.create({ data: { workspaceId, name: "Imported" } });
      const intro = await mix("Intro", { stageId: prospect });
      await prisma.mixAssignment.create({ data: { workspaceId, mixId: intro.id, groupId: tag.id, mode: "DYNAMIC", assignmentKey: `${workspaceId}:${intro.id}:group:${tag.id}`, startDate: new Date() } });
      await prisma.contact.createMany({ data: Array.from({ length: 300 }, (_, index) => ({ workspaceId, displayName: `Imported ${index}` })) });
      const ids = (await prisma.contact.findMany({ where: { workspaceId, displayName: { startsWith: "Imported " } }, select: { id: true } })).map(contact => contact.id);
      const started = Date.now();
      const done = await redirectOf(bulkAssignGroupAction(form({ groupId: tag.id, contactIds: ids })));
      expect(done.searchParams.get("error")).toBeNull();
      expect(Date.now() - started).toBeLessThan(5_000);
      expect(await prisma.contactJourney.count({ where: { workspaceId, contactId: { in: ids }, stageId: prospect } })).toBe(300);
      expect(await prisma.mixAssignment.count({ where: { workspaceId, mixId: newLead.id, contactId: { in: ids }, isActive: true } })).toBe(300);
      expect(await prisma.journeyEvent.count({ where: { workspaceId, contactId: { in: ids }, eventKey: { startsWith: "journey-new:" } } })).toBe(300);
    }, 60_000);
  });

  describe("re-saving an Everyone Mix and the batched arrival (round 3 fixes)", () => {
    it("re-saving an Everyone Mix moves no one; resuming it moves the people added while it was off (UX-03, D58)", async () => {
      const tag = await prisma.group.create({ data: { workspaceId, name: "Regulars" } });
      // Both have no stage and were added before stages, so D66 alone wouldn't keep them where they are.
      const rae = await older("Rae"), sid = await older("Sid");
      await prisma.contactGroupMembership.create({ data: { contactId: sid, groupId: tag.id } });
      const tips = await mix("Monthly tips", { stageId: prospect, audienceEveryone: true });
      // Rae had an Everyone place that the owner removed (Remove writes no stop).
      await prisma.mixAssignment.create({ data: { workspaceId, mixId: tips.id, contactId: rae, mode: "DYNAMIC", isActive: false, assignmentKey: `${workspaceId}:${tips.id}:audience:${rae}` } });
      // Sid is in the Mix through a tag, so the placement gave him no Everyone place.
      await prisma.mixAssignment.create({ data: { workspaceId, mixId: tips.id, groupId: tag.id, mode: "DYNAMIC", assignmentKey: `${workspaceId}:${tips.id}:group:${tag.id}`, startDate: new Date() } });
      const editor = async (fields: Record<string, string>) => {
        const current = await prisma.mix.findUniqueOrThrow({ where: { id: tips.id } });
        const step = await prisma.mixStep.findFirstOrThrow({ where: { mixId: tips.id, isActive: true } });
        return form({ name: "Monthly tips", mixId: tips.id, mixStepId: step.id, mixUpdatedAt: current.updatedAt.toISOString(), triggerMode: "MANUAL_START", dayOffset: "0", sendTimeMinutes: "", plannedAt: "", anchor: "CALENDAR_DAY", offsetMinutes: "", "inlineName-0": "Check in", "inlineChannel-0": "PHONE_CALL", "inlineScript-0": "Ask how they’re doing.", groupIds: tag.id, assignAllContacts: "on", stageId: prospect, ...fields });
      };
      await prisma.userPreference.upsert({ where: { userId }, create: { userId, reviewMixActivation: false }, update: { reviewMixActivation: false } });
      const saved = await redirectOf(saveMixAction(await editor({ status: "ACTIVE" })));
      expect(saved.searchParams.get("error")).toBeNull();
      expect([await stageOf(rae), await stageOf(sid)]).toEqual([null, null]);
      // Paused, then someone is added; turning it back on in the editor moves only them.
      await redirectOf(saveMixAction(await editor({ status: "PAUSED" })));
      const tia = (await prisma.contact.create({ data: { workspaceId, displayName: "Tia", createdAt: new Date(Date.now() - 86_400_000) } })).id;
      await redirectOf(saveMixAction(await editor({ status: "ACTIVE" })));
      expect([await stageOf(rae), await stageOf(sid), await stageOf(tia)]).toEqual([null, null, prospect]);
    });

    it("the batched arrival keeps changeManagedPlan's rules for the arrival stage's Mix (PERF-01)", async () => {
      const newLead = await mix("New lead");
      await prisma.journeyStage.update({ where: { id: lead }, data: { planId: newLead.id } });
      const qualify = await mix("Qualify", { stageId: prospect });
      const [stopped, exited, running, lapsed] = await Promise.all(["Stopped", "Exited", "Running", "Lapsed"].map(person));
      await prisma.mixStop.create({ data: { workspaceId, contactId: stopped, mixId: newLead.id, reason: "Owner stopped this" } });
      await prisma.mixStop.create({ data: { workspaceId, contactId: exited, mixId: newLead.id, reason: "journey.stage.exit" } });
      await prisma.mixAssignment.create({ data: { workspaceId, contactId: running, mixId: newLead.id, assignmentKey: `${workspaceId}:${newLead.id}:${running}`, isActive: true, startDate: new Date() } });
      const old = await prisma.mixAssignment.create({ data: { workspaceId, contactId: lapsed, mixId: newLead.id, assignmentKey: `${workspaceId}:${newLead.id}:${lapsed}`, isActive: false } });
      await prisma.$transaction(tx => setStagesFromMixStarts(tx, { workspaceId, starts: [stopped, exited, running, lapsed].map(contactId => ({ contactId, mixId: qualify.id })) }));
      for (const contactId of [stopped, exited, running, lapsed]) expect(await stageOf(contactId)).toBe(prospect);
      const assigned = async (contactId: string) => Boolean(await prisma.contactActivity.findFirst({ where: { workspaceId, contactId, summary: { contains: "The stage’s follow-up Mix is assigned." } } }));
      const runs = (contactId: string) => prisma.mixAssignment.count({ where: { workspaceId, contactId, mixId: newLead.id, isActive: true } });
      // A manual stop is kept, and the Mix doesn't start.
      expect([await assigned(stopped), await runs(stopped), await prisma.mixStop.count({ where: { workspaceId, contactId: stopped, mixId: newLead.id } })]).toEqual([false, 0, 1]);
      // The stage's own exit stop is cleared, and the Mix starts again.
      expect([await assigned(exited), await runs(exited), await prisma.mixStop.count({ where: { workspaceId, contactId: exited, mixId: newLead.id } })]).toEqual([true, 1, 0]);
      // A run of their own keeps running and isn't taken over.
      expect([await assigned(running), await runs(running)]).toEqual([false, 1]);
      // An ended enrollment is started again.
      expect(await assigned(lapsed)).toBe(true);
      expect((await prisma.mixAssignment.findUniqueOrThrow({ where: { id: old.id } })).isActive).toBe(true);
      expect(await prisma.job.count({ where: { workspaceId, task: "generate-jumps", payload: { equals: { contactId: lapsed, mixId: newLead.id } } } })).toBe(1);
    });
  });

  describe("resuming an Everyone Mix (round 4 fixes)", () => {
    async function pausedEveryone() {
      const tag = await prisma.group.create({ data: { workspaceId, name: "Regulars" } });
      const tips = await mix("Monthly tips", { stageId: prospect, audienceEveryone: true, status: "PAUSED" });
      await prisma.mixAssignment.create({ data: { workspaceId, mixId: tips.id, groupId: tag.id, mode: "DYNAMIC", assignmentKey: `${workspaceId}:${tips.id}:group:${tag.id}`, startDate: new Date() } });
      // Sid joined the Mix through a tag, so no Everyone place was made for him; Tia has no place yet. Neither has a
      // stage, and both were added before stages, so only the route decides (D66 would move either).
      const sid = await older("Sid"), tia = await older("Tia");
      await prisma.contactGroupMembership.create({ data: { contactId: sid, groupId: tag.id } });
      await prisma.userPreference.upsert({ where: { userId }, create: { userId, reviewMixActivation: false }, update: { reviewMixActivation: false } });
      return { tips, tag, sid, tia };
    }

    it("Resume on the Mixes list moves the people added while it was off, not people in it by a tag (UX-04)", async () => {
      const { tips, sid, tia } = await pausedEveryone();
      const done = await redirectOf(activateMixAction(form({ mixId: tips.id })));
      expect(done.searchParams.get("error")).toBeNull();
      expect((await prisma.mix.findUniqueOrThrow({ where: { id: tips.id } })).status).toBe("ACTIVE");
      expect([await stageOf(sid), await stageOf(tia)]).toEqual([null, prospect]);
    });

    it("resuming in the editor moves the same people (UX-04)", async () => {
      const { tips, tag, sid, tia } = await pausedEveryone();
      const step = await prisma.mixStep.findFirstOrThrow({ where: { mixId: tips.id, isActive: true } });
      const saved = await redirectOf(saveMixAction(form({ name: "Monthly tips", mixId: tips.id, mixStepId: step.id, mixUpdatedAt: tips.updatedAt.toISOString(), status: "ACTIVE", triggerMode: "MANUAL_START", dayOffset: "0", sendTimeMinutes: "", plannedAt: "", anchor: "CALENDAR_DAY", offsetMinutes: "", "inlineName-0": "Check in", "inlineChannel-0": "PHONE_CALL", "inlineScript-0": "Ask how it went.", groupIds: tag.id, assignAllContacts: "on", stageId: prospect })));
      expect(saved.searchParams.get("error")).toBeNull();
      expect([await stageOf(sid), await stageOf(tia)]).toEqual([null, prospect]);
    });

    it("Resume leaves people in the Mix by their own start or a Journey run, and moves a hidden tag's members (UX-04, UX-06)", async () => {
      const { tips, sid, tia } = await pausedEveryone();
      const quiet = await prisma.group.create({ data: { workspaceId, name: "Quiet" } });
      await prisma.contactGroupState.create({ data: { workspaceId, groupId: quiet.id, isActive: false } });
      await prisma.mixAssignment.create({ data: { workspaceId, mixId: tips.id, groupId: quiet.id, mode: "DYNAMIC", assignmentKey: `${workspaceId}:${tips.id}:group:${quiet.id}`, startDate: new Date() } });
      const [own, journey, hiddenMember] = await Promise.all(["Own start", "Journey start", "Hidden tag"].map(older));
      await prisma.contactGroupMembership.create({ data: { contactId: hiddenMember, groupId: quiet.id } });
      await prisma.mixAssignment.create({ data: { workspaceId, contactId: own, mixId: tips.id, assignmentKey: `${workspaceId}:${tips.id}:${own}`, isActive: true, startDate: new Date() } });
      await prisma.mixWorkflowInstance.create({ data: { workspaceId, contactId: journey, admissionKey: `start:${randomUUID()}`, label: "Start", definition: {}, state: { runs: [{ id: "run-1", mixId: tips.id, startedAt: new Date().toISOString(), completedAt: null, status: "ACTIVE", parentTransitionId: null }] } } });
      await redirectOf(activateMixAction(form({ mixId: tips.id })));
      expect([await stageOf(own), await stageOf(journey), await stageOf(sid)]).toEqual([null, null, null]);
      // A hidden tag runs nothing, so its member is a newcomer to the Mix like Tia.
      expect([await stageOf(hiddenMember), await stageOf(tia)]).toEqual([prospect, prospect]);
    });

    it("a Journey run counts while its work is going or paused, not when stopped or when it mirrors an enrollment (UX-07)", async () => {
      const { tips } = await pausedEveryone();
      const run = (legacy?: boolean) => ({ id: randomUUID(), mixId: tips.id, startedAt: new Date().toISOString(), completedAt: null, status: "ACTIVE", parentTransitionId: null, ...(legacy === undefined ? {} : { legacy }) });
      const [paused, stopped, mirrored, finished] = await Promise.all(["Paused work", "Stopped work", "Mirrored run", "Finished run"].map(older));
      const instance = (contactId: string, status: string, runs: unknown[]) => prisma.mixWorkflowInstance.create({ data: { workspaceId, contactId, status, admissionKey: `start:${randomUUID()}`, label: "Start", definition: {}, state: { runs } as object } });
      await instance(paused, "PAUSED", [run(false)]);
      await instance(stopped, "STOPPED", [run(false)]);
      await instance(mirrored, "ACTIVE", [run(true)]);
      await instance(finished, "ACTIVE", [{ ...run(false), status: "FINISHED" }]);
      await redirectOf(activateMixAction(form({ mixId: tips.id })));
      expect([await stageOf(paused), await stageOf(stopped), await stageOf(mirrored), await stageOf(finished)]).toEqual([null, prospect, prospect, prospect]);
    });

    it("ticking Everyone and adding a tag in one save counts and moves the tag's members from any stage (UX-08, D66)", async () => {
      const tips = await mix("Monthly tips", { stageId: prospect });
      const tag = await prisma.group.create({ data: { workspaceId, name: "Clients" } });
      const [tagged, everyoneOnly, noStage] = [await person("Tagged client"), await person("Everyone client"), await older("No stage")];
      await prisma.contactGroupMembership.create({ data: { contactId: tagged, groupId: tag.id } });
      await placeIn(tagged, client);
      await placeIn(everyoneOnly, client);
      await prisma.userPreference.upsert({ where: { userId }, create: { userId, reviewMixActivation: false }, update: { reviewMixActivation: false } });
      // The editor counts Everyone and the added tag together.
      const counted = await stageMovesForAudience(prisma, { workspaceId, stageId: prospect, all: true, groupIds: [tag.id], mixId: tips.id });
      expect(counted).toEqual({ moving: 2, fromOtherStages: 1, starting: 3 });
      const step = await prisma.mixStep.findFirstOrThrow({ where: { mixId: tips.id, isActive: true } });
      const saved = await redirectOf(saveMixAction(form({ name: "Monthly tips", mixId: tips.id, mixStepId: step.id, mixUpdatedAt: tips.updatedAt.toISOString(), status: "ACTIVE", activationConfirmed: "1", triggerMode: "MANUAL_START", dayOffset: "0", sendTimeMinutes: "", plannedAt: "", anchor: "CALENDAR_DAY", offsetMinutes: "", "inlineName-0": "Check in", "inlineChannel-0": "PHONE_CALL", "inlineScript-0": "Ask how it went.", assignAllContacts: "on", groupIds: tag.id, stageId: prospect })));
      expect(saved.searchParams.get("error")).toBeNull();
      // The tag's start wins over Everyone's for its member, so the tagged client moves; Everyone moves only the
      // person with no stage, and the other client keeps theirs (TST-07).
      expect([await stageOf(tagged), await stageOf(everyoneOnly), await stageOf(noStage)]).toEqual([prospect, client, prospect]);
      expect(await prisma.journeyEvent.count({ where: { workspaceId, eventType: "MANUAL", source: "Mix: Monthly tips" } })).toBe(counted.moving);
    });

    it("Start Mix on the list reviews a draft Everyone Mix that names a stage even before it has places (UX-05)", async () => {
      const draft = await mix("Spring check-in", { stageId: prospect, audienceEveryone: true, status: "DRAFT" });
      await prisma.userPreference.upsert({ where: { userId }, create: { userId, reviewMixActivation: false }, update: { reviewMixActivation: false } });
      const review = await redirectOf(activateMixAction(form({ mixId: draft.id })));
      expect(`${review.pathname}${review.search}`).toBe(`/mixes/${draft.id}/edit?activate=1`);
      expect((await prisma.mix.findUniqueOrThrow({ where: { id: draft.id } })).status).toBe("DRAFT");
    });
  });
});
