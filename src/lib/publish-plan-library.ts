import { prisma } from "@/lib/prisma";
import type { ReadyMadePlan } from "@/lib/plan-library-types";
import { validateLibraryContent } from "@/lib/library-content";
import { applyLibraryPublication, libraryJson, lockLibrary } from "@/lib/library-store";
import type { Prisma } from "@/generated/prisma/client";
import { normalizeSharedMixSteps } from "@/lib/shared-mix";

// Install reviewed shipped plans once. Setup must not overwrite a staff draft,
// republish a hidden mix, or undo an administrator's rollback.
export async function publishReadyMadePlans(plans: readonly ReadyMadePlan[]) {
  const result = { created: 0, updated: 0, unchanged: 0 };
  for (const plan of plans) {
    const outcome = await prisma.$transaction(async tx => {
      await lockLibrary(tx);
      if (await tx.sharedMix.findUnique({ where: { id: plan.id }, select: { id: true } })) return "unchanged" as const;
      const content = validateLibraryContent({ title: plan.title, description: plan.description, category: plan.category, industry: plan.industry,
        framework: plan.framework, triggerMode: plan.triggerMode, dateTypeName: plan.dateTypeName, dateTypeSlug: plan.dateTypeSlug, featured: plan.featured, steps: normalizeSharedMixSteps(plan.steps) });
      await tx.sharedMix.create({ data: { id: plan.id, title: content.title, description: content.description, category: content.category, industry: content.industry, framework: content.framework, durationDays: plan.durationDays, steps: content.steps as unknown as Prisma.InputJsonValue, status: "UNPUBLISHED" } });
      await tx.sharedMixMetadata.create({ data: { sharedMixId: plan.id } });
      await tx.sharedMixRevision.create({ data: { sharedMixId: plan.id, version: 1, snapshot: libraryJson(content), reason: "Initial installation of reviewed application catalog." } });
      await applyLibraryPublication(tx, plan.id, 1, content);
      await tx.sharedMixRelease.create({ data: { sharedMixId: plan.id, version: 1, action: "PUBLISH", controlRevision: 1, reason: "Initial installation of reviewed application catalog." } });
      return "created" as const;
    });
    result[outcome] += 1;
  }
  return result;
}
