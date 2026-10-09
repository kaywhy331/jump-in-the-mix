/** Customer-facing channel names ("Text", "Call"), never raw enum values (JITM-04 §2.3). */
export function channelName(channel: string): string {
  const names: Record<string, string> = { SMS: "Text", EMAIL: "Email", PHONE_CALL: "Call", VOICEMAIL: "Voicemail", WHATSAPP: "WhatsApp" };
  if (names[channel]) return names[channel];
  const words = channel.replaceAll("_", " ").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** A channel's name inside a sentence: "text", "email", "call", "voicemail", but "WhatsApp", a product name. */
export function channelWord(name: string): string {
  return name === "WhatsApp" ? name : name.toLowerCase();
}

/** A send time stored as minutes after midnight, on the 12-hour clock (e.g. "10:00 AM"; JITM-05 §2.19, D79). */
export function timeOfDayLabel(minutes: number, locale = "en-US"): string {
  const safe = Math.min(Math.max(Math.trunc(minutes), 0), 24 * 60 - 1);
  return new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "UTC" }).format(new Date(Date.UTC(2000, 0, 1, Math.floor(safe / 60), safe % 60)));
}

function sentenceCase(value: string): string {
  const words = value.replaceAll("_", " ").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** A Mix's status as the Mixes filter names it: On, Paused, Draft, Archived (JITM-04 §2.4). */
export function mixStatusLabel(status: string): string {
  return ({ ACTIVE: "On", PAUSED: "Paused", DRAFT: "Draft", ARCHIVED: "Archived" } as Record<string, string>)[status] ?? sentenceCase(status);
}

/** A contact import's status in plain words. A finished import that saved no one says so, though only some rows failed. */
export function importStatusLabel(status: string, imported?: number): string {
  if (status === "PARTIAL" && imported === 0) return "Not imported";
  return ({ QUEUED: "Waiting to start", RUNNING: "Importing", COMPLETED: "Completed", PARTIAL: "Partly imported", FAILED: "Failed", CANCELED: "Canceled" } as Record<string, string>)[status] ?? sentenceCase(status);
}

/** A person's run through Journey, or one Beat of it, in plain words (JITM-05 §2.11). A pending Beat may already be due. */
export function runStatusLabel(status: string): string {
  return ({ ACTIVE: "Running", PAUSED: "Paused", FINISHED: "Finished", STOPPED: "Stopped", CANCELED: "Stopped", PENDING: "Not done yet", DONE: "Done", SKIPPED: "Skipped", HELD: "On hold" } as Record<string, string>)[status] ?? sentenceCase(status);
}

/** How often a saved date comes back: "Doesn't repeat", "Every month", "Every year", in summaries and choices alike. */
export function recurrenceLabel(recurrence: string): string {
  return ({ NONE: "Doesn’t repeat", MONTHLY: "Every month", YEARLY: "Every year" } as Record<string, string>)[recurrence] ?? sentenceCase(recurrence);
}

/** A time zone in running copy, named by its city ("New York time"), never its IANA name (JITM-05 §2.19, D79). */
export function zoneLabel(zone: string): string {
  if (!zone || UTC_ZONES.has(zone)) return "UTC";
  // "Etc/GMT+5" is five hours behind UTC: the sign is the reverse of what it reads.
  const offset = /^Etc\/GMT([+-])(\d{1,2})$/.exec(zone);
  if (offset) return `UTC${offset[1] === "+" ? "-" : "+"}${Number(offset[2])}`;
  if (ISLAND_ZONES[zone]) return `${ISLAND_ZONES[zone]} time`;
  const city = zone.includes("/") ? zone.split("/").at(-1)?.replaceAll("_", " ") : null;
  if (city) return `${city} time`;
  // Zones with no city, such as "EST5EDT", go by their generic name ("Eastern Time").
  return zoneGenericName(zone);
}

/** A zone's everyday name as of now ("Eastern Time"), shown beside its city in the picker; the IANA name if unknown. */
export function zoneGenericName(zone: string, at = new Date()): string {
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "longGeneric" }).formatToParts(at).find(part => part.type === "timeZoneName")?.value ?? zone;
  } catch {
    return zone;
  }
}
const UTC_ZONES = new Set(["UTC", "Etc/UTC", "UCT", "Etc/UCT", "Universal", "Etc/Universal", "Zulu", "Etc/Zulu", "GMT", "Etc/GMT", "GMT0", "Etc/GMT0", "GMT+0", "Etc/GMT+0", "GMT-0", "Etc/GMT-0", "Greenwich", "Etc/Greenwich"]);
// Islands whose zone is named without the word, so "Christmas time" would mislead.
const ISLAND_ZONES: Record<string, string> = { "Indian/Christmas": "Christmas Island", "Pacific/Easter": "Easter Island", "Pacific/Norfolk": "Norfolk Island", "Pacific/Wake": "Wake Island" };

/**
 * A date ("2026-10-09") and time ("14:00") as the owner entered them, in their own zone: "Fri, Oct 9 at 2:00 PM", with
 * the year only when it isn't this year in `timeZone`. Either part may be missing; nothing is shown for neither.
 */
export function localDateTimeLabel(date: string, time: string, locale = "en-US", now = new Date(), timeZone = "UTC"): string {
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date ?? "");
  const clock = /^(\d{2}):(\d{2})$/.exec(time ?? "");
  const timeText = clock ? timeOfDayLabel(Number(clock[1]) * 60 + Number(clock[2]), locale) : "";
  if (!day) return timeText;
  const year = Number(day[1]);
  const thisYear = Number(new Intl.DateTimeFormat("en-US", { year: "numeric", timeZone }).format(now));
  const dayText = new Intl.DateTimeFormat(locale, { weekday: "short", month: "short", day: "numeric", ...(year !== thisYear ? { year: "numeric" } : {}), timeZone: "UTC" }).format(new Date(Date.UTC(year, Number(day[2]) - 1, Number(day[3]), 12)));
  return timeText ? `${dayText} at ${timeText}` : dayText;
}

/** An instant written as `localDateTimeLabel` writes a date and time, in `timeZone` ("Thu, Oct 15 at 2:00 PM"). */
export function zonedDateTimeLabel(at: Date, timeZone: string, locale = "en-US", now = new Date()): string {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(at).map(part => [part.type, part.value]));
  return localDateTimeLabel(`${parts.year}-${parts.month}-${parts.day}`, `${parts.hour}:${parts.minute}`, locale, now, timeZone);
}

// Holds that lift bring their follow-up back, so a held follow-up still shown here is still held: those read in the present.
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
  mix_paused: "Its Mix is paused.",
  mix_archived: "Its Mix was archived.",
  contact_archived: "This person is archived.",
  contact_merged: "This person was merged with another contact.",
  do_not_contact: "This person is marked Do not contact.",
  recovery_do_not_contact: "This person is marked Do not contact.",
  reconciled: "Its Mix, or this person’s place in it, changed, so it no longer applies.",
  workflow_held: "Its path in Journey is on hold.",
  workflow_updated: "Its path in Journey changed.",
  workflow_stopped: "Its path in Journey was stopped.",
  journey_stage_changed: "This person moved to another stage.",
  invitation_accepted: "The invitation was accepted.",
  invitation_revoked: "The invitation was withdrawn or declined.",
  appointment_held: "Follow-ups for its appointment are on hold.",
  appointment_canceled: "Its appointment was canceled.",
  appointment_unresolved: "Its appointment is missing, or its details need fixing.",
  appointment_no_show: "This person missed the appointment.",
  appointment_completed: "The appointment was completed.",
  appointment_outcome_pending: "It waits until you record how the visit went.",
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
