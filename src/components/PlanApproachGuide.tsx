import { SALES_APPROACHES, SALES_APPROACH_REVIEW_DATE } from "@/lib/sales-approaches";
import type { SalesPlan } from "@/lib/sales-plan-library";

export function PlanApproachGuide({ plan, expanded = false }: { plan: SalesPlan; expanded?: boolean }) {
  const approach = SALES_APPROACHES[plan.approachId];
  return <details className="plan-approach-guide" open={expanded}>
    <summary>When and how to use this mix</summary>
    <dl>
      <dt>Best for</dt><dd>{plan.audience}</dd>
      <dt>Start when</dt><dd>{plan.startWhen}</dd>
      <dt>Before starting</dt><dd>{plan.preparation}</dd>
      <dt>Approach</dt><dd><strong>{approach.label}</strong> · {approach.author}<p>{approach.principle}</p><p>{approach.adaptation}</p></dd>
      <dt>Set the tempo</dt><dd>The {plan.durationDays}-day cadence is a starting point. Match it to the buyer's timing and remove beats that no longer fit.</dd>
      <dt>When they respond</dt><dd>Stop this mix for that person from their contact page when they reply, book, decline, or ask you to stop. Agree on the next step in the conversation. Replies are not detected automatically.</dd>
    </dl>
    <p className="muted-copy">Original messages inspired by published principles. These cadences are our adaptations, not official scripts or a claim of guaranteed results.</p>
    <p className="muted-copy"><a href={approach.sourceUrl} target="_blank" rel="noopener noreferrer">Source: {approach.sourceTitle}</a> · Reviewed {SALES_APPROACH_REVIEW_DATE}</p>
  </details>;
}
