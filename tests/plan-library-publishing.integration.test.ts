import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import type { Prisma } from "../src/generated/prisma/client";

const state = vi.hoisted(() => ({ tx: null as unknown as Prisma.TransactionClient }));
vi.mock("@/lib/prisma", () => ({ prisma: new Proxy({}, { get: (_, key) => key === "$transaction" ? async (operation: ((tx: Prisma.TransactionClient) => unknown) | unknown[]) => typeof operation === "function" ? operation(state.tx) : Promise.all(operation) : Reflect.get(state.tx, key) }) }));
import { publishReadyMadePlans } from "../src/lib/publish-plan-library";
import { SALES_PLANS } from "../src/lib/sales-plan-library";
import { useSharedMixTemplate } from "../src/lib/shared-mix-use-service";
import { generateJumps } from "../src/lib/jump-engine";
import { startDraftMix } from "../src/lib/mix-start";
import { logicalDateInTimezone } from "../src/lib/jump-schedule";
const { prisma: database } = await vi.importActual<typeof import("../src/lib/prisma")>("../src/lib/prisma");

describe.skipIf(process.env.RUN_PLAN_DATABASE_TESTS !== "true" && process.env.CI !== "true")("ready-made plan publishing and use", () => {
  afterAll(async () => database.$disconnect());

  it("publishes idempotently, imports as a draft, and preserves the customer's copy after a library revision", async () => {
    const rollback = new Error("ROLLBACK_PLAN_LIBRARY_FIXTURES");
    await expect(database.$transaction(async tx => {
      state.tx = tx;
      const suffix = randomUUID();
      const plan = { ...SALES_PLANS[0], id: `plan-test-${suffix}` };
      expect(await publishReadyMadePlans([plan])).toEqual({ created: 1, updated: 0, unchanged: 0 });
      const original = await tx.sharedMix.findUniqueOrThrow({ where: { id: plan.id } });
      expect(await publishReadyMadePlans([plan])).toEqual({ created: 0, updated: 0, unchanged: 1 });
      expect((await tx.sharedMix.findUniqueOrThrow({ where: { id: plan.id } })).updatedAt).toEqual(original.updatedAt);

      const user = await tx.user.create({ data: { email: `plan-${suffix}@example.com`, name: "Alex Morgan", passwordHash: "test-only" } });
      const workspace = await tx.workspace.create({ data: { ownerId: user.id, name: "Plan test", slug: `plan-${suffix}`, profile: { create: { company: "Sample Services", smsSignature: "Alex", emailSignature: "Alex Morgan" } } } });
      await tx.userPreference.create({ data: { userId: user.id, timezone: "America/Los_Angeles" } });
      await tx.contact.create({ data: { workspaceId: workspace.id, displayName: "Jordan Lee", firstName: "Jordan", lastName: "Lee" } });
      const setup = { workspaceId: workspace.id, actorUserId: user.id, sharedMixId: plan.id, requestId: `test-${suffix}`, name: plan.title, status: "DRAFT" as const, assignAllContacts: true, groupIds: [] };
      const imported = await useSharedMixTemplate(setup);
      const copied = await tx.mix.findUniqueOrThrow({ where: { id: imported.mixId }, include: { steps: { include: { stepVersion: true } } } });
      expect(copied.status).toBe("DRAFT");
      expect(copied.framework).toBe(plan.framework);
      expect(copied.steps).toHaveLength(plan.steps.length);
      expect(await generateJumps({ workspaceId: workspace.id, mixId: copied.id })).toBe(0);
      expect((await useSharedMixTemplate(setup)).mixId).toBe(copied.id);
      expect(await tx.sharedMixImport.count({ where: { workspaceId: workspace.id } })).toBe(1);

      const revised = { ...plan, description: "Revised library description", steps: plan.steps.map((step, index) => index === 0 ? { ...step, body: "Hi {{First Name}}, a revised question. {{SMS Signature}}" } : step) };
      expect(await publishReadyMadePlans([revised])).toEqual({ created: 0, updated: 1, unchanged: 0 });
      expect((await tx.sharedMixMetadata.findUniqueOrThrow({ where: { sharedMixId: plan.id } })).version).toBe(2);
      const preserved = await tx.mix.findUniqueOrThrow({ where: { id: copied.id }, include: { steps: { include: { stepVersion: true } } } });
      expect(preserved.description).toBe(plan.description);
      expect(preserved.steps.map(step => step.stepVersion.body)).toEqual(copied.steps.map(step => step.stepVersion.body));
      expect(await publishReadyMadePlans([revised])).toEqual({ created: 0, updated: 0, unchanged: 1 });

      const activationTime = new Date();
      await tx.mixAssignment.updateMany({ where: { mixId: copied.id }, data: { startDate: new Date(activationTime.getTime() - 30 * 86_400_000) } });
      expect(await startDraftMix(tx, { workspaceId: workspace.id, mixId: copied.id, now: activationTime })).toBe(true);
      expect((await tx.mixAssignment.findFirstOrThrow({ where: { mixId: copied.id } })).startDate).toEqual(activationTime);
      await tx.mix.update({ where: { id: copied.id }, data: { status: "ACTIVE" } });
      expect(await generateJumps({ workspaceId: workspace.id, mixId: copied.id })).toBe(plan.steps.length);
      const jumps = await tx.jump.findMany({ where: { workspaceId: workspace.id, mixId: copied.id }, orderBy: { scheduledAt: "asc" } });
      expect((jumps[0].renderedSnapshot as Prisma.JsonObject).body).toContain("Jordan");
      expect((jumps[0].renderedSnapshot as Prisma.JsonObject).body).not.toContain("revised question");
      expect(new Set(jumps.map(jump => (jump.templateSnapshot as Prisma.JsonObject).timezone))).toEqual(new Set(["America/Los_Angeles"]));
      expect(logicalDateInTimezone(jumps[0].scheduledAt, "America/Los_Angeles")).toEqual(logicalDateInTimezone(activationTime, "America/Los_Angeles"));
      expect(await generateJumps({ workspaceId: workspace.id, mixId: copied.id })).toBe(0);
      for (const status of ["PAUSED", "DRAFT"] as const) {
        await tx.mix.update({ where: { id: copied.id }, data: { status } });
        expect(await startDraftMix(tx, { workspaceId: workspace.id, mixId: copied.id, now: new Date(activationTime.getTime() + 86_400_000) })).toBe(false);
        expect((await tx.mixAssignment.findFirstOrThrow({ where: { mixId: copied.id } })).startDate).toEqual(activationTime);
      }
      throw rollback;
    }, { timeout: 60_000 })).rejects.toBe(rollback);
  }, 70_000);
});
