import { getCountries, getCountryCallingCode, isSupportedCountry, parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js/min";
import type { Prisma } from "@/generated/prisma/client";
import { normalizePhone } from "@/lib/contact-input";
import type { prisma } from "@/lib/prisma";

/**
 * Phone keys that name the number rather than the way it was typed. This is the only module that
 * loads the phone metadata (libphonenumber-js, `min` metadata): it is server-only, so client code keeps
 * importing the parser-free helpers in `contact-input.ts` and `phone-dial.ts`, and a test walks the
 * client import graph to keep it that way.
 *
 * A key is the E.164 number, followed by `;ext=<digits>` when the number has an extension, whenever
 * the typed value is a possible number at a full national length for the workspace's region (a
 * number typed with `+`, or with the region's own international prefix, carries its own country).
 * Otherwise the key is the legacy one (`normalizePhone`: the digits, keeping a typed `+`), so a
 * local-only or unrecognised value keeps today's key. The displayed value is never changed.
 *
 * Expand/contract: rows written before this release, or by the previous release after a rollback,
 * still hold legacy keys until the phone-key sweep rewrites them, so every matcher looks up both
 * keys (`phoneLookupKeys`).
 */

export const DEFAULT_PHONE_REGION = "US";

export type PhoneRegion = { code: string; callingCode: string; name: string };

type Db = Prisma.TransactionClient | typeof prisma;

const regionNames = new Intl.DisplayNames("en", { type: "region" });

/** Every region the phone metadata knows, by English name, for the workspace region picker. */
export const PHONE_REGIONS: Array<{ code: string; callingCode: string; name: string }> = getCountries()
  .map((code) => ({ code, callingCode: getCountryCallingCode(code), name: regionNames.of(code) ?? code }))
  .sort((a, b) => a.name.localeCompare(b.name, "en") || a.code.localeCompare(b.code));

/** A two-letter region code the phone metadata supports. */
export function isPhoneRegion(value: unknown): value is string {
  return typeof value === "string" && /^[A-Z]{2}$/.test(value) && isSupportedCountry(value);
}

/** The stored region when it is supported, otherwise the default (North America). */
export function phoneRegionOrDefault(value: unknown): string {
  return isPhoneRegion(value) ? value : DEFAULT_PHONE_REGION;
}

/** "United States (+1)" for the region picker and notices. */
export function phoneRegionLabel(code: string): string {
  const region = PHONE_REGIONS.find((item) => item.code === code);
  return region ? `${region.name} (+${region.callingCode})` : code;
}

type ParsedPhone = NonNullable<ReturnType<typeof parsePhoneNumberFromString>>;

function parsePhone(text: string, defaultCountry?: CountryCode): ParsedPhone | null {
  try {
    return parsePhoneNumberFromString(text, { defaultCountry, extract: false }) ?? null;
  } catch {
    return null;
  }
}

/**
 * A possible number at a full national length: the metadata's lengths, which never include a
 * local-only length such as the 7-digit North American form. A North American area code never
 * begins with 0 or 1, so "0412 345 678" in a North American workspace stays unread rather than
 * becoming +1 041 234 5678.
 */
function possibleNumber(parsed: ParsedPhone): boolean {
  return parsed.isPossible() && (parsed.countryCallingCode !== "1" || /^[2-9]/.test(parsed.nationalNumber));
}

/**
 * The key for a value that is a possible number, or null. Strict parsing: the whole value must be a
 * phone number (an extension is allowed), and the region supplies both the national reading and the
 * international prefix (011 in North America, 00 in most other regions).
 */
function possiblePhoneKey(display: string, region: string): string | null {
  const text = display.trim();
  if (!text) return null;
  const parsed = parsePhone(text, isPhoneRegion(region) ? (region as CountryCode) : undefined);
  if (!parsed || !possibleNumber(parsed)) return null;
  return parsed.ext ? `${parsed.number};ext=${parsed.ext}` : parsed.number;
}

/**
 * The key a writer stores for a phone value in a workspace with this region: `+15551234567`,
 * `+15551234567;ext=12`, or the legacy key when the value is not a possible number there.
 * Callers validate first (`normalizePhone`, as the forms do); an invalid value throws.
 */
export function canonicalPhoneKey(display: string, region: string): string {
  const legacy = normalizePhone(display);
  if (!legacy) throw new Error("Invalid phone number.");
  return possiblePhoneKey(display, region) ?? legacy;
}

/**
 * The keys a matcher looks up for a phone value: [canonical, legacy], deduplicated. Empty when the
 * value is not a phone number at all.
 */
export function phoneLookupKeys(display: string, region: string): string[] {
  const legacy = normalizePhone(display);
  if (!legacy) return [];
  const canonical = possiblePhoneKey(display, region) ?? legacy;
  return canonical === legacy ? [canonical] : [canonical, legacy];
}

/**
 * The key a stored row should hold in this region: the canonical key of its display value, or its
 * current key when the display value is not a phone number (the phone-key sweep leaves those alone).
 */
export function canonicalRowKey(row: { phone: string; normalized: string }, region: string): string {
  return normalizePhone(row.phone) ? canonicalPhoneKey(row.phone, region) : row.normalized;
}

/**
 * The keys a stored row answers to when it is compared in memory: its stored key and the key its
 * display value has in this region, so a row the sweep has not reached yet still matches.
 */
export function phoneRowKeys(row: { phone: string; normalized: string }, region: string): string[] {
  return [...new Set([row.normalized, canonicalRowKey(row, region)])];
}

/** True when the value and the stored row denote the same number (see `phoneLookupKeys`, `phoneRowKeys`). */
export function phoneMatchesRow(display: string, row: { phone: string; normalized: string }, region: string): boolean {
  const lookup = phoneLookupKeys(display, region);
  return phoneRowKeys(row, region).some((key) => lookup.includes(key));
}

const STORED_E164_KEY = /^(\+[1-9]\d{6,14})(?:;ext=(\d{1,15}))?$/;

function typedExtension(display: string): boolean {
  return Boolean(parsePhone(display.trim())?.ext);
}

/**
 * The E.164 number to dial, text or open in WhatsApp for a stored row: the stored key without its
 * extension, only when the key begins with `+` and is a possible number. A legacy key typed with `+`
 * and an extension ("+1 555 123 4567 x12" was stored as "+1555123456712") is refused. Everything else
 * returns null: nothing is dialled from a guess about a national number.
 */
export function phoneDialTarget(storedKey: string, display: string): string | null {
  const match = STORED_E164_KEY.exec(storedKey.trim());
  if (!match) return null;
  const [, number, extension] = match;
  // A legacy key keeps a "+" only when the value was typed with one, and it folds the extension's digits in.
  if (extension === undefined && display.trim().startsWith("+") && typedExtension(display)) return null;
  const parsed = parsePhone(number);
  return parsed && possibleNumber(parsed) && parsed.number === number ? number : null;
}

/**
 * The dial target for a stored row in a workspace with this region. A row the phone-key sweep has
 * not reached yet (a legacy key) is read the way the sweep will read it, so dialing does not wait for
 * the sweep; a swept row dials its stored key.
 */
export function storedPhoneDialTarget(row: { phone: string; normalized: string }, region: string): string | null {
  const stored = phoneDialTarget(row.normalized, row.phone);
  if (stored) return stored;
  if (!normalizePhone(row.phone)) return null;
  const canonical = possiblePhoneKey(row.phone, region);
  return canonical && canonical !== row.normalized ? phoneDialTarget(canonical, row.phone) : null;
}

/**
 * For a free-text search that is a whole phone number: both of its keys in the workspace's region, so
 * "07911 123456" still finds "+447911123456" in a United Kingdom workspace. Searches add these to the
 * digit forms of `phoneSearchDigits` (phone-dial.ts). Empty, without reading the region, otherwise.
 */
export async function phoneQueryKeys(db: Db, workspaceId: string, query: string): Promise<string[]> {
  return normalizePhone(query) ? phoneLookupKeys(query, await workspacePhoneRegion(db, workspaceId)) : [];
}

/** The workspace's phone region ("US" when the preference row is missing or holds an unsupported code). */
export async function workspacePhoneRegion(db: Db, workspaceId: string): Promise<string> {
  const preference = await db.workspacePreference.findUnique({ where: { workspaceId }, select: { phoneRegion: true } });
  return phoneRegionOrDefault(preference?.phoneRegion);
}
