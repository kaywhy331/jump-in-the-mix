"use client";

import { useEffect } from "react";

// The <details> a fragment names, if it is one on this page.
function linkedDisclosure(hash: string): HTMLDetailsElement | null {
  let id = "";
  try { id = decodeURIComponent(hash.replace(/^#/, "")); } catch { return null; }
  const target = id ? document.getElementById(id) : null;
  return target instanceof HTMLDetailsElement ? target : null;
}

/**
 * Opens the question a link points at, such as /faq#your-data: on arrival, on Back and Forward, and on
 * a same-page link, which the app router follows without a hashchange event. Renders nothing.
 */
export function OpenLinkedDisclosure() {
  useEffect(() => {
    const openCurrent = () => { const target = linkedDisclosure(window.location.hash); if (target) target.open = true; };
    const follow = (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest("a[href*='#']") : null;
      if (!(link instanceof HTMLAnchorElement) || link.pathname !== window.location.pathname) return;
      const target = linkedDisclosure(link.hash);
      if (target) target.open = true;
    };
    openCurrent();
    window.addEventListener("hashchange", openCurrent);
    window.addEventListener("popstate", openCurrent);
    document.addEventListener("click", follow);
    return () => {
      window.removeEventListener("hashchange", openCurrent);
      window.removeEventListener("popstate", openCurrent);
      document.removeEventListener("click", follow);
    };
  }, []);
  return null;
}
