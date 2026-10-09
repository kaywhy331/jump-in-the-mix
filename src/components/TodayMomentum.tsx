"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ComponentProps, type ReactNode } from "react";
import type { JumpStateDetail } from "@/components/JumpWorkflow";
import { setOpenReviewSlot } from "@/components/useConfirmationTarget";

type Section = "overdue" | "today" | "upcoming";
type Counts = Record<Section | "done", number>;
type Moved = { section: Section; skipped: boolean };

const CountsContext = createContext<{ counts: Counts; zero: string } | null>(null);
const DUE_CARDS = '[data-today-section="overdue"] [data-jump-workflow], [data-today-section="today"] [data-jump-workflow]';
// The card's own Review button; the review's "open your app" link records a handoff and is never clicked.
const REVIEW_TRIGGER = ".sheet-trigger > [data-review-trigger]";

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
 * moves it back. Done grows only where this view's Done counts that outcome (`doneCounts`, from the server). Each read
 * from the server (`readAt`) replaces these adjustments (D70, JITM-08 §2.36, TRU-06). `zero` is the header line the
 * server would show with nothing due.
 */
export function TodayLiveCounts({ initial, readAt, doneCounts, zero, children }: { initial: Counts; readAt: string; doneCounts: { done: boolean; skipped: boolean }; zero: string; children: ReactNode }) {
  const key = `${readAt}:${initial.overdue}:${initial.today}:${initial.upcoming}:${initial.done}`;
  const [moved, setMoved] = useState<{ key: string; items: Map<string, Moved> }>({ key, items: new Map() });
  const items = useMemo(() => moved.key === key ? moved.items : new Map<string, Moved>(), [moved, key]);
  useEffect(() => {
    const onState = (event: Event) => {
      const detail = (event as CustomEvent<JumpStateDetail>).detail;
      const jumpId = detail?.jumpId;
      if (!jumpId) return;
      if (detail.status === "DONE" || detail.status === "SKIPPED") {
        // The outcome event arrives before React removes the card, so its section is still readable.
        const section = sectionOf(jumpId);
        if (!section) return;
        setMoved(current => ({ key, items: new Map(current.key === key ? current.items : []).set(jumpId, { section, skipped: detail.status === "SKIPPED" }) }));
      } else if (detail.status === "PENDING") {
        setMoved(current => {
          if (current.key !== key || !current.items.has(jumpId)) return current;
          const next = new Map(current.items);
          next.delete(jumpId);
          return { key, items: next };
        });
      }
    };
    window.addEventListener("jitm:jump-state", onState);
    return () => window.removeEventListener("jitm:jump-state", onState);
  }, [key]);
  const value = useMemo(() => {
    const counts = { ...initial };
    for (const item of items.values()) {
      counts[item.section] = Math.max(0, counts[item.section] - 1);
      if (item.skipped ? doneCounts.skipped : doneCounts.done) counts.done += 1;
    }
    return { counts, zero };
  }, [initial, items, doneCounts.done, doneCounts.skipped, zero]);
  return <CountsContext.Provider value={value}>{children}</CountsContext.Provider>;
}

/** One of Today's live counts. */
export function LiveCount({ name }: { name: keyof Counts }) {
  const live = useContext(CountsContext);
  return <>{live ? live.counts[name].toLocaleString("en-US") : null}</>;
}

/** A list section that leaves once its live count reaches 0, and returns on Undo; its cards stay mounted for Undo. */
export function LiveSection({ name, children, ...props }: { name: "overdue" | "today" } & Omit<ComponentProps<"section">, "hidden">) {
  const live = useContext(CountsContext);
  return <section {...props} data-today-section={name} hidden={live?.counts[name] === 0 || undefined}>{children}</section>;
}

/** The header's summary of what needs attention, kept in step with the live counts. */
export function LiveAttentionSummary() {
  const live = useContext(CountsContext);
  if (!live) return null;
  const { counts, zero } = live;
  const attention = counts.overdue + counts.today;
  if (!attention) return <>{zero}</>;
  return <>{`${attention.toLocaleString("en-US")} follow-up${attention === 1 ? " needs" : "s need"} your attention${counts.overdue ? ` · ${counts.overdue.toLocaleString("en-US")} overdue` : ""}.`}</>;
}

/**
 * After an outcome recorded in a review, or in the tray after the owner returns from their app, the next due follow-up's
 * review opens by itself, on phones and desktop, and confirmations with their Undo show inside it while it stays open
 * (useConfirmationTarget); on a phone they show inside any open review. A quick action from the list leaves the list as it is. Nothing opens while the owner is busy
 * elsewhere: another review, sheet or dialog is open, they are typing, or Today shows a notice they need to read.
 * Opening a review never sends, records or skips anything (D70, JITM-08 §2.36). When the outcome finished a Mix, Today
 * asks what's next for that person instead.
 */
