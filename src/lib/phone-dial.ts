import { normalizePhone } from "@/lib/contact-input";

/**
 * Dialing helpers that do not change stored data. Stored phone rows keep the owner's typed
 * value and the format-based `normalized` key; these functions derive what a phone app or an SMS
 * provider needs from that display value.
 */

const EXTENSION = /(?:\s*(?:,|;)?\s*(?:x|ext\.?|extension|#)\s*\d{1,6})\s*$/i;
const NANP_NATIONAL = /^[2-9]\d{2}[2-9]\d{6}$/;

/** Removes a trailing extension such as "x12", "ext. 12", "extension 12" or "#12". */
export function stripPhoneExtension(value: string): string {
  return value.replace(EXTENSION, "").trim();
}

/**
 * An E.164 number for tel:, sms: and provider calls: "+" plus digits when the owner typed a "+",
 * "+1" plus the digits for a North American ten-digit number (or eleven digits starting with 1).
 * Anything else (a national number from another country, a short number) returns null.
 */
export function dialablePhone(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = stripPhoneExtension(value);
  if (!trimmed) return null;
  const digits = trimmed.replace(/\D/g, "");
  if (trimmed.startsWith("+")) return digits.length >= 7 && digits.length <= 15 ? `+${digits}` : null;
  if (digits.length === 10 && NANP_NATIONAL.test(digits)) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1") && NANP_NATIONAL.test(digits.slice(1))) return `+${digits}`;
  return null;
}

/**
 * What a tel: or sms: link should carry: the E.164 form when it can be derived, otherwise the
 * same digits `normalizePhone` stores (a "+" only when the owner typed one). Never a raw string
 * with spaces or punctuation, never a "+" added to a national number.
 */
export function phoneLinkTarget(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  return dialablePhone(value) ?? normalizePhone(stripPhoneExtension(value));
}

/**
 * Every stored `normalized` spelling that could denote the same number, for searches and
 * duplicate grouping. North American numbers yield the ten-digit, 1-prefixed and +1 forms;
 * other numbers yield their single normalized form. Empty when nothing normalizes.
 */
export function phoneMatchKeys(value: string | null | undefined): string[] {
  if (typeof value !== "string") return [];
  const stripped = stripPhoneExtension(value);
  const keys = new Set<string>();
  const normalized = normalizePhone(stripped);
  if (normalized) keys.add(normalized);
  const dialable = dialablePhone(stripped);
  if (dialable?.startsWith("+1") && dialable.length === 12 && NANP_NATIONAL.test(dialable.slice(2))) {
    const national = dialable.slice(2);
    keys.add(national);
    keys.add(`1${national}`);
    keys.add(dialable);
  }
  return [...keys];
}

/** One key per real-world number for grouping duplicates across formats. */
export function phoneEquivalenceKey(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  return dialablePhone(value) ?? normalizePhone(stripPhoneExtension(value));
}

/** Digit sequences to match against stored `normalized` values for a free-text search. */
export function phoneSearchDigits(query: string): string[] {
  const digits = query.replace(/\D/g, "");
  if (digits.length < 4) return [];
  const forms = new Set<string>([digits]);
  if (digits.length === 11 && digits.startsWith("1")) forms.add(digits.slice(1));
  if (digits.length === 10 && NANP_NATIONAL.test(digits)) forms.add(`1${digits}`);
  return [...forms];
}
