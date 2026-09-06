import { isDeepStrictEqual } from "node:util";
import { prisma } from "@/lib/prisma";
import type { ReadyMadePlan } from "@/lib/plan-library-types";
import { normalizeSharedMixSteps } from "@/lib/shared-mix";

// Operator/seed entry point: update library originals, never a customer's copy.
export async function publishReadyMadePlans(plans: readonly ReadyMadePlan[]) {
  const result = { created: 0, updated: 0, unchanged: 0 };
  for (const plan of plans) {
    normalizeSharedMixSteps(plan.steps);
    const outcome = await prisma.$transaction(async tx => {
      const [existing, metadata] = await Promise.all([
        tx.sharedMix.findUnique({ where: { id: plan.id } }),
        tx.sharedMixMetadata.findUnique({ where: { sharedMixId: plan.id } })
      ]);
      const content = { title: plan.title, description: plan.description, category: plan.category, industry: plan.industry, framework: plan.framework, durationDays: plan.durationDays, steps: plan.steps, status: "APPROVED" as const };
      const contentChanged = !existing || Object.entries(content).some(([key, value]) => !isDeepStrictEqual(existing[key as keyof typeof existing], value));
      const metadataChanged = !metadata || metadata.triggerMode !== plan.triggerMode || metadata.dateTypeName !== plan.dateTypeName || metadata.dateTypeSlug !== plan.dateTypeSlug || Boolean(metadata.featuredAt) !== plan.featured;
      if (!contentChanged && !metadataChanged) return "unchanged" as const;
      await tx.sharedMix.upsert({ where: { id: plan.id }, create: { id: plan.id, ...content }, update: content });
      const now = new Date();
      const details = { triggerMode: plan.triggerMode, dateTypeName: plan.dateTypeName, dateTypeSlug: plan.dateTypeSlug, featuredAt: plan.featured ? metadata?.featuredAt ?? now : null, publishedAt: metadata?.publishedAt ?? now };
      await tx.sharedMixMetadata.upsert({
        where: { sharedMixId: plan.id },
        create: { sharedMixId: plan.id, ...details },
        update: { ...details, version: { increment: 1 } }
      });
      return existing ? "updated" as const : "created" as const;
    });
    result[outcome] += 1;
  }
  return result;
}