export function TodayMomentum() {
  useEffect(() => {
    let frame = 0, opened: HTMLDialogElement | null = null, slot: HTMLElement | null = null, tallest = 0;
    // In a docked review the slot keeps the tallest height it has had while the review stays open, so a confirmation
    // leaving never moves the review's buttons up under the owner's pointer. A phone's sheet is anchored at the bottom,
    // where its handoff and outcomes stay, so nothing is reserved there.
    const sizes = new ResizeObserver(() => {
      if (!slot || slot.closest("dialog:modal")) return;
      tallest = Math.max(tallest, slot.getBoundingClientRect().height);
      slot.style.minHeight = tallest ? `${tallest}px` : "";
    });
    // A phone review's sheet pads its scrolling by the height of its action bar, which stays at the bottom.
    let bar: HTMLElement | null = null;
    const barSizes = new ResizeObserver(() => {
      const panel = bar?.closest<HTMLElement>(".sheet-panel");
      if (bar && panel) panel.style.setProperty("--review-bar-height", `${Math.ceil(bar.getBoundingClientRect().height)}px`);
    });
    const watchBar = () => {
      const next = document.querySelector<HTMLElement>(".follow-up-review-sheet[open]:modal .review-action-bar");
      if (next === bar) return;
      if (bar) barSizes.unobserve(bar);
      bar = next;
      if (bar) barSizes.observe(bar);
    };
    const sync = () => {
      watchBar();
      if (opened && !(opened.isConnected && opened.open)) opened = null;
      // The review Today opened; on a phone, any open review, since each covers the floating stack. None while Today asks
      // what's next for someone: that question floats, and the Undos stay beside it.
      const host = document.querySelector("#follow-up-confirmations [data-mix-end]") ? null : opened ?? document.querySelector<HTMLDialogElement>(".follow-up-review-sheet[open]:modal");
      const next = host?.querySelector<HTMLElement>("[data-sheet-momentum]") ?? null;
      if (next === slot) return;
      if (slot) { sizes.unobserve(slot); slot.style.minHeight = ""; }
      slot = next; tallest = 0;
      if (slot) sizes.observe(slot);
      setOpenReviewSlot(slot);
    };
    const changes = new MutationObserver(sync);
    changes.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["open"] });
    const onState = (event: Event) => {
      const detail = (event as CustomEvent<JumpStateDetail>).detail;
      const jumpId = detail?.jumpId;
      if (!jumpId || (detail.status !== "DONE" && detail.status !== "SKIPPED") || detail.mixEnd || !detail.origin) return;
      const card = cardOf(jumpId);
      if (!card?.closest('[data-today-section="overdue"], [data-today-section="today"]')) return;
      const due = [...document.querySelectorAll<HTMLElement>(DUE_CARDS)].filter(item => item !== card && item.querySelector(REVIEW_TRIGGER));
      const next = due.find(item => card.compareDocumentPosition(item) & Node.DOCUMENT_POSITION_FOLLOWING) ?? due[0];
      const nextId = next?.getAttribute("data-jump-workflow");
      if (!nextId) return;
      cancelAnimationFrame(frame);
      // Two frames later the finished card's review has closed and the tray has moved on, so anything still open, or
      // still asking, is the owner's.
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => {
          const focused = document.activeElement;
          if (document.querySelector("dialog[open], [data-today-notice]")) return;
          if (focused instanceof HTMLElement && focused.matches("input, textarea, select, [contenteditable]:not([contenteditable='false'])")) return;
          cardOf(nextId)?.querySelector<HTMLElement>(REVIEW_TRIGGER)?.click();
          // The review mounts on its first opening, a render after the click.
          let tries = 0;
          const find = () => {
            opened = cardOf(nextId)?.querySelector<HTMLDialogElement>(".follow-up-review-sheet[open]") ?? null;
            if (opened) sync();
            else if (++tries < 20) frame = requestAnimationFrame(find);
          };
          find();
        });
      });
    };
    window.addEventListener("jitm:jump-state", onState);
    return () => {
      window.removeEventListener("jitm:jump-state", onState);
      cancelAnimationFrame(frame); changes.disconnect(); sizes.disconnect(); barSizes.disconnect();
      if (slot) slot.style.minHeight = "";
      setOpenReviewSlot(null);
    };
  }, []);
  return null;
}
