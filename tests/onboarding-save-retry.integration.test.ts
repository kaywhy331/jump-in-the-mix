import { randomUUID } from "node:crypto";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../src/lib/prisma";

const auth = vi.hoisted(() => ({ context: {} as Record<string, unknown> }));
vi.mock("@/lib/auth", () => ({ requireWorkspace: async () => auth.context }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw Object.assign(new Error(`REDIRECT ${url}`), { digest: "NEXT_REDIRECT" }); } }));
vi.mock("@/lib/jump-engine", async original => {
  const actual = await original<typeof import("../src/lib/jump-engine")>();
  return { ...actual, generateJumps: vi.fn(actual.generateJumps) };
});
import { completeOnboardingFormAction } from "../src/lib/onboarding-actions";
import { generateJumps } from "../src/lib/jump-engine";
import { VIEW_ONLY_SUPPORT_MESSAGE } from "../src/lib/writable-workspace";

const local = /^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? "");
const users: string[] = [], workspaces: string[] = [];
let workspaceId = "", userId = "";

async function account() {
  const suffix = randomUUID();
  const user = await prisma.user.create({ data: { email: `onboarding-retry-${suffix}@example.test`, name: "Retry Owner", emailVerifiedAt: new Date() } });
  users.push(user.id);
  const workspace = await prisma.workspace.create({ data: { name: "Retry fixture", slug: suffix, ownerId: user.id, members: { create: { userId: user.id, role: "OWNER" } }, profile: { create: { onboardingDone: false } } }, include: { profile: true } });
  workspaces.push(workspace.id); workspaceId = workspace.id; userId = user.id;
  await prisma.userPreference.create({ data: { userId, timezone: "UTC" } });
  auth.context = { session: { authUser: user }, user, workspace, impersonation: null };
}

function submission(requestId: string, extra: Record<string, string> = {}) {
  const data = new FormData();
  for (const [key, value] of Object.entries({ requestId, useCase: "business", contactName: "Riley Retry", reason: "Reconnect with someone who went quiet", followUpDate: new Date().toISOString().slice(0, 10), timezone: "UTC", privateContext: "Synthetic private reminder", starterPreviewAvailable: "1", ...extra })) data.set(key, value);
  return data;
}

async function result(data: FormData) {
  try { return await completeOnboardingFormAction({}, data); }
  catch (error) { if (error instanceof Error && "digest" in error) return error.message; throw error; }
}

async function counts() {
  return {
    contacts: await prisma.contact.count({ where: { workspaceId } }),
    dates: await prisma.jumpDate.count({ where: { workspaceId } }),
    assignments: await prisma.mixAssignment.count({ where: { workspaceId } }),
    starters: await prisma.mix.count({ where: { workspaceId, source: "STARTER" } }),
    receipts: await prisma.idempotencyKey.count({ where: { workspaceId, key: { startsWith: "onboarding:" } } })
  };
}

