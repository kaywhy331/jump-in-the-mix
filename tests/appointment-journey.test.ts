import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { recordAppointmentOutcome, scheduleVisit } from "../src/lib/appointment-bindings";
import { enableJourney, recordJourneyEvent } from "../src/lib/journey";
import { APPOINTMENT_HOLD_METHODS, reconcileJumps } from "../src/lib/jump-engine";
import { prisma } from "../src/lib/prisma";
import { createBroadcastFixture, type BroadcastFixture } from "./helpers/broadcast-fixture";

const DAY = 86_400_000;
const TIMEZONE = "America/Denver";

describe.sequential("visit outcomes coexist with the customer journey", () => {
  let fixture: BroadcastFixture;
  let workspaceId: string;
  let planId: string;
  let stages: Array<{ id: string }>;
  const visit = (contactId: string, days: number, title: string) => {
    const startsAt = new Date(Date.now() + days * DAY);
    return scheduleVisit({ workspaceId, title, kind: "MEETING", startsAt, endsAt: new Date(startsAt.getTime() + 1_800_000), timezone: TIMEZONE, contactId, planId, allowOverlap: true });
  };
  const rows = (contactId: string, bindingId: string | null) => prisma.jump.findMany({ where: { workspaceId, contactId, mixId: planId, appointmentBindingId: bindingId }, include: { mixStep: { select: { dayOffset: true } } }, orderBy: { mixStep: { sortOrder: "asc" } } });

  beforeAll(async () => {
    fixture = await createBroadcastFixture("journey-visit", "Jo");
    workspaceId = fixture.workspaceId;
    const template = await prisma.stepTemplate.create({ data: { workspaceId, name: "Visit plan", channel: "SMS" } });
    const before = await prisma.stepVersion.create({ data: { stepTemplateId: template.id, version: 1, body: "See you {{Appointment Date}}" } });
    const after = await prisma.stepVersion.create({ data: { stepTemplateId: template.id, version: 2, body: "Thanks for meeting, {{First Name}}" } });
    const mix = await prisma.mix.create({ data: { workspaceId, name: "Visit plan", triggerMode: "MANUAL_START", status: "ACTIVE" } });
    planId = mix.id;
    await prisma.mixStep.createMany({ data: [
      { mixId: mix.id, stepVersionId: before.id, dayOffset: -1, sortOrder: 1, sendTimeMinutes: 9 * 60 },
      { mixId: mix.id, stepVersionId: after.id, dayOffset: 3, sortOrder: 2, sendTimeMinutes: 10 * 60 }
    ] });
    await enableJourney(workspaceId);
    stages = await prisma.journeyStage.findMany({ where: { workspaceId }, orderBy: { position: "asc" }, select: { id: true } });
    // The first stage runs this plan for everyone in it, and an enabled outcome rule moves a
    // person on once a visit happened. Scheduling itself does not move anyone in this business.
    await prisma.journeyStage.update({ where: { id: stages[0].id }, data: { planId } });
    await prisma.journeyRule.deleteMany({ where: { workspaceId, eventType: "MEETING_SCHEDULED" } });
    await prisma.journeyRule.create({ data: { workspaceId, fromStageId: stages[0].id, toStageId: stages[1].id, eventType: "MEETING_COMPLETED", enabled: true } });
  });
  afterAll(() => fixture.cleanup());

  it("moves the person on after a completed visit without cancelling the other visit's bound follow-ups", async () => {
    const contactId = fixture.contactId;
    await recordJourneyEvent({ workspaceId, contactId, eventType: "CONTACT_RECEIVED", eventKey: randomUUID(), source: "Test" });
    const entered = await prisma.contactJourney.findUniqueOrThrow({ where: { contactId } });
    expect(entered.stageId).toBe(stages[0].id);
    expect(entered.managedAssignmentId).toBeTruthy();
    // Two visits, each bound to the same plan on its own, alongside the journey's own enrollment.
    const first = await visit(contactId, 1, "First visit");
    const second = await visit(contactId, 4, "Second visit");
    expect([first.unscopedEnrollmentKept, second.unscopedEnrollmentKept]).toEqual([true, true]);
    await reconcileJumps({ workspaceId, mixId: planId });
    expect((await rows(contactId, null)).map((row) => row.status)).toEqual(["PENDING", "PENDING"]);
    expect((await rows(contactId, first.bindingId!)).map((row) => [row.mixStep.dayOffset, row.status])).toEqual([[-1, "PENDING"]]);
    expect((await rows(contactId, second.bindingId!)).map((row) => [row.mixStep.dayOffset, row.status])).toEqual([[-1, "PENDING"]]);

    const entry = await prisma.calendarEntry.findUniqueOrThrow({ where: { id: first.entryId } });
    expect(await recordAppointmentOutcome({ workspaceId, actorUserId: fixture.userId, entryId: first.entryId, version: entry.version, outcome: "COMPLETED" })).toEqual({ ok: true });

    // The outcome rule moved the person on, which ends the journey's own enrollment in the plan…
    expect((await prisma.contactJourney.findUniqueOrThrow({ where: { contactId } })).stageId).toBe(stages[1].id);
    expect((await prisma.mixAssignment.findUniqueOrThrow({ where: { id: entered.managedAssignmentId! } })).isActive).toBe(false);
    expect((await prisma.mixStop.findFirstOrThrow({ where: { workspaceId, contactId, mixId: planId } })).reason).toBe("journey.stage.exit");
    expect((await rows(contactId, null)).map((row) => [row.status, row.completionMethod])).toEqual([["CANCELED", "journey_stage_changed"], ["CANCELED", "journey_stage_changed"]]);
    // …and nothing else. Both visits keep their enrollment, and the stop the journey recorded
    // does not reach them: the first visit follows its outcome, the second is untouched.
    expect(await reconcileJumps({ workspaceId, mixId: planId })).toMatchObject({ canceled: 0, held: 1, created: 1, failedBindings: 0 });
    expect(await prisma.mixAssignment.count({ where: { workspaceId, mixId: planId, contactId, isActive: true, appointmentBinding: { isNot: null } } })).toBe(2);
    expect((await rows(contactId, first.bindingId!)).map((row) => [row.mixStep.dayOffset, row.status, row.completionMethod])).toEqual([[-1, "CANCELED", APPOINTMENT_HOLD_METHODS.completed], [3, "PENDING", null]]);
    expect((await rows(contactId, second.bindingId!)).map((row) => [row.mixStep.dayOffset, row.status, row.completionMethod])).toEqual([[-1, "PENDING", null]]);
    expect((await rows(contactId, null)).every((row) => row.status === "CANCELED")).toBe(true);
    expect(await reconcileJumps({ workspaceId, mixId: planId })).toMatchObject({ created: 0, updated: 0, held: 0, canceled: 0 });
  });

  it("lets the journey run its own plan for a person whose only enrollment is bound to a visit", async () => {
    const person = await prisma.contact.create({ data: { workspaceId, firstName: "Kai", displayName: "Kai" } });
    const bound = await visit(person.id, 2, "Kai's visit");
    expect(bound.bindingId).toBeTruthy();
    await recordJourneyEvent({ workspaceId, contactId: person.id, eventType: "CONTACT_RECEIVED", eventKey: randomUUID(), source: "Test" });
    const journey = await prisma.contactJourney.findUniqueOrThrow({ where: { contactId: person.id } });
    expect(journey.stageId).toBe(stages[0].id);
    expect(journey.managedAssignmentId).toBeTruthy();
    expect(await prisma.mixAssignment.count({ where: { workspaceId, mixId: planId, contactId: person.id, isActive: true } })).toBe(2);
    // A manual stop still stops everything for that person, bound or not.
    await prisma.mixStop.deleteMany({ where: { workspaceId, contactId: person.id, mixId: planId } });
    await prisma.mixStop.create({ data: { workspaceId, contactId: person.id, mixId: planId, reason: "manual.user.stop" } });
    await reconcileJumps({ workspaceId, mixId: planId });
    expect(await prisma.jump.count({ where: { workspaceId, contactId: person.id, mixId: planId, status: "PENDING" } })).toBe(0);
  });
});
