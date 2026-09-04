"use client";

import type { FormEvent, ReactNode } from "react";

export function AutoSubmitForm({
  children,
  className,
  action,
  ariaLabel
}: {
  children: ReactNode;
  className?: string;
  action: string;
  ariaLabel?: string;
}) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    const target = event.target;
    if (target instanceof HTMLSelectElement || (target instanceof HTMLInputElement && target.type !== "search")) {
      event.currentTarget.requestSubmit();
    }
  };

  return <form className={className} method="get" action={action} aria-label={ariaLabel} onChange={submit}>{children}</form>;
}
