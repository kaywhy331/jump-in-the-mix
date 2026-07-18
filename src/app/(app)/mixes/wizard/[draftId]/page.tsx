import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Notice } from "@/components/Notice";
import { SharedMixPreview } from "@/components/SharedMixPreview";
import {
  AI_MIX_CHANNELS,
  AI_MIX_REFINEMENT_PRESETS,
  parseAiMixPreflight,
  parseAiMixValidation,
  validateAiMixDraft
} from "@/lib/ai-mix";
import {
  cancelAiMixDraftAction,
  publishAiMixDraftAction,
  refineAiMixDraftAction,
  saveAiMixDraftAction
} from "@/lib/ai-mix-actions";
import { requireWorkspace } from "@/lib/auth";
import { formatTimeInput } from "@/lib/mix-broadcast";
import { getPlatformStringList } from "@/lib/platform-settings";
import { PLAN_LIMITS } from "@/lib/plans";
import { prisma } from "@/lib/prisma";
import { sharedMixChannelLabel } from "@/lib/shared-mix";

export const metadata: Metadata = { title: "Review AI Mix Draft" };

type SearchParams = { generated?: string; saved?: string; refined?: string; error?: string };
type RefinementPreset = (typeof AI_MIX_REFINEMENT_PRESETS)[number][0];

function triggerLabel(triggerMode: string): string {
  if (triggerMode === "DATE_TRIGGERED") return "Target Jump Date Type";
  if (triggerMode === "BROADCAST") return "Fixed-date broadcast";
  return "Manual start";
}

