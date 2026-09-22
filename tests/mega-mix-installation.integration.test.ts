import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { installMegaMix } from "@/lib/mega-mix-service";
import { MEGA_MIXES } from "@/lib/mega-mixes";
import { processWorkflowInstance, readWorkflowDefinition, saveWorkflowConfiguration, startWorkflowInstance, workflowState } from "@/lib/mix-workflow";

const local = /^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? "");
describe.skipIf(!local)("mega-mix installation", () => {
  let userId: string, workspaceId: string;
  const install = (blueprintId = "contractor") => installMegaMix({ workspaceId, actorUserId: userId, blueprintId, expectedVersion: 1 });
  beforeEach(async () => {
    userId = (await prisma.user.create({ data: { name: "Mega-mix fixture", email: `mega-${randomUUID()}@example.invalid` } })).id;
    workspaceId = (await prisma.workspace.create({ data: { ownerId: userId, name: "Mega-mix fixture", slug: randomUUID() } })).id;
  });
  afterEach(async () => { await prisma.workspace.delete({ where: { id: workspaceId } }); await prisma.user.delete({ where: { id: userId } }); });
  afterAll(async () => { await prisma.$disconnect(); });

  it.each(MEGA_MIXES)("installs $name with real Beats and connections without enrolling people", async blueprint => {
    await prisma.contact.create({ data: { workspaceId, displayName: "Existing customer", firstName: "Existing" } });
    const result = await install(blueprint.id);
    const graph = await readWorkflowDefinition(prisma, workspaceId);
    expect(graph.mixes).toHaveLength(blueprint.nodes.length);
    expect(graph.rules).toHaveLength(blueprint.nodes.length);
    expect(graph.mixes.flatMap(mix => mix.steps)).toHaveLength(blueprint.nodes.reduce((n, node) => n + node.steps.length, 0));
    expect(graph.mixes.every(mix => mix.status === "ACTIVE" && mix.triggerMode === "MANUAL_START")).toBe(true);
    expect(Object.keys(result.mixIds).sort()).toEqual(blueprint.nodes.map(node => node.key).sort());
    expect(await prisma.mixAssignment.count({ where: { workspaceId } })).toBe(0);
    expect(await prisma.mixWorkflowInstance.count({ where: { workspaceId } })).toBe(0);
    expect(await prisma.jump.count({ where: { workspaceId } })).toBe(0);
    expect(await prisma.automatedDelivery.count({ where: { workspaceId } })).toBe(0);
  });

  it("deduplicates concurrent installation and preserves edited, paused and removed mixes on retry", async () => {
    const [first, second] = await Promise.all([install(), install()]);
    expect(first.id).toBe(second.id);
    expect([first.repeated, second.repeated].sort()).toEqual([false, true]);
    await prisma.mix.update({ where: { id: first.mixIds.estimate }, data: { name: "My estimate process", status: "PAUSED" } });
    await prisma.mix.delete({ where: { id: first.mixIds.quiet } });
    const revision = (await prisma.mixWorkflow.findUniqueOrThrow({ where: { workspaceId } })).revision;
    expect((await install()).repeated).toBe(true);
    expect(await prisma.mix.findUnique({ where: { id: first.mixIds.estimate } })).toMatchObject({ name: "My estimate process", status: "PAUSED" });
    expect(await prisma.mix.findUnique({ where: { id: first.mixIds.quiet } })).toBeNull();
    expect((await prisma.mixWorkflow.findUniqueOrThrow({ where: { workspaceId } })).revision).toBe(revision);
    expect(await prisma.megaMixInstallation.count({ where: { workspaceId } })).toBe(1);
  });

  it("merges into the latest graph and keeps saved customer configuration", async () => {
    await install();
    const graph = await readWorkflowDefinition(prisma, workspaceId);
    graph.rules[0].name = "My edited decision";
    graph.rules[0].enabled = false;
    await prisma.$transaction(db => saveWorkflowConfiguration(db, workspaceId, { rules: graph.rules, gatedStepIds: graph.gatedStepIds, intentionalEnds: graph.intentionalEnds }, graph.revision, userId));
    await Promise.all([install("consultant"), install("photographer")]);
    const saved = await readWorkflowDefinition(prisma, workspaceId);
    expect(saved.rules.find(rule => rule.id === graph.rules[0].id)).toMatchObject({ name: "My edited decision", enabled: false });
    expect(saved.rules).toHaveLength(35);
    expect(await prisma.megaMixInstallation.count({ where: { workspaceId } })).toBe(3);
  });

  it("rejects another owner and stale previews without partially creating a journey", async () => {
    await expect(installMegaMix({ workspaceId, actorUserId: "foreign-user", blueprintId: "contractor", expectedVersion: 1 })).rejects.toThrow("unavailable");
    await expect(installMegaMix({ workspaceId, actorUserId: userId, blueprintId: "contractor", expectedVersion: 0 })).rejects.toThrow("changed");
    expect(await prisma.mix.count({ where: { workspaceId } })).toBe(0);
    expect(await prisma.stepTemplate.count({ where: { workspaceId } })).toBe(0);
  });

  it("rolls back copies when the existing graph cannot accept the installation", async () => {
    await prisma.mixWorkflow.create({ data: { workspaceId, configuration: { invalid: true } } });
    await expect(install()).rejects.toThrow();
    expect(await prisma.mix.count({ where: { workspaceId } })).toBe(0);
    expect(await prisma.stepTemplate.count({ where: { workspaceId } })).toBe(0);
    expect(await prisma.megaMixInstallation.count({ where: { workspaceId } })).toBe(0);
  });

  it("completes onboarding without a contact and keeps setup atomic", async () => {
    await installMegaMix({ workspaceId, actorUserId: userId, blueprintId: "contractor", expectedVersion: 1,
      onboarding: { userName: "Casey", company: "Casey Construction", smsSignature: "Casey", timezone: "America/Los_Angeles" } });
    expect(await prisma.workspaceProfile.findUnique({ where: { workspaceId } })).toMatchObject({ onboardingDone: true, industry: "Home services", company: "Casey Construction", useCases: ["business"] });
    expect(await prisma.userPreference.findUnique({ where: { userId } })).toMatchObject({ timezone: "America/Los_Angeles" });
    expect(await prisma.contact.count({ where: { workspaceId } })).toBe(0);
  });

  it("finishes onboarding even when the selected journey was installed earlier", async () => {
    await install();
    await installMegaMix({ workspaceId, actorUserId: userId, blueprintId: "contractor", expectedVersion: 1,
      onboarding: { userName: "Casey", company: "", smsSignature: "Casey", timezone: "UTC" } });
    expect(await prisma.workspaceProfile.findUnique({ where: { workspaceId } })).toMatchObject({ onboardingDone: true });
    expect(await prisma.mix.count({ where: { workspaceId } })).toBe(13);
  });

  it("starts at an estimate and persists only the accepted-job handoff for that person", async () => {
    const installed = await install();
    const contact = await prisma.contact.create({ data: { workspaceId, displayName: "Customer", firstName: "Customer" } });
    const now = new Date();
    const instanceId = await startWorkflowInstance({ workspaceId, contactId: contact.id, mixId: installed.mixIds.estimate, requestId: randomUUID(), now });
    await processWorkflowInstance(workspaceId, instanceId, now);
    await prisma.jump.updateMany({ where: { workspaceId, workflowInstanceId: instanceId }, data: { status: "DONE", completionMethod: "outcome:completed", completedAt: now } });
    const afterUndo = new Date(now.getTime() + 11_000);
    await processWorkflowInstance(workspaceId, instanceId, afterUndo);
    const before = await prisma.mixWorkflowInstance.findUniqueOrThrow({ where: { id: instanceId } });
    expect(workflowState(before.state).runs).toHaveLength(1);
    const decision = workflowState(before.state).evaluations[0];
    await processWorkflowInstance(workspaceId, instanceId, afterUndo, { requestId: randomUUID(), evaluationId: decision.id, outcome: "Estimate accepted", expectedRevision: before.revision });
    const after = await prisma.mixWorkflowInstance.findUniqueOrThrow({ where: { id: instanceId } });
    expect(workflowState(after.state).runs.map(run => run.mixId)).toEqual([installed.mixIds.estimate, installed.mixIds.booked]);
    expect(await prisma.jump.count({ where: { workspaceId, mixId: installed.mixIds.booked, contactId: contact.id } })).toBe(2);
    expect(await prisma.jump.count({ where: { workspaceId, mixId: installed.mixIds.review } })).toBe(0);
  });
});
