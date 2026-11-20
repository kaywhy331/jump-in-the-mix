"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { MouseEvent, ReactNode } from "react";
import { readContactListState } from "@/lib/contact-list-state";
import { useBrowserScope } from "@/components/BrowserAccountBoundary";
import { followBack } from "@/lib/back-navigation";

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

  // Back to the list as Back does; otherwise to the list the owner left, at its scroll (JITM-08 §2.46).
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    const state = scope ? readContactListState(scope) : null;
    followBack(event, "/contacts", () => state ? router.push(state.href, { scroll: false }) : router.push("/contacts"));
  };

  return <Link data-back-link className={className} href="/contacts" aria-label={ariaLabel} onClick={handleClick}>{children}</Link>;
}
