"use client";

import { createContext, useContext, useLayoutEffect, useMemo, useRef, useState, type ComponentProps, type ReactNode, type RefObject } from "react";
import { Sheet } from "@/components/Sheet";
import type { TodayReviewPin } from "@/lib/today-review-placement";

const ReviewPlacement = createContext<{ pin: TodayReviewPin | null; opened: boolean }>({ pin: null, opened: false });

export const useTodayReviewPlacement = () => useContext(ReviewPlacement);

/** Observe Today's existing sheets without holding up its server reads. The pin belongs to this view and workspace,
 * and lasts only while the review is open. The fresh cards and counts can then share the same placement. */
export function TodayReviewPlacement({ root, viewKey, children }: { root: RefObject<HTMLDivElement | null>; viewKey: string; children: ReactNode }) {
  const [state, setState] = useState<{ viewKey: string; pin: TodayReviewPin | null; opened: boolean }>({ viewKey, pin: null, opened: false });
  const committed = useRef(state);
  const restore = useRef<{ jumpId: string; trigger: HTMLElement } | null>(null);
  useLayoutEffect(() => { committed.current = state; }, [state]);
  useLayoutEffect(() => {
    const element = root.current;
    if (!element) return;
    const sync = () => {
      const review = element.querySelector<HTMLDialogElement>(".follow-up-review-sheet[open]");
      const person = review?.closest<HTMLElement>("[data-today-contact]");
      const section = person?.closest<HTMLElement>("[data-today-section]");
      const jumpId = review?.closest<HTMLElement>("[data-jump-workflow]")?.dataset.jumpWorkflow;
      const name = section?.dataset.todaySection;
      const pin: TodayReviewPin | null = person && section && jumpId && (name === "overdue" || name === "today")
        ? { contactId: person.dataset.todayContact!, jumpId, section: name }
        : null;
      // Closing a review returns focus to its trigger. If releasing the pin reparents that trigger, restore it in the
      // new section too, without taking focus away from another control or a review the owner just opened.
      const previous = committed.current;
      const active = document.activeElement;
      if (!review && previous.viewKey === viewKey && previous.pin) {
        const card = element.querySelector<HTMLElement>(`[data-jump-workflow="${CSS.escape(previous.pin.jumpId)}"]`);
        const trigger = card?.querySelector<HTMLElement>("[data-review-trigger]");
        const closing = active instanceof Element && card?.contains(active) && (active.matches("[data-review-trigger]") || active.closest(".follow-up-review-sheet"));
        if (trigger && (closing || active === document.body)) restore.current = { jumpId: previous.pin.jumpId, trigger };
      }
      setState(current => {
        const sameView = current.viewKey === viewKey;
        const opened = Boolean(review) || (sameView && current.opened);
        const samePin = sameView && current.pin?.jumpId === pin?.jumpId && current.pin?.contactId === pin?.contactId;
        if (samePin && current.opened === opened) return current;
        return { viewKey, opened, pin: samePin ? current.pin : pin };
      });
    };
    const observer = new MutationObserver(sync);
    observer.observe(element, { subtree: true, childList: true, attributes: true, attributeFilter: ["open"] });
    sync();
    return () => observer.disconnect();
  }, [root, viewKey]);
  useLayoutEffect(() => {
    const target = restore.current;
    restore.current = null;
    if (!target || state.pin || state.viewKey !== viewKey) return;
    const frame = requestAnimationFrame(() => {
      if (target.trigger.isConnected || (document.activeElement !== document.body && document.activeElement?.isConnected)) return;
      root.current?.querySelector<HTMLElement>(`[data-jump-workflow="${CSS.escape(target.jumpId)}"] [data-review-trigger]`)?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [state, root, viewKey]);
  const value = useMemo(() => state.viewKey === viewKey ? { pin: state.pin, opened: state.opened } : { pin: null, opened: false }, [state, viewKey]);
  return <ReviewPlacement.Provider value={value}>{children}</ReviewPlacement.Provider>;
}

/** A section change after closing must not reopen the newly mounted Next up sheet. Explicit Review taps still work,
 * and navigating to another Today view restores its usual initial review behavior. */
export function TodayReviewSheet(props: ComponentProps<typeof Sheet>) {
  const { opened } = useTodayReviewPlacement();
  return <Sheet {...props} initiallyOpen={props.initiallyOpen && !opened} desktopInitiallyOpen={props.desktopInitiallyOpen && !opened} />;
}
