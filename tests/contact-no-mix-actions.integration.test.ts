import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "../src/lib/prisma";

const auth = vi.hoisted(() => ({ context: {} as Record<string, unknown> }));
vi.mock("@/lib/auth", () => ({ requireWorkspace: async () => auth.context }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`REDIRECT ${url}`); } }));
vi.mock("@/lib/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/env")>();
  return { ...actual, env: { ...actual.env, authRateLimitSecret: "contact-no-mix-actions-test-secret-1" } };
});
import { bulkAssignMixAction } from "../src/lib/contact-mix-actions";
import { contactMixStatus } from "../src/lib/contact-mix-status";
import { setNoMixNeededAction } from "../src/lib/contact-no-mix-actions";
import { viewerErrorMessage } from "../src/lib/form-errors";

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

describe.skipIf(!local)("No Mix actions with PostgreSQL (JITM-09 §2.76–§2.77)", () => {
  const suffix = randomUUID().replaceAll("-", "");
  let workspaceId = "";
  let otherWorkspaceId = "";
  let userId = "";
  let mixId = "";
  let versionId = "";
  let owner: { id: string } = { id: "" };
  const today = new Date().toISOString().slice(0, 10);

  async function person(name: string, workspace = workspaceId) {
    return (await prisma.contact.create({ data: { workspaceId: workspace, displayName: `${name} ${suffix.slice(0, 6)}` } })).id;
  }
  const errorFor = (location: URL) => viewerErrorMessage(Object.fromEntries(location.searchParams), { authUser: { id: owner.id } });

  beforeAll(async () => {
    const user = await prisma.user.create({ data: { email: `no-mix-${suffix}@example.com`, name: "No Mix Owner", passwordHash: "test-only" } });
    owner = user;
    userId = user.id;
    const [workspace, other] = await Promise.all([
      prisma.workspace.create({ data: { name: "No Mix", slug: `no-mix-${suffix}`, ownerId: user.id, profile: { create: {} } } }),
      prisma.workspace.create({ data: { name: "Other", slug: `no-mix-other-${suffix}`, ownerId: user.id, profile: { create: {} } } })
    ]);
    workspaceId = workspace.id;
    otherWorkspaceId = other.id;
    await prisma.workspaceMember.create({ data: { workspaceId, userId, role: "OWNER" } });
    const template = await prisma.stepTemplate.create({ data: { workspaceId, name: "Check in", channel: "SMS" } });
    const version = await prisma.stepVersion.create({ data: { stepTemplateId: template.id, version: 1, body: "Checking in" } });
    versionId = version.id;
    const mix = await prisma.mix.create({ data: { workspaceId, name: "Estimate follow-up", status: "ACTIVE", triggerMode: "MANUAL_START" } });
    await prisma.mixStep.create({ data: { mixId: mix.id, stepVersionId: version.id, dayOffset: 0, sortOrder: 1 } });
    mixId = mix.id;
    auth.context = { session: { authUser: user }, user, workspace, impersonation: null };
  });

  afterAll(async () => {
    for (const id of [workspaceId, otherWorkspaceId].filter(Boolean)) {
      await prisma.contactActivity.deleteMany({ where: { workspaceId: id } });
      await prisma.workspace.delete({ where: { id } });
    }
    if (userId) await prisma.user.delete({ where: { id: userId } });
  });

  it("confirms No Mix needed at once, offers Undo, and Undo takes it back", async () => {
    const supplier = await person("Supplier");
    const done = await redirectOf(setNoMixNeededAction(form({ contactIds: supplier, returnTo: "/contacts?mix=no-mix" })));
    expect(done.pathname).toBe("/contacts");
    expect(Object.fromEntries(done.searchParams)).toMatchObject({ mix: "no-mix", noMixNeeded: "1", noMixPeople: supplier });
    expect(await contactMixStatus(workspaceId, supplier)).toBe("no-mix-needed");
    expect(await prisma.contactActivity.count({ where: { contactId: supplier, summary: "Marked No Mix needed." } })).toBe(1);
    const undone = await redirectOf(setNoMixNeededAction(form({ contactIds: supplier, intent: "clear", returnTo: `/contacts/${supplier}` })));
    expect(undone.pathname).toBe(`/contacts/${supplier}`);
    expect(undone.searchParams.get("noMixCleared")).toBe("1");
    expect(await contactMixStatus(workspaceId, supplier)).toBe("no-mix");
  });

  it("leaves people already in a Mix or marked Do not contact as they are", async () => {
    const busy = await person("Busy");
    const blocked = await person("Blocked");
    // Just started: the assignment and the preparation job a start queues (src/lib/contact-mix-actions.ts).
    await prisma.mixAssignment.create({ data: { workspaceId, mixId, contactId: busy, assignmentKey: `${workspaceId}:${mixId}:${busy}`, startDate: new Date() } });
    await prisma.job.create({ data: { workspaceId, task: "generate-jumps", payload: { contactId: busy, mixId } } });
    await prisma.contactRelationshipState.create({ data: { workspaceId, contactId: blocked, doNotContact: true } });
    const result = await redirectOf(setNoMixNeededAction(form({ contactIds: [busy, blocked], returnTo: "/contacts" })));
    expect(Object.fromEntries(result.searchParams)).toMatchObject({ noMixNeeded: "0", noMixSkipped: "2" });
    expect(await contactMixStatus(workspaceId, busy)).toBe("in-mix");
    expect((await prisma.contactRelationshipState.findUnique({ where: { contactId: blocked } }))?.noMixNeededAt).toBeNull();
  });

  it("returns only to Contacts, and refuses another workspace's people", async () => {
    const someone = await person("Someone");
    const away = await redirectOf(setNoMixNeededAction(form({ contactIds: someone, returnTo: "https://example.com/contacts" })));
    expect(away.origin).toBe("https://app.invalid");
    expect(away.pathname).toBe("/contacts");
    const outsider = await person("Outsider", otherWorkspaceId);
    const refused = await redirectOf(setNoMixNeededAction(form({ contactIds: outsider, returnTo: "/contacts" })));
    expect(errorFor(refused)).toBe("One or more selected Contacts are unavailable.");
    expect(await prisma.contactRelationshipState.count({ where: { contactId: outsider } })).toBe(0);
  });

  it("adds the selected people to a Mix from a filtered list and returns to it", async () => {
    const first = await person("First");
    const second = await person("Second");
    const result = await redirectOf(bulkAssignMixAction(form({ contactIds: [first, second], mixId, startDate: today, returnTo: `/contacts?mix=no-mix&people=${first}` })));
    expect(Object.fromEntries(result.searchParams)).toEqual({ mix: "no-mix", mixStarted: "2", mixStartedId: mixId, mixStartOn: today });
    expect(await prisma.mixAssignment.count({ where: { workspaceId, mixId, contactId: { in: [first, second] }, isActive: true } })).toBe(2);
    expect(await prisma.job.count({ where: { workspaceId, task: "generate-jumps", payload: { path: ["mixId"], equals: mixId } } })).toBeGreaterThanOrEqual(2);
    expect(await contactMixStatus(workspaceId, first)).toBe("in-mix");
  });

  it("reports what the bulk start did, including Beats that wait for a visit (BLK-01)", async () => {
    // A Mix with a Beat on the start day and one timed from the end of an appointment.
    const visitMix = await prisma.mix.create({ data: { workspaceId, name: "Estimate visit", status: "ACTIVE", triggerMode: "MANUAL_START" } });
    await prisma.mixStep.create({ data: { mixId: visitMix.id, stepVersionId: versionId, dayOffset: 0, sortOrder: 1 } });
    const visitBeat = await prisma.mixStep.create({ data: { mixId: visitMix.id, stepVersionId: versionId, dayOffset: 0, sortOrder: 2, anchor: "APPOINTMENT_END", offsetMinutes: 60 } });
    const fresh = [await person("Fresh one"), await person("Fresh two")];
    const running = await person("Running");
    const keptStart = new Date(Date.now() - 3 * 86_400_000);
    await prisma.mixAssignment.create({ data: { workspaceId, mixId: visitMix.id, contactId: running, assignmentKey: `${workspaceId}:${visitMix.id}:${running}`, startDate: keptStart } });
    await prisma.jump.create({ data: { workspaceId, contactId: running, mixId: visitMix.id, mixStepId: visitBeat.id, stepVersionId: versionId, scheduledAt: new Date(Date.now() + 86_400_000), reason: "Estimate visit", uniquenessKey: `bulk-running-${suffix}`, templateSnapshot: {}, renderedSnapshot: {} } });

    const result = await redirectOf(bulkAssignMixAction(form({ contactIds: [...fresh, running], mixId: visitMix.id, startDate: today, returnTo: "/contacts" })));
    expect(Object.fromEntries(result.searchParams)).toEqual({ mixStarted: "2", mixKept: "1", mixStartedId: visitMix.id, mixStartOn: today, mixVisit: "1" });
    // The person already in it keeps their start; the others start on the chosen day.
    expect((await prisma.mixAssignment.findFirstOrThrow({ where: { mixId: visitMix.id, contactId: running } })).startDate).toEqual(keptStart);
    expect(await prisma.mixAssignment.count({ where: { mixId: visitMix.id, contactId: { in: fresh }, isActive: true } })).toBe(2);
    const audits = await prisma.auditLog.findMany({ where: { workspaceId, action: "mix.assignment.activate", source: "contacts.bulk", entityId: { in: (await prisma.mixAssignment.findMany({ where: { mixId: visitMix.id }, select: { id: true } })).map(item => item.id) } }, select: { metadata: true } });
    expect(audits.map(audit => (audit.metadata as { result: string }).result).sort()).toEqual(["already-running", "started", "started"]);
  });

  it("follows saved dates in a date-based Mix and saves the start day for anyone without one (BLK-01)", async () => {
    const dateType = await prisma.dateType.create({ data: { workspaceId, scopeKey: workspaceId, name: "Renewal", slug: `renewal-${suffix}` } });
    const dateMix = await prisma.mix.create({ data: { workspaceId, name: "Renewal reminder", status: "ACTIVE", triggerMode: "DATE_TRIGGERED", dateTypeId: dateType.id } });
    await prisma.mixStep.create({ data: { mixId: dateMix.id, stepVersionId: versionId, dayOffset: -7, sortOrder: 1 } });
    const dated = await person("Has a renewal"), undated = await person("No renewal yet");
    await prisma.jumpDate.create({ data: { workspaceId, contactId: dated, dateTypeId: dateType.id, timezone: "UTC", recurrence: "YEARLY", month: 3, day: 14 } });
    const result = await redirectOf(bulkAssignMixAction(form({ contactIds: [dated, undated], mixId: dateMix.id, startDate: today, returnTo: "/contacts" })));
    expect(Object.fromEntries(result.searchParams)).toMatchObject({ mixStarted: "2", mixSaved: "1", mixDated: "1", mixStartedId: dateMix.id });
    expect(result.searchParams.has("mixVisit")).toBe(false);
    // The person who had a date keeps only that one; the other gets the start day, labelled with the Mix's name.
    expect(await prisma.jumpDate.count({ where: { contactId: dated, dateTypeId: dateType.id } })).toBe(1);
    expect(await prisma.jumpDate.findMany({ where: { contactId: undated, dateTypeId: dateType.id }, select: { label: true, recurrence: true, dateValue: true } }))
      .toEqual([{ label: "Renewal reminder", recurrence: "NONE", dateValue: new Date(`${today}T12:00:00Z`) }]);
  });

  it("refuses the whole batch, before saving anything, when one person cannot start", async () => {
    const ready = await person("Ready");
    const blocked = await person("Do not contact");
    await prisma.contactRelationshipState.create({ data: { workspaceId, contactId: blocked, doNotContact: true } });
    const refused = await redirectOf(bulkAssignMixAction(form({ contactIds: [ready, blocked], mixId, startDate: today, returnTo: "/contacts?mix=no-mix" })));
    expect(refused.searchParams.get("mix")).toBe("no-mix");
    expect(errorFor(refused)).toMatch(/^Do not contact .*: This person is marked Do not contact\./);
    expect(await prisma.mixAssignment.count({ where: { contactId: { in: [ready, blocked] } } })).toBe(0);
    const pastStart = await redirectOf(bulkAssignMixAction(form({ contactIds: [ready], mixId, startDate: "2020-01-01", returnTo: "/contacts" })));
    expect(errorFor(pastStart)).toBe("Choose a start date from today on.");
  });

  it("is view-only in a support session", async () => {
    const context = auth.context;
    auth.context = { ...context, impersonation: { id: "support" } };
    try {
      const someone = await person("Viewed");
      const refused = await redirectOf(setNoMixNeededAction(form({ contactIds: someone, returnTo: "/contacts" })));
      expect(errorFor(refused)).toBe("Administrator support sessions are view-only.");
      const bulk = await redirectOf(bulkAssignMixAction(form({ contactIds: someone, mixId, startDate: today, returnTo: "/contacts" })));
      expect(errorFor(bulk)).toBe("Administrator support sessions are view-only.");
      expect(await contactMixStatus(workspaceId, someone)).toBe("no-mix");
    } finally { auth.context = context; }
  });
});
