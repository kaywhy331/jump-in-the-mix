"use client";

import type { ReactNode } from "react";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { AppIcon } from "@/components/AppIcon";
import { DOCKED_REVIEW_MEDIA, openSheet } from "@/lib/sheet-layout";

export function Sheet({
  trigger,
  title,
  accessibleTitle,
  description,
  leading,
  children,
  className = "",
  initiallyOpen = false,
  desktopInitiallyOpen = false
}: {
  trigger: ReactNode;
  title: string;
  accessibleTitle?: string;
  description?: string;
  leading?: ReactNode;
  children: ReactNode;
  className?: string;
  initiallyOpen?: boolean;
  desktopInitiallyOpen?: boolean;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const [mounted, setMounted] = useState(initiallyOpen);
  const requestedOpen = useRef(initiallyOpen);
  const openedOnce = useRef(false);
  const docked = className.includes("follow-up-review-sheet");
  const wide = () => docked && window.matchMedia(DOCKED_REVIEW_MEDIA).matches;
  const show = (preserveFocus = false) => {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;
    openSheet(dialog, preserveFocus);
    if (preserveFocus) return;
    // The native dialog lands on its first control, the Close button. Announce the title instead, so
    // what the sheet is for comes before how to leave it. The review's message field is not focused:
    // on a phone that would raise the keyboard over the message and the send buttons.
    titleRef.current?.focus({ preventScroll: true });
  };

  useEffect(() => {
    if (desktopInitiallyOpen && wide()) setMounted(true);
    if (!docked) return;
    const media = window.matchMedia(DOCKED_REVIEW_MEDIA);
    const adapt = () => {
      const dialog = dialogRef.current;
      if (!dialog?.open) return;
      // The same editor stays mounted when rotating/resizing, retaining its draft.
      const focused = document.activeElement;
      // Reopening the parent puts it above its children in the native top layer.
      // Rebuild the modal stack from the outside in so a nested picker stays usable.
      const nested = Array.from(dialog.querySelectorAll<HTMLDialogElement>("dialog:modal"));
      for (const child of [...nested].reverse()) child.close();
      dialog.close();
      openSheet(dialog);
      for (const child of nested) child.showModal();
      if (focused instanceof HTMLElement && dialog.contains(focused)) focused.focus({ preventScroll: true });
    };
    media.addEventListener("change", adapt);
    return () => media.removeEventListener("change", adapt);
  }, [desktopInitiallyOpen, docked]);

  useEffect(() => {
    if (initiallyOpen) {
      setMounted(true);
      show();
    }
  }, [initiallyOpen]);
  useLayoutEffect(() => {
    // Suspense replays layout effects when revealing retained content. Keeping
    // an editor mounted preserves its draft; it must not reopen a closed sheet.
    if (mounted && !openedOnce.current) {
      openedOnce.current = true;
      show(!requestedOpen.current);
    }
  }, [mounted]);

  const open = () => {
    requestedOpen.current = true;
    if (!mounted) { setMounted(true); return; }
    show();
  };
  const close = () => dialogRef.current?.close();
  const restoreTriggerFocus = () => {
    if (dialogRef.current?.open || (docked && document.querySelector(".follow-up-review-sheet[open]"))) return;
    triggerRef.current?.querySelector<HTMLElement>("button, a, [tabindex]")?.focus();
  };

  return (
    <>
      <span ref={triggerRef} className="sheet-trigger" onClick={open}>{trigger}</span>
      {/* A list can contain hundreds of closed sheets. Mount on first use,
          then retain the contents so closing never discards an unsaved draft. */}
      {mounted && <dialog
        ref={dialogRef}
        className={`sheet ${className}`.trim()}
        aria-labelledby={accessibleTitle ? undefined : titleId}
        aria-label={accessibleTitle}
        aria-describedby={description ? descriptionId : undefined}
        onClick={(event) => { if (event.target === event.currentTarget) close(); }}
        onClose={restoreTriggerFocus}
        onKeyDown={event => {
          if (event.key === "Escape" && !event.currentTarget.matches(":modal") && (event.target as Element).closest("dialog") === event.currentTarget) {
            event.preventDefault();
            close();
          }
        }}
      >
        <div className="sheet-panel">
          <header className="sheet-header">
            {leading}
            <div className="sheet-heading-copy">
              <h2 id={titleId} ref={titleRef} tabIndex={-1}>{title}</h2>
              {description && <p id={descriptionId}>{description}</p>}
            </div>
            <button className="icon-button" type="button" onClick={close} aria-label={`Close ${accessibleTitle ?? title}`}><AppIcon name="close" /></button>
          </header>
          <div className="sheet-body">{children}</div>
        </div>
      </dialog>}
    </>
  );
}
