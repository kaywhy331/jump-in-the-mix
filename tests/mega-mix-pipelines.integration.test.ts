import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { installMegaMix } from "@/lib/mega-mix-service";
import { MEGA_MIXES } from "@/lib/mega-mixes";
import { readWorkflowDefinition } from "@/lib/mix-workflow";
import { numberJourneyBeats } from "@/lib/journey-numbering";
import { parsePortable, portableFingerprint } from "@/lib/mix-portable";
import { createMegaMixPipeline, deleteMegaMixPipeline, duplicateMegaMixPipeline, exportMegaMixPipeline, exportSingleMix, importPortable, updateMegaMixPipeline } from "@/lib/mega-mix-pipeline-service";

const local = /^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? "");
describe.skipIf(!local)("named Mega-Mixes, export and import", () => {
  let userId: string, workspaceId: string, otherUserId: string, otherWorkspaceId: string;
  const fixture = async (label: string) => {
    const user = await prisma.user.create({ data: { name: label, email: `${label}-${randomUUID()}@example.invalid` } });
    const workspace = await prisma.workspace.create({ data: { ownerId: user.id, name: label, slug: randomUUID() } });
    return [user.id, workspace.id] as const;
  };
  beforeEach(async () => { [userId, workspaceId] = await fixture("pipeline-owner"); [otherUserId, otherWorkspaceId] = await fixture("pipeline-other"); });
  afterEach(async () => { await prisma.workspace.deleteMany({ where: { id: { in: [workspaceId, otherWorkspaceId] } } }); await prisma.user.deleteMany({ where: { id: { in: [userId, otherUserId] } } }); });
  afterAll(async () => { await prisma.$disconnect(); });

  it("names each ready-made install and numbers a repeat name", async () => {
    await createMegaMixPipeline({ workspaceId, actorUserId: userId, name: "Contractor", mixIds: [] });
    const installed = await installMegaMix({ workspaceId, actorUserId: userId, blueprintId: "contractor", expectedVersion: 1 });
    const pipeline = await prisma.megaMixPipeline.findUniqueOrThrow({ where: { id: installed.id }, include: { members: true } });
    expect(pipeline).toMatchObject({ name: "Contractor 2", origin: "BLUEPRINT:contractor" });
    expect(pipeline.members).toHaveLength(MEGA_MIXES[0].nodes.length);
  });

  it("exports a Mega-Mix and imports it into another account as an identical, independent journey", async () => {
    const installed = await installMegaMix({ workspaceId, actorUserId: userId, blueprintId: "contractor", expectedVersion: 1 });
    const exported = await exportMegaMixPipeline(prisma, workspaceId, installed.id);
    expect(exported.omittedConnections).toBe(0);
    // The file round-trips through its own reader.
    const value = parsePortable(JSON.stringify(exported.package));
    const result = await importPortable({ workspaceId: otherWorkspaceId, actorUserId: otherUserId, value, name: "Our contractor pipeline", origin: "FILE", source: "test" });
    const [source, copy] = await Promise.all([readWorkflowDefinition(prisma, workspaceId), readWorkflowDefinition(prisma, otherWorkspaceId)]);
    const shape = (definition: typeof source) => { const numbers = numberJourneyBeats(definition.mixes, definition); return definition.mixes.map(mix => ({ name: mix.name, beats: mix.steps.map(step => `${numbers[step.id]}:${step.name}:${step.channel}:${step.dayOffset}:${step.body}`) })).sort((a, b) => a.name.localeCompare(b.name)); };
    expect(shape(copy)).toEqual(shape(source));
    expect(copy.rules).toHaveLength(source.rules.length);
    expect(copy.rules.flatMap(rule => rule.routes.map(route => route.id)).some(id => source.rules.some(rule => rule.routes.some(route => route.id === id)))).toBe(false);
    expect(await prisma.megaMixPipeline.findUniqueOrThrow({ where: { id: result.pipelineId! } })).toMatchObject({ name: "Our contractor pipeline", origin: "FILE", originFingerprint: portableFingerprint(value) });
    expect(await prisma.mixWorkflowInstance.count({ where: { workspaceId: otherWorkspaceId } })).toBe(0);
    expect(await prisma.mixAssignment.count({ where: { workspaceId: otherWorkspaceId } })).toBe(0);
    // Editing the copy never changes the source.
    await prisma.mix.updateMany({ where: { workspaceId: otherWorkspaceId }, data: { name: "Changed" } });
    expect((await readWorkflowDefinition(prisma, workspaceId)).mixes.every(mix => mix.name !== "Changed")).toBe(true);
  });

  it("keeps channel versions and appointment timing through a single-Mix file", async () => {
    const installed = await installMegaMix({ workspaceId, actorUserId: userId, blueprintId: "contractor", expectedVersion: 1 });
    const member = await prisma.megaMixPipelineMix.findFirstOrThrow({ where: { pipelineId: installed.id }, orderBy: { position: "asc" }, include: { mix: { include: { steps: { orderBy: { sortOrder: "asc" } } } } } });
    const step = member.mix.steps[0];
    await prisma.stepVersionVariant.create({ data: { stepVersionId: step.stepVersionId, family: "EMAIL", subject: "Your project", body: "Email wording" } });
    await prisma.mixStep.update({ where: { id: step.id }, data: { anchor: "APPOINTMENT_START", offsetMinutes: -60 } });
    const exported = await exportSingleMix(prisma, workspaceId, member.mixId);
    const result = await importPortable({ workspaceId: otherWorkspaceId, actorUserId: otherUserId, value: parsePortable(JSON.stringify(exported.package)), name: "Imported inquiry", origin: "FILE", source: "test" });
    expect(result.pipelineId).toBeNull();
    const mix = await prisma.mix.findUniqueOrThrow({ where: { id: result.mixIds[0] }, include: { steps: { orderBy: { sortOrder: "asc" }, include: { stepVersion: { include: { variants: true } } } } } });
    expect(mix.name).toBe("Imported inquiry");
    expect(mix.steps[0]).toMatchObject({ anchor: "APPOINTMENT_START", offsetMinutes: -60 });
    expect(mix.steps[0].stepVersion.variants).toEqual([expect.objectContaining({ family: "EMAIL", subject: "Your project", body: "Email wording" })]);
  });

  it("drops connections that leave the Mega-Mix and reports how many", async () => {
    const installed = await installMegaMix({ workspaceId, actorUserId: userId, blueprintId: "contractor", expectedVersion: 1 });
    const members = await prisma.megaMixPipelineMix.findMany({ where: { pipelineId: installed.id }, orderBy: { position: "asc" } });
    await updateMegaMixPipeline({ workspaceId, actorUserId: userId, pipelineId: installed.id, name: "Front half", mixIds: members.slice(0, 3).map(member => member.mixId) });
    const exported = await exportMegaMixPipeline(prisma, workspaceId, installed.id);
    expect(exported.package.mixes).toHaveLength(3);
    expect(exported.omittedConnections).toBeGreaterThan(0);
    await expect(importPortable({ workspaceId: otherWorkspaceId, actorUserId: otherUserId, value: exported.package, name: "Front half", origin: "FILE", source: "test" })).resolves.toBeTruthy();
  });

  it("duplicates under a new name, refuses a taken name, and moves a Mix between Mega-Mixes", async () => {
    const installed = await installMegaMix({ workspaceId, actorUserId: userId, blueprintId: "contractor", expectedVersion: 1 });
    await expect(duplicateMegaMixPipeline({ workspaceId, actorUserId: userId, pipelineId: installed.id, name: "contractor" })).rejects.toThrow(/already have a Mega-Mix/);
    const copy = await duplicateMegaMixPipeline({ workspaceId, actorUserId: userId, pipelineId: installed.id, name: "Contractor — summer" });
    expect(copy.mixIds).toHaveLength(MEGA_MIXES[0].nodes.length);
    const definition = await readWorkflowDefinition(prisma, workspaceId);
    expect(definition.rules).toHaveLength(MEGA_MIXES[0].nodes.length * 2);
    const moved = copy.mixIds[0];
    const other = await createMegaMixPipeline({ workspaceId, actorUserId: userId, name: "Leads only", mixIds: [moved] });
    expect(await prisma.megaMixPipelineMix.findUniqueOrThrow({ where: { mixId: moved } })).toMatchObject({ pipelineId: other.id });
    await expect(createMegaMixPipeline({ workspaceId, actorUserId: userId, name: "Stolen", mixIds: [(await prisma.mix.create({ data: { workspaceId: otherWorkspaceId, name: "Theirs", triggerMode: "MANUAL_START" } })).id] })).rejects.toThrow(/this account/);
  });

  it("removing a Mega-Mix keeps its Mixes and allows the ready-made one to be added again", async () => {
    const installed = await installMegaMix({ workspaceId, actorUserId: userId, blueprintId: "contractor", expectedVersion: 1 });
    await deleteMegaMixPipeline({ workspaceId, actorUserId: userId, pipelineId: installed.id });
    expect(await prisma.mix.count({ where: { workspaceId } })).toBe(MEGA_MIXES[0].nodes.length);
    const again = await installMegaMix({ workspaceId, actorUserId: userId, blueprintId: "contractor", expectedVersion: 1 });
    expect(again.repeated).toBe(false);
    await expect(createMegaMixPipeline({ workspaceId, actorUserId: otherUserId, name: "Not mine", mixIds: [] })).rejects.toThrow(/unavailable/);
  });

  it("binds imported date-based Mixes to the account's existing date types instead of making duplicates", async () => {
    // The system Birthday type is shipped data; make sure this database has it, as the app installer does.
    await prisma.dateType.createMany({ data: [{ id: "system_birthday", scopeKey: "system", name: "Birthday", slug: "birthday", isSystem: true, isActive: true }], skipDuplicates: true });
    const birthday = await prisma.dateType.findUniqueOrThrow({ where: { scopeKey_slug: { scopeKey: "system", slug: "birthday" } } });
    const dateMix = (owner: string, name: string, dateTypeId: string) => prisma.mix.create({ data: { workspaceId: owner, name, triggerMode: "DATE_TRIGGERED", dateTypeId, status: "ACTIVE",
      steps: { create: { dayOffset: 0, sortOrder: 1, stepVersion: { create: { version: 1, body: `${name} {{First Name}}`, stepTemplate: { create: { workspaceId: owner, name: `${name} text`, channel: "SMS", isActive: false } } } } } } } });
    const travel = async (mixId: string, to: { workspaceId: string; userId: string }, name: string) => {
      const exported = await exportSingleMix(prisma, workspaceId, mixId);
      const result = await importPortable({ workspaceId: to.workspaceId, actorUserId: to.userId, value: parsePortable(JSON.stringify(exported.package)), name, origin: "FILE", source: "test" });
      return { exported: exported.package, mix: await prisma.mix.findUniqueOrThrow({ where: { id: result.mixIds[0] } }) };
    };
    const other = { workspaceId: otherWorkspaceId, userId: otherUserId };
    const before = await prisma.dateType.count();

    // A Mix on the system Birthday type lands on the same system type in the other account.
    const note = await dateMix(workspaceId, "Birthday note", birthday.id);
    const imported = await travel(note.id, other, "Birthday note");
    expect(imported.exported.mixes[0].dateType).toEqual({ name: "Birthday", slug: "birthday" });
    expect(imported.mix).toMatchObject({ triggerMode: "DATE_TRIGGERED", dateTypeId: birthday.id });
    expect(await prisma.dateType.count()).toBe(before);

    // A custom type is matched by name, case-insensitively, when the exported slug is another account's.
    const theirs = await prisma.dateType.create({ data: { workspaceId: otherWorkspaceId, scopeKey: otherWorkspaceId, name: "Policy renewal", slug: "policy-renewal-k3j9x2" } });
    const mine = await prisma.dateType.create({ data: { workspaceId, scopeKey: workspaceId, name: "Policy Renewal", slug: "policy-renewal-zz71pq" } });
    const renewal = await dateMix(workspaceId, "Renewal reminder", mine.id);
    expect((await travel(renewal.id, other, "Renewal reminder")).mix.dateTypeId).toBe(theirs.id);
    // A copy inside the same account keeps the exact type.
    expect((await travel(renewal.id, { workspaceId, userId }, "Renewal copy")).mix.dateTypeId).toBe(mine.id);
    expect(await prisma.dateType.count()).toBe(before + 2);

    // Only a type the account has never seen is created, once, with a fresh slug.
    const boiler = await prisma.dateType.create({ data: { workspaceId, scopeKey: workspaceId, name: "Boiler service", slug: "boiler-service-a1b2c3" } });
    const service = await dateMix(workspaceId, "Boiler service reminder", boiler.id);
    const first = await travel(service.id, other, "Boiler service reminder");
    const created = await prisma.dateType.findUniqueOrThrow({ where: { id: first.mix.dateTypeId! } });
    expect(created).toMatchObject({ workspaceId: otherWorkspaceId, name: "Boiler service", isSystem: false, isActive: true });
    expect(created.slug).toMatch(/^boiler-service-[a-z0-9]{6}$/);
    expect((await travel(service.id, other, "Boiler service again")).mix.dateTypeId).toBe(created.id);
    expect(await prisma.dateType.count()).toBe(before + 4);
  });

  it("rejects files that are not Jump in the Mix packages or point outside themselves", () => {
    expect(() => parsePortable("not json")).toThrow(/not a Jump in the Mix file/);
    expect(() => parsePortable(JSON.stringify({ format: "jump-in-the-mix", version: 9 }))).toThrow(/newer version/);
    const broken = { format: "jump-in-the-mix", version: 1, kind: "mega-mix", name: "Broken", description: null, mixes: [{ key: "m1", name: "One", description: null, category: null, industry: null, framework: null, triggerMode: "MANUAL_START", dateType: null, steps: [{ key: "b1", name: "Hi", channel: "SMS", dayOffset: 0, sendTimeMinutes: null, anchor: "CALENDAR_DAY", offsetMinutes: null, subject: null, body: "Hi", script: null, longSms: false, includeOptOut: false, variants: [] }] }],
      rules: [{ key: "c1", name: "Next", enabled: true, mode: "PARALLEL", source: { mix: "m1", beat: null }, routes: [{ key: "r1", label: "Go", when: "FINISHED", outcome: "", delayMinutes: 0, target: { mix: "m9", beat: null }, maxVisits: null, replace: false }], join: null }],
      waitingBeats: [], finishes: [] };
    expect(() => parsePortable(JSON.stringify(broken))).toThrow(/not in the file/);
  });
});
