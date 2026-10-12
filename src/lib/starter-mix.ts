import { randomUUID } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { starterPlanForBusinessType, starterPlanForMarketingScenario } from "@/lib/vertical-plan-library";
import { starterPlanForReason } from "@/lib/journey-starts";

/** The starter Mix onboarding reuses for a title, so its preview can show the Mix the follow-up will use. */
export function existingStarterMixWhere(workspaceId: string, title?: string): Prisma.MixWhereInput {
  return { workspaceId, source: "STARTER", status: { not: "ARCHIVED" }, ...(title ? { name: title } : {}) };
}

export async function ensureStarterMix(workspaceId: string, businessType?: string | null, reason?: string, marketingScenario?: string | null, transaction?: Prisma.TransactionClient) {
  const draft = marketingScenario ? starterPlanForMarketingScenario(marketingScenario) ?? starterPlanForReason(businessType, reason ?? "General follow-up") : reason ? starterPlanForReason(businessType, reason) : starterPlanForBusinessType(businessType);
  const prepare = async (tx: Prisma.TransactionClient) => {
    // Use the caller's transaction when onboarding also saves its receipt and first person.
    // Other callers take the same workspace lock before checking for an existing starter.
    await tx.$queryRaw`SELECT id FROM "Workspace" WHERE id = ${workspaceId} FOR NO KEY UPDATE`;
    const existing = await tx.mix.findFirst({
      where: existingStarterMixWhere(workspaceId, (reason || marketingScenario) ? draft.title : undefined),
      orderBy: { createdAt: "asc" }
    });
    if (existing) return existing;
    const followUp = await tx.dateType.findFirst({ where: { scopeKey: "system", slug: "follow-up", isActive: true } });
    if (!followUp) throw new Error("System Follow-up date type is missing. Run the seed command again.");
    const mixId = randomUUID();
    const mix = await tx.mix.create({
      data: {
        id: mixId,
        workspaceId,
        name: draft.title,
        description: draft.description,
        framework: draft.framework,
        category: draft.category,
        industry: draft.industry,
        triggerMode: "DATE_TRIGGERED",
        dateTypeId: followUp.id,
        status: "ACTIVE",
        durationDays: draft.durationDays,
        source: "STARTER"
      }
    });

    for (const [index, step] of draft.steps.entries()) {
      const template = await tx.stepTemplate.create({
        data: { workspaceId, name: `${draft.title} — ${step.name}`, channel: step.channel }
      });
      const version = await tx.stepVersion.create({
        data: {
          stepTemplateId: template.id,
          version: 1,
          subject: step.subject ?? null,
          body: step.body ?? null,
          script: step.script ?? null
        }
      });
      await tx.mixStep.create({
        data: { mixId, stepVersionId: version.id, dayOffset: step.dayOffset, sendTimeMinutes: step.sendTimeMinutes, sortOrder: index + 1 }
      });
    }
    return mix;
  };
  return transaction ? prepare(transaction) : prisma.$transaction(prepare);
}
