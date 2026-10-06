import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
const session = vi.hoisted(() => ({ context: {} }));
vi.mock("@/lib/auth", () => ({ requireWorkspace: async () => session.context }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));
import { prisma } from "../src/lib/prisma";
import { saveMixAction } from "../src/lib/mix-editor-actions";
import { placeNewContacts } from "../src/lib/new-contact-placement";
import { saveQuickCapture } from "../src/lib/quick-capture";

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
});
