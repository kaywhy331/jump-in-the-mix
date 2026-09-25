import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/EmptyState";
import { Notice } from "@/components/Notice";
import { requireWorkspace } from "@/lib/auth";
import { DuplicateMergeForm } from "@/components/DuplicateMergeForm";
import { prisma } from "@/lib/prisma";
import { BackLink } from "@/components/BackLink";
import { duplicateCandidates, type DuplicateGroup } from "@/lib/contact-duplicate-candidates";

export const metadata: Metadata = { title: "Duplicate Contacts" };

type SearchParams = { error?: string };

type CandidateContact = Awaited<ReturnType<typeof loadContacts>>[number];

async function loadContacts(workspaceId: string) {
  return prisma.contact.findMany({
    where: { workspaceId, archivedAt: null },
    include: { customFieldValues: { include: { definition: true } }, emails: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] }, phones: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] }, _count: { select: { jumps: true, jumpDates: true, groupMemberships: true } } },
    orderBy: [{ displayName: "asc" }, { createdAt: "asc" }],
    take: 10_000
  });
}

/** A value shared by more people than a pairwise review can show: one card that leads to the filtered list. */
function groupSummary(group: DuplicateGroup<CandidateContact>): { pill: string; heading: string; explanation: string } {
  const count = group.contacts.length.toLocaleString();
  if (group.kind === "phone") return { pill: "Shared phone", heading: `${count} people share ${group.label}`, explanation: "A number this many people share is usually an office or main line rather than duplicates, so they are not paired here. Open the list to review them." };
  if (group.kind === "email") return { pill: "Shared email", heading: `${count} people share ${group.label}`, explanation: "An address this many people share is usually a shared inbox rather than duplicates, so they are not paired here. Open the list to review them." };
  return { pill: "Shared name", heading: `${count} people share the name ${group.label}${group.company ? ` at ${group.company}` : ""}`, explanation: "A name this common is not paired here. Open the list to review them." };
}

function previewFields(contact: CandidateContact): Record<string, string | null> {
  return { Company: contact.company, Email: contact.emails[0]?.email ?? null, Phone: contact.phones[0]?.phone ?? null, ...Object.fromEntries(contact.customFieldValues.map(item => [item.definition.name, item.value])) };
}

function contactSummary(contact: CandidateContact) {
  return [contact.company, contact.emails[0]?.email, contact.phones[0]?.phone].filter(Boolean).join(" · ") || "No company, email, or phone";
}

export default async function DuplicateContactsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const [query, { workspace }] = await Promise.all([searchParams, requireWorkspace()]);
  const contacts = await loadContacts(workspace.id);
  const { pairs, groups } = duplicateCandidates(contacts);
  const total = await prisma.contact.count({ where: { workspaceId: workspace.id, archivedAt: null } });
  return (
    <div className="page duplicate-contacts-page">
      {query.error && <Notice type="error">{query.error}</Notice>}
      <BackLink href="/contacts" label="Contacts" /><header className="page-header"><div><h1>Duplicate Contacts</h1><p>Review people with matching names or contact details, then choose which record to keep.</p></div><div className="page-actions"><Link className="button" href="/contacts/archived">Archived</Link></div></header>
      <Notice type="info">Merging keeps contact methods, saved dates, tags, custom values, completed follow-ups, and history together. The extra record is archived so the change remains traceable.</Notice>
      {total > contacts.length && <Notice type="info">This review covers {contacts.length.toLocaleString()} of {total.toLocaleString()} active contacts, ordered by name. Matches outside that range have not been checked. Contact support for a complete large-address-book review.</Notice>}
      {pairs.length || groups.length ? <div className="duplicate-pair-list">{groups.map((group, index) => { const summary = groupSummary(group); return <article className="card duplicate-group" key={`${group.kind}:${index}`}><div className="duplicate-reasons"><span className="status-pill">{summary.pill}</span></div><h2>{summary.heading}</h2><p>{summary.explanation}</p><Link className="button" href={`/contacts?q=${encodeURIComponent(group.label)}`}>Show these {group.contacts.length.toLocaleString()} people</Link></article>; })}{pairs.map((pair) => <article className="card duplicate-pair" key={`${pair.left.id}:${pair.right.id}`}><div className="duplicate-reasons">{pair.reasons.map((reason) => <span className="status-pill" key={reason}>{reason}</span>)}</div><div className="duplicate-comparison"><section><h2>{pair.left.displayName}</h2><p>{contactSummary(pair.left)}</p><small>{pair.left._count.jumps} follow-ups · {pair.left._count.jumpDates} saved dates · {pair.left._count.groupMemberships} tags</small><Link href={`/contacts/${pair.left.id}`}>Open contact</Link></section><section><h2>{pair.right.displayName}</h2><p>{contactSummary(pair.right)}</p><small>{pair.right._count.jumps} follow-ups · {pair.right._count.jumpDates} saved dates · {pair.right._count.groupMemberships} tags</small><Link href={`/contacts/${pair.right.id}`}>Open contact</Link></section></div><DuplicateMergeForm left={{ id: pair.left.id, name: pair.left.displayName, fields: previewFields(pair.left) }} right={{ id: pair.right.id, name: pair.right.displayName, fields: previewFields(pair.right) }} /></article>)}</div> : <EmptyState title="No likely duplicates found" description="No contacts in the reviewed range share the same email, phone, or matching name and company." actionHref="/contacts" actionLabel="Return to contacts" />}
    </div>
  );
}
