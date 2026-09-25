import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { generateJumps } from "../src/lib/jump-engine";
import { prisma } from "../src/lib/prisma";

const auth = vi.hoisted(() => ({ context: {} as Record<string, unknown> }));
vi.mock("@/lib/auth", () => ({ requireWorkspace: async () => auth.context }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`REDIRECT ${url}`); } }));
import { bulkArchiveContactsAction } from "../src/lib/bulk-contact-actions";
import { restoreContactAction, restoreContactsAction } from "../src/lib/contact-lifecycle-actions";

const local = /^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? "");

function form(entries: Record<string, string | string[]>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) for (const item of Array.isArray(value) ? value : [value]) data.append(key, item);
  return data;
}

/** The redirect an action ends with (thrown by the mocked redirect). */
async function redirectOf(action: Promise<unknown>): Promise<string> {
  try { await action; } catch (error) { if (error instanceof Error && error.message.startsWith("REDIRECT ")) return error.message.slice("REDIRECT ".length); throw error; }
  throw new Error("The action finished without redirecting.");
}

describe.skipIf(!local)("bulk archive Undo with PostgreSQL", () => {
  let workspaceId = "";
  let userId = "";
  let otherWorkspaceId = "";
  let otherUserId = "";

  beforeAll(async () => {
    const suffix = randomUUID();
    const owner = await prisma.user.create({ data: { email: `bulk-undo-${suffix}@example.com`, name: "Undo Owner", passwordHash: "test-only" } });
    const workspace = await prisma.workspace.create({ data: { name: "Bulk undo", slug: `bulk-undo-${suffix}`, ownerId: owner.id, profile: { create: {} } } });
    await prisma.workspaceMember.create({ data: { workspaceId: workspace.id, userId: owner.id, role: "OWNER" } });
    const other = await prisma.user.create({ data: { email: `bulk-undo-other-${suffix}@example.com`, name: "Other Owner", passwordHash: "test-only" } });
    const otherWorkspace = await prisma.workspace.create({ data: { name: "Other business", slug: `bulk-undo-other-${suffix}`, ownerId: other.id, profile: { create: {} } } });
    workspaceId = workspace.id;
    userId = owner.id;
    otherWorkspaceId = otherWorkspace.id;
    otherUserId = other.id;
    auth.context = { user: owner, workspace, impersonation: null };
  });

  afterAll(async () => {
    for (const id of [workspaceId, otherWorkspaceId].filter(Boolean)) {
      await prisma.contactActivity.deleteMany({ where: { workspaceId: id } });
      await prisma.workspace.delete({ where: { id } });
    }
    await prisma.user.deleteMany({ where: { id: { in: [userId, otherUserId].filter(Boolean) } } });
  });

  /** A one-beat Mix started by hand: its follow-up lands the day after the start. */
  async function plan(name: string): Promise<string> {
    const template = await prisma.stepTemplate.create({ data: { workspaceId, name, channel: "SMS", versions: { create: { version: 1, body: `Hi {{First Name}}, about ${name}.` } } }, include: { versions: true } });
    const mix = await prisma.mix.create({ data: { workspaceId, name, triggerMode: "MANUAL_START", status: "ACTIVE" } });
    await prisma.mixStep.create({ data: { mixId: mix.id, stepVersionId: template.versions[0].id, dayOffset: 1, sortOrder: 1 } });
    return mix.id;
  }
  const assign = (mixId: string, contactId: string) => prisma.mixAssignment.create({ data: { assignmentKey: `${workspaceId}:${mixId}:${contactId}`, workspaceId, mixId, contactId, mode: "SNAPSHOT", startDate: new Date() } });
  const people = (names: string[]) => Promise.all(names.map((displayName) => prisma.contact.create({ data: { workspaceId, displayName, firstName: displayName.split(" ")[0] } })));
  const generateJumpsJobs = () => prisma.job.count({ where: { workspaceId, task: "generate-jumps" } });
  const bulkRestoreLogs = (ids: string[]) => prisma.auditLog.count({ where: { workspaceId, action: "contact.restore", source: "contacts.bulk", entityId: { in: ids } } });

  it("offers Undo after a bulk archive; Undo restores once, keeps the Mixes and prepares follow-ups again", async () => {
    const mixId = await plan("Seasonal check-in");
    const ids = (await people(["Bea Undo", "Cal Undo"])).map((item) => item.id);
    for (const id of ids) await assign(mixId, id);
    await generateJumps({ workspaceId, mixId });
    expect(await prisma.jump.count({ where: { workspaceId, contactId: { in: ids }, status: "PENDING" } })).toBe(2);

    const archived = new URL(await redirectOf(bulkArchiveContactsAction(form({ contactIds: ids }))), "https://app.invalid");
    expect(archived.pathname).toBe("/contacts");
    expect(archived.searchParams.get("bulkArchived")).toBe("2");
    expect(archived.searchParams.get("archivedContacts")?.split(",").sort()).toEqual([...ids].sort());

    const jobsBefore = await generateJumpsJobs();
    const undo = form({ contactIds: archived.searchParams.get("archivedContacts")!.split(",") });
    expect(await redirectOf(restoreContactsAction(undo))).toBe("/contacts?bulkRestored=2");
    expect(await prisma.contact.count({ where: { id: { in: ids }, archivedAt: null } })).toBe(2);
    expect(await bulkRestoreLogs(ids)).toBe(2);
    expect(await generateJumpsJobs()).toBe(jobsBefore + 1);

    // A second tap finds nobody left to restore: the same success, nothing logged or queued again.
    expect(await redirectOf(restoreContactsAction(form({ contactIds: ids })))).toBe("/contacts?bulkRestored=2");
    expect(await bulkRestoreLogs(ids)).toBe(2);
    expect(await generateJumpsJobs()).toBe(jobsBefore + 1);

    expect((await prisma.mixAssignment.findMany({ where: { workspaceId, mixId, contactId: { in: ids } } })).every((item) => item.isActive)).toBe(true);
    await generateJumps({ workspaceId, mixId });
    for (const id of ids) expect(await prisma.jump.count({ where: { workspaceId, contactId: id, status: "PENDING" } })).toBeGreaterThan(0);
  });

  it("restores, logs and reconciles once when Undo is sent twice at the same moment", async () => {
    const ids = (await people(["Dee Double", "Eli Double"])).map((item) => item.id);
    await redirectOf(bulkArchiveContactsAction(form({ contactIds: ids })));
    const jobsBefore = await generateJumpsJobs();
    const results = await Promise.all([redirectOf(restoreContactsAction(form({ contactIds: ids }))), redirectOf(restoreContactsAction(form({ contactIds: ids })))]);
    expect(results).toEqual(["/contacts?bulkRestored=2", "/contacts?bulkRestored=2"]);
    expect(await prisma.contact.count({ where: { id: { in: ids }, archivedAt: null } })).toBe(2);
    expect(await bulkRestoreLogs(ids)).toBe(2);
    expect(await generateJumpsJobs()).toBe(jobsBefore + 1);
  });

  it("offers no Undo beyond one page and restores only this business's archived people", async () => {
    const many = Array.from({ length: 51 }, (_, index) => ({ id: `bulk-undo-${randomUUID()}`, workspaceId, displayName: `Page Person ${index}` }));
    await prisma.contact.createMany({ data: many });
    expect(await redirectOf(bulkArchiveContactsAction(form({ contactIds: many.map((item) => item.id) })))).toBe("/contacts?bulkArchived=51");

    const outsider = await prisma.contact.create({ data: { workspaceId: otherWorkspaceId, displayName: "Other Business Person", archivedAt: new Date() } });
    expect(await redirectOf(restoreContactsAction(form({ contactIds: [outsider.id] })))).toBe("/contacts?error=Archived%20Contacts%20not%20found.");
    expect(await redirectOf(restoreContactsAction(form({ contactIds: [many[0].id, outsider.id] })))).toBe("/contacts?bulkRestored=1");
    expect((await prisma.contact.findUniqueOrThrow({ where: { id: many[0].id } })).archivedAt).toBeNull();
    expect((await prisma.contact.findUniqueOrThrow({ where: { id: outsider.id } })).archivedAt).not.toBeNull();
    expect(await redirectOf(restoreContactsAction(form({})))).toBe("/contacts?error=Select%20at%20least%20one%20Contact.");
  });

  it("returns a restore from an archived person's page to that person", async () => {
    const [fay] = await people(["Fay Profile"]);
    await prisma.contact.update({ where: { id: fay.id }, data: { archivedAt: new Date() } });
    expect(await redirectOf(restoreContactAction(form({ contactId: fay.id, returnTo: `/contacts/${fay.id}` })))).toBe(`/contacts/${fay.id}?restored=1`);
    expect((await prisma.contact.findUniqueOrThrow({ where: { id: fay.id } })).archivedAt).toBeNull();
    // Another person's page is not a return target; a missing person goes to the Archived list.
    expect(await redirectOf(restoreContactAction(form({ contactId: fay.id, returnTo: "/contacts/someone-else" })))).toBe("/contacts/archived?restored=1");
    const missing = `missing-${randomUUID()}`;
    expect(await redirectOf(restoreContactAction(form({ contactId: missing, returnTo: `/contacts/${missing}` })))).toBe("/contacts/archived?error=Archived%20Contact%20not%20found.");
  });
});
