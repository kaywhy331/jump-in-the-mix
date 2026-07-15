import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { generateMixDraft } from "@/lib/mix-generator";

export async function ensureStarterMix(workspaceId: string) {
  const existing = await prisma.mix.findFirst({
    where: { workspaceId, source: "STARTER", status: { not: "ARCHIVED" } },
    orderBy: { createdAt: "asc" }
  });
  if (existing) return existing;

  const followUp = await prisma.dateType.findFirst({ where: { scopeKey: "system", slug: "follow-up", isActive: true } });
  if (!followUp) throw new Error("System Follow-up date type is missing. Run the seed command again.");

  const draft = generateMixDraft({
    objective: "Simple Follow-Up",
    tone: "Warm",
    durationDays: 9,
    touches: 3,
    channels: ["EMAIL", "SMS", "PHONE_CALL"],
    productPlaceholder: "{{My Product 1}}"
  });
  const mixId = randomUUID();

  return prisma.$transaction(async (tx) => {
    const mix = await tx.mix.create({
      data: {
        id: mixId,
        workspaceId,
        name: draft.name,
        description: draft.description,
        framework: "Starter",
        category: "Business",
        triggerMode: "DATE_TRIGGERED",
        dateTypeId: followUp.id,
        status: "ACTIVE",
        durationDays: 9,
        source: "STARTER"
      }
    });

    for (const [index, step] of draft.steps.entries()) {
      const template = await tx.stepTemplate.create({
        data: { workspaceId, name: `${draft.name} — ${step.name}`, channel: step.channel }
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
        data: { mixId, stepVersionId: version.id, dayOffset: step.dayOffset, sortOrder: index + 1 }
      });
    }
    return mix;
  });
}
