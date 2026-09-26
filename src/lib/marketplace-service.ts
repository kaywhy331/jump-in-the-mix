import type { MarketplaceListing, Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { exportMegaMixPipeline, exportSingleMix, installPortable } from "@/lib/mega-mix-pipeline-service";
import { buildPortable, portableFingerprint, type PortablePackage } from "@/lib/mix-portable";
import { AUTO_HIDE_LIMIT, cleanPublicName, cleanReviewNote, isMarketplaceReason, listingFacts, MARKETPLACE_SIZES, MARKETPLACE_SUMMARY_MAX, reasonLabel, reportHidesAtOnce, REVIEW_REQUEST_REFUSALS, reviewReplyOutcome, reviewRequestBlock, type MarketplaceReason } from "@/lib/marketplace";
import { MEGA_MIXES, megaMixById, megaMixConfiguration } from "@/lib/mega-mixes";
import { normalizeSharedMixSteps } from "@/lib/shared-mix";
import { escapeHtml, sendTransactionalEmail, transactionalEmailConfigured } from "@/lib/transactional-email";
import { env } from "@/lib/env";
import { UserFacingError } from "@/lib/user-facing-error";

type DB = Prisma.TransactionClient | typeof prisma;
const visible = { status: "LIVE" as const };
// A listing can show exactly what `sourceMixes` exports. Asking the database the same question keeps
// the result count and the rows in step once a shared Mix is archived, emptied or given a fixed date.
const exportableMix: Prisma.MixWhereInput = { source: { not: "ONE_TIME" }, status: { not: "ARCHIVED" }, triggerMode: { in: ["MANUAL_START", "DATE_TRIGGERED"] }, steps: { some: { isActive: true, plannedAt: null } } };
const available: Prisma.MarketplaceListingWhereInput = { OR: [{ kind: "MIX", mix: exportableMix }, { kind: "MEGA_MIX", pipeline: { members: { some: { mix: exportableMix } } } }] };

async function assertOwner(db: DB, workspaceId: string, actorUserId: string) {
  const owner = await db.workspace.findFirst({ where: { id: workspaceId, ownerId: actorUserId }, select: { id: true, name: true } });
  if (!owner) throw new UserFacingError("Only the account owner can share or add from the Marketplace.");
  return owner;
}

/** The author's current saved content, read whenever a listing is opened, shared, added, reviewed or refreshed. */
async function livePackage(db: DB, listing: Pick<MarketplaceListing, "kind" | "workspaceId" | "mixId" | "pipelineId">): Promise<PortablePackage | null> {
  try {
    if (listing.kind === "MIX" && listing.mixId) return (await exportSingleMix(db, listing.workspaceId, listing.mixId)).package;
    if (listing.kind === "MEGA_MIX" && listing.pipelineId) return (await exportMegaMixPipeline(db, listing.workspaceId, listing.pipelineId)).package;
  } catch { /* The Mix was archived, emptied or removed: the listing is unavailable, not broken. */ }
  return null;
}

/**
 * Keep directory facts in step with the live content; returns the fresh package. The write lands only on the
 * facts this export started from (every write of them moves `contentAt`), so an export begun before an author's
 * save never overwrites the newer facts that save's refresh wrote meanwhile: it reads the row again and
 * retries, three times at most. Inside a transaction that locked the row first, the first write always lands.
 */
export async function refreshListing(db: DB, listing: MarketplaceListing): Promise<{ listing: MarketplaceListing; value: PortablePackage | null; changed: boolean }> {
  let current = listing;
  for (let attempt = 1; ; attempt += 1) {
    const value = await livePackage(db, current);
    if (!value) return { listing: current, value: null, changed: false };
    const facts = listingFacts(value), fingerprint = portableFingerprint(value);
    if (current.fingerprint === fingerprint && current.title === facts.title && current.beatCount === facts.beatCount && current.mixCount === facts.mixCount) return { listing: current, value, changed: false };
    const [updated] = await db.marketplaceListing.updateManyAndReturn({ where: { id: current.id, contentAt: current.contentAt, fingerprint: current.fingerprint }, data: { ...facts, fingerprint, contentAt: new Date() } });
    if (updated) return { listing: updated, value, changed: true };
    const latest = await db.marketplaceListing.findUnique({ where: { id: current.id } });
    if (!latest || attempt === 3) return { listing: latest ?? current, value, changed: false };
    current = latest;
  }
}

/**
 * The post-commit hook for author saves (the Mix editor; a Mega-Mix's name, description or Mixes): the shares
 * of these Mixes, of the Mega-Mixes holding them and of these Mega-Mixes show the saved content at once. Call
 * it after the save's transaction has committed, never inside it, so an export neither holds the save's locks
 * nor runs into its timeout. Every status is refreshed, so the author's own list is current too. It never
 * throws: the save is done, and a share it missed converges in the hourly pass or when it is opened.
 */
export async function refreshSharesOf(input: { workspaceId: string; mixIds?: string[]; pipelineIds?: string[] }): Promise<void> {
  const mixIds = input.mixIds ?? [], pipelineIds = input.pipelineIds ?? [];
  if (!mixIds.length && !pipelineIds.length) return;
  try {
    const listings = await prisma.marketplaceListing.findMany({ where: { workspaceId: input.workspaceId, OR: [
      ...(mixIds.length ? [{ mixId: { in: mixIds } }, { pipeline: { members: { some: { mixId: { in: mixIds } } } } }] : []),
      ...(pipelineIds.length ? [{ pipelineId: { in: pipelineIds } }] : [])
    ] } });
    for (const listing of listings) await refreshListing(prisma, listing).catch(error => console.error(`Marketplace share ${listing.id} was not refreshed after a save.`, error));
  } catch (error) {
    console.error("Marketplace shares were not refreshed after a save.", error);
  }
}

/** How often the worker runs `refreshStaleListings`. */
export const MARKETPLACE_REFRESH_INTERVAL_MS = 60 * 60_000;
/** Where the hourly pass stopped: the last share it checked, in its (contentAt, id) order. */
export type ListingRefreshCursor = { contentAt: Date; id: string };

/**
 * The hourly safety net for changes no author-save hook sees: a date type renamed, a Journey connection changed,
 * a Mega-Mix's Mix archived or restored. A worker maintenance step, not a Job task. It walks the shares the
 * Community section shows, oldest content first, at most `limit` per call, after `after`. `next` is where the
 * following call continues, or null once the walk has reached the end so the next call starts over; the worker
 * keeps it, and the hourly gate, in memory. A share that fails is logged and left for the next walk.
 */
export async function refreshStaleListings({ limit = 100, after = null }: { limit?: number; after?: ListingRefreshCursor | null } = {}) {
  const take = Math.min(Math.max(Math.floor(limit) || 1, 1), 1_000);
  const listings = await prisma.marketplaceListing.findMany({
    where: { ...visible, AND: [available, ...(after ? [{ OR: [{ contentAt: { gt: after.contentAt } }, { contentAt: after.contentAt, id: { gt: after.id } }] }] : [])] },
    orderBy: [{ contentAt: "asc" }, { id: "asc" }], take
  });
  let changed = 0;
  for (const listing of listings) {
    try { if ((await refreshListing(prisma, listing)).changed) changed += 1; }
    catch (error) { console.error(`Marketplace share ${listing.id} was not refreshed by the hourly pass.`, error); }
  }
  const last = listings.at(-1);
  return { checked: listings.length, changed, next: last && listings.length === take ? { contentAt: last.contentAt, id: last.id } : null };
}

export async function readMarketplaceAuthor(workspaceId: string) {
  return prisma.marketplaceAuthor.findUnique({ where: { workspaceId } });
}

export async function shareOnMarketplace(input: { workspaceId: string; actorUserId: string; kind: "MIX" | "MEGA_MIX"; targetId: string; publicName: string; summary: string; industry: string; confirmed: boolean }) {
  if (!input.confirmed) throw new UserFacingError("Confirm that the wording has no private details before sharing.");
  const publicName = cleanPublicName(input.publicName);
  const summary = input.summary.replace(/\s+/g, " ").trim().slice(0, MARKETPLACE_SUMMARY_MAX) || null;
  const industry = input.industry.trim().slice(0, 120) || null;
  return prisma.$transaction(async db => {
    await db.$queryRaw`SELECT id FROM "Workspace" WHERE id = ${input.workspaceId} FOR UPDATE`;
    await assertOwner(db, input.workspaceId, input.actorUserId);
    const key = input.kind === "MIX" ? { mixId: input.targetId } : { pipelineId: input.targetId };
    const value = await livePackage(db, { kind: input.kind, workspaceId: input.workspaceId, ...(input.kind === "MIX" ? { mixId: input.targetId, pipelineId: null } : { pipelineId: input.targetId, mixId: null }) });
    if (!value) throw new UserFacingError(input.kind === "MIX" ? "Only an active or draft Mix with Beats and a manual or date start can be shared." : "Add at least one Mix with Beats before sharing this Mega-Mix.");
    await db.marketplaceAuthor.upsert({ where: { workspaceId: input.workspaceId }, create: { workspaceId: input.workspaceId, publicName }, update: { publicName } });
    const existing = await db.marketplaceListing.findFirst({ where: { workspaceId: input.workspaceId, ...key } });
    if (existing?.status === "HIDDEN") throw new UserFacingError("This share is hidden while our team reviews a report. You can still edit it; we’ll let you know when the review is done.");
    const data = { ...listingFacts(value), fingerprint: portableFingerprint(value), summary, industry, status: "LIVE" as const, authorUserId: input.actorUserId, contentAt: new Date() };
    const listing = existing
      ? await db.marketplaceListing.update({ where: { id: existing.id }, data: { ...data, ...(existing.status === "UNSHARED" ? { publishedAt: new Date() } : {}) } })
      : await db.marketplaceListing.create({ data: { ...data, kind: input.kind, workspaceId: input.workspaceId, ...key } });
    await db.auditLog.create({ data: { workspaceId: input.workspaceId, actorType: "USER", actorUserId: input.actorUserId, action: "marketplace.share", entityType: "MarketplaceListing", entityId: listing.id, source: "marketplace", metadata: { kind: input.kind, beats: data.beatCount } } });
    return listing;
  });
}

/** Stop sharing. Copies other people already added stay theirs; favorites are kept for a re-share. */
export async function unshareFromMarketplace(input: { workspaceId: string; actorUserId: string; listingId: string }) {
  return prisma.$transaction(async db => {
    await assertOwner(db, input.workspaceId, input.actorUserId);
    const listing = await db.marketplaceListing.findFirst({ where: { id: input.listingId, workspaceId: input.workspaceId } });
    if (!listing) throw new UserFacingError("This share is no longer available.");
    if (listing.status === "LIVE") await db.marketplaceListing.update({ where: { id: listing.id }, data: { status: "UNSHARED" } });
    await db.auditLog.create({ data: { workspaceId: input.workspaceId, actorType: "USER", actorUserId: input.actorUserId, action: "marketplace.unshare", entityType: "MarketplaceListing", entityId: listing.id, source: "marketplace" } });
  });
}

export type MarketplaceFilters = { section: "official" | "community" | "mine"; kind: "" | "MIX" | "MEGA_MIX"; q: string; industry: string; channel: string; size: string; sort: "popular" | "newest" | "added"; favorites: boolean };
export type MarketplaceRow = { id: string; section: "official" | "community"; kind: "MIX" | "MEGA_MIX"; title: string; author: string; summary: string | null; mixCount: number; beatCount: number; channels: string[]; industry: string | null; favorites: number | null; favorite: boolean; added: number; available: boolean; own?: boolean; status?: string; openReports?: number; reviewRequested?: boolean; href: string };

const officialMegaMixPackage = (id: string) => {
  const blueprint = megaMixById(id);
  if (!blueprint) return null;
  const mixIds = Object.fromEntries(blueprint.nodes.map(node => [node.key, node.key]));
  return buildPortable({ kind: "mega-mix", name: `${blueprint.name} mega-mix`, description: blueprint.description, configuration: megaMixConfiguration(blueprint, mixIds, blueprint.id),
    mixes: blueprint.nodes.map(node => ({ id: node.key, name: node.name, description: node.purpose, category: "Customer journey", industry: blueprint.industry, framework: "Mega-mix", triggerMode: "MANUAL_START", dateType: null,
      steps: node.steps.map((step, index) => ({ id: `${node.key}:${index}`, name: step.name, channel: step.channel, dayOffset: step.dayOffset, sendTimeMinutes: step.sendTimeMinutes, anchor: "CALENDAR_DAY" as const, offsetMinutes: null,
        subject: step.subject ?? null, body: step.body ?? null, script: step.script ?? null, longSms: false, includeOptOut: false, variants: [] })) })) }).package;
};

async function officialRows(filters: MarketplaceFilters, viewer: { userId: string; workspaceId: string }): Promise<MarketplaceRow[]> {
  const rows: MarketplaceRow[] = [];
  const q = filters.q.toLowerCase(), size = MARKETPLACE_SIZES.find(item => item.value === filters.size);
  const keep = (row: MarketplaceRow) => (!q || `${row.title} ${row.summary ?? ""}`.toLowerCase().includes(q)) && (!filters.industry || row.industry === filters.industry || row.industry === "Any business")
    && (!filters.channel || row.channels.includes(filters.channel)) && (!size || row.beatCount >= size.min && row.beatCount <= size.max) && (!filters.favorites || row.favorite);
  if (filters.kind !== "MIX") for (const blueprint of MEGA_MIXES) {
    const value = officialMegaMixPackage(blueprint.id)!, facts = listingFacts(value);
    rows.push({ id: `mega:${blueprint.id}`, section: "official", kind: "MEGA_MIX", title: value.name, author: "Jump in the Mix", summary: blueprint.description, mixCount: facts.mixCount, beatCount: facts.beatCount, channels: facts.channels, industry: blueprint.industry, favorites: null, favorite: false, added: 0, available: true, href: `/marketplace?item=${encodeURIComponent(`mega:${blueprint.id}`)}` });
  }
  if (filters.kind !== "MEGA_MIX") {
    const shared = await prisma.sharedMix.findMany({ where: { status: "APPROVED" }, orderBy: [{ updatedAt: "desc" }, { id: "asc" }], take: 500,
      select: { id: true, title: true, description: true, industry: true, steps: true, importCount: true, updatedAt: true, _count: { select: { favorites: true } }, favorites: { where: { userId: viewer.userId, workspaceId: viewer.workspaceId }, select: { id: true } } } });
    for (const item of shared) {
      let steps: ReturnType<typeof normalizeSharedMixSteps>;
      try { steps = normalizeSharedMixSteps(item.steps); } catch { continue; }
      const channels = [...new Set(steps.map(step => step.channel === "EMAIL" ? "EMAIL" : step.channel === "PHONE_CALL" || step.channel === "VOICEMAIL" ? "CALL" : "TEXT"))].sort();
      rows.push({ id: `mix:${item.id}`, section: "official", kind: "MIX", title: item.title, author: "Jump in the Mix", summary: item.description, mixCount: 1, beatCount: steps.length, channels, industry: item.industry, favorites: item._count.favorites, favorite: item.favorites.length > 0, added: item.importCount, available: true, href: `/marketplace?item=${encodeURIComponent(`mix:${item.id}`)}` });
    }
  }
  const filtered = rows.filter(keep);
  return filters.sort === "popular" ? filtered.sort((a, b) => (b.favorites ?? 0) - (a.favorites ?? 0) || b.added - a.added || a.title.localeCompare(b.title)) : filters.sort === "added" ? filtered.sort((a, b) => b.added - a.added || a.title.localeCompare(b.title)) : filtered;
}

export async function readMarketplace(filters: MarketplaceFilters, viewer: { userId: string; workspaceId: string }, page = 1, pageSize = 20) {
  if (filters.section === "official") {
    const rows = await officialRows(filters, viewer);
    return { rows: rows.slice((page - 1) * pageSize, page * pageSize), total: rows.length };
  }
  const size = MARKETPLACE_SIZES.find(item => item.value === filters.size);
  const where: Prisma.MarketplaceListingWhereInput = {
    // A share you reported leaves your Community view; everyone else still sees it until staff decide.
    ...(filters.section === "mine" ? { workspaceId: viewer.workspaceId } : { ...visible, reports: { none: { reporterUserId: viewer.userId } }, AND: [available] }),
    ...(filters.kind ? { kind: filters.kind } : {}),
    ...(filters.industry ? { industry: filters.industry } : {}),
    ...(filters.channel ? { channels: { has: filters.channel } } : {}),
    ...(size ? { beatCount: { gte: size.min, lte: size.max } } : {}),
    ...(filters.favorites ? { favorites: { some: { userId: viewer.userId } } } : {}),
    ...(filters.q ? { OR: [{ title: { contains: filters.q, mode: "insensitive" } }, { summary: { contains: filters.q, mode: "insensitive" } }, { workspace: { marketplaceAuthor: { publicName: { contains: filters.q, mode: "insensitive" } } } }] } : {})
  };
  const orderBy: Prisma.MarketplaceListingOrderByWithRelationInput[] = filters.sort === "newest" ? [{ publishedAt: "desc" }, { id: "asc" }] : filters.sort === "added" ? [{ imports: { _count: "desc" } }, { publishedAt: "desc" }, { id: "asc" }] : [{ favorites: { _count: "desc" } }, { publishedAt: "desc" }, { id: "asc" }];
  const [total, listings] = await Promise.all([
    prisma.marketplaceListing.count({ where }),
    prisma.marketplaceListing.findMany({ where, orderBy, skip: (page - 1) * pageSize, take: pageSize, include: {
      workspace: { select: { marketplaceAuthor: { select: { publicName: true } } } },
      _count: { select: { favorites: true, imports: true, reports: { where: { status: "OPEN" } } } },
      favorites: { where: { userId: viewer.userId }, select: { userId: true } } } })
  ]);
  // Rows show the stored facts, so a list read exports nothing and writes nothing: an author's save refreshes
  // its shares at once (`refreshSharesOf`) and the hourly pass (`refreshStaleListings`) catches every other
  // change. Community rows were counted as available; the author's own list keeps an unavailable share so its
  // status and reports stay reachable, and one query says which of its rows have something to show.
  const availableIds = filters.section === "mine" && listings.length
    ? new Set((await prisma.marketplaceListing.findMany({ where: { id: { in: listings.map(item => item.id) }, AND: [available] }, select: { id: true } })).map(item => item.id))
    : null;
  return { total, rows: listings.map((item): MarketplaceRow => ({
    id: item.id, section: "community", kind: item.kind, title: item.title, author: item.workspace.marketplaceAuthor?.publicName ?? "Community member", summary: item.summary,
    mixCount: item.mixCount, beatCount: item.beatCount, channels: item.channels, industry: item.industry, favorites: item._count.favorites, favorite: item.favorites.length > 0, added: item._count.imports,
    available: availableIds ? availableIds.has(item.id) : true, own: item.workspaceId === viewer.workspaceId, status: item.status, openReports: item._count.reports, reviewRequested: Boolean(item.reviewRequestedAt), href: `/marketplace?${filters.section === "mine" ? "section=mine&" : "section=community&"}item=${encodeURIComponent(`listing:${item.id}`)}` })) };
}

/** One item for the detail pane, with its live content. `item` is mega:<id>, mix:<id> or listing:<id>. */
export async function readMarketplaceItem(item: string, viewer: { userId: string; workspaceId: string }) {
  const [kind, id] = [item.slice(0, item.indexOf(":")), item.slice(item.indexOf(":") + 1)];
  if (kind === "mega") {
    const value = officialMegaMixPackage(id), blueprint = megaMixById(id);
    if (!value || !blueprint) return null;
    const installed = await prisma.megaMixPipeline.findFirst({ where: { workspaceId: viewer.workspaceId, origin: `BLUEPRINT:${id}` }, select: { id: true, name: true } });
    return { type: "official-mega" as const, id, value, title: value.name, author: "Jump in the Mix", summary: blueprint.description, industry: blueprint.industry, setupHref: `/templates/journeys?journey=${encodeURIComponent(id)}`, installed };
  }
  if (kind === "mix") {
    const shared = await prisma.sharedMix.findFirst({ where: { id, status: "APPROVED" }, select: { id: true, title: true, description: true, industry: true, category: true, framework: true, steps: true, importCount: true, _count: { select: { favorites: true } }, favorites: { where: { userId: viewer.userId, workspaceId: viewer.workspaceId }, select: { id: true } } } });
    if (!shared) return null;
    let steps: ReturnType<typeof normalizeSharedMixSteps>;
    try { steps = normalizeSharedMixSteps(shared.steps); } catch { return null; }
    const value = buildPortable({ kind: "mix", name: shared.title.slice(0, 80), description: shared.description, configuration: { rules: [], gatedStepIds: [], intentionalEnds: [] },
      mixes: [{ id: shared.id, name: shared.title, description: shared.description, category: shared.category, industry: shared.industry, framework: shared.framework, triggerMode: "MANUAL_START", dateType: null,
        steps: steps.map((step, index) => ({ id: `${shared.id}:${index}`, name: step.name, channel: step.channel, dayOffset: step.dayOffset, sendTimeMinutes: step.sendTimeMinutes, anchor: "CALENDAR_DAY" as const, offsetMinutes: null, subject: step.subject, body: step.body, script: step.script, longSms: step.longSms, includeOptOut: step.includeOptOut, variants: [] })) }] }).package;
    return { type: "official-mix" as const, id: shared.id, value, title: shared.title, author: "Jump in the Mix", summary: shared.description, industry: shared.industry, favorites: shared._count.favorites, favorite: shared.favorites.length > 0, added: shared.importCount, setupHref: `/templates?mix=${encodeURIComponent(shared.id)}#selected-mix` };
  }
  if (kind !== "listing") return null;
  const found = await prisma.marketplaceListing.findFirst({ where: { id, OR: [visible, { workspaceId: viewer.workspaceId }] } });
  if (!found) return null;
  const { listing, value } = await refreshListing(prisma, found);
  const own = listing.workspaceId === viewer.workspaceId;
  const [author, favorites, favorite, added, imports, reports, reported, archived, openReports] = await Promise.all([
    prisma.marketplaceAuthor.findUnique({ where: { workspaceId: listing.workspaceId }, select: { publicName: true } }),
    prisma.marketplaceFavorite.count({ where: { listingId: listing.id } }),
    prisma.marketplaceFavorite.findUnique({ where: { listingId_userId: { listingId: listing.id, userId: viewer.userId } }, select: { userId: true } }),
    prisma.marketplaceImport.count({ where: { listingId: listing.id } }),
    prisma.marketplaceImport.findMany({ where: { listingId: listing.id, workspaceId: viewer.workspaceId }, orderBy: { createdAt: "desc" }, take: 5, select: { id: true, mixId: true, pipelineId: true, fingerprint: true, createdAt: true } }),
    // The author always sees the reason; the reporter's own words reach them only after staff have read them.
    listing.workspaceId === viewer.workspaceId ? prisma.marketplaceReport.findMany({ where: { listingId: listing.id }, orderBy: { createdAt: "desc" }, take: 20, select: { id: true, reason: true, details: true, status: true, autoHidden: true, createdAt: true, reviewNote: true } })
      .then(rows => rows.map(report => ({ ...report, details: report.status === "OPEN" ? null : report.details }))) : Promise.resolve([]),
    prisma.marketplaceReport.findUnique({ where: { listingId_reporterUserId: { listingId: listing.id, reporterUserId: viewer.userId } }, select: { id: true } }),
    // An archived Mix has no page to open, so the author manages that share from here.
    own && !value && listing.kind === "MIX" && listing.mixId ? prisma.mix.count({ where: { id: listing.mixId, workspaceId: listing.workspaceId, status: "ARCHIVED" } }).then(Boolean) : Promise.resolve(false),
    own ? prisma.marketplaceReport.count({ where: { listingId: listing.id, status: "OPEN" } }) : Promise.resolve(0)
  ]);
  // Whether the author can ask for another review now, and if not, why (see `reviewRequestBlock`).
  const reviewBlock = own ? reviewRequestBlock({ status: listing.status, requestedAt: listing.reviewRequestedAt, openReports, available: Boolean(value), fingerprint: listing.fingerprint, reviewedFingerprint: listing.reviewedFingerprint }) : null;
  return { type: "listing" as const, id: listing.id, listing, value, title: listing.title, author: author?.publicName ?? "Community member", summary: listing.summary, industry: listing.industry,
    favorites, favorite: Boolean(favorite), added, imports, own, reports, reported: Boolean(reported), archived, openReports, reviewBlock };
}

/**
 * A favorite from anyone but the author, on a share with something to show; an author's own heart would
 * only pad the popularity counts. Removing a favorite is always allowed.
 */
export async function setListingFavorite(input: { listingId: string; userId: string; workspaceId: string; favorite: boolean }) {
  const listing = await prisma.marketplaceListing.findFirst({ where: { id: input.listingId, ...visible, ...(input.favorite ? { AND: [available] } : {}) }, select: { id: true, workspaceId: true } });
  if (!listing) throw new UserFacingError("This share is no longer available.");
  if (input.favorite && listing.workspaceId === input.workspaceId) throw new UserFacingError("This is your own share, so it can’t be one of your favorites.");
  if (input.favorite) await prisma.marketplaceFavorite.upsert({ where: { listingId_userId: { listingId: listing.id, userId: input.userId } }, create: { listingId: listing.id, userId: input.userId, workspaceId: input.workspaceId }, update: {} });
  else await prisma.marketplaceFavorite.deleteMany({ where: { listingId: listing.id, userId: input.userId } });
  return { favorite: input.favorite, count: await prisma.marketplaceFavorite.count({ where: { listingId: listing.id } }) };
}

/**
 * Add a listing to this account as new Mixes. The expected fingerprint is the version the owner
 * reviewed; if the author saved a change since, nothing is added and the new version is shown.
 * The author cannot add their own share: it is already theirs, and each add would count as popularity.
 */
export async function addFromMarketplace(input: { listingId: string; workspaceId: string; actorUserId: string; name: string; expectedFingerprint: string }) {
  return prisma.$transaction(async db => {
    const listing = await db.marketplaceListing.findFirst({ where: { id: input.listingId, ...visible } });
    if (!listing) throw new UserFacingError("This share is no longer available.");
    if (listing.workspaceId === input.workspaceId) throw new UserFacingError("This is your own share. It’s already in your account, so it can’t be added again.");
    const value = await livePackage(db, listing);
    if (!value) throw new UserFacingError("This share is no longer available.");
    const fingerprint = portableFingerprint(value);
    if (fingerprint !== input.expectedFingerprint) throw new UserFacingError("The author just updated this. Review the latest version, then add it.");
    const result = await installPortable(db, { workspaceId: input.workspaceId, actorUserId: input.actorUserId, value, name: input.name || value.name, origin: `MARKETPLACE:${listing.id}`, source: "marketplace" });
    await db.marketplaceImport.create({ data: { listingId: listing.id, workspaceId: input.workspaceId, fingerprint, mixId: result.pipelineId ? null : result.mixIds[0], pipelineId: result.pipelineId } });
    return result;
  }, { timeout: 30_000 });
}

/**
 * Copies whose shared original has changed since they were added, by the original's stored fingerprint. Every
 * Mix and Mega-Mix page asks, so nothing is exported here: author saves refresh the fingerprint at once and the
 * hourly pass catches every other change, so a notice appears within the hour at the latest.
 */
export async function marketplaceUpdates(workspaceId: string, only?: { mixId?: string; pipelineId?: string }) {
  const imports = await prisma.marketplaceImport.findMany({ where: { workspaceId, listing: visible, ...(only?.mixId ? { mixId: only.mixId } : only?.pipelineId ? { pipelineId: only.pipelineId } : {}) }, orderBy: { createdAt: "desc" }, take: 50, include: { listing: { select: { title: true, fingerprint: true } } } });
  const latest = new Map<string, (typeof imports)[number]>();
  for (const item of imports) if (!latest.has(item.listingId)) latest.set(item.listingId, item);
  return [...latest.values()].filter(item => item.listing.fingerprint !== item.fingerprint).map(item => ({ listingId: item.listingId, title: item.listing.title, mixId: item.mixId, pipelineId: item.pipelineId }));
}

const authorEmail = async (workspaceId: string) => (await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { owner: { select: { email: true } } } }))?.owner.email ?? null;

