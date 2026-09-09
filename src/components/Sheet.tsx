"use client";

import type { ReactNode } from "react";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { AppIcon } from "@/components/AppIcon";

export function Sheet({
  trigger,
  title,
  description,
  children,
  className = "",
  initiallyOpen = false
}: {
  trigger: ReactNode;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
  initiallyOpen?: boolean;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const [mounted, setMounted] = useState(initiallyOpen);

  useEffect(() => {
    if (initiallyOpen) {
      setMounted(true);
      if (dialogRef.current && !dialogRef.current.open) dialogRef.current.showModal();
    }
  }, [initiallyOpen]);
  useLayoutEffect(() => {
    if (mounted && !dialogRef.current?.open) dialogRef.current?.showModal();
  }, [mounted]);

  const open = () => {
    if (!mounted) { setMounted(true); return; }
    if (!dialogRef.current?.open) dialogRef.current?.showModal();
  };
  const close = () => dialogRef.current?.close();
  const restoreTriggerFocus = () => {
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
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        onClick={(event) => { if (event.target === event.currentTarget) close(); }}
        onClose={restoreTriggerFocus}
      >
        <div className="sheet-panel">
          <header className="sheet-header">
            <div>
              <h2 id={titleId}>{title}</h2>
              {description && <p id={descriptionId}>{description}</p>}
            </div>
            <button className="icon-button" type="button" onClick={close} aria-label={`Close ${title}`}><AppIcon name="close" /></button>
          </header>
          <div className="sheet-body">{children}</div>
        </div>
      </dialog>}
    </>
  );
}
