"use client";

import { useEffect, useRef, type RefObject } from "react";
import { DOCKED_REVIEW_MEDIA } from "@/lib/sheet-layout";
import { SwipeTracker, blockedStart, motionMs, scrolledBelowTop, type Axis, type Direction, type SwipeNode, type SwipeRelease } from "@/lib/gestures/swipe";

export type SwipeOptions = {
  axis: Axis;
  direction: Direction;
  /** Whether the surface takes gestures in its current layout. The engine also runs for coarse pointers only. */
  active: (surface: HTMLElement) => boolean;
  /** The surface's own start rule, checked after the shared exclusions. */
  accepts?: (target: Element, surface: HTMLElement) => boolean;
  /** The length a commit is measured against and travels: the sheet's height, or the viewport's width. */
  size: (surface: HTMLElement) => number;
  /** Runs once a commit has settled. Returning or resolving `false` keeps the surface: it springs back. */
  onCommit: () => unknown;
};

/**
 * Binds the gesture engine to the element `ref` points at, rebinding when it mounts or changes. The surface
 * follows the finger 1:1 through `transform` only, then settles with the motion tokens (JITM-06 §2.39).
 */
export function useSwipe(ref: { readonly current: HTMLElement | null }, options: SwipeOptions) {
  const latest = useRef(options);
  const bound = useRef<{ surface: HTMLElement; unbind: () => void } | null>(null);
  useEffect(() => { latest.current = options; });
  useEffect(() => {
    const surface = ref.current;
    if (bound.current?.surface === surface) return;
    bound.current?.unbind();
    bound.current = surface ? { surface, unbind: bind(surface, latest) } : null;
  });
  useEffect(() => () => { bound.current?.unbind(); bound.current = null; }, []);
}

