"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { ROUTE_FOCUS_ATTRIBUTE } from "@/lib/focus-visibility";

/** Rendered and usable: Suspense can keep the page being replaced in the DOM, hidden, and the account check makes it inert. */
const usable = (element: Element) => element.getClientRects().length > 0 && !element.closest("[inert]");

/** A modal the page opened, or a dialog or popover holding focus, owns the keyboard and returns focus to its trigger. */
const layerOwnsFocus = (active: Element | null) => Boolean(document.querySelector("dialog:modal") || active?.closest("dialog[open], [popover]"));

/** The element the URL fragment names, which the page targets as it arrives. */
function fragmentTarget() {
  try { return location.hash.length > 1 ? document.getElementById(decodeURIComponent(location.hash.slice(1))) : null; } catch { return null; }
}

/** A form field: the owner types in it or picks its value. */
const isField = (element: Element) => element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement || (element instanceof HTMLElement && element.isContentEditable);

/**
 * Focus the new page put on something it opened or targeted as it arrived, read from the page itself: anything inside the
 * element the URL fragment names, or in the page anything that is not a form field (a disclosure's summary, a step, a
 * card or a heading the page focused). A dialog, sheet or popover already keeps its focus (layerOwnsFocus). A form field
 * the page focuses in its own content as it mounts (an autofocus First name or Mix name) opens nothing: the H1 takes it.
 */
const pageTargeted = (main: HTMLElement, active: HTMLElement) =>
  usable(active) && (Boolean(fragmentTarget()?.contains(active)) || (active !== main && main.contains(active) && !isField(active)));

/** The layout focus could change, independent of scrolling: the main's place and size, and the target's box within it. */
function layout(main: HTMLElement, target: HTMLElement) {
  const page = main.getBoundingClientRect(), box = target.getBoundingClientRect();
  return [page.left + window.scrollX, page.top + window.scrollY, page.width, page.height, main.scrollWidth, main.scrollHeight,
    box.left - page.left + main.scrollLeft, box.top - page.top + main.scrollTop, box.width, box.height].map(Math.round).join();
}

/**
 * Focuses the target as a programmatic target (tabIndex -1, no scroll) only if that changes nothing the page shows. A
 * stylesheet can reveal or restyle a focused element: then focus goes back where it was ("changes page"), because a page
 * that moves when focus leaves it would move the owner's next press off its control. "Unavailable": it can't take focus yet.
 */
function focusInPlace(main: HTMLElement, target: HTMLElement): "placed" | "changes page" | "unavailable" {
  const prior = document.activeElement;
  const indexed = target.hasAttribute("tabindex"), marked = target.hasAttribute(ROUTE_FOCUS_ATTRIBUTE);
  if (!indexed) target.tabIndex = -1;
  if (!marked) target.setAttribute(ROUTE_FOCUS_ATTRIBUTE, "");
  const before = layout(main, target);
  target.focus({ preventScroll: true });
  const focused = document.activeElement === target;
  if (focused && layout(main, target) === before) return "placed";
  if (focused) {
    if (prior instanceof HTMLElement && prior !== document.body && prior.isConnected) prior.focus({ preventScroll: true });
    else target.blur();
  }
  if (!indexed) target.removeAttribute("tabindex");
  if (!marked) target.removeAttribute(ROUTE_FOCUS_ATTRIBUTE);
  return focused ? "changes page" : "unavailable";
}

/**
 * Focus after a page change in the app shell (JITM-10 §2.23). A new route, a server-action redirect included, puts focus on
 * its H1 as a programmatic target (tabIndex -1, so no new Tab stop) without scrolling, also where the new page would focus
 * a field itself as it arrives; the route announcer still reads the title. With no H1 in view it falls back to the
 * workspace main. A query or hash change on the same page (a filter, a Today view, a same-page save) is not a page change
 * and keeps its own focus. A loading screen's H1 hands focus on to the page's own H1 when it arrives, until the owner
 * presses a key or the pointer.
 *
 * The move changes nothing the page shows or does (E-179): focusing a target that would move or resize anything is not
 * done; a modal the page opened, or a dialog or popover holding focus, keeps it; the control the owner pressed keeps
 * focus when it survives inside the page, as in a pane of the same page; focus the new page put on something it opened
 * or targeted as it arrived, before the move ran, stays there (pageTargeted); and once focus has landed, focus that the
 * page or the owner moves elsewhere stays theirs. It never navigates.
 */
export function RouteHeadingFocus() {
  const pathname = usePathname();
  const previous = useRef(pathname);
  const pressed = useRef<Element | null>(null);
  useEffect(() => {
    const remember = () => { pressed.current = document.activeElement; };
    document.addEventListener("click", remember, true);
    document.addEventListener("keydown", remember, true);
    return () => { document.removeEventListener("click", remember, true); document.removeEventListener("keydown", remember, true); };
  }, []);
  useEffect(() => {
    if (previous.current === pathname) return;
    previous.current = pathname;
    const main = document.getElementById("workspace-main");
    if (!main) return;
    const kept = pressed.current;
    // Targets whose focus would change the page: never tried again, so no further focus events reach them.
    const refused = new WeakSet<HTMLElement>();
    let placed: HTMLElement | null = null, frame = 0;
    const observer = new MutationObserver(() => place());
    const stop = () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      document.removeEventListener("pointerdown", stop, true);
      document.removeEventListener("keydown", stop, true);
    };
    const attempt = (target: HTMLElement) => {
      if (refused.has(target)) return false;
      const result = focusInPlace(main!, target);
      if (result === "placed") placed = target;
      if (result === "changes page") refused.add(target);
      return result === "placed";
    };
    function place() {
      const active = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
      if (layerOwnsFocus(active)) return stop();
      if (active && active !== placed) {
        // The move has landed and its target is still in the page: the page or the owner put focus where it is now.
        if (placed?.isConnected && usable(placed)) return stop();
        // The pressed control is still there: a pane of the same page changed around it.
        if (active === kept && active !== main && main!.contains(active) && usable(active)) return stop();
        // The new page opened or targeted something and focused it as it arrived: a summary, step or fragment target.
        if (active !== kept && pageTargeted(main!, active)) return stop();
      }
      // A page whose H1 sits in a pane hidden at this width (Journey's people pane) gets the workspace main instead,
      // which is already a programmatic target, so the next Tab still starts in the page.
      const heading = [...main!.querySelectorAll<HTMLElement>("h1")].find(element => usable(element) && !refused.has(element));
      if (heading && heading === placed && active === heading) return;
      if (heading && attempt(heading)) return;
      if (usable(main!) && !(placed === main && active === main)) attempt(main!);
    }
    // The account check outside the page can hold it inert, so watch the whole document for the reveal.
    observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ["style", "hidden", "inert"] });
    document.addEventListener("pointerdown", stop, true);
    document.addEventListener("keydown", stop, true);
    place();
    frame = requestAnimationFrame(place);
    return stop;
  }, [pathname]);
  return null;
}
