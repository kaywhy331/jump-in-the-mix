import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { readWorkflowGraph } from "@/lib/mix-workflow-view";
import { readJourneyPersonFocus } from "@/lib/journey-person-focus";
import { emptyWorkflowState } from "@/lib/mix-workflow-types";
import { workflowJson } from "@/lib/mix-workflow";
import { focusAt, journeyPersonFocusFixture } from "./helpers/journey-person-focus-fixture";

const local = /^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? "");
describe.skipIf(!local)("Journey person focus", () => {
  let fixture: Awaited<ReturnType<typeof journeyPersonFocusFixture>>;
  beforeEach(async () => { fixture = await journeyPersonFocusFixture(); });
  afterEach(async () => { await fixture?.cleanup(); });
  afterAll(async () => { await prisma.$disconnect(); });
  it("marks active personal starts without Jumps and all real work, excluding follow-up-only, inactive and foreign starts", async () => {
    const f = fixture, focus = await readJourneyPersonFocus(f.workspaceId, f.contactId);
    expect(await prisma.jump.count({ where: { workspaceId: f.workspaceId, mixId: f.mixes["Personal start"] } })).toBe(0);
    expect(new Set(focus?.personMixIds)).toEqual(new Set(["Personal start", "Past work", "Current work", "Other work"].map(name => f.mixes[name])));
    expect(new Set(focus?.activeMixIds)).toEqual(new Set([f.mixes["Current work"], f.mixes["Other work"]]));
    expect(focus?.paths).toEqual([{ instanceId: f.work.id, id: "taken-route", source: f.rules[0].source, target: f.rules[0].routes[0].target, status: "STARTED" }]);
  });
  it("marks a personal start for someone with no Journey instances or follow-ups", async () => {
    const f = fixture;
    const person = await prisma.contact.create({ data: { workspaceId: f.workspaceId, displayName: "Starts only" } });
    await prisma.mixAssignment.create({ data: { workspaceId: f.workspaceId, contactId: person.id, mixId: f.mixes["Personal start"], assignmentKey: randomUUID() } });
    expect(await readJourneyPersonFocus(f.workspaceId, person.id)).toEqual({ contactId: person.id, personMixIds: [f.mixes["Personal start"]], activeMixIds: [], paths: [] });
  });
  it("rejects a foreign contact, including an assignment mislabeled with the caller's workspace", async () => {
    const f = fixture;
    await prisma.mixAssignment.create({ data: { workspaceId: f.workspaceId, contactId: f.foreignContactId, mixId: f.mixes["Personal start"], assignmentKey: randomUUID() } });
    expect(await readJourneyPersonFocus(f.workspaceId, f.foreignContactId)).toBeNull();
    expect((await readWorkflowGraph(f.workspaceId, { contactId: f.foreignContactId, canEdit: false, now: focusAt })).personFocus).toBeNull();
    expect(await readJourneyPersonFocus(f.foreignId, f.contactId)).toBeNull();
    expect(await readJourneyPersonFocus(f.workspaceId)).toBeNull();
  });
  it("keeps saved definitions and recorded targets when the account connection changes", async () => {
    const f = fixture, rules = structuredClone(f.rules);
    rules[0].routes[0].target = { mixId: f.mixes["Retargeted work"], stepId: null };
    await prisma.mixWorkflow.update({ where: { workspaceId: f.workspaceId }, data: { revision: { increment: 1 }, configuration: workflowJson({ rules, gatedStepIds: f.saved.gatedStepIds, intentionalEnds: f.saved.intentionalEnds }) } });
    const current = await readWorkflowGraph(f.workspaceId, { contactId: f.contactId, canEdit: false, now: focusAt });
    const historical = await readWorkflowGraph(f.workspaceId, { contactId: f.contactId, instanceId: f.work.id, canEdit: false, now: focusAt });
    expect(current.configuration.rules[0].routes[0].target).toEqual(rules[0].routes[0].target);
    expect(historical.historical).toBe(true);
    expect(historical.configuration.rules[0].routes[0].target).toEqual(f.rules[0].routes[0].target);
    expect(current.personFocus).toEqual(historical.personFocus);
    expect(current.personFocus?.paths[0].target).toEqual(f.rules[0].routes[0].target);
  });
  it("marks a recorded join only from branches that finished, excluding canceled paths", async () => {
    const f = fixture, state = structuredClone(f.state), saved = structuredClone(f.saved);
    const target = { mixId: f.mixes["Other work"], stepId: null };
    saved.rules[0].join = { mode: "ANY", target, cancelRemaining: true };
    saved.rules[0].routes.push({ ...saved.rules[0].routes[0], id: "canceled-route", target: { mixId: f.mixes["Personal start"], stepId: null } });
    state.transitions[0].status = "FINISHED";
    state.transitions.push({ ...state.transitions[0], id: "canceled", routeId: "canceled-route", status: "CANCELED" });
    state.transitions.push({ ...state.transitions[0], id: "join", routeId: "taken:join", target, status: "WAITING", startedAt: null });
    await prisma.mixWorkflowInstance.update({ where: { id: f.work.id }, data: { definition: workflowJson(saved), state: workflowJson(state) } });
    const focus = await readJourneyPersonFocus(f.workspaceId, f.contactId);
    expect(focus?.paths.map(path => path.id)).toEqual(["taken-route", "taken:join:taken-route"]);
    expect(focus?.paths[1]).toMatchObject({ source: { mixId: f.mixes["Current work"], stepId: null }, target, status: "WAITING" });
  });
  it("includes work beyond the 50-card and 250-read pages, without foreign or canceled runs", async () => {
    const f = fixture, state = emptyWorkflowState();
    state.runs = [{ ...f.state.runs[1], mixId: f.mixes["Retargeted work"] }];
    const rows = Array.from({ length: 251 }, (_, index) => ({ id: `focus-${f.workspaceId}-${String(index).padStart(3, "0")}`, workspaceId: f.workspaceId, contactId: f.contactId, admissionKey: randomUUID(), label: "Paged work", definition: workflowJson(f.saved), state: workflowJson(index === 250 ? state : emptyWorkflowState()), updatedAt: focusAt }));
    await prisma.mixWorkflowInstance.createMany({ data: rows });
    await prisma.mixWorkflowInstance.create({ data: { workspaceId: f.foreignId, contactId: f.foreignContactId, admissionKey: randomUUID(), label: "Foreign work", definition: workflowJson(f.saved), state: workflowJson({ ...state, runs: [{ ...state.runs[0], mixId: f.mixes["Foreign start"] }] }) } });
    await prisma.mixWorkflowInstance.create({ data: { ...rows[0], id: randomUUID(), admissionKey: randomUUID(), state: workflowJson({ ...state, runs: [{ ...state.runs[0], status: "CANCELED", mixId: f.mixes["Inactive start"] }] }) } });
    const graph = await readWorkflowGraph(f.workspaceId, { contactId: f.contactId, canEdit: false, now: focusAt });
    expect(graph.instances).toHaveLength(50);
    expect(graph.personFocus?.personMixIds).toContain(f.mixes["Retargeted work"]);
    expect(graph.personFocus?.personMixIds).not.toContain(f.mixes["Foreign start"]);
    expect(graph.personFocus?.personMixIds).not.toContain(f.mixes["Inactive start"]);
  });
});
