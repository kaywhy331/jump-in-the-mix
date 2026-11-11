"use client";

import { useEffect, useRef, type RefObject } from "react";
import { DOCKED_REVIEW_MEDIA } from "@/lib/sheet-layout";
import { SwipeTracker, arbitrate, motionMs, scrolledBelowTop, startOn, type Axis, type Direction, type SwipeNode, type SwipeRelease } from "@/lib/gestures/swipe";

export type SwipeOptions = {
  axis: Axis;
  direction: Direction;
  /** Whether the surface takes gestures in its current layout. The engine also runs for coarse pointers only. */
  active: (surface: HTMLElement) => boolean;
  /** The surface's own start rule, checked after the shared exclusions. */
  accepts?: (target: Element, surface: HTMLElement) => boolean;
  /**
   * Whether content under the touch can still scroll toward the finger. Native scrolling then goes first, and the
   * same touch becomes the gesture once this turns false. Asked at touch-down and as that touch moves.
   */
  scrollsFirst?: (target: Element, surface: HTMLElement) => boolean;
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

/** The touch the engine holds. One that scrolls first is read from Touch Events: once its native scrolling starts, the browser cancels its pointer. */
type Held = { pointer: number; target: Element; touch: boolean };

function bind(surface: HTMLElement, options: RefObject<SwipeOptions>): () => void {
  const { axis, direction } = options.current;
  const tracker = new SwipeTracker(axis, direction);
  const page = surface.ownerDocument;
  const coarse = window.matchMedia("(pointer: coarse)");
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  let frame = 0, timer = 0;
  let settling: (() => void) | null = null;
  let held: Held | null = null;
  // Where content that scrolled first stood when it handed off; it stays there while the surface moves instead.
  let pinned = new Map<Element, { top: number; left: number }>();
  const holding = () => (tracker.phase === "pending" || tracker.phase === "dragging" ? held : null);

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
    pinned = new Map();
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
    pinned = new Map();
    const ms = motionMs(getComputedStyle(surface).getPropertyValue(state === "settle" ? "--motion-settle" : "--motion-cancel"), reduced.matches);
    surface.dataset.swipeState = state;
    place(distance);
    settling = done;
    // Under reduced motion the settle is instant.
    if (ms === 0) done();
    else timer = window.setTimeout(done, ms);
  };
  const springBack = () => animate("cancel", 0, () => { clear(); tracker.settled(); });
  const settle = (release: SwipeRelease | null) => {
    held = holding();
    if (!release) return;
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
    try { surface.setPointerCapture(pointer); } catch { /* The pointer already ended, or the browser took it for scrolling. */ }
  };

  // Every pointer that goes down anywhere on the page passes the one arbitration rule, so a second finger on the
  // backdrop or another layer cancels too, and a catch passes the same start rules before anything is cancelled.
  const down = (event: PointerEvent) => {
    const target = event.target;
    const claim = arbitrate(tracker.phase, { primary: event.isPrimary }, settling !== null, () => {
      if (!coarse.matches || event.button !== 0 || !(target instanceof Element) || !options.current.active(surface)) return "blocked";
      const { accepts, scrollsFirst } = options.current;
      return startOn({
        target, surface, x: event.clientX, viewportWidth: window.innerWidth,
        overflowX: node => getComputedStyle(node as Element).overflowX,
        accepts: accepts && (() => accepts(target, surface)),
        scrollsFirst: scrollsFirst && (() => scrollsFirst(target, surface))
      });
    });
    if (claim === "cancel") {
      const hold = holding();
      if (hold) settle(tracker.cancel(hold.pointer));
      return;
    }
    if (claim === "native" || !(target instanceof Element)) return;
    const { pointerId: pointer, clientX: x, clientY: y, timeStamp: t } = event;
    if (claim === "catch") {
      // A new touch catches the settling surface where it is.
      const at = current();
      window.clearTimeout(timer);
      settling = null;
      tracker.down(pointer, x, y, t, at);
      held = { pointer, target, touch: false };
      startDrag(pointer);
      place(tracker.distance);
      return;
    }
    if (claim === "track") tracker.down(pointer, x, y, t);
    else tracker.scroll(pointer, x, y, t);
    // A pen has no Touch Events: it keeps reading pointers, and loses the touch when the browser scrolls with it.
    held = { pointer, target, touch: claim === "scroll" && event.pointerType === "touch" && "TouchEvent" in window };
  };
  const follow = (pointer: number, x: number, y: number, t: number) => {
    const before = tracker.phase;
    const ahead = tracker.scrolling && before === "pending" && held !== null && options.current.scrollsFirst?.(held.target, surface) === true;
    const phase = tracker.move(pointer, x, y, t, ahead);
    if (phase === "dragging") {
      if (before === "pending") {
        startDrag(pointer);
        if (tracker.scrolling) pinned = scrolledFrom(held!.target);
      }
      if (!frame) frame = window.requestAnimationFrame(paint);
    } else if (before === "dragging") {
      // The finger went back past the hand-off: native scrolling has the touch again.
      clear();
    }
    held = holding();
  };
  const lift = (pointer: number, x: number, y: number, t: number) => settle(tracker.up(pointer, x, y, t, options.current.size(surface)));
  /** The scroll positions from `target` up to the surface, to hold while the surface moves. */
  const scrolledFrom = (target: Element) => {
    const positions = new Map<Element, { top: number; left: number }>();
    for (let node: Element | null = target; node; node = node === surface ? null : node.parentElement) positions.set(node, { top: node.scrollTop, left: node.scrollLeft });
    return positions;
  };

  const move = (event: PointerEvent) => { if (holding()?.touch === false) follow(event.pointerId, event.clientX, event.clientY, event.timeStamp); };
  const up = (event: PointerEvent) => { if (holding()?.touch === false) lift(event.pointerId, event.clientX, event.clientY, event.timeStamp); };
  const cancel = (event: PointerEvent) => { if (holding()?.touch === false) settle(tracker.cancel(event.pointerId)); };
  // Pointer Events track the touch. Where the surface also scrolls, this keeps the browser from claiming a touch
  // the engine owns; a touch that leans the other way stays native scrolling. A touch that scrolls first is
  // followed here, through its native scrolling.
  const touchMove = (event: TouchEvent) => {
    const hold = holding();
    if (hold?.touch && event.touches.length === 1) follow(hold.pointer, event.touches[0].clientX, event.touches[0].clientY, event.timeStamp);
    if (event.cancelable && tracker.leaning()) event.preventDefault();
  };
  const touchEnd = (event: TouchEvent) => {
    const hold = holding(), touch = event.changedTouches[0];
    if (hold?.touch && event.touches.length === 0 && touch) lift(hold.pointer, touch.clientX, touch.clientY, event.timeStamp);
  };
  const touchCancel = () => { const hold = holding(); if (hold?.touch) settle(tracker.cancel(hold.pointer)); };
  // While a touch that scrolled first moves the surface, its content stays where it handed off.
  const scrolled = (event: Event) => {
    const content = event.target instanceof Element ? event.target : null, at = content && pinned.get(content);
    if (content && at && tracker.phase === "dragging") { content.scrollTop = at.top; content.scrollLeft = at.left; }
  };

  const listeners: Array<[EventTarget, string, EventListener, AddEventListenerOptions]> = [
    [page, "pointerdown", down as EventListener, { capture: true }],
    [surface, "pointermove", move as EventListener, {}],
    [surface, "pointerup", up as EventListener, {}],
    [surface, "pointercancel", cancel as EventListener, {}],
    [surface, "touchmove", touchMove as EventListener, { passive: false }],
    [surface, "touchend", touchEnd as EventListener, { passive: true }],
    [surface, "touchcancel", touchCancel, { passive: true }],
    [surface, "scroll", scrolled, { capture: true, passive: true }]
  ];
  for (const [target, type, listener, init] of listeners) target.addEventListener(type, listener, init);
  return () => {
    for (const [target, type, listener, init] of listeners) target.removeEventListener(type, listener, init);
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
    scrollsFirst: (target, surface) => {
      // A pinned header always moves the sheet. Elsewhere, and on short screens where the header scrolls with
      // the body (JITM-07 §2.26), the body scrolls first, and the same pull dismisses once it reaches its top.
      const grip = target.closest(".sheet-header, .quick-add-dialog-header");
      if (grip && surface.contains(grip) && getComputedStyle(grip).position === "sticky") return false;
      return scrolledBelowTop(target as unknown as SwipeNode, surface as unknown as SwipeNode);
    },
    size: surface => surface.offsetHeight,
    onCommit: close
  });
}
