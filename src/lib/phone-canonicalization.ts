import { canonicalRowKey, workspacePhoneRegion } from "@/lib/phone-number";
import { prisma } from "@/lib/prisma";

/**
 * The phone-key sweep: rewrites every stored `ContactPhone.normalized` to the canonical key for its
 * display value and its workspace's region (`canonicalPhoneKey`). It is convergent and idempotent:
 * each run recomputes every key from the untouched display value, so running it again changes
 * nothing, and it needs no progress bookkeeping. The release pipeline queues one run for every
 * workspace after the live smoke; changing a workspace's region queues one for that workspace.
 *
 * Per contact, under a row lock on the Contact (concurrent edits wait): rows whose keys collapse onto
 * one key are merged first, because a contact holds each key once (`@@unique([contactId, normalized])`).
 * The merge keeps the primary row, else the oldest; keeps the first non-empty label; and leaves
 * exactly one primary. Then the remaining keys are rewritten.
 */

export const PHONE_KEYS_TASK = "canonicalize-phones";

/** Thrown between contacts when the worker asks the sweep to stop; the job can simply run again. */
export class PhoneSweepInterruptedError extends Error {
  constructor() {
    super("The phone-key sweep stopped for a worker shutdown. It resumes from the start and skips rows that are already current.");
    this.name = "PhoneSweepInterruptedError";
  }
}

export type SweepPhoneRow = { id: string; phone: string; normalized: string; label: string | null; isPrimary: boolean; createdAt: Date };

export type ContactPhoneKeyPlan = {
  /** Rows to delete because another row of the same contact keeps their number. */
  deletes: SweepPhoneRow[];
  /** Surviving rows whose key, label or primary flag changes. */
  updates: Array<{ id: string; normalized: string; label: string | null; isPrimary: boolean; previous: SweepPhoneRow }>;
};

const PAGE_SIZE = 200;

function rank(a: SweepPhoneRow, b: SweepPhoneRow): number {
  if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
  const time = a.createdAt.getTime() - b.createdAt.getTime();
  if (time) return time;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * What the sweep does to one contact's phone rows (pure, so the release pipeline can record the same
 * plan in its manifest before the sweep runs and verify the result after it).
 */
export function planContactPhoneKeys(rows: SweepPhoneRow[], region: string): ContactPhoneKeyPlan {
  const groups = new Map<string, SweepPhoneRow[]>();
  for (const row of [...rows].sort(rank)) {
    const key = canonicalRowKey(row, region);
    const group = groups.get(key);
    if (group) group.push(row);
    else groups.set(key, [row]);
  }
  const deletes: SweepPhoneRow[] = [];
  const survivors: Array<{ row: SweepPhoneRow; normalized: string; label: string | null; isPrimary: boolean }> = [];
  for (const [normalized, group] of groups) {
    const [survivor, ...others] = group;
    deletes.push(...others);
    const label = others.length ? group.find((row) => row.label?.trim())?.label ?? null : survivor.label;
    survivors.push({ row: survivor, normalized, label, isPrimary: survivor.isPrimary });
  }
  // A merge never removes the primary (it ranks first in its group); a contact that had none gets one.
  if (deletes.length && survivors.length && !survivors.some((item) => item.isPrimary)) survivors[0].isPrimary = true;
  const updates = survivors
    .filter((item) => item.normalized !== item.row.normalized || item.label !== item.row.label || item.isPrimary !== item.row.isPrimary)
    .map((item) => ({ id: item.row.id, normalized: item.normalized, label: item.label, isPrimary: item.isPrimary, previous: item.row }));
  return { deletes, updates };
}

const phoneRowSelect = { id: true, phone: true, normalized: true, label: true, isPrimary: true, createdAt: true } as const;

