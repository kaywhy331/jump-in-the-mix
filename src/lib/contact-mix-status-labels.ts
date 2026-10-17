/** Mix status words and filter values, safe for client components (JITM-09 §2.76, JITM-05 §2.3). */
export type ContactMixStatus = "in-mix" | "no-mix" | "no-mix-needed" | "do-not-contact";
export const CONTACT_MIX_FILTERS = { "in-mix": "In a Mix", "no-mix": "No Mix", "no-mix-needed": "No Mix needed" } as const;
export type ContactMixFilter = keyof typeof CONTACT_MIX_FILTERS;
export type ContactMixCounts = Record<ContactMixStatus, number>;
export function contactMixFilter(value: string | null | undefined): ContactMixFilter | "" {
  return value && Object.hasOwn(CONTACT_MIX_FILTERS, value) ? value as ContactMixFilter : "";
}

/**
 * Today's line about people with No Mix (JITM-09 §2.77, D44). It says only that no Mix will remind the owner,
 * which stays true when a one-time follow-up is on its way: those are outside every Mix (JITM-05 §2.3).
 */
export function noMixTodayLine(count: number): string {
  return `${count === 1 ? "1 person has" : `${count.toLocaleString()} people have`} No Mix, so no Mix will remind you about them.`;
}

/** What starting a Mix did for one person (src/lib/contact-mix-actions.ts). */
export type MixStartResult = "started" | "already-running" | "saved-date-kept" | "date-written";
export type MixStartCounts = Record<MixStartResult, number>;

const people = (count: number) => count === 1 ? "1 person" : `${count.toLocaleString()} people`;

/**
 * What the bulk Mix sheet says about the chosen Mix, by how it starts (`Mix.triggerMode`; D46, COPY-02). Only a
 * hand-started Mix runs again for someone who finished it; a date-based one follows each person's saved date,
 * and a fixed-date Mix has follow-ups due on its own date, so the start day does nothing for it.
 */
export function bulkMixSheetSentence(triggerMode: string): string {
  if (triggerMode === "DATE_TRIGGERED") return "It follows each person’s saved date. Anyone without one gets the start day as their date. Anyone still in it keeps their start.";
  if (triggerMode === "BROADCAST") return "Follow-ups are due on its fixed date. Anyone still in it keeps their start.";
  return "Anyone who already finished this Mix starts it again. Anyone still in it keeps their start.";
}

/** The same for one person, under the start day in What's next: what that day does for the chosen Mix (END-02). */
export function oneMixStartSentence(triggerMode: string): string {
  if (triggerMode === "DATE_TRIGGERED") return "It follows their saved date. Without one, the start day is saved as their date.";
  if (triggerMode === "BROADCAST") return "Follow-ups are due on its fixed date, whatever start day you choose.";
  return "It starts on the day you choose.";
}

/**
 * The confirmation after Add to the Mix (JITM-04 §2.7): it names the Mix and says what happened to each
 * group of people, so it never promises follow-ups that are not coming. `startDay` is the chosen start day
 * as the owner reads it; a fixed-date Mix (`triggerMode` BROADCAST) has follow-ups due on its own date instead.
 */
export function bulkMixStartNotice(input: { mixName: string; triggerMode: string; counts: MixStartCounts; startDay: string; startsToday: boolean; waitsForVisit: boolean }): string {
  const { counts, mixName } = input;
  const started = counts.started + counts["saved-date-kept"] + counts["date-written"];
  const kept = counts["already-running"];
  const sentences: string[] = [];
  if (started) sentences.push(input.triggerMode === "BROADCAST"
    ? `${mixName} has follow-ups due for ${people(started)} on its fixed date.`
    : `${mixName} ${counts.started && !input.startsToday ? `starts on ${input.startDay}` : "started"} for ${people(started)}.`);
  if (kept) sentences.push(started
    ? `${kept === 1 ? "1 was" : `${kept.toLocaleString()} were`} already in it and ${kept === 1 ? "keeps" : "keep"} their start.`
    : `${people(kept)} ${kept === 1 ? "was" : "were"} already in ${mixName} and ${kept === 1 ? "keeps" : "keep"} their start.`);
  if (counts["saved-date-kept"]) sentences.push(`${counts["saved-date-kept"] === 1 ? "1 follows" : `${counts["saved-date-kept"].toLocaleString()} follow`} their saved date.`);
  if (counts["date-written"]) sentences.push(`${counts["date-written"] === 1 ? "1 had" : `${counts["date-written"].toLocaleString()} had`} no saved date, so ${input.startDay} was saved for them.`);
  if (started && input.waitsForVisit) sentences.push("Beats timed from an appointment wait until you line each person up with a visit.");
  return sentences.join(" ");
}

/**
 * The confirmation after Undo on a bulk start (D46): who is back to how they were before it, what else it put
 * back, and who was left because they changed since. Undo puts back an earlier run of the Mix rather than
 * ending it (UNDO-02), and removes only the start's own follow-ups, so other routes keep theirs (UNDO-01).
 */
export function bulkMixUndoNotice(input: { mixName: string; ended: number; kept: number; dates: number; confirmed?: number }): string {
  const sentences = [input.ended
    ? `Undone. ${input.mixName} is back to how it was for ${people(input.ended)}, without the follow-ups still to come from this start.`
    : "Nothing was undone: those starts had already ended or changed since."];
  if (input.dates) sentences.push(input.dates === 1 ? "The date saved when it started was removed." : "The dates saved when it started were removed.");
  if (input.confirmed) sentences.push(`${input.confirmed === 1 ? "1 person is" : `${input.confirmed.toLocaleString()} people are`} marked No Mix needed again.`);
  if (input.ended && input.kept) sentences.push(`${input.kept === 1 ? "1 person" : `${input.kept.toLocaleString()} people`} changed since and ${input.kept === 1 ? "was" : "were"} left as they are.`);
  return sentences.join(" ");
}

/** Notice parameters of Mark No Mix needed and its Undo; any later return drops them. */
export const NO_MIX_NEEDED_NOTICE = ["noMixNeeded", "noMixPeople", "noMixInMix", "noMixDnc", "noMixAlready", "noMixCleared"];

/** What Mark No Mix needed did, with each reason someone was left as they are (COPY-01). */
export type NoMixNeededResult = { marked: number; inMix: number; doNotContact: number; already: number };

export function noMixNeededNotice(result: NoMixNeededResult): string {
  const left = [
    result.inMix ? `${result.inMix.toLocaleString()} already in a Mix` : "",
    result.doNotContact ? `${result.doNotContact.toLocaleString()} marked Do not contact` : "",
    result.already ? `${result.already.toLocaleString()} already marked No Mix needed` : ""
  ].filter(Boolean);
  const lead = result.marked ? `${result.marked === 1 ? "1 person is" : `${result.marked.toLocaleString()} people are`} marked No Mix needed.` : "Nothing changed.";
  return left.length ? `${lead} Left as they are: ${left.join(", ")}.` : lead;
}

/** After No Mix needed is taken back: "removed" only when it was removed for someone (COPY-01). */
export function noMixClearedNotice(cleared: number): string {
  if (!cleared) return "Nothing changed: no one here was marked No Mix needed.";
  return cleared === 1 ? "No Mix needed removed." : `No Mix needed removed for ${cleared.toLocaleString()} people.`;
}
