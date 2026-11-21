"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { WaitlistLink } from "@/components/WaitlistLink";
import { Logo } from "@/components/Logo";
import { AppIcon } from "@/components/AppIcon";
import { OpenAppLink, useSignedInBrowser } from "@/components/OpenAppLink";
import { AppearanceControl } from "@/components/Appearance";

// One header for every public page (JITM-06 §2.28): the same section links everywhere, Pricing included
// (JITM-09 §2.83). The phone Explore menu holds the same list.
const SECTION_LINKS = [{ href: "/follow-up-templates", label: "Templates" }, { href: "/faq", label: "Questions" }, { href: "/pricing", label: "Pricing" }];

// Keep public destinations available on narrow screens. `current` is the page's own path, marked for assistive technology.
export function PublicHeader({ scenarioId, current }: { scenarioId?: string; current?: string }) {
  const menu = useRef<HTMLDetailsElement>(null);
  const signedIn = useSignedInBrowser();
  useEffect(() => {
    const dismiss = (event: PointerEvent) => { if (event.target instanceof Node && !menu.current?.contains(event.target) && menu.current) menu.current.open = false; };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, []);
  return <header className="public-header">
    <Logo />
    <nav className="public-site-nav" aria-label="Public navigation">
      {SECTION_LINKS.map(link => <Link key={link.href} className="public-section-link" href={link.href} aria-current={link.href === current ? "page" : undefined}>{link.label}</Link>)}
      <AppearanceControl compact labelHidden />
      <OpenAppLink className="public-sign-in" signedIn={signedIn} />
      <WaitlistLink className="button" scenarioId={scenarioId}><span className="public-join-full">Join the waitlist</span><span className="public-join-short" aria-hidden="true">Join</span></WaitlistLink>
    </nav>
    <details ref={menu} className="public-mobile-menu" onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); event.currentTarget.open = false; event.currentTarget.querySelector("summary")?.focus(); } }} onClick={event => { if (event.target instanceof Element && event.target.closest("a")) event.currentTarget.open = false; }}><summary aria-label="Explore"><AppIcon name="more" /></summary><nav aria-label="Explore the app">{SECTION_LINKS.map(link => <Link key={link.href} href={link.href} aria-current={link.href === current ? "page" : undefined}>{link.label}</Link>)}<OpenAppLink signedIn={signedIn} /><Link href="/contact">Contact support</Link><div className="public-menu-appearance"><AppearanceControl compact /></div></nav></details>
  </header>;
}
