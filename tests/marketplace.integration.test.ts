import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { installMegaMix } from "@/lib/mega-mix-service";
import { createMegaMixPipeline, deleteMegaMixPipeline, megaMixShareState, updateMegaMixPipeline } from "@/lib/mega-mix-pipeline-service";
import { addFromMarketplace, marketplaceUpdates, readMarketplace, readMarketplaceItem, reportListing, reviewListing, setListingFavorite, shareOnMarketplace, unseenReports, unshareFromMarketplace, type MarketplaceFilters } from "@/lib/marketplace-service";

const local = /^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? "");
const community: MarketplaceFilters = { section: "community", kind: "", q: "", industry: "", channel: "", size: "", sort: "popular", favorites: false };

describe.skipIf(!local)("community Marketplace", () => {
  type Person = { userId: string; workspaceId: string };
  const people: Person[] = [];
  const person = async (label: string, verified = false): Promise<Person> => {
    const userId = (await prisma.user.create({ data: { name: label, email: `${label}-${randomUUID()}@example.invalid`, emailVerifiedAt: verified ? new Date() : null } })).id;
    const workspaceId = (await prisma.workspace.create({ data: { ownerId: userId, name: `${label} business`, slug: randomUUID() } })).id;
    people.push({ userId, workspaceId });
    return { userId, workspaceId };
  };
  let author: Person, reader: Person, pipelineId: string;
  const share = (extra: Partial<Parameters<typeof shareOnMarketplace>[0]> = {}) => shareOnMarketplace({ workspaceId: author.workspaceId, actorUserId: author.userId, kind: "MEGA_MIX", targetId: pipelineId, publicName: "Rivera Renovations", summary: "Our remodel pipeline", industry: "Home services", confirmed: true, ...extra });
  const report = (listingId: string, by: Person, reason: string, details = "") => reportListing({ listingId, reporterUserId: by.userId, reporterWorkspaceId: by.workspaceId, reason, details });
  const decide = (listingId: string, staff: Person, decision: "RESTORE" | "HIDE", note: string) => reviewListing({ listingId, staffUserId: staff.userId, decision, note });
  const seen = async (listingId: string, by: Person) => (await readMarketplace(community, by)).rows.some(row => row.id === listingId);
  const ownItem = async (listingId: string) => {
    const item = await readMarketplaceItem(`listing:${listingId}`, author);
    if (item?.type !== "listing") throw new Error("Expected the author's own listing.");
    return item;
  };
  const status = async (listingId: string) => (await prisma.marketplaceListing.findUniqueOrThrow({ where: { id: listingId } })).status;
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
    if (before?.type !== "listing") throw new Error("Expected a listing.");
    const added = await addFromMarketplace({ listingId: listing.id, workspaceId: reader.workspaceId, actorUserId: reader.userId, name: "From Rivera", expectedFingerprint: before.listing.fingerprint });
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
    await expect(addFromMarketplace({ listingId: listing.id, workspaceId: reader.workspaceId, actorUserId: reader.userId, name: "Again", expectedFingerprint: before.listing.fingerprint })).rejects.toThrow(/just updated/);
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

  it("hides a share at once for a verified private-information report, tells the author the reason only, and staff can restore it", async () => {
    const listing = await share();
    const verified = await person("verified", true);
    await expect(report(listing.id, author, "SPAM")).rejects.toThrow(/your own share/);
    const result = await report(listing.id, verified, "PRIVATE_INFO", "A real phone number in Beat 2");
    expect(result.hidden).toBe(true);
    expect(await seen(listing.id, reader)).toBe(false);
    expect(await readMarketplaceItem(`listing:${listing.id}`, reader)).toBeNull();
    expect(await unseenReports(author.workspaceId)).toEqual([expect.objectContaining({ reason: "PRIVATE_INFO", autoHidden: true })]);
    // The author sees the reason; the reporter's words wait for staff.
    expect((await ownItem(listing.id)).reports).toEqual([expect.objectContaining({ reason: "PRIVATE_INFO", status: "OPEN", details: null })]);
    // Staff can see how new the reporting account is.
    expect(await prisma.platformAuditEvent.findFirst({ where: { entityId: listing.id, action: "marketplace.report.hidden" } })).toMatchObject({
      actorUserId: verified.userId, reason: "PRIVATE_INFO", afterData: { reason: "PRIVATE_INFO", autoHidden: true, reporterAccountAgeDays: 0, reporterEmailVerified: true, recentAutoHides: 0 }
    });
    await expect(share()).rejects.toThrow(/hidden while our team reviews/);
    await expect(report(listing.id, reader, "SPAM")).rejects.toThrow(/no longer available/);
    const staff = await person("staff");
    expect(await decide(listing.id, staff, "RESTORE", "Number was a sample business line.")).toEqual({ status: "LIVE" });
    expect(await seen(listing.id, reader)).toBe(true);
    expect(await prisma.marketplaceReport.findFirstOrThrow({ where: { listingId: listing.id } })).toMatchObject({ status: "DISMISSED", reviewNote: "Number was a sample business line." });
    // Once staff have read them, the author sees the details too.
    expect((await ownItem(listing.id)).reports).toEqual([expect.objectContaining({ status: "DISMISSED", details: "A real phone number in Beat 2" })]);
    expect(await prisma.platformAuditEvent.findFirst({ where: { entityId: listing.id, action: "marketplace.restore" } })).toMatchObject({ actorUserId: staff.userId, beforeData: { status: "HIDDEN" }, afterData: { status: "LIVE" } });
  });

  it("keeps a share live for every other reason: hidden from the reporter only, queued for staff, author told the reason", async () => {
    const listing = await share();
    const fresh = await person("fresh", true);
    expect((await report(listing.id, fresh, "SPAM", "Links to a coupon site")).hidden).toBe(false);
    expect(await prisma.marketplaceListing.findUniqueOrThrow({ where: { id: listing.id } })).toMatchObject({ status: "LIVE", hiddenReason: null, hiddenAt: null });
    // Gone from the reporter's Community view, still there for everyone else, and in the staff queue.
    expect(await seen(listing.id, fresh)).toBe(false);
    expect(await seen(listing.id, reader)).toBe(true);
    expect(await readMarketplaceItem(`listing:${listing.id}`, fresh)).toMatchObject({ type: "listing", reported: true });
    expect(await prisma.marketplaceListing.count({ where: { id: listing.id, reports: { some: { status: "OPEN" } } } })).toBe(1);
    expect(await prisma.platformAuditEvent.findFirst({ where: { entityId: listing.id, action: "marketplace.report" } })).toMatchObject({ afterData: expect.objectContaining({ autoHidden: false, reporterAccountAgeDays: 0 }) });
    // The author is told the reason, not the words, until staff decide.
    expect(await unseenReports(author.workspaceId)).toEqual([expect.objectContaining({ reason: "SPAM", autoHidden: false })]);
    expect((await ownItem(listing.id)).reports).toEqual([expect.objectContaining({ reason: "SPAM", details: null })]);
    // Dismissing closes the report and leaves the share exactly as it was.
    const staff = await person("staff");
    expect(await decide(listing.id, staff, "RESTORE", "The link is the author's own booking page.")).toEqual({ status: "LIVE" });
    expect(await prisma.marketplaceReport.findFirstOrThrow({ where: { listingId: listing.id } })).toMatchObject({ status: "DISMISSED" });
    expect(await status(listing.id)).toBe("LIVE");
    expect(await prisma.platformAuditEvent.count({ where: { entityId: listing.id, action: "marketplace.dismiss" } })).toBe(1);
  });

  it("lets a verified account trigger at most two automatic hides a day, and never an unverified one", async () => {
    const listings = [await share()];
    for (const blueprintId of ["consultant", "photographer"]) listings.push(await share({ targetId: (await installMegaMix({ workspaceId: author.workspaceId, actorUserId: author.userId, blueprintId, expectedVersion: 1 })).id }));
    const unverified = await person("unverified");
    expect((await report(listings[0].id, unverified, "PRIVATE_INFO")).hidden).toBe(false);
    expect(await status(listings[0].id)).toBe("LIVE");
    const verified = await person("verified", true);
    const outcomes: boolean[] = [];
    for (const listing of listings) outcomes.push((await report(listing.id, verified, "PRIVATE_INFO")).hidden);
    expect(outcomes).toEqual([true, true, false]);
    expect(await Promise.all(listings.map(listing => status(listing.id)))).toEqual(["HIDDEN", "HIDDEN", "LIVE"]);
    // The third report is still recorded and queued, and the reporter still stops seeing the share.
    expect(await prisma.marketplaceReport.count({ where: { listingId: listings[2].id, status: "OPEN", autoHidden: false } })).toBe(1);
    expect(await seen(listings[2].id, verified)).toBe(false);
    expect(await prisma.platformAuditEvent.findFirst({ where: { entityId: listings[2].id, action: "marketplace.report" } })).toMatchObject({ afterData: expect.objectContaining({ recentAutoHides: 2, reporterEmailVerified: true }) });
  });

  it("keeps a share visible for a report that needs review and allows one report per person", async () => {
    const listing = await share();
    expect((await report(listing.id, reader, "MISLEADING")).hidden).toBe(false);
    await expect(report(listing.id, reader, "SPAM")).rejects.toThrow(/already reported/);
    await expect(report(listing.id, await person("x"), "OTHER", " ")).rejects.toThrow(/Tell us what is wrong/);
    expect(await seen(listing.id, reader)).toBe(false);
    expect(await seen(listing.id, await person("bystander"))).toBe(true);
  });

  it("closes reports on a withdrawn share without re-sharing it, and hides a live share only on a hide decision", async () => {
    const listing = await share();
    await report(listing.id, reader, "MISLEADING");
    await unshareFromMarketplace({ workspaceId: author.workspaceId, actorUserId: author.userId, listingId: listing.id });
    const staff = await person("staff");
    expect(await decide(listing.id, staff, "RESTORE", "Works as described.")).toEqual({ status: "UNSHARED" });
    expect(await prisma.marketplaceListing.findUniqueOrThrow({ where: { id: listing.id } })).toMatchObject({ status: "UNSHARED", hiddenReason: null });
    expect(await prisma.marketplaceReport.findFirstOrThrow({ where: { listingId: listing.id } })).toMatchObject({ status: "DISMISSED" });
    expect(await seen(listing.id, await person("bystander"))).toBe(false);
    // Upholding a report on a withdrawn share closes it without locking the author out.
    expect((await share()).status).toBe("LIVE");
    await report(listing.id, await person("third"), "COPYRIGHT");
    await unshareFromMarketplace({ workspaceId: author.workspaceId, actorUserId: author.userId, listingId: listing.id });
    expect(await decide(listing.id, staff, "HIDE", "Copied wording.")).toEqual({ status: "UNSHARED" });
    expect(await prisma.marketplaceReport.count({ where: { listingId: listing.id, status: "UPHELD" } })).toBe(1);
    expect(await prisma.platformAuditEvent.count({ where: { entityId: listing.id, action: "marketplace.uphold" } })).toBe(1);
    expect((await share()).status).toBe("LIVE");
    // A hide decision on a live share takes it down with the newest open report's reason.
    await report(listing.id, await person("fourth"), "OFFENSIVE");
    expect(await decide(listing.id, staff, "HIDE", "Agreed.")).toEqual({ status: "HIDDEN" });
    expect(await prisma.marketplaceListing.findUniqueOrThrow({ where: { id: listing.id } })).toMatchObject({ status: "HIDDEN", hiddenReason: "OFFENSIVE" });
    await expect(share()).rejects.toThrow(/hidden while our team reviews/);
    // Keeping it hidden changes nothing; restoring brings it back.
    expect(await decide(listing.id, staff, "HIDE", "Still hidden.")).toEqual({ status: "HIDDEN" });
    expect(await decide(listing.id, staff, "RESTORE", "Fixed.")).toEqual({ status: "LIVE" });
    expect(await prisma.marketplaceListing.findUniqueOrThrow({ where: { id: listing.id } })).toMatchObject({ status: "LIVE", hiddenReason: null, hiddenAt: null });
  });

  it("keeps a Mega-Mix while its share is hidden or reported, and removes the share with it afterwards", async () => {
    const listing = await share();
    const remove = () => deleteMegaMixPipeline({ workspaceId: author.workspaceId, actorUserId: author.userId, pipelineId });
    await report(listing.id, await person("verified", true), "PRIVATE_INFO");
    expect(await megaMixShareState(prisma, pipelineId)).toEqual({ id: listing.id, status: "HIDDEN", underReview: true });
    await expect(remove()).rejects.toThrow(/under review; it can be removed once the review is done/);
    const staff = await person("staff");
    await decide(listing.id, staff, "RESTORE", "Fine.");
    // A live share with an open report is under review too.
    await report(listing.id, reader, "SPAM");
    expect(await megaMixShareState(prisma, pipelineId)).toEqual({ id: listing.id, status: "LIVE", underReview: true });
    await expect(remove()).rejects.toThrow(/under review/);
    expect(await prisma.megaMixPipeline.count({ where: { id: pipelineId } })).toBe(1);
    await decide(listing.id, staff, "RESTORE", "Fine.");
    expect(await megaMixShareState(prisma, pipelineId)).toEqual({ id: listing.id, status: "LIVE", underReview: false });
    await remove();
    expect(await prisma.megaMixPipeline.findUnique({ where: { id: pipelineId } })).toBeNull();
    expect(await prisma.marketplaceListing.findUnique({ where: { id: listing.id } })).toBeNull();
    expect(await prisma.auditLog.findFirst({ where: { workspaceId: author.workspaceId, action: "mega-mix.delete" } })).toMatchObject({ metadata: { keptMixes: true, removedShare: true } });
  });

  it("stopping sharing removes the listing but not copies people already added", async () => {
    const listing = await share();
    const item = await readMarketplaceItem(`listing:${listing.id}`, reader);
    if (item?.type !== "listing") throw new Error("Expected a listing.");
    await addFromMarketplace({ listingId: listing.id, workspaceId: reader.workspaceId, actorUserId: reader.userId, name: "Kept copy", expectedFingerprint: item.listing.fingerprint });
    await unshareFromMarketplace({ workspaceId: author.workspaceId, actorUserId: author.userId, listingId: listing.id });
    expect(await seen(listing.id, reader)).toBe(false);
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

  /** A Mix with one text Beat, as a person would share it. */
  const simpleMix = (workspaceId: string, name: string, body = "Hi {{First Name}}, just checking in. {{SMS Signature}}", channel: "SMS" | "EMAIL" = "SMS") => prisma.mix.create({ data: { workspaceId, name, triggerMode: "MANUAL_START", status: "ACTIVE",
    steps: { create: { dayOffset: 0, sortOrder: 1, stepVersion: { create: { version: 1, subject: channel === "EMAIL" ? "A quick note" : null, body, stepTemplate: { create: { workspaceId, name: `${name} beat`, channel, isActive: false } } } } } } } });
  const shareMix = (mixId: string) => shareOnMarketplace({ workspaceId: author.workspaceId, actorUserId: author.userId, kind: "MIX", targetId: mixId, publicName: "Rivera Renovations", summary: "", industry: "", confirmed: true });

  it("never lets an author favorite or add their own share, and marks their own Community rows", async () => {
    const listing = await share();
    const item = await ownItem(listing.id);
    await expect(setListingFavorite({ listingId: listing.id, userId: author.userId, workspaceId: author.workspaceId, favorite: true })).rejects.toThrow("This is your own share, so it can’t be one of your favorites.");
    // A heart the author gave before this rule can still be taken back.
    await prisma.marketplaceFavorite.create({ data: { listingId: listing.id, userId: author.userId, workspaceId: author.workspaceId } });
    expect(await setListingFavorite({ listingId: listing.id, userId: author.userId, workspaceId: author.workspaceId, favorite: false })).toEqual({ favorite: false, count: 0 });
    await expect(addFromMarketplace({ listingId: listing.id, workspaceId: author.workspaceId, actorUserId: author.userId, name: "Mine again", expectedFingerprint: item.listing.fingerprint }))
      .rejects.toThrow("This is your own share. It’s already in your account, so it can’t be added again.");
    expect(await prisma.marketplaceFavorite.count({ where: { listingId: listing.id } })).toBe(0);
    expect(await prisma.marketplaceImport.count({ where: { listingId: listing.id } })).toBe(0);
    expect(await prisma.megaMixPipeline.count({ where: { workspaceId: author.workspaceId } })).toBe(1);
    // The author's own row says so, so the page offers no heart on it; everyone else can favorite and add it.
    expect((await readMarketplace(community, author)).rows.find(row => row.id === listing.id)).toMatchObject({ own: true });
    expect((await readMarketplace(community, reader)).rows.find(row => row.id === listing.id)).toMatchObject({ own: false });
    await setListingFavorite({ listingId: listing.id, userId: reader.userId, workspaceId: reader.workspaceId, favorite: true });
    await addFromMarketplace({ listingId: listing.id, workspaceId: reader.workspaceId, actorUserId: reader.userId, name: "Reader copy", expectedFingerprint: item.listing.fingerprint });
    expect(await ownItem(listing.id)).toMatchObject({ favorites: 1, added: 1 });
  });

  it("counts only shares with something to show, in step with the rows, and keeps the others manageable in My shares", async () => {
    const make = async (name: string) => { const mix = await simpleMix(author.workspaceId, name); return { mix, listing: await shareMix(mix.id) }; };
    const live = await make("Still live"), draft = await make("Now a draft"), archived = await make("Archived since"), emptied = await make("Beat removed"), planned = await make("Only planned"), fixed = await make("Fixed date now");
    const megaMember = await simpleMix(author.workspaceId, "Mega member"), otherMember = await simpleMix(author.workspaceId, "Other member");
    const mega = await createMegaMixPipeline({ workspaceId: author.workspaceId, actorUserId: author.userId, name: "Two Mixes", mixIds: [megaMember.id, otherMember.id] });
    const megaListing = await share({ targetId: mega.id }), emptyMega = await share({ targetId: pipelineId });
    await report(archived.listing.id, reader, "MISLEADING");
    await prisma.mix.update({ where: { id: draft.mix.id }, data: { status: "DRAFT" } });
    await prisma.mix.update({ where: { id: archived.mix.id }, data: { status: "ARCHIVED" } });
    await prisma.mixStep.updateMany({ where: { mixId: emptied.mix.id }, data: { isActive: false } });
    await prisma.mixStep.updateMany({ where: { mixId: planned.mix.id }, data: { plannedAt: new Date("2026-12-01T10:00:00Z") } });
    await prisma.mix.update({ where: { id: fixed.mix.id }, data: { triggerMode: "BROADCAST" } });
    await prisma.mix.update({ where: { id: megaMember.id }, data: { status: "ARCHIVED" } });
    await updateMegaMixPipeline({ workspaceId: author.workspaceId, actorUserId: author.userId, pipelineId, name: "Contractor", mixIds: [] });

    const showable = [live.listing.id, draft.listing.id, megaListing.id];
    const hidden = [archived.listing.id, emptied.listing.id, planned.listing.id, fixed.listing.id, emptyMega.id];
    const bystander = await person("bystander");
    const everything = await readMarketplace(community, bystander, 1, 500);
    expect(everything.total).toBe(everything.rows.length);
    expect(everything.rows.map(row => row.id)).toEqual(expect.arrayContaining(showable));
    expect(everything.rows.map(row => row.id).filter(id => hidden.includes(id))).toEqual([]);
    // What the count promises is what a page of rows shows, and each counted share opens with its content.
    for (const id of [...showable, ...hidden]) expect(Boolean((await readMarketplaceItem(`listing:${id}`, bystander))?.value), id).toBe(showable.includes(id));
    // Nor can it be favorited by its link while there is nothing to show.
    await expect(setListingFavorite({ listingId: archived.listing.id, userId: bystander.userId, workspaceId: bystander.workspaceId, favorite: true })).rejects.toThrow("This share is no longer available.");
    await setListingFavorite({ listingId: live.listing.id, userId: bystander.userId, workspaceId: bystander.workspaceId, favorite: true });
    const mine = await readMarketplace({ ...community, section: "mine" }, author, 1, 500);
    expect(mine.total).toBe(mine.rows.length);
    expect(mine.rows.filter(row => hidden.includes(row.id)).map(row => [row.id, row.available, row.status])).toEqual(expect.arrayContaining(hidden.map(id => [id, false, "LIVE"])));
    expect(mine.rows.find(row => row.id === archived.listing.id)).toMatchObject({ openReports: 1 });
    // The author's pane still has the status, the report and a way to manage it; an archived Mix is said to be archived.
    expect(await ownItem(archived.listing.id)).toMatchObject({ value: null, own: true, archived: true, listing: { status: "LIVE", mixId: archived.mix.id }, reports: [expect.objectContaining({ reason: "MISLEADING", status: "OPEN" })] });
    expect(await ownItem(emptied.listing.id)).toMatchObject({ value: null, archived: false });
    expect(await ownItem(emptyMega.id)).toMatchObject({ value: null, archived: false, listing: { kind: "MEGA_MIX", pipelineId } });
    await unshareFromMarketplace({ workspaceId: author.workspaceId, actorUserId: author.userId, listingId: archived.listing.id });
    expect(await status(archived.listing.id)).toBe("UNSHARED");
  });

  it("refuses to add a share whose wording the editor would refuse, and adds nothing", async () => {
    const leaky = await simpleMix(author.workspaceId, "Leaky notes", "Hi {{First Name}}, as noted: {{Private Notes}}", "EMAIL");
    const listing = await shareMix(leaky.id);
    const item = await readMarketplaceItem(`listing:${listing.id}`, reader);
    if (item?.type !== "listing") throw new Error("Expected a listing.");
    await expect(addFromMarketplace({ listingId: listing.id, workspaceId: reader.workspaceId, actorUserId: reader.userId, name: "Leaky copy", expectedFingerprint: item.listing.fingerprint }))
      .rejects.toThrow("This Mix cannot be added: Beat 1 of Leaky notes uses private notes, which only a phone-call Beat or a call version may show.");
    expect(await prisma.mix.count({ where: { workspaceId: reader.workspaceId } })).toBe(0);
    expect(await prisma.marketplaceImport.count({ where: { listingId: listing.id } })).toBe(0);
  });

  it("lists official Mega-Mixes and ready-made Mixes in the Jump in the Mix section", async () => {
    const { rows } = await readMarketplace({ ...community, section: "official", kind: "MEGA_MIX" }, reader);
    expect(rows.map(row => row.title)).toEqual(expect.arrayContaining(["Contractor mega-mix", "Recruiter mega-mix"]));
    const item = await readMarketplaceItem("mega:contractor", reader);
    expect(item).toMatchObject({ type: "official-mega", setupHref: "/templates/journeys?journey=contractor" });
  });
});
