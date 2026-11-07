type Status = "DRAFT" | "ACTIVE" | "PAUSED";
type Trigger = "DATE_TRIGGERED" | "MANUAL_START" | "BROADCAST" | "AFTER_MIX";

/** Only saved, active audience assignments belong in groupIds. */
export type MixEditState = {
  status: Status;
  triggerMode: Trigger;
  dateTypeId?: string | null;
  everyone: boolean;
  groupIds: readonly string[];
};

export type MixEditKind = "wording-only" | "future-starts" | "activation" | "resume" | "audience-widening" | "trigger-reschedule";

/**
 * Shared by the editor and the save action. Multiple consequences can coexist; a resume
 * must not hide a trigger change or the tags added while paused. Wording-only is supplied
 * only when the editor's full change set consists of Beat wording fields.
 */
export function classifyMixEdit(saved: MixEditState | null, next: MixEditState, options: {
  resumeGroupIds?: readonly string[];
  changedFields?: readonly string[];
} = {}) {
  const turningOn = next.status === "ACTIVE" && (!saved || saved.status === "DRAFT");
  const resuming = next.status === "ACTIVE" && saved?.status === "PAUSED";
  const addsEveryone = next.everyone && !saved?.everyone;
  const addedGroupIds = next.groupIds.filter(id => !saved?.groupIds.includes(id));
  const pausedGroupIds = resuming ? next.groupIds.filter(id => options.resumeGroupIds?.includes(id)) : [];
  const startedGroupIds = [...new Set([...addedGroupIds, ...pausedGroupIds])];
  const widens = next.status === "ACTIVE" && (addsEveryone || startedGroupIds.length > 0);
  const audienceChosen = next.everyone || next.groupIds.length > 0;
  const retriggers = next.status === "ACTIVE" && (saved?.status === "ACTIVE" || saved?.status === "PAUSED")
    && next.triggerMode !== "AFTER_MIX" && audienceChosen
    && (saved.triggerMode !== next.triggerMode || (next.triggerMode === "DATE_TRIGGERED" && (saved.dateTypeId ?? "") !== (next.dateTypeId ?? "")));
  const everyoneIntake = resuming && next.everyone && !addsEveryone;
  const starts = turningOn ? (audienceChosen ? { all: next.everyone, groupIds: [...next.groupIds] } : null)
    : next.status === "ACTIVE" && (widens || everyoneIntake) ? { all: addsEveryone, groupIds: startedGroupIds, resume: everyoneIntake } : null;
  const kinds: MixEditKind[] = [];
  if (turningOn) kinds.push("activation");
  if (resuming) kinds.push("resume");
  if (widens && !turningOn) kinds.push("audience-widening");
  if (retriggers) kinds.push("trigger-reschedule");
  if (!kinds.length) {
    const wordingOnly = saved && options.changedFields?.length && options.changedFields.every(field => /^(inline(Name|Subject|Body|Script)|variant(TextBody|EmailSubject|EmailBody|CallScript))-\d+$/.test(field));
    kinds.push(wordingOnly ? "wording-only" : "future-starts");
  }
  return { kinds, turningOn, resuming, widens, retriggers, pausedGroupIds, starts, startsPeople: turningOn || resuming || widens || retriggers };
}

/** Describe the saved outcome, independently of whether the owner first sees a review. */
export function mixEditConsequenceText(consequence: ReturnType<typeof classifyMixEdit>, next: MixEditState): string {
  if (next.status === "DRAFT") return "Saving keeps this Mix as a draft. It won’t start anyone.";
  if (next.status === "PAUSED") return "This Mix will be paused after saving. Its follow-ups wait until you turn it back on.";
  const parts: string[] = [];
  if (consequence.turningOn) parts.push(next.everyone || next.groupIds.length
    ? "Saving turns this Mix on for the selected audience."
    : next.triggerMode === "AFTER_MIX" ? "Saving turns this Mix on for future completions of the selected Mix."
    : "Saving turns this Mix on. You can then start it for a person or an appointment.");
  if (consequence.resuming) {
    parts.push("Saving turns this Mix back on and resumes the follow-ups that were paused.");
    if (next.everyone) parts.push("Everyone also takes in eligible new contacts.");
  }
  if (consequence.widens && !consequence.turningOn) parts.push("Saving also starts this Mix for the people the added audience covers.");
  if (consequence.retriggers) parts.push("The changed start rule reschedules everyone this Mix covers.");
  if (!parts.length) parts.push(consequence.kinds.includes("wording-only")
    ? "The new wording applies to future starts. People already in this Mix keep their saved Beats."
    : "Beat changes apply to future starts. People already in this Mix keep their saved Beats.");
  return parts.join(" ");
}
