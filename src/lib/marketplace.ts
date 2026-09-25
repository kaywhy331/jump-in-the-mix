import type { PortablePackage } from "@/lib/mix-portable";
import { UserFacingError } from "@/lib/user-facing-error";

export type MarketplaceReason = "PRIVATE_INFO" | "OFFENSIVE" | "SPAM" | "MISLEADING" | "COPYRIGHT" | "OTHER";

/**
 * Reasons in the order people see them. Only a private-information report can take a listing down
 * before staff look at it, and only under the conditions in `reportHidesAtOnce`; every other reason
 * keeps the share visible and queues it for staff.
 */
export const MARKETPLACE_REASONS: ReadonlyArray<{ value: MarketplaceReason; label: string; hint: string; autoHide: boolean }> = [
  { value: "PRIVATE_INFO", label: "Shares someone’s private information", hint: "A real name, phone number, email or address", autoHide: true },
  { value: "OFFENSIVE", label: "Offensive, hateful or harassing", hint: "Wording no customer should receive", autoHide: false },
  { value: "SPAM", label: "Spam, scam or harmful links", hint: "Advertising, phishing or misleading links", autoHide: false },
  { value: "MISLEADING", label: "Doesn’t work as described", hint: "Broken paths, wrong timing or a misleading description", autoHide: false },
  { value: "COPYRIGHT", label: "Copied without permission", hint: "Someone else’s wording shared as their own", autoHide: false },
  { value: "OTHER", label: "Something else", hint: "Tell us what is wrong", autoHide: false }
];
export const reasonLabel = (value: string) => MARKETPLACE_REASONS.find(item => item.value === value)?.label ?? "Reported";
export const reasonHides = (value: string) => MARKETPLACE_REASONS.some(item => item.value === value && item.autoHide);
export const isMarketplaceReason = (value: string): value is MarketplaceReason => MARKETPLACE_REASONS.some(item => item.value === value);

/** One account can trigger at most this many automatic hides in a rolling day. */
export const AUTO_HIDE_LIMIT = { count: 2, windowMs: 24 * 60 * 60 * 1000 } as const;

/**
 * Whether a report takes the share down at once. Only private information does, only from a reporter
 * with a verified email, and only while their account is under the daily limit. Everything else stays
 * live until staff decide, so one account cannot clear the Marketplace with a handful of reports.
 */
export function reportHidesAtOnce(input: { reason: string; reporterEmailVerified: boolean; recentAutoHides: number }): boolean {
  return reasonHides(input.reason) && input.reporterEmailVerified && input.recentAutoHides < AUTO_HIDE_LIMIT.count;
}

export const MARKETPLACE_SUMMARY_MAX = 280;
export const MARKETPLACE_NAME_MAX = 60;

export function cleanPublicName(value: unknown): string {
  const name = String(value ?? "").replace(/\s+/g, " ").trim().slice(0, MARKETPLACE_NAME_MAX);
  if (!name) throw new UserFacingError("Choose the name people see on your shares.");
  if (/@|https?:\/\/|www\./i.test(name) || /\d{5,}/.test(name.replace(/[\s().-]/g, ""))) throw new UserFacingError("Use a name, not an email address, phone number or link.");
  return name;
}

export type ShareWarning = { kind: "email" | "phone" | "link" | "name"; text: string; where: string };
const GREETING_NAME = /\b(?:[Hh]i|[Hh]ello|[Hh]ey|[Dd]ear|[Tt]hanks|[Tt]hank you|[Mm]orning|[Ee]vening)[,!]?\s+([A-Z][a-z]{2,})\b/g;
const NOT_NAMES = new Set(["There", "Again", "Everyone", "Team", "All", "Friend", "Friends", "Folks", "Neighbor", "Neighbour", "Sir", "Madam", "Both", "You", "Just", "So", "For", "From", "The"]);

/**
 * Email addresses, phone numbers, links and greetings that name a real person in one piece of text,
 * in the order they are checked. Merge fields such as {{First Name}} are ignored.
 */
export function textWarnings(raw: string | null, where: string): ShareWarning[] {
  const found: ShareWarning[] = [];
  const text = (raw ?? "").replace(/\{\{[^}]*\}\}/g, " ");
  for (const match of text.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)) found.push({ kind: "email", text: match[0], where });
  for (const match of text.matchAll(/(?:\+?\d[\s().-]{0,2}){8,}\d/g)) found.push({ kind: "phone", text: match[0].trim(), where });
  const withoutEmails = text.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, " ");
  for (const match of withoutEmails.matchAll(/\b(?:https?:\/\/|www\.)[^\s)]+|\b[a-z0-9-]+\.(?:com|net|org|io|co|ca|uk|us|biz|info|me|app)\b(?:\/[^\s)]*)?/gi)) found.push({ kind: "link", text: match[0].replace(/[.,;:!?]+$/, ""), where });
  for (const match of text.matchAll(GREETING_NAME)) if (!NOT_NAMES.has(match[1])) found.push({ kind: "name", text: match[1], where });
  return found;
}

