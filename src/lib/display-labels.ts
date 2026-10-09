/** Customer-facing channel names ("Text", "Phone call"), never raw enum values. */
export function channelName(channel: string): string {
  const names: Record<string, string> = { SMS: "Text", EMAIL: "Email", PHONE_CALL: "Phone call", VOICEMAIL: "Voicemail", WHATSAPP: "WhatsApp" };
  if (names[channel]) return names[channel];
  const words = channel.replaceAll("_", " ").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** A send time stored as minutes after midnight, in the reader's clock style (e.g. "10:00 AM"). */
export function timeOfDayLabel(minutes: number, locale = "en-US"): string {
  const safe = Math.min(Math.max(Math.trunc(minutes), 0), 24 * 60 - 1);
  return new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit", timeZone: "UTC" }).format(new Date(Date.UTC(2000, 0, 1, Math.floor(safe / 60), safe % 60)));
}

const ENDED_REASONS: Record<string, string> = {
  done: "You marked it done.",
  "outcome:completed": "You marked it done.",
  skipped: "You skipped it.",
  "outcome:skipped": "You skipped it.",
  "outcome:connected": "You recorded the call as connected.",
  "outcome:left_voicemail": "You recorded that you left a voicemail.",
  "outcome:no_answer": "You recorded no answer.",
  "outcome:wrong_number": "You recorded a wrong number.",
  "outcome:rescheduled": "You recorded it and scheduled the next follow-up.",
  mix_stopped_for_contact: "The Mix was stopped for this person.",
  mix_paused: "Its Mix was paused.",
  mix_archived: "Its Mix was archived.",
  contact_archived: "This person was archived.",
  contact_merged: "This person was merged with another contact.",
  do_not_contact: "This person was marked Do not contact.",
  reconciled: "Its Mix or this person’s details changed, so it no longer applied.",
  workflow_held: "Its path in Journey was put on hold.",
  workflow_updated: "Its path in Journey changed.",
  workflow_stopped: "Its path in Journey was stopped.",
  journey_stage_changed: "This person moved to another stage.",
  invitation_accepted: "The invitation was accepted.",
  invitation_revoked: "The invitation was withdrawn.",
  appointment_held: "Its appointment was put on hold.",
  appointment_canceled: "Its appointment was canceled.",
  appointment_unresolved: "Its appointment’s details needed fixing.",
  appointment_no_show: "This person missed the appointment.",
  appointment_completed: "The appointment was completed.",
  appointment_outcome_pending: "It was waiting for you to record how the visit went.",
  appointment_passed: "The appointment had already started, so this preparation lapsed."
};

/** Why a follow-up is no longer pending, as a sentence for its owner, from its stored completion method; null for an unknown one (TRU-10). */
export function followUpEndedReason(method: string | null | undefined): string | null {
  if (!method) return null;
  if (method.startsWith("automatic:")) {
    const channel = method.slice("automatic:".length).toUpperCase();
    return channel === "EMAIL" ? "It was sent automatically by email." : channel === "SMS" ? "It was sent automatically by text." : "It was sent automatically.";
  }
  return ENDED_REASONS[method] ?? null;
}
