import { randomUUID } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { readWorkflowDefinition, saveWorkflowConfiguration } from "@/lib/mix-workflow";
import { workflowConfiguration } from "@/lib/mix-workflow-config";
import { buildPortable, portableConfiguration, portableContentIssues, portableFingerprint, type PortablePackage, type PortableSourceMix } from "@/lib/mix-portable";
import { slugify } from "@/lib/slug";
import { matchDateType } from "@/lib/shared-mix-service";

type DB = Prisma.TransactionClient;
export const MEGA_MIX_NAME_MAX = 80;

export function cleanMegaMixName(value: unknown): string {
  const name = String(value ?? "").replace(/\s+/g, " ").trim().slice(0, MEGA_MIX_NAME_MAX);
  if (!name) throw new Error("Name your Mega-Mix.");
  return name;
}

/** Writers share the Journey lock, so Mega-Mix edits and Journey edits always merge the latest graph. */
async function lockOwnedWorkspace(db: DB, workspaceId: string, actorUserId: string) {
  await db.$queryRaw`SELECT id FROM "Workspace" WHERE id = ${workspaceId} FOR UPDATE`;
  const owner = await db.workspace.findFirst({ where: { id: workspaceId, ownerId: actorUserId }, select: { id: true } });
  if (!owner) throw new Error("This workspace is unavailable.");
}

async function uniqueName(db: DB, workspaceId: string, requested: string, exceptId?: string) {
  const taken = await db.megaMixPipeline.findMany({ where: { workspaceId, ...(exceptId ? { id: { not: exceptId } } : {}) }, select: { name: true } });
  return (name: string) => !taken.some(item => item.name.toLowerCase() === name.toLowerCase()) ? name : null;
}

async function assertNameFree(db: DB, workspaceId: string, name: string, exceptId?: string) {
  if (!(await uniqueName(db, workspaceId, name, exceptId))(name)) throw new Error(`You already have a Mega-Mix called “${name}”. Choose another name.`);
}

/** The first free name among "Contractor", "Contractor 2", "Contractor 3"… */
export async function availableMegaMixName(db: DB, workspaceId: string, base: string) {
  const free = await uniqueName(db, workspaceId, base);
  for (let index = 1; index < 1000; index++) {
    const candidate = index === 1 ? base : `${base.slice(0, MEGA_MIX_NAME_MAX - 4)} ${index}`;
    if (free(candidate)) return candidate;
  }
  return `${base.slice(0, MEGA_MIX_NAME_MAX - 9)} ${randomUUID().slice(0, 8)}`;
}

/** Returns the other Mega-Mixes that gave up a Mix to this one: their content changed too. */
async function setMembers(db: DB, workspaceId: string, pipelineId: string, mixIds: string[]) {
  const unique = [...new Set(mixIds)];
  const owned = await db.mix.findMany({ where: { workspaceId, id: { in: unique }, source: { not: "ONE_TIME" } }, select: { id: true } });
  if (owned.length !== unique.length) throw new Error("Choose Mixes from this account.");
  const movedFrom = await db.megaMixPipelineMix.findMany({ where: { mixId: { in: unique }, pipelineId: { not: pipelineId } }, select: { pipelineId: true } });
  await db.megaMixPipelineMix.deleteMany({ where: { pipelineId, mixId: { notIn: unique } } });
  // A Mix belongs to one Mega-Mix, so choosing it here moves it from any other.
  for (const [position, mixId] of unique.entries()) await db.megaMixPipelineMix.upsert({ where: { mixId }, create: { mixId, pipelineId, position }, update: { pipelineId, position } });
  return [...new Set(movedFrom.map(item => item.pipelineId))];
}

/**
 * After a Mega-Mix save has committed, the Marketplace shares of the Mega-Mixes it changed show the saved name,
 * description and Mixes (see `refreshSharesOf`). Never throws: the save is done.
 */
async function refreshShares(workspaceId: string, pipelineIds: string[]) {
  if (!pipelineIds.length) return;
  try {
    // Loaded when used, because marketplace-service imports this module.
    const { refreshSharesOf } = await import("@/lib/marketplace-service");
    await refreshSharesOf({ workspaceId, pipelineIds });
  } catch (error) {
    console.error("Marketplace shares were not refreshed after a Mega-Mix save.", error);
  }
}

