import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { readWorkflowDefinition, saveWorkflowConfiguration } from "@/lib/mix-workflow";
import { saveWorkflowRule, WorkflowRuleConflict } from "@/lib/mix-workflow-rule-save";
import { emptyWorkflow, type WorkflowRule } from "@/lib/mix-workflow-types";

const local = /^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? "");
describe.skipIf(!local)("connection saves and retries", () => {
  let workspaceId: string, userId: string;
  let mixes: string[], beats: string[];
  beforeEach(async () => {
    const user = await prisma.user.create({ data: { name: "Rule save fixture", email: `rule-save-${randomUUID()}@example.invalid` } }); userId = user.id;
    workspaceId = (await prisma.workspace.create({ data: { ownerId: userId, name: "Rule save fixture", slug: randomUUID() } })).id;
    mixes = []; beats = [];
    for (const status of ["ACTIVE", "DRAFT"] as const) {
      const mix = await prisma.mix.create({ data: { workspaceId, name: status, status, triggerMode: "MANUAL_START" } }); mixes.push(mix.id);
      const template = await prisma.stepTemplate.create({ data: { workspaceId, name: status, channel: "PHONE_CALL", versions: { create: { version: 1, script: "Local save fixture" } } }, include: { versions: true } });
      beats.push((await prisma.mixStep.create({ data: { mixId: mix.id, stepVersionId: template.versions[0].id, dayOffset: 0, sortOrder: 0 } })).id);
    }
  });
  afterEach(async () => { await prisma.workspace.delete({ where: { id: workspaceId } }); await prisma.user.delete({ where: { id: userId } }); });
  afterAll(() => prisma.$disconnect());
  const rule = (): WorkflowRule => ({ id: randomUUID(), name: "Next connection", source: { mixId: mixes[0], stepId: null }, enabled: false, mode: "PARALLEL", join: null, routes: [{ id: randomUUID(), label: "After completion", when: "FINISHED", outcome: "", delayMinutes: 0, target: { mixId: mixes[1], stepId: null }, maxVisits: null, replace: false }] });
  const save = (value: WorkflowRule, base: WorkflowRule | null = null) => prisma.$transaction(db => saveWorkflowRule(db, workspaceId, value, base, userId), { timeout: 30000 });

  it("saves all four Mix/Beat endpoint combinations while retaining draft Mix status", async () => {
    for (const sourceBeat of [false, true]) for (const targetBeat of [false, true]) {
      const value = rule(); value.source.stepId = sourceBeat ? beats[0] : null; value.routes[0].target!.stepId = targetBeat ? beats[1] : null;
      await save(value);
    }
    const result = await readWorkflowDefinition(prisma, workspaceId);
    expect(result.rules).toHaveLength(4); expect(result.gatedStepIds).toEqual([beats[1]]);
    expect(result.mixes.find(mix => mix.id === mixes[1])?.status).toBe("DRAFT");
  });

  it("merges concurrent independent connections instead of overwriting the account configuration", async () => {
    const a = rule(), b = rule(); b.source.stepId = beats[0]; b.routes[0].target!.stepId = beats[1];
    await Promise.all([save(a), save(b)]);
    const result = await readWorkflowDefinition(prisma, workspaceId);
    expect(result.rules.map(item => item.id).sort()).toEqual([a.id, b.id].sort());
    expect(result.revision).toBe(2); expect(result.gatedStepIds).toEqual([beats[1]]);
  });

  it("updates an unchanged connection after unrelated rules and finish markers change", async () => {
    const a = rule(), b = rule(); await save(a);
    await prisma.$transaction(db => saveWorkflowConfiguration(db, workspaceId, { ...emptyWorkflow(), rules: [a, b], intentionalEnds: [`mix:${mixes[1]}`] }, 1, userId));
    await save({ ...a, name: "Edited locally" }, a);
    const result = await readWorkflowDefinition(prisma, workspaceId);
    expect(result.rules.find(item => item.id === a.id)?.name).toBe("Edited locally");
    expect(result.rules.find(item => item.id === b.id)).toEqual(b); expect(result.intentionalEnds).toEqual([`mix:${mixes[1]}`]);
  });

  it("acknowledges a repeated save without creating another revision, audit entry or job", async () => {
    const value = rule(); const first = await save(value); const second = await save(value);
    expect(second).toEqual(first);
    expect(await prisma.auditLog.count({ where: { workspaceId, action: "mix-workflow.configure" } })).toBe(1);
    expect(await prisma.job.count({ where: { workspaceId, task: "generate-jumps" } })).toBe(1);
  });

  it("preserves another editor's changes until their exact version is reviewed", async () => {
    const initial = rule(); await save(initial);
    const remote = { ...initial, name: "Changed elsewhere" }; await save(remote, initial);
    const mine = { ...initial, name: "My version" };
    await expect(save(mine, initial)).rejects.toMatchObject({ currentRule: remote });
    expect((await readWorkflowDefinition(prisma, workspaceId)).rules[0]).toEqual(remote);
    await save(mine, remote); expect((await readWorkflowDefinition(prisma, workspaceId)).rules[0]).toEqual(mine);
  });

  it("does not resurrect a concurrently removed connection on an ordinary retry", async () => {
    const initial = rule(); await save(initial);
    await prisma.$transaction(db => saveWorkflowConfiguration(db, workspaceId, emptyWorkflow(), 1, userId));
    await expect(save({ ...initial, name: "Local edit" }, initial)).rejects.toBeInstanceOf(WorkflowRuleConflict);
    expect((await readWorkflowDefinition(prisma, workspaceId)).rules).toEqual([]);
    await save(initial, null); expect((await readWorkflowDefinition(prisma, workspaceId)).rules).toEqual([initial]);
  });

  it("retains ownership and loop validation without partially saving a rule", async () => {
    const foreign = rule(); foreign.routes[0].target!.mixId = "unavailable-mix";
    await expect(save(foreign)).rejects.toThrow("available Mix");
    const loop = rule(); loop.enabled = true; loop.routes[0].target!.mixId = mixes[0];
    await expect(save(loop)).rejects.toThrow("repeat limit");
    expect(await prisma.mixWorkflow.count({ where: { workspaceId } })).toBe(0);
    loop.routes[0].maxVisits = 2; await save(loop);
    expect((await readWorkflowDefinition(prisma, workspaceId)).rules[0]).toEqual(loop);
  });
});
