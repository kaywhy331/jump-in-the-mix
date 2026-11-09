"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { FormSubmitButton } from "@/components/FormSubmitButton";

/** A compact footer for an existing form; saving and validation stay with that form. */
export function SaveBar({ cancelHref, saveLabel = "Save", label = "Save", disabled = false }: {
  cancelHref: string; saveLabel?: string; label?: string; disabled?: boolean;
}) {
  const bar = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const form = bar.current?.closest("form");
    const reveal = (event: FocusEvent) => {
      const field = event.target;
      if (!(field instanceof HTMLElement) || bar.current?.contains(field) || !field.matches(":focus-visible")) return;
      const bounds = field.getBoundingClientRect();
      const obscured = [...document.querySelectorAll(".save-bar, .mobile-nav, .mobile-app-header")].some(overlay => {
        const rect = overlay.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && bounds.left < rect.right && bounds.right > rect.left && bounds.top < rect.bottom && bounds.bottom > rect.top;
      });
      if (obscured) field.scrollIntoView({ block: "center", behavior: "instant" });
    };
    form?.addEventListener("focusin", reveal);
    return () => form?.removeEventListener("focusin", reveal);
  }, []);
  return <div className="save-bar" ref={bar}>
    <Link className="button" href={cancelHref}>Cancel</Link>
    <FormSubmitButton label={label} ariaLabel={saveLabel} pendingLabel="Saving…" disabled={disabled} />
  </div>;
}
