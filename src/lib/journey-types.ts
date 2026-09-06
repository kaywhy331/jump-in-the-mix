export const JOURNEY_EVENTS = [
  { value: "CONTACT_RECEIVED", label: "A contact or inquiry arrives" },
  { value: "CONVERSATION_STARTED", label: "A conversation starts" },
  { value: "MEETING_SCHEDULED", label: "A meeting is scheduled" },
  { value: "SALE_CONFIRMED", label: "A sale is confirmed" },
  { value: "WORK_COMPLETED", label: "The work is completed" },
  { value: "PLAN_COMPLETED", label: "The stage’s plan is completed" },
  { value: "TIME_IN_STAGE", label: "Time passes in this stage" }
] as const;
export const DEFAULT_JOURNEY_STAGES = ["Lead", "Prospect", "Client", "Retention"];
export function journeyEventLabel(value: string) { return JOURNEY_EVENTS.find(event => event.value === value)?.label ?? "Stage changed"; }

export type JourneyRuleDetails = { id: string; eventType: string; toStageId: string; afterDays: number | null; enabled: boolean };
export type JourneyRuleFormState = { error: string; saved?: boolean; conflict?: { eventType: string; rule: JourneyRuleDetails | null } };
export function journeyRuleRevision(rule: JourneyRuleDetails | null | undefined) {
  return JSON.stringify(rule ? [rule.id, rule.eventType, rule.toStageId, rule.afterDays, rule.enabled] : null);
}
export function journeyRuleWhen(eventType: string, afterDays: number | null) {
  return eventType === "TIME_IN_STAGE" && afterDays !== null
    ? `After ${afterDays} ${afterDays === 1 ? "day" : "days"} in this stage`
    : journeyEventLabel(eventType);
}
