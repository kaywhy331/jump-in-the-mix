import { randomUUID } from "node:crypto";
import type {
  MixTriggerMode,
  Prisma,
  SharedMixReviewState,
  SharedMixStatus
} from "@/generated/prisma/client";
import { PLAN_LIMITS } from "@/lib/plans";
import { prisma } from "@/lib/prisma";
import {
  MIX_TEMPLATE_CATEGORIES,
  MIX_TEMPLATE_INDUSTRIES,
  normalizeSharedMixSteps,
  type SharedMixStep
} from "@/lib/shared-mix";
import { slugify } from "@/lib/slug";

const ACTIVE_SHARE_STATES: SharedMixReviewState[] = ["PENDING", "APPROVED", "FLAGGED"];

export type TemplateMetadata = {
  title: string;
  description: string;
  category: string;
  industry: string;
  framework: string | null;
};

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

function validateMetadata(input: TemplateMetadata): TemplateMetadata {
  const title = clean(input.title, 160);
  const description = clean(input.description, 1200);
  const category = clean(input.category, 120);
  const industry = clean(input.industry, 120);
  const framework = clean(input.framework, 160) || null;
  if (!title) throw new Error("Give the Mix Template a title.");
  if (description.length < 20) throw new Error("Describe when this Mix Template is useful in at least 20 characters.");
  if (!(MIX_TEMPLATE_CATEGORIES as readonly string[]).includes(category)) throw new Error("Choose a supported Mix Template category.");
  if (!(MIX_TEMPLATE_INDUSTRIES as readonly string[]).includes(industry)) throw new Error("Choose a supported Mix Template industry.");
  return { title, description, category, industry, framework };
}

function publicStatus(reviewState: SharedMixReviewState): SharedMixStatus {
  if (reviewState === "APPROVED") return "APPROVED";
  if (reviewState === "REJECTED") return "REJECTED";
  if (reviewState === "UNPUBLISHED") return "UNPUBLISHED";
  return "PENDING";
}

