import { createHash, randomBytes, randomUUID } from "node:crypto";
import { prisma } from "../../src/lib/prisma";

export async function createSupportFixture() {
  const users: string[] = [];
  async function person(name: string, staff = false) {
    const id = `support-case-${randomUUID()}`;
    users.push(id);
    const user = await prisma.user.create({ data: { id, name, email: `${id}@example.test`, emailVerifiedAt: new Date(), ...(staff ? { staffMembership: { create: { role: "SUPPORT", grants: ["support.view_customer"] } } } : {}) } });
    const token = randomBytes(32).toString("base64url");
    const session = await prisma.session.create({ data: { userId: id, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3600_000) } });
    if (staff) {
      await prisma.adminMfaCredential.create({ data: { userId: id, enabledAt: new Date(), secretCiphertext: "test-only-support-credential" } });
      await prisma.adminMfaSession.create({ data: { userId: id, sessionId: session.id, expiresAt: session.expiresAt } });
    }
    return { user, session, token };
  }
  const admin = await person("Case handler", true), colleague = await person("Other handler", true), customer = await person("Private customer");
  const workspace = await prisma.workspace.create({ data: { name: "Private customer workspace", slug: randomUUID(), ownerId: customer.user.id, members: { create: { userId: customer.user.id, role: "OWNER" } }, profile: { create: {} } } });
  const ticket = await prisma.supportTicket.create({ data: { reference: `CASE-${randomUUID()}`, workspaceId: workspace.id, requesterUserId: customer.user.id, title: "Help with a missing follow-up", category: "JUMPS", messages: { create: { authorUserId: customer.user.id, authorType: "USER", body: "PRIVATE_SUPPORT_BODY_SENTINEL" } } } });
  return { admin, colleague, customer, workspace, ticket, actor: { actorUserId: admin.user.id, actorSessionId: admin.session.id }, async cleanup() {
    await prisma.adminImpersonation.deleteMany({ where: { actorUserId: { in: users } } });
    await prisma.supportTicket.deleteMany({ where: { workspaceId: workspace.id } });
    await prisma.workspace.deleteMany({ where: { id: workspace.id } });
    await prisma.adminMfaSession.deleteMany({ where: { userId: { in: users } } });
    await prisma.adminMfaCredential.deleteMany({ where: { userId: { in: users } } });
    await prisma.platformAuditEvent.deleteMany({ where: { actorUserId: { in: users } } });
    await prisma.userPreference.deleteMany({ where: { userId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
  } };
}
