import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { deleteAccountData } from "../src/lib/account-deletion";
import { prisma } from "../src/lib/prisma";

// Rows in tables that have no foreign key to Workspace or User (audit F1/F2, 2026-09-24): the
// workspace cascade never reaches them, so deleteAccountData must remove them itself, keep a staff
// reply on someone else's ticket, and keep an open marketplace report without its reporter.
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const leaver = { userId: `orphan-user-${suffix}`, workspaceId: `orphan-workspace-${suffix}`, contactId: `orphan-contact-${suffix}` };
const neighbour = { userId: `orphan-neighbour-${suffix}`, workspaceId: `orphan-neighbour-workspace-${suffix}` };
const requestId = `orphan-request-${suffix}`;
const listingIds = { open: `orphan-listing-open-${suffix}`, decided: `orphan-listing-decided-${suffix}` };
const ticketIds = { own: `orphan-ticket-own-${suffix}`, neighbour: `orphan-ticket-neighbour-${suffix}` };
const workspaceIds = [leaver.workspaceId, neighbour.workspaceId];
const userIds = [leaver.userId, neighbour.userId];

async function seed() {
  await prisma.user.create({
    data: {
      id: leaver.userId, email: `orphan-${suffix}@example.com`, name: "Leaving Owner", passwordHash: "test-only",
      ownedWorkspaces: { create: { id: leaver.workspaceId, name: "Leaving Workspace", slug: `orphan-${suffix}`, members: { create: { userId: leaver.userId, role: "OWNER" } }, contacts: { create: { id: leaver.contactId, displayName: "Imported Customer" } } } }
    }
  });
  await prisma.user.create({
    data: {
      id: neighbour.userId, email: `orphan-neighbour-${suffix}@example.com`, name: "Neighbour", passwordHash: "test-only",
      ownedWorkspaces: { create: { id: neighbour.workspaceId, name: "Neighbour Workspace", slug: `orphan-neighbour-${suffix}`, members: { create: { userId: neighbour.userId, role: "OWNER" } } } }
    }
  });
  await prisma.contactImportBatch.create({ data: { workspaceId: leaver.workspaceId, actorUserId: leaver.userId, importId: `orphan-import-${suffix}`, totalRows: 1, payload: [{ displayName: "Imported Customer", email: "customer@example.com" }] } });
  await prisma.reviewRequest.create({ data: { workspaceId: leaver.workspaceId, contactId: leaver.contactId, tokenHash: `orphan-review-${suffix}`, rating: 2, feedback: "Private feedback", expiresAt: new Date(Date.now() + 86_400_000) } });
  await prisma.pushSubscription.createMany({
    data: [
      { workspaceId: leaver.workspaceId, userId: leaver.userId, endpoint: `https://push.example.com/orphan-own-${suffix}`, p256dh: "key", auth: "auth" },
      // A device the leaver registered while working in the neighbour's workspace: personal, so it goes too.
      { workspaceId: neighbour.workspaceId, userId: leaver.userId, endpoint: `https://push.example.com/orphan-member-${suffix}`, p256dh: "key", auth: "auth" },
      { workspaceId: neighbour.workspaceId, userId: neighbour.userId, endpoint: `https://push.example.com/orphan-neighbour-${suffix}`, p256dh: "key", auth: "auth" }
    ]
  });
  await prisma.notificationDelivery.createMany({
    data: [
      { workspaceId: leaver.workspaceId, userId: leaver.userId, kind: "DAILY_DIGEST", localDate: "2026-09-24" },
      { workspaceId: neighbour.workspaceId, userId: neighbour.userId, kind: "DAILY_DIGEST", localDate: "2026-09-24" }
    ]
  });
  const dateType = await prisma.dateType.create({ data: { workspaceId: leaver.workspaceId, scopeKey: leaver.workspaceId, name: "Orphan date", slug: `orphan-date-${suffix}` } });
  const template = await prisma.stepTemplate.create({ data: { workspaceId: leaver.workspaceId, name: "Orphan beat", channel: "EMAIL" } });
  const version = await prisma.stepVersion.create({ data: { stepTemplateId: template.id, version: 1, body: "Orphan test" } });
  const mix = await prisma.mix.create({ data: { workspaceId: leaver.workspaceId, name: "Orphan mix", status: "ACTIVE", triggerMode: "DATE_TRIGGERED", dateTypeId: dateType.id } });
  const mixStep = await prisma.mixStep.create({ data: { mixId: mix.id, stepVersionId: version.id, dayOffset: 0, sortOrder: 1 } });
  const jump = await prisma.jump.create({ data: { workspaceId: leaver.workspaceId, contactId: leaver.contactId, mixId: mix.id, mixStepId: mixStep.id, stepVersionId: version.id, templateSnapshot: { channel: "EMAIL", body: "Orphan test" }, renderedSnapshot: { body: "Orphan test" }, scheduledAt: new Date(), status: "PENDING", reason: "Orphan test", uniquenessKey: `orphan-jump-${suffix}` } });
  await prisma.automatedDelivery.create({ data: { workspaceId: leaver.workspaceId, jumpId: jump.id, channel: "EMAIL", reviewEligibleAt: new Date() } });
  await prisma.notificationPreference.createMany({
    data: [
      { workspaceId: leaver.workspaceId, userId: leaver.userId, emailDigestEnabled: true },
      { workspaceId: neighbour.workspaceId, userId: neighbour.userId }
    ]
  });
  await prisma.automationPreference.create({ data: { workspaceId: leaver.workspaceId, enabled: true } });
  await prisma.marketplaceListing.createMany({
    data: [
      { id: listingIds.open, kind: "MIX", workspaceId: neighbour.workspaceId, authorUserId: neighbour.userId, title: "Neighbour mix", fingerprint: `orphan-open-${suffix}`, status: "HIDDEN", hiddenReason: "SPAM", hiddenAt: new Date() },
      { id: listingIds.decided, kind: "MIX", workspaceId: neighbour.workspaceId, authorUserId: neighbour.userId, title: "Neighbour second mix", fingerprint: `orphan-decided-${suffix}` }
    ]
  });
  await prisma.marketplaceReport.createMany({
    data: [
      { listingId: listingIds.open, reporterUserId: leaver.userId, reporterWorkspaceId: leaver.workspaceId, reason: "SPAM", details: "The reporter's private words", autoHidden: true },
      { listingId: listingIds.decided, reporterUserId: leaver.userId, reporterWorkspaceId: leaver.workspaceId, reason: "OTHER", details: "Decided already", status: "DISMISSED", reviewedAt: new Date() }
    ]
  });
  await prisma.supportTicket.create({
    data: { id: ticketIds.own, reference: `JITM-ORPHAN-OWN-${suffix}`, workspaceId: leaver.workspaceId, requesterUserId: leaver.userId, title: "My own question", category: "ACCOUNT", messages: { create: { authorUserId: leaver.userId, authorType: "USER", body: "Private question" } } }
  });
  await prisma.supportTicket.create({
    data: {
      id: ticketIds.neighbour, reference: `JITM-ORPHAN-NEIGHBOUR-${suffix}`, workspaceId: neighbour.workspaceId, requesterUserId: neighbour.userId, title: "Neighbour question", category: "ACCOUNT",
      messages: { create: [
        { authorUserId: neighbour.userId, authorType: "USER", body: "How do I export my contacts?" },
        { authorUserId: leaver.userId, authorType: "ADMIN", body: "From My Account, choose Export." }
      ] }
    }
  });
}