async function sweepContact(contactId: string, workspaceId: string): Promise<{ rewritten: number; merged: number }> {
  return prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM "Contact" WHERE id = ${contactId} AND "workspaceId" = ${workspaceId} FOR UPDATE`;
    if (!locked.length) return { rewritten: 0, merged: 0 };
    const region = await workspacePhoneRegion(tx, workspaceId);
    const rows = await tx.contactPhone.findMany({ where: { contactId }, select: phoneRowSelect });
    const plan = planContactPhoneKeys(rows, region);
    if (!plan.deletes.length && !plan.updates.length) return { rewritten: 0, merged: 0 };
    if (plan.deletes.length) await tx.contactPhone.deleteMany({ where: { contactId, id: { in: plan.deletes.map((row) => row.id) } } });
    const rekeyed = plan.updates.filter((item) => item.normalized !== item.previous.normalized);
    // Park changing keys first so a rewrite never meets a key another row of this contact still holds.
    for (const item of rekeyed) await tx.contactPhone.update({ where: { id: item.id }, data: { normalized: `sweep:${item.id}` } });
    for (const item of plan.updates) {
      await tx.contactPhone.update({ where: { id: item.id }, data: { normalized: item.normalized, label: item.label, isPrimary: item.isPrimary } });
    }
    return { rewritten: rekeyed.length, merged: plan.deletes.length };
  });
}

/**
 * Recomputes every phone key, for one workspace or for all of them, a page of contacts at a time in
 * id order. Contacts whose keys are already current are only read. Stops cleanly between contacts
 * when `lease.shouldStop()` turns true (a worker shutdown), by throwing `PhoneSweepInterruptedError`.
 */
export async function runPhoneKeySweep(
  payload: { workspaceId?: string },
  lease: { shouldStop(): boolean }
): Promise<{ scanned: number; rewritten: number; merged: number }> {
  const totals = { scanned: 0, rewritten: 0, merged: 0 };
  const workspaceId = typeof payload?.workspaceId === "string" && payload.workspaceId ? payload.workspaceId : undefined;
  const regions = new Map<string, string>();
  let cursor: string | undefined;
  for (;;) {
    if (lease.shouldStop()) throw new PhoneSweepInterruptedError();
    const contacts = await prisma.contact.findMany({
      where: { ...(workspaceId ? { workspaceId } : {}), ...(cursor ? { id: { gt: cursor } } : {}), phones: { some: {} } },
      orderBy: { id: "asc" },
      take: PAGE_SIZE,
      select: { id: true, workspaceId: true, phones: { select: phoneRowSelect } }
    });
    if (!contacts.length) break;
    for (const contact of contacts) {
      totals.scanned += contact.phones.length;
      let region = regions.get(contact.workspaceId);
      if (!region) {
        region = await workspacePhoneRegion(prisma, contact.workspaceId);
        regions.set(contact.workspaceId, region);
      }
      const plan = planContactPhoneKeys(contact.phones, region);
      if (!plan.deletes.length && !plan.updates.length) continue;
      if (lease.shouldStop()) throw new PhoneSweepInterruptedError();
      const result = await sweepContact(contact.id, contact.workspaceId);
      totals.rewritten += result.rewritten;
      totals.merged += result.merged;
    }
    cursor = contacts[contacts.length - 1].id;
  }
  return totals;
}

/**
 * How many of a workspace's saved numbers a region change reads differently: numbers saved without a
 * country code (a number typed with "+" or an international prefix keeps its country). The owner sees
 * this before saving, because automatic texts go where the key points.
 */
export async function countPhonesReadAgain(workspaceId: string, from: string, to: string): Promise<number> {
  if (from === to) return 0;
  let count = 0;
  let cursor: string | undefined;
  for (;;) {
    const rows = await prisma.contactPhone.findMany({
      where: { contact: { workspaceId }, ...(cursor ? { id: { gt: cursor } } : {}) },
      orderBy: { id: "asc" },
      take: 1000,
      select: { id: true, phone: true, normalized: true }
    });
    for (const row of rows) if (canonicalRowKey(row, from) !== canonicalRowKey(row, to)) count += 1;
    if (rows.length < 1000) return count;
    cursor = rows[rows.length - 1].id;
  }
}
