"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { MouseEvent, ReactNode } from "react";
import { readContactListState } from "@/lib/contact-list-state";

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

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    const state = readContactListState();
    if (!state) return;
    event.preventDefault();
    router.push(state.href, { scroll: false });
  };

  return <Link className={className} href="/contacts" aria-label={ariaLabel} onClick={handleClick}>{children}</Link>;
}
