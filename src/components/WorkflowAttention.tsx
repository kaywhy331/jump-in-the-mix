import { TodayLink } from "@/components/TodayNavigation";
import { formatDateTime, type DisplayFormatPreferences } from "@/lib/format";
import type { WorkflowAttention as Attention } from "@/lib/workflow-attention";

export function WorkflowAttention({ attention }: { attention: Attention | null }) {
  if (attention && !attention.total && !attention.preparing) return null;
  return <section id="needs-your-input" aria-labelledby="needs-your-input-heading" data-workflow-refresh="true">
    <div className="section-label"><h2 id="needs-your-input-heading">Needs your input</h2>{attention && <span>{attention.total}</span>}</div>
    {!attention && <p role="status" className="notice">Couldn't check your next steps. <TodayLink href="/jumps">Retry Today</TodayLink></p>}
    {attention?.preparing && <p role="status" className="muted-copy">Your recorded updates are being prepared. This list will refresh.</p>}
    {attention?.items.map(item => <div className="contact-method-row" key={item.id}>
      <span><strong>{item.contactName}</strong><br /><span>{item.label} · {item.reason}</span></span>
      <TodayLink className="button small" href={item.href}>{item.action}</TodayLink>
    </div>)}
    {attention && attention.total > attention.items.length && <nav className="pagination-bar" aria-label="Items needing your input"><span>{(attention.offset ?? 0) + 1}–{(attention.offset ?? 0) + attention.items.length} of {attention.total}</span>{(attention.offset ?? 0) > 0 && <TodayLink className="button small" href={`/jumps?attentionPage=${Math.max(0, (attention.offset ?? 0) / 30 - 1)}#needs-your-input`}>Previous items</TodayLink>}{(attention.offset ?? 0) + attention.items.length < attention.total && <TodayLink className="button small" href={`/jumps?attentionPage=${(attention.offset ?? 0) / 30 + 1}#needs-your-input`}>Next items</TodayLink>}</nav>}
  </section>;
}

export function UpcomingWorkflowCommitments({ attention, displayPreferences }: { attention: Attention | null; displayPreferences: DisplayFormatPreferences }) {
  if (!attention?.future?.length) return null;
  return <div>{attention.future.map(item => <div className="contact-method-row" key={item.id}><span><strong>{item.contactName}</strong><br />{item.label} · {item.reason}<br />{formatDateTime(item.dueAt, { ...displayPreferences, timeZone: item.timezone })} ({item.timezone})</span><TodayLink className="button small" href={item.href}>Review work</TodayLink></div>)}{(attention.futureTotal ?? 0) > attention.future.length && <nav className="pagination-bar" aria-label="Upcoming callback pages">{(attention.futureOffset ?? 0) > 0 && <TodayLink className="button small" href={`/jumps?callbackPage=${(attention.futureOffset ?? 0) / 30 - 1}`}>Previous callbacks</TodayLink>}{(attention.futureOffset ?? 0) + attention.future.length < (attention.futureTotal ?? 0) && <TodayLink className="button small" href={`/jumps?callbackPage=${(attention.futureOffset ?? 0) / 30 + 1}`}>Next callbacks</TodayLink>}</nav>}</div>;
}
