import bcrypt from "bcryptjs";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import type { PrismaClient } from "../src/generated/prisma/client";

const SAFE_DATABASE_MESSAGE = "Browser-test seeding requires DATABASE_URL naming a loopback jitm_design_* or e2e database (only the schema query option is allowed).";

/** Check before importing Prisma: its development fallback is the host's real local database. */
export function assertSeedDatabase(value = process.env.DATABASE_URL): void {
  let url: URL;
  try { url = new URL(value ?? ""); } catch { throw new Error(SAFE_DATABASE_MESSAGE); }
  if (!["postgres:", "postgresql:"].includes(url.protocol)
    || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    || !/^\/(?:jitm_design_[a-z0-9_]+|(?:jitm_)?e2e(?:_[a-z0-9_]+)?)$/i.test(url.pathname)
    || [...url.searchParams.keys()].some(key => key !== "schema")) {
    throw new Error(SAFE_DATABASE_MESSAGE);
  }
}

// Shared with the populated-list spec. Reserved domains and deterministic IDs keep
// these fictional records recognizable and repeatable without clearing other data.
export const STAFF_LIST_FIXTURES = ["spaced", "unbroken"].map(kind => ({
  id: `e2e_staff_lists_${kind}`,
  email: `fictional.${kind}.staff.list.recipient.with.a.long.name@long-fictional-business-name.example.test`,
  title: kind === "spaced"
    ? "Fictional staff list example with a long description of a follow-up question for an owner with several appointments across the coming week"
    : `Fictional${"LongValue".repeat(16)}`,
  details: "Fictional test record only. Review the prepared follow-up wording with the owner before they choose what to send. Nothing was sent by this fixture."
}));

async function seedStaffLists(prisma: PrismaClient, requesterUserId: string) {
  await prisma.$transaction(async tx => {
    for (const row of STAFF_LIST_FIXTURES) {
      const ticket = { workspaceId, requesterUserId, reference: row.id, title: row.title, category: "GENERAL" as const, status: "OPEN" as const };
      await tx.supportTicket.upsert({ where: { id: row.id }, create: { id: row.id, ...ticket }, update: ticket });
      await tx.supportTicketMessage.upsert({ where: { id: row.id }, create: { id: row.id, ticketId: row.id, authorUserId: requesterUserId, authorType: "USER", body: row.details }, update: { body: row.details } });
      await tx.waitlistEntry.upsert({ where: { email: row.email }, create: { id: row.id, email: row.email }, update: {} });

      // No usable invitation token or sendable outbox item is created. The review
      // row is deliberately inert; no delivery/action service is called here.
      const invite = { workspaceId, recipientEmail: row.email, source: "WAITLIST_MANUAL" as const, tokenHash: createHash("sha256").update(row.id).digest("hex"), tokenCiphertext: "", tokenPurgedAt: new Date(), revokedAt: new Date() };
      await tx.referralAccessInvite.upsert({ where: { id: row.id }, create: { id: row.id, ...invite }, update: invite });
      const delivery = { inviteId: row.id, status: "REVIEW" as const, messageCiphertext: "", lastError: row.details };
      await tx.waitlistDelivery.upsert({ where: { id: row.id }, create: { id: row.id, ...delivery }, update: delivery });
      await tx.emailSuppression.upsert({ where: { email_reason: { email: row.email, reason: "HARD_BOUNCE" } }, create: { id: row.id, email: row.email, reason: "HARD_BOUNCE" }, update: {} });
      const invitation = { email: row.email, role: "SUPPORT" as const, issuerUserId: requesterUserId, issuerRevision: 1, tokenHash: createHash("sha256").update(`staff:${row.id}`).digest("hex"), expiresAt: new Date(0) };
      await tx.staffInvitation.upsert({ where: { id: row.id }, create: { id: row.id, ...invitation }, update: invitation });
      await tx.platformAuditEvent.upsert({ where: { id: row.id }, create: { id: row.id, actorUserId: requesterUserId, action: "synthetic.staff_list.review", entityType: "SyntheticFixture", entityId: row.id, reason: row.title }, update: { reason: row.title } });
      const listing = { workspaceId, authorUserId: requesterUserId, kind: "MIX" as const, status: "UNSHARED" as const, title: row.title, channels: [], fingerprint: row.id };
      await tx.marketplaceListing.upsert({ where: { id: row.id }, create: { id: row.id, ...listing }, update: listing });
      const report = { listingId: row.id, reporterUserId: requesterUserId, reporterWorkspaceId: workspaceId, reason: "OTHER" as const, details: row.details, status: "OPEN" as const };
      await tx.marketplaceReport.upsert({ where: { id: row.id }, create: { id: row.id, ...report }, update: report });
    }
  });
  console.log("Seeded fictional staff lists (no messages queued for sending).");
}

const email = (process.env.E2E_ADMIN_EMAIL ?? "admin-e2e@jumpinthemix.local").trim().toLowerCase();
const password = process.env.E2E_ADMIN_PASSWORD ?? "AdminJumpInTheMix123!";
const workspaceId = process.env.E2E_WORKSPACE_ID ?? "demo_workspace";

async function main() {
  assertSeedDatabase();
  const { prisma } = await import("../src/lib/prisma");
  try {
    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { id: true } });
    if (!workspace) throw new Error("Run the demo seed before seeding the browser-test administrator.");

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.upsert({
      where: { email },
      create: {
        id: "e2e_admin_user",
        email,
        name: "E2E Platform Admin",
        passwordHash,
        emailVerifiedAt: new Date(),
        isPlatformAdmin: true
      },
      update: {
        name: "E2E Platform Admin",
        passwordHash,
        emailVerifiedAt: new Date(),
        isPlatformAdmin: true
      }
    });

    await prisma.staffMembership.upsert({ where: { userId: user.id }, create: { userId: user.id, role: "OWNER", grants: ["support.view_customer"] }, update: { role: "OWNER", status: "ACTIVE", grants: ["support.view_customer"], denies: [] } });

    await prisma.workspaceMember.upsert({
      where: { workspaceId_userId: { workspaceId, userId: user.id } },
      create: { id: "e2e_admin_membership", workspaceId, userId: user.id, role: "OWNER" },
      update: { role: "OWNER" }
    });
    await prisma.adminMfaSession.deleteMany({ where: { userId: user.id } });
    await prisma.adminMfaCredential.deleteMany({ where: { userId: user.id } });
    if (process.argv.includes("--staff-lists")) await seedStaffLists(prisma, user.id);
    console.log(`Seeded browser-test administrator ${email}.`);
  } finally { await prisma.$disconnect(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
