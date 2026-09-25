import { createHash } from "node:crypto";

/** The rows the contact edit form overwrites; anything else may change while the form is open. */
export type ContactRevisionSource = {
  firstName: string | null;
  lastName: string | null;
  displayName: string;
  company: string | null;
  publicNotes: string | null;
  privateNotes: string | null;
  emails: { email: string; normalized: string; label: string | null; isPrimary: boolean }[];
  phones: { phone: string; label: string | null; isPrimary: boolean }[];
  addresses: { id: string; label: string | null; street1: string | null; street2: string | null; city: string | null; state: string | null; postalCode: string | null; country: string | null; isPrimary: boolean }[];
  groupMemberships: { groupId: string }[];
  customFieldValues: { definitionId: string; value: string }[];
};

/** The relations the edit page loads and the save re-reads under its row lock. */
export const CONTACT_REVISION_INCLUDE = { emails: true, phones: true, addresses: true, groupMemberships: true, customFieldValues: true } as const;

export const STALE_CONTACT_SAVE = "This contact was changed on another device after you opened it. Reload to see the latest version, then apply your changes again.";

function ordered<T>(rows: T[], key: (row: T) => string): T[] {
  return [...rows].sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
}

/**
 * A fingerprint of exactly what an edit-form save replaces. The edit page sends it with the form and
 * the save recomputes it under a row lock: a difference means another device changed one of these
 * values in between, while writes the form never touches (relationship state, journey, activity,
 * `updatedAt` itself) leave it alone. Phones count by what the owner sees (the number as typed, its
 * label and the primary flag), never by the stored key, so the phone-key sweep rewriting a key does
 * not make an open form refuse to save.
 */
export function contactRevision(contact: ContactRevisionSource): string {
  const phones = contact.phones.map((row) => [row.phone, row.label, row.isPrimary] as const);
  const snapshot = [
    [contact.firstName, contact.lastName, contact.displayName, contact.company, contact.publicNotes, contact.privateNotes],
    ordered(contact.emails, (row) => row.normalized).map((row) => [row.normalized, row.email, row.label, row.isPrimary]),
    ordered(phones, (row) => JSON.stringify(row)),
    ordered(contact.addresses, (row) => row.id).map((row) => [row.id, row.label, row.street1, row.street2, row.city, row.state, row.postalCode, row.country, row.isPrimary]),
    ordered(contact.groupMemberships, (row) => row.groupId).map((row) => row.groupId),
    ordered(contact.customFieldValues, (row) => row.definitionId).map((row) => [row.definitionId, row.value])
  ];
  return createHash("sha256").update(JSON.stringify(snapshot)).digest("hex").slice(0, 32);
}
