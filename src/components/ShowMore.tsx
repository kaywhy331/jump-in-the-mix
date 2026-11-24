"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { AppIcon } from "@/components/AppIcon";

const FOCUSABLE = "a[href], button:not([disabled]), summary, input, select, textarea, [tabindex]";

/**
 * Long phone content shows its first part and a Show more control (JITM-08 §2.21). The items marked `data-more` stay
 * mounted; CSS hides them below the `boundary` (768px in the app, 761px on public pages, JITM-07 §2.1) until the owner
 * asks, and wider screens show everything with no control. Show more is one way: it reveals the rest and moves focus
 * to the first item it revealed.
 */
export function ShowMore({ hidden, label, describedBy, boundary = "app", className, children }: { hidden: number; label: string; describedBy?: string; boundary?: "app" | "public"; className?: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  // Only the button opens it, so focus follows the press once the revealed items are shown.
  useEffect(() => {
    const first = open ? root.current?.querySelector<HTMLElement>("[data-more]") : null;
    if (!first) return;
    if (!first.matches(FOCUSABLE)) first.tabIndex = -1;
    first.focus();
  }, [open]);
  return <div ref={root} className={className ? `show-more ${className}` : "show-more"} data-boundary={boundary} data-open={open || undefined}>
    {children}
    {hidden > 0 && !open && <button type="button" className="button show-more-button" aria-describedby={describedBy} onClick={() => setOpen(true)}><AppIcon name="chevronDown" />{label}</button>}
  </div>;
}
