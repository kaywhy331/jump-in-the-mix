"use client";
import { createContext, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type HTMLAttributes, type KeyboardEvent, type ReactNode } from "react";
import { AppIcon, type AppIconName } from "@/components/AppIcon";

/**
 * Pane paging (JITM-08 §2.46, docs/design/NATIVE-NAVIGATION.md §3 B). The pane tabs are ARIA tabs everywhere, and each pane
 * is a tab panel (`ScrollPagerPanel`) named by its tab, around the screen's own landmark. On a coarse pointer up to 1024px
 * the panels also sit side by side in one native scroll-snap track, so a swipe pages with the browser's own momentum and
 * snap. Everywhere else the screen's own CSS shows one panel at a time from `data-mobile-pane`, as before.
 */
export const SCROLL_PAGER_MEDIA = "(pointer: coarse) and (width <= 1024px)";
/** Bubbles from the track when a horizontal swipe pushes past the first or last pane: the nested-pager hand-off (§3 B). */
export const SCROLL_PAGER_OVERSCROLL = "scrollpager:overscroll";

/** Gesture values from the spec's engine table (NATIVE-NAVIGATION §6); the native scroll owns every other value. */
const AXIS_LOCK_PX = 10, VELOCITY_WINDOW_MS = 100;
/** The width at each screen edge that belongs to the system's own gestures (§4, JITM-08 §2.47), read from its one token. */
const EDGE_TOKEN = "--swipe-edge-exclusion";
/** Browsers without `scrollend` settle the selection once scrolling has been quiet this long. */
const SCROLL_IDLE_MS = 120;
/** A gesture never starts on these (JITM-08 §2.47). */
const EXCLUDED = "input, textarea, select, [contenteditable]:not([contenteditable='false']), [role='slider'], [data-swipe-ignore]";

export type ScrollPagerPane<T extends string> = {
  id: T;
  label: string;
  icon: AppIconName;
  disabled?: boolean;
};

export type ScrollPagerOverscroll = {
  edge: "first" | "last";
  phase: "start" | "move" | "end" | "cancel";
  /** Finger travel past the edge, in px, measured outward. */
  distance: number;
  /** Outward speed over the last 100ms, in px/ms. */
  velocity: number;
};

type Props<T extends string> = {
  label: string;
  panes: ScrollPagerPane<T>[];
  selected: T;
  onSelect: (pane: T) => void;
  onOverscroll?: (event: ScrollPagerOverscroll) => void;
  tabsClassName?: string;
  trackClassName?: string;
  trackProps?: HTMLAttributes<HTMLDivElement>;
  children: ReactNode;
};

type Edge = { x: number; y: number; first: boolean; last: boolean; lock: "x" | "y" | null; edge: ScrollPagerOverscroll["edge"] | null; samples: { t: number; x: number }[] };
/** A touch that started in a reserved screen edge, until its axis is known. */
type Reserved = { x: number; y: number; target: Element; lock: "x" | null };

const tabId = (pager: string, pane: string) => `${pager}-tab-${pane}`;
const panelId = (pager: string, pane: string) => `${pager}-panel-${pane}`;
const Pager = createContext<{ id: string; selected: string; paging: boolean } | null>(null);

/**
 * One pane of a ScrollPager: a tab panel named by its tab (spec §3 B, JITM-10 §2.26), wrapped around the screen's own
 * landmark, which stays inside it. Outside paging the wrapper adds no box, so each screen's layout is its own. While paging,
 * the panels that are not selected are off-screen and inert; the screen's switcher CSS hides them otherwise. Rendered
 * outside a pager (a pane shown on its own page), it adds nothing.
 */
export function ScrollPagerPanel({ pane, children }: { pane: string; children: ReactNode }) {
  const pager = useContext(Pager);
  if (!pager) return <>{children}</>;
  const selected = pane === pager.selected;
  return <div className="scroll-pager-panel" role="tabpanel" id={panelId(pager.id, pane)} aria-labelledby={tabId(pager.id, pane)} data-pager-pane={pane} data-pager-selected={selected || undefined} inert={pager.paging && !selected}>{children}</div>;
}

