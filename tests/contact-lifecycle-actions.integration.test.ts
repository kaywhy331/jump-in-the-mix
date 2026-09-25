import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { generateJumps } from "../src/lib/jump-engine";
import { prisma } from "../src/lib/prisma";

const auth = vi.hoisted(() => ({ context: {} as Record<string, unknown> }));
vi.mock("@/lib/auth", () => ({ requireWorkspace: async () => auth.context }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`REDIRECT ${url}`); } }));
vi.mock("@/lib/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/env")>();
  return { ...actual, env: { ...actual.env, authRateLimitSecret: "contact-lifecycle-test-secret-00001" } };
});
import { bulkArchiveContactsAction } from "../src/lib/bulk-contact-actions";
import { restoreContactAction } from "../src/lib/contact-lifecycle-actions";
import { mergeContactsAction } from "../src/lib/contact-merge-actions";
import { viewerErrorMessage } from "../src/lib/form-errors";

const local = /^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? "");
const read = (path: string) => readFileSync(path, "utf8");
const DAY = 86_400_000;

function form(entries: Record<string, string | string[]>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) for (const item of Array.isArray(value) ? value : [value]) data.append(key, item);
  return data;
}

describe.skipIf(!local)("contact lifecycle actions with PostgreSQL", () => {
  let workspaceId = "";
  let userId = "";
  let otherUserId = "";

  /** A one-beat Mix started by hand: its follow-up lands the day after the start. */
  async function plan(name: string): Promise<string> {
    const template = await prisma.stepTemplate.create({ data: { workspaceId, name, channel: "SMS", versions: { create: { version: 1, body: `Hi {{First Name}}, about ${name}.` } } }, include: { versions: true } });
    const mix = await prisma.mix.create({ data: { workspaceId, name, triggerMode: "MANUAL_START", status: "ACTIVE" } });
    await prisma.mixStep.create({ data: { mixId: mix.id, stepVersionId: template.versions[0].id, dayOffset: 1, sortOrder: 1 } });
    return mix.id;
  }
  const assign = (mixId: string, contactId: string) => prisma.mixAssignment.create({ data: { assignmentKey: `${workspaceId}:${mixId}:${contactId}`, workspaceId, mixId, contactId, mode: "SNAPSHOT", startDate: new Date() } });
  const person = (displayName: string, archivedAt: Date | null = null) => prisma.contact.create({ data: { workspaceId, displayName, firstName: displayName.split(" ")[0], archivedAt } });
  const invite = (inviterUserId: string, contactId: string) => prisma.referralAccessInvite.create({ data: { inviterUserId, workspaceId, contactId, recipientEmail: `${randomUUID()}@example.com`, tokenHash: `invite-${randomUUID()}`, tokenCiphertext: "test-only" } });
  const generateJumpsJobs = () => prisma.job.count({ where: { workspaceId, task: "generate-jumps" } });

  beforeAll(async () => {
    const suffix = randomUUID();
    const owner = await prisma.user.create({ data: { email: `lifecycle-owner-${suffix}@example.com`, name: "Lifecycle Owner", passwordHash: "test-only" } });
    const other = await prisma.user.create({ data: { email: `lifecycle-other-${suffix}@example.com`, name: "Other Inviter", passwordHash: "test-only" } });
    const workspace = await prisma.workspace.create({ data: { name: "Lifecycle actions", slug: `lifecycle-actions-${suffix}`, ownerId: owner.id, profile: { create: {} } } });
    await prisma.workspaceMember.create({ data: { workspaceId: workspace.id, userId: owner.id, role: "OWNER" } });
    workspaceId = workspace.id;
    userId = owner.id;
    otherUserId = other.id;
    auth.context = { session: { authUser: owner }, user: owner, workspace, impersonation: null };
  });

  afterAll(async () => {
    if (!workspaceId) return;
    // These tables have no cascade from the workspace.
    await prisma.contactActivity.deleteMany({ where: { workspaceId } });
    await prisma.mixStop.deleteMany({ where: { workspaceId } });
    await prisma.reviewRequest.deleteMany({ where: { workspaceId } });
    await prisma.contactMergeRecord.deleteMany({ where: { workspaceId } });
    await prisma.workspace.delete({ where: { id: workspaceId } });
    await prisma.user.deleteMany({ where: { id: { in: [userId, otherUserId] } } });
  });

  it("merging copies the merged person's Mix stops onto the survivor and moves their anchored work", async () => {
    const survivor = await person("Alex Survivor");
    const source = await person("Alex Duplicate");
    const stoppedMix = await plan("Estimate follow-up");
    const runningMix = await plan("Thank-you note");
    const visitMix = await plan("Visit follow-up");
    await assign(stoppedMix, source.id);
    await assign(runningMix, source.id);
    const survivorVisitAssignment = await assign(visitMix, survivor.id);
    await prisma.mixStop.create({ data: { workspaceId, mixId: stoppedMix, contactId: source.id, stoppedByUserId: userId, reason: "Customer asked us to stop" } });
    const startsAt = new Date(Date.now() + DAY);
    const entry = await prisma.calendarEntry.create({ data: { workspaceId, contactId: source.id, title: "Kitchen estimate", kind: "MEETING", startsAt, endsAt: new Date(startsAt.getTime() + 3_600_000), timezone: "America/New_York" } });
    const boundAssignment = await prisma.mixAssignment.create({ data: { assignmentKey: `${workspaceId}:${visitMix}:appointment:${entry.id}:${source.id}`, workspaceId, mixId: visitMix, contactId: source.id, mode: "SNAPSHOT" } });
    const binding = await prisma.appointmentBinding.create({ data: { workspaceId, contactId: source.id, calendarEntryId: entry.id, mixId: visitMix, assignmentId: boundAssignment.id } });
    const review = await prisma.reviewRequest.create({ data: { workspaceId, contactId: source.id, tokenHash: `review-${randomUUID()}`, expiresAt: new Date(Date.now() + 30 * DAY) } });
    const survivorInviteFromOther = await invite(otherUserId, survivor.id);
    const sourceInviteFromOwner = await invite(userId, source.id);
    const sourceInviteFromOther = await invite(otherUserId, source.id);

    await expect(mergeContactsAction(form({ survivorContactId: survivor.id, sourceContactId: source.id, confirmation: source.displayName }))).rejects.toThrow(`REDIRECT /contacts/${survivor.id}?merged=1`);

    // The stop now applies to the survivor and stays on the archived record.
    expect(await prisma.mixStop.findUnique({ where: { workspaceId_mixId_contactId: { workspaceId, mixId: stoppedMix, contactId: survivor.id } } })).toMatchObject({ reason: "Customer asked us to stop", stoppedByUserId: userId });
    expect(await prisma.mixStop.count({ where: { workspaceId, mixId: stoppedMix, contactId: source.id } })).toBe(1);
    const record = await prisma.contactMergeRecord.findFirstOrThrow({ where: { workspaceId, survivorContactId: survivor.id, mergedContactId: source.id } });
    expect(record.mergeSummary).toMatchObject({ copiedStops: 1, movedAssignments: 3, movedAppointmentBindings: 1, movedReviewRequests: 1, movedAccessInvites: 1, skippedAccessInvites: 1 });

    // The reconciliation the merge queues generates nothing for the stopped Mix, while the other
    // moved assignment does produce the survivor's follow-up.
    await generateJumps({ workspaceId });
    expect(await prisma.jump.count({ where: { workspaceId, contactId: survivor.id, mixId: stoppedMix, status: "PENDING" } })).toBe(0);
    expect(await prisma.jump.count({ where: { workspaceId, contactId: survivor.id, mixId: runningMix, status: "PENDING" } })).toBeGreaterThan(0);

    // Person-anchored rows reference the survivor; the visit's own assignment moved instead of
    // collapsing into the survivor's plain assignment for the same Mix.
    expect((await prisma.appointmentBinding.findUniqueOrThrow({ where: { id: binding.id } })).contactId).toBe(survivor.id);
    expect(await prisma.mixAssignment.findUniqueOrThrow({ where: { id: boundAssignment.id } })).toMatchObject({ contactId: survivor.id, isActive: true });
    expect(await prisma.mixAssignment.findUniqueOrThrow({ where: { id: survivorVisitAssignment.id } })).toMatchObject({ contactId: survivor.id, isActive: true });
    expect((await prisma.reviewRequest.findUniqueOrThrow({ where: { id: review.id } })).contactId).toBe(survivor.id);
    expect((await prisma.referralAccessInvite.findUniqueOrThrow({ where: { id: sourceInviteFromOwner.id } })).contactId).toBe(survivor.id);
    expect((await prisma.referralAccessInvite.findUniqueOrThrow({ where: { id: sourceInviteFromOther.id } })).contactId).toBe(source.id);
    expect((await prisma.referralAccessInvite.findUniqueOrThrow({ where: { id: survivorInviteFromOther.id } })).contactId).toBe(survivor.id);
  });

  it("bulk archive keeps Mix assignments, holds follow-ups like a single archive, logs each person and queues one reconciliation", async () => {
    const mixId = await plan("Seasonal check-in");
    const people = await Promise.all(["Bea Bulk", "Cal Bulk"].map((name) => person(name)));
    const ids = people.map((item) => item.id);
    for (const id of ids) await assign(mixId, id);
    await generateJumps({ workspaceId, mixId });
    expect(await prisma.jump.count({ where: { workspaceId, contactId: { in: ids }, status: "PENDING" } })).toBe(2);
    const jobsBefore = await generateJumpsJobs();

    await expect(bulkArchiveContactsAction(form({ contactIds: ids }))).rejects.toThrow("REDIRECT /contacts?bulkArchived=2");

    const assignments = await prisma.mixAssignment.findMany({ where: { workspaceId, mixId, contactId: { in: ids } } });
    expect(assignments).toHaveLength(2);
    expect(assignments.every((assignment) => assignment.isActive)).toBe(true);
    expect(await prisma.contact.count({ where: { id: { in: ids }, archivedAt: { not: null } } })).toBe(2);
    expect(await prisma.jump.count({ where: { workspaceId, contactId: { in: ids }, status: "CANCELED", completionMethod: "contact_archived" } })).toBe(2);
    expect(await prisma.auditLog.count({ where: { workspaceId, action: "contact.archive", entityType: "Contact", entityId: { in: ids } } })).toBe(2);
    expect(await generateJumpsJobs()).toBe(jobsBefore + 1);

    // Archived people get nothing; restoring one brings that person's follow-up back without re-adding the Mix.
    await generateJumps({ workspaceId, mixId });
    expect(await prisma.jump.count({ where: { workspaceId, contactId: { in: ids }, status: "PENDING" } })).toBe(0);
    await expect(restoreContactAction(form({ contactId: ids[0] }))).rejects.toThrow("REDIRECT /contacts/archived?restored=1");
    await generateJumps({ workspaceId, mixId });
    expect(await prisma.jump.count({ where: { workspaceId, contactId: ids[0], status: "PENDING" } })).toBeGreaterThan(0);
    expect(await prisma.jump.count({ where: { workspaceId, contactId: ids[1], status: "PENDING" } })).toBe(0);
  });

  it("restores once and treats a repeated Undo or Restore as the same success", async () => {
    const dana = await person("Dana Restore", new Date());
    await expect(restoreContactAction(form({ contactId: dana.id, returnTo: "/contacts" }))).rejects.toThrow("REDIRECT /contacts?restored=1");
    expect((await prisma.contact.findUniqueOrThrow({ where: { id: dana.id } })).archivedAt).toBeNull();
    const jobsAfterFirst = await generateJumpsJobs();

    await expect(restoreContactAction(form({ contactId: dana.id, returnTo: "/contacts" }))).rejects.toThrow("REDIRECT /contacts?restored=1");
    await expect(restoreContactAction(form({ contactId: dana.id }))).rejects.toThrow("REDIRECT /contacts/archived?restored=1");
    expect(await generateJumpsJobs()).toBe(jobsAfterFirst);
    expect(await prisma.auditLog.count({ where: { workspaceId, action: "contact.restore", entityId: dana.id } })).toBe(1);

    const missing = await restoreContactAction(form({ contactId: `missing-${randomUUID()}` })).then(() => "", (error: Error) => error.message.replace(/^REDIRECT /, ""));
    expect(missing.startsWith("/contacts/archived?error=")).toBe(true);
    expect(viewerErrorMessage(Object.fromEntries(new URL(missing, "https://app.invalid").searchParams), { authUser: { id: userId } })).toBe("Archived Contact not found.");
  });
});

describe("contact list sources", () => {
  it("name each tag's delete control, warn about running Mixes, and search phone digits with pending-aware restore buttons", () => {
    const workspace = read("src/components/ContactsBulkWorkspace.tsx");
    expect(workspace).toContain("triggerAriaLabel={`Delete the ${group.name} tag`}");
    expect(workspace).toContain("for this tag's people and will stop for them.");
    for (const page of ["src/app/(app)/contacts/page.tsx", "src/app/(app)/contacts/archived/page.tsx"]) {
      const source = read(page);
      expect(source).toContain("phoneSearchDigits(q)");
      expect(source).toContain("normalized: { contains: digits }");
      expect(source).toContain("<FormSubmitButton");
    }
    const bulk = read("src/lib/bulk-contact-actions.ts");
    expect(bulk).not.toContain("mixAssignment.updateMany");
    expect(bulk).toContain('completionMethod: "contact_archived"');
  });
});
