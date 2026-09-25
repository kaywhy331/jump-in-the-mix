import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MarketplaceListing } from "@/generated/prisma/client";

// Release C-1, C2: Marketplace list rows and update notices read the stored listing facts. Author saves refresh
// them after their commit, the one listing opened still refreshes, and an hourly worker pass catches the rest.
const session = vi.hoisted(() => ({ context: {} }));
vi.mock("@/lib/auth", () => ({ requireWorkspace: async () => session.context }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));
/** Every database operation, as Model.operation, while `on`. */
const recorded = vi.hoisted(() => ({ on: false, operations: [] as string[] }));
vi.mock("@/lib/prisma", async importOriginal => {
  const { prisma } = await importOriginal<typeof import("@/lib/prisma")>();
  return { prisma: prisma.$extends({ query: { $allModels: { async $allOperations({ model, operation, args, query }) {
    if (recorded.on) recorded.operations.push(`${model}.${operation}`);
    return query(args);
  } } } }) };
});
// The content exports and the package builder run for real; the suite only watches them.
vi.mock("@/lib/mega-mix-pipeline-service", async importOriginal => {
  const actual = await importOriginal<typeof import("@/lib/mega-mix-pipeline-service")>();
  return { ...actual, exportSingleMix: vi.fn(actual.exportSingleMix), exportMegaMixPipeline: vi.fn(actual.exportMegaMixPipeline) };
});
vi.mock("@/lib/mix-portable", async importOriginal => {
  const actual = await importOriginal<typeof import("@/lib/mix-portable")>();
  return { ...actual, buildPortable: vi.fn(actual.buildPortable) };
});

import { prisma } from "@/lib/prisma";
import { installMegaMix } from "@/lib/mega-mix-service";
import { readWorkflowDefinition } from "@/lib/mix-workflow";
import { workflowConfiguration } from "@/lib/mix-workflow-config";
import { buildPortable, portableFingerprint } from "@/lib/mix-portable";
import { saveMixAction } from "@/lib/mix-editor-actions";
import { createMegaMixPipeline, exportMegaMixPipeline, exportSingleMix, updateMegaMixPipeline } from "@/lib/mega-mix-pipeline-service";
import { addFromMarketplace, marketplaceUpdates, readMarketplace, readMarketplaceItem, readModerationQueue, refreshSharesOf, refreshStaleListings, reportListing, reviewListing, shareOnMarketplace, type MarketplaceFilters } from "@/lib/marketplace-service";

const local = /^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? "");
const community: MarketplaceFilters = { section: "community", kind: "", q: "", industry: "", channel: "", size: "", sort: "popular", favorites: false };

