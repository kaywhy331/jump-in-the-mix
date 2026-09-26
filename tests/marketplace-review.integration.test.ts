import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The re-review emails are part of the feature, so this suite records what would be sent instead of skipping it.
const mail = vi.hoisted(() => ({ sent: [] as Array<{ to: string; subject: string; text: string; html: string; idempotencyKey?: string }> }));
vi.mock("@/lib/transactional-email", async importOriginal => ({
  ...(await importOriginal<typeof import("@/lib/transactional-email")>()),
  transactionalEmailConfigured: () => true,
  sendTransactionalEmail: async (message: (typeof mail.sent)[number]) => { mail.sent.push(message); return { delivered: true, providerId: `test-${randomUUID()}` }; }
}));

import { prisma } from "@/lib/prisma";
import { markReportsSeen, readMarketplace, readMarketplaceItem, readModerationQueue, reportListing, requestListingReview, reviewListing, shareOnMarketplace, unseenReviewReplies, type MarketplaceFilters } from "@/lib/marketplace-service";

const local = /^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? "");
const community: MarketplaceFilters = { section: "community", kind: "", q: "", industry: "", channel: "", size: "", sort: "popular", favorites: false };

describe.skipIf(!local)("asking for another review of a hidden Marketplace share", () => {
  type Person = { userId: string; workspaceId: string; email: string };
  const people: Person[] = [];
  const person = async (label: string, verified = false): Promise<Person> => {
    const email = `${label}-${randomUUID()}@example.invalid`;
    const userId = (await prisma.user.create({ data: { name: label, email, emailVerifiedAt: verified ? new Date() : null } })).id;
    const workspaceId = (await prisma.workspace.create({ data: { ownerId: userId, name: `${label} business`, slug: randomUUID() } })).id;
    people.push({ userId, workspaceId, email });
    return { userId, workspaceId, email };
  };
  let author: Person, staff: Person, mixId: string, listingId: string;
  /** A Mix with one text Beat, shared and then hidden at once by a verified private-information report. */
  const hiddenShare = async () => {
    const mix = await prisma.mix.create({ data: { workspaceId: author.workspaceId, name: "Porch follow-up", triggerMode: "MANUAL_START", status: "ACTIVE",
      steps: { create: { dayOffset: 0, sortOrder: 1, stepVersion: { create: { version: 1, body: "Hi Maria, how is the new porch? {{SMS Signature}}", stepTemplate: { create: { workspaceId: author.workspaceId, name: "Porch check-in", channel: "SMS", isActive: false } } } } } } } });
    mixId = mix.id;
    listingId = (await shareOnMarketplace({ workspaceId: author.workspaceId, actorUserId: author.userId, kind: "MIX", targetId: mix.id, publicName: "Porch People", summary: "", industry: "", confirmed: true })).id;
    const reporter = await person("reporter", true);
    expect((await reportListing({ listingId, reporterUserId: reporter.userId, reporterWorkspaceId: reporter.workspaceId, reason: "PRIVATE_INFO", details: "A customer's name in Beat 1" })).hidden).toBe(true);
  };
  const rewrite = async (body: string) => {
    const step = await prisma.mixStep.findFirstOrThrow({ where: { mixId }, select: { stepVersionId: true } });
    await prisma.stepVersion.update({ where: { id: step.stepVersionId }, data: { body } });
  };
  const ask = (note: string | null = null, by: Person = author) => requestListingReview({ workspaceId: by.workspaceId, actorUserId: by.userId, listingId, note });
  const decide = (decision: "RESTORE" | "HIDE", note: string, expectedFingerprint?: string) => reviewListing({ listingId, staffUserId: staff.userId, decision, note, expectedFingerprint });
  const listing = () => prisma.marketplaceListing.findUniqueOrThrow({ where: { id: listingId } });
  const ownItem = async () => {
    const item = await readMarketplaceItem(`listing:${listingId}`, author);
    if (item?.type !== "listing") throw new Error("Expected the author's own listing.");
    return item;
  };
  // The reply templates, as opposed to the report emails the author and staff also receive.
  const replies = (to: string) => mail.sent.filter(message => message.to === to && /^Your shared Mix (stays hidden|is back on the Marketplace|is no longer hidden)$/.test(message.subject));
  const requests = (to: string) => mail.sent.filter(message => message.to === to && message.subject.startsWith("Another review requested"));

  beforeEach(async () => {
    mail.sent.length = 0;
    author = await person("author", true);
    staff = await person("staff", true);
    await prisma.staffMembership.create({ data: { userId: staff.userId, role: "OWNER" } });
    await hiddenShare();
  });
  afterEach(async () => {
    await prisma.workspace.deleteMany({ where: { id: { in: people.map(item => item.workspaceId) } } });
    await prisma.user.deleteMany({ where: { id: { in: people.map(item => item.userId) } } });
    people.length = 0;
  });
  afterAll(async () => { await prisma.$disconnect(); });

  it("waits for staff to decide the reports and for the wording to change, then queues one request with the note", async () => {
    const hidden = await listing();
    // The automatic hide recorded the wording it hid.
    expect(hidden).toMatchObject({ status: "HIDDEN", reviewedFingerprint: hidden.fingerprint, reviewRequestedAt: null });
    expect((await ownItem()).reviewBlock).toBe("open-report");
    await expect(ask()).rejects.toThrow("Our team is still reviewing a report on this share. We’ll let you know when the review is done.");
    expect(await decide("HIDE", "Beat 1 names a customer.")).toEqual({ status: "HIDDEN" });
    expect(await prisma.marketplaceReport.count({ where: { listingId, status: "UPHELD" } })).toBe(1);
    // The report carries the note, so there is no separate reply and nothing is emailed for it.
    expect(await listing()).toMatchObject({ reviewResponseNote: null, reviewRespondedAt: null });
    expect(replies(author.email)).toHaveLength(0);
    expect((await ownItem()).reviewBlock).toBe("unchanged");
    await expect(ask()).rejects.toThrow("Change the wording first. Another review looks at what you changed since our team’s decision.");

    await rewrite("Hi {{First Name}}, how is the new porch? {{SMS Signature}}");
    expect((await ownItem()).reviewBlock).toBeNull();
    await expect(ask("Reach me on 555 201 4477")).rejects.toThrow(/Leave email addresses, phone numbers and links out/);
    const { requestedAt } = await ask("  I replaced the name in Beat 1\n with {{First Name}}. ");
    expect(await listing()).toMatchObject({ status: "HIDDEN", reviewRequestedAt: requestedAt, reviewRequestNote: "I replaced the name in Beat 1 with {{First Name}}." });
    expect((await ownItem()).reviewBlock).toBe("pending");
    await expect(ask()).rejects.toThrow("You already asked for another review. We’ll let you know when our team has looked at it.");
    // Still hidden from everyone else while staff look again.
    expect((await readMarketplace(community, await person("bystander"))).rows.map(row => row.id)).not.toContain(listingId);
    expect((await readMarketplace({ ...community, section: "mine" }, author)).rows.find(row => row.id === listingId)).toMatchObject({ status: "HIDDEN", reviewRequested: true });

    // Staff are emailed the request with the author's note, and it waits in Needs review with what changed since the decision.
    expect(requests(staff.email)).toEqual([expect.objectContaining({ subject: "Another review requested: “Porch follow-up”", text: expect.stringContaining("Their note: “I replaced the name in Beat 1 with {{First Name}}.”"),
      idempotencyKey: `marketplace-review-request:${listingId}:${requestedAt!.getTime()}:${staff.userId}` })]);
    const queue = await readModerationQueue("");
    const row = queue.rows.find(item => item.id === listingId)!;
    const decidedAt = (await prisma.marketplaceReport.findFirstOrThrow({ where: { listingId } })).reviewedAt!;
    expect(row).toMatchObject({ reviewRequestNote: "I replaced the name in Beat 1 with {{First Name}}.", decidedAt });
    expect(row.contentAt.getTime()).toBeGreaterThanOrEqual(decidedAt.getTime());
    expect(JSON.stringify(row.value)).toContain("Hi {{First Name}}, how is the new porch?");
    expect(queue.counts.needsReview).toBeGreaterThanOrEqual(1);
    expect((await readModerationQueue("hidden")).rows.map(item => item.id)).toContain(listingId);
    expect((await readModerationQueue("reviewed")).rows.map(item => item.id)).not.toContain(listingId);
    // The author's words stay out of the audit trail.
    expect(await prisma.platformAuditEvent.findFirst({ where: { entityId: listingId, action: "marketplace.review-request" } })).toMatchObject({ actorUserId: author.userId, afterData: { note: true } });
    expect(JSON.stringify(await prisma.platformAuditEvent.findMany({ where: { entityId: listingId } }))).not.toContain("I replaced the name");
  });

  it("keeps it hidden with a note the author reads until they mark it read, and asks for another change before the next request", async () => {
    await decide("HIDE", "Beat 1 names a customer.");
    await rewrite("Hi there, how is the new porch? {{SMS Signature}}");
    await ask();
    expect(await decide("HIDE", "The photo link in Beat 1 is still a customer’s.")).toEqual({ status: "HIDDEN" });
    const kept = await listing();
    expect(kept).toMatchObject({ status: "HIDDEN", reviewRequestedAt: null, reviewRequestNote: null, reviewResponseNote: "The photo link in Beat 1 is still a customer’s.", reviewResponseSeenAt: null, reviewedFingerprint: kept.fingerprint });
    expect(kept.reviewRespondedAt).toBeInstanceOf(Date);
    expect(replies(author.email)).toEqual([expect.objectContaining({ subject: "Your shared Mix stays hidden",
      text: expect.stringContaining("Their note: “The photo link in Beat 1 is still a customer’s.”"), idempotencyKey: `marketplace-review-reply:${listingId}:${kept.reviewRespondedAt!.getTime()}` })]);
    const upheld = await prisma.platformAuditEvent.findMany({ where: { entityId: listingId, action: "marketplace.uphold" }, orderBy: { createdAt: "asc" } });
    expect(upheld.map(event => event.afterData)).toEqual([{ status: "HIDDEN" }, { status: "HIDDEN", answeredReviewRequest: true, repliedToAuthor: true }]);

    // The reply waits for the author until they mark it read; the reply itself stays on the share.
    expect(await unseenReviewReplies(author.workspaceId)).toEqual([expect.objectContaining({ id: listingId, status: "HIDDEN", reviewResponseNote: "The photo link in Beat 1 is still a customer’s." })]);
    expect(await unseenReviewReplies((await person("other")).workspaceId)).toEqual([]);
    await markReportsSeen(author.workspaceId, listingId);
    expect(await unseenReviewReplies(author.workspaceId)).toEqual([]);
    expect(await listing()).toMatchObject({ reviewResponseNote: "The photo link in Beat 1 is still a customer’s." });

    // Another request needs another change; asking again settles a reply the author had not read.
    await expect(ask()).rejects.toThrow(/Change the wording first/);
    await prisma.marketplaceListing.update({ where: { id: listingId }, data: { reviewResponseSeenAt: null } });
    await rewrite("Hello {{First Name}}, how is the new porch? {{SMS Signature}}");
    await ask();
    expect((await listing()).reviewResponseSeenAt).toBeInstanceOf(Date);
    expect(await unseenReviewReplies(author.workspaceId)).toEqual([]);
  });

  it("restores the share only when staff read the latest wording, and tells the author", async () => {
    await decide("HIDE", "Beat 1 names a customer.");
    await rewrite("Hi {{First Name}}, how is the new porch? {{SMS Signature}}");
    await ask("Fixed the name.");
    // The author saves again after staff opened the page: restoring the wording staff read is refused.
    const stale = (await readModerationQueue("")).rows.find(item => item.id === listingId)!.fingerprint;
    await rewrite("Hi {{First Name}}, how is your new porch? {{SMS Signature}}");
    await expect(decide("RESTORE", "Looks fine.", stale)).rejects.toThrow("The author changed this share after you opened it. Read the latest wording, then decide.");
    expect(await listing()).toMatchObject({ status: "HIDDEN", reviewRequestNote: "Fixed the name." });

    const current = (await readModerationQueue("")).rows.find(item => item.id === listingId)!.fingerprint;
    expect(await decide("RESTORE", "Thanks, the customer's name is gone.", current)).toEqual({ status: "LIVE" });
    expect(await listing()).toMatchObject({ status: "LIVE", hiddenReason: null, hiddenAt: null, reviewRequestedAt: null, reviewResponseNote: "Thanks, the customer's name is gone.", reviewedFingerprint: current });
    expect((await readMarketplace(community, await person("bystander"))).rows.map(row => row.id)).toContain(listingId);
    expect(replies(author.email).map(message => message.subject)).toEqual(["Your shared Mix is back on the Marketplace"]);
    expect((await ownItem()).reviewBlock).toBe("not-hidden");
    expect(await unseenReviewReplies(author.workspaceId)).toEqual([expect.objectContaining({ id: listingId, status: "LIVE" })]);
  });

  it("gives a share hidden before decisions recorded their wording one request, and only its owner can ask", async () => {
    await decide("HIDE", "Beat 1 names a customer.");
    await prisma.marketplaceListing.update({ where: { id: listingId }, data: { reviewedFingerprint: null } });
    const member = await person("member");
    await expect(ask(null, { ...member, workspaceId: author.workspaceId })).rejects.toThrow("Only the account owner can share or add from the Marketplace.");
    await expect(ask(null, member)).rejects.toThrow("This share is no longer available.");
    await ask();
    expect((await listing()).reviewRequestedAt).toBeInstanceOf(Date);
    // A share that is not hidden has nothing to ask about.
    await decide("RESTORE", "Fine as it is.");
    await expect(ask()).rejects.toThrow("Only a hidden share can be sent for another review.");
  });

  it("keeps a staff note for the author when no report carries it, and replies only when something happened to the share", async () => {
    await decide("RESTORE", "Sample name, not a customer.");
    expect(await listing()).toMatchObject({ status: "LIVE", reviewResponseNote: null });
    // Dismissing on a live share with no open report changes nothing, so the author is not told again.
    await decide("RESTORE", "Still fine.");
    expect(await listing()).toMatchObject({ status: "LIVE", reviewResponseNote: null });
    // Hiding it with no open report would otherwise lose the note.
    expect(await decide("HIDE", "Hidden after a second look at Beat 1.")).toEqual({ status: "HIDDEN" });
    expect(await listing()).toMatchObject({ status: "HIDDEN", hiddenReason: "OTHER", reviewResponseNote: "Hidden after a second look at Beat 1.", reviewResponseSeenAt: null });
    expect(await prisma.platformAuditEvent.findFirst({ where: { entityId: listingId, action: "marketplace.hide" } })).toMatchObject({ afterData: { status: "HIDDEN", repliedToAuthor: true } });
    // Only an answered request is emailed; this reply waits on the share.
    expect(replies(author.email)).toEqual([]);
  });
});