/**
 * Report a listing. Every report is recorded, queued for staff, hidden from the reporter's own
 * Community view and announced to the author (reason only) and to staff. Only a private-information
 * report from a verified account under its daily limit hides the share for everyone at once.
 */
export async function reportListing(input: { listingId: string; reporterUserId: string; reporterWorkspaceId: string; reason: string; details: string }) {
  if (!isMarketplaceReason(input.reason)) throw new UserFacingError("Choose what is wrong with this share.");
  const reason: MarketplaceReason = input.reason;
  const details = input.details.replace(/\s+/g, " ").trim().slice(0, 1000) || null;
  if (reason === "OTHER" && !details) throw new UserFacingError("Tell us what is wrong so our team can review it.");
  const result = await prisma.$transaction(async db => {
    await db.$queryRaw`SELECT id FROM "MarketplaceListing" WHERE id = ${input.listingId} FOR UPDATE`;
    const listing = await db.marketplaceListing.findFirst({ where: { id: input.listingId, ...visible } });
    if (!listing) throw new UserFacingError("This share is no longer available.");
    if (listing.workspaceId === input.reporterWorkspaceId) throw new UserFacingError("You can’t report your own share. Stop sharing it or edit it instead.");
    if (await db.marketplaceReport.findUnique({ where: { listingId_reporterUserId: { listingId: listing.id, reporterUserId: input.reporterUserId } } })) throw new UserFacingError("You already reported this share. Our team will review it.");
    const reporter = await db.user.findUnique({ where: { id: input.reporterUserId }, select: { emailVerifiedAt: true, createdAt: true } });
    const recentAutoHides = await db.marketplaceReport.count({ where: { reporterWorkspaceId: input.reporterWorkspaceId, autoHidden: true, createdAt: { gte: new Date(Date.now() - AUTO_HIDE_LIMIT.windowMs) } } });
    const reporterEmailVerified = Boolean(reporter?.emailVerifiedAt);
    const hide = reportHidesAtOnce({ reason, reporterEmailVerified, recentAutoHides });
    const report = await db.marketplaceReport.create({ data: { listingId: listing.id, reporterUserId: input.reporterUserId, reporterWorkspaceId: input.reporterWorkspaceId, reason, details, autoHidden: hide } });
    // A hide records the wording it hid, so a later request for another review has to change it.
    const current = hide ? (await refreshListing(db, listing)).listing : listing;
    if (hide) await db.marketplaceListing.update({ where: { id: listing.id }, data: { status: "HIDDEN", hiddenReason: reason, hiddenAt: new Date(), reviewedFingerprint: current.fingerprint } });
    await db.auditLog.create({ data: { workspaceId: listing.workspaceId, actorType: "USER", actorUserId: input.reporterUserId, action: hide ? "marketplace.report.hidden" : "marketplace.report", entityType: "MarketplaceListing", entityId: listing.id, source: "marketplace", metadata: { reason } } });
    // Staff weigh a report partly by how new the reporting account is; the reporter's words stay out of the audit trail.
    const reporterAccountAgeDays = reporter ? Math.floor((Date.now() - reporter.createdAt.getTime()) / 86_400_000) : null;
    await db.platformAuditEvent.create({ data: { actorUserId: input.reporterUserId, action: hide ? "marketplace.report.hidden" : "marketplace.report", entityType: "MarketplaceListing", entityId: listing.id, reason,
      afterData: { reason, autoHidden: hide, reporterAccountAgeDays, reporterEmailVerified, recentAutoHides } } });
    return { report, listing: current, hidden: hide };
  });
  await Promise.all([notifyAuthor(result.listing, result.report.id, reason, result.hidden), notifyStaff(result.listing, result.report.id, reason, result.hidden)].map(task => task.catch(() => undefined)));
  return { hidden: result.hidden };
}

