import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/env", async importOriginal => ({ ...(await importOriginal<{ env: object }>()), env: { ...(await importOriginal<{ env: object }>()).env, requireAdminMfa: true } }));
import { createAdminImpersonationGrant, endAdminImpersonationGrant, hashImpersonationToken, resolveAdminImpersonationGrant } from "../src/lib/impersonation";
import { assignSupportTicket, readSupportCase } from "../src/lib/support-case-access";
import { retrySupportEmail } from "../src/lib/support-email-recovery";
import { adminReplyToSupportTicketRecord, updateSupportTicketStatus, updateSupportTicketTriage } from "../src/lib/support-service";
import { supportReadContext } from "../src/lib/support-read-audit";
import { prisma } from "../src/lib/prisma";
import { createSupportFixture } from "./helpers/support-fixture";

const local = /^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? "");
describe.skipIf(!local).sequential("case-scoped customer support", () => {
  let f: Awaited<ReturnType<typeof createSupportFixture>>;
  beforeEach(async () => { f = await createSupportFixture(); });
  afterEach(async () => { await f.cleanup(); });
  async function assign() { return assignSupportTicket({ ...f.actor, ticketId: f.ticket.id, assignedToUserId: f.admin.user.id, expectedRevision: 0, reason: "Investigate this reported issue" }); }
  function start(expectedRevision = 1) { return createAdminImpersonationGrant({ ...f.actor, ticketId: f.ticket.id, expectedRevision, reason: "Investigate the missing follow-up" }); }
  function resolve(token: string) { return resolveAdminImpersonationGrant(token, f.actor.actorUserId, f.actor.actorSessionId); }

  it("derives the customer from an assigned case, binds the view to its session, audits reads once per request and ends once", async () => {
    await assign(); const { rawToken, grant } = await start();
    expect(grant).toMatchObject({ tokenHash: hashImpersonationToken(rawToken), ticketId: f.ticket.id, actorSessionId: f.admin.session.id, targetUserId: f.customer.user.id, workspaceId: f.workspace.id });
    expect(JSON.stringify(grant)).not.toContain(rawToken);
    const read = { requestId: randomUUID(), resource: "contacts" };
    const resolved = await resolveAdminImpersonationGrant(rawToken, f.admin.user.id, f.admin.session.id, read);
    expect(resolved?.targetUser.memberships.map(m => m.workspaceId)).toEqual([f.workspace.id]);
    await resolveAdminImpersonationGrant(rawToken, f.admin.user.id, f.admin.session.id, read);
    expect(await prisma.platformAuditEvent.count({ where: { actorUserId: f.admin.user.id, action: "support.view.read" } })).toBe(1);
    expect(await resolveAdminImpersonationGrant(rawToken, f.admin.user.id, f.colleague.session.id)).toBeNull();
    expect(await resolveAdminImpersonationGrant(rawToken, f.colleague.user.id, f.colleague.session.id)).toBeNull();
    expect((await Promise.all([endAdminImpersonationGrant(rawToken, f.admin.user.id), endAdminImpersonationGrant(rawToken, f.admin.user.id)])).filter(Boolean)).toHaveLength(1);
    expect(await resolve(rawToken)).toBeNull();
    const audit = await prisma.platformAuditEvent.findMany({ where: { actorUserId: f.admin.user.id } });
    expect(audit.map(row => row.action)).toEqual(expect.arrayContaining(["support.case.assign", "support.view.start", "support.view.read", "support.view.end"]));
    expect(JSON.stringify(audit)).not.toMatch(/PRIVATE_SUPPORT_BODY_SENTINEL|test-only-support-credential/);
    expect(JSON.stringify(audit)).not.toContain(rawToken);
  });

  it("rejects unassigned, unrelated, stale and resolved cases without creating access", async () => {
    await expect(start(0)).rejects.toThrow("assigned to you");
    await assign(); await expect(start(0)).rejects.toThrow("changed");
    await prisma.supportTicket.update({ where: { id: f.ticket.id }, data: { requesterUserId: f.colleague.user.id } });
    await expect(start()).rejects.toThrow("no longer has access");
    await prisma.supportTicket.update({ where: { id: f.ticket.id }, data: { requesterUserId: f.customer.user.id, status: "RESOLVED" } });
    await expect(start()).rejects.toThrow("active ticket");
    expect(await prisma.adminImpersonation.count({ where: { actorUserId: f.admin.user.id } })).toBe(0);
  });

  it("serializes assignment races, rejects invalid assignees, and permanently ends views on transfer", async () => {
    const input = { ...f.actor, ticketId: f.ticket.id, expectedRevision: 0, reason: "Take responsibility for this case" };
    await expect(assignSupportTicket({ ...input, assignedToUserId: f.customer.user.id })).rejects.toThrow("active staff");
    const results = await Promise.allSettled([assignSupportTicket({ ...input, assignedToUserId: f.admin.user.id }), assignSupportTicket({ ...input, assignedToUserId: f.admin.user.id })]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    const { rawToken, grant } = await start();
    await assignSupportTicket({ ...input, expectedRevision: 1, assignedToUserId: f.colleague.user.id });
    expect((await prisma.adminImpersonation.findUniqueOrThrow({ where: { id: grant.id } })).endedAt).not.toBeNull();
    await assignSupportTicket({ ...input, expectedRevision: 2, assignedToUserId: f.admin.user.id });
    expect(await resolve(rawToken)).toBeNull();
  });

  it("ends views when resolved and does not revive them when the case reopens", async () => {
    await assign(); const { rawToken } = await start();
    const input = { ticketId: f.ticket.id, adminUserId: f.admin.user.id, actorSessionId: f.admin.session.id };
    await updateSupportTicketStatus({ ...input, status: "RESOLVED" });
    await updateSupportTicketStatus({ ...input, status: "OPEN" });
    expect(await resolve(rawToken)).toBeNull();
    const [opening, closing] = await Promise.allSettled([start(), updateSupportTicketStatus({ ...input, status: "CLOSED" })]);
    expect(closing.status).toBe("fulfilled");
    if (opening.status === "fulfilled") expect(await resolve(opening.value.rawToken)).toBeNull();
  });

  it.each(["support.manage", "support.view_customer"])("rechecks %s during both grant creation and every customer read", async permission => {
    await assign(); const { rawToken } = await start();
    await prisma.staffMembership.update({ where: { userId: f.admin.user.id }, data: { denies: [permission] } });
    expect(await resolve(rawToken)).toBeNull(); await expect(start()).rejects.toThrow("permission");
  });

  it.each(["mfa-session", "mfa-credential", "session", "suspended", "unverified", "target-suspended", "membership", "expiry"])("fails closed after %s is removed or expires", async condition => {
    await assign(); const { rawToken, grant } = await start();
    if (condition === "mfa-session") await prisma.adminMfaSession.deleteMany({ where: { userId: f.admin.user.id } });
    if (condition === "mfa-credential") await prisma.adminMfaCredential.update({ where: { userId: f.admin.user.id }, data: { enabledAt: null } });
    if (condition === "session") await prisma.session.delete({ where: { id: f.admin.session.id } });
    if (condition === "suspended") await prisma.user.update({ where: { id: f.admin.user.id }, data: { suspendedAt: new Date() } });
    if (condition === "unverified") await prisma.user.update({ where: { id: f.admin.user.id }, data: { emailVerifiedAt: null } });
    if (condition === "target-suspended") await prisma.user.update({ where: { id: f.customer.user.id }, data: { suspendedAt: new Date() } });
    if (condition === "membership") await prisma.workspaceMember.deleteMany({ where: { workspaceId: f.workspace.id } });
    if (condition === "expiry") await prisma.adminImpersonation.update({ where: { id: grant.id }, data: { expiresAt: new Date(0) } });
    expect(await resolve(rawToken)).toBeNull();
  });

  it("audits private conversation reads and rechecks current authority for all ticket mutations and retries", async () => {
    const read = { requestId: randomUUID(), resource: "other" };
    expect((await readSupportCase({ ...f.actor, ticketId: f.ticket.id, read }))?.messages[0].body).toBe("PRIVATE_SUPPORT_BODY_SENTINEL");
    await readSupportCase({ ...f.actor, ticketId: f.ticket.id, read });
    expect(await prisma.platformAuditEvent.count({ where: { actorUserId: f.admin.user.id, action: "support.case.read" } })).toBe(1);
    await prisma.staffMembership.update({ where: { userId: f.admin.user.id }, data: { denies: ["support.manage"] } });
    const base = { ticketId: f.ticket.id, adminUserId: f.admin.user.id, actorSessionId: f.admin.session.id };
    await expect(readSupportCase({ ...f.actor, ticketId: f.ticket.id, read })).rejects.toThrow("permission");
    await expect(adminReplyToSupportTicketRecord({ ...base, requestKey: randomUUID(), body: "Unauthorized reply" })).rejects.toThrow("permission");
    await expect(updateSupportTicketStatus({ ...base, status: "CLOSED" })).rejects.toThrow("permission");
    await expect(updateSupportTicketTriage({ ...base, category: "ACCOUNT", priority: "HIGH" })).rejects.toThrow("permission");
    await expect(retrySupportEmail({ ...f.actor, ticketId: f.ticket.id, deliveryId: "unknown", expectedUpdatedAt: new Date().toISOString(), reason: "Unauthorized email retry attempt" })).rejects.toThrow("permission");
    expect(await prisma.supportTicketMessage.count({ where: { ticketId: f.ticket.id } })).toBe(1);
  });

  it("does not authorize legacy grants without a proven case and originating session", async () => {
    await assign(); const { rawToken, grant } = await start();
    await prisma.adminImpersonation.update({ where: { id: grant.id }, data: { ticketId: null } });
    expect(await resolve(rawToken)).toBeNull();
  });

  it("keeps search text and token paths out of read receipts", () => {
    for (const path of ["/register?invite=secret", "/contacts?search=private@example.test", "/review/secret", "/contacts/private%40example.test"]) {
      const context = supportReadContext(new Headers({ "x-jitm-support-path": path, "x-jitm-request-id": "untrusted" }));
      expect(context.resource).toBe("other"); expect(context.resourceId).toBeUndefined(); expect(context.requestId).not.toBe("untrusted");
    }
  });
});
