import { phoneEquivalenceKey, stripPhoneExtension } from "@/lib/phone-dial";
import { canonicalRowKey } from "@/lib/phone-number";

export type DuplicateCandidateContact = {
  id: string;
  displayName: string;
  company: string | null;
  emails: { email: string; normalized: string }[];
  phones: { phone: string; normalized: string }[];
};

export type DuplicatePair<T> = { left: T; right: T; reasons: string[] };

/** More people than a pairwise review can show share one value: usually an office line, a shared inbox or a common name. */
export type DuplicateGroup<T> = { kind: "phone" | "email" | "name"; label: string; company: string | null; contacts: T[] };

export type DuplicateReview<T> = { pairs: DuplicatePair<T>[]; groups: DuplicateGroup<T>[] };

/** Above this many people on one value, the page shows one summary card instead of every pair. */
export const DUPLICATE_PAIR_GROUP_LIMIT = 5;

function normalizedText(value: string | null | undefined): string {
  return (value ?? "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * One key per real-world number however it was typed: "(555) 234-5678", "+1 555 234 5678" and
 * "15552345678" agree. An extension keeps its own key, because x12 and x13 on one office line
 * are two desks, not one person. With the workspace's phone region this is the canonical phone key
 * (which keeps the extension, `+15552345678;ext=12`), read from the display value so a row the
 * phone-key sweep has not reached yet groups with its swept twins; without it, the North American
 * reading of the display value.
 */
export function phoneDuplicateKey(phone: { phone: string; normalized: string }, region?: string): string {
  if (region) return canonicalRowKey(phone, region);
  const key = phoneEquivalenceKey(phone.phone) ?? phone.normalized;
  const extension = phone.phone.slice(stripPhoneExtension(phone.phone).length).replace(/\D/g, "");
  return extension ? `${key} x${extension}` : key;
}

type Bucket<T> = { label: string; company: string | null; contacts: Map<string, T> };

function collect<T extends { id: string }>(buckets: Map<string, Bucket<T>>, key: string, contact: T, label: string, company: string | null = null): void {
  const bucket = buckets.get(key) ?? { label, company, contacts: new Map<string, T>() };
  bucket.contacts.set(contact.id, contact);
  buckets.set(key, bucket);
}

function byId<T extends { id: string }>(left: T, right: T): number {
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

/**
 * Likely duplicates among active contacts: pairs that share an email, a phone number (in any
 * format) or a name plus company, with the reasons per pair. A value shared by more than
 * `limit` people is returned as one group instead of n(n-1)/2 pairs.
 */
export function duplicateCandidates<T extends DuplicateCandidateContact>(contacts: T[], limit = DUPLICATE_PAIR_GROUP_LIMIT, region?: string): DuplicateReview<T> {
  const buckets = { email: new Map<string, Bucket<T>>(), phone: new Map<string, Bucket<T>>(), name: new Map<string, Bucket<T>>() };
  for (const contact of contacts) {
    for (const email of contact.emails) collect(buckets.email, email.normalized, contact, email.email);
    for (const phone of contact.phones) collect(buckets.phone, phoneDuplicateKey(phone, region), contact, phone.phone);
    const name = normalizedText(contact.displayName);
    if (name.length >= 4) collect(buckets.name, [name, normalizedText(contact.company)].filter(Boolean).join("|"), contact, contact.displayName, contact.company);
  }

  const pairs = new Map<string, DuplicatePair<T>>();
  const groups: DuplicateGroup<T>[] = [];
  const review = (kind: DuplicateGroup<T>["kind"], entries: Map<string, Bucket<T>>, reason: (label: string) => string) => {
    for (const bucket of entries.values()) {
      const members = [...bucket.contacts.values()];
      if (members.length < 2) continue;
      if (members.length > limit) {
        groups.push({ kind, label: bucket.label, company: bucket.company, contacts: members });
        continue;
      }
      for (let leftIndex = 0; leftIndex < members.length - 1; leftIndex += 1) {
        for (let rightIndex = leftIndex + 1; rightIndex < members.length; rightIndex += 1) {
          const [left, right] = [members[leftIndex], members[rightIndex]].sort(byId);
          const pairKey = `${left.id}:${right.id}`;
          const existing = pairs.get(pairKey);
          if (existing) existing.reasons.push(reason(bucket.label));
          else pairs.set(pairKey, { left, right, reasons: [reason(bucket.label)] });
        }
      }
    }
  };
  review("email", buckets.email, (label) => `Same email · ${label}`);
  review("phone", buckets.phone, (label) => `Same phone · ${label}`);
  review("name", buckets.name, () => "Same name and company");

  return {
    pairs: [...pairs.values()]
      .map((pair) => ({ ...pair, reasons: [...new Set(pair.reasons)] }))
      .sort((left, right) => right.reasons.length - left.reasons.length || left.left.displayName.localeCompare(right.left.displayName)),
    groups: groups.sort((left, right) => right.contacts.length - left.contacts.length || left.label.localeCompare(right.label))
  };
}