export default async function AiMixDraftPage({
  params,
  searchParams
}: {
  params: Promise<{ draftId: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const [{ draftId }, query, { workspace }, categories, industries, refinementLabels] = await Promise.all([
    params,
    searchParams,
    requireWorkspace(),
    getPlatformStringList("mix.categories"),
    getPlatformStringList("mix.industries"),
    getPlatformStringList("ai.refinementReasons")
  ]);
  const draftRecord = await prisma.aiMixDraft.findFirst({ where: { id: draftId, workspaceId: workspace.id } });
  if (!draftRecord) notFound();

  if (!PLAN_LIMITS[workspace.planTier].aiWizard) {
    return <div className="page"><Notice type="error">The AI Mix Wizard is available on Plus and Pro.</Notice><Link className="button" href="/mixes">Return to Mixes</Link></div>;
  }

  if (draftRecord.status !== "DRAFT" || draftRecord.expiresAt <= new Date()) {
    return (
      <div className="page ai-wizard-page">
        <header className="page-header"><div><h1>AI Mix draft unavailable</h1><p>This review draft was already used, canceled, or expired.</p></div></header>
        <Notice type="info">AI review drafts expire after 48 hours and can create only one editable Mix Draft.</Notice>
        <div className="page-actions"><Link className="button" href="/mixes">My Mixes</Link><Link className="button primary" href="/mixes/wizard">Start a new draft</Link></div>
      </div>
    );
  }

  let preflight;
  let generatedMix;
  let validation;
  try {
    preflight = parseAiMixPreflight(draftRecord.preflightPayload);
    generatedMix = validateAiMixDraft(draftRecord.generatedMix, preflight);
    validation = parseAiMixValidation(draftRecord.validation);
  } catch (error) {
    return (
      <div className="page ai-wizard-page">
        <header className="page-header"><div><h1>AI Mix draft needs regeneration</h1><p>The stored draft did not pass the current content rules.</p></div></header>
        <Notice type="error">{error instanceof Error ? error.message : "The AI Mix draft is invalid."}</Notice>
        <Link className="button primary" href="/mixes/wizard">Start a new draft</Link>
      </div>
    );
  }

  const audience = preflight.assignAllContacts ? "All active Contacts" : preflight.groupNames.join(", ");
  const allowedChannels = AI_MIX_CHANNELS.filter((channel) => channel !== "VOICEMAIL" || PLAN_LIMITS[workspace.planTier].ringlessVoicemailsPerMonth > 0);
  const expires = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(draftRecord.expiresAt);
  const presetByLabel = new Map<string, RefinementPreset>(
    AI_MIX_REFINEMENT_PRESETS.map(([presetValue, label]) => [label, presetValue])
  );
  const refinementOptions = refinementLabels.flatMap((label) => {
    const presetValue = presetByLabel.get(label);
    return presetValue ? [{ label, value: presetValue }] : [];
  });
  const effectiveRefinementOptions = refinementOptions.length
    ? refinementOptions
    : AI_MIX_REFINEMENT_PRESETS.map(([presetValue, label]) => ({ value: presetValue, label }));

  return (
    <div className="page ai-wizard-page ai-review-page">
      {query.generated && <Notice type="success">Your review draft is ready. Nothing has been activated.</Notice>}
      {query.saved && <Notice type="success">Draft changes saved.</Notice>}
      {query.refined && <Notice type="success">The refinement was applied. Review every Jump before creating the Mix.</Notice>}
      {query.error && <Notice type="error">{query.error}</Notice>}
      <header className="page-header">
        <div><h1>Review AI Mix Draft</h1><p>Edit the strategy and prepared content before it becomes a normal Mix Draft.</p></div>
        <div className="page-actions"><Link href="/mixes/wizard" className="button">New wizard draft</Link><Link href="/mixes" className="button">My Mixes</Link></div>
      </header>

      <div className="ai-review-status card">
        <div><strong>Revision {validation.revision}</strong><p>{validation.provider === "OPENAI" ? `Connected AI provider · ${validation.model}` : validation.provider === "MANUAL" ? "Manually edited" : "Built-in strategist"}</p></div>
        <div><strong>Expires</strong><p>{expires}</p></div>
        <div><strong>Trigger</strong><p>{triggerLabel(preflight.triggerMode)}{preflight.dateTypeName ? ` · ${preflight.dateTypeName}` : ""}</p></div>
        <div><strong>Audience</strong><p>{audience || "Not selected"}</p></div>
      </div>

      {validation.warnings.map((warning) => <Notice type="info" key={warning}>{warning}</Notice>)}

      <form action={saveAiMixDraftAction} className="ai-draft-editor-form">
        <input type="hidden" name="draftId" value={draftRecord.id} />
        <input type="hidden" name="stepCount" value={generatedMix.steps.length} />

        <section className="card">
          <div className="card-header"><div><h2>Strategy and discovery metadata</h2><p>These fields remain editable after the Mix Draft is created.</p></div><span className="status-pill">Draft only</span></div>
          <div className="form-grid">
            <div className="field full"><label htmlFor="name">Mix name</label><input id="name" name="name" defaultValue={generatedMix.name} maxLength={160} required /></div>
            <div className="field full"><label htmlFor="description">Description</label><textarea id="description" name="description" defaultValue={generatedMix.description} minLength={20} maxLength={1200} required /></div>
            <div className="field"><label htmlFor="category">Category</label><select id="category" name="category" defaultValue={generatedMix.category}>{categories.map((item) => <option key={item}>{item}</option>)}</select></div>
            <div className="field"><label htmlFor="industry">Industry</label><select id="industry" name="industry" defaultValue={generatedMix.industry}>{industries.map((item) => <option key={item}>{item}</option>)}</select></div>
            <div className="field full"><label htmlFor="draftFramework">Framework or approach</label><input id="draftFramework" name="draftFramework" defaultValue={generatedMix.framework} maxLength={160} required /></div>
          </div>
        </section>

        <section className="card ai-review-preview">
          <div className="card-header"><div><h2>Sequence preview</h2><p>The preview reflects the last saved or refined revision.</p></div><span className="status-pill">{generatedMix.steps.length} Jumps</span></div>
          <SharedMixPreview
            title={generatedMix.name}
            triggerMode={preflight.triggerMode}
            dateTypeName={preflight.dateTypeName}
            durationDays={generatedMix.durationDays}
            steps={generatedMix.steps}
            expanded
          />
        </section>

        <section className="card">
          <div className="card-header"><div><h2>Edit prepared Jumps</h2><p>Keep, remove, replace, or rewrite generated content. Additional Jumps can be added later in the normal Mix editor.</p></div></div>
          <div className="ai-draft-step-list">
            {generatedMix.steps.map((step, index) => (
              <fieldset className="ai-draft-step-card" key={`${index}-${step.name}`}>
                <legend>Jump #{index + 1} · {sharedMixChannelLabel(step.channel)}</legend>
                <label className="checkbox-card ai-step-keep"><input type="checkbox" name={`stepKeep-${index}`} defaultChecked /><span><strong>Keep this Jump</strong><small>Clear this box to remove it when saving, refining, or publishing.</small></span></label>
                <div className="form-grid">
                  <div className="field full"><label htmlFor={`stepName-${index}`}>Jump name</label><input id={`stepName-${index}`} name={`stepName-${index}`} defaultValue={step.name} maxLength={160} required /></div>
                  <div className="field"><label htmlFor={`stepChannel-${index}`}>Channel</label><select id={`stepChannel-${index}`} name={`stepChannel-${index}`} defaultValue={step.channel}>{allowedChannels.map((channel) => <option key={channel} value={channel}>{sharedMixChannelLabel(channel)}</option>)}</select></div>
                  <div className="field"><label htmlFor={`stepDayOffset-${index}`}>Day offset</label><input id={`stepDayOffset-${index}`} name={`stepDayOffset-${index}`} type="number" min={0} max={preflight.durationDays} defaultValue={step.dayOffset} required /></div>
                  <div className="field"><label htmlFor={`stepSendTime-${index}`}>Preferred local time</label><input id={`stepSendTime-${index}`} name={`stepSendTime-${index}`} type="time" defaultValue={formatTimeInput(step.sendTimeMinutes)} /></div>
                  <div className="field full"><label htmlFor={`stepSubject-${index}`}>Email subject</label><input id={`stepSubject-${index}`} name={`stepSubject-${index}`} defaultValue={step.subject ?? ""} maxLength={300} /></div>
                  <div className="field full"><label htmlFor={`stepBody-${index}`}>SMS, email, or WhatsApp content</label><textarea id={`stepBody-${index}`} name={`stepBody-${index}`} defaultValue={step.body ?? ""} rows={6} /></div>
                  <div className="field full"><label htmlFor={`stepScript-${index}`}>Phone or voicemail script</label><textarea id={`stepScript-${index}`} name={`stepScript-${index}`} defaultValue={step.script ?? ""} rows={6} /></div>
                  <label className="checkbox-card field full"><input type="checkbox" name={`stepIncludeOptOut-${index}`} defaultChecked={step.includeOptOut} /><span><strong>SMS opt-out delivery metadata</strong><small>This never inserts “Reply STOP” language into the prepared message.</small></span></label>
                </div>
              </fieldset>
            ))}
          </div>
        </section>

        <section className="card ai-refinement-card">
          <div className="card-header"><div><h2>Optional refinement</h2><p>Refinement uses your current editor values, so save-first is not required.</p></div></div>
          <div className="form-grid">
            <div className="field"><label htmlFor="refinementPreset">Refinement instruction</label><select id="refinementPreset" name="refinementPreset" defaultValue={effectiveRefinementOptions[0]?.value}>{effectiveRefinementOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></div>
            <div className="field"><label htmlFor="customRefinement">Custom instruction</label><input id="customRefinement" name="customRefinement" maxLength={500} placeholder="Example: Make the final call-to-action less sales-oriented" /></div>
            <div className="form-actions field full"><button type="submit" className="button" formAction={refineAiMixDraftAction}>Apply refinement</button></div>
          </div>
        </section>

        <div className="form-actions sticky-form-actions ai-review-actions">
          <button type="submit" className="button danger" formAction={cancelAiMixDraftAction}>Discard draft</button>
          <button type="submit" className="button">Save review draft</button>
          <button type="submit" className="button primary" formAction={publishAiMixDraftAction}>Create editable Mix Draft</button>
        </div>
      </form>
    </div>
  );
}
