"use client";

import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentProps, type ReactNode } from "react";
import type { JumpStateDetail } from "@/components/JumpWorkflow";
import { setOpenReviewSlot } from "@/components/useConfirmationTarget";

type Section = "overdue" | "today" | "upcoming";
type Counts = Record<Section | "done", number>;
type Moved = { section: Section; overdue: boolean; skipped: boolean };

const CountsContext = createContext<{ counts: Counts; overdue: number; zero: string } | null>(null);
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

/** Whether a follow-up is overdue, also on a card under Today beside the person's follow-up due today (D71). */
function isOverdue(jumpId: string): boolean {
  return cardOf(jumpId)?.querySelector("[data-today-due]")?.getAttribute("data-today-due") === "overdue";
}

/**
 * Today's counts change the moment an outcome is recorded here: the follow-up leaves its section for Done, and Undo
 * moves it back. Done grows only where this view's Done counts that outcome (`doneCounts`, from the server). Each read
 * from the server (`readAt`) replaces these adjustments (D70, JITM-08 §2.36, TRU-06). `zero` is the header line the
 * server would show with nothing due. The sections count the follow-ups they show; `overdue`, for the header, counts
 * every overdue one, including one on a person's card under Today (D71).
 */
export function TodayLiveCounts({ initial, overdue, readAt, doneCounts, zero, children }: { initial: Counts; overdue: number; readAt: string; doneCounts: { done: boolean; skipped: boolean }; zero: string; children: ReactNode }) {
  const key = `${readAt}:${initial.overdue}:${initial.today}:${initial.upcoming}:${initial.done}:${overdue}`;
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
        const item = { section, overdue: isOverdue(jumpId), skipped: detail.status === "SKIPPED" };
        setMoved(current => ({ key, items: new Map(current.key === key ? current.items : []).set(jumpId, item) }));
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
    let overdueLeft = overdue;
    for (const item of items.values()) {
      counts[item.section] = Math.max(0, counts[item.section] - 1);
      if (item.overdue) overdueLeft = Math.max(0, overdueLeft - 1);
      if (item.skipped ? doneCounts.skipped : doneCounts.done) counts.done += 1;
    }
    return { counts, overdue: overdueLeft, zero };
  }, [initial, overdue, items, doneCounts.done, doneCounts.skipped, zero]);
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
  const zero = live?.counts[name] === 0;
  // A section leaves at 0 only once it holds no due card, so a count can never hide one (CNT-01).
  const section = useRef<HTMLElement>(null);
  const [holdsDue, setHoldsDue] = useState(false);
  useLayoutEffect(() => {
    const element = section.current;
    if (!zero || !element) return;
    const check = () => setHoldsDue(Boolean(element.querySelector("[data-today-due]")));
    check();
    const observer = new MutationObserver(check);
    observer.observe(element, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [zero]);
  return <section ref={section} {...props} data-today-section={name} hidden={(zero && !holdsDue) || undefined}>{children}</section>;
}

/** The header's summary of what needs attention, kept in step with the live counts. */
export function LiveAttentionSummary() {
  const live = useContext(CountsContext);
  if (!live) return null;
  const { counts, overdue, zero } = live;
  const attention = counts.overdue + counts.today;
  if (!attention) return <>{zero}</>;
  return <>{`${attention.toLocaleString("en-US")} follow-up${attention === 1 ? " needs" : "s need"} your attention${overdue ? ` · ${overdue.toLocaleString("en-US")} overdue` : ""}.`}</>;
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
      if (!slot) return;
      // A docked review that becomes a phone sheet (a narrower window, a rotated phone) drops what it reserved.
      if (slot.closest("dialog:modal")) { tallest = 0; slot.style.minHeight = ""; return; }
      tallest = Math.max(tallest, slot.getBoundingClientRect().height);
      slot.style.minHeight = tallest ? `${tallest}px` : "";
    });
    // A phone review's sheet pads its scrolling by the height of its action bar, which stays at the bottom. When the header
    // and the bar would take more than half the sheet, or the room between them can't hold the message, as with large text
    // or on a short screen, the bar scrolls with the review instead, so no field is caught between the two (JITM-07 §2.26,
    // LAY-06). Sticking changes no sizes (the bar keeps its padding), so the choice can't feed back on itself (LAY-08).
    let bar: HTMLElement | null = null, panel: HTMLElement | null = null, field: HTMLElement | null = null;
    // Each bar's height with no outcome choices open, kept while the review is closed and reopened (LAY-09), and the bars
    // whose choices are open, so opened choices are brought into view once.
    const restingHeights = new WeakMap<HTMLElement, number>();
    const choicesOpen = new WeakSet<HTMLElement>();
    // The highest point a scroll may bring a control to: the bottom of the sheet's header while it sticks, or the sheet's
    // top where the header scrolls with the review, on screens 480px high or less (A11Y-07).
    const stuckHeader = (sheet: HTMLElement) => {
      const header = sheet.querySelector<HTMLElement>(".sheet-header");
      return header && getComputedStyle(header).position === "sticky" ? header : null;
    };
    const ceilingOf = (sheet: HTMLElement) => {
      const top = sheet.getBoundingClientRect().top, header = stuckHeader(sheet);
      return header ? Math.max(top, header.getBoundingClientRect().bottom) : top;
    };
    // Opened outcome choices come into view, but the outcome button the owner tapped, which stays beside them, never goes
    // above the ceiling, and comes back below it if it went there (A11Y-06, A11Y-07). It's measured itself, since WebKit
    // doesn't focus a tapped button (LAY-11). The sheet keeps 24px below the last choice, as its scroll padding does.
    // Focus may have moved on by then, such as back into the message before the bar starts scrolling with the review. The
    // focused control's ring stays in view as well, its top below the ceiling first (A11Y-08). A control in the header is
    // left out only while the header sticks, when it can't move; on a short screen it scrolls like the rest (A11Y-09).
    const revealChoices = (sheet: HTMLElement, choices: HTMLElement) => {
      if (!choices.isConnected) return;
      const tapped = choices.previousElementSibling ?? choices;
      const ceiling = ceilingOf(sheet), bottom = sheet.getBoundingClientRect().bottom;
      const active = document.activeElement;
      const focused = active instanceof HTMLElement && active !== sheet && sheet.contains(active) && !stuckHeader(sheet)?.contains(active) && active.closest("dialog") === sheet.closest("dialog") ? active : null;
      const ring = focused ? (focused.closest<HTMLElement>(".speech-bubble--compose") ?? focused).getBoundingClientRect() : null;
      const keep = tapped.getBoundingClientRect().top - 6 - ceiling - 8;
      const overlap = (choices.lastElementChild ?? choices).getBoundingClientRect().bottom + 24 - bottom;
      let by = keep < 0 ? keep : Math.min(Math.max(overlap, 0), keep);
      if (ring) by = Math.min(Math.max(by, ring.bottom + 6 + 8 - bottom), ring.top - 6 - ceiling - 8);
      if (by) sheet.scrollBy({ top: by, behavior: "instant" });
    };
    const barSizes = new ResizeObserver(() => {
      if (!bar || !panel) return;
      const height = Math.ceil(bar.getBoundingClientRect().height);
      const header = panel.querySelector(".sheet-header")?.getBoundingClientRect().height ?? 0;
      panel.style.setProperty("--review-bar-height", `${height}px`);
      panel.style.setProperty("--review-header-height", `${Math.ceil(header)}px`);
      // Opening the outcome choices doesn't alone unstick a bar that fits: the half rule uses its height from before they
      // opened. The room rule uses the bar as it is, so choices that would leave the message no room make the bar scroll
      // with the review. Choices are brought into view when they open in a bar that scrolls with the review, or when the
      // bar starts scrolling with the review while they're open (LAY-09, A11Y-07).
      const choices = bar.querySelector<HTMLElement>("[data-outcome-choices]");
      if (!choices) { restingHeights.set(bar, height); choicesOpen.delete(bar); }
      const opening = Boolean(choices) && !choicesOpen.has(bar);
      if (choices) choicesOpen.add(bar);
      const resting = restingHeights.get(bar) ?? height;
      const flows = header + resting > panel.clientHeight / 2 || panel.clientHeight - header - height < (field?.getBoundingClientRect().height ?? 0) + 24;
      const started = flows && !panel.hasAttribute("data-review-bar-flows");
      panel.toggleAttribute("data-review-bar-flows", flows);
      const sheet = panel;
      if (choices && flows && (opening || started)) requestAnimationFrame(() => revealChoices(sheet, choices));
    });
    // A browser reveals only a focused text field's caret, so the rest of the field, and the focus ring its bubble draws,
    // can stay under the stuck bar or below the sheet's edge. Bring the whole ring into view above the bar, while its top
    // stays below the ceiling (JITM-10 §2.11, LAY-06, A11Y-05, A11Y-07). Rings sit 6px outside their box.
    const onFocus = (event: FocusEvent) => {
      const target = event.target;
      // A dialog over the review, such as "Discard your edits?", sits in its own layer and is left alone (A11Y-04).
      if (!(target instanceof HTMLElement) || !bar || !panel?.contains(target) || bar.contains(target) || target.closest("dialog") !== panel.closest("dialog")) return;
      requestAnimationFrame(() => {
        if (!bar || !panel || document.activeElement !== target) return;
        const box = (target.closest<HTMLElement>(".speech-bubble--compose") ?? target).getBoundingClientRect();
        const limit = getComputedStyle(bar).position === "sticky" ? bar.getBoundingClientRect().top : panel.getBoundingClientRect().bottom;
        const overlap = box.bottom + 6 + 8 - limit;
        if (overlap > 0) panel.scrollBy({ top: Math.min(overlap, Math.max(0, box.top - 6 - ceilingOf(panel) - 8)), behavior: "instant" });
      });
    };
    document.addEventListener("focusin", onFocus);
    const watchBar = () => {
      const next = document.querySelector<HTMLElement>(".follow-up-review-sheet[open]:modal .review-action-bar");
      // The message's bubble is what the owner sees, and it draws the field's focus ring.
      const message = next?.closest(".sheet-panel")?.querySelector<HTMLElement>("textarea") ?? null;
      const nextField = message?.closest<HTMLElement>(".speech-bubble--compose") ?? message;
      if (next === bar && nextField === field) return;
      for (const element of [bar, panel, field]) if (element) barSizes.unobserve(element);
      bar = next; panel = next?.closest<HTMLElement>(".sheet-panel") ?? null; field = nextField;
      for (const element of [bar, panel, field]) if (element) barSizes.observe(element);
    };
    const sync = () => {
      watchBar();
      if (opened && !(opened.isConnected && opened.open)) opened = null;
      // The review Today opened; on a phone, any open review, since each covers the floating stack.
      const host = opened ?? document.querySelector<HTMLDialogElement>(".follow-up-review-sheet[open]:modal");
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
      // The person's earlier follow-up on the same card is one the owner passed over by recording this one (D71).
      const person = card.closest("[data-person-group]");
      const passedOver = (item: Element) => Boolean(person?.contains(item) && item.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING);
      const due = [...document.querySelectorAll<HTMLElement>(DUE_CARDS)].filter(item => item !== card && item.querySelector(REVIEW_TRIGGER) && !passedOver(item));
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
      document.removeEventListener("focusin", onFocus);
      cancelAnimationFrame(frame); changes.disconnect(); sizes.disconnect(); barSizes.disconnect();
      if (slot) slot.style.minHeight = "";
      setOpenReviewSlot(null);
    };
  }, []);
  return null;
}
