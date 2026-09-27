import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_ADMISSION_POLICY } from "../src/lib/admission";
import { invitationsLeft } from "../src/lib/invitation-allowance";
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
