"use client";

import Link, { useLinkStatus } from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { TodayLink } from "@/components/TodayNavigation";
import type { JumpStateDetail } from "@/components/JumpWorkflow";
import type { DisplayFormatPreferences } from "@/lib/format";
import { nextActionEmptyText, nextActionTime, withoutSettledActionVersions, type NextAction, type NextActionProjection } from "@/lib/next-action";

/** Native focus scrolling considers the control's box, not its outward focus indicator. */
function revealNextFocus(control: EventTarget | null) {
  if (!(control instanceof HTMLElement) || !control.matches(":focus-visible")) return;
  const box = control.getBoundingClientRect(), style = getComputedStyle(control);
  const outset = Math.max(0, parseFloat(style.outlineWidth) + parseFloat(style.outlineOffset));
  let left = 0, right = innerWidth, top = 0, bottom = innerHeight;
  for (let parent = control.parentElement; parent; parent = parent.parentElement) {
    const bounds = parent.getBoundingClientRect(), overflow = getComputedStyle(parent);
    if (/(hidden|clip|auto|scroll)/.test(overflow.overflowX)) { left = Math.max(left, bounds.left); right = Math.min(right, bounds.right); }
    if (/(hidden|clip|auto|scroll)/.test(overflow.overflowY)) { top = Math.max(top, bounds.top); bottom = Math.min(bottom, bounds.bottom); }
  }
  if (box.left - outset < left || box.right + outset > right || box.top - outset < top || box.bottom + outset > bottom) {
    control.scrollIntoView({ block: "center", inline: "center", behavior: "instant" });
  }
}

/** The link's label, marked while its page loads, so a tap shows at once that it was taken (UXA-02, audit A-01). */
function PendingLabel({ children }: { children: ReactNode }) {
  const { pending } = useLinkStatus();
  return <span className="next-action-link-label" data-pending={pending || undefined}>{children}</span>;
}

export function NextActionLink({ item, today = false, primary = false }: { item: NextAction; today?: boolean; primary?: boolean }) {
  const NavigationLink = today ? TodayLink : Link;
  return <NavigationLink className={`button next-action-link ${primary ? "primary contact-review-button" : "small"}`} href={item.href}><PendingLabel>{item.action}</PendingLabel></NavigationLink>;
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
  sequenceJumpId, children, emptyLabel, listedJumpIds }: { projection: NextActionProjection; displayPreferences: DisplayFormatPreferences; today?: boolean;
  restricted?: boolean; retryHref: string; sequenceJumpId?: string; children?: ReactNode; emptyLabel?: string;
  /** Follow-ups whose cards this page lists. Next leaves out one it would only repeat. */
  listedJumpIds?: readonly string[] }) {
  // A refresh is a new read, not a new version of each obligation. Keep settlement receipts
  // through delayed reads, and do not roll the view back when responses arrive out of order.
  const [snapshot, setSnapshot] = useState(projection);
  if (projection !== snapshot && Date.parse(projection.observedAt) >= Date.parse(snapshot.observedAt)) setSnapshot(projection);
  const [settled, setSettled] = useState<ReadonlyMap<string, string | null>>(() => new Map());
  useEffect(() => {
    const change = (event: Event) => {
      const detail = (event as CustomEvent<JumpStateDetail>).detail;
      if (!detail?.jumpId || !["DONE", "SKIPPED", "PENDING"].includes(detail.status)) return;
      setSettled(current => {
        const versions = new Map(current);
        if (detail.status === "PENDING") versions.delete(detail.jumpId);
        else {
          // A displayed pending version can precede another in-flight pending version.
          // Only the outcome's server version binds settlement; legacy events stay closed until Undo.
          const version = detail.updatedAt && Number.isFinite(Date.parse(detail.updatedAt)) ? detail.updatedAt : null;
          const previous = versions.get(detail.jumpId);
          if (!versions.has(detail.jumpId) || (previous && (!version || Date.parse(version) > Date.parse(previous)))) versions.set(detail.jumpId, version);
        }
        return versions;
      });
    };
    window.addEventListener("jitm:jump-state", change);
    return () => window.removeEventListener("jitm:jump-state", change);
  }, []);
  const live = withoutSettledActionVersions(snapshot, settled);
  const primary = restricted ? undefined : live.items[0];
  // Other people's work remains in Today's queues. A person's concurrent obligations stay together here.
  const secondary = primary?.contactId ? live.items.filter(item => item.id !== primary.id && item.contactId === primary.contactId && item.timing !== "future") : [];
  const future = primary ? live.items.filter(item => item.id !== primary.id && item.contactId === primary.contactId && item.timing === "future") : [];
  const NavigationLink = today ? TodayLink : Link;
  // Today's list already leads with that follow-up's card, marked Next up, so Next shows only work the list doesn't (UXA-02,
  // audit P-01). A state that isn't ready still says so.
  if (primary?.jumpId && listedJumpIds?.includes(primary.jumpId)) return live.state === "ready" ? null
    : <p role="status" className="next-action-status muted-copy">{nextActionEmptyText(live)} {live.state === "unavailable" && <NavigationLink href={retryHref}>Try again</NavigationLink>}</p>;
  return <section className={today ? "next-action-summary" : "contact-next-line"} aria-label={today ? "Next action" : "Next follow-up"} data-next-action-state={live.state}
    onFocusCapture={event => revealNextFocus(event.target)}>
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
