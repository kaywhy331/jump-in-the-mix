import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AiMixReviewSteps } from "@/components/AiMixReviewSteps";
import { Notice } from "@/components/Notice";
import {
  AI_MIX_REFINEMENT_PRESETS,
  parseAiMixPreflight,
  parseAiMixValidation,
  type AiMixGeneratedDraft
} from "@/lib/ai-mix";
import {
  cancelAiMixDraftAction,
  publishAiMixDraftAction,
  refineAiMixDraftAction,
  saveAiMixDraftAction
} from "@/lib/ai-mix-actions";
import { validateEditableAiMixDraft } from "@/lib/ai-mix-editable";
import { requireWorkspace } from "@/lib/auth";
import { PLAN_LIMITS } from "@/lib/plans";
import { prisma } from "@/lib/prisma";
import { MIX_TEMPLATE_CATEGORIES, MIX_TEMPLATE_INDUSTRIES } from "@/lib/shared-mix";

export const metadata: Metadata = { title: "Review AI Mix" };

type SearchParams = { generated?: string; saved?: string; refined?: string; error?: string };

function generatedDraft(value: unknown, preflight: ReturnType<typeof parseAiMixPreflight>): AiMixGeneratedDraft {
  return validateEditableAiMixDraft(value, preflight);
}

