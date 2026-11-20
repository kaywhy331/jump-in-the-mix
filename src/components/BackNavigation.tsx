"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { allowFormNavigation } from "@/lib/form-navigation";
import { useSwipe } from "@/lib/gestures/useSwipe";
import {
  arrived, beforePopState, browserMayHaveAnimated, goBack, installedIosApp, navigationApi, nextArrival, previousEntry,
  restoreScroll, ringStop, slide, slideFor, slides, takeOwnBack, wait
} from "@/lib/back-navigation";

/** The page itself, which slides and, in the installed iOS app, follows the finger. */
const page = () => document.getElementById("workspace-main");
/** The page's visible back control, if it has one. */
const backControl = () => [...document.querySelectorAll<HTMLAnchorElement>("#workspace-main [data-back-link]")].find(link => link.getClientRects().length > 0) ?? null;
const canGoBack = () => navigationApi()?.canGoBack ?? history.length > 1;
const samePage = (a: URL, b: URL) => a.pathname === b.pathname && a.search === b.search;
/** How long the edge swipe waits for history to move before it springs back, as when there was nowhere to go. */
const LEAVE_WAIT_MS = 500;

/** How long scrolling rests before its position is written to the history entry. */
const SCROLL_SAVE_MS = 150;

type HeardTraverse = { url: string; back: boolean; reported?: boolean; top?: number };
type SavedEntry = { key?: string; getState(): unknown };

/**
 * Back for the app shell (JITM-08 §2.46, NATIVE-NAVIGATION.md §3 C). A history move slides the page in from its side
 * and restores its scroll. The browser handles its own back; this only holds the router for the frame the slide needs
 * to capture the old page, then hands it the same move, so each back runs once. In the installed iOS app, which has no
 * back swipe, a swipe from the left edge goes back.
 */
