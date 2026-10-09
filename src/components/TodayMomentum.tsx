"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ComponentProps, type ReactNode } from "react";
import { createPortal } from "react-dom";

type Section = "overdue" | "today" | "upcoming";
type Counts = Record<Section | "done", number>;
type JumpState = { jumpId?: string; status?: string; mixEnd?: unknown; origin?: string };

const CountsContext = createContext<Counts | null>(null);
const DUE_CARDS = '[data-today-section="overdue"] [data-jump-workflow], [data-today-section="today"] [data-jump-workflow]';
// The card's Review button, never the review's own "open your app" link, which shares the class.
const REVIEW_TRIGGER = ".sheet-trigger > .jump-channel-action";

function cardOf(jumpId: string): Element | null {
  return document.querySelector(`[data-jump-workflow="${CSS.escape(jumpId)}"]`);
}

/** The list section a follow-up's card sits in, read while the card is still in place. */
function sectionOf(jumpId: string): Section | null {
  const section = cardOf(jumpId)?.closest("[data-today-section]")?.getAttribute("data-today-section");
  return section === "overdue" || section === "today" || section === "upcoming" ? section : null;
}

/**
 * Today's counts change the moment an outcome is recorded here: the follow-up leaves its section for Done, and Undo
 * moves it back. Each read from the server (`readAt`) replaces these adjustments (D70, JITM-08 §2.36, TRU-06).
 */
export function TodayLiveCounts({ initial, readAt, children }: { initial: Counts; readAt: string; children: ReactNode }) {
  const key = `${readAt}:${initial.overdue}:${initial.today}:${initial.upcoming}:${initial.done}`;
  const [moved, setMoved] = useState<{ key: string; sections: Map<string, Section> }>({ key, sections: new Map() });
  const sections = useMemo(() => moved.key === key ? moved.sections : new Map<string, Section>(), [moved, key]);
  useEffect(() => {
    const onState = (event: Event) => {
      const detail = (event as CustomEvent<JumpState>).detail;
      const jumpId = detail?.jumpId;
      if (!jumpId) return;
      if (detail.status === "DONE" || detail.status === "SKIPPED") {
        // The outcome event arrives before React removes the card, so its section is still readable.
        const section = sectionOf(jumpId);
        if (!section) return;
        setMoved(current => ({ key, sections: new Map(current.key === key ? current.sections : []).set(jumpId, section) }));
      } else if (detail.status === "PENDING") {
        setMoved(current => {
          if (current.key !== key || !current.sections.has(jumpId)) return current;
          const next = new Map(current.sections);
          next.delete(jumpId);
          return { key, sections: next };
        });
      }
    };
    window.addEventListener("jitm:jump-state", onState);
    return () => window.removeEventListener("jitm:jump-state", onState);
  }, [key]);
  const counts = useMemo(() => {
    const live = { ...initial };
    for (const section of sections.values()) { live[section] = Math.max(0, live[section] - 1); live.done += 1; }
    return live;
  }, [initial, sections]);
  return <CountsContext.Provider value={counts}>{children}</CountsContext.Provider>;
}

/** One of Today's live counts. */
export function LiveCount({ name }: { name: keyof Counts }) {
  const counts = useContext(CountsContext);
  return <>{counts ? counts[name].toLocaleString("en-US") : null}</>;
}

/** A list section that leaves once its live count reaches 0, and returns on Undo; its cards stay mounted for Undo. */
export function LiveSection({ name, children, ...props }: { name: "overdue" | "today" } & Omit<ComponentProps<"section">, "hidden">) {
  const counts = useContext(CountsContext);
  return <section {...props} data-today-section={name} hidden={counts?.[name] === 0 || undefined}>{children}</section>;
}

/** The header's summary of what needs attention, kept in step with the live counts. */
export function LiveAttentionSummary() {
  const counts = useContext(CountsContext);
  if (!counts) return null;
  const attention = counts.overdue + counts.today;
  if (!attention) return <>Nothing else needs your attention right now.</>;
  return <>{`${attention.toLocaleString("en-US")} follow-up${attention === 1 ? " needs" : "s need"} your attention${counts.overdue ? ` · ${counts.overdue.toLocaleString("en-US")} overdue` : ""}.`}</>;
}

