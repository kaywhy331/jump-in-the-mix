import type { PortablePackage } from "@/lib/mix-portable";

export type MarketplaceReason = "PRIVATE_INFO" | "OFFENSIVE" | "SPAM" | "MISLEADING" | "COPYRIGHT" | "OTHER";

/** Reasons in the order people see them. A reason that auto-hides takes the listing down at once. */
export const MARKETPLACE_REASONS: ReadonlyArray<{ value: MarketplaceReason; label: string; hint: string; autoHide: boolean }> = [
  { value: "PRIVATE_INFO", label: "Shares someone’s private information", hint: "A real name, phone number, email or address", autoHide: true },
  { value: "OFFENSIVE", label: "Offensive, hateful or harassing", hint: "Wording no customer should receive", autoHide: true },
  { value: "SPAM", label: "Spam, scam or harmful links", hint: "Advertising, phishing or misleading links", autoHide: true },
  { value: "MISLEADING", label: "Doesn’t work as described", hint: "Broken paths, wrong timing or a misleading description", autoHide: false },
  { value: "COPYRIGHT", label: "Copied without permission", hint: "Someone else’s wording shared as their own", autoHide: false },
  { value: "OTHER", label: "Something else", hint: "Tell us what is wrong", autoHide: false }
];
export const reasonLabel = (value: string) => MARKETPLACE_REASONS.find(item => item.value === value)?.label ?? "Reported";
export const reasonHides = (value: string) => MARKETPLACE_REASONS.some(item => item.value === value && item.autoHide);
export const isMarketplaceReason = (value: string): value is MarketplaceReason => MARKETPLACE_REASONS.some(item => item.value === value);

export const MARKETPLACE_SUMMARY_MAX = 280;
export const MARKETPLACE_NAME_MAX = 60;

export function cleanPublicName(value: unknown): string {
  const name = String(value ?? "").replace(/\s+/g, " ").trim().slice(0, MARKETPLACE_NAME_MAX);
  if (!name) throw new Error("Choose the name people see on your shares.");
  if (/@|https?:\/\/|www\./i.test(name) || /\d{5,}/.test(name.replace(/[\s().-]/g, ""))) throw new Error("Use a name, not an email address, phone number or link.");
  return name;
}

export type ShareWarning = { kind: "email" | "phone" | "link" | "name"; text: string; where: string };
const GREETING_NAME = /\b(?:[Hh]i|[Hh]ello|[Hh]ey|[Dd]ear|[Tt]hanks|[Tt]hank you|[Mm]orning|[Ee]vening)[,!]?\s+([A-Z][a-z]{2,})\b/g;
const NOT_NAMES = new Set(["There", "Again", "Everyone", "Team", "All", "Friend", "Friends", "Folks", "Neighbor", "Neighbour", "Sir", "Madam", "Both", "You", "Just", "So", "For", "From", "The"]);

/**
 * Look for details that should not be shared: email addresses, phone numbers, links and
 * greetings that name a real person instead of a {{First Name}} field. Merge fields are
 * ignored. These are warnings; the author confirms before sharing.
 */
export function shareWarnings(value: PortablePackage): ShareWarning[] {
  const warnings: ShareWarning[] = [];
  const add = (warning: ShareWarning) => { if (warnings.length < 25 && !warnings.some(item => item.kind === warning.kind && item.text === warning.text)) warnings.push(warning); };
  const scan = (raw: string | null, where: string) => {
    const text = (raw ?? "").replace(/\{\{[^}]*\}\}/g, " ");
    for (const match of text.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)) add({ kind: "email", text: match[0], where });
    for (const match of text.matchAll(/(?:\+?\d[\s().-]{0,2}){8,}\d/g)) add({ kind: "phone", text: match[0].trim(), where });
    const withoutEmails = text.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, " ");
    for (const match of withoutEmails.matchAll(/\b(?:https?:\/\/|www\.)[^\s)]+|\b[a-z0-9-]+\.(?:com|net|org|io|co|ca|uk|us|biz|info|me|app)\b(?:\/[^\s)]*)?/gi)) add({ kind: "link", text: match[0].replace(/[.,;:!?]+$/, ""), where });
    for (const match of text.matchAll(GREETING_NAME)) if (!NOT_NAMES.has(match[1])) add({ kind: "name", text: match[1], where });
  };
  scan(value.name, "Name"); scan(value.description, "Description");
  for (const mix of value.mixes) {
    scan(mix.name, mix.name); scan(mix.description, mix.name);
    for (const step of mix.steps) {
      const where = `${mix.name} · ${step.name}`;
      for (const field of [step.name, step.subject, step.body, step.script]) scan(field, where);
      for (const variant of step.variants) for (const field of [variant.subject, variant.body, variant.script]) scan(field, where);
    }
  }
  return warnings;
}

export const warningLabel: Record<ShareWarning["kind"], string> = { email: "Email address", phone: "Phone number", link: "Link", name: "Possible name" };

const channelFamily: Record<string, string> = { SMS: "TEXT", WHATSAPP: "TEXT", EMAIL: "EMAIL", PHONE_CALL: "CALL", VOICEMAIL: "CALL" };
export const MARKETPLACE_CHANNELS = [{ value: "TEXT", label: "Text" }, { value: "EMAIL", label: "Email" }, { value: "CALL", label: "Call" }] as const;
export const MARKETPLACE_SIZES = [{ value: "short", label: "1–3 Beats", min: 1, max: 3 }, { value: "medium", label: "4–9 Beats", min: 4, max: 9 }, { value: "long", label: "10 or more Beats", min: 10, max: 100_000 }] as const;

/** Directory facts cached on a listing from its live content. */
export function listingFacts(value: PortablePackage) {
  const steps = value.mixes.flatMap(mix => mix.steps);
  return { title: value.name, mixCount: value.mixes.length, beatCount: steps.length, channels: [...new Set(steps.map(step => channelFamily[step.channel] ?? "TEXT"))].sort() };
}
