import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Notice } from "@/components/Notice";
import { LibraryDraftForm } from "@/components/LibraryDraftForm";
import { LibraryPreview } from "@/components/LibraryPreview";
import { FormSubmitButton } from "@/components/FormSubmitButton";
import { requirePlatformAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getLibraryState } from "@/lib/library-store";
import { EMPTY_LIBRARY_CONTENT, LibraryError, type LibraryContent } from "@/lib/library-content";
import { normalizeSharedMixSteps } from "@/lib/shared-mix";
import { releaseSharedMixAction } from "@/lib/shared-mix-admin-actions";
import { displayPreferencesForUser } from "@/lib/display-preferences";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Admin · Library review" };
function Preview({ content }: { content: LibraryContent }) {
  try {
    const steps = normalizeSharedMixSteps(content.steps);
    return <LibraryPreview title={content.title} triggerMode={content.triggerMode} dateTypeName={content.dateTypeName} steps={steps} />;
  } catch { return <Notice type="error">This version has invalid content. Save a corrected draft before publishing.</Notice>; }
}
export default async function AdminEditTemplatePage({ params, searchParams }: {
  params: Promise<{ sharedMixId: string }>; searchParams: Promise<{ saved?: string; released?: string; error?: string; historyPage?: string }>;
}) {
  const { user, permissions } = await requirePlatformAdmin("mixes.edit");
  const { sharedMixId } = await params, query = await searchParams;
  let state;
  try { state = await getLibraryState(sharedMixId); } catch (error) { if (error instanceof LibraryError) notFound(); throw error; }
  const { shared, version, draftVersion, controlRevision } = state;
  const display = await displayPreferencesForUser(user.id);
  const historyPage = Math.max(1, Math.floor(Math.min(100_000, Number(query.historyPage) || 1)));
  const [revisions, releases, count, importedWorkspaces, imports] = await Promise.all([
    prisma.sharedMixRevision.findMany({ where: { sharedMixId }, orderBy: { version: "desc" }, take: 10, skip: (historyPage - 1) * 10 }),
    prisma.sharedMixRelease.findMany({ where: { sharedMixId }, orderBy: { controlRevision: "desc" }, take: 20 }),
    prisma.sharedMixRevision.count({ where: { sharedMixId } }),
    prisma.$queryRaw<Array<{ count: number }>>`SELECT COUNT(DISTINCT "workspaceId")::int AS count FROM "SharedMixImport" WHERE "sharedMixId" = ${sharedMixId}`,
    prisma.sharedMixImport.count({ where: { sharedMixId } })
  ]);
  const releasedVersions = new Set((await prisma.sharedMixRelease.findMany({ where: { sharedMixId, version: { in: revisions.map(r => r.version) }, action: { in: ["PUBLISH", "ROLLBACK"] } }, distinct: ["version"], select: { version: true } })).map(r => r.version));
  const canPublish = permissions.includes("mixes.publish");
  let draft = state.draft;
  try { draft = { ...draft, steps: normalizeSharedMixSteps(draft.steps) }; } catch { draft = { ...draft, steps: EMPTY_LIBRARY_CONTENT.steps }; }
  const releaseForm = (operation: "publish" | "rollback" | "unpublish", target: number, label: string) => <form action={releaseSharedMixAction} className="form-stack">
    <input type="hidden" name="sharedMixId" value={sharedMixId} /><input type="hidden" name="revision" value={controlRevision} /><input type="hidden" name="version" value={target} /><input type="hidden" name="operation" value={operation} />
    <label className="field"><span>Reason to {operation} version {target}</span><textarea name="reason" minLength={10} maxLength={500} required rows={2} /></label>
    <label className="field"><span>Your administrator password</span><input name="currentPassword" type="password" autoComplete="current-password" maxLength={72} required /></label>
    <FormSubmitButton label={label} pendingLabel="Saving publication…" />
  </form>;
  return <div className="page admin-template-editor-page">
    <header className="page-header"><div><h1>Review {draft.title}</h1><p>{shared.status === "APPROVED" ? `Version ${version} is published.` : "Hidden from the customer library."} Latest draft: version {draftVersion}.</p></div><Link className="button" href="/admin/templates">Back to mixes</Link></header>
    {query.saved && <Notice type="success">Draft version {query.saved} saved. Publication is a separate step.</Notice>}
    {query.released && <Notice type="success">Library publication updated.</Notice>}
    {query.error && <Notice type="error">{query.error}</Notice>}
    <div className="admin-editor-jumps" aria-label="Content workflow"><a href="#library-draft">1. Edit draft</a><a href="#library-review">2. Preview & publish</a><a href="#library-history">Version history</a></div>
    <details id="library-draft" className="card admin-editor-section admin-editor-disclosure" open={!query.saved && !query.released}><summary><h2>Edit the next draft</h2></summary><LibraryDraftForm key={controlRevision} id={sharedMixId} revision={controlRevision} content={draft} /></details>
    <details id="library-review" className="card admin-editor-section admin-editor-disclosure" open={Boolean(query.saved || query.released)}><summary><h2>Preview & publish · draft {draftVersion}</h2></summary>
      <section className="form-stack"><h2>Saved draft preview · version {draftVersion}</h2><p>{state.draft.description}</p><Preview content={state.draft} />
        <div className="admin-editor-impact"><p>Publishing changes future library copies. The {imports} existing copies across {importedWorkspaces[0]?.count ?? 0} customer workspaces keep their content.</p><p>Only the saved version below is published. Confirm with your password and a reason; MFA must have been verified in the last ten minutes.</p></div>
        {canPublish ? releaseForm("publish", draftVersion, `Publish version ${draftVersion}`) : <Notice type="info">Your role can save drafts. A publisher must review and release them.</Notice>}
      </section>
      {shared.status === "APPROVED" && <details className="admin-editor-disclosure"><summary>Currently published · version {version}</summary><Preview content={state.published} />{canPublish && releaseForm("unpublish", version, "Hide from customer library")}</details>}
    </details>
    <section id="library-history" className="card admin-editor-section"><details className="admin-editor-disclosure" open={Boolean(query.historyPage)}><summary><h2>Version history</h2></summary>{revisions.map(row => <details key={row.id}><summary>Version {row.version} · {formatDateTime(row.createdAt, display)} · {releasedVersions.has(row.version) ? "Previously published" : "Draft only"}</summary>
      <p>{row.reason}</p><p>Author: {row.actorUserId ?? "Application catalog or migration"}</p><Preview content={row.snapshot as unknown as LibraryContent} />
      {canPublish && releasedVersions.has(row.version) && (shared.status !== "APPROVED" || row.version !== version) && releaseForm("rollback", row.version, `Roll back to version ${row.version}`)}
    </details>)}
      <nav className="page-actions" aria-label="Version history pages">{historyPage > 1 && <Link href={`?historyPage=${historyPage - 1}`}>Newer versions</Link>}{historyPage * 10 < count && <Link href={`?historyPage=${historyPage + 1}`}>Older versions</Link>}</nav>
      <h3>Recent publications</h3>{releases.length ? releases.map(row => <p key={row.id}>{formatDateTime(row.createdAt, display)} · {row.action.toLowerCase()} version {row.version} · {row.reason}</p>) : <p>No publications yet.</p>}
    </details></section>
  </div>;
}
