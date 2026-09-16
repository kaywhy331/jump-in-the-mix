"use client";

import { useFormStatus } from "react-dom";

export function FormSubmitButton({ label, pendingLabel, formAction, name, value }: { label: string; pendingLabel: string; name?: string; value?: string; formAction?: (data: FormData) => void | Promise<void> }) {
  const { pending } = useFormStatus();
  return <button className="button primary" type="submit" name={name} value={value} formAction={formAction} disabled={pending} aria-busy={pending}>{pending ? pendingLabel : label}</button>;
}
