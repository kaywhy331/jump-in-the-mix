import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const session = vi.hoisted(() => ({ context: {} }));
vi.mock("@/lib/auth", () => ({ requireWorkspace: async () => session.context }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));
import { prisma } from "@/lib/prisma";
import { archiveMixAction } from "@/lib/mix-lifecycle-actions";
import { createMegaMixPipeline, deleteMegaMixPipeline, megaMixShareState } from "@/lib/mega-mix-pipeline-service";
import { addFromMarketplace, archiveShareEffect, readMarketplace, readMarketplaceItem, reportListing, requestListingReview, reviewListing, setListingFavorite, shareOnMarketplace, type MarketplaceFilters } from "@/lib/marketplace-service";

const local = /^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? "");
const community: MarketplaceFilters = { section: "community", kind: "", q: "", industry: "", channel: "", size: "", sort: "popular", favorites: false };

describe.skipIf(!local)("archiving a shared Mix", () => {
  type Person = { userId: string; workspaceId: string };
  const people: Person[] = [];
  const person = async (label: string, verified = false): Promise<Person> => {
    const userId = (await prisma.user.create({ data: { name: label, email: `${label}-${randomUUID()}@example.invalid`, emailVerifiedAt: verified ? new Date() : null } })).id;
    const workspaceId = (await prisma.workspace.create({ data: { ownerId: userId, name: `${label} business`, slug: randomUUID() } })).id;
    people.push({ userId, workspaceId });
    return { userId, workspaceId };
  };
  let author: Person, staff: Person;
  /** A Mix with one text Beat, as a person would share it. */
  const simpleMix = (name: string) => prisma.mix.create({ data: { workspaceId: author.workspaceId, name, triggerMode: "MANUAL_START", status: "ACTIVE",
    steps: { create: { dayOffset: 0, sortOrder: 1, stepVersion: { create: { version: 1, body: "Hi {{First Name}}, just checking in. {{SMS Signature}}", stepTemplate: { create: { workspaceId: author.workspaceId, name: `${name} beat`, channel: "SMS", isActive: false } } } } } } } });
  const share = (kind: "MIX" | "MEGA_MIX", targetId: string) => shareOnMarketplace({ workspaceId: author.workspaceId, actorUserId: author.userId, kind, targetId, publicName: "Rivera Renovations", summary: "", industry: "", confirmed: true });
  const megaMix = (name: string, mixIds: string[]) => createMegaMixPipeline({ workspaceId: author.workspaceId, actorUserId: author.userId, name, mixIds });
  const archive = (mixId: string) => { const data = new FormData(); data.set("mixId", mixId); return archiveMixAction(data); };
  const report = async (listingId: string, reason: string, verified = false) => { const by = await person("reporter", verified); return reportListing({ listingId, reporterUserId: by.userId, reporterWorkspaceId: by.workspaceId, reason, details: "" }); };
  const status = async (listingId: string) => (await prisma.marketplaceListing.findUniqueOrThrow({ where: { id: listingId } })).status;
  const seen = async (listingId: string) => (await readMarketplace(community, await person("bystander"))).rows.some(row => row.id === listingId);

  beforeEach(async () => {
    author = await person("author", true);
    staff = await person("staff", true);
    session.context = { workspace: { id: author.workspaceId, ownerId: author.userId }, user: { id: author.userId }, impersonation: null };
  });
  afterEach(async () => {
    await prisma.workspace.deleteMany({ where: { id: { in: people.map(item => item.workspaceId) } } });
    await prisma.user.deleteMany({ where: { id: { in: people.map(item => item.userId) } } });
    people.length = 0;
  });
  afterAll(async () => { await prisma.$disconnect(); });

  it("stops sharing it, and keeps its favorites, the copies people added and its open reports", async () => {
    const mix = await simpleMix("Porch follow-up");
    const listing = await share("MIX", mix.id);
    const reader = await person("reader");
    const item = await readMarketplaceItem(`listing:${listing.id}`, reader);
    if (item?.type !== "listing") throw new Error("Expected a listing.");
    await setListingFavorite({ listingId: listing.id, userId: reader.userId, workspaceId: reader.workspaceId, favorite: true });
    await addFromMarketplace({ listingId: listing.id, workspaceId: reader.workspaceId, actorUserId: reader.userId, name: "Reader copy", expectedFingerprint: item.listing.fingerprint });
    expect((await report(listing.id, "SPAM")).hidden).toBe(false);
    // The confirmation says the share stops.
    expect(await archiveShareEffect(author.workspaceId, mix.id)).toEqual({ mix: true, megaMix: null });

    await expect(archive(mix.id)).rejects.toThrow("redirect:/mixes?archived=shared");
    expect(await prisma.mix.findUniqueOrThrow({ where: { id: mix.id } })).toMatchObject({ status: "ARCHIVED" });
    expect(await status(listing.id)).toBe("UNSHARED");
    expect(await seen(listing.id)).toBe(false);
    expect(await prisma.marketplaceFavorite.count({ where: { listingId: listing.id } })).toBe(1);
    expect(await prisma.marketplaceImport.count({ where: { listingId: listing.id } })).toBe(1);
    expect(await prisma.mix.count({ where: { workspaceId: reader.workspaceId, name: "Reader copy" } })).toBe(1);
    expect(await prisma.marketplaceReport.count({ where: { listingId: listing.id, status: "OPEN" } })).toBe(1);
    expect(await prisma.auditLog.findFirst({ where: { workspaceId: author.workspaceId, action: "marketplace.unshare", entityId: listing.id } })).toMatchObject({ actorUserId: author.userId, source: "mixes.list", metadata: { reason: "mix-archived", mixId: mix.id } });
    expect(await prisma.auditLog.findFirst({ where: { workspaceId: author.workspaceId, action: "mix.archive", entityId: mix.id } })).toMatchObject({ metadata: { unsharedMix: true, unsharedMegaMix: false } });
    // A Mix that was never shared archives as before.
    const plain = await simpleMix("Plain");
    expect(await archiveShareEffect(author.workspaceId, plain.id)).toEqual({ mix: false, megaMix: null });
    await expect(archive(plain.id)).rejects.toThrow("redirect:/mixes?archived=1");
  });

  it("leaves a hidden share hidden, refuses another review of it, and a staff restore leaves it unshared", async () => {
    const mix = await simpleMix("Hidden follow-up");
    const listing = await share("MIX", mix.id);
    expect((await report(listing.id, "PRIVATE_INFO", true)).hidden).toBe(true);
    await reviewListing({ listingId: listing.id, staffUserId: staff.userId, decision: "HIDE", note: "Beat 1 names a customer." });
    expect(await archiveShareEffect(author.workspaceId, mix.id)).toEqual({ mix: false, megaMix: null });
    await expect(archive(mix.id)).rejects.toThrow("redirect:/mixes?archived=1");
    expect(await status(listing.id)).toBe("HIDDEN");
    await expect(requestListingReview({ workspaceId: author.workspaceId, actorUserId: author.userId, listingId: listing.id, note: null }))
      .rejects.toThrow("This share has nothing to show right now, so there is nothing for our team to review.");
    // The staff page sends an empty fingerprint for a share with nothing to show.
    expect(await reviewListing({ listingId: listing.id, staffUserId: staff.userId, decision: "RESTORE", note: "Restored; the Mix is archived.", expectedFingerprint: "" })).toEqual({ status: "UNSHARED" });
    expect(await prisma.marketplaceListing.findUniqueOrThrow({ where: { id: listing.id } })).toMatchObject({ status: "UNSHARED", hiddenReason: null, hiddenAt: null, reviewResponseNote: "Restored; the Mix is archived." });
    expect(await prisma.platformAuditEvent.findFirst({ where: { entityId: listing.id, action: "marketplace.restore" } })).toMatchObject({ beforeData: { status: "HIDDEN" }, afterData: { status: "UNSHARED" } });
    expect(await seen(listing.id)).toBe(false);
  });

  it("stops a Mega-Mix share only when its last shareable Mix is archived", async () => {
    const first = await simpleMix("First"), second = await simpleMix("Second");
    const pipeline = await megaMix("Two Mixes", [first.id, second.id]);
    const megaListing = await share("MEGA_MIX", pipeline.id), firstListing = await share("MIX", first.id);
    // The other Mix can still be shared, so only the Mix's own share stops.
    expect(await archiveShareEffect(author.workspaceId, first.id)).toEqual({ mix: true, megaMix: null });
    await expect(archive(first.id)).rejects.toThrow("redirect:/mixes?archived=shared");
    expect([await status(firstListing.id), await status(megaListing.id)]).toEqual(["UNSHARED", "LIVE"]);
    expect(await seen(megaListing.id)).toBe(true);
    expect(await archiveShareEffect(author.workspaceId, second.id)).toEqual({ mix: false, megaMix: "Two Mixes" });
    await expect(archive(second.id)).rejects.toThrow("redirect:/mixes?archived=mega");
    expect(await status(megaListing.id)).toBe("UNSHARED");
    expect(await prisma.auditLog.findFirst({ where: { workspaceId: author.workspaceId, action: "marketplace.unshare", entityId: megaListing.id } })).toMatchObject({ metadata: { reason: "mix-archived", mixId: second.id } });
    // With nothing under review, the Mega-Mix can be removed as before.
    expect(await megaMixShareState(prisma, pipeline.id)).toEqual({ id: megaListing.id, status: "UNSHARED", underReview: false });

    // A Mega-Mix of one shared Mix stops with it.
    const solo = await simpleMix("Solo");
    const soloPipeline = await megaMix("Solo pipeline", [solo.id]);
    const soloMega = await share("MEGA_MIX", soloPipeline.id), soloListing = await share("MIX", solo.id);
    expect(await archiveShareEffect(author.workspaceId, solo.id)).toEqual({ mix: true, megaMix: "Solo pipeline" });
    await expect(archive(solo.id)).rejects.toThrow("redirect:/mixes?archived=both");
    expect([await status(soloListing.id), await status(soloMega.id)]).toEqual(["UNSHARED", "UNSHARED"]);
  });

  it("keeps a Mega-Mix share under review: hidden stays hidden, and open reports still keep the Mega-Mix", async () => {
    const hiddenMix = await simpleMix("Hidden member");
    const hiddenPipeline = await megaMix("Hidden pipeline", [hiddenMix.id]);
    const hidden = await share("MEGA_MIX", hiddenPipeline.id);
    expect((await report(hidden.id, "PRIVATE_INFO", true)).hidden).toBe(true);
    expect(await archiveShareEffect(author.workspaceId, hiddenMix.id)).toEqual({ mix: false, megaMix: null });
    await expect(archive(hiddenMix.id)).rejects.toThrow("redirect:/mixes?archived=1");
    expect(await status(hidden.id)).toBe("HIDDEN");
    await expect(deleteMegaMixPipeline({ workspaceId: author.workspaceId, actorUserId: author.userId, pipelineId: hiddenPipeline.id })).rejects.toThrow(/under review/);

    const reportedMix = await simpleMix("Reported member");
    const reportedPipeline = await megaMix("Reported pipeline", [reportedMix.id]);
    const reported = await share("MEGA_MIX", reportedPipeline.id);
    expect((await report(reported.id, "SPAM")).hidden).toBe(false);
    await expect(archive(reportedMix.id)).rejects.toThrow("redirect:/mixes?archived=mega");
    expect(await megaMixShareState(prisma, reportedPipeline.id)).toEqual({ id: reported.id, status: "UNSHARED", underReview: true });
    await expect(deleteMegaMixPipeline({ workspaceId: author.workspaceId, actorUserId: author.userId, pipelineId: reportedPipeline.id })).rejects.toThrow(/under review/);
    expect(await prisma.megaMixPipeline.count({ where: { id: { in: [hiddenPipeline.id, reportedPipeline.id] } } })).toBe(2);
  });
});