export function ScrollPager<T extends string>({ label, panes, selected, onSelect, onOverscroll, tabsClassName, trackClassName, trackProps, children }: Props<T>) {
  const id = useId(), rootRef = useRef<HTMLDivElement>(null), tabsRef = useRef<HTMLDivElement>(null), trackRef = useRef<HTMLDivElement>(null), indicatorRef = useRef<HTMLSpanElement>(null);
  const [paging, setPaging] = useState(false), [controls, setControls] = useState<Partial<Record<T, string>>>({});
  const latest = useRef({ panes, selected, onSelect, onOverscroll, paging });
  latest.current = { panes, selected, onSelect, onOverscroll, paging };
  const synced = useRef(false), owned = useRef(false);
  const context = useMemo(() => ({ id, selected, paging }), [id, selected, paging]);

  /** A pane's tab panel, when this screen renders it inside the track. */
  const panelOf = (pane: T) => {
    const element = document.getElementById(panelId(id, pane));
    return element && trackRef.current?.contains(element) ? element : null;
  };
  /** Each pane the owner can page to, in order: enabled and present in the track. */
  const pages = () => {
    if (!trackRef.current) return [];
    return latest.current.panes.flatMap(pane => {
      const element = pane.disabled ? null : panelOf(pane.id);
      return element ? [{ pane, element }] : [];
    });
  };
  const offsetOf = (element: HTMLElement) => {
    const track = trackRef.current!;
    return element.getBoundingClientRect().left - track.getBoundingClientRect().left + track.scrollLeft;
  };
  const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /** The indicator follows the scroll position between the two tabs it sits between. */
  const paint = () => {
    const track = trackRef.current, indicator = indicatorRef.current, tabs = tabsRef.current;
    if (!track || !indicator || !tabs || !latest.current.paging) return;
    const list = pages(), offsets = list.map(page => offsetOf(page.element));
    if (!list.length) return;
    let index = 0;
    while (index < offsets.length - 1 && track.scrollLeft >= offsets[index + 1]) index++;
    const next = Math.min(index + 1, offsets.length - 1), span = offsets[next] - offsets[index];
    const progress = span > 0 ? Math.min(1, Math.max(0, (track.scrollLeft - offsets[index]) / span)) : 0;
    const tab = (pane: T) => tabs.querySelector<HTMLElement>(`[data-pane="${pane}"]`);
    const from = tab(list[index].pane.id), to = tab(list[next].pane.id);
    if (!from || !to) return;
    const x = from.offsetLeft + (to.offsetLeft - from.offsetLeft) * progress, width = from.offsetWidth + (to.offsetWidth - from.offsetWidth) * progress;
    indicator.style.width = `${width}px`;
    indicator.style.height = `${from.offsetHeight}px`;
    indicator.style.borderRadius = getComputedStyle(from).borderTopLeftRadius;
    indicator.style.transform = `translate(${x}px, ${from.offsetTop}px)`;
  };

  /**
   * The selected tab follows the pane an owner's swipe (or trackpad or arrow keys) came to rest on. Any other scroll, such
   * as a screen bringing an element into view or the route's #selected-mix, never changes the pane: the track returns to
   * the selected one. Overlapping scrolls can also leave the browser resting between snap points, so a rest always ends on a pane.
   */
  const settle = () => {
    const track = trackRef.current;
    if (!track || !latest.current.paging) return;
    const list = pages();
    if (!list.length) return;
    const nearest = list.reduce((best, page) => Math.abs(offsetOf(page.element) - track.scrollLeft) < Math.abs(offsetOf(best.element) - track.scrollLeft) ? page : best);
    const chosen = owned.current ? nearest : list.find(page => page.pane.id === latest.current.selected) ?? nearest;
    owned.current = false;
    if (Math.abs(offsetOf(chosen.element) - track.scrollLeft) > 1) track.scrollTo({ left: offsetOf(chosen.element), behavior: reduced() ? "instant" : "smooth" });
    if (chosen.pane.id !== latest.current.selected) latest.current.onSelect(chosen.pane.id);
  };

  // Paging needs a coarse pointer up to 1024px and at least two panes to page between.
  useLayoutEffect(() => {
    const media = window.matchMedia(SCROLL_PAGER_MEDIA);
    const update = () => setPaging(media.matches && pages().length > 1);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  });

  // Each tab controls its panel when this screen has one (a new Mega-Mix has no Details yet).
  useLayoutEffect(() => {
    const next: Partial<Record<T, string>> = {};
    for (const pane of panes) if (panelOf(pane.id)) next[pane.id] = panelId(id, pane.id);
    setControls(current => panes.every(pane => current[pane.id] === next[pane.id]) ? current : next);
  });

  // A tab, an arrow key or the screen itself changing the pane scrolls it into view; reduced motion jumps.
  useLayoutEffect(() => {
    const track = trackRef.current;
    if (!paging || !track) { synced.current = false; return; }
    owned.current = false;
    const page = pages().find(item => item.pane.id === selected);
    // A tab whose pane is not on this screen (a new Mega-Mix has no Details yet) leaves the pane that is showing selected.
    if (!page) settle();
    else if (Math.abs(offsetOf(page.element) - track.scrollLeft) > 1) track.scrollTo({ left: offsetOf(page.element), behavior: synced.current && !reduced() ? "smooth" : "instant" });
    synced.current = true;
    paint();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs when the pane or the mode changes, not on every render
  }, [paging, selected]);

  useEffect(() => {
    const track = trackRef.current;
    if (!track || !paging) return;
    let frame = 0, idle = 0, fingers = 0, released: number | null = null, edge: Edge | null = null, reserved: Reserved | null = null;
    /** The reserved width at each screen edge, from the token (it can change with the screen). */
    const reservedWidth = () => parseFloat(getComputedStyle(rootRef.current ?? track).getPropertyValue(EDGE_TOKEN)) || 0;
    let edgeWidth = reservedWidth();
    const emit = (phase: ScrollPagerOverscroll["phase"], state: Edge, x: number) => {
      const outward = state.edge === "first" ? 1 : -1, recent = state.samples.filter(sample => sample.t >= state.samples[state.samples.length - 1].t - VELOCITY_WINDOW_MS);
      const elapsed = recent.length > 1 ? recent[recent.length - 1].t - recent[0].t : 0;
      const detail: ScrollPagerOverscroll = { edge: state.edge!, phase, distance: Math.max(0, (x - state.x) * outward), velocity: elapsed > 0 ? (recent[recent.length - 1].x - recent[0].x) * outward / elapsed : 0 };
      latest.current.onOverscroll?.(detail);
      track.dispatchEvent(new CustomEvent<ScrollPagerOverscroll>(SCROLL_PAGER_OVERSCROLL, { bubbles: true, detail }));
    };
    const cancel = () => { if (edge?.edge) emit("cancel", edge, edge.samples[edge.samples.length - 1]?.x ?? edge.x); edge = null; };
    const onScroll = () => {
      // The track only scrolls sideways under a finger when the owner is swiping it.
      if (fingers > 0) owned.current = true;
      if (!frame) frame = requestAnimationFrame(() => { frame = 0; paint(); });
      // Reduced motion: the browser has chosen the pane once the released scroll moves; jump there instead of animating.
      if (released !== null && fingers === 0 && Math.abs(track.scrollLeft - released) > 0.5) {
        const direction = Math.sign(track.scrollLeft - released), offsets = pages().map(page => offsetOf(page.element));
        released = null;
        const target = direction > 0 ? offsets.find(offset => offset >= track.scrollLeft - 0.5) : [...offsets].reverse().find(offset => offset <= track.scrollLeft + 0.5);
        if (target !== undefined) {
          // A programmatic scroll does not stop the browser's snap animation, which carries on from the new position.
          // Rebuilding the track's box within this task ends it without a paint; focus and each pane's scroll are kept.
          track.style.display = "none";
          void track.offsetWidth;
          track.style.display = "";
          track.scrollTo({ left: target, behavior: "instant" });
          requestAnimationFrame(() => { paint(); settle(); });
        }
      }
      if (!Reflect.has(window, "onscrollend")) { window.clearTimeout(idle); idle = window.setTimeout(() => { if (!fingers) settle(); }, SCROLL_IDLE_MS); }
    };
    const onScrollEnd = () => { released = null; if (!fingers) settle(); };
    const onTouchStart = (event: TouchEvent) => {
      fingers = event.touches.length;
      released = null;
      reserved = null;
      if (fingers !== 1) { cancel(); return; }
      const touch = event.touches[0], offsets = pages().map(page => offsetOf(page.element));
      const target = event.target instanceof Element ? event.target : null;
      const inEdge = touch.clientX < edgeWidth || touch.clientX > window.innerWidth - edgeWidth;
      // A field keeps its own native touch (it never pages: scroll-pager.css); anything else starting in an edge is held.
      if (inEdge && target && !target.closest(EXCLUDED)) reserved = { x: touch.clientX, y: touch.clientY, target, lock: null };
      edge = target && !target.closest(EXCLUDED) && !scrollsSideways(target, track) && !inEdge && offsets.length
        ? { x: touch.clientX, y: touch.clientY, first: track.scrollLeft <= offsets[0] + 1, last: track.scrollLeft >= offsets[offsets.length - 1] - 1, lock: null, edge: null, samples: [{ t: event.timeStamp, x: touch.clientX }] }
        : null;
    };
    /**
     * A sideways pull that starts in a reserved screen edge never pages: the edges belong to the system's own gestures
     * (§4, JITM-08 §2.47), which the browser keeps, since the touch start is never cancelled. Cancelling the sideways moves
     * before the browser starts scrolling keeps the track still. A vertical pull is left to native scrolling from the 10px
     * axis lock on, a horizontal scroller under the finger that can still move keeps its own scroll, and a second finger
     * leaves pinch zoom to the browser. Only the first moves of a touch can block scrolling, and only edge touches do.
     */
    const onReservedMove = (event: TouchEvent) => {
      if (!reserved) return;
      if (event.touches.length !== 1) { reserved = null; return; }
      const touch = event.touches[0], dx = touch.clientX - reserved.x, dy = touch.clientY - reserved.y;
      if (!reserved.lock) {
        const moved = Math.max(Math.abs(dx), Math.abs(dy));
        if (Math.abs(dy) >= Math.abs(dx)) { if (moved >= AXIS_LOCK_PX) reserved = null; return; }
        if (scrollsToward(reserved.target, track, dx)) { reserved = null; return; }
        if (moved >= AXIS_LOCK_PX) reserved.lock = "x";
      }
      if (event.cancelable) event.preventDefault();
    };
    const onTouchMove = (event: TouchEvent) => {
      if (!edge) return;
      if (event.touches.length !== 1) { cancel(); return; }
      const touch = event.touches[0], dx = touch.clientX - edge.x, dy = touch.clientY - edge.y;
      edge.samples.push({ t: event.timeStamp, x: touch.clientX });
      edge.samples = edge.samples.filter(sample => sample.t >= event.timeStamp - VELOCITY_WINDOW_MS);
      if (!edge.lock) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) < AXIS_LOCK_PX) return;
        edge.lock = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
        edge.edge = edge.lock === "x" ? dx > 0 && edge.first ? "first" : dx < 0 && edge.last ? "last" : null : null;
        if (!edge.edge) { edge = null; return; }
        emit("start", edge, touch.clientX);
        return;
      }
      emit("move", edge, touch.clientX);
    };
    const onTouchEnd = (event: TouchEvent) => {
      fingers = event.touches.length;
      reserved = null;
      if (edge?.edge) emit(event.type === "touchcancel" ? "cancel" : "end", edge, event.changedTouches[0]?.clientX ?? edge.x);
      edge = null;
      if (!fingers && reduced() && !pages().some(page => Math.abs(offsetOf(page.element) - track.scrollLeft) <= 0.5)) released = track.scrollLeft;
    };
    const onWheel = (event: WheelEvent) => { if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) owned.current = true; };
    const onResize = () => { edgeWidth = reservedWidth(); const page = pages().find(item => item.pane.id === latest.current.selected); if (!fingers && page) track.scrollTo({ left: offsetOf(page.element), behavior: "instant" }); paint(); };
    const resize = new ResizeObserver(onResize);
    resize.observe(track);
    if (tabsRef.current) resize.observe(tabsRef.current);
    track.addEventListener("scroll", onScroll, { passive: true });
    track.addEventListener("scrollend", onScrollEnd);
    track.addEventListener("wheel", onWheel, { passive: true });
    track.addEventListener("touchstart", onTouchStart, { passive: true });
    track.addEventListener("touchmove", onTouchMove, { passive: true });
    // Not passive: it cancels the sideways moves of a touch that started in a reserved edge.
    track.addEventListener("touchmove", onReservedMove, { passive: false });
    track.addEventListener("touchend", onTouchEnd, { passive: true });
    track.addEventListener("touchcancel", onTouchEnd, { passive: true });
    return () => {
      cancelAnimationFrame(frame); window.clearTimeout(idle); resize.disconnect();
      track.removeEventListener("scroll", onScroll);
      track.removeEventListener("scrollend", onScrollEnd);
      track.removeEventListener("wheel", onWheel);
      track.removeEventListener("touchstart", onTouchStart);
      track.removeEventListener("touchmove", onTouchMove);
      track.removeEventListener("touchmove", onReservedMove);
      track.removeEventListener("touchend", onTouchEnd);
      track.removeEventListener("touchcancel", onTouchEnd);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the listeners read the latest props through `latest`
  }, [paging]);

  // Left and Right move between tabs and wrap; Home and End go to the ends. Moving selects (the panes are already mounted).
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const enabled = panes.filter(pane => !pane.disabled), current = enabled.findIndex(pane => pane.id === (event.target as HTMLElement).dataset.pane);
    if (current < 0) return;
    const index = event.key === "ArrowRight" ? (current + 1) % enabled.length : event.key === "ArrowLeft" ? (current - 1 + enabled.length) % enabled.length : event.key === "Home" ? 0 : event.key === "End" ? enabled.length - 1 : -1;
    if (index < 0) return;
    event.preventDefault();
    tabsRef.current?.querySelector<HTMLElement>(`[data-pane="${enabled[index].id}"]`)?.focus();
    onSelect(enabled[index].id);
  };
  const focusable = panes.find(pane => pane.id === selected && !pane.disabled)?.id ?? panes.find(pane => !pane.disabled)?.id;

  return <div ref={rootRef} className="scroll-pager" data-paging={paging || undefined}>
    <div ref={tabsRef} role="tablist" aria-label={label} className={`scroll-pager-tabs${tabsClassName ? ` ${tabsClassName}` : ""}`} onKeyDown={onKeyDown}>
      {panes.map(pane => <button key={pane.id} id={tabId(id, pane.id)} type="button" role="tab" data-pane={pane.id} aria-selected={pane.id === selected} aria-controls={controls[pane.id]} tabIndex={pane.id === focusable ? 0 : -1} disabled={pane.disabled} onClick={() => onSelect(pane.id)}><AppIcon name={pane.icon} />{pane.label}</button>)}
      <span ref={indicatorRef} className="scroll-pager-indicator" aria-hidden="true" />
    </div>
    <div ref={trackRef} {...trackProps} className={`scroll-pager-track${trackClassName ? ` ${trackClassName}` : ""}`} data-mobile-pane={paging ? undefined : selected}><Pager.Provider value={context}>{children}</Pager.Provider></div>
  </div>;
}

/** True when something between the touch and the track can scroll sideways: it scrolls natively first (JITM-08 §2.47). */
function scrollsSideways(from: Element, track: Element) {
  for (let node: Element | null = from; node && node !== track; node = node.parentElement) {
    const overflow = getComputedStyle(node).overflowX;
    if ((overflow === "auto" || overflow === "scroll") && node.scrollWidth > node.clientWidth) return true;
  }
  return false;
}

/** True when a sideways scroller between the touch and the track can still move with a finger travelling `dx`. */
function scrollsToward(from: Element, track: Element, dx: number) {
  for (let node: Element | null = from; node && node !== track; node = node.parentElement) {
    const overflow = getComputedStyle(node).overflowX;
    if ((overflow !== "auto" && overflow !== "scroll") || node.scrollWidth <= node.clientWidth) continue;
    if (dx > 0 ? node.scrollLeft > 0.5 : node.scrollLeft < node.scrollWidth - node.clientWidth - 0.5) return true;
  }
  return false;
}