const staffOwners = () => prisma.staffMembership.findMany({ where: { role: "OWNER", status: "ACTIVE", user: { suspendedAt: null } }, select: { userId: true, user: { select: { email: true } } } });
const appLink = (path: string) => `${env.appUrl.replace(/\/$/, "")}${path}`;
const ownShareLink = (listingId: string) => appLink(`/marketplace?section=mine&item=${encodeURIComponent(`listing:${listingId}`)}`);

/** Staff with the owner role hear about every report so nothing waits unseen; silent when email is not configured. */
async function notifyStaff(listing: MarketplaceListing, reportId: string, reason: MarketplaceReason, hidden: boolean) {
  if (!transactionalEmailConfigured()) return;
  const owners = await staffOwners();
  const link = `${env.appUrl.replace(/\/$/, "")}/admin/marketplace`;
  const noun = listing.kind === "MIX" ? "Mix" : "Mega-Mix";
  const state = hidden ? "It is hidden until you decide." : "It stays visible until you decide.";
  const text = `A community ${noun} share, “${listing.title}”, was reported for: ${reasonLabel(reason)}.\n\n${state} Review it under Admin → Content → Community reports:\n${link}`;
  const html = `<p>A community ${noun} share, “${escapeHtml(listing.title)}”, was reported for: <strong>${escapeHtml(reasonLabel(reason))}</strong>.</p><p>${state} Review it under Admin → Content → Community reports:</p><p><a href="${escapeHtml(link)}">Community reports</a></p>`;
  for (const owner of owners) {
    await sendTransactionalEmail({ category: "PRODUCT", to: owner.user.email, subject: `Community share reported: ${reasonLabel(reason)}`, text, html, idempotencyKey: `marketplace-report-staff:${reportId}:${owner.userId}` }).catch(() => undefined);
  }
}

