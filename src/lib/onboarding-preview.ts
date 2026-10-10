import type { DraftValues } from "@/lib/draft-segments";
import { formatDate, formatTime } from "@/lib/format";
import { splitContactName } from "@/lib/quick-add-capture";

export type OnboardingPreviewDetails = { personName: string; company: string; smsSignature: string; ownerName: string };

/**
 * What a starter's tokens become for the first person, so onboarding previews the message as it will be sent (D73).
 * A missing detail gets the same stand-in the renderer uses (`buildJumpReplacementValues`), and its tokens are listed
 * in `standIns` so the preview can mark them.
 */
export function onboardingPreviewValues({ personName, company, smsSignature, ownerName }: OnboardingPreviewDetails): { values: DraftValues; standIns: Set<string> } {
  const person = splitContactName(personName), owner = splitContactName(ownerName);
  const business = company.trim() || "my business", firstName = person.firstName || "there";
  const signature = smsSignature.trim() || ownerName.trim(), emailSignature = ownerName.trim();
  const values: DraftValues = {
    "{{First Name}}": firstName, "{{contact.first_name}}": firstName,
    "{{Last Name}}": person.lastName, "{{contact.last_name}}": person.lastName,
    "{{My Company}}": business, "{{my.company}}": business,
    "{{SMS Signature}}": signature, "{{my.sms_signature}}": signature,
    "{{Email Signature}}": emailSignature, "{{my.email_signature}}": emailSignature,
    "{{My First Name}}": owner.firstName, "{{my.first_name}}": owner.firstName,
    "{{My Last Name}}": owner.lastName, "{{my.last_name}}": owner.lastName
  };
  const standIns = new Set([...(person.firstName ? [] : ["{{First Name}}", "{{contact.first_name}}"]), ...(company.trim() ? [] : ["{{My Company}}", "{{my.company}}"])]);
  return { values, standIns };
}

/** A Beat's day and time, counted from the chosen date, as the reader writes them (e.g. "Tue, Oct 13 · 10:00 AM"; D79). */
export function beatWhen(firstDate: string, dayOffset: number, minutes: number, locale: string): string {
  const [year, month, day] = firstDate.split("-").map(Number);
  if (!year || !month || !day) return "";
  const instant = new Date(Date.UTC(year, month - 1, day + dayOffset, Math.floor(minutes / 60), minutes % 60));
  const preferences = { locale, timeZone: "UTC" };
  return `${formatDate(instant, preferences, { weekday: "short", year: undefined })} · ${formatTime(instant, preferences)}`;
}
