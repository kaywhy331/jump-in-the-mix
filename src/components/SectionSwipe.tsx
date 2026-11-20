"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AppIcon, type AppIconName } from "@/components/AppIcon";
import { useSectionSwipe } from "@/components/Appearance";
import { NAV_LINKS, readSectionSwipe } from "@/lib/app-navigation";
import { nextArrival, ringNeighbour, ringStop, slide, wait } from "@/lib/back-navigation";
import { allowFormNavigation } from "@/lib/form-navigation";
import type { Direction } from "@/lib/gestures/swipe";
import { useSwipe } from "@/lib/gestures/useSwipe";
import { isDockedReview } from "@/lib/sheet-layout";

/** The page, which follows the finger and carries the peeks. */
const page = () => document.getElementById("workspace-main");
/** How long a committed swipe waits for the next section before the page lets go of its position. */
const ARRIVAL_GIVE_UP_MS = 10_000;
/** How long the new section's H1 is awaited for focus while its content streams in. */
const FOCUS_WAIT_MS = 5_000;
/** The peek beside each side of the page: the next section enters from the right, the previous one from the left. */
const side = (direction: Direction) => direction < 0 ? "next" : "previous";

/** A sheet or dialog is open. The docked review on Today is part of the page; a touch inside it is its own layer. */
const layerOpen = () => [...document.querySelectorAll<HTMLDialogElement>("dialog[open]")].some(dialog => !isDockedReview(dialog));
const zoomedIn = () => (window.visualViewport?.scale ?? 1) > 1;

/** The bottom navigation's and rail's highlight passes to `href` in step with the drag (`progress`, 0 to 1), or rests. */
function highlight(href: string | null, progress: number) {
  for (const nav of document.querySelectorAll<HTMLElement>(".app-nav")) {
    nav.style.setProperty("--section-swipe-progress", String(href ? Math.min(1, progress) : 0));
    for (const link of nav.querySelectorAll<HTMLAnchorElement>("a.nav-link")) {
      link.toggleAttribute("data-swipe-from", href !== null && link.classList.contains("active"));
      link.toggleAttribute("data-swipe-to", href !== null && link.getAttribute("href") === href);
    }
  }
}

let focusNext: string | null = null;

/**
 * Section swipe (A in docs/design/NATIVE-NAVIGATION.md §3, JITM-08 §2.46): on a ring stop, with a coarse pointer, a
 * sideways swipe on the page moves to the neighbouring section, in the bottom navigation's order. The page follows the
 * finger with the neighbour's title and loading state beside it, and a commit continues into the slide that opens the
 * neighbour, as tapping it in the navigation would. Rendered inside the page, which carries the peeks.
 */
