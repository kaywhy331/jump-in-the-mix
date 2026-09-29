import { lockLibrary, readPublishedLibrary } from "@/lib/library-store";
import { randomUUID } from "node:crypto";
import type {
  MixTriggerMode,
  Prisma
} from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  normalizeSharedMixSteps,
  type SharedMixStep
} from "@/lib/shared-mix";
import { slugify } from "@/lib/slug";
import { UserFacingError } from "@/lib/user-facing-error";

export type MixSnapshot = {
  mixId: string;
  name: string;
  description: string | null;
  category: string | null;
  industry: string | null;
  framework: string | null;
  triggerMode: MixTriggerMode;
  dateTypeName: string | null;
  dateTypeSlug: string | null;
  durationDays: number;
  steps: SharedMixStep[];
};

function clean(value: string | null | undefined, maxLength: number): string {
  return (value ?? "").trim().slice(0, maxLength);
}

export async function snapshotWorkspaceMix(workspaceId: string, mixId: string): Promise<MixSnapshot> {
  const mix = await prisma.mix.findFirst({
    where: { id: mixId, workspaceId, status: { not: "ARCHIVED" } },
    include: {
      dateType: true,
      steps: {
        where: { isActive: true },
        include: { stepVersion: { include: { stepTemplate: true } } },
        orderBy: { sortOrder: "asc" }
      }
    }
  });
  if (!mix) throw new UserFacingError("Mix not found.");
  if (!mix.steps.length) throw new UserFacingError("Add at least one follow-up before publishing this Mix.");

  const steps: SharedMixStep[] = mix.steps.map((item, index) => ({
    name: item.stepVersion.stepTemplate.name || `Follow-up #${index + 1}`,
    channel: item.stepVersion.stepTemplate.channel,
    dayOffset: item.dayOffset,
    sendTimeMinutes: item.sendTimeMinutes,
    subject: item.stepVersion.subject,
    body: item.stepVersion.body,
    script: item.stepVersion.script,
    longSms: item.stepVersion.longSms,
    includeOptOut: item.stepVersion.includeOptOut
  }));
  normalizeSharedMixSteps(steps);

  return {
    mixId: mix.id,
    name: mix.name,
    description: mix.description,
    category: mix.category,
    industry: mix.industry,
    framework: mix.framework,
    triggerMode: mix.triggerMode,
    dateTypeName: mix.dateType?.name ?? null,
    dateTypeSlug: mix.dateType?.slug ?? null,
    durationDays: Math.max(...steps.map((item) => Math.abs(item.dayOffset)), 0),
    steps
  };
}

/**
 * The saved date type a file or ready-made Mix refers to: the exported slug as it is, then the
 * name (case-insensitive), across this account's own types and the system ones. Slugs made here
 * carry a random suffix, so slugifying before the lookup could never match an existing type.
 */
export async function matchDateType(db: Prisma.TransactionClient | typeof prisma, workspaceId: string, dateType: { name: string | null; slug: string | null }) {
  const scope = { OR: [{ workspaceId, isSystem: false }, { workspaceId: null, isSystem: true }] };
  const orderBy: Prisma.DateTypeOrderByWithRelationInput[] = [{ isActive: "desc" }, { isSystem: "desc" }, { createdAt: "asc" }];
  const slug = dateType.slug?.trim() ?? "", name = dateType.name?.trim() ?? "";
  const bySlug = slug ? await db.dateType.findFirst({ where: { slug, ...scope }, orderBy }) : null;
  if (bySlug) return bySlug;
  return name ? db.dateType.findFirst({ where: { name: { equals: name, mode: "insensitive" }, ...scope }, orderBy }) : null;
}