/**
 * After an outcome recorded in a review, or in the tray after the owner returns from their app, the next due follow-up's
 * review opens by itself, on phones and desktop. A quick action from the list leaves the list as it is. On a phone that
 * review covers the confirmation, so its Undo comes into the review for the same 10 seconds. Opening a review never
 * sends, records or skips anything (D70, JITM-08 §2.36). When the outcome finished a Mix, Today asks what's next for
 * that person first.
 */
export function TodayMomentum() {
  const [banner, setBanner] = useState<{ jumpId: string; name?: string; skipped: boolean; slot: Element; until: number; restoring?: boolean; error?: string } | null>(null);
  useEffect(() => {
    let frame = 0;
    const onState = (event: Event) => {
      const detail = (event as CustomEvent<JumpState>).detail;
      const jumpId = detail?.jumpId;
      if (!jumpId) return;
      if (detail.status === "PENDING") { setBanner(current => current?.jumpId === jumpId ? null : current); return; }
      if ((detail.status !== "DONE" && detail.status !== "SKIPPED") || detail.mixEnd || !detail.origin) return;
      const card = cardOf(jumpId);
      if (!card?.closest('[data-today-section="overdue"], [data-today-section="today"]')) return;
      const due = [...document.querySelectorAll<HTMLElement>(DUE_CARDS)].filter(item => item !== card && item.querySelector(REVIEW_TRIGGER));
      const next = due.find(item => card.compareDocumentPosition(item) & Node.DOCUMENT_POSITION_FOLLOWING) ?? due[0];
      const nextId = next?.getAttribute("data-jump-workflow");
      if (!nextId) return;
      const name = card.querySelector(".jump-card-heading h3")?.textContent?.trim() || undefined;
      const skipped = detail.status === "SKIPPED";
      // The card's own Undo lasts 10 seconds from the outcome (JumpWorkflowCard); the copy here ends with it.
      const until = Date.now() + 10_000;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        cardOf(nextId)?.querySelector<HTMLElement>(REVIEW_TRIGGER)?.click();
        let tries = 0;
        const findReview = () => {
          const dialog = cardOf(nextId)?.querySelector<HTMLDialogElement>(".follow-up-review-sheet[open]");
          if (!dialog) { if (++tries < 20) frame = requestAnimationFrame(findReview); return; }
          const slot = dialog.matches(":modal") ? dialog.querySelector("[data-sheet-momentum]") : null;
          setBanner(slot ? { jumpId, name, skipped, slot, until } : null);
        };
        frame = requestAnimationFrame(findReview);
      });
    };
    const onUndoFailed = (event: Event) => {
      const detail = (event as CustomEvent<{ jumpId?: string; error?: string }>).detail;
      setBanner(current => current && current.jumpId === detail?.jumpId ? { ...current, restoring: false, error: detail.error, until: Date.now() + 10_000 } : current);
    };
    window.addEventListener("jitm:jump-state", onState);
    window.addEventListener("jitm:undo-failed", onUndoFailed);
    return () => { window.removeEventListener("jitm:jump-state", onState); window.removeEventListener("jitm:undo-failed", onUndoFailed); cancelAnimationFrame(frame); };
  }, []);
  useEffect(() => {
    if (!banner) return;
    const timer = window.setTimeout(() => setBanner(null), Math.max(0, banner.until - Date.now()));
    return () => window.clearTimeout(timer);
  }, [banner]);
  if (!banner || !banner.slot.isConnected) return null;
  const undo = () => {
    setBanner({ ...banner, restoring: true, error: undefined });
    window.dispatchEvent(new CustomEvent("jitm:undo-request", { detail: { jumpId: banner.jumpId } }));
  };
  return createPortal(<div className="review-momentum">
    {/* The same words as the card's own confirmation (JumpWorkflowCard). */}
    <span><strong>{banner.skipped ? "Follow-up skipped" : "Follow-up completed"}</strong><small>{banner.name ? `${banner.name} · you can undo this for a moment` : "You can undo this for a moment"}</small>{banner.error && <small className="review-momentum-error" role="alert">{banner.error}</small>}</span>
    <button type="button" className="button small" onClick={undo} disabled={banner.restoring}>{banner.restoring ? "Restoring…" : "Undo"}</button>
  </div>, banner.slot);
}
