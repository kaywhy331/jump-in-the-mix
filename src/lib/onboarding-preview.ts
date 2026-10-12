import type { DraftValues } from "@/lib/draft-segments";
import { formatDate, formatTime } from "@/lib/format";
import { splitContactName } from "@/lib/quick-add-capture";

/** The person's stored first and last names (a typed name split as onboarding saves it), and the owner's details. */
export type OnboardingPreviewDetails = { firstName: string; lastName: string; company: string; smsSignature: string; ownerName: string };

/**
 * What a starter's tokens become for the first person, so onboarding previews the message as it will be sent (D73).
 * A missing detail gets the same stand-in the renderer uses (`buildJumpReplacementValues`), and its tokens are listed
 * in `standIns` so the preview can mark them.
 */
export function onboardingPreviewValues({ firstName: personFirstName, lastName, company, smsSignature, ownerName }: OnboardingPreviewDetails): { values: DraftValues; standIns: Set<string> } {
  const owner = splitContactName(ownerName);
  const business = company.trim() || "my business", firstName = personFirstName.trim() || "there";
  const signature = smsSignature.trim() || ownerName.trim(), emailSignature = ownerName.trim();
  const values: DraftValues = {
    "{{First Name}}": firstName, "{{contact.first_name}}": firstName,
    "{{Last Name}}": lastName.trim(), "{{contact.last_name}}": lastName.trim(),
    "{{My Company}}": business, "{{my.company}}": business,
    "{{SMS Signature}}": signature, "{{my.sms_signature}}": signature,
    "{{Email Signature}}": emailSignature, "{{my.email_signature}}": emailSignature,
    "{{My First Name}}": owner.firstName, "{{my.first_name}}": owner.firstName,
    "{{My Last Name}}": owner.lastName, "{{my.last_name}}": owner.lastName
  };
  const standIns = new Set([...(personFirstName.trim() ? [] : ["{{First Name}}", "{{contact.first_name}}"]), ...(company.trim() ? [] : ["{{My Company}}", "{{my.company}}"])]);
  return { values, standIns };
}

/** A Beat's day and time in the chosen timezone, as the reader writes them (e.g. "Tue, Oct 13 · 10:00 AM"; D79). */
export function beatWhen(at: string | null, timezone: string, locale: string): string {
  if (!at) return "";
  const instant = new Date(at), preferences = { locale, timeZone: timezone };
  return `${formatDate(instant, preferences, { weekday: "short", year: undefined })} · ${formatTime(instant, preferences)}`;
}
