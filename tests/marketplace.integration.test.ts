import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { installMegaMix } from "@/lib/mega-mix-service";
import { addFromMarketplace, marketplaceUpdates, readMarketplace, readMarketplaceItem, reportListing, reviewListing, setListingFavorite, shareOnMarketplace, unseenReports, unshareFromMarketplace, type MarketplaceFilters } from "@/lib/marketplace-service";

const local = /^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? "");
const community: MarketplaceFilters = { section: "community", kind: "", q: "", industry: "", channel: "", size: "", sort: "popular", favorites: false };

describe.skipIf(!local)("community Marketplace", () => {
  const people: Array<{ userId: string; workspaceId: string }> = [];
  const person = async (label: string) => {
    const userId = (await prisma.user.create({ data: { name: label, email: `${label}-${randomUUID()}@example.invalid` } })).id;
    const workspaceId = (await prisma.workspace.create({ data: { ownerId: userId, name: `${label} business`, slug: randomUUID() } })).id;
    people.push({ userId, workspaceId });
    return { userId, workspaceId };
  };
  let author: { userId: string; workspaceId: string }, reader: { userId: string; workspaceId: string }, pipelineId: string;
  const share = (extra: Partial<Parameters<typeof shareOnMarketplace>[0]> = {}) => shareOnMarketplace({ workspaceId: author.workspaceId, actorUserId: author.userId, kind: "MEGA_MIX", targetId: pipelineId, publicName: "Rivera Renovations", summary: "Our remodel pipeline", industry: "Home services", confirmed: true, ...extra });
  beforeEach(async () => {
    author = await person("author"); reader = await person("reader");
    pipelineId = (await installMegaMix({ workspaceId: author.workspaceId, actorUserId: author.userId, blueprintId: "contractor", expectedVersion: 1 })).id;
  });
  afterEach(async () => {
    await prisma.workspace.deleteMany({ where: { id: { in: people.map(item => item.workspaceId) } } });
    await prisma.user.deleteMany({ where: { id: { in: people.map(item => item.userId) } } });
    people.length = 0;
  });
  afterAll(async () => { await prisma.$disconnect(); });

  it("shares live: the listing follows the author's edits while copies stay put and offer the update", async () => {
    const listing = await share();
    const before = await readMarketplaceItem(`listing:${listing.id}`, reader);
    expect(before).toMatchObject({ type: "listing", author: "Rivera Renovations", title: "Contractor" });
    const added = await addFromMarketplace({ listingId: listing.id, workspaceId: reader.workspaceId, actorUserId: reader.userId, name: "From Rivera", expectedFingerprint: before!.listing!.fingerprint });
    expect(await prisma.megaMixPipeline.findUniqueOrThrow({ where: { id: added.pipelineId! } })).toMatchObject({ name: "From Rivera", origin: `MARKETPLACE:${listing.id}` });
    expect(await marketplaceUpdates(reader.workspaceId)).toEqual([]);

    // The author renames a Beat; the listing shows it at once.
    const step = await prisma.mixStep.findFirstOrThrow({ where: { mix: { megaMixMembership: { pipelineId } } }, include: { stepVersion: { include: { stepTemplate: true } } } });
    await prisma.stepTemplate.update({ where: { id: step.stepVersion.stepTemplateId }, data: { name: "Freshly renamed Beat" } });
    const after = await readMarketplaceItem(`listing:${listing.id}`, reader);
    expect(JSON.stringify(after!.value)).toContain("Freshly renamed Beat");
    // The reader's copy is untouched, and the update is offered.
    expect(await prisma.stepTemplate.count({ where: { workspaceId: reader.workspaceId, name: "Freshly renamed Beat" } })).toBe(0);
    expect(await marketplaceUpdates(reader.workspaceId)).toEqual([expect.objectContaining({ listingId: listing.id, pipelineId: added.pipelineId })]);
    // Adding with the version reviewed earlier is refused.
    await expect(addFromMarketplace({ listingId: listing.id, workspaceId: reader.workspaceId, actorUserId: reader.userId, name: "Again", expectedFingerprint: before!.listing!.fingerprint })).rejects.toThrow(/just updated/);
  });

  it("counts favorites per person and sorts the directory by them", async () => {
    const first = await share();
    const other = await installMegaMix({ workspaceId: author.workspaceId, actorUserId: author.userId, blueprintId: "consultant", expectedVersion: 1 });
    const second = await share({ targetId: other.id, summary: "Consulting" });
    const third = await person("third");
    await setListingFavorite({ listingId: second.id, userId: reader.userId, workspaceId: reader.workspaceId, favorite: true });
    await setListingFavorite({ listingId: second.id, userId: third.userId, workspaceId: third.workspaceId, favorite: true });
    await setListingFavorite({ listingId: second.id, userId: third.userId, workspaceId: third.workspaceId, favorite: true });
    const { rows } = await readMarketplace(community, reader);
    const mine = rows.filter(row => [first.id, second.id].includes(row.id));
    expect(mine.map(row => [row.id, row.favorites, row.favorite])).toEqual([[second.id, 2, true], [first.id, 0, false]]);
    expect((await readMarketplace({ ...community, q: "consult" }, reader)).rows.map(row => row.id)).toContain(second.id);
    expect((await readMarketplace({ ...community, favorites: true }, third)).rows.map(row => row.id)).toEqual([second.id]);
  });

  it("hides a share at once for a serious report, tells the author, and staff can restore it", async () => {
    const listing = await share();
    await expect(reportListing({ listingId: listing.id, reporterUserId: author.userId, reporterWorkspaceId: author.workspaceId, reason: "SPAM", details: "" })).rejects.toThrow(/your own share/);
    const result = await reportListing({ listingId: listing.id, reporterUserId: reader.userId, reporterWorkspaceId: reader.workspaceId, reason: "PRIVATE_INFO", details: "A real phone number in Beat 2" });
    expect(result.hidden).toBe(true);
    expect((await readMarketplace(community, reader)).rows.some(row => row.id === listing.id)).toBe(false);
    expect(await readMarketplaceItem(`listing:${listing.id}`, reader)).toBeNull();
    expect(await unseenReports(author.workspaceId)).toEqual([expect.objectContaining({ reason: "PRIVATE_INFO", autoHidden: true })]);
    await expect(share()).rejects.toThrow(/hidden while our team reviews/);
    await expect(reportListing({ listingId: listing.id, reporterUserId: reader.userId, reporterWorkspaceId: reader.workspaceId, reason: "SPAM", details: "" })).rejects.toThrow(/no longer available/);
    const staff = await person("staff");
    await reviewListing({ listingId: listing.id, staffUserId: staff.userId, decision: "RESTORE", note: "Number was a sample business line." });
    expect((await readMarketplace(community, reader)).rows.some(row => row.id === listing.id)).toBe(true);
    expect(await prisma.marketplaceReport.findFirstOrThrow({ where: { listingId: listing.id } })).toMatchObject({ status: "DISMISSED", reviewNote: "Number was a sample business line." });
  });

  it("keeps a share visible for a report that needs review and allows one report per person", async () => {
    const listing = await share();
    expect((await reportListing({ listingId: listing.id, reporterUserId: reader.userId, reporterWorkspaceId: reader.workspaceId, reason: "MISLEADING", details: "" })).hidden).toBe(false);
    await expect(reportListing({ listingId: listing.id, reporterUserId: reader.userId, reporterWorkspaceId: reader.workspaceId, reason: "SPAM", details: "" })).rejects.toThrow(/already reported/);
    await expect(reportListing({ listingId: listing.id, reporterUserId: (await person("x")).userId, reporterWorkspaceId: people.at(-1)!.workspaceId, reason: "OTHER", details: " " })).rejects.toThrow(/Tell us what is wrong/);
    expect((await readMarketplace(community, reader)).rows.some(row => row.id === listing.id)).toBe(true);
  });

  it("stopping sharing removes the listing but not copies people already added", async () => {
    const listing = await share();
    const item = await readMarketplaceItem(`listing:${listing.id}`, reader);
    await addFromMarketplace({ listingId: listing.id, workspaceId: reader.workspaceId, actorUserId: reader.userId, name: "Kept copy", expectedFingerprint: item!.listing!.fingerprint });
    await unshareFromMarketplace({ workspaceId: author.workspaceId, actorUserId: author.userId, listingId: listing.id });
    expect((await readMarketplace(community, reader)).rows.some(row => row.id === listing.id)).toBe(false);
    expect(await prisma.megaMixPipeline.count({ where: { workspaceId: reader.workspaceId, name: "Kept copy" } })).toBe(1);
    await expect(unshareFromMarketplace({ workspaceId: author.workspaceId, actorUserId: reader.userId, listingId: listing.id })).rejects.toThrow(/account owner/);
    // Sharing again restores the same listing.
    expect((await share()).id).toBe(listing.id);
  });

  it("refuses to share without confirmation or with contact details as the public name", async () => {
    await expect(share({ confirmed: false })).rejects.toThrow(/Confirm/);
    await expect(share({ publicName: "rivera@example.com" })).rejects.toThrow(/not an email/);
    await expect(shareOnMarketplace({ workspaceId: author.workspaceId, actorUserId: reader.userId, kind: "MEGA_MIX", targetId: pipelineId, publicName: "Thief", summary: "", industry: "", confirmed: true })).rejects.toThrow(/account owner/);
  });

  it("lists official Mega-Mixes and ready-made Mixes in the Jump in the Mix section", async () => {
    const { rows } = await readMarketplace({ ...community, section: "official", kind: "MEGA_MIX" }, reader);
    expect(rows.map(row => row.title)).toEqual(expect.arrayContaining(["Contractor mega-mix", "Recruiter mega-mix"]));
    const item = await readMarketplaceItem("mega:contractor", reader);
    expect(item).toMatchObject({ type: "official-mega", setupHref: "/templates/journeys?journey=contractor" });
  });
});
