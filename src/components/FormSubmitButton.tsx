"use client";

import { useFormStatus } from "react-dom";

export function FormSubmitButton({ label, pendingLabel, formAction }: { label: string; pendingLabel: string; formAction?: (data: FormData) => void | Promise<void> }) {
  const { pending } = useFormStatus();
  return <button className="button primary" type="submit" formAction={formAction} disabled={pending} aria-busy={pending}>{pending ? pendingLabel : label}</button>;
}