/** Email the owner when email is configured; the in-app notice on their share is always there. */
async function notifyAuthor(listing: MarketplaceListing, reportId: string, reason: MarketplaceReason, hidden: boolean) {
  if (!transactionalEmailConfigured()) return;
  const to = await authorEmail(listing.workspaceId);
  if (!to) return;
  const link = `${env.appUrl.replace(/\/$/, "")}/marketplace?section=mine&item=${encodeURIComponent(`listing:${listing.id}`)}`;
  const outcome = hidden ? "It is hidden from the Marketplace while our team reviews it." : "It stays visible while our team reviews it.";
  const text = `Someone reported your shared ${listing.kind === "MIX" ? "Mix" : "Mega-Mix"} “${listing.title}” for: ${reasonLabel(reason)}.\n\n${outcome} You can review the wording and fix anything that needs it:\n${link}\n\nYour own Mixes and the people in them are not affected.`;
  const html = `<p>Someone reported your shared ${listing.kind === "MIX" ? "Mix" : "Mega-Mix"} “${escapeHtml(listing.title)}” for: <strong>${escapeHtml(reasonLabel(reason))}</strong>.</p><p>${outcome} You can review the wording and fix anything that needs it:</p><p><a href="${escapeHtml(link)}">Review your share</a></p><p>Your own Mixes and the people in them are not affected.</p>`;
  const sent = await sendTransactionalEmail({ category: "PRODUCT", to, subject: `Your shared ${listing.kind === "MIX" ? "Mix" : "Mega-Mix"} was reported`, text, html, idempotencyKey: `marketplace-report:${reportId}` });
  if (sent.delivered) await prisma.marketplaceReport.update({ where: { id: reportId }, data: { authorEmailedAt: new Date() } });
}