describe.skipIf(!local)("Marketplace facts refreshed on write", () => {
  type Person = { userId: string; workspaceId: string };
  const people: Person[] = [];
  const person = async (label: string, verified = false): Promise<Person> => {
    const userId = (await prisma.user.create({ data: { name: label, email: `${label}-${randomUUID()}@example.invalid`, emailVerifiedAt: verified ? new Date() : null } })).id;
    const workspaceId = (await prisma.workspace.create({ data: { ownerId: userId, name: `${label} business`, slug: randomUUID() } })).id;
    people.push({ userId, workspaceId });
    return { userId, workspaceId };
  };
  let author: Person, reader: Person;
  /** A Mix with one text Beat, as a person would share it. */
  const simpleMix = (name: string, body = "Hi {{First Name}}, just checking in. {{SMS Signature}}") => prisma.mix.create({ data: { workspaceId: author.workspaceId, name, triggerMode: "MANUAL_START", status: "ACTIVE",
    steps: { create: { dayOffset: 0, sortOrder: 1, stepVersion: { create: { version: 1, body, stepTemplate: { create: { workspaceId: author.workspaceId, name: `${name} beat`, channel: "SMS", isActive: false } } } } } } } });
  /** A Beat written straight to the database, as no author save writes one: no refresh hook runs. */
  const addBeat = (mixId: string, sortOrder: number) => prisma.mixStep.create({ data: { mix: { connect: { id: mixId } }, dayOffset: sortOrder, sortOrder,
    stepVersion: { create: { version: 1, body: `Beat ${sortOrder}, {{First Name}}. {{SMS Signature}}`, stepTemplate: { create: { workspaceId: author.workspaceId, name: `Beat ${sortOrder}`, channel: "SMS", isActive: false } } } } } });
  /** New wording for the first Beat, straight in the database. */
  const reword = async (mixId: string, body: string) => {
    const step = await prisma.mixStep.findFirstOrThrow({ where: { mixId, isActive: true }, orderBy: { sortOrder: "asc" } });
    await prisma.stepVersion.update({ where: { id: step.stepVersionId }, data: { body } });
  };
  const share = (kind: "MIX" | "MEGA_MIX", targetId: string) => shareOnMarketplace({ workspaceId: author.workspaceId, actorUserId: author.userId, kind, targetId, publicName: "Rivera Renovations", summary: "", industry: "", confirmed: true });
  const stored = (listingId: string) => prisma.marketplaceListing.findUniqueOrThrow({ where: { id: listingId } });
  const watchExports = () => { vi.mocked(exportSingleMix).mockClear(); vi.mocked(exportMegaMixPipeline).mockClear(); };
  const exportsRun = () => vi.mocked(exportSingleMix).mock.calls.length + vi.mocked(exportMegaMixPipeline).mock.calls.length;
  const record = async <T,>(run: () => Promise<T>) => {
    recorded.operations.length = 0;
    recorded.on = true;
    try { return { result: await run(), operations: [...recorded.operations].sort() }; } finally { recorded.on = false; }
  };
  /** The Mix editor's form as MixEditor posts it: one text Beat per entry, a kept Beat by its id. */
  const saveMix = async (name: string, beats: Array<{ id?: string; body: string }>, mixId = "") => {
    const data = new FormData();
    for (const [key, value] of Object.entries({ mixId, name, status: "DRAFT", triggerMode: "MANUAL_START", dateTypeId: "", workflowRevision: "0" })) data.set(key, value);
    for (const [index, beat] of beats.entries()) {
      for (const [key, value] of Object.entries({ mixStepId: beat.id ?? "", dayOffset: String(index), sendTimeMinutes: "", plannedAt: "", anchor: "CALENDAR_DAY", offsetMinutes: "" })) data.append(key, value);
      for (const [key, value] of Object.entries({ [`inlineName-${index}`]: `${name} ${index + 1}`, [`inlineChannel-${index}`]: "SMS", [`inlineBody-${index}`]: beat.body })) data.set(key, value);
    }
    await expect(saveMixAction(data)).rejects.toThrow(/^redirect:\/mixes\/[^/]+\/edit\?(created|updated)=manual$/);
    return prisma.mix.findFirstOrThrow({ where: { workspaceId: author.workspaceId, name }, include: { steps: { where: { isActive: true }, orderBy: { sortOrder: "asc" } } } });
  };

  beforeEach(async () => {
    author = await person("author", true); reader = await person("reader");
    const [user, workspace] = await Promise.all([prisma.user.findUniqueOrThrow({ where: { id: author.userId } }), prisma.workspace.findUniqueOrThrow({ where: { id: author.workspaceId } })]);
    session.context = { session: { id: `session-${randomUUID()}`, authUser: { id: author.userId } }, user, workspace, impersonation: null };
  });
  afterEach(async () => {
    recorded.on = false;
    await prisma.workspace.deleteMany({ where: { id: { in: people.map(item => item.workspaceId) } } });
    await prisma.user.deleteMany({ where: { id: { in: people.map(item => item.userId) } } });
    people.length = 0;
  });
  afterAll(async () => { await prisma.$disconnect(); });

  it("renders list rows from the stored facts: no export, no write, and one query for what My shares can show", async () => {
    const kept = await simpleMix("Porch follow-up"), emptied = await simpleMix("Emptied since");
    const keptShare = await share("MIX", kept.id), emptiedShare = await share("MIX", emptied.id);
    // Changes that reach no author-save hook: a Beat added straight to the database, the other Mix's only Beat retired.
    await addBeat(kept.id, 2);
    await prisma.mixStep.updateMany({ where: { mixId: emptied.id }, data: { isActive: false } });
    const before = await prisma.marketplaceListing.findMany({ where: { workspaceId: author.workspaceId }, orderBy: { id: "asc" } });
    watchExports();
    const listed = await record(() => readMarketplace(community, reader, 1, 500));
    const mine = await record(() => readMarketplace({ ...community, section: "mine" }, author, 1, 500));
    expect(exportsRun()).toBe(0);
    expect(listed.operations).toEqual(["MarketplaceListing.count", "MarketplaceListing.findMany"]);
    expect(mine.operations).toEqual(["MarketplaceListing.count", "MarketplaceListing.findMany", "MarketplaceListing.findMany"]);
    expect(await prisma.marketplaceListing.findMany({ where: { workspaceId: author.workspaceId }, orderBy: { id: "asc" } })).toEqual(before);
    // The stored facts show until something refreshes them; a share with nothing to show leaves the Community list only.
    expect(listed.result.rows.find(row => row.id === keptShare.id)).toMatchObject({ beatCount: 1, available: true });
    expect(listed.result.rows.map(row => row.id)).not.toContain(emptiedShare.id);
    expect(mine.result.total).toBe(2);
    expect(mine.result.rows.map(row => [row.id, row.beatCount, row.available])).toEqual(expect.arrayContaining([[keptShare.id, 1, true], [emptiedShare.id, 1, false]]));
    // The one listing opened still reads, and stores, the live content.
    expect(await readMarketplaceItem(`listing:${keptShare.id}`, reader)).toMatchObject({ type: "listing", listing: { beatCount: 2 } });
    expect((await readMarketplace(community, reader, 1, 500)).rows.find(row => row.id === keptShare.id)).toMatchObject({ beatCount: 2 });
  });

  it("offers an update from the stored fingerprint: not for a change no save hook sees, at once after the author saves in the editor", async () => {
    const saved = await saveMix("Porch follow-up", [{ body: "Hi {{First Name}}, how is the new porch? {{SMS Signature}}" }]);
    const listing = await share("MIX", saved.id);
    const item = await readMarketplaceItem(`listing:${listing.id}`, reader);
    if (item?.type !== "listing") throw new Error("Expected a listing.");
    const copy = await addFromMarketplace({ listingId: listing.id, workspaceId: reader.workspaceId, actorUserId: reader.userId, name: "Our porch follow-up", expectedFingerprint: item.listing.fingerprint });
    expect(await marketplaceUpdates(reader.workspaceId)).toEqual([]);
    // Reworded straight in the database: the stored fingerprint, and so the notice, wait for the hourly pass.
    await reword(saved.id, "Hi {{First Name}}, how is the porch holding up? {{SMS Signature}}");
    watchExports();
    expect(await marketplaceUpdates(reader.workspaceId, { mixId: copy.mixIds[0] })).toEqual([]);
    expect(exportsRun()).toBe(0);
    // The author's save in the editor refreshes the share after its commit: the notice and the list are current at once.
    await saveMix("Porch follow-up", [{ id: saved.steps[0].id, body: "Hi {{First Name}}, how is the new deck? {{SMS Signature}}" }, { body: "One more check-in, {{First Name}}. {{SMS Signature}}" }], saved.id);
    expect(await marketplaceUpdates(reader.workspaceId, { mixId: copy.mixIds[0] })).toEqual([{ listingId: listing.id, title: "Porch follow-up", mixId: copy.mixIds[0], pipelineId: null }]);
    expect(await stored(listing.id)).toMatchObject({ beatCount: 2, fingerprint: portableFingerprint((await exportSingleMix(prisma, author.workspaceId, saved.id)).package) });
    expect((await readMarketplace(community, reader, 1, 500)).rows.find(row => row.id === listing.id)).toMatchObject({ beatCount: 2 });
  });

  it("refreshes a Mega-Mix's share after it is renamed or regrouped, after a member Mix is saved, and when another Mega-Mix takes one of its Mixes", async () => {
    const [first, second, third] = [await simpleMix("First"), await simpleMix("Second"), await simpleMix("Third")];
    const pipeline = await createMegaMixPipeline({ workspaceId: author.workspaceId, actorUserId: author.userId, name: "Two Mixes", mixIds: [first.id, second.id] });
    const listing = await share("MEGA_MIX", pipeline.id);
    expect(listing).toMatchObject({ title: "Two Mixes", mixCount: 2, beatCount: 2 });
    await updateMegaMixPipeline({ workspaceId: author.workspaceId, actorUserId: author.userId, pipelineId: pipeline.id, name: "Three Mixes", mixIds: [first.id, second.id, third.id] });
    expect(await stored(listing.id)).toMatchObject({ title: "Three Mixes", mixCount: 3, beatCount: 3 });
    const kept = await prisma.mixStep.findFirstOrThrow({ where: { mixId: first.id } });
    await saveMix("First", [{ id: kept.id, body: "Hi {{First Name}}, just checking in. {{SMS Signature}}" }, { body: "And once more, {{First Name}}. {{SMS Signature}}" }], first.id);
    expect(await stored(listing.id)).toMatchObject({ mixCount: 3, beatCount: 4 });
    await createMegaMixPipeline({ workspaceId: author.workspaceId, actorUserId: author.userId, name: "Third alone", mixIds: [third.id] });
    expect(await stored(listing.id)).toMatchObject({ title: "Three Mixes", mixCount: 2, beatCount: 3 });
    expect((await readMarketplace({ ...community, section: "mine" }, author, 1, 500)).rows).toEqual([expect.objectContaining({ id: listing.id, title: "Three Mixes", mixCount: 2, beatCount: 3, available: true })]);
  });

  it("walks the live shares oldest content first, a bounded number per pass, and carries on where it stopped", async () => {
    const names = ["Oldest", "Second oldest", "Newest", "Steady", "Emptied", "Hidden"] as const;
    const mixes: Record<string, { id: string }> = {}, shares: Record<string, MarketplaceListing> = {};
    for (const name of names) { mixes[name] = await simpleMix(name); shares[name] = await share("MIX", mixes[name].id); }
    await prisma.marketplaceListing.update({ where: { id: shares.Hidden.id }, data: { status: "HIDDEN" } });
    // Content times far in the past, so no other share in the database sorts among these.
    const base = Date.UTC(1990, 0, 1) + Math.floor(Math.random() * 1e11);
    const offsets: Record<string, number> = { Oldest: 0, Emptied: 10, "Second oldest": 20, Hidden: 30, Steady: 35, Newest: 40 };
    for (const name of names) await prisma.marketplaceListing.update({ where: { id: shares[name].id }, data: { contentAt: new Date(base + offsets[name]) } });
    // Changes no author-save hook sees; Steady keeps its content.
    for (const name of ["Oldest", "Second oldest", "Newest", "Hidden"]) await addBeat(mixes[name].id, 2);
    await prisma.mixStep.updateMany({ where: { mixId: mixes.Emptied.id }, data: { isActive: false } });
    const beats = async () => Object.fromEntries(await Promise.all(names.map(async name => [name, (await stored(shares[name].id)).beatCount] as const)));

    const first = await refreshStaleListings({ limit: 2, after: { contentAt: new Date(base - 1), id: "" } });
    expect(first).toEqual({ checked: 2, changed: 2, next: { contentAt: new Date(base + 20), id: shares["Second oldest"].id } });
    expect(await beats()).toEqual({ Oldest: 2, "Second oldest": 2, Newest: 1, Steady: 1, Emptied: 1, Hidden: 1 });
    // The next pass carries on. A hidden share and one with nothing to show are not walked; an unchanged one is not written.
    const second = await refreshStaleListings({ limit: 2, after: first.next });
    expect(second).toEqual({ checked: 2, changed: 1, next: { contentAt: new Date(base + 40), id: shares.Newest.id } });
    expect(await beats()).toEqual({ Oldest: 2, "Second oldest": 2, Newest: 2, Steady: 1, Emptied: 1, Hidden: 1 });
    expect((await stored(shares.Steady.id)).contentAt).toEqual(new Date(base + 35));
    // Past the last share, the walk starts over.
    expect(await refreshStaleListings({ after: { contentAt: new Date("9999-12-31T00:00:00Z"), id: "" } })).toEqual({ checked: 0, changed: 0, next: null });
  });

  it("lets staff restore a hidden share whose wording changed without a save hook: the queue refreshes, and sends the live fingerprint", async () => {
    const mix = await simpleMix("Porch follow-up", "Hi Maria, how is the new porch? {{SMS Signature}}");
    const listing = await share("MIX", mix.id);
    const verified = await person("verified", true), staff = await person("staff");
    expect((await reportListing({ listingId: listing.id, reporterUserId: verified.userId, reporterWorkspaceId: verified.workspaceId, reason: "PRIVATE_INFO", details: "A customer's name in Beat 1" })).hidden).toBe(true);
    await reviewListing({ listingId: listing.id, staffUserId: staff.userId, decision: "HIDE", note: "Beat 1 names a customer." });
    // Fixed outside the editor, so no hook refreshed the share: its stored fingerprint is still the hidden wording's.
    await reword(mix.id, "Hi {{First Name}}, how is the new porch? {{SMS Signature}}");
    const stale = (await stored(listing.id)).fingerprint;
    const row = (await readModerationQueue("hidden")).rows.find(item => item.id === listing.id)!;
    expect(JSON.stringify(row.value)).toContain("Hi {{First Name}}, how is the new porch?");
    expect(row.fingerprint).not.toBe(stale);
    // The stored fingerprint would be refused as wording changed since staff read it; the page sends the queue's.
    await expect(reviewListing({ listingId: listing.id, staffUserId: staff.userId, decision: "RESTORE", note: "Fixed.", expectedFingerprint: stale })).rejects.toThrow("The author changed this share after you opened it. Read the latest wording, then decide.");
    expect(await reviewListing({ listingId: listing.id, staffUserId: staff.userId, decision: "RESTORE", note: "The name is gone.", expectedFingerprint: row.value ? row.fingerprint : "" })).toEqual({ status: "LIVE" });
    expect(await stored(listing.id)).toMatchObject({ status: "LIVE", reviewedFingerprint: row.fingerprint });
  });

  it("exports a Mega-Mix from its own Mixes and the saved Journey configuration only, building the package the full definition built", async () => {
    const pipelineId = (await installMegaMix({ workspaceId: author.workspaceId, actorUserId: author.userId, blueprintId: "contractor", expectedVersion: 1 })).id;
    // Beyond the ready-made connections: a waiting Beat and a finish inside the Mega-Mix, and a Mix, a connection and a finish outside it.
    const outside = await simpleMix("Outside the Mega-Mix");
    const members = await prisma.megaMixPipelineMix.findMany({ where: { pipelineId }, orderBy: { position: "asc" }, include: { mix: { include: { steps: { where: { isActive: true }, orderBy: { sortOrder: "asc" } } } } } });
    const configuration = workflowConfiguration((await prisma.mixWorkflow.findUniqueOrThrow({ where: { workspaceId: author.workspaceId } })).configuration);
    const leaving = { id: "leaves", name: "Leaves the Mega-Mix", source: { mixId: members[0].mixId, stepId: null }, enabled: true, mode: "PARALLEL" as const, join: null,
      routes: [{ id: "leaves:1", label: "Then", when: "FINISHED" as const, outcome: "", delayMinutes: 0, target: { mixId: outside.id, stepId: null }, maxVisits: null, replace: false }] };
    await prisma.mixWorkflow.update({ where: { workspaceId: author.workspaceId }, data: { configuration: JSON.parse(JSON.stringify({ rules: [...configuration.rules, leaving],
      gatedStepIds: [members[1].mix.steps[0].id], intentionalEnds: [...configuration.intentionalEnds, `mix:${members.at(-1)!.mixId}`, `mix:${outside.id}`] })) } });
    vi.mocked(buildPortable).mockClear();
    const { result: exported, operations } = await record(() => exportMegaMixPipeline(prisma, author.workspaceId, pipelineId));
    // The pipeline, its Mixes and the saved configuration: never the account's other Mixes and their wording.
    expect(operations).toEqual(["MegaMixPipeline.findFirst", "Mix.findMany", "MixWorkflow.findUnique"]);
    expect(exported.package.rules.length).toBeGreaterThan(0);
    expect(exported.package.waitingBeats).toHaveLength(1);
    expect(exported.package.finishes).toContain(exported.package.mixes.at(-1)!.key);
    expect(exported.omittedConnections).toBe(1);
    // The same Mixes with the full definition, which the export read before: the same package, so the same fingerprint.
    const [input] = vi.mocked(buildPortable).mock.calls[0];
    const definition = await readWorkflowDefinition(prisma, author.workspaceId);
    expect(input.configuration).toEqual({ rules: definition.rules, gatedStepIds: definition.gatedStepIds, intentionalEnds: definition.intentionalEnds });
    const before = buildPortable({ ...input, configuration: definition });
    expect(before).toEqual({ package: exported.package, omittedConnections: exported.omittedConnections });
    expect(portableFingerprint(before.package)).toBe(portableFingerprint(exported.package));
  });

  it("never lets an export that began before an author's save overwrite the facts that save's refresh wrote", async () => {
    const mix = await simpleMix("Porch follow-up");
    const listing = await share("MIX", mix.id);
    await addBeat(mix.id, 2);
    const { exportSingleMix: live } = await vi.importActual<typeof import("@/lib/mega-mix-pipeline-service")>("@/lib/mega-mix-pipeline-service");
    // A detail view exports two Beats; before it writes, the author saves a third and the save's refresh lands first.
    vi.mocked(exportSingleMix).mockImplementationOnce(async (db, workspaceId, mixId) => {
      const early = await live(db, workspaceId, mixId);
      await addBeat(mix.id, 3);
      await refreshSharesOf({ workspaceId: author.workspaceId, mixIds: [mix.id] });
      return early;
    });
    const item = await readMarketplaceItem(`listing:${listing.id}`, reader);
    expect(await stored(listing.id)).toMatchObject({ beatCount: 3 });
    expect(item).toMatchObject({ type: "listing", listing: { beatCount: 3 } });
    expect(item?.value?.mixes[0].steps).toHaveLength(3);
  });
});
