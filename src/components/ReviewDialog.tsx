"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { AppIcon } from "@/components/AppIcon";

export function ReviewDialog({ open, onClose, title, description, children }: {
  open: boolean;
  onClose: () => void;
  title: string;
  description: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!open || !dialog) return;
    const previous = document.activeElement;
    dialog.showModal();
    return () => {
      dialog.close();
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, [open]);

  return <dialog ref={ref} className="review-dialog" aria-labelledby={titleId} aria-describedby={descriptionId}
    onCancel={onClose} onClose={() => { if (open) onClose(); }} onKeyDown={event => {
      if (event.key !== "Tab") return;
      const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea, [tabindex]'))
        .filter(element => element.tabIndex >= 0 && !element.matches(":disabled") && element.getClientRects().length > 0);
      const first = controls[0];
      const last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }}>
    <header className="review-dialog-header">
      <div><h2 id={titleId}>{title}</h2><p id={descriptionId}>{description}</p></div>
      <button className="icon-button" type="button" autoFocus onClick={onClose} aria-label="Close review"><AppIcon name="close" /></button>
    </header>
    <div className="review-dialog-body">{children}</div>
  </dialog>;
}
