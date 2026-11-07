import { TodayLink } from "@/components/TodayNavigation";
import { formatDateTime, type DisplayFormatPreferences } from "@/lib/format";
import { zoneLabel } from "@/lib/display-labels";
import type { WorkflowAttention as Attention } from "@/lib/workflow-attention";
import { NextActionRow } from "@/components/NextAction";
import type { NextActionProjection } from "@/lib/next-action";

function pageHref(viewHref: string, name: string, value: number, hash = "") {
  const url = new URL(viewHref, "https://local.invalid");
  url.searchParams.set(name, String(value));
  return `${url.pathname}${url.search}${hash}`;
}

export function WorkflowAttention({ attention, projection, displayPreferences, viewHref = "/jumps" }: { attention: Attention<string | null> | null; projection?: NextActionProjection; displayPreferences?: DisplayFormatPreferences; viewHref?: string }) {
  if (attention && !attention.total && !attention.preparing) return null;
  return <section id="needs-your-input" aria-labelledby="needs-your-input-heading" data-workflow-refresh="true">
    <div className="section-label"><h2 id="needs-your-input-heading">Needs your input</h2>{attention && <span>{attention.total}</span>}</div>
    {!attention && <p role="status" className="notice">Couldn't check your next steps. <TodayLink href="/jumps">Retry Today</TodayLink></p>}
    {attention?.preparing && <p role="status" className="muted-copy">Your recorded updates are being prepared. This list will refresh.</p>}
    {attention?.items.map(item => item.nextAction && projection && displayPreferences
      ? <NextActionRow key={item.id} item={{ ...item.nextAction, title: item.contactName, detail: `${item.action} · ${item.label} · ${item.reason}` }} projection={projection} displayPreferences={displayPreferences} today />
      : <div className="contact-method-row" key={item.id}>
      <span><strong>{item.contactName}</strong><br /><span>{item.action} · {item.label}</span><br /><span>{item.reason}</span><br /><span className="muted-copy">Time not available</span></span>
      <TodayLink className="button small" href={item.href}>{item.action}</TodayLink>
    </div>)}
    {attention && attention.total > attention.items.length && <nav className="pagination-bar" aria-label="Items needing your input"><span>{(attention.offset ?? 0) + 1}–{(attention.offset ?? 0) + attention.items.length} of {attention.total}</span>{(attention.offset ?? 0) > 0 && <TodayLink className="button small" href={pageHref(viewHref, "attentionPage", Math.max(0, (attention.offset ?? 0) / 30 - 1), "#needs-your-input")}>Previous items</TodayLink>}{(attention.offset ?? 0) + attention.items.length < attention.total && <TodayLink className="button small" href={pageHref(viewHref, "attentionPage", (attention.offset ?? 0) / 30 + 1, "#needs-your-input")}>Next items</TodayLink>}</nav>}
  </section>;
}

export function UpcomingWorkflowCommitments({ attention, displayPreferences, viewHref = "/jumps" }: { attention: Attention<string | null> | null; displayPreferences: DisplayFormatPreferences; viewHref?: string }) {
  if (!attention?.future?.length) return null;
  return <div>{attention.future.map(item => <div className="contact-method-row" key={item.id}><span><strong>{item.contactName}</strong><br />{item.action} · {item.label}<br />{item.reason}<br />{formatDateTime(item.dueAt, { ...displayPreferences, timeZone: item.timezone })} ({zoneLabel(item.timezone)})</span><TodayLink className="button small" href={item.href}>{item.action}</TodayLink></div>)}{(attention.futureTotal ?? 0) > attention.future.length && <nav className="pagination-bar" aria-label="Upcoming callback pages">{(attention.futureOffset ?? 0) > 0 && <TodayLink className="button small" href={pageHref(viewHref, "callbackPage", (attention.futureOffset ?? 0) / 30 - 1)}>Previous callbacks</TodayLink>}{(attention.futureOffset ?? 0) + attention.future.length < (attention.futureTotal ?? 0) && <TodayLink className="button small" href={pageHref(viewHref, "callbackPage", (attention.futureOffset ?? 0) / 30 + 1)}>Next callbacks</TodayLink>}</nav>}</div>;
}