export function BackNavigation() {
  const router = useRouter();
  const pathname = usePathname(), search = useSearchParams().toString();
  const committed = useRef("");
  const restore = useRef<number | null>(null);
  const leaving = useRef(false);

  // A page change committed: the edge swipe's page has left with the finger and the parent arrives in place, at the
  // scroll its history entry kept. A waiting slide then captures it.
  useLayoutEffect(() => {
    const main = page();
    if (leaving.current && main) { leaving.current = false; delete main.dataset.swipeState; main.style.transform = ""; }
    if (restore.current !== null && main) restoreScroll(restore.current, main);
    restore.current = null;
    committed.current = location.href;
    arrived();
  }, [pathname, search]);

  useEffect(() => {
    // Without the head's popstate relay the router moves first, so the browser keeps its own back handling.
    if (!beforePopState.ready()) return;
    const navigation = navigationApi();
    // Each history entry keeps its own scroll, in the entry's Navigation API state, so it survives a reload; the
    // router's history.state is left alone. Positions are read from memory first, as the owner scrolled.
    const tops = new Map<string, number>();
    const topOf = (entry?: SavedEntry | null) => entry ? tops.get(entry.key ?? "") ?? (entry.getState() as { jitmScroll?: number } | undefined)?.jitmScroll : undefined;
    let heard: HeardTraverse | null = null, holding = false, replaying = false, frame = 0, persist = 0;

    // History restores scroll here, once the page it returns to has rendered (where the Navigation API keys entries).
    if (navigation) {
      // This document opened by a history move to an entry that kept its scroll.
      const top = topOf(navigation.currentEntry), main = page();
      if (navigation.activation?.navigationType === "traverse" && history.scrollRestoration === "manual" && top !== undefined && main) restoreScroll(top, main);
      history.scrollRestoration = "manual";
    }
    const keep = () => { try { navigation?.updateCurrentEntry({ state: { ...(navigation.currentEntry?.getState() as object | undefined), jitmScroll: window.scrollY } }); } catch { /* Optional. */ } };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(() => { frame = 0; const key = navigation?.currentEntry?.key; if (key) tops.set(key, window.scrollY); });
      window.clearTimeout(persist);
      persist = window.setTimeout(keep, SCROLL_SAVE_MS);
    };
    // Leaving the document (a reload, another site) keeps the browser's own restoration for this entry.
    const onPageHide = () => {
      window.clearTimeout(persist);
      keep();
      if (navigation) history.scrollRestoration = "auto";
    };
    const onPageShow = () => { if (navigation) history.scrollRestoration = "manual"; };
    const onNavigate = (event: Event) => {
      const move = event as Event & { navigationType: string; hasUAVisualTransition?: boolean; destination: SavedEntry & { url: string; index: number } };
      if (move.navigationType !== "traverse") return;
      heard = { url: move.destination.url, back: move.destination.index < (navigation?.currentEntry?.index ?? 0), reported: move.hasUAVisualTransition, top: topOf(move.destination) };
    };
    // The head's relay runs this before the router's own listener.
    const onPopState = (event: PopStateEvent) => {
      if (replaying) return;
      const own = takeOwnBack(), move = heard?.url === location.href ? heard : null;
      heard = null;
      const from = new URL(committed.current || location.href), to = new URL(location.href), main = page();
      // Only the fragment changed: no new page to wait for, so its scroll comes back at once.
      if (samePage(from, to)) { if (move?.top !== undefined && main) restoreScroll(move.top, main); return; }
      if (move) restore.current = move.top ?? 0;
      if (holding || !slides() || browserMayHaveAnimated(move?.reported, own)) return;
      event.stopImmediatePropagation();
      holding = true;
      slide(move ? slideFor(from, to, move.back) : "back", () => {
        holding = false;
        replaying = true;
        try { window.dispatchEvent(new PopStateEvent("popstate", { state: history.state })); } finally { replaying = false; }
      });
    };
    beforePopState.set(onPopState);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("pageshow", onPageShow);
    navigation?.addEventListener("navigate", onNavigate);
    return () => {
      beforePopState.set(null);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("pageshow", onPageShow);
      navigation?.removeEventListener("navigate", onNavigate);
      cancelAnimationFrame(frame);
      onPageHide();
    };
  }, []);

  // The page owns a sideways touch for the back swipe (touch-action: pan-y, NATIVE-NAVIGATION.md §4), except while it is
  // zoomed in, so panning a zoomed page stays the browser's.
  useEffect(() => {
    if (!installedIosApp()) return;
    const root = document.documentElement, viewport = window.visualViewport;
    const update = () => root.toggleAttribute("data-edge-back", !viewport || viewport.scale <= 1);
    update();
    viewport?.addEventListener("resize", update);
    return () => { viewport?.removeEventListener("resize", update); root.removeAttribute("data-edge-back"); };
  }, []);

  // The installed iOS app's back swipe. Never on a ring stop's own screen, where a sideways swipe is section swipe,
  // and only where there is a back: history's, or the page's back control when the app opened on this page.
  // The touch may land anywhere down the edge, on a short page or beside the rail; the page alone follows the finger.
  useSwipe({ get current() { return document.querySelector<HTMLElement>(".app-shell"); } }, {
    axis: "x",
    direction: 1,
    fromLeftEdge: true,
    moves: page,
    active: () => installedIosApp() && ringStop(new URL(location.href)) < 0 && (canGoBack() || backControl() !== null),
    size: () => window.innerWidth,
    onCommit: async () => {
      const back = canGoBack(), control = backControl(), before = location.href;
      // The unsaved guards answer first, exactly as for the back control; keeping the edits springs the page back.
      if (!allowFormNavigation(back ? previousEntry()?.url ?? before : control?.href ?? before)) return false;
      leaving.current = true;
      const arrival = nextArrival();
      if (!back) { slide("back", () => router.push(control!.href)); return arrival; }
      goBack();
      if (await Promise.race([arrival, wait(LEAVE_WAIT_MS).then(() => location.href !== before)])) return arrival;
      leaving.current = false;
      return false;
    }
  });
  return null;
}
