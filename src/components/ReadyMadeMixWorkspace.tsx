import Link from "next/link";
import type { SharedMix, SharedMixMetadata } from "@/generated/prisma/client";
import { AppIcon } from "@/components/AppIcon";
import { MixBeatPreview } from "@/components/MixBeatPreview";
import { Notice } from "@/components/Notice";
import { PlanApproachGuide } from "@/components/PlanApproachGuide";
import { planGoalLabel } from "@/lib/business-taxonomy";
import { salesPlanById } from "@/lib/sales-plan-library";
import { normalizeSharedMixSteps, sharedMixContentIssue, sharedMixChannelLabel } from "@/lib/shared-mix";

type Props = {
  template: SharedMix;
  metadata: Pick<SharedMixMetadata, "triggerMode" | "dateTypeName"> | null;
  copies: { id: string; name: string; status: string }[];
  canUse: boolean;
};

export function ReadyMadeMixWorkspace({ template, metadata, copies, canUse }: Props) {
  const issue = sharedMixContentIssue(template.steps);
  const steps = issue ? [] : normalizeSharedMixSteps(template.steps);
  const plan = salesPlanById(template.id);
  const firstDay = steps.length ? Math.min(...steps.map(step => step.dayOffset)) : 0;
  const lastDay = steps.length ? Math.max(...steps.map(step => step.dayOffset)) : 0;
  const trigger = metadata?.triggerMode ?? "MANUAL_START";
  const start = trigger === "DATE_TRIGGERED" ? `From ${metadata?.dateTypeName || "a saved date"}.` : trigger === "BROADCAST" ? "On a date you choose during setup." : "When you start it for someone.";
  const useHref = `/templates/${template.id}/use`;

  return <div className="mix-edit-columns">
    <section id="selected-mix" className="mix-editor-workspace" aria-label="Selected ready-made Mix">
      <header className="mix-selected-header"><div><h2>{template.title}</h2><span className="status-pill">Ready-made</span></div>
        {canUse && !issue && <Link className="button small ready-made-preview-use" href={useHref}><AppIcon name="import" />Use this mix</Link>}
      </header>
      <p className="mix-selected-description">{template.description}</p>
      {issue ? <Notice type="error">This mix is being updated. Please choose another.</Notice> : <MixBeatPreview
        steps={steps.map((step, index) => ({ id: `${template.id}:${index}`, plannedAt: null, dayOffset: step.dayOffset, sendTimeMinutes: step.sendTimeMinutes, anchor: "CALENDAR_DAY", offsetMinutes: null, stepVersion: { subject: step.subject, body: step.body, script: step.script, stepTemplate: { name: step.name, channel: step.channel } } }))}
        gatedStepIds={[]} timezone="UTC" locale="en-US"
      />}
    </section>
    <aside className="mix-context-pane ready-made-context" aria-label="Ready-made Mix details">
      {canUse && !issue && <section className="ready-made-use"><h3><AppIcon name="import" />Make it yours</h3><p>Choose who it’s for and adjust the wording and timing.</p><Link className="button primary" href={useHref}><AppIcon name="import" />Use this mix</Link></section>}
      <section><h3><AppIcon name="clock" />Starts</h3><p>{start}</p></section>
      <section><h3><AppIcon name="mixes" />At a glance</h3><dl className="ready-made-facts">
        <dt>Goal</dt><dd>{planGoalLabel(template.category)}</dd>
        <dt>For</dt><dd>{template.framework === "Relationships" ? "Business, personal & networking" : template.industry || "Any business"}</dd>
        {!issue && <><dt>Beats</dt><dd>{steps.length}</dd><dt>Timing</dt><dd>{firstDay === lastDay ? `Day ${firstDay}` : `Day ${firstDay} to ${lastDay}`}</dd><dt>Channels</dt><dd>{[...new Set(steps.map(step => sharedMixChannelLabel(step.channel)))].join(", ")}</dd></>}
        {template.framework && <><dt>Approach</dt><dd>{template.framework === "Ready-made" ? "Everyday follow-up" : template.framework}</dd></>}
      </dl></section>
      {plan && <section><h3><AppIcon name="people" />Best for</h3><p>{plan.audience}</p><PlanApproachGuide plan={plan} /></section>}
      {copies.length > 0 && <section><h3><AppIcon name="check" />In My mixes</h3><ul>{copies.map(mix => <li key={mix.id}><Link href={`/mixes?mix=${mix.id}`}><strong>{mix.name}</strong><small>{mix.status.toLowerCase()}</small></Link></li>)}</ul></section>}
    </aside>
  </div>;
}