export async function unseenReports(workspaceId: string) {
  return prisma.marketplaceReport.findMany({ where: { authorSeenAt: null, listing: { workspaceId } }, orderBy: { createdAt: "desc" }, take: 20, select: { id: true, reason: true, autoHidden: true, listing: { select: { id: true, title: true, status: true } } } });
}

/** Staff replies on this account's shares that the author has not marked as read. */
export async function unseenReviewReplies(workspaceId: string, take = 20) {
  return prisma.marketplaceListing.findMany({ where: { workspaceId, reviewRespondedAt: { not: null }, reviewResponseSeenAt: null }, orderBy: [{ reviewRespondedAt: "desc" }, { id: "asc" }], take,
    select: { id: true, kind: true, title: true, status: true, reviewResponseNote: true, reviewRespondedAt: true } });
}

/** "Mark as read" on a share covers its reports and the staff reply alike. */
export async function markReportsSeen(workspaceId: string, listingId: string) {
  const now = new Date();
  await prisma.marketplaceReport.updateMany({ where: { listingId, authorSeenAt: null, listing: { workspaceId } }, data: { authorSeenAt: now } });
  await prisma.marketplaceListing.updateMany({ where: { id: listingId, workspaceId, reviewRespondedAt: { not: null }, reviewResponseSeenAt: null }, data: { reviewResponseSeenAt: now } });
}

