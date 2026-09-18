"use client";

import { useFormStatus } from "react-dom";

export function FormSubmitButton({ label, pendingLabel, formAction, name, value, disabled = false }: { label: string; pendingLabel: string; disabled?: boolean; name?: string; value?: string; formAction?: (data: FormData) => void | Promise<void> }) {
  const { pending } = useFormStatus();
  return <button className="button primary" type="submit" name={name} value={value} formAction={formAction} disabled={pending || disabled} aria-busy={pending}>{pending ? pendingLabel : label}</button>;
}
