import { randomUUID } from "node:crypto";
import type {
  MixTriggerMode,
  Prisma,
  SharedMixStatus
} from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  MIX_TEMPLATE_CATEGORIES,
  MIX_TEMPLATE_INDUSTRIES,
  normalizeSharedMixSteps,
  type SharedMixStep
} from "@/lib/shared-mix";
import { slugify } from "@/lib/slug";

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
  if (!title) throw new Error("Give the ready-made plan a title.");
  if (description.length < 20) throw new Error("Describe when this plan is useful in at least 20 characters.");
  if (!(MIX_TEMPLATE_CATEGORIES as readonly string[]).includes(category)) throw new Error("Choose a supported plan category.");
  if (!(MIX_TEMPLATE_INDUSTRIES as readonly string[]).includes(industry)) throw new Error("Choose a supported industry.");
  return { title, description, category, industry, framework };
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
  if (!mix) throw new Error("Plan not found.");
  if (!mix.steps.length) throw new Error("Add at least one follow-up before publishing this plan.");

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

async function resolveImportedDateType(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  triggerMode: MixTriggerMode,
  dateTypeName: string | null,
  dateTypeSlug: string | null
): Promise<string | null> {
  if (triggerMode !== "DATE_TRIGGERED") return null;
  const name = clean(dateTypeName, 120);
  const slug = slugify(dateTypeSlug || name);
  if (!name || !slug) throw new Error("This date-based plan does not identify the date that starts it.");
  const existing = await tx.dateType.findFirst({
    where: {
      slug,
      OR: [{ workspaceId, isSystem: false }, { workspaceId: null, isSystem: true }]
    },
    orderBy: { isSystem: "desc" }
  });
  if (existing) {
    if (!existing.isActive) throw new Error(`Turn on the ${existing.name} date before adding this plan.`);
    return existing.id;
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
  const workspace = await prisma.workspace.findUnique({ where: { id: input.workspaceId }, select: { id: true } });
  if (!workspace) throw new Error("Business account not found.");

  return prisma.$transaction(async (tx) => {
    const shared = await tx.sharedMix.findFirst({ where: { id: input.sharedMixId, status: "APPROVED" } });
    if (!shared) throw new Error("This ready-made plan is not currently available.");
    const metadata = await tx.sharedMixMetadata.findUnique({ where: { sharedMixId: shared.id } });
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
      if (!version) throw new Error(`Follow-up #${index + 1} could not be created.`);
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

  return prisma.$transaction(async (tx) => {
    const baseData = {
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
        triggerMode: snapshot.triggerMode,
        dateTypeName: snapshot.dateTypeName,
        dateTypeSlug: snapshot.dateTypeSlug,
        publishedAt: new Date()
      },
      update: {
        sourceMixId: input.sourceMixId,
        triggerMode: snapshot.triggerMode,
        dateTypeName: snapshot.dateTypeName,
        dateTypeSlug: snapshot.dateTypeSlug,
        publishedAt: new Date(),
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
  status: SharedMixStatus;
  triggerMode: MixTriggerMode;
  dateTypeName: string | null;
  dateTypeSlug: string | null;
  steps: SharedMixStep[];
  featured: boolean;
}): Promise<void> {
  const metadata = validateMetadata(input.metadata);
  const steps = normalizeSharedMixSteps(input.steps);
  const allowedStatuses: SharedMixStatus[] = ["APPROVED", "UNPUBLISHED"];
  if (!allowedStatuses.includes(input.status)) throw new Error("Choose whether this plan is published or hidden.");
  if (input.triggerMode === "DATE_TRIGGERED" && (!input.dateTypeName || !input.dateTypeSlug)) {
    throw new Error("Date-based plans must identify the date that starts them.");
  }
  const shared = await prisma.sharedMix.findUnique({ where: { id: input.sharedMixId } });
  if (!shared) throw new Error("Ready-made plan not found.");
  await prisma.$transaction([
    prisma.sharedMix.update({
      where: { id: input.sharedMixId },
      data: {
        title: metadata.title,
        description: metadata.description,
        category: metadata.category,
        industry: metadata.industry,
        framework: metadata.framework,
        status: input.status,
        durationDays: Math.max(...steps.map((item) => Math.abs(item.dayOffset)), 0),
        steps: steps as unknown as Prisma.InputJsonValue
      }
    }),
    prisma.sharedMixMetadata.upsert({
      where: { sharedMixId: input.sharedMixId },
      create: {
        sharedMixId: input.sharedMixId,
        triggerMode: input.triggerMode,
        dateTypeName: input.triggerMode === "DATE_TRIGGERED" ? clean(input.dateTypeName, 120) : null,
        dateTypeSlug: input.triggerMode === "DATE_TRIGGERED" ? slugify(input.dateTypeSlug || input.dateTypeName || "") : null,
        featuredAt: input.featured ? new Date() : null,
        publishedAt: input.status === "APPROVED" ? new Date() : null
      },
      update: {
        triggerMode: input.triggerMode,
        dateTypeName: input.triggerMode === "DATE_TRIGGERED" ? clean(input.dateTypeName, 120) : null,
        dateTypeSlug: input.triggerMode === "DATE_TRIGGERED" ? slugify(input.dateTypeSlug || input.dateTypeName || "") : null,
        featuredAt: input.featured ? new Date() : null,
        publishedAt: input.status === "APPROVED" ? new Date() : undefined,
        version: { increment: 1 }
      }
    }),
    prisma.auditLog.create({
      data: {
        workspaceId: input.auditWorkspaceId,
        actorType: "ADMIN",
        actorUserId: input.actorUserId,
        action: "shared-mix.curate",
        entityType: "SharedMix",
        entityId: input.sharedMixId,
        source: "admin.templates",
        metadata: { status: input.status, featured: input.featured }
      }
    })
  ]);
}
