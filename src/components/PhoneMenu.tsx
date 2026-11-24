"use client";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

/**
 * Controls that sit in a row from 768px and fold behind one menu button on phones (JITM-06 §2.37). They render once
 * (JITM-07 §2.2): CSS hides the button and lays the controls out in their row on wider screens. A sheet that one of
 * them opens renders inside the menu, so the menu stays open behind it; choosing a link, Escape outside a dialog or a
 * press elsewhere closes the menu.
 */
export function PhoneMenu({ button, label, className = "", children }: { button: ReactNode; label?: string; className?: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId(), root = useRef<HTMLDivElement>(null), toggle = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || (event.target as Element | null)?.closest?.("dialog")) return;
      setOpen(false); toggle.current?.focus();
    };
    document.addEventListener("pointerdown", outside); document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, [open]);
  return <div ref={root} className={`phone-menu ${className}`.trim()} data-open={open || undefined} onClick={event => { if ((event.target as Element).closest("a[href]")) setOpen(false); }}>
    <button ref={toggle} type="button" className="phone-menu-button" aria-expanded={open} aria-controls={id} aria-label={label} onClick={() => setOpen(!open)}>{button}</button>
    <div id={id} className="phone-menu-items">{children}</div>
  </div>;
}
