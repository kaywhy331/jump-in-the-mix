"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

/** Rendered and usable: Suspense can keep the page being replaced in the DOM, hidden, and the account check makes it inert. */
const usable = (element: Element) => element.getClientRects().length > 0 && !element.closest("[inert]");

/**
 * Focus after a page change in the app shell (JITM-10 §2.23). A new route, a server-action redirect included, puts focus on
 * its H1 as a programmatic target (tabIndex -1, so no new Tab stop) without scrolling, also where the new page would focus
 * a field itself; the route announcer still reads the title. With no H1 in view it falls back to the workspace main. A query or hash change on the same page (a filter, a Today
 * view, a same-page save) is not a page change and keeps its own focus. So do a dialog transaction and the control the
 * owner pressed when it survives inside the page, as in a pane of the same page. A loading screen's H1 hands focus on to
 * the page's own H1 when it arrives, until the owner presses a key or the pointer.
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
    let placed: HTMLElement | null = null, frame = 0;
    const observer = new MutationObserver(() => place());
    const stop = () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      document.removeEventListener("pointerdown", stop, true);
      document.removeEventListener("keydown", stop, true);
    };
    function place() {
      const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      // A dialog owns its focus and returns it to its trigger.
      if (active?.closest("dialog[open]")) return stop();
      // The pressed control is still there: a pane of the same page changed around it.
      if (active && active === kept && active !== main && main!.contains(active) && usable(active)) return stop();
      // A page whose H1 sits in a pane hidden at this width (Journey's people pane) gets the workspace main instead,
      // which is already a programmatic target, so the next Tab still starts in the page.
      const heading = [...main!.querySelectorAll<HTMLElement>("h1")].find(usable) ?? (usable(main!) ? main! : null);
      if (!heading || (heading === placed && active === heading)) return;
      if (!heading.hasAttribute("tabindex")) heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
      if (document.activeElement === heading) placed = heading;
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
