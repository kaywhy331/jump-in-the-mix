"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { TodayLink } from "@/components/TodayNavigation";
import type { JumpStateDetail } from "@/components/JumpWorkflow";
import type { DisplayFormatPreferences } from "@/lib/format";
import { nextActionEmptyText, nextActionTime, withoutSettledActionVersions, type NextAction, type NextActionProjection } from "@/lib/next-action";

export function NextActionLink({ item, today = false, primary = false }: { item: NextAction; today?: boolean; primary?: boolean }) {
  const NavigationLink = today ? TodayLink : Link;
  return <NavigationLink className={`button next-action-link ${primary ? "primary contact-review-button" : "small"}`} href={item.href}>{item.action}</NavigationLink>;
}

export function NextActionRow({ item, projection, displayPreferences, today = false }: {
  item: NextAction; projection: NextActionProjection; displayPreferences: DisplayFormatPreferences; today?: boolean;
}) {
  return <div className="contact-method-row" data-next-action-id={item.id} data-next-action-kind={item.kind}>
    <span><strong>{item.title}</strong><br /><span>{item.detail}</span><br />
      <span className={item.timing === "overdue" ? "overdue-text" : "muted-copy"}>{nextActionTime(item, projection, displayPreferences)}</span></span>
    <NextActionLink item={item} today={today} />
  </div>;
}

/** One presentation of Next for both surfaces; existing review/outcome destinations remain responsible for writes. */
export function NextActionSummary({ projection, displayPreferences, today = false, restricted = false, retryHref,
  sequenceJumpId, children, emptyLabel }: { projection: NextActionProjection; displayPreferences: DisplayFormatPreferences; today?: boolean;
  restricted?: boolean; retryHref: string; sequenceJumpId?: string; children?: ReactNode; emptyLabel?: string }) {
  // A refresh is a new read, not a new version of each obligation. Keep settlement receipts
  // through delayed reads, and do not roll the view back when responses arrive out of order.
  const [snapshot, setSnapshot] = useState(projection);
  if (projection !== snapshot && Date.parse(projection.observedAt) >= Date.parse(snapshot.observedAt)) setSnapshot(projection);
  const [settled, setSettled] = useState<ReadonlyMap<string, string>>(() => new Map());
  useEffect(() => {
    const change = (event: Event) => {
      const detail = (event as CustomEvent<JumpStateDetail>).detail;
      if (!detail?.jumpId || !["DONE", "SKIPPED", "PENDING"].includes(detail.status)) return;
      setSettled(current => {
        const versions = new Map(current);
        if (detail.status === "PENDING") versions.delete(detail.jumpId);
        else {
          const version = snapshot.items.find(item => item.jumpId === detail.jumpId)?.updatedAt ?? snapshot.observedAt;
          const previous = versions.get(detail.jumpId);
          if (!previous || Date.parse(version) > Date.parse(previous)) versions.set(detail.jumpId, version);
        }
        return versions;
      });
    };
    window.addEventListener("jitm:jump-state", change);
    return () => window.removeEventListener("jitm:jump-state", change);
  }, [snapshot]);
  const live = withoutSettledActionVersions(snapshot, settled);
  const primary = restricted ? undefined : live.items[0];
  // Other people's work remains in Today's queues. A person's concurrent obligations stay together here.
  const secondary = primary ? live.items.filter(item => item.id !== primary.id && item.contactId === primary.contactId && item.timing !== "future") : [];
  const future = primary ? live.items.filter(item => item.id !== primary.id && item.contactId === primary.contactId && item.timing === "future") : [];
  const NavigationLink = today ? TodayLink : Link;
  return <section className={today ? "next-action-summary" : "contact-next-line"} aria-label={today ? "Next action" : "Next follow-up"} data-next-action-state={live.state}>
    <h2>Next</h2>
    {primary ? <>
      <div className="contact-next-description" data-next-action-id={primary.id} data-next-action-kind={primary.kind}>
        <strong>{today ? `${primary.contactName} · ${primary.title}` : primary.title}</strong>
        <span className={primary.timing === "overdue" ? "overdue-text" : ""}>{nextActionTime(primary, live, displayPreferences)}</span>
      </div>
      <NextActionLink item={primary} today={today} primary />
      {live.items.some(item => item.jumpId === sequenceJumpId) && children}
      {secondary.length > 0 && <details className="next-action-secondary"><summary>{secondary.length} more {secondary.length === 1 ? "action needs" : "actions need"} attention</summary>
        {secondary.map(item => <NextActionRow key={item.id} item={item} projection={live} displayPreferences={displayPreferences} today={today} />)}
      </details>}
      {future.length > 0 && <div className="next-action-secondary">
        {future.map(item => <div className="contact-method-row" key={item.id} data-next-action-id={item.id} data-next-action-kind={item.kind}>
          <NavigationLink className="button small next-action-link" href={item.href}>{item.title} · {nextActionTime(item, live, displayPreferences)}</NavigationLink>
        </div>)}
      </div>}
    </> : <div className="contact-next-empty"><strong>{restricted ? "Do not contact is on. Follow-ups are off." : live.state === "ready" && emptyLabel ? emptyLabel : nextActionEmptyText(live)}</strong></div>}
    {!restricted && live.state !== "ready" && <p role="status" className="next-action-status muted-copy">
      {primary && nextActionEmptyText(live)} {live.state === "unavailable" && <NavigationLink href={retryHref}>Try again</NavigationLink>}
    </p>}
  </section>;
}
