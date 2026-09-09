"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { MouseEvent, ReactNode } from "react";
import { readContactListState } from "@/lib/contact-list-state";
import { useBrowserScope } from "@/components/BrowserAccountBoundary";

export function ContactsBackLink({
  className,
  ariaLabel,
  children
}: {
  className?: string;
  ariaLabel?: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const scope = useBrowserScope();

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    const state = scope ? readContactListState(scope) : null;
    if (!state) return;
    event.preventDefault();
    router.push(state.href, { scroll: false });
  };

  return <Link className={className} href="/contacts" aria-label={ariaLabel} onClick={handleClick}>{children}</Link>;
}
