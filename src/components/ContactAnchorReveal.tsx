"use client";

import { useEffect } from "react";

/** Keep existing date/note deep links usable when secondary tools are folded. */
export function ContactAnchorReveal({ contactId }: { contactId: string }) {
  useEffect(() => {
    const reveal = () => {
      if (!["#add-date", "#dates-and-mixes", "#contact-history"].includes(location.hash)) return;
      const target = document.getElementById(location.hash.slice(1));
      let node: HTMLElement | null = target;
      while (node) { if (node instanceof HTMLDetailsElement) node.open = true; node = node.parentElement; }
      target?.scrollIntoView({ block: "start" });
    };
    reveal();
    window.addEventListener("hashchange", reveal);
    return () => window.removeEventListener("hashchange", reveal);
  }, [contactId]);
  return null;
}
