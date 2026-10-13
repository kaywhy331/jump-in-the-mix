import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../src/lib/prisma";
import { ensureStarterMix } from "../src/lib/starter-mix";
import { starterPlanForReason } from "../src/lib/journey-starts";

// "Run setup again" reuses a starter Mix only when it is on and starts from the follow-up date, so the preview's dates
// hold; otherwise it makes a new starter whose name tells it apart from every Mix still in use (D94, PRV-03).
const local = /^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? "");
const users: string[] = [];
let workspaceId = "";
const reason = "An estimate or quote";
const title = starterPlanForReason("Home services", reason).title;

describe.skipIf(!local)("which starter Mix setup reuses (D94)", () => {
  beforeEach(async () => {
    const suffix = randomUUID();
    const user = await prisma.user.create({ data: { email: `starter-${suffix}@example.test`, name: "Starter owner" } });
    users.push(user.id);
    workspaceId = (await prisma.workspace.create({ data: { name: "Starter fixture", slug: suffix, ownerId: user.id, members: { create: { userId: user.id, role: "OWNER" } } } })).id;
  });
  afterAll(async () => {
    for (const id of users) {
      await prisma.workspace.deleteMany({ where: { ownerId: id } });
      await prisma.user.deleteMany({ where: { id } });
    }
  });

  it("reuses the starter while it is on and dated from the follow-up", async () => {
    const first = await ensureStarterMix(workspaceId, "Home services", reason);
    expect(first.name).toBe(title);
    expect((await ensureStarterMix(workspaceId, "Home services", reason)).id).toBe(first.id);
  });

  it("makes a new starter, named apart, when the old one is paused or starts another way, and an archived one frees its name", async () => {
    const first = await ensureStarterMix(workspaceId, "Home services", reason);
    await prisma.mix.update({ where: { id: first.id }, data: { status: "PAUSED" } });
    const second = await ensureStarterMix(workspaceId, "Home services", reason);
    expect([second.id === first.id, second.name, second.status, second.triggerMode]).toEqual([false, `${title} (2)`, "ACTIVE", "DATE_TRIGGERED"]);
    await prisma.mix.update({ where: { id: second.id }, data: { triggerMode: "MANUAL_START", dateTypeId: null } });
    const third = await ensureStarterMix(workspaceId, "Home services", reason);
    expect(third.name).toBe(`${title} (3)`);
    // Its Beats' templates carry its own name.
    const templates = await prisma.stepTemplate.findMany({ where: { workspaceId, name: { startsWith: `${title} (3) — ` } } });
    expect(templates.length).toBeGreaterThan(0);
    await prisma.mix.updateMany({ where: { id: { in: [first.id, second.id, third.id] } }, data: { status: "ARCHIVED" } });
    expect((await ensureStarterMix(workspaceId, "Home services", reason)).name).toBe(title);
  });
});
