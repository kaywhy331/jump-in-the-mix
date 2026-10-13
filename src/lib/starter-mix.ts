import { randomUUID } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { starterPlanForBusinessType, starterPlanForMarketingScenario } from "@/lib/vertical-plan-library";
import { starterPlanForReason } from "@/lib/journey-starts";

/** Whether a Mix's name is a starter's title, or that title numbered apart, such as "Title (2)" (D94). */
export function isStarterName(name: string, title: string): boolean {
  return name === title || /^ \(\d+\)$/.test(name.startsWith(title) ? name.slice(title.length) : "");
}

/** The starter Mixes onboarding may reuse for a title, so its preview can show the Mix the follow-up will use: only those
 * on and starting from the follow-up date, so the preview's dates hold, named with the title or the title numbered apart
 * (D94, PRV-03). Read them oldest first and keep the first whose name passes `isStarterName`. */
export function reusableStarterMixWhere(workspaceId: string, title: string): Prisma.MixWhereInput {
  return { workspaceId, source: "STARTER", status: "ACTIVE", triggerMode: "DATE_TRIGGERED", dateType: { is: { scopeKey: "system", slug: "follow-up" } }, OR: [{ name: title }, { name: { startsWith: `${title} (` } }] };
}

export async function ensureStarterMix(workspaceId: string, businessType?: string | null, reason?: string, marketingScenario?: string | null, transaction?: Prisma.TransactionClient) {
  const draft = marketingScenario ? starterPlanForMarketingScenario(marketingScenario) ?? starterPlanForReason(businessType, reason ?? "General follow-up") : reason ? starterPlanForReason(businessType, reason) : starterPlanForBusinessType(businessType);
  const prepare = async (tx: Prisma.TransactionClient) => {
    // Use the caller's transaction when onboarding also saves its receipt and first person.
    // Other callers take the same workspace lock before checking for an existing starter.
    await tx.$queryRaw`SELECT id FROM "Workspace" WHERE id = ${workspaceId} FOR NO KEY UPDATE`;
    // Setup with a reason reuses only a starter it can preview (D94). Without one (Skip for now, the starter button) any
    // starter still in use stands, as before: those callers show no preview, so nothing new is made beside it.
    const existing = reason || marketingScenario
      ? (await tx.mix.findMany({ where: reusableStarterMixWhere(workspaceId, draft.title), orderBy: { createdAt: "asc" } })).find(mix => isStarterName(mix.name, draft.title))
      : await tx.mix.findFirst({ where: { workspaceId, source: "STARTER", status: { not: "ARCHIVED" } }, orderBy: { createdAt: "asc" } });
    if (existing) return existing;
    const followUp = await tx.dateType.findFirst({ where: { scopeKey: "system", slug: "follow-up", isActive: true } });
    if (!followUp) throw new Error("System Follow-up date type is missing. Run the seed command again.");
    // A starter setup can't reuse, such as one the owner paused or set to start another way, keeps its name; the new one
    // is told apart from it, and from any other Mix still in use (D94).
    const taken = new Set((await tx.mix.findMany({ where: { workspaceId, status: { not: "ARCHIVED" }, name: { startsWith: draft.title } }, select: { name: true } })).map(item => item.name));
    let name = draft.title;
    for (let number = 2; taken.has(name); number++) name = `${draft.title} (${number})`;
    const mixId = randomUUID();
    const mix = await tx.mix.create({
      data: {
        id: mixId,
        workspaceId,
        name,
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
        data: { workspaceId, name: `${name} — ${step.name}`, channel: step.channel }
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
