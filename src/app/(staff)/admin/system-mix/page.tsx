import type { Metadata } from "next";
import { Notice } from "@/components/Notice";
import { FormSubmitButton } from "@/components/FormSubmitButton";
import { SystemMixPreview } from "@/components/SystemMixPreview";
import { requirePlatformAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSystemMixState } from "@/lib/system-mix-store";
import { releaseSystemMixAction, saveSystemMixDraftAction } from "@/lib/system-mix-admin-actions";
import { displayPreferencesForUser } from "@/lib/display-preferences";
import { formatDateTime } from "@/lib/format";
import Link from "next/link";

export const metadata: Metadata = { title: "Admin · System Mix" };
export default async function SystemMixAdminPage({ searchParams }: { searchParams: Promise<{ saved?: string; released?: string; error?: string; historyPage?: string }> }) {
  const { user, permissions } = await requirePlatformAdmin("mixes.edit");
  const query = await searchParams, { config, published, draft } = await getSystemMixState();
  const display = await displayPreferencesForUser(user.id);
  const historyPage = Math.max(1, Math.floor(Math.min(100_000, Number(query.historyPage) || 1)));
  const [revisions, releases, count, members, queued] = await Promise.all([
    prisma.systemMixRevision.findMany({ where: { systemMixId: config.id }, orderBy: { version: "desc" }, take: 10, skip: (historyPage - 1) * 10 }),
    prisma.systemMixRelease.findMany({ where: { systemMixId: config.id }, orderBy: { controlRevision: "desc" }, take: 20 }),
    prisma.systemMixRevision.count({ where: { systemMixId: config.id } }),
    prisma.user.count({ where: { emailVerifiedAt: { not: null }, suspendedAt: null, referralInvitesIssued: { lt: 5 }, ownedWorkspaces: { some: {} } } }),
    prisma.waitlistDelivery.count({ where: { invite: { source: "REFERRAL" }, status: { in: ["QUEUED", "SENDING"] } } })
  ]);
  const publishedVersions = new Set((await prisma.systemMixRelease.findMany({ where: { systemMixId: config.id, version: { in: revisions.map(row => row.version) } }, distinct: ["version"], select: { version: true } })).map(row => row.version));
  const canPublish = permissions.includes("mixes.publish");
  const releaseForm = (operation: "publish" | "rollback", version: number) => <form action={releaseSystemMixAction} className="form-stack">
    <input type="hidden" name="revision" value={config.controlRevision} /><input type="hidden" name="version" value={version} /><input type="hidden" name="operation" value={operation} />
    <label className="field"><span>Reason to {operation} version {version}</span><textarea name="reason" minLength={10} maxLength={500} required rows={2} /></label>
    <label className="field"><span>Your administrator password</span><input name="password" type="password" autoComplete="current-password" maxLength={72} required /></label>
    <FormSubmitButton label={operation === "publish" ? `Publish version ${version}` : `Roll back to version ${version}`} pendingLabel="Saving publication…" />
  </form>;
  return <div className="page">
    <header className="page-header"><div><h1>System Mix invitation wording</h1><p>Version {config.publishedVersion} is published. Latest draft: version {config.draftVersion}.</p></div></header>
    {query.saved && <Notice type="success">Draft version {query.saved} saved for review.</Notice>}{query.released && <Notice type="success">System Mix publication updated.</Notice>}{query.error && <Notice type="error">{query.error}</Notice>}
    <section className="card form-stack"><h2>Release impact</h2><p>{members} verified members have personal invitations remaining. A publication changes their future invitation previews. The {queued} queued or sending invitations keep their prepared content and access links.</p>
      <p>Review the exact saved subject and introduction. Publishing requires your password, a reason, and MFA verification within the last ten minutes. Members with an older preview must review again before sending. Waitlist and staff invitation wording is managed separately.</p>
      <p>The five lifetime invitations and access rules are fixed. {permissions.includes("settings.manage") ? <Link href="/admin/admission">Use Admission to pause new referrals.</Link> : "An administrator with admission permissions can pause new referrals."}</p>
    </section>
    <section className="card form-stack"><h2>Saved draft preview · version {draft.version}</h2><SystemMixPreview key={draft.version} content={draft} />{canPublish && draft.version !== published.version ? releaseForm("publish", draft.version) : <p>{canPublish ? "This saved version is already published." : "Your role can save drafts. A publisher must review and release them."}</p>}</section>
    <section className="card form-stack"><h2>Currently published · version {published.version}</h2><SystemMixPreview key={published.version} content={published} /></section>
    <form key={config.controlRevision} action={saveSystemMixDraftAction} className="card form-stack"><h2>Edit the next draft</h2>
      <input type="hidden" name="revision" value={config.controlRevision} />
      <p>Use plain text and {"{{Sender Name}}"} in both fields. Include {"{{Contact Name}}"} in the introduction. Jump adds the account and preference links.</p>
      <label className="field"><span>Invitation subject</span><input name="subject" defaultValue={draft.subject} minLength={10} maxLength={180} required /></label>
      <label className="field"><span>Invitation introduction</span><textarea name="body" defaultValue={draft.body} minLength={40} maxLength={2000} rows={8} required /></label>
      <label className="field"><span>Reason for draft change</span><textarea name="reason" minLength={10} maxLength={500} rows={2} required /></label>
      <FormSubmitButton label="Save System Mix draft" pendingLabel="Saving draft…" />
    </form>
    <section className="card form-stack"><h2>Version history</h2>{revisions.map(row => <details key={row.id}><summary>Version {row.version} · {formatDateTime(row.createdAt, display)} · {publishedVersions.has(row.version) ? "Previously published" : "Draft only"}</summary>
      <p>{row.reason}</p>{permissions.includes("access.read") && <Link href={`/admin/access?systemMixVersion=${row.version}`}>Review invitations prepared with version {row.version}</Link>}<p>Author: {row.actorUserId ?? "Application migration"}</p><SystemMixPreview content={row} />{canPublish && publishedVersions.has(row.version) && row.version !== config.publishedVersion && releaseForm("rollback", row.version)}
    </details>)}<nav className="page-actions" aria-label="Version history pages">{historyPage > 1 && <Link href={`?historyPage=${historyPage - 1}`}>Newer versions</Link>}{historyPage * 10 < count && <Link href={`?historyPage=${historyPage + 1}`}>Older versions</Link>}</nav></section>
    <section className="card"><h2>Recent publications</h2>{releases.map(row => <p key={row.id}>{formatDateTime(row.createdAt, display)} · {row.action.toLowerCase()} version {row.version} · {row.reason}</p>)}</section>
  </div>;
}
