/**
 * Back (C in docs/design/NATIVE-NAVIGATION.md §3, JITM-08 §2.46): every drill-in is a history entry, and going back
 * slides the parent in with its scroll restored. The browser's and the system's own back gestures are never
 * intercepted, and one back is never animated twice. These are the rules and the state that `BackNavigation`,
 * `BackLink` and `FormGuard` share.
 */
import type { MouseEvent } from "react";

/** The section ring (JITM-07 §2.33), in the bottom navigation's order. */
export const SECTION_RING = ["/jumps", "/contacts", "/mixes", "/more"] as const;

/** The side a page slides in from: the left going back, the right going forward. */
export type Slide = "back" | "forward";

/** How long a slide holds the old page while the new one commits, so a slow page never freezes the screen. */
const ARRIVAL_WAIT_MS = 500;
/** How long the app's own back stays marked for the guards, in case the browser had nowhere to go. */
const OWN_BACK_MS = 1000;
/** How long a restored scroll keeps following a page that is still growing, unless the owner scrolls first. */
const RESTORE_WAIT_MS = 2000;

/** The ring stop whose own screen `url` is, or -1. The Mix editor (`view=edit`) is a drill-in, not the Mixes screen. */
export function ringStop(url: URL): number {
  return url.searchParams.get("view") === "edit" ? -1 : (SECTION_RING as readonly string[]).indexOf(url.pathname);
}

/** A move between two ring stops slides in ring order; any other history move slides the way it went. */
export function slideFor(from: URL, to: URL, back: boolean): Slide {
  const a = ringStop(from), b = ringStop(to);
  if (a >= 0 && b >= 0 && a !== b) return b < a ? "back" : "forward";
  return back ? "back" : "forward";
}

/**
 * Whether the browser may already have animated this history move, so the slide is skipped. The Navigation API
 * reports it (`hasUAVisualTransition`: Chrome 118, Firefox 147, Safari and iOS 26.2; source
 * https://github.com/mdn/browser-compat-data/blob/main/api/NavigateEvent.json, checked 2026-11-20). A browser that
 * cannot report it is assumed to have animated. A back the app started itself (a back control, the edge swipe) had
 * no browser animation.
 */
export function browserMayHaveAnimated(reported: boolean | undefined, ownBack: boolean): boolean {
  return !ownBack && reported !== false;
}

type Entry = { key: string; url: string | null; index: number; getState(): unknown };
export type NavigationApi = EventTarget & {
  currentEntry: Entry | null;
  entries(): Entry[];
  canGoBack: boolean;
  activation?: { navigationType: string } | null;
  updateCurrentEntry(options: { state: unknown }): void;
};

/** The Navigation API, where the browser has it (Chrome 102, Firefox 147, Safari 26.2). */
export const navigationApi = () => (window as Window & { navigation?: NavigationApi }).navigation;

/** Slides run on touch screens only, so desktop is unchanged, and never under reduced motion: the swap is instant. */
export const slides = () => typeof document.startViewTransition === "function" && matchMedia("(pointer: coarse)").matches && !matchMedia("(prefers-reduced-motion: reduce)").matches;

/** The installed iOS app, detected as `PwaInstallPrompt` does. Only iOS sets `navigator.standalone`; Android keeps its system back. */
export const installedIosApp = () => matchMedia("(display-mode: standalone)").matches && (navigator as Navigator & { standalone?: boolean }).standalone === true;

/** The entry Back returns to, where the browser can say. */
export function previousEntry(): Entry | null {
  const navigation = navigationApi(), index = navigation?.currentEntry?.index ?? 0;
  return index > 0 ? navigation!.entries().find(entry => entry.index === index - 1) ?? null : null;
}

/** Whether Back returns to `href`'s page, so a back control can go back through history instead of adding an entry. */
export function backReturnsTo(href: string): boolean {
  const url = previousEntry()?.url;
  if (!url) return false;
  const back = new URL(url), target = new URL(href, location.href);
  return back.origin === target.origin && back.pathname === target.pathname;
}

type Relay = Window & { __jitmBeforePopState?: ((event: PopStateEvent) => void) | null; __jitmPopStateRelay?: true };