export default async function AiMixDraftReviewPage({
  params,
  searchParams
}: {
  params: Promise<{ draftId: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const [{ draftId }, query, { workspace }] = await Promise.all([params, searchParams, requireWorkspace()]);
  if (!PLAN_LIMITS[workspace.planTier].aiWizard) redirect("/mixes");
  const draft = await prisma.aiMixDraft.findFirst({ where: { id: draftId, workspaceId: workspace.id } });
  if (!draft) notFound();
  if (draft.status !== "DRAFT") redirect("/mixes/wizard");
  if (draft.expiresAt <= new Date()) {
    await prisma.aiMixDraft.updateMany({ where: { id: draft.id, workspaceId: workspace.id, status: "DRAFT" }, data: { status: "EXPIRED" } });
    redirect("/mixes/wizard?error=This%20AI%20Mix%20review%20expired.%20Start%20a%20new%20review.");
  }

  const preflight = parseAiMixPreflight(draft.preflightPayload);
  const mix = generatedDraft(draft.generatedMix, preflight);
  const validation = parseAiMixValidation(draft.validation);
  const [activeContactCount, activeMixCount] = await Promise.all([
    prisma.contact.count({ where: { workspaceId: workspace.id, archivedAt: null } }),
    prisma.mix.count({ where: { workspaceId: workspace.id, status: "ACTIVE" } })
  ]);
  const audienceCount = preflight.assignAllContacts ? activeContactCount : preflight.groupNames.length;
  const projectedJumps = preflight.assignAllContacts ? activeContactCount * mix.steps.length : null;
  const activeMixLimit = PLAN_LIMITS[workspace.planTier].mixes;
  const activationAvailable = !Number.isFinite(activeMixLimit) || activeMixCount < activeMixLimit;
  const strategyLabel = validation.provider === "OPENAI" ? "Connected AI provider" : validation.provider === "BUILT_IN" ? "Built-in strategist" : "Manually edited review";

  return (
    <div className="page ai-draft-review-page">
      {query.generated && <Notice type="success">Review created. Rewrite, add, remove, or reorder actions before saving or activating.</Notice>}
      {query.saved && <Notice type="success">Review saved. It remains available until {new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(draft.expiresAt)}.</Notice>}
      {query.refined && <Notice type="success">Refinement applied. Review every action before activation.</Notice>}
      {query.error && <Notice type="error">{query.error}</Notice>}
      <header className="page-header"><div><h1>Final Mix review</h1><p>This is the last required review. Save it as a Draft or activate it directly.</p></div><div className="page-actions"><Link href="/mixes/wizard" className="button">New review</Link><Link href="/mixes" className="button">My Mixes</Link></div></header>
      <div className="ai-draft-status-grid">
        <article className="card"><small>Strategist</small><strong>{strategyLabel}</strong><span>Revision {validation.revision}</span></article>
        <article className="card"><small>Audience</small><strong>{preflight.assignAllContacts ? `${activeContactCount.toLocaleString()} active Contacts` : `${preflight.groupNames.length} Contact Group${preflight.groupNames.length === 1 ? "" : "s"}`}</strong><span>{preflight.groupNames.join(", ") || "Workspace snapshot"}</span></article>
        <article className="card"><small>Trigger</small><strong>{preflight.triggerMode.replaceAll("_", " ").toLowerCase()}</strong><span>{preflight.dateTypeName || preflight.broadcastDate || preflight.broadcastTimezone}</span></article>
        <article className="card"><small>Projected workload</small><strong>{projectedJumps === null ? "Dynamic Group audience" : `${projectedJumps.toLocaleString()} future Jumps`}</strong><span>{mix.steps.length} actions · {mix.durationDays} day span</span></article>
      </div>
      {validation.provider === "BUILT_IN" && <Notice type="info">The built-in strategist produced this version. Provider diagnostics are retained for administrators but are not exposed in the customer review.</Notice>}
      {!activationAvailable && <Notice type="error">Your active Mix allowance is full. Save this review as a Draft, then pause or archive another Mix before activation.</Notice>}

      <form className="ai-draft-editor-form">
        <input type="hidden" name="draftId" value={draft.id} />
        <section className="card ai-draft-overview">
          <div className="form-grid">
            <div className="field full"><label htmlFor="name">Mix name</label><input id="name" name="name" defaultValue={mix.name} maxLength={160} required /></div>
            <div className="field full"><label htmlFor="description">Description</label><textarea id="description" name="description" defaultValue={mix.description} maxLength={1200} required /></div>
            <div className="field"><label htmlFor="category">Category</label><select id="category" name="category" defaultValue={mix.category}>{MIX_TEMPLATE_CATEGORIES.map((item) => <option key={item}>{item}</option>)}</select></div>
            <div className="field"><label htmlFor="industry">Industry</label><select id="industry" name="industry" defaultValue={mix.industry}>{MIX_TEMPLATE_INDUSTRIES.map((item) => <option key={item}>{item}</option>)}</select></div>
            <div className="field full"><label htmlFor="draftFramework">Framework</label><input id="draftFramework" name="draftFramework" defaultValue={mix.framework} maxLength={160} required /></div>
          </div>
        </section>

        <section className="card ai-draft-steps">
          <AiMixReviewSteps initialSteps={mix.steps} allowedChannels={preflight.channels} durationDays={preflight.durationDays} />
        </section>

        <section className="card ai-refinement-panel">
          <div className="card-header"><div><h2>Optional refinement</h2><p>Apply one controlled refinement to the current form values.</p></div></div>
          <div className="form-grid"><div className="field"><label htmlFor="refinementPreset">Refinement</label><select id="refinementPreset" name="refinementPreset" defaultValue="FRIENDLIER">{AI_MIX_REFINEMENT_PRESETS.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></div><div className="field full"><label htmlFor="customRefinement">Custom instruction</label><textarea id="customRefinement" name="customRefinement" maxLength={1000} placeholder="Used only when Custom is selected. Do not paste Contact data." /></div></div>
          <button className="button" type="submit" formAction={refineAiMixDraftAction}>Apply refinement</button>
        </section>

        <section className="card ai-publish-review">
          <h2>Final decision</h2>
          <div className="import-summary-grid"><div><strong>{audienceCount.toLocaleString()}</strong><span>{preflight.assignAllContacts ? "Contacts" : "Groups"}</span></div><div><strong>{mix.steps.length}</strong><span>Actions</span></div><div><strong>{mix.durationDays}</strong><span>Day span</span></div><div><strong>{preflight.channels.length}</strong><span>Channels</span></div></div>
          <p>Activation creates only user-confirmed native actions. It does not silently send messages.</p>
          <div className="sticky-form-actions"><button className="button" type="submit" formAction={saveAiMixDraftAction}>Save review</button><button className="button" type="submit" name="publishMode" value="DRAFT" formAction={publishAiMixDraftAction}>Create Mix Draft</button><button className="button primary" type="submit" name="publishMode" value="ACTIVE" formAction={publishAiMixDraftAction} disabled={!activationAvailable}>Activate Mix</button></div>
        </section>
      </form>
      <form action={cancelAiMixDraftAction} className="ai-draft-discard"><input type="hidden" name="draftId" value={draft.id} /><button className="text-button danger-text" type="submit">Discard this review</button></form>
    </div>
  );
}