function reviewStateFromStatus(status: SharedMixStatus): SharedMixReviewState {
  if (status === "APPROVED") return "APPROVED";
  if (status === "REJECTED") return "REJECTED";
  if (status === "UNPUBLISHED") return "UNPUBLISHED";
  return "PENDING";
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
  if (!mix) throw new Error("Mix not found.");
  if (!mix.steps.length) throw new Error("Add at least one reusable Jump before sharing this Mix.");

  const steps: SharedMixStep[] = mix.steps.map((item, index) => ({
    name: item.stepVersion.stepTemplate.name || `Jump #${index + 1}`,
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

export async function publishWorkspaceMix(input: {
  workspaceId: string;
  actorUserId: string;
  mixId: string;
  metadata: TemplateMetadata;
}): Promise<{ sharedMixId: string; reviewState: SharedMixReviewState }> {
  const metadata = validateMetadata(input.metadata);
  const [workspace, contributorProfile, existingMetadata, snapshot] = await Promise.all([
    prisma.workspace.findUnique({ where: { id: input.workspaceId }, select: { planTier: true } }),
    prisma.sharedMixContributorProfile.findUnique({ where: { workspaceId: input.workspaceId } }),
    prisma.sharedMixMetadata.findUnique({
      where: {
        publisherWorkspaceId_publisherMixId: {
          publisherWorkspaceId: input.workspaceId,
          publisherMixId: input.mixId
        }
      }
    }),
    snapshotWorkspaceMix(input.workspaceId, input.mixId)
  ]);
  if (!workspace) throw new Error("Workspace not found.");
  if (!contributorProfile?.enabled || !contributorProfile.displayName?.trim()) {
    throw new Error("Complete and enable your Community Public Profile before sharing a Mix.");
  }

  if (!existingMetadata || !ACTIVE_SHARE_STATES.includes(existingMetadata.reviewState)) {
    const activeShares = await prisma.sharedMixMetadata.count({
      where: {
        publisherWorkspaceId: input.workspaceId,
        isPlatform: false,
        reviewState: { in: ACTIVE_SHARE_STATES }
      }
    });
    const limit = PLAN_LIMITS[workspace.planTier].sharedMixes;
    if (Number.isFinite(limit) && activeShares >= limit) {
      throw new Error(`Your ${workspace.planTier.toLowerCase()} plan allows ${limit} shared Mix${limit === 1 ? "" : "es"}.`);
    }
  }

  return prisma.$transaction(async (tx) => {
    const baseData = {
      publisherWorkspaceId: input.workspaceId,
      title: metadata.title,
      description: metadata.description,
      category: metadata.category,
      industry: metadata.industry,
      framework: metadata.framework,
      durationDays: snapshot.durationDays,
      steps: snapshot.steps as unknown as Prisma.InputJsonValue,
      status: "PENDING" as SharedMixStatus
    };
    const shared = existingMetadata
      ? await tx.sharedMix.update({ where: { id: existingMetadata.sharedMixId }, data: baseData })
      : await tx.sharedMix.create({ data: baseData });
    const nextMetadata = existingMetadata
      ? await tx.sharedMixMetadata.update({
          where: { sharedMixId: shared.id },
          data: {
            publisherWorkspaceId: input.workspaceId,
            publisherMixId: input.mixId,
            isPlatform: false,
            triggerMode: snapshot.triggerMode,
            dateTypeName: snapshot.dateTypeName,
            dateTypeSlug: snapshot.dateTypeSlug,
            version: { increment: 1 },
            reviewState: "PENDING",
            moderationNote: null,
            reviewedAt: null,
            reviewedByUserId: null,
            publishedAt: new Date()
          }
        })
      : await tx.sharedMixMetadata.create({
          data: {
            sharedMixId: shared.id,
            publisherWorkspaceId: input.workspaceId,
            publisherMixId: input.mixId,
            isPlatform: false,
            triggerMode: snapshot.triggerMode,
            dateTypeName: snapshot.dateTypeName,
            dateTypeSlug: snapshot.dateTypeSlug,
            reviewState: "PENDING",
            publishedAt: new Date()
          }
        });
    await tx.auditLog.create({
      data: {
        workspaceId: input.workspaceId,
        actorType: "USER",
        actorUserId: input.actorUserId,
        action: existingMetadata ? "shared-mix.resubmit" : "shared-mix.submit",
        entityType: "SharedMix",
        entityId: shared.id,
        source: "mixes.share",
        metadata: { mixId: input.mixId, version: nextMetadata.version }
      }
    });
    return { sharedMixId: shared.id, reviewState: nextMetadata.reviewState };
  });
}

export async function unpublishWorkspaceMix(input: {
  workspaceId: string;
  actorUserId: string;
  mixId: string;
}): Promise<void> {
  const metadata = await prisma.sharedMixMetadata.findUnique({
    where: {
      publisherWorkspaceId_publisherMixId: {
        publisherWorkspaceId: input.workspaceId,
        publisherMixId: input.mixId
      }
    }
  });
  if (!metadata || metadata.isPlatform) throw new Error("Shared Mix not found.");
  await prisma.$transaction([
    prisma.sharedMix.update({ where: { id: metadata.sharedMixId }, data: { status: "UNPUBLISHED" } }),
    prisma.sharedMixMetadata.update({ where: { sharedMixId: metadata.sharedMixId }, data: { reviewState: "UNPUBLISHED" } }),
    prisma.auditLog.create({
      data: {
        workspaceId: input.workspaceId,
        actorType: "USER",
        actorUserId: input.actorUserId,
        action: "shared-mix.unpublish",
        entityType: "SharedMix",
        entityId: metadata.sharedMixId,
        source: "mixes.share"
      }
    })
  ]);
}

async function resolveImportedDateType(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  planTier: "FREE" | "PLUS" | "PRO",
  triggerMode: MixTriggerMode,
  dateTypeName: string | null,
  dateTypeSlug: string | null
): Promise<string | null> {
  if (triggerMode !== "DATE_TRIGGERED") return null;
  const name = clean(dateTypeName, 120);
  const slug = slugify(dateTypeSlug || name);
  if (!name || !slug) throw new Error("This date-triggered Mix Template does not identify its Target Jump Date Type.");
  const existing = await tx.dateType.findFirst({
    where: {
      slug,
      OR: [{ workspaceId, isSystem: false }, { workspaceId: null, isSystem: true }]
    },
    orderBy: { isSystem: "desc" }
  });
  if (existing) {
    if (!existing.isActive) throw new Error(`Activate the ${existing.name} Jump Date Type or upgrade before importing this Mix.`);
    return existing.id;
  }

  const activeCount = await tx.dateType.count({ where: { workspaceId, isSystem: false, isActive: true } });
  const limit = PLAN_LIMITS[planTier].customDateTypes;
  if (Number.isFinite(limit) && activeCount >= limit) {
    throw new Error(`This Mix needs a new ${name} Jump Date Type, but your plan's active custom-type limit is full.`);
  }
  const created = await tx.dateType.create({
    data: { workspaceId, scopeKey: workspaceId, name, slug, isSystem: false, isActive: true }
  });
  return created.id;
}

export async function importSharedMixIntoWorkspace(input: {
  workspaceId: string;
  actorUserId: string;
  sharedMixId: string;
}): Promise<{ mixId: string; importNumber: number }> {
  const workspace = await prisma.workspace.findUnique({ where: { id: input.workspaceId }, select: { planTier: true } });
  if (!workspace) throw new Error("Workspace not found.");

  return prisma.$transaction(async (tx) => {
    const shared = await tx.sharedMix.findFirst({ where: { id: input.sharedMixId, status: "APPROVED" } });
    if (!shared) throw new Error("This Mix Template is not currently available.");
    const metadata = await tx.sharedMixMetadata.findUnique({ where: { sharedMixId: shared.id } });
    const steps = normalizeSharedMixSteps(shared.steps);
    const triggerMode = metadata?.triggerMode ?? "MANUAL_START";
    const dateTypeId = await resolveImportedDateType(
      tx,
      input.workspaceId,
      workspace.planTier,
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
      if (!version) throw new Error(`Jump #${index + 1} could not be created.`);
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

export async function toggleSharedMixVote(input: {
  workspaceId: string;
  actorUserId: string;
  sharedMixId: string;
}): Promise<{ voted: boolean; voteCount: number }> {
  return prisma.$transaction(async (tx) => {
    const shared = await tx.sharedMix.findFirst({
      where: { id: input.sharedMixId, status: "APPROVED" },
      select: { id: true, status: true, publisherWorkspaceId: true, createdAt: true }
    });
    if (!shared) throw new Error("This Mix Template is not currently available.");
    if (shared.publisherWorkspaceId === input.workspaceId) throw new Error("You cannot vote for your own Mix contribution.");
    const existing = await tx.sharedMixVote.findUnique({
      where: { workspaceId_sharedMixId: { workspaceId: input.workspaceId, sharedMixId: input.sharedMixId } }
    });
    let voted: boolean;
    if (existing) {
      await tx.sharedMixVote.delete({ where: { id: existing.id } });
      await tx.sharedMixMetadata.updateMany({
        where: { sharedMixId: shared.id, voteCount: { gt: 0 } },
        data: { voteCount: { decrement: 1 } }
      });
      voted = false;
    } else {
      await tx.sharedMixVote.create({ data: { workspaceId: input.workspaceId, sharedMixId: input.sharedMixId } });
      await tx.sharedMixMetadata.upsert({
        where: { sharedMixId: shared.id },
        create: {
          sharedMixId: shared.id,
          isPlatform: shared.publisherWorkspaceId === null,
          reviewState: reviewStateFromStatus(shared.status),
          publishedAt: shared.createdAt,
          voteCount: 1
        },
        update: { voteCount: { increment: 1 } }
      });
      voted = true;
    }
    const current = await tx.sharedMixMetadata.findUnique({ where: { sharedMixId: shared.id }, select: { voteCount: true } });
    await tx.auditLog.create({
      data: {
        workspaceId: input.workspaceId,
        actorType: "USER",
        actorUserId: input.actorUserId,
        action: voted ? "shared-mix.vote" : "shared-mix.unvote",
        entityType: "SharedMix",
        entityId: shared.id,
        source: "templates.library"
      }
    });
    return { voted, voteCount: current?.voteCount ?? 0 };
  });
}

export async function createOrRefreshPlatformSharedMix(input: {
  sourceWorkspaceId: string;
  actorUserId: string;
  sourceMixId: string;
  sharedMixId?: string | null;
  metadata: TemplateMetadata;
}): Promise<string> {
  const metadata = validateMetadata(input.metadata);
  const snapshot = await snapshotWorkspaceMix(input.sourceWorkspaceId, input.sourceMixId);
  const existing = input.sharedMixId
    ? await prisma.sharedMix.findUnique({ where: { id: input.sharedMixId } })
    : null;
  if (existing) {
    const existingMetadata = await prisma.sharedMixMetadata.findUnique({ where: { sharedMixId: existing.id } });
    if (existingMetadata && !existingMetadata.isPlatform) throw new Error("Community submissions cannot be converted into platform templates.");
  }

  return prisma.$transaction(async (tx) => {
    const baseData = {
      publisherWorkspaceId: null,
      title: metadata.title,
      description: metadata.description,
      category: metadata.category,
      industry: metadata.industry,
      framework: metadata.framework,
      durationDays: snapshot.durationDays,
      steps: snapshot.steps as unknown as Prisma.InputJsonValue,
      status: "APPROVED" as SharedMixStatus
    };
    const template = existing
      ? await tx.sharedMix.update({ where: { id: existing.id }, data: baseData })
      : await tx.sharedMix.create({ data: baseData });
    const metadataRow = await tx.sharedMixMetadata.upsert({
      where: { sharedMixId: template.id },
      create: {
        sharedMixId: template.id,
        sourceMixId: input.sourceMixId,
        isPlatform: true,
        triggerMode: snapshot.triggerMode,
        dateTypeName: snapshot.dateTypeName,
        dateTypeSlug: snapshot.dateTypeSlug,
        reviewState: "APPROVED",
        publishedAt: new Date(),
        reviewedAt: new Date(),
        reviewedByUserId: input.actorUserId
      },
      update: {
        sourceMixId: input.sourceMixId,
        isPlatform: true,
        triggerMode: snapshot.triggerMode,
        dateTypeName: snapshot.dateTypeName,
        dateTypeSlug: snapshot.dateTypeSlug,
        reviewState: "APPROVED",
        publishedAt: new Date(),
        reviewedAt: new Date(),
        reviewedByUserId: input.actorUserId,
        moderationNote: null,
        version: { increment: 1 }
      }
    });
    await tx.auditLog.create({
      data: {
        workspaceId: input.sourceWorkspaceId,
        actorType: "ADMIN",
        actorUserId: input.actorUserId,
        action: existing ? "shared-mix.platform.refresh" : "shared-mix.platform.create",
        entityType: "SharedMix",
        entityId: template.id,
        source: "admin.templates",
        metadata: { sourceMixId: input.sourceMixId, version: metadataRow.version }
      }
    });
    return template.id;
  });
}

export async function updateSharedMixAsAdmin(input: {
  actorUserId: string;
  auditWorkspaceId: string;
  sharedMixId: string;
  metadata: TemplateMetadata;
  reviewState: SharedMixReviewState;
  triggerMode: MixTriggerMode;
  dateTypeName: string | null;
  dateTypeSlug: string | null;
  steps: SharedMixStep[];
  moderationNote: string | null;
  featured: boolean;
}): Promise<void> {
  const metadata = validateMetadata(input.metadata);
  const steps = normalizeSharedMixSteps(input.steps);
  const allowedStates: SharedMixReviewState[] = ["PENDING", "APPROVED", "REJECTED", "UNPUBLISHED", "FLAGGED"];
  if (!allowedStates.includes(input.reviewState)) throw new Error("Choose a valid moderation status.");
  if (input.triggerMode === "DATE_TRIGGERED" && (!input.dateTypeName || !input.dateTypeSlug)) {
    throw new Error("Date-triggered templates require a Target Jump Date Type name and slug.");
  }
  const shared = await prisma.sharedMix.findUnique({ where: { id: input.sharedMixId } });
  if (!shared) throw new Error("Mix Template not found.");
  await prisma.$transaction([
    prisma.sharedMix.update({
      where: { id: input.sharedMixId },
      data: {
        title: metadata.title,
        description: metadata.description,
        category: metadata.category,
        industry: metadata.industry,
        framework: metadata.framework,
        status: publicStatus(input.reviewState),
        durationDays: Math.max(...steps.map((item) => Math.abs(item.dayOffset)), 0),
        steps: steps as unknown as Prisma.InputJsonValue
      }
    }),
    prisma.sharedMixMetadata.upsert({
      where: { sharedMixId: input.sharedMixId },
      create: {
        sharedMixId: input.sharedMixId,
        publisherWorkspaceId: shared.publisherWorkspaceId,
        isPlatform: shared.publisherWorkspaceId === null,
        triggerMode: input.triggerMode,
        dateTypeName: input.triggerMode === "DATE_TRIGGERED" ? clean(input.dateTypeName, 120) : null,
        dateTypeSlug: input.triggerMode === "DATE_TRIGGERED" ? slugify(input.dateTypeSlug || input.dateTypeName || "") : null,
        reviewState: input.reviewState,
        moderationNote: clean(input.moderationNote, 1200) || null,
        featuredAt: input.featured ? new Date() : null,
        publishedAt: input.reviewState === "APPROVED" ? new Date() : null,
        reviewedAt: new Date(),
        reviewedByUserId: input.actorUserId
      },
      update: {
        triggerMode: input.triggerMode,
        dateTypeName: input.triggerMode === "DATE_TRIGGERED" ? clean(input.dateTypeName, 120) : null,
        dateTypeSlug: input.triggerMode === "DATE_TRIGGERED" ? slugify(input.dateTypeSlug || input.dateTypeName || "") : null,
        reviewState: input.reviewState,
        moderationNote: clean(input.moderationNote, 1200) || null,
        featuredAt: input.featured ? new Date() : null,
        publishedAt: input.reviewState === "APPROVED" ? new Date() : undefined,
        reviewedAt: new Date(),
        reviewedByUserId: input.actorUserId,
        version: { increment: 1 }
      }
    }),
    prisma.auditLog.create({
      data: {
        workspaceId: input.auditWorkspaceId,
        actorType: "ADMIN",
        actorUserId: input.actorUserId,
        action: "shared-mix.moderate",
        entityType: "SharedMix",
        entityId: input.sharedMixId,
        source: "admin.templates",
        metadata: { reviewState: input.reviewState, featured: input.featured }
      }
    })
  ]);
}
