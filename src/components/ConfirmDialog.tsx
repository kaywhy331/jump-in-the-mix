"use client";

import { useId, useRef, type ReactNode } from "react";
import { AppIcon } from "@/components/AppIcon";

export function ConfirmDialog({
  trigger,
  triggerAriaLabel,
  triggerClassName,
  title,
  description,
  children,
  danger = false
}: {
  trigger: ReactNode;
  triggerAriaLabel?: string;
  triggerClassName?: string;
  title: string;
  description: string;
  children: ReactNode;
  danger?: boolean;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const close = () => { dialogRef.current?.close(); triggerRef.current?.focus(); };
  const className = triggerClassName ?? `button small${danger ? " danger" : ""}`;

  return <><button ref={triggerRef} className={className} type="button" aria-label={triggerAriaLabel} onClick={() => { dialogRef.current?.showModal(); cancelRef.current?.focus(); }}>{trigger}</button><dialog ref={dialogRef} className="confirm-dialog" aria-labelledby={titleId} aria-describedby={descriptionId} onClose={() => triggerRef.current?.focus()}><div className="confirm-dialog-header"><div><h2 id={titleId}>{title}</h2><p id={descriptionId}>{description}</p></div><button className="icon-button" type="button" onClick={close} aria-label="Close confirmation"><AppIcon name="close" /></button></div><div className="confirm-dialog-actions"><button ref={cancelRef} className="button" type="button" autoFocus onClick={close}>Cancel</button>{children}</div></dialog></>;
}
