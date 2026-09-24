"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { AppIcon } from "@/components/AppIcon";

export type ConfirmRequest = { title: string; description: string; confirmLabel: string; cancelLabel?: string; danger?: boolean };

/** An awaitable confirmation that uses the app's confirmation dialog instead of the browser's
 *  unstyled window.confirm: one heading, supporting copy, a 44px close control, Cancel first
 *  and initially focused. Render the returned element once inside the component. */
export function useConfirmDialog(): [(request: ConfirmRequest) => Promise<boolean>, ReactNode] {
  const [pending, setPending] = useState<(ConfirmRequest & { resolve: (value: boolean) => void }) | null>(null);
  const confirm = (request: ConfirmRequest) => new Promise<boolean>(resolve => setPending({ ...request, resolve }));
  return [confirm, pending ? <ConfirmPrompt key={pending.title} {...pending} onDone={value => { pending.resolve(value); setPending(null); }} /> : null];
}

function ConfirmPrompt({ title, description, confirmLabel, cancelLabel = "Cancel", danger = false, onDone }: ConfirmRequest & { onDone: (value: boolean) => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const answer = useRef(false);
  const titleId = useId(), descriptionId = useId();
  useEffect(() => {
    const previous = document.activeElement;
    dialogRef.current?.showModal();
    cancelRef.current?.focus();
    return () => { if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true }); };
  }, []);
  const close = (value: boolean) => { answer.current = value; dialogRef.current?.close(); };
  // React re-dispatches close/cancel through the component tree; keep them from closing a parent dialog.
  return <dialog ref={dialogRef} className="confirm-dialog" aria-labelledby={titleId} aria-describedby={descriptionId}
    onCancel={event => event.stopPropagation()} onClose={event => { event.stopPropagation(); onDone(answer.current); }}>
    <div className="confirm-dialog-header"><div><h2 id={titleId}>{title}</h2><p id={descriptionId}>{description}</p></div><button className="icon-button" type="button" onClick={() => close(false)} aria-label="Close confirmation"><AppIcon name="close" /></button></div>
    <div className="confirm-dialog-actions">
      <button ref={cancelRef} className="button" type="button" autoFocus onClick={() => close(false)}>{cancelLabel}</button>
      <button className={`button ${danger ? "danger" : "primary"}`} type="button" onClick={() => close(true)}>{confirmLabel}</button>
    </div>
  </dialog>;
}