/**
 * Staff decision on a listing: its open reports, the author's request for another review, or both. Only a
 * hidden share is restored and only a live one hidden; a share the author already stopped stays stopped, and
 * a hidden share with nothing to show (its Mix archived or emptied) is restored as not shared rather than
 * live. `expectedFingerprint` is the wording staff read: restoring wording the author changed since is
 * refused, and the decision records it as the wording judged, so a later request must change it. The note
 * reaches the author through the reports the decision closes; when it answers a request, or closes no report
 * but hides, keeps hiding or restores, it is kept on the listing as the staff reply, and an answered request
 * is also emailed.
 */
export async function reviewListing(input: { listingId: string; staffUserId: string; decision: "RESTORE" | "HIDE"; note: string; expectedFingerprint?: string }) {
  const note = input.note.trim().slice(0, 1000);
  if (!note) throw new UserFacingError("Add a short note about the decision.");
  const result = await prisma.$transaction(async db => {
    await db.$queryRaw`SELECT id FROM "MarketplaceListing" WHERE id = ${input.listingId} FOR UPDATE`;
    const found = await db.marketplaceListing.findUnique({ where: { id: input.listingId } });
    if (!found) throw new UserFacingError("This share no longer exists.");
    const { listing, value } = await refreshListing(db, found);
    const restore = input.decision === "RESTORE";
    if (restore && listing.status === "HIDDEN" && value && input.expectedFingerprint !== undefined && input.expectedFingerprint !== listing.fingerprint) throw new UserFacingError("The author changed this share after you opened it. Read the latest wording, then decide.");
    const status = restore && listing.status === "HIDDEN" ? (value ? "LIVE" : "UNSHARED") : !restore && listing.status === "LIVE" ? "HIDDEN" : listing.status;
    const openReports = await db.marketplaceReport.count({ where: { listingId: listing.id, status: "OPEN" } });
    // A live share taken down carries the newest open report's reason.
    const latest = status === "HIDDEN" && listing.status === "LIVE" ? await db.marketplaceReport.findFirst({ where: { listingId: listing.id, status: "OPEN" }, orderBy: { createdAt: "desc" }, select: { reason: true } }) : null;
    const requested = listing.reviewRequestedAt !== null;
    const reply = requested || (openReports === 0 && (status !== listing.status || status === "HIDDEN"));
    const now = new Date();
    const updated = await db.marketplaceListing.update({ where: { id: listing.id }, data: {
      // The wording judged: what staff read when the page sent it, otherwise the current wording.
      reviewedFingerprint: input.expectedFingerprint || listing.fingerprint, reviewRequestedAt: null, reviewRequestNote: null,
      ...(status === listing.status ? {} : status === "HIDDEN" ? { status, hiddenAt: now, hiddenReason: latest?.reason ?? "OTHER" } : { status, hiddenReason: null, hiddenAt: null }),
      ...(reply ? { reviewResponseNote: note, reviewRespondedAt: now, reviewResponseSeenAt: null } : {})
    } });
    await db.marketplaceReport.updateMany({ where: { listingId: listing.id, status: "OPEN" }, data: { status: restore ? "DISMISSED" : "UPHELD", reviewedAt: now, reviewerUserId: input.staffUserId, reviewNote: note, authorSeenAt: null } });
    const action = restore ? (listing.status === "HIDDEN" ? "marketplace.restore" : "marketplace.dismiss") : listing.status === "LIVE" ? "marketplace.hide" : "marketplace.uphold";
    await db.platformAuditEvent.create({ data: { actorUserId: input.staffUserId, action, entityType: "MarketplaceListing", entityId: listing.id, reason: note,
      beforeData: { status: listing.status, ...(requested ? { reviewRequestedAt: listing.reviewRequestedAt?.toISOString() ?? null } : {}) },
      afterData: { status, ...(requested ? { answeredReviewRequest: true } : {}), ...(reply ? { repliedToAuthor: true } : {}) } } });
    return { status, listing: updated, requested };
  });
  if (result.requested) await notifyAuthorOfReply(result.listing).catch(() => undefined);
  return { status: result.status };
}