export async function createMegaMixPipeline(input: { workspaceId: string; actorUserId: string; name: string; description?: string | null; mixIds: string[] }) {
  const name = cleanMegaMixName(input.name);
  const { pipeline, movedFrom } = await prisma.$transaction(async db => {
    await lockOwnedWorkspace(db, input.workspaceId, input.actorUserId);
    await assertNameFree(db, input.workspaceId, name);
    const pipeline = await db.megaMixPipeline.create({ data: { workspaceId: input.workspaceId, name, description: input.description?.trim().slice(0, 2000) || null, createdById: input.actorUserId } });
    const movedFrom = await setMembers(db, input.workspaceId, pipeline.id, input.mixIds);
    await db.auditLog.create({ data: { workspaceId: input.workspaceId, actorType: "USER", actorUserId: input.actorUserId, action: "mega-mix.create", entityType: "MegaMixPipeline", entityId: pipeline.id, source: "mixes.mega", metadata: { mixCount: input.mixIds.length } } });
    return { pipeline, movedFrom };
  });
  // A new Mega-Mix has no share yet; the ones it took Mixes from do.
  await refreshShares(input.workspaceId, movedFrom);
  return pipeline;
}

export async function updateMegaMixPipeline(input: { workspaceId: string; actorUserId: string; pipelineId: string; name: string; description?: string | null; mixIds: string[] }) {
  const name = cleanMegaMixName(input.name);
  const changed = await prisma.$transaction(async db => {
    await lockOwnedWorkspace(db, input.workspaceId, input.actorUserId);
    const pipeline = await db.megaMixPipeline.findFirst({ where: { id: input.pipelineId, workspaceId: input.workspaceId } });
    if (!pipeline) throw new Error("This Mega-Mix is no longer available.");
    await assertNameFree(db, input.workspaceId, name, pipeline.id);
    await db.megaMixPipeline.update({ where: { id: pipeline.id }, data: { name, description: input.description?.trim().slice(0, 2000) || null } });
    const movedFrom = await setMembers(db, input.workspaceId, pipeline.id, input.mixIds);
    await db.auditLog.create({ data: { workspaceId: input.workspaceId, actorType: "USER", actorUserId: input.actorUserId, action: "mega-mix.update", entityType: "MegaMixPipeline", entityId: pipeline.id, source: "mixes.mega", metadata: { mixCount: input.mixIds.length, renamed: pipeline.name !== name } } });
    return [pipeline.id, ...movedFrom];
  });
  await refreshShares(input.workspaceId, changed);
}

export const MEGA_MIX_SHARE_UNDER_REVIEW = "This Mega-Mix’s share is under review; it can be removed once the review is done.";

/** A Mega-Mix's Marketplace share, and whether staff still have a report on it to decide. */
export async function megaMixShareState(db: DB | typeof prisma, pipelineId: string) {
  const listing = await db.marketplaceListing.findFirst({ where: { pipelineId }, select: { id: true, status: true, _count: { select: { reports: { where: { status: "OPEN" } } } } } });
  return listing ? { id: listing.id, status: listing.status, underReview: listing.status === "HIDDEN" || listing._count.reports > 0 } : null;
}

/**
 * Removes the grouping only. Its Mixes, their people and the Journey connections stay. Its Marketplace
 * share goes with it, so a share that staff are still reviewing keeps the Mega-Mix until they decide.
 */
export async function deleteMegaMixPipeline(input: { workspaceId: string; actorUserId: string; pipelineId: string }) {
  return prisma.$transaction(async db => {
    await lockOwnedWorkspace(db, input.workspaceId, input.actorUserId);
    const pipeline = await db.megaMixPipeline.findFirst({ where: { id: input.pipelineId, workspaceId: input.workspaceId } });
    if (!pipeline) return;
    const share = await megaMixShareState(db, pipeline.id);
    if (share?.underReview) throw new Error(MEGA_MIX_SHARE_UNDER_REVIEW);
    await db.megaMixPipeline.delete({ where: { id: pipeline.id } });
    // A ready-made mega-mix can be added again once its named Mega-Mix is removed.
    if (pipeline.origin?.startsWith("BLUEPRINT:")) await db.megaMixInstallation.deleteMany({ where: { workspaceId: input.workspaceId, blueprintId: pipeline.origin.slice(10) } });
    await db.auditLog.create({ data: { workspaceId: input.workspaceId, actorType: "USER", actorUserId: input.actorUserId, action: "mega-mix.delete", entityType: "MegaMixPipeline", entityId: pipeline.id, source: "mixes.mega", metadata: { keptMixes: true, removedShare: Boolean(share) } } });
  });
}