async function resolveImportedDateType(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  triggerMode: MixTriggerMode,
  dateTypeName: string | null,
  dateTypeSlug: string | null
): Promise<string | null> {
  if (triggerMode !== "DATE_TRIGGERED") return null;
  const name = clean(dateTypeName, 120);
  const slug = clean(dateTypeSlug, 120);
  if (!name) throw new UserFacingError("This date-based Mix does not identify the date that starts it.");
  const existing = await matchDateType(tx, workspaceId, { name, slug });
  if (existing) {
    if (!existing.isActive) throw new UserFacingError(`Turn on the ${existing.name} date before adding this Mix.`);
    return existing.id;
  }

  const created = await tx.dateType.create({
    data: { workspaceId, scopeKey: workspaceId, name, slug: slugify(name), isSystem: false, isActive: true }
  });
  return created.id;
}

export async function importSharedMixIntoWorkspace(input: {
  workspaceId: string;
  actorUserId: string;
  sharedMixId: string;
}): Promise<{ mixId: string; importNumber: number }> {
  const workspace = await prisma.workspace.findFirst({ where: { id: input.workspaceId, ownerId: input.actorUserId }, select: { id: true } });
  if (!workspace) throw new UserFacingError("Business account not found.");

  return prisma.$transaction(async (tx) => {
    await lockLibrary(tx);
    const { shared, metadata } = await readPublishedLibrary(tx, input.sharedMixId);
    const steps = normalizeSharedMixSteps(shared.steps);
    const triggerMode = metadata?.triggerMode ?? "MANUAL_START";
    const dateTypeId = await resolveImportedDateType(
      tx,
      input.workspaceId,
      triggerMode,
      metadata?.dateTypeName ?? null,
      metadata?.dateTypeSlug ?? null
    );

    const mix = await tx.mix.create({
      data: {
        workspaceId: input.workspaceId,
        name: shared.title,
        description: shared.description,
        framework: shared.framework,
        category: shared.category,
        industry: shared.industry,
        triggerMode,
        dateTypeId,
        status: "DRAFT",
        durationDays: shared.durationDays,
        source: `SHARED_MIX:${shared.id}`
      }
    });

    for (const [index, step] of steps.entries()) {
      const template = await tx.stepTemplate.create({
        data: {
          workspaceId: input.workspaceId,
          name: step.name,
          channel: step.channel,
          versions: {
            create: {
              version: 1,
              subject: step.subject,
              body: step.body,
              script: step.script,
              longSms: step.longSms,
              includeOptOut: step.includeOptOut
            }
          }
        },
        include: { versions: true }
      });
      const version = template.versions[0];
      if (!version) throw new UserFacingError(`Follow-up #${index + 1} could not be created.`);
      await tx.mixStep.create({
        data: {
          mixId: mix.id,
          stepVersionId: version.id,
          dayOffset: step.dayOffset,
          sendTimeMinutes: step.sendTimeMinutes,
          sortOrder: index + 1,
          isActive: true
        }
      });
    }

    const priorImports = await tx.sharedMixImport.count({ where: { workspaceId: input.workspaceId, sharedMixId: shared.id } });
    const importRecord = await tx.sharedMixImport.create({
      data: {
        importKey: `${input.workspaceId}:${shared.id}:${randomUUID()}`,
        workspaceId: input.workspaceId,
        sharedMixId: shared.id,
        mixId: mix.id
      }
    });
    await tx.sharedMixImportMetadata.create({
      data: { importId: importRecord.id, sharedMixVersion: metadata?.version ?? 1 }
    });
    await tx.sharedMix.update({ where: { id: shared.id }, data: { importCount: { increment: 1 } } });
    await tx.auditLog.create({
      data: {
        workspaceId: input.workspaceId,
        actorType: "USER",
        actorUserId: input.actorUserId,
        action: "shared-mix.import",
        entityType: "SharedMix",
        entityId: shared.id,
        source: "templates.library",
        metadata: {
          mixId: mix.id,
          sharedMixVersion: metadata?.version ?? 1,
          repeatedImport: priorImports > 0
        }
      }
    });
    return { mixId: mix.id, importNumber: priorImports + 1 };
  });
}
