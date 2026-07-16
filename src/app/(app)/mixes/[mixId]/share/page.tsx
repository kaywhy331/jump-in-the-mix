import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Notice } from "@/components/Notice";
import { SharedMixPreview } from "@/components/SharedMixPreview";
import { requireWorkspace } from "@/lib/auth";
import { formatPlanLimit, PLAN_LIMITS } from "@/lib/plans";
import { prisma } from "@/lib/prisma";
import { MIX_TEMPLATE_CATEGORIES, MIX_TEMPLATE_INDUSTRIES } from "@/lib/shared-mix";
import { shareMixAction, unpublishMixAction } from "@/lib/shared-mix-actions";
import { snapshotWorkspaceMix } from "@/lib/shared-mix-service";

export const metadata: Metadata = { title: "Share Mix" };

type SearchParams = {
  submitted?: string;
  unpublished?: string;
  error?: string;
};

export default async function ShareMixPage({
  params,
  searchParams
}: {
  params: Promise<{ mixId: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const [{ mixId }, query, { workspace }] = await Promise.all([params, searchParams, requireWorkspace()]);
  const [mix, sharedMetadata, activeShareCount, contributorProfile] = await Promise.all([
    prisma.mix.findFirst({
      where: { id: mixId, workspaceId: workspace.id, status: { not: "ARCHIVED" } },
      select: { id: true, name: true, description: true, category: true, industry: true, framework: true }
    }),
    prisma.sharedMixMetadata.findUnique({
      where: {
        publisherWorkspaceId_publisherMixId: {
          publisherWorkspaceId: workspace.id,
          publisherMixId: mixId
        }
      }
    }),
    prisma.sharedMixMetadata.count({
      where: {
        publisherWorkspaceId: workspace.id,
        isPlatform: false,
        reviewState: { in: ["PENDING", "APPROVED", "FLAGGED"] }
      }
    }),
    prisma.sharedMixContributorProfile.findUnique({ where: { workspaceId: workspace.id } })
  ]);
  if (!mix) notFound();
  const shared = sharedMetadata
    ? await prisma.sharedMix.findUnique({ where: { id: sharedMetadata.sharedMixId } })
    : null;

  let snapshot: Awaited<ReturnType<typeof snapshotWorkspaceMix>> | null = null;
  let snapshotError: string | null = null;
  try {
    snapshot = await snapshotWorkspaceMix(workspace.id, mix.id);
  } catch (error) {
    snapshotError = error instanceof Error ? error.message : "This Mix cannot be previewed.";
  }

  const profileReady = Boolean(contributorProfile?.enabled && contributorProfile.displayName?.trim());
  const shareLimit = PLAN_LIMITS[workspace.planTier].sharedMixes;
  const existingCounts = Boolean(sharedMetadata && ["PENDING", "APPROVED", "FLAGGED"].includes(sharedMetadata.reviewState));
  const atLimit = Number.isFinite(shareLimit) && activeShareCount >= shareLimit && !existingCounts;
  const canSubmit = profileReady && !atLimit && Boolean(snapshot);

  return (
    <div className="page mix-share-page">
      {query.submitted && <Notice type="success">Your Mix was submitted for moderation. It will appear in Community after approval.</Notice>}
      {query.unpublished && <Notice type="success">This Mix is no longer visible in the Community library.</Notice>}
      {query.error && <Notice type="error">{query.error}</Notice>}
      <header className="page-header">
        <div>
          <h1>Share {mix.name}</h1>
          <p>Contribute a reusable snapshot without exposing Contacts, Groups, completed Jumps, or workspace data.</p>
        </div>
        <div className="page-actions">
          <Link className="button" href="/templates?source=community">Community library</Link>
          <Link className="button" href={`/mixes/${mix.id}/edit`}>Back to Mix</Link>
        </div>
      </header>

      <div className="usage-line"><span>Community Mixes shared</span><strong>{activeShareCount}/{formatPlanLimit(shareLimit)}</strong></div>
      {shareLimit === 0 && <Notice type="info">Community sharing starts on Plus. You can still browse and import approved templates.</Notice>}
      {atLimit && <Notice type="error">Your sharing limit is full. Unpublish another Mix or upgrade your plan before submitting this one.</Notice>}
      {!profileReady && (
        <Notice type="info">Enable your Community Public Profile and add a display name before sharing. <Link href="/settings#community-profile">Complete profile</Link></Notice>
      )}
      {snapshotError && <Notice type="error">{snapshotError}</Notice>}

      {shared && sharedMetadata && (
        <section className="card shared-mix-status-card">
          <div className="section-label"><h2>Current sharing status</h2><span className={`status-pill ${sharedMetadata.reviewState === "APPROVED" ? "done" : ""}`}>{sharedMetadata.reviewState.toLowerCase()}</span></div>
          <p className="muted-copy">Version {sharedMetadata.version} · {shared.importCount} imports · {sharedMetadata.voteCount} votes</p>
          {sharedMetadata.moderationNote && <Notice type={sharedMetadata.reviewState === "REJECTED" || sharedMetadata.reviewState === "FLAGGED" ? "error" : "info"}>{sharedMetadata.moderationNote}</Notice>}
          {["PENDING", "APPROVED", "FLAGGED"].includes(sharedMetadata.reviewState) && (
            <details className="destructive-confirm">
              <summary className="button small danger">Unshare…</summary>
              <div className="destructive-confirm-panel">
                <p>Existing user imports remain independent. This only removes the template from future discovery.</p>
                <form action={unpublishMixAction}>
                  <input type="hidden" name="mixId" value={mix.id} />
                  <button className="button small danger" type="submit">Confirm unshare</button>
                </form>
              </div>
            </details>
          )}
        </section>
      )}

      {snapshot && (
        <section className="card">
          <div className="card-header"><div><h2>What the community will receive</h2><p>A human-readable, versioned copy of this Mix and its reusable Jumps.</p></div></div>
          <SharedMixPreview
            title={snapshot.name}
            triggerMode={snapshot.triggerMode}
            dateTypeName={snapshot.dateTypeName}
            durationDays={snapshot.durationDays}
            steps={snapshot.steps}
            expanded
          />
        </section>
      )}

      <section className="card">
        <div className="card-header"><div><h2>{shared ? "Update submission" : "Submit to Community"}</h2><p>Edits create a new version and return the template to moderation.</p></div></div>
        <form action={shareMixAction} className="form-grid">
          <input type="hidden" name="mixId" value={mix.id} />
          <div className="field full"><label htmlFor="title">Template title</label><input id="title" name="title" defaultValue={shared?.title ?? mix.name} maxLength={160} required /></div>
          <div className="field full"><label htmlFor="description">When should someone use this Mix?</label><textarea id="description" name="description" defaultValue={shared?.description ?? mix.description ?? ""} minLength={20} maxLength={1200} required /></div>
          <div className="field"><label htmlFor="category">Category</label><select id="category" name="category" defaultValue={shared?.category ?? mix.category ?? ""} required><option value="">Choose category</option>{MIX_TEMPLATE_CATEGORIES.map((item) => <option key={item}>{item}</option>)}</select></div>
          <div className="field"><label htmlFor="industry">Industry</label><select id="industry" name="industry" defaultValue={shared?.industry ?? mix.industry ?? ""} required><option value="">Choose industry</option>{MIX_TEMPLATE_INDUSTRIES.map((item) => <option key={item}>{item}</option>)}</select></div>
          <div className="field full"><label htmlFor="framework">Framework or approach</label><input id="framework" name="framework" defaultValue={shared?.framework ?? mix.framework ?? ""} maxLength={160} placeholder="Example: Question-led consultative follow-up" /></div>
          <div className="form-actions field full">
            <Link className="button" href="/mixes">Cancel</Link>
            <button className="button primary" type="submit" disabled={!canSubmit}>{shared ? "Submit updated version" : "Submit for review"}</button>
          </div>
        </form>
      </section>
    </div>
  );
}