/**
 * Look for details that should not be shared: email addresses, phone numbers, links and
 * greetings that name a real person instead of a {{First Name}} field, in every Beat, channel
 * version, connection name, path label and outcome that the public outline shows. Merge fields
 * are ignored. These are warnings; the author confirms before sharing.
 */
export function shareWarnings(value: PortablePackage): ShareWarning[] {
  const warnings: ShareWarning[] = [];
  const add = (warning: ShareWarning) => { if (warnings.length < 25 && !warnings.some(item => item.kind === warning.kind && item.text === warning.text)) warnings.push(warning); };
  const scan = (raw: string | null, where: string) => { for (const warning of textWarnings(raw, where)) add(warning); };
  scan(value.name, "Name"); scan(value.description, "Description");
  for (const mix of value.mixes) {
    for (const field of [mix.name, mix.description, mix.category, mix.industry, mix.framework, mix.dateType?.name ?? null]) scan(field, mix.name);
    for (const step of mix.steps) {
      const where = `${mix.name} · ${step.name}`;
      for (const field of [step.name, step.subject, step.body, step.script]) scan(field, where);
      for (const variant of step.variants) for (const field of [variant.subject, variant.body, variant.script]) scan(field, where);
    }
  }
  // Connection names, path labels and outcomes are printed in every public outline too.
  for (const rule of value.rules) {
    scan(rule.name, `Path: ${rule.name}`);
    for (const route of rule.routes) for (const field of [route.label, route.outcome]) scan(field, `Path: ${rule.name} · ${route.label}`);
  }
  return warnings;
}

export const warningLabel: Record<ShareWarning["kind"], string> = { email: "Email address", phone: "Phone number", link: "Link", name: "Possible name" };

export const MARKETPLACE_REVIEW_NOTE_MAX = 500;

/**
 * The author's optional note to staff when asking for another review: one paragraph of at most 500
 * characters that never carries a way to reach someone, so email addresses, phone numbers and links
 * are refused rather than passed on.
 */
export function cleanReviewNote(value: unknown): string | null {
  const note = String(value ?? "").replace(/\s+/g, " ").trim().slice(0, MARKETPLACE_REVIEW_NOTE_MAX);
  if (!note) return null;
  if (textWarnings(note, "Note").some(item => item.kind !== "name")) throw new UserFacingError("Leave email addresses, phone numbers and links out of the note. Our team can already read your share.");
  return note;
}

export type ReviewRequestBlock = "not-hidden" | "pending" | "open-report" | "unavailable" | "unchanged";

/**
 * Why the author cannot ask for another review of a share yet, or null when they can. Only a hidden
 * share qualifies, once staff have decided its reports, with no request already waiting, with something
 * to show, and changed since the last staff decision. A share hidden before decisions recorded a
 * fingerprint (`reviewedFingerprint` null) gets one request.
 */
export function reviewRequestBlock(input: { status: string; requestedAt: Date | null; openReports: number; available: boolean; fingerprint: string; reviewedFingerprint: string | null }): ReviewRequestBlock | null {
  if (input.status !== "HIDDEN") return "not-hidden";
  if (input.requestedAt) return "pending";
  if (input.openReports > 0) return "open-report";
  if (!input.available) return "unavailable";
  if (input.reviewedFingerprint !== null && input.reviewedFingerprint === input.fingerprint) return "unchanged";
  return null;
}

export const REVIEW_REQUEST_REFUSALS: Record<ReviewRequestBlock, string> = {
  "not-hidden": "Only a hidden share can be sent for another review.",
  pending: "You already asked for another review. We’ll let you know when our team has looked at it.",
  "open-report": "Our team is still reviewing a report on this share. We’ll let you know when the review is done.",
  unavailable: "This share has nothing to show right now, so there is nothing for our team to review.",
  unchanged: "Change the wording first. Another review looks at what you changed since our team’s decision."
};

/** Where a share stands after a staff reply, in the author’s words. */
export function reviewReplyOutcome(status: string): string {
  return status === "LIVE" ? "It’s shared on the Marketplace." : status === "HIDDEN" ? "It stays hidden." : "It isn’t hidden any more, and it isn’t shared right now.";
}

const channelFamily: Record<string, string> = { SMS: "TEXT", WHATSAPP: "TEXT", EMAIL: "EMAIL", PHONE_CALL: "CALL", VOICEMAIL: "CALL" };
export const MARKETPLACE_CHANNELS = [{ value: "TEXT", label: "Text" }, { value: "EMAIL", label: "Email" }, { value: "CALL", label: "Call" }] as const;
export const MARKETPLACE_SIZES = [{ value: "short", label: "1–3 Beats", min: 1, max: 3 }, { value: "medium", label: "4–9 Beats", min: 4, max: 9 }, { value: "long", label: "10 or more Beats", min: 10, max: 100_000 }] as const;

/** Directory facts cached on a listing from its live content. */
export function listingFacts(value: PortablePackage) {
  const steps = value.mixes.flatMap(mix => mix.steps);
  return { title: value.name, mixCount: value.mixes.length, beatCount: steps.length, channels: [...new Set(steps.map(step => channelFamily[step.channel] ?? "TEXT"))].sort() };
}