async function sourceMixes(db: DB | typeof prisma, workspaceId: string, mixIds: string[]): Promise<PortableSourceMix[]> {
  const rows = await db.mix.findMany({ where: { workspaceId, id: { in: mixIds }, source: { not: "ONE_TIME" }, status: { not: "ARCHIVED" }, triggerMode: { in: ["MANUAL_START", "DATE_TRIGGERED"] } },
    include: { dateType: { select: { name: true, slug: true } }, steps: { where: { isActive: true, plannedAt: null }, orderBy: { sortOrder: "asc" }, include: { stepVersion: { include: { stepTemplate: true, variants: true } } } } } });
  const order = new Map(mixIds.map((id, index) => [id, index]));
  return rows.filter(mix => mix.steps.length).sort((a, b) => order.get(a.id)! - order.get(b.id)!).map(mix => ({
    id: mix.id, name: mix.name, description: mix.description, category: mix.category, industry: mix.industry, framework: mix.framework, triggerMode: mix.triggerMode,
    dateType: mix.dateType ? { name: mix.dateType.name, slug: mix.dateType.slug } : null,
    steps: mix.steps.map(step => ({ id: step.id, name: step.stepVersion.stepTemplate.name, channel: step.stepVersion.stepTemplate.channel, dayOffset: step.dayOffset, sendTimeMinutes: step.sendTimeMinutes,
      anchor: step.anchor, offsetMinutes: step.offsetMinutes, subject: step.stepVersion.subject, body: step.stepVersion.body, script: step.stepVersion.script,
      longSms: step.stepVersion.longSms, includeOptOut: step.stepVersion.includeOptOut,
      variants: step.stepVersion.variants.map(item => ({ family: item.family, subject: item.subject, body: item.body, script: item.script })) }))
  }));
}

/** Everything that cannot travel is reported instead of silently dropped. */
export async function exportMegaMixPipeline(db: DB | typeof prisma, workspaceId: string, pipelineId: string) {
  const pipeline = await db.megaMixPipeline.findFirst({ where: { id: pipelineId, workspaceId }, include: { members: { orderBy: { position: "asc" } } } });
  if (!pipeline) throw new Error("This Mega-Mix is no longer available.");
  const mixIds = pipeline.members.map(member => member.mixId);
  // Only the saved Journey connections travel (`buildPortable` reads its rules, waiting Beats and finishes), so
  // the rest of the account's Mixes and their wording are never loaded.
  const [mixes, saved] = await Promise.all([sourceMixes(db, workspaceId, mixIds), db.mixWorkflow.findUnique({ where: { workspaceId }, select: { configuration: true } })]);
  if (!mixes.length) throw new Error("Add at least one Mix with Beats before exporting this Mega-Mix.");
  const built = buildPortable({ kind: "mega-mix", name: pipeline.name, description: pipeline.description, mixes, configuration: workflowConfiguration(saved?.configuration) });
  return { ...built, skippedMixes: mixIds.length - mixes.length, pipeline };
}

export async function exportSingleMix(db: DB | typeof prisma, workspaceId: string, mixId: string) {
  const [mix] = await sourceMixes(db, workspaceId, [mixId]);
  if (!mix) throw new Error("Only an active or draft Mix with Beats and a manual or date start can be exported.");
  return buildPortable({ kind: "mix", name: mix.name.slice(0, 80), description: mix.description, mixes: [mix], configuration: { rules: [], gatedStepIds: [], intentionalEnds: [] } });
}

/** Bind a date-based Mix from a file to the account's matching date type; only an unknown one is created, slugged from its name so suffixes never pile up across hops. */
async function resolveDateType(db: DB, workspaceId: string, dateType: { name: string; slug: string } | null) {
  if (!dateType) return null;
  const existing = await matchDateType(db, workspaceId, dateType);
  if (existing) return existing.id;
  return (await db.dateType.create({ data: { workspaceId, scopeKey: workspaceId, name: dateType.name, slug: slugify(dateType.name), isSystem: false, isActive: true } })).id;
}

/**
 * Add a package to an account as new, editable Mixes. Nobody is started and nothing is sent;
 * the connections join the account's Journey. A Mega-Mix package also gets its named Mega-Mix.
 */
