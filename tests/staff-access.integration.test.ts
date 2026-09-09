import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "../src/lib/prisma";
import { changeStaffAccess, userHasAdminPermission, validateStaffAccess } from "../src/lib/staff-access";
import { deleteAccountData } from "../src/lib/account-deletion";
import { createAdminImpersonationGrant, resolveAdminImpersonationGrant } from "../src/lib/impersonation";
import { bootstrapFirstOwner } from "../src/lib/staff-bootstrap";
import { accountHome } from "../src/lib/account-home";
import type { StaffRole } from "../src/generated/prisma/client";

const local = /^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? "");
const ids: string[] = [];
async function person(role?: StaffRole, grants: string[] = []) {
  const id = `staff-test-${randomUUID()}`;
  const user = await prisma.user.create({ data: { id, email: `${id}@example.test`, name: "Staff", emailVerifiedAt: new Date(), ...(role ? { staffMembership: { create: { role, grants } } } : {}) } });
  ids.push(id);
  const session = await prisma.session.create({ data: { userId: id, tokenHash: randomUUID(), expiresAt: new Date(Date.now() + 3600_000) } });
  if (role) {
    await prisma.adminMfaCredential.create({ data: { userId: id, secretCiphertext: "test-fixture", enabledAt: new Date() } });
    await prisma.adminMfaSession.create({ data: { userId: id, sessionId: session.id, expiresAt: session.expiresAt } });
  }
  return { user, session };
}
describe.skipIf(!local)("staff access transactions", () => {
  afterEach(async () => {
    await prisma.adminImpersonation.deleteMany({ where: { OR: [{ actorUserId: { in: ids } }, { targetUserId: { in: ids } }] } });
    await prisma.supportTicket.deleteMany({ where: { requesterUserId: { in: ids } } });
    await prisma.workspace.deleteMany({ where: { ownerId: { in: ids } } });
    await prisma.adminMfaSession.deleteMany({ where: { userId: { in: ids } } });
    await prisma.adminMfaCredential.deleteMany({ where: { userId: { in: ids } } });
    const members = await prisma.staffMembership.findMany({ where: { userId: { in: ids } }, select: { id: true } });
    await prisma.platformAuditEvent.deleteMany({ where: { OR: [{ actorUserId: { in: ids } }, { entityId: { in: members.map(m => m.id) } }] } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    ids.length = 0;
  });
  it("bootstraps a staff-only operator, requires verified email and MFA, and then locks bootstrap", async () => {
    const email = `bootstrap-${randomUUID()}@example.test`;
    expect(await bootstrapFirstOwner(email)).toBe(false);
    const user = await prisma.user.findUniqueOrThrow({ where: { email } }); ids.push(user.id);
    expect(user.emailVerifiedAt).toBeNull();
    expect(await prisma.workspaceMember.count({ where: { userId: user.id } })).toBe(0);
    expect(await userHasAdminPermission(user.id, "staff.manage")).toBe(false);
    await prisma.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date() } });
    expect(await bootstrapFirstOwner(email)).toBe(false);
    await prisma.adminMfaCredential.create({ data: { userId: user.id, secretCiphertext: "test-fixture", enabledAt: new Date() } });
    expect(await bootstrapFirstOwner(email)).toBe(true);
    expect(await userHasAdminPermission(user.id, "staff.manage")).toBe(true);
    await expect(bootstrapFirstOwner(email)).rejects.toThrow("active owner already exists");
  });
  it("a legacy admin boolean cannot grant permissions", async () => {
    const { user } = await person();
    await prisma.user.update({ where: { id: user.id }, data: { isPlatformAdmin: true } });
    expect(await userHasAdminPermission(user.id, "staff.manage")).toBe(false);
    expect(await userHasAdminPermission(user.id, "waitlist.manage")).toBe(false);
  });
  it("owner changes are audited and end the target's sessions and support views", async () => {
    const owner = await person("OWNER"); const target = await person("SUPPORT");
    const input = { actorUserId: owner.user.id, actorSessionId: owner.session.id, targetUserId: target.user.id, expectedRevision: 1, role: "GROWTH" as const, status: "ACTIVE" as const, grants: [], denies: ["waves.pause"], reason: "Changed team responsibility" };
    await changeStaffAccess(input);
    expect(await prisma.session.count({ where: { userId: target.user.id } })).toBe(0);
    expect(await userHasAdminPermission(target.user.id, "waitlist.manage")).toBe(true);
    expect(await userHasAdminPermission(target.user.id, "waves.pause")).toBe(false);
    expect(await prisma.platformAuditEvent.findFirst({ where: { actorUserId: owner.user.id } })).toMatchObject({ action: "staff.access.update", reason: input.reason });
    await expect(changeStaffAccess(input)).rejects.toThrow("changed");
  });
  it("rechecks owner authority and session state inside the mutation transaction", async () => {
    const owner = await person("OWNER"); const target = await person();
    await prisma.staffMembership.update({ where: { userId: owner.user.id }, data: { role: "OPERATOR" } });
    await expect(changeStaffAccess({ actorUserId: owner.user.id, actorSessionId: owner.session.id, targetUserId: target.user.id, expectedRevision: 0, role: "SUPPORT", status: "ACTIVE", grants: [], denies: [], reason: "Unauthorized attempt" })).rejects.toThrow("Owner access");
  });
  it("protects the last owner from demotion, disable and self-deletion", async () => {
    const owner = await person("OWNER");
    const input = { actorUserId: owner.user.id, actorSessionId: owner.session.id, targetUserId: owner.user.id, expectedRevision: 1, role: "SUPPORT" as const, status: "ACTIVE" as const, grants: [], denies: [], reason: "Test last owner protection" };
    await expect(changeStaffAccess(input)).rejects.toThrow("one active owner");
    await expect(changeStaffAccess({ ...input, role: "OWNER", status: "DISABLED" })).rejects.toThrow("one active owner");
    await expect(deleteAccountData(owner.user.id)).rejects.toThrow("another active owner");
  });
  it("serializes concurrent owner demotions so one owner survives", async () => {
    const first = await person("OWNER"); const second = await person("OWNER");
    const results = await Promise.allSettled([first, second].map(owner => changeStaffAccess({ actorUserId: owner.user.id, actorSessionId: owner.session.id, targetUserId: owner.user.id, expectedRevision: 1, role: "OPERATOR", status: "ACTIVE", grants: [], denies: [], reason: "Concurrent owner demotion test" })));
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(await prisma.staffMembership.count({ where: { userId: { in: [first.user.id, second.user.id] }, role: "OWNER", status: "ACTIVE" } })).toBe(1);
  });
  it("requires MFA before owner promotion and rejects arbitrary permission input", async () => {
    const owner = await person("OWNER"); const target = await person();
    await expect(changeStaffAccess({ actorUserId: owner.user.id, actorSessionId: owner.session.id, targetUserId: target.user.id, expectedRevision: 0, role: "OWNER", status: "ACTIVE", grants: [], denies: [], reason: "Promote a new account" })).rejects.toThrow("Enable MFA");
    expect(() => validateStaffAccess({ role: "SUPPORT", status: "ACTIVE", grants: ["staff.manage"], denies: [], reason: "An invalid grant" })).toThrow("Only owners");
    expect(() => validateStaffAccess({ role: "SUPPORT", status: "ACTIVE", grants: ["__proto__"], denies: [], reason: "An invalid grant" })).toThrow("listed permissions");
  });
  it("customer-content permission revocation invalidates an existing support view immediately", async () => {
    const support = await person("SUPPORT", ["support.view_customer"]); const target = await person();
    const workspace = await prisma.workspace.create({ data: { name: "Test", slug: randomUUID(), ownerId: target.user.id, members: { create: { userId: target.user.id, role: "OWNER" } } } });
    const ticket = await prisma.supportTicket.create({ data: { reference: randomUUID(), title: "Support issue", category: "GENERAL", workspaceId: workspace.id, requesterUserId: target.user.id, assignedToUserId: support.user.id } });
    const { rawToken } = await createAdminImpersonationGrant({ actorUserId: support.user.id, actorSessionId: support.session.id, ticketId: ticket.id, expectedRevision: 0, reason: "Investigate a support issue" });
    expect(await resolveAdminImpersonationGrant(rawToken, support.user.id, support.session.id)).not.toBeNull();
    await prisma.staffMembership.update({ where: { userId: support.user.id }, data: { denies: ["support.view_customer"] } });
    expect(await resolveAdminImpersonationGrant(rawToken, support.user.id, support.session.id)).toBeNull();
  });
  it("staff without a customer workspace go directly to administration", async () => {
    const staff = await person("GROWTH");
    expect(await accountHome(staff.user.id)).toBe("/admin");
    expect(await prisma.workspaceMember.count({ where: { userId: staff.user.id } })).toBe(0);
  });
});
