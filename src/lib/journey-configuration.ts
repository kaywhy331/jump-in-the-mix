import { type JourneyEventType } from "@/generated/prisma/client";
import { JOURNEY_EVENTS, journeyRuleRevision, type JourneyRuleDetails } from "@/lib/journey-types";
import { prisma } from "@/lib/prisma";

export class JourneyConfigurationError extends Error {}
export class JourneyRuleConflict extends JourneyConfigurationError {
  constructor(public eventType: string, public rule: JourneyRuleDetails | null) {
    super("This rule changed in another tab. Your entries are kept. Review the latest saved rule before saving again.");
  }
}

export async function configureJourneyRule(input: {
  workspaceId: string; actorUserId: string; fromStageId: string; toStageId: string;
  eventType: string; afterDays: number | null; expectedRule: string; remove?: boolean;
}) {
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "Workspace" WHERE id = ${input.workspaceId} FOR NO KEY UPDATE`;
    if (!JOURNEY_EVENTS.some(event => event.value === input.eventType)) throw new JourneyConfigurationError("Choose a business milestone or timing rule.");
    const eventType = input.eventType as JourneyEventType;
    const current = await tx.journeyRule.findFirst({
      where: { workspaceId: input.workspaceId, fromStageId: input.fromStageId, eventType },
      select: { id: true, eventType: true, toStageId: true, afterDays: true, enabled: true }
    });
    if (input.expectedRule !== journeyRuleRevision(current)) throw new JourneyRuleConflict(eventType, current);
    if (input.remove) {
      if (current) await tx.journeyRule.delete({ where: { id: current.id } });
    } else {
      if (input.fromStageId === input.toStageId) throw new JourneyConfigurationError("Choose a different destination stage.");
      const afterDays = eventType === "TIME_IN_STAGE" ? input.afterDays : null;
      if (eventType === "TIME_IN_STAGE" && (afterDays === null || !Number.isInteger(afterDays) || afterDays < 1 || afterDays > 3650)) throw new JourneyConfigurationError("Choose between 1 and 3,650 days.");
      const stages = await tx.journeyStage.count({ where: { workspaceId: input.workspaceId, id: { in: [input.fromStageId, input.toStageId] }, isActive: true } });
      if (stages !== 2) throw new JourneyConfigurationError("Choose available stages in this business.");
      await tx.journeyRule.upsert({
        where: { fromStageId_eventType: { fromStageId: input.fromStageId, eventType } },
        create: { workspaceId: input.workspaceId, fromStageId: input.fromStageId, toStageId: input.toStageId, eventType, afterDays },
        update: { toStageId: input.toStageId, afterDays, enabled: true }
      });
    }
    await tx.auditLog.create({ data: {
      workspaceId: input.workspaceId, actorType: "USER", actorUserId: input.actorUserId,
      action: "journey.rule.configure", entityType: "JourneyRule", entityId: current?.id ?? input.fromStageId,
      source: "settings.journey", beforeData: current ?? {},
      afterData: { fromStageId: input.fromStageId, toStageId: input.toStageId, eventType, afterDays: eventType === "TIME_IN_STAGE" ? input.afterDays : null, intent: input.remove ? "remove" : "save" }
    } });
  });
}