export async function installPortable(db: DB, input: { workspaceId: string; actorUserId: string; value: PortablePackage; name: string; origin: string; source: string }) {
  await lockOwnedWorkspace(db, input.workspaceId, input.actorUserId);
  const value = input.value;
  // Marketplace adds and copies never pass the file reader, so the editor's rules run here for every path.
  const [issue] = portableContentIssues(value);
  if (issue) throw new Error(`This ${value.kind === "mix" ? "Mix" : "Mega-Mix"} cannot be ${input.origin.startsWith("COPY:") ? "copied" : "added"}: ${issue.replace(/\.$/, "")}.`);
  const name = cleanMegaMixName(input.name);
  if (value.kind === "mega-mix") await assertNameFree(db, input.workspaceId, name);
  const mixIds = new Map<string, string>(), stepIds = new Map<string, string>();
  for (const item of value.mixes) {
    const dateTypeId = item.triggerMode === "DATE_TRIGGERED" ? await resolveDateType(db, input.workspaceId, item.dateType) : null;
    const created = await db.mix.create({ data: {
      workspaceId: input.workspaceId, name: value.kind === "mix" ? name : item.name, description: item.description, category: item.category, industry: item.industry, framework: item.framework,
      triggerMode: dateTypeId ? "DATE_TRIGGERED" : "MANUAL_START", dateTypeId, status: "ACTIVE", source: "USER", includeFutureGroupMembers: false,
      durationDays: Math.max(0, ...item.steps.map(step => step.dayOffset))
    } });
    mixIds.set(item.key, created.id);
    for (const [index, step] of item.steps.entries()) {
      const template = await db.stepTemplate.create({ data: { workspaceId: input.workspaceId, name: step.name, channel: step.channel, isActive: false,
        versions: { create: { version: 1, subject: step.subject, body: step.body, script: step.script, longSms: step.longSms, includeOptOut: step.includeOptOut,
          variants: { create: step.variants.map(variant => ({ family: variant.family, subject: variant.subject, body: variant.body, script: variant.script })) } } } }, include: { versions: true } });
      const mixStep = await db.mixStep.create({ data: { mixId: created.id, stepVersionId: template.versions[0].id, dayOffset: step.dayOffset, sendTimeMinutes: step.sendTimeMinutes,
        anchor: step.anchor, offsetMinutes: step.anchor === "CALENDAR_DAY" ? null : step.offsetMinutes, sortOrder: index + 1 } });
      stepIds.set(`${item.key}/${step.key}`, mixStep.id);
    }
  }
  let pipelineId: string | null = null;
  if (value.kind === "mega-mix") {
    const addition = portableConfiguration(value, { mix: key => mixIds.get(key)!, beat: (mix, beat) => stepIds.get(`${mix}/${beat}`)!, fresh: randomUUID });
    if (addition.rules.length || addition.gatedStepIds.length || addition.intentionalEnds.length) {
      const current = await readWorkflowDefinition(db, input.workspaceId);
      await saveWorkflowConfiguration(db, input.workspaceId, { rules: [...current.rules, ...addition.rules], gatedStepIds: [...current.gatedStepIds, ...addition.gatedStepIds], intentionalEnds: [...current.intentionalEnds, ...addition.intentionalEnds] }, current.revision, input.actorUserId);
    }
    const pipeline = await db.megaMixPipeline.create({ data: { workspaceId: input.workspaceId, name, description: value.description, origin: input.origin, originFingerprint: portableFingerprint(value), createdById: input.actorUserId,
      members: { create: value.mixes.map((item, position) => ({ mixId: mixIds.get(item.key)!, position })) } } });
    pipelineId = pipeline.id;
  }
  await db.auditLog.create({ data: { workspaceId: input.workspaceId, actorType: "USER", actorUserId: input.actorUserId, action: value.kind === "mix" ? "mix.import" : "mega-mix.import", entityType: value.kind === "mix" ? "Mix" : "MegaMixPipeline",
    entityId: pipelineId ?? mixIds.values().next().value!, source: input.source, metadata: { origin: input.origin, mixCount: value.mixes.length, connections: value.rules.length, enrolledContacts: 0 } } });
  return { pipelineId, mixIds: [...mixIds.values()] };
}

export async function importPortable(input: { workspaceId: string; actorUserId: string; value: PortablePackage; name: string; origin: string; source: string }) {
  return prisma.$transaction(db => installPortable(db, input), { timeout: 30_000 });
}

/** A full copy: new Mixes, Beats, wording and connections, under a new name. */
export async function duplicateMegaMixPipeline(input: { workspaceId: string; actorUserId: string; pipelineId: string; name: string }) {
  return prisma.$transaction(async db => {
    const exported = await exportMegaMixPipeline(db, input.workspaceId, input.pipelineId);
    return installPortable(db, { workspaceId: input.workspaceId, actorUserId: input.actorUserId, value: exported.package, name: input.name, origin: `COPY:${input.pipelineId}`, source: "mixes.mega" });
  }, { timeout: 30_000 });
}

export async function readMegaMixPipelines(workspaceId: string) {
  return prisma.megaMixPipeline.findMany({ where: { workspaceId }, orderBy: [{ name: "asc" }, { id: "asc" }], include: { members: { orderBy: { position: "asc" }, select: { mixId: true } } } });
}
