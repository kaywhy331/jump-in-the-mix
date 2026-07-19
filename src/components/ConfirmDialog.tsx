"use client";

import { useId, useRef, type ReactNode } from "react";
import { AppIcon } from "@/components/AppIcon";

export function ConfirmDialog({ trigger, title, description, children, danger = false }: { trigger: string; title: string; description: string; children: ReactNode; danger?: boolean }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const close = () => { dialogRef.current?.close(); triggerRef.current?.focus(); };
  return <><button ref={triggerRef} className={`button small${danger ? " danger" : ""}`} type="button" onClick={() => dialogRef.current?.showModal()}>{trigger}</button><dialog ref={dialogRef} className="confirm-dialog" aria-labelledby={titleId} onClose={() => triggerRef.current?.focus()}><div className="confirm-dialog-header"><div><h2 id={titleId}>{title}</h2><p>{description}</p></div><button className="icon-button" type="button" onClick={close} aria-label="Close confirmation"><AppIcon name="close" /></button></div><div className="confirm-dialog-actions">{children}<button className="button" type="button" onClick={close}>Cancel</button></div></dialog></>;
}
