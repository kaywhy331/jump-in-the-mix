"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

/** `describedBy` links the reason a disabled button gives (JITM-08 §2.6). */
export function FormSubmitButton({ label, pendingLabel, formAction, name, value, disabled = false, className = "button primary", icon, describedBy }: { label: string; pendingLabel: string; disabled?: boolean; name?: string; value?: string; className?: string; icon?: ReactNode; formAction?: (data: FormData) => void | Promise<void>; describedBy?: string }) {
  const { pending } = useFormStatus();
  return <button className={className} type="submit" name={name} value={value} formAction={formAction} disabled={pending || disabled} aria-busy={pending} aria-describedby={describedBy}>{icon}{pending ? pendingLabel : label}</button>;
}
