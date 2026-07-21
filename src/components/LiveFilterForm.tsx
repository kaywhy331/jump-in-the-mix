"use client";

import { usePathname, useRouter } from "next/navigation";
import {
  useEffect,
  useRef,
  useTransition,
  type ChangeEvent,
  type FormEvent,
  type ReactNode
} from "react";

function isDebouncedControl(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement
    && ["search", "text", "email", "tel"].includes(target.type);
}

export function LiveFilterForm({
  action,
  className,
  children,
  debounceMs = 300,
  ariaLabel
}: {
  action?: string;
  className?: string;
  children: ReactNode;
  debounceMs?: number;
  ariaLabel?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const formRef = useRef<HTMLFormElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isPending, startTransition] = useTransition();

  const navigate = () => {
    const form = formRef.current;
    if (!form) return;
    const params = new URLSearchParams();
    for (const [key, rawValue] of new FormData(form).entries()) {
      if (rawValue instanceof File) continue;
      const value = rawValue.trim();
      if (value) params.append(key, value);
    }
    const target = action ?? pathname;
    const query = params.toString();
    startTransition(() => router.replace(query ? `${target}?${query}` : target, { scroll: false }));
  };

  const clearTimer = () => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = null;
  };

  const submitNow = () => {
    clearTimer();
    navigate();
  };

  const handleChange = (event: ChangeEvent<HTMLFormElement>) => {
    clearTimer();
    if (isDebouncedControl(event.target)) {
      timerRef.current = window.setTimeout(navigate, debounceMs);
      return;
    }
    navigate();
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    submitNow();
  };

  useEffect(() => clearTimer, []);

  return (
    <form
      ref={formRef}
      className={className}
      action={action ?? pathname}
      method="get"
      onChange={handleChange}
      onSubmit={handleSubmit}
      aria-label={ariaLabel}
      aria-busy={isPending}
      data-live-filter
    >
      {children}
      <span className="sr-only" aria-live="polite">{isPending ? "Updating results" : ""}</span>
    </form>
  );
}