export function SectionSwipe() {
  const router = useRouter();
  const pathname = usePathname(), search = useSearchParams().toString();
  const enabled = useSectionSwipe();
  const moved = useRef(0);
  const here = new URL(`${pathname}${search ? `?${search}` : ""}`, "https://app.invalid");
  const peeks = ([-1, 1] as const).flatMap(direction => {
    const link = NAV_LINKS.find(({ href }) => href === ringNeighbour(here, direction));
    return link ? [{ direction, link }] : [];
  });

  // A ring stop owns sideways touches on the app (touch-action: pan-y, NATIVE-NAVIGATION.md §4), except while the
  // page is zoomed in, so panning a zoomed page stays the browser's.
  useEffect(() => {
    if (!enabled || ringStop(new URL(location.href)) < 0) return;
    const root = document.documentElement, viewport = window.visualViewport;
    const update = () => root.toggleAttribute("data-section-swipe", !zoomedIn());
    update();
    viewport?.addEventListener("resize", update);
    return () => { viewport?.removeEventListener("resize", update); root.removeAttribute("data-section-swipe"); };
  }, [enabled, pathname, search]);

  // The neighbours are prefetched when the browser is idle, so the real page follows the peek quickly.
  useEffect(() => {
    if (!enabled || !matchMedia("(pointer: coarse)").matches) return;
    const url = new URL(location.href);
    const warm = () => { for (const direction of [-1, 1] as const) { const href = ringNeighbour(url, direction); if (href) router.prefetch(href); } };
    // Safari has no idle callback: the next task stands in for it.
    if (!(window as Partial<Window>).requestIdleCallback) { const timer = window.setTimeout(warm); return () => window.clearTimeout(timer); }
    const handle = window.requestIdleCallback(warm);
    return () => window.cancelIdleCallback(handle);
  }, [enabled, pathname, search, router]);

  // After a section swipe, focus moves to the new page's H1 without adding a tab stop (JITM-10 §2.23), once its content
  // has replaced the loading state. Next.js's route announcer speaks the new page.
  useEffect(() => {
    if (focusNext !== pathname) return;
    focusNext = null;
    const main = page();
    if (!main) return;
    const focus = () => {
      const heading = [...main.querySelectorAll<HTMLElement>("h1")].find(h1 => !h1.closest("[role='status']") && h1.getClientRects().length > 0);
      if (!heading) return false;
      if (!heading.hasAttribute("tabindex")) {
        heading.tabIndex = -1;
        heading.addEventListener("blur", () => heading.removeAttribute("tabindex"), { once: true });
      }
      heading.focus({ preventScroll: true });
      return document.activeElement === heading;
    };
    if (focus()) return;
    const observer = new MutationObserver(() => { if (focus()) stop(); });
    const timer = window.setTimeout(() => stop(), FOCUS_WAIT_MS);
    const stop = () => { observer.disconnect(); window.clearTimeout(timer); };
    observer.observe(main, { childList: true, subtree: true });
    return stop;
  }, [pathname]);

  // The touch may land anywhere on the page, or below a short one; the navigation, header and rail keep theirs. The page
  // alone follows the finger.
  useSwipe({ get current() { return document.querySelector<HTMLElement>(".app-shell"); } }, {
    axis: "x",
    direction: 0,
    moves: page,
    accepts: (target, surface) => target === surface || page()?.contains(target) === true,
    // Read at use time: the switch, the screen (a ring stop's own), the zoom and any open sheet or dialog.
    active: () => readSectionSwipe() && ringStop(new URL(location.href)) >= 0 && !zoomedIn() && !layerOpen(),
    leads: direction => ringNeighbour(new URL(location.href), direction) !== null,
    size: () => window.innerWidth,
    follows: (distance, direction) => {
      const main = page();
      if (!main) return;
      moved.current = distance;
      const href = distance > 0 ? ringNeighbour(new URL(location.href), direction) : null;
      const shown = href ? side(direction) : undefined;
      if (main.dataset.sectionPeek !== shown) {
        if (shown) {
          // The peek fills the screen below the header, from the part of the page in view.
          const header = document.querySelector(".mobile-app-header")?.getBoundingClientRect().bottom ?? 0;
          const box = main.getBoundingClientRect(), top = Math.max(0, header - box.top);
          main.style.setProperty("--section-peek-top", `${top}px`);
          main.style.setProperty("--section-peek-height", `${Math.max(0, window.innerHeight - box.top - top)}px`);
          main.dataset.sectionPeek = shown;
        } else delete main.dataset.sectionPeek;
      }
      highlight(href, distance / window.innerWidth);
    },
    continues: true,
    onCommit: direction => {
      const href = ringNeighbour(new URL(location.href), direction), main = page();
      // The unsaved guards answer first, exactly as for a tap on the navigation; keeping the edits springs the page back.
      if (!href || !main || !allowFormNavigation(href)) return false;
      highlight(href, 1);
      focusNext = href;
      const arrival = nextArrival();
      // The slide continues from where the finger left the page, which begins beside the rail where there is one.
      const left = main.getBoundingClientRect().left - direction * moved.current;
      slide(direction < 0 ? "forward" : "back", () => router.push(href), moved.current + left);
      return Promise.race([arrival, wait(ARRIVAL_GIVE_UP_MS)]);
    }
  });

  // The title is drawn from its attribute, so a peek adds no text to the page's content.
  return <>{peeks.map(({ direction, link }) => <div key={direction} className="section-peek" data-side={side(direction)} aria-hidden="true" inert>
    <p className="section-peek-title" data-label={link.label}><AppIcon name={link.icon as AppIconName} /></p>
    <span /><span /><span />
  </div>)}</>;
}