/**
 * The author asks for another review of a hidden share after changing it, with an optional note for staff
 * (see `cleanReviewNote`). Refused with the reason from `reviewRequestBlock`; staff see it in their queue
 * and, when email is configured, by email. The share stays hidden until they decide.
 */
export async function requestListingReview(input: { workspaceId: string; actorUserId: string; listingId: string; note: unknown }) {
  const note = cleanReviewNote(input.note);
  const listing = await prisma.$transaction(async db => {
    await db.$queryRaw`SELECT id FROM "MarketplaceListing" WHERE id = ${input.listingId} AND "workspaceId" = ${input.workspaceId} FOR UPDATE`;
    await assertOwner(db, input.workspaceId, input.actorUserId);
    const found = await db.marketplaceListing.findFirst({ where: { id: input.listingId, workspaceId: input.workspaceId } });
    if (!found) throw new UserFacingError("This share is no longer available.");
    const { listing: current, value } = await refreshListing(db, found);
    const openReports = await db.marketplaceReport.count({ where: { listingId: current.id, status: "OPEN" } });
    const blocked = reviewRequestBlock({ status: current.status, requestedAt: current.reviewRequestedAt, openReports, available: Boolean(value), fingerprint: current.fingerprint, reviewedFingerprint: current.reviewedFingerprint });
    if (blocked) throw new UserFacingError(REVIEW_REQUEST_REFUSALS[blocked]);
    const now = new Date();
    // Asking again answers any unread reply to an earlier request.
    const updated = await db.marketplaceListing.update({ where: { id: current.id }, data: { reviewRequestedAt: now, reviewRequestNote: note, ...(current.reviewRespondedAt && !current.reviewResponseSeenAt ? { reviewResponseSeenAt: now } : {}) } });
    await db.auditLog.create({ data: { workspaceId: input.workspaceId, actorType: "USER", actorUserId: input.actorUserId, action: "marketplace.review-request", entityType: "MarketplaceListing", entityId: current.id, source: "marketplace", metadata: { note: Boolean(note) } } });
    // The author's own words stay on the listing for staff and out of the audit trail.
    await db.platformAuditEvent.create({ data: { actorUserId: input.actorUserId, action: "marketplace.review-request", entityType: "MarketplaceListing", entityId: current.id,
      beforeData: { status: current.status, reviewedFingerprint: current.reviewedFingerprint }, afterData: { fingerprint: current.fingerprint, note: Boolean(note) } } });
    return updated;
  });
  await notifyStaffOfRequest(listing).catch(() => undefined);
  return { requestedAt: listing.reviewRequestedAt };
}

/** Staff with the owner role hear about every request, as they do about reports; silent when email is not configured. */
async function notifyStaffOfRequest(listing: MarketplaceListing) {
  if (!transactionalEmailConfigured() || !listing.reviewRequestedAt) return;
  const owners = await staffOwners();
  const link = appLink("/admin/marketplace");
  const noun = listing.kind === "MIX" ? "Mix" : "Mega-Mix";
  const note = listing.reviewRequestNote;
  const text = `The author of the hidden community ${noun} share “${listing.title}” changed it and asked for another review.${note ? `\n\nTheir note: “${note}”` : ""}\n\nIt stays hidden until you decide. Review it under Admin → Content → Community reports:\n${link}`;
  const html = `<p>The author of the hidden community ${noun} share “${escapeHtml(listing.title)}” changed it and asked for another review.</p>${note ? `<p>Their note: “${escapeHtml(note)}”</p>` : ""}<p>It stays hidden until you decide. Review it under Admin → Content → Community reports:</p><p><a href="${escapeHtml(link)}">Community reports</a></p>`;
  for (const owner of owners) {
    await sendTransactionalEmail({ category: "PRODUCT", to: owner.user.email, subject: `Another review requested: “${listing.title}”`, text, html, idempotencyKey: `marketplace-review-request:${listing.id}:${listing.reviewRequestedAt.getTime()}:${owner.userId}` }).catch(() => undefined);
  }
}

