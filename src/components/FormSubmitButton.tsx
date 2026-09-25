"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

export function FormSubmitButton({ label, pendingLabel, formAction, name, value, disabled = false, className = "button primary", icon }: { label: string; pendingLabel: string; disabled?: boolean; name?: string; value?: string; className?: string; icon?: ReactNode; formAction?: (data: FormData) => void | Promise<void> }) {
  const { pending } = useFormStatus();
  return <button className={className} type="submit" name={name} value={value} formAction={formAction} disabled={pending || disabled} aria-busy={pending}>{icon}{pending ? pendingLabel : label}</button>;
}