/**
 * The first popstate listener, set in the document's head before the router adds its own: window listeners run in the
 * order they were added, and the router commits a popstate at once. It hands each popstate to `beforePopState`.
 */
export const popStateRelayScript = "(function(){var w=window;w.__jitmPopStateRelay=true;w.addEventListener('popstate',function(e){var h=w.__jitmBeforePopState;if(h)h(e);});})();";

/** Where the relay sends each popstate, before the router sees it. */
export const beforePopState = {
  ready: () => (window as Relay).__jitmPopStateRelay === true,
  set: (handler: ((event: PopStateEvent) => void) | null) => { (window as Relay).__jitmBeforePopState = handler; }
};

let ownBack: { key: string | null; at: number } | null = null;

/** The app goes back itself, once the unsaved guards have answered, so they don't ask again for the same back. */
export function goBack() {
  ownBack = { key: previousEntry()?.key ?? null, at: performance.now() };
  history.back();
}

/** Whether a history move to the entry `key` is the app's own back. */
export function isOwnBack(key?: string | null): boolean {
  return ownBack !== null && performance.now() - ownBack.at < OWN_BACK_MS && (ownBack.key === null || ownBack.key === key);
}

/** On popstate: whether this move was the app's own back. The mark is used once. */
export function takeOwnBack(): boolean {
  const own = isOwnBack(navigationApi()?.currentEntry?.key);
  ownBack = null;
  return own;
}

let arrival: { promise: Promise<boolean>; resolve: (arrived: boolean) => void } | null = null;

/** Resolves once the next page change commits (`arrived`). */
export function nextArrival(): Promise<boolean> {
  if (!arrival) {
    let resolve = (_arrived: boolean) => {};
    const promise = new Promise<boolean>(done => { resolve = done; });
    arrival = { promise, resolve };
  }
  return arrival.promise;
}

/** A page change committed. */
export function arrived() {
  arrival?.resolve(true);
  arrival = null;
}

export const wait = (ms: number) => new Promise<void>(done => window.setTimeout(done, ms));

let slideRunning: ViewTransition | null = null;

/**
 * Runs `update`, the page change, in a View Transition that slides the new page in from `side`, with the motion tokens
 * (`src/styles/popups.css`). The navigation and the header stay put. Without slides the change is just made.
 */
export function slide(side: Slide, update: () => void) {
  if (!slides()) return update();
  const root = document.documentElement;
  root.dataset.slide = side;
  let transition: ViewTransition;
  try {
    transition = document.startViewTransition(async () => {
      const page = nextArrival();
      update();
      await Promise.race([page, wait(ARRIVAL_WAIT_MS)]);
    });
  } catch {
    // The page change never waits on the slide.
    delete root.dataset.slide;
    return update();
  }
  slideRunning = transition;
  void transition.finished.finally(() => { if (slideRunning === transition) { slideRunning = null; delete root.dataset.slide; } });
}

/**
 * A back control's click: back through history when Back returns to the control's page, which restores its scroll.
 * Otherwise `push` goes there with the slide-back, or, without one, the link navigates as links do. FormGuard has
 * already answered the click.
 */
export function followBack(event: MouseEvent<HTMLAnchorElement>, href: string, push?: () => void) {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  if (backReturnsTo(href)) { event.preventDefault(); goBack(); }
  else if (push) { event.preventDefault(); slide("back", push); }
}

/** Puts the page at `top`, and keeps it there as the page grows, until it is reached, the owner scrolls, or time is up. */
export function restoreScroll(top: number, page: HTMLElement) {
  const place = () => window.scrollTo({ top, behavior: "instant" });
  const reached = () => Math.abs(window.scrollY - top) < 1;
  place();
  if (reached()) return;
  const stops = ["wheel", "touchstart", "keydown"];
  const stop = () => { observer.disconnect(); window.clearTimeout(timer); for (const type of stops) window.removeEventListener(type, stop, true); };
  const observer = new ResizeObserver(() => { place(); if (reached()) stop(); });
  const timer = window.setTimeout(stop, RESTORE_WAIT_MS);
  observer.observe(page);
  for (const type of stops) window.addEventListener(type, stop, { capture: true, passive: true });
}