beforeAll(seed);

afterAll(async () => {
  const owned = { workspaceId: { in: workspaceIds } };
  const ownedOrPersonal = { OR: [owned, { userId: { in: userIds } }] };
  await prisma.supportTicket.deleteMany({ where: owned });
  await prisma.contactImportBatch.deleteMany({ where: owned });
  await prisma.reviewRequest.deleteMany({ where: owned });
  await prisma.pushSubscription.deleteMany({ where: ownedOrPersonal });
  await prisma.notificationDelivery.deleteMany({ where: ownedOrPersonal });
  await prisma.automatedDelivery.deleteMany({ where: owned });
  await prisma.notificationPreference.deleteMany({ where: ownedOrPersonal });
  await prisma.automationPreference.deleteMany({ where: owned });
  await prisma.marketplaceReport.deleteMany({ where: { listingId: { in: Object.values(listingIds) } } });
  await prisma.workspace.deleteMany({ where: { id: { in: workspaceIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.accountDeletionAudit.deleteMany({ where: { requestId } });
  await prisma.$disconnect();
});

describe("account deletion reaches rows without foreign keys", () => {
  it("removes the leaver's import, review, device, delivery and preference rows and none of the neighbour's", async () => {
    await expect(deleteAccountData(leaver.userId, requestId)).resolves.toEqual({ deleted: true, requestId });
    const owned = { workspaceId: leaver.workspaceId };
    const ownedOrPersonal = { OR: [owned, { userId: leaver.userId }] };
    expect(await Promise.all([
      prisma.contactImportBatch.count({ where: owned }),
      prisma.reviewRequest.count({ where: owned }),
      prisma.pushSubscription.count({ where: ownedOrPersonal }),
      prisma.notificationDelivery.count({ where: ownedOrPersonal }),
      prisma.automatedDelivery.count({ where: owned }),
      prisma.notificationPreference.count({ where: ownedOrPersonal }),
      prisma.automationPreference.count({ where: owned })
    ])).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect(await Promise.all([
      prisma.workspace.count({ where: { id: neighbour.workspaceId } }),
      prisma.pushSubscription.count({ where: { userId: neighbour.userId } }),
      prisma.notificationDelivery.count({ where: { workspaceId: neighbour.workspaceId } }),
      prisma.notificationPreference.count({ where: { workspaceId: neighbour.workspaceId } })
    ])).toEqual([1, 1, 1, 1]);
    await expect(prisma.accountDeletionAudit.findUnique({ where: { requestId } })).resolves.toMatchObject({ status: "COMPLETED" });
  });

  it("keeps an open report in the staff queue without its reporter and drops decided ones", async () => {
    const open = await prisma.marketplaceReport.findFirstOrThrow({ where: { listingId: listingIds.open } });
    expect(open).toMatchObject({ status: "OPEN", autoHidden: true, reporterUserId: `deleted:${open.id}`, reporterWorkspaceId: `deleted:${open.id}`, details: null });
    await expect(prisma.marketplaceReport.count({ where: { listingId: listingIds.decided } })).resolves.toBe(0);
    await expect(prisma.marketplaceListing.count({ where: { id: { in: Object.values(listingIds) } } })).resolves.toBe(2);
  });

  it("keeps the leaver's staff replies on other people's tickets while removing their own ticket", async () => {
    await expect(prisma.supportTicket.count({ where: { id: ticketIds.own } })).resolves.toBe(0);
    const messages = await prisma.supportTicketMessage.findMany({ where: { ticketId: ticketIds.neighbour }, select: { authorUserId: true, authorType: true } });
    expect(messages.map(message => `${message.authorType}:${message.authorUserId}`).sort()).toEqual([`ADMIN:${leaver.userId}`, `USER:${neighbour.userId}`]);
  });
});
