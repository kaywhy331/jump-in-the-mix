import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_ADMISSION_POLICY } from "../src/lib/admission";
import { hasRecordedOutcome, invitationsLeft } from "../src/lib/invitation-allowance";
import { prisma } from "../src/lib/prisma";

// The count behind every invitation prompt: shown only to the workspace owner, only while some are left and invitations are open.
describe.sequential("invitations left", () => {
  const suffix = randomUUID().slice(0, 8);
  let ownerId: string, memberId: string, workspaceId: string;
  const policy = (data: { grantsPaused?: boolean; referralsPaused?: boolean }) => prisma.admissionPolicy.upsert({ where: { id: "default" }, create: { ...DEFAULT_ADMISSION_POLICY, id: "default", ...data }, update: data });

  beforeAll(async () => {
    ownerId = (await prisma.user.create({ data: { email: `invite-owner-${suffix}@example.test`, name: "Owner", passwordHash: "test-only", referralInvitesIssued: 1 } })).id;
    memberId = (await prisma.user.create({ data: { email: `invite-member-${suffix}@example.test`, name: "Member", passwordHash: "test-only" } })).id;
    workspaceId = (await prisma.workspace.create({ data: { name: "Invitations", slug: `invitations-${suffix}`, ownerId, profile: { create: {} } } })).id;
    await policy({ grantsPaused: false, referralsPaused: false });
  });
  afterAll(async () => {
    await policy({ grantsPaused: DEFAULT_ADMISSION_POLICY.grantsPaused, referralsPaused: DEFAULT_ADMISSION_POLICY.referralsPaused });
    await prisma.workspace.deleteMany({ where: { id: workspaceId } });
    await prisma.user.deleteMany({ where: { id: { in: [ownerId, memberId] } } });
  });

  it("counts what the owner has left", async () => {
    expect(await invitationsLeft(ownerId, workspaceId)).toBe(2);
  });

  it("offers nothing to someone who is not the owner", async () => {
    expect(await invitationsLeft(memberId, workspaceId)).toBeNull();
  });

  it("offers nothing while invitations are paused", async () => {
    await policy({ referralsPaused: true });
    expect(await invitationsLeft(ownerId, workspaceId)).toBeNull();
    await policy({ referralsPaused: false, grantsPaused: true });
    expect(await invitationsLeft(ownerId, workspaceId)).toBeNull();
    await policy({ grantsPaused: false });
  });

  it("offers nothing once all are used", async () => {
    await prisma.user.update({ where: { id: ownerId }, data: { referralInvitesIssued: 3 } });
    expect(await invitationsLeft(ownerId, workspaceId)).toBeNull();
  });
});

// What opens Today's invitation prompt: the owner's first completed outcome, as activation counts it (JITM-01 §2.14).
describe.sequential("a recorded outcome", () => {
  const suffix = randomUUID().slice(0, 8);
  let ownerId: string;
  const workspaces: string[] = [];
  /** A workspace with one Mix and one person, and a way to add a follow-up in a given state. */
  async function workspace(name: string) {
    const workspaceId = (await prisma.workspace.create({ data: { name, slug: `outcomes-${name}-${suffix}`, ownerId, profile: { create: {} } } })).id;
    workspaces.push(workspaceId);
    const version = await prisma.stepVersion.create({ data: { stepTemplate: { create: { workspaceId, name: "Check in", channel: "SMS" } }, version: 1, body: "Hi." } });
    const mix = await prisma.mix.create({ data: { workspaceId, name: "Follow-up", status: "ACTIVE", triggerMode: "MANUAL_START", steps: { create: [{ stepVersionId: version.id, dayOffset: 0, sortOrder: 1 }] } }, include: { steps: true } });
    const contactId = (await prisma.contact.create({ data: { workspaceId, displayName: "Pat" } })).id;
    return {
      id: workspaceId,
      add: (status: "PENDING" | "DONE" | "SKIPPED", completionMethod: string | null) => prisma.jump.create({ data: { workspaceId, contactId, mixId: mix.id, mixStepId: mix.steps[0].id, stepVersionId: version.id, scheduledAt: new Date(), status, completedAt: status === "PENDING" ? null : new Date(), completionMethod, reason: "Check in", uniquenessKey: randomUUID(), templateSnapshot: {}, renderedSnapshot: {} } })
    };
  }

  beforeAll(async () => {
    ownerId = (await prisma.user.create({ data: { email: `outcome-owner-${suffix}@example.test`, name: "Owner", passwordHash: "test-only" } })).id;
  });
  afterAll(async () => {
    await prisma.workspace.deleteMany({ where: { id: { in: workspaces } } });
    await prisma.user.deleteMany({ where: { id: ownerId } });
  });

  it("waits for a completed outcome; skips, automatic sends, other completions and an undone outcome don't count", async () => {
    const first = await workspace("first");
    expect(await hasRecordedOutcome(first.id)).toBe(false);
    await first.add("PENDING", null);
    await first.add("SKIPPED", "outcome:skipped");
    await first.add("DONE", "automatic:sms");
    await first.add("DONE", "done");
    expect(await hasRecordedOutcome(first.id)).toBe(false);
    const sent = await first.add("DONE", "outcome:completed");
    expect(await hasRecordedOutcome(first.id)).toBe(true);
    // Undo reopens the follow-up and clears how it was completed.
    await prisma.jump.update({ where: { id: sent.id }, data: { status: "PENDING", completedAt: null, completionMethod: null } });
    expect(await hasRecordedOutcome(first.id)).toBe(false);
    await first.add("DONE", "outcome:no_answer");
    expect(await hasRecordedOutcome(first.id)).toBe(true);
  });

  it("counts only the workspace's own outcomes", async () => {
    const second = await workspace("second");
    expect(await hasRecordedOutcome(second.id)).toBe(false);
  });
});
