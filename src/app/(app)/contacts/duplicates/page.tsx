import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/EmptyState";
import { Notice } from "@/components/Notice";
import { requireWorkspace } from "@/lib/auth";
import { mergeContactsAction } from "@/lib/contact-merge-actions";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Duplicate Contacts" };

type SearchParams = { error?: string };

type CandidateContact = Awaited<ReturnType<typeof loadContacts>>[number];
type CandidatePair = { left: CandidateContact; right: CandidateContact; reasons: string[] };

function normalized(value: string | null | undefined): string {
  return (value ?? "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

async function loadContacts(workspaceId: string) {
  return prisma.contact.findMany({
    where: { workspaceId, archivedAt: null },
    include: { emails: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] }, phones: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] }, _count: { select: { jumps: true, jumpDates: true, groupMemberships: true } } },
    orderBy: [{ displayName: "asc" }, { createdAt: "asc" }],
    take: 10_000
  });
}

function duplicateCandidates(contacts: CandidateContact[]): CandidatePair[] {
  const maps = {
    email: new Map<string, CandidateContact[]>(),
    phone: new Map<string, CandidateContact[]>(),
    identity: new Map<string, CandidateContact[]>()
  };
  for (const contact of contacts) {
    for (const email of contact.emails) maps.email.set(email.normalized, [...(maps.email.get(email.normalized) ?? []), contact]);
    for (const phone of contact.phones) maps.phone.set(phone.normalized, [...(maps.phone.get(phone.normalized) ?? []), contact]);
    const identity = [normalized(contact.displayName), normalized(contact.company)].filter(Boolean).join("|");
    if (identity && normalized(contact.displayName).length >= 4) maps.identity.set(identity, [...(maps.identity.get(identity) ?? []), contact]);
  }
  const pairs = new Map<string, CandidatePair>();
  const addGroups = (entries: Map<string, CandidateContact[]>, reason: (key: string) => string) => {
    for (const [key, group] of entries) {
      if (group.length < 2) continue;
      for (let leftIndex = 0; leftIndex < group.length - 1; leftIndex += 1) {
        for (let rightIndex = leftIndex + 1; rightIndex < group.length; rightIndex += 1) {
          const left = group[leftIndex];
          const right = group[rightIndex];
          if (left.id === right.id) continue;
          const ids = [left.id, right.id].sort();
          const pairKey = ids.join(":");
          const existing = pairs.get(pairKey);
          if (existing) existing.reasons.push(reason(key));
          else pairs.set(pairKey, { left: ids[0] === left.id ? left : right, right: ids[0] === left.id ? right : left, reasons: [reason(key)] });
        }
      }
    }
  };
  addGroups(maps.email, (key) => `Same email · ${key}`);
  addGroups(maps.phone, (key) => `Same phone · ${key}`);
  addGroups(maps.identity, () => "Same normalized name and company");
  return [...pairs.values()].map((pair) => ({ ...pair, reasons: [...new Set(pair.reasons)] })).sort((left, right) => right.reasons.length - left.reasons.length || left.left.displayName.localeCompare(right.left.displayName));
}

function contactSummary(contact: CandidateContact) {
  return [contact.company, contact.emails[0]?.email, contact.phones[0]?.phone].filter(Boolean).join(" · ") || "No company, email, or phone";
}

export default async function DuplicateContactsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const [query, { workspace }] = await Promise.all([searchParams, requireWorkspace()]);
  const contacts = await loadContacts(workspace.id);
  const pairs = duplicateCandidates(contacts);
  return (
    <div className="page duplicate-contacts-page">
      {query.error && <Notice type="error">{query.error}</Notice>}
      <header className="page-header"><div><h1>Duplicate Contacts</h1><p>Review people with matching names or contact details, then choose which record to keep.</p></div><div className="page-actions"><Link className="button" href="/contacts/archived">Archived</Link><Link className="button" href="/contacts">Active Contacts</Link></div></header>
      <Notice type="info">Merging keeps contact methods, saved dates, tags, custom values, completed follow-ups, and history together. The extra record is archived so the change remains traceable.</Notice>
      {pairs.length ? <div className="duplicate-pair-list">{pairs.map((pair) => <article className="card duplicate-pair" key={`${pair.left.id}:${pair.right.id}`}><div className="duplicate-reasons">{pair.reasons.map((reason) => <span className="status-pill" key={reason}>{reason}</span>)}</div><div className="duplicate-comparison"><section><h2>{pair.left.displayName}</h2><p>{contactSummary(pair.left)}</p><small>{pair.left._count.jumps} follow-ups · {pair.left._count.jumpDates} saved dates · {pair.left._count.groupMemberships} tags</small><Link href={`/contacts/${pair.left.id}`}>Open contact</Link></section><section><h2>{pair.right.displayName}</h2><p>{contactSummary(pair.right)}</p><small>{pair.right._count.jumps} follow-ups · {pair.right._count.jumpDates} saved dates · {pair.right._count.groupMemberships} tags</small><Link href={`/contacts/${pair.right.id}`}>Open contact</Link></section></div><form action={mergeContactsAction} className="form-grid duplicate-merge-form"><label className="field full"><span>Keep this contact</span><select name="survivorContactId" defaultValue={pair.left.id}><option value={pair.left.id}>{pair.left.displayName}</option><option value={pair.right.id}>{pair.right.displayName}</option></select></label><input type="hidden" name="sourceContactId" value={pair.right.id} data-merge-source /><label className="field full"><span>Type the other contact’s name to confirm</span><input name="confirmation" placeholder={pair.right.displayName} required /></label><small className="field full">If you change which contact to keep, type the name of the other one.</small><div className="form-actions field full"><button className="button danger" type="submit">Merge contacts</button></div></form></article>)}</div> : <EmptyState title="No likely duplicates found" description="No active contacts share the same email, phone, or matching name and company." actionHref="/contacts" actionLabel="Return to contacts" />}
    </div>
  );
}