/** The answer to the author's request, by email when email is configured; the reply also waits on their share. */
async function notifyAuthorOfReply(listing: MarketplaceListing) {
  if (!transactionalEmailConfigured() || !listing.reviewRespondedAt || !listing.reviewResponseNote) return;
  const to = await authorEmail(listing.workspaceId);
  if (!to) return;
  const noun = listing.kind === "MIX" ? "Mix" : "Mega-Mix";
  const link = ownShareLink(listing.id);
  const next = listing.status === "HIDDEN" ? " You can change the wording and ask for another review." : listing.status === "UNSHARED" ? " Nothing in it can be shown on the Marketplace right now, so it wasn’t shared again." : "";
  const outcome = `${reviewReplyOutcome(listing.status)}${next}`;
  const subject = listing.status === "LIVE" ? `Your shared ${noun} is back on the Marketplace` : listing.status === "HIDDEN" ? `Your shared ${noun} stays hidden` : `Your shared ${noun} is no longer hidden`;
  const text = `Our team looked at your shared ${noun} “${listing.title}” again.\n\n${outcome}\n\nTheir note: “${listing.reviewResponseNote}”\n\nSee your share:\n${link}\n\nYour own Mixes and the people in them are not affected.`;
  const html = `<p>Our team looked at your shared ${noun} “${escapeHtml(listing.title)}” again.</p><p>${escapeHtml(outcome)}</p><p>Their note: “${escapeHtml(listing.reviewResponseNote)}”</p><p><a href="${escapeHtml(link)}">See your share</a></p><p>Your own Mixes and the people in them are not affected.</p>`;
  await sendTransactionalEmail({ category: "PRODUCT", to, subject, text, html, idempotencyKey: `marketplace-review-reply:${listing.id}:${listing.reviewRespondedAt.getTime()}` });
}

export type ModerationView = "" | "hidden" | "reviewed";
/** Staff still have to decide these: an open report, or an author asking for another review. */
const needsDecision: Prisma.MarketplaceListingWhereInput = { OR: [{ reports: { some: { status: "OPEN" } } }, { reviewRequestedAt: { not: null } }] };

/**
 * The staff queue for one tab, with each share's live wording (null when it has nothing to show) and when
 * staff last decided on it, so a request for another review can say what changed since. Unlike the directory,
 * this rarely viewed queue refreshes every row it shows: a restore sends the fingerprint of the wording staff
 * read, `reviewListing` checks it against the live content, and a stored fingerprint that lagged behind would
 * be refused on every reload.
 */
export async function readModerationQueue(view: ModerationView) {
  const where: Prisma.MarketplaceListingWhereInput = view === "hidden" ? { status: "HIDDEN" } : view === "reviewed" ? { reviewRequestedAt: null, reports: { some: { status: { not: "OPEN" } }, none: { status: "OPEN" } } } : needsDecision;
  const [listings, needsReview, hidden] = await Promise.all([
    prisma.marketplaceListing.findMany({ where, orderBy: [{ updatedAt: "desc" }, { id: "asc" }], take: 50, include: {
      workspace: { select: { name: true, marketplaceAuthor: { select: { publicName: true } } } },
      reports: { orderBy: { createdAt: "desc" }, take: 20 }, _count: { select: { favorites: true, imports: true } } } }),
    prisma.marketplaceListing.count({ where: needsDecision }),
    prisma.marketplaceListing.count({ where: { status: "HIDDEN" } })
  ]);
  const rows = await Promise.all(listings.map(async item => {
    const { listing, value } = await refreshListing(prisma, item);
    const decidedAt = [item.reviewRespondedAt, ...item.reports.map(report => report.reviewedAt)].reduce<Date | null>((last, at) => at && (!last || at > last) ? at : last, null);
    return { ...item, ...listing, value, decidedAt };
  }));
  return { rows, counts: { needsReview, hidden } };
}

/**
 * Archiving a Mix stops sharing what it leaves with nothing to show: the Mix's own live listing, and its
 * Mega-Mix's live listing when no other Mix in that Mega-Mix can be shared. A hidden listing stays hidden,
 * because moderation continues. Call it inside the archive transaction.
 */
export async function unshareForArchivedMix(db: Prisma.TransactionClient, input: { workspaceId: string; actorUserId: string; mixId: string }) {
  const membership = await db.megaMixPipelineMix.findFirst({ where: { mixId: input.mixId, pipeline: { workspaceId: input.workspaceId } }, select: { pipelineId: true } });
  let megaMixEmpty = false;
  if (membership) {
    // Two of its Mixes archived at once must not each count the other as still shareable.
    await db.$queryRaw`SELECT id FROM "MegaMixPipeline" WHERE id = ${membership.pipelineId} FOR UPDATE`;
    megaMixEmpty = await db.megaMixPipelineMix.count({ where: { pipelineId: membership.pipelineId, mixId: { not: input.mixId }, mix: exportableMix } }) === 0;
  }
  const unshared = await db.marketplaceListing.updateManyAndReturn({ where: { workspaceId: input.workspaceId, status: "LIVE", OR: [{ mixId: input.mixId }, ...(membership && megaMixEmpty ? [{ pipelineId: membership.pipelineId }] : [])] },
    data: { status: "UNSHARED" }, select: { id: true, kind: true } });
  if (unshared.length) await db.auditLog.createMany({ data: unshared.map(listing => ({ workspaceId: input.workspaceId, actorType: "USER" as const, actorUserId: input.actorUserId, action: "marketplace.unshare", entityType: "MarketplaceListing", entityId: listing.id, source: "mixes.list", metadata: { reason: "mix-archived", mixId: input.mixId } })) });
  return { mix: unshared.some(listing => listing.kind === "MIX"), megaMix: unshared.some(listing => listing.kind === "MEGA_MIX") };
}

/** What archiving this Mix would stop sharing, for its confirmation: its own share, and a Mega-Mix left with nothing to share. */
export async function archiveShareEffect(workspaceId: string, mixId: string) {
  const [own, membership] = await Promise.all([
    prisma.marketplaceListing.count({ where: { workspaceId, mixId, status: "LIVE" } }),
    prisma.megaMixPipelineMix.findFirst({ where: { mixId, pipeline: { workspaceId } }, select: { pipelineId: true, pipeline: { select: { name: true } } } })
  ]);
  if (!membership) return { mix: own > 0, megaMix: null };
  const [shared, others] = await Promise.all([
    prisma.marketplaceListing.count({ where: { workspaceId, pipelineId: membership.pipelineId, status: "LIVE" } }),
    prisma.megaMixPipelineMix.count({ where: { pipelineId: membership.pipelineId, mixId: { not: mixId }, mix: exportableMix } })
  ]);
  return { mix: own > 0, megaMix: shared > 0 && others === 0 ? membership.pipeline.name : null };
}
