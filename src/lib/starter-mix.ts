import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { starterPlanForBusinessType, starterPlanForMarketingScenario, starterPlanForOnboarding } from "@/lib/vertical-plan-library";

export async function ensureStarterMix(workspaceId: string, businessType?: string | null, reason?: string, marketingScenario?: string | null) {
  const draft = marketingScenario ? starterPlanForMarketingScenario(marketingScenario) ?? starterPlanForOnboarding(businessType, reason ?? "General follow-up") : reason ? starterPlanForOnboarding(businessType, reason) : starterPlanForBusinessType(businessType);
  const existing = await prisma.mix.findFirst({
    where: { workspaceId, source: "STARTER", status: { not: "ARCHIVED" }, ...((reason || marketingScenario) ? { name: draft.title } : {}) },
    orderBy: { createdAt: "asc" }
  });
  if (existing) return existing;

  const followUp = await prisma.dateType.findFirst({ where: { scopeKey: "system", slug: "follow-up", isActive: true } });
  if (!followUp) throw new Error("System Follow-up date type is missing. Run the seed command again.");

  const mixId = randomUUID();

  return prisma.$transaction(async (tx) => {
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
  });
}
