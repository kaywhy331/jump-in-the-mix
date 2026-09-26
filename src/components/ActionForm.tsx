"use client";
import { useActionState, useEffect, useId, useRef, type ReactNode } from "react";
import type { FormResult } from "@/lib/form-errors";
import { FormGuard } from "@/components/FormGuard";

export function ActionForm({ action, children, className = "form-stack", protect = false }: {
  action: (previous: FormResult, data: FormData) => Promise<FormResult>; children: ReactNode; className?: string; protect?: boolean;
}) {
  const [state, submit] = useActionState(async (previous: FormResult, data: FormData): Promise<FormResult> => {
    try { return await action(previous, data); }
    catch (cause) {
      if (cause && typeof cause === "object" && "digest" in cause && String(cause.digest).startsWith("NEXT_")) throw cause;
      return { error: "We couldn’t confirm this save. Your entries are kept. Check your connection and refresh the saved record before retrying." };
    }
  }, {});
  const error = useRef<HTMLParagraphElement>(null), form = useRef<HTMLFormElement>(null);
  const errorId = useId();
  useEffect(() => {
    if (!state.error) return;
    for (const input of form.current?.querySelectorAll<HTMLInputElement>('input[autocomplete="current-password"],input[autocomplete="new-password"]') ?? []) input.value = "";
    for (const control of form.current?.querySelectorAll<HTMLElement>("input:not([type=hidden]),textarea,select") ?? []) control.setAttribute("aria-describedby", [...new Set([...(control.getAttribute("aria-describedby") ?? "").split(/\s+/), errorId].filter(Boolean))].join(" "));
    error.current?.focus();
  }, [state]);
  return <form ref={form} action={submit} className={className} onReset={event => event.preventDefault()} aria-describedby={state.error ? errorId : undefined}>
    {protect && <FormGuard guardOtherForms />}
    {state.error && <p id={errorId} ref={error} tabIndex={-1} role="alert" className="notice error">{state.error}</p>}
    {children}
  </form>;
}