function bind(surface: HTMLElement, options: RefObject<SwipeOptions>): () => void {
  const { axis, direction } = options.current;
  const tracker = new SwipeTracker(axis, direction);
  const coarse = window.matchMedia("(pointer: coarse)");
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  let frame = 0, timer = 0;
  let settling: (() => void) | null = null;

  const place = (distance: number) => {
    const offset = `${direction * distance}px`;
    surface.style.transform = axis === "x" ? `translate3d(${offset}, 0, 0)` : `translate3d(0, ${offset}, 0)`;
  };
  const paint = () => { frame = 0; place(tracker.distance); };
  const clear = () => {
    window.cancelAnimationFrame(frame);
    window.clearTimeout(timer);
    frame = 0;
    settling = null;
    surface.style.transform = "";
    delete surface.dataset.swipeState;
  };
  // Where the surface is now, part way through a settle.
  const current = () => {
    const transform = getComputedStyle(surface).transform;
    const matrix = new DOMMatrixReadOnly(transform === "none" ? undefined : transform);
    return direction * (axis === "x" ? matrix.m41 : matrix.m42);
  };
  const animate = (state: "settle" | "cancel", distance: number, done: () => void) => {
    window.cancelAnimationFrame(frame);
    frame = 0;
    const ms = motionMs(getComputedStyle(surface).getPropertyValue(state === "settle" ? "--motion-settle" : "--motion-cancel"), reduced.matches);
    surface.dataset.swipeState = state;
    place(distance);
    settling = done;
    // Under reduced motion the settle is instant.
    if (ms === 0) done();
    else timer = window.setTimeout(done, ms);
  };
  const springBack = () => animate("cancel", 0, () => { clear(); tracker.settled(); });
  const settle = (release: SwipeRelease) => {
    if (release === "cancel") return springBack();
    animate("settle", options.current.size(surface), async () => {
      settling = null;
      // A guard can keep the surface, as it does for the visible control.
      if (await options.current.onCommit() === false) return springBack();
      clear();
      tracker.settled();
    });
  };
  const startDrag = (pointer: number) => {
    surface.dataset.swipeState = "dragging";
    try { surface.setPointerCapture(pointer); } catch { /* The pointer already ended. */ }
  };

  const down = (event: PointerEvent) => {
    if (tracker.phase === "pending" || tracker.phase === "dragging") {
      const dragging = tracker.phase === "dragging";
      tracker.down(event.pointerId, event.clientX, event.clientY, event.timeStamp);
      if (dragging) springBack();
      return;
    }
    if (!coarse.matches || event.button !== 0 || !options.current.active(surface)) return;
    if (tracker.phase === "settling") {
      // A guard is open: the surface waits for its answer.
      if (!settling) return;
      // A new touch catches the settling surface where it is.
      const at = current();
      window.clearTimeout(timer);
      settling = null;
      tracker.down(event.pointerId, event.clientX, event.clientY, event.timeStamp, at);
      startDrag(event.pointerId);
      place(tracker.distance);
      return;
    }
    const target = event.target;
    // Only the top layer reacts: a sheet nested in this one's markup takes its own touches.
    if (!(target instanceof Element) || !surface.contains(target) || target.closest("dialog") !== surface.closest("dialog")) return;
    const overflowX = (node: SwipeNode) => getComputedStyle(node as unknown as Element).overflowX;
    if (blockedStart(target as unknown as SwipeNode, surface as unknown as SwipeNode, event.clientX, window.innerWidth, overflowX)) return;
    if (options.current.accepts && !options.current.accepts(target, surface)) return;
    tracker.down(event.pointerId, event.clientX, event.clientY, event.timeStamp);
  };
  const move = (event: PointerEvent) => {
    const before = tracker.phase;
    if (tracker.move(event.pointerId, event.clientX, event.clientY, event.timeStamp) !== "dragging") return;
    if (before === "pending") startDrag(event.pointerId);
    if (!frame) frame = window.requestAnimationFrame(paint);
  };
  const up = (event: PointerEvent) => {
    const release = tracker.up(event.pointerId, event.clientX, event.clientY, event.timeStamp, options.current.size(surface));
    if (release) settle(release);
  };
  const cancel = (event: PointerEvent) => {
    const release = tracker.cancel(event.pointerId);
    if (release) settle(release);
  };
  // Pointer Events track the touch. Where the surface also scrolls, this keeps the browser from claiming a touch
  // the engine owns; a touch that leans the other way stays native scrolling.
  const touchMove = (event: TouchEvent) => { if (event.cancelable && tracker.leaning()) event.preventDefault(); };

  surface.addEventListener("pointerdown", down);
  surface.addEventListener("pointermove", move);
  surface.addEventListener("pointerup", up);
  surface.addEventListener("pointercancel", cancel);
  surface.addEventListener("touchmove", touchMove, { passive: false });
  return () => {
    surface.removeEventListener("pointerdown", down);
    surface.removeEventListener("pointermove", move);
    surface.removeEventListener("pointerup", up);
    surface.removeEventListener("pointercancel", cancel);
    surface.removeEventListener("touchmove", touchMove);
    clear();
  };
}

/**
 * Swipe down to dismiss a bottom sheet (JITM-08 §2.46, NATIVE-NAVIGATION.md §3 D). `close` is the sheet's own
 * Close action, so its unsaved guard runs exactly as it does for the visible control. A sheet moves its panel;
 * a full-screen dialog such as Quick Add moves itself.
 */
export function useSheetDismiss(dialog: RefObject<HTMLDialogElement | null>, close: () => unknown) {
  useSwipe({ get current() { return dialog.current?.querySelector<HTMLElement>(":scope > .sheet-panel") ?? dialog.current; } }, {
    axis: "y",
    direction: 1,
    // Below 768px every sheet is a bottom sheet (JITM-08 §2.11); from there sheets are centered or docked.
    active: () => !window.matchMedia(DOCKED_REVIEW_MEDIA).matches,
    accepts: (target, surface) => {
      // A pinned header always moves the sheet. Elsewhere, and on short screens where the header scrolls with
      // the body (JITM-07 §2.26), the body scrolls first and dismissal starts only at its top.
      const grip = target.closest(".sheet-header, .quick-add-dialog-header");
      if (grip && surface.contains(grip) && getComputedStyle(grip).position === "sticky") return true;
      return !scrolledBelowTop(target as unknown as SwipeNode, surface as unknown as SwipeNode);
    },
    size: surface => surface.offsetHeight,
    onCommit: close
  });
}