describe.skipIf(!local)("onboarding save retries with PostgreSQL", () => {
  beforeAll(async () => {
    // The later browser seed reads this shipped catalog entry by its stable id.
    // A random id with the same unique system slug would block catalog insertion.
    await prisma.dateType.upsert({ where: { scopeKey_slug: { scopeKey: "system", slug: "follow-up" } }, create: { id: "system_follow_up", scopeKey: "system", slug: "follow-up", name: "Follow-up", isSystem: true }, update: { isActive: true } });
  });
  beforeEach(async () => { vi.mocked(generateJumps).mockClear(); await account(); });
  afterEach(async () => {
    await prisma.contactActivity.deleteMany({ where: { workspaceId: { in: workspaces } } });
    await prisma.workspace.deleteMany({ where: { id: { in: workspaces } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    users.length = 0; workspaces.length = 0;
  });

  it("replays a committed save without a second person, date or assignment", async () => {
    const key = randomUUID();
    const first = await result(submission(key));
    expect(first).toMatch(/^REDIRECT \/jumps\?welcome=1/);
    expect(await result(submission(key))).toBe(first);
    expect(await counts()).toEqual({ contacts: 1, dates: 1, assignments: 1, starters: 1, receipts: 1 });
  });

  it("serializes concurrent submissions including starter creation", async () => {
    await result(submission(randomUUID()));
    const singleCount = await prisma.jump.count({ where: { workspaceId } });
    expect(singleCount).toBeGreaterThan(0);
    await account();
    const key = randomUUID();
    const responses = await Promise.all([result(submission(key)), result(submission(key))]);
    expect(responses[0]).toMatch(/^REDIRECT \/jumps\?welcome=1/);
    expect(responses[1]).toBe(responses[0]);
    expect(await counts()).toEqual({ contacts: 1, dates: 1, assignments: 1, starters: 1, receipts: 1 });
    const jumps = await prisma.jump.findMany({ where: { workspaceId } });
    expect(jumps).toHaveLength(singleCount);
    expect(new Set(jumps.map(jump => `${jump.contactId}:${jump.mixStepId}:${jump.jumpDateId}:${jump.scheduledAt.toISOString()}`)).size).toBe(singleCount);
  });

  it("resumes preparation after a post-commit failure without repeating saved data", async () => {
    const key = randomUUID();
    vi.mocked(generateJumps).mockRejectedValueOnce(new Error("Synthetic reconciliation interruption"));
    await expect(result(submission(key))).rejects.toThrow("Synthetic reconciliation interruption");
    expect((await counts()).contacts).toBe(1);
    const saved = await prisma.contact.findFirstOrThrow({ where: { workspaceId } });
    expect(await result(submission(key))).toMatch(/^REDIRECT \/jumps\?welcome=1/);
    expect(await counts()).toEqual({ contacts: 1, dates: 1, assignments: 1, starters: 1, receipts: 1 });
    expect(await prisma.jump.count({ where: { workspaceId, contactId: saved.id } })).toBeGreaterThan(0);
    expect(vi.mocked(generateJumps).mock.calls.map(([input]) => input?.contactId)).toEqual([saved.id, saved.id]);
  });

  it("recovers the original save instead of applying later entries under the same request", async () => {
    const key = randomUUID();
    const first = await result(submission(key));
    expect(await result(submission(key, { contactName: "Later unsaved name", privateContext: "Later unsaved notes", timezone: "America/Chicago" }))).toBe(first);
    const contact = await prisma.contact.findFirstOrThrow({ where: { workspaceId } });
    expect(contact).toMatchObject({ displayName: "Riley Retry", privateNotes: "Synthetic private reminder" });
    expect((await prisma.userPreference.findUniqueOrThrow({ where: { userId } })).timezone).toBe("UTC");
    expect((await counts()).contacts).toBe(1);
  });

  it("does not append notes or add a second date when a saved-person submission is retried", async () => {
    const person = await prisma.contact.create({ data: { workspaceId, displayName: "Existing Riley", privateNotes: "Existing private note" } });
    const key = randomUUID();
    const first = await result(submission(key, { contactId: person.id }));
    expect(first).toMatch(/^REDIRECT \/jumps\?welcome=1/);
    expect(await result(submission(key, { contactId: person.id }))).toBe(first);
    expect((await prisma.contact.findUniqueOrThrow({ where: { id: person.id } })).privateNotes).toBe("Existing private note\n\nSynthetic private reminder");
    expect(await counts()).toEqual({ contacts: 1, dates: 1, assignments: 1, starters: 1, receipts: 1 });
  });

  it("does not replay another workspace's receipt or accept a submitted workspace id", async () => {
    const key = randomUUID();
    await result(submission(key));
    const earlierWorkspace = workspaceId;
    await account();
    expect(await result(submission(key, { workspaceId: earlierWorkspace, contactName: "Second workspace Riley" }))).toContain("Second+workspace+Riley");
    expect((await counts()).contacts).toBe(1);
    expect(await prisma.contact.count({ where: { workspaceId: earlierWorkspace } })).toBe(1);
    expect(await prisma.idempotencyKey.count({ where: { workspaceId: { in: [workspaceId, earlierWorkspace] } } })).toBe(2);
  });

  it("does not replay another member's receipt in the same workspace", async () => {
    const key = randomUUID();
    await result(submission(key));
    const user = await prisma.user.create({ data: { email: `onboarding-member-${randomUUID()}@example.test`, name: "Second Member" } }); users.push(user.id);
    await prisma.workspaceMember.create({ data: { workspaceId, userId: user.id } });
    auth.context = { ...auth.context, user, session: { authUser: user } };
    expect(await result(submission(key, { contactName: "Member Riley" }))).toContain("Member+Riley");
    expect((await counts()).contacts).toBe(2);
    expect((await counts()).receipts).toBe(2);
  });

  it("preserves review and view-only restrictions when a receipt already exists", async () => {
    const key = randomUUID();
    await result(submission(key));
    expect(await result(submission(key, { starterPreviewAvailable: "0" }))).toEqual({ error: "The first follow-up’s preview hasn’t loaded yet. Try again in a moment." });
    auth.context = { ...auth.context, impersonation: { id: "synthetic-support-view" } };
    expect(await result(submission(key))).toEqual({ error: VIEW_ONLY_SUPPORT_MESSAGE });
    expect((await counts()).contacts).toBe(1);
  });

  it("does not revive a removed person when an old save is retried", async () => {
    const key = randomUUID();
    await result(submission(key));
    await prisma.contact.deleteMany({ where: { workspaceId } });
    vi.mocked(generateJumps).mockClear();
    expect(await result(submission(key))).toBe("REDIRECT /contacts");
    expect((await counts()).contacts).toBe(0);
    expect(generateJumps).not.toHaveBeenCalled();
  });

  it.each(["archived contact", "inactive assignment", "archived Mix"] as const)("does not resume an %s from an old receipt", async state => {
    const key = randomUUID();
    await result(submission(key));
    if (state === "archived contact") await prisma.contact.updateMany({ where: { workspaceId }, data: { archivedAt: new Date() } });
    else if (state === "inactive assignment") await prisma.mixAssignment.updateMany({ where: { workspaceId }, data: { isActive: false } });
    else await prisma.mix.updateMany({ where: { workspaceId }, data: { status: "ARCHIVED" } });
    const before = await counts();
    vi.mocked(generateJumps).mockClear();
    expect(await result(submission(key))).toBe(state === "archived contact" ? "REDIRECT /contacts" : "REDIRECT /jumps");
    expect(generateJumps).not.toHaveBeenCalled();
    expect(await counts()).toEqual(before);
  });

  it("keeps the existing unique-assignment refusal for a fresh request to the same saved person", async () => {
    // A fresh setup is a new request, not a replay. The baseline already refuses assigning
    // the same starter twice; preserving that refusal must also preserve notes and dates.
    await result(submission(randomUUID()));
    const person = await prisma.contact.findFirstOrThrow({ where: { workspaceId } });
    const before = await counts();
    await expect(result(submission(randomUUID(), { contactId: person.id, privateContext: "Must roll back" }))).rejects.toMatchObject({ code: "P2002" });
    expect(await counts()).toEqual(before);
    expect((await prisma.contact.findUniqueOrThrow({ where: { id: person.id } })).privateNotes).toBe(person.privateNotes);
  });

  it("does not regenerate completed or skipped occurrences during replay", async () => {
    const key = randomUUID();
    const choices = { useCase: "business", businessType: "Real estate", reason: "Reply to a new buyer lead" };
    await result(submission(key, choices));
    const jumps = await prisma.jump.findMany({ where: { workspaceId }, orderBy: { scheduledAt: "asc" } });
    expect(jumps.length).toBeGreaterThanOrEqual(2);
    await prisma.jump.update({ where: { id: jumps[0].id }, data: { status: "DONE" } });
    await prisma.jump.update({ where: { id: jumps[1].id }, data: { status: "SKIPPED" } });
    const before = await prisma.jump.findMany({ where: { workspaceId }, select: { id: true, status: true }, orderBy: { id: "asc" } });
    await result(submission(key, choices));
    expect(await prisma.jump.findMany({ where: { workspaceId }, select: { id: true, status: true }, orderBy: { id: "asc" } })).toEqual(before);
  });
});
