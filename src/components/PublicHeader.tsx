"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { WaitlistLink } from "@/components/WaitlistLink";
import { Logo } from "@/components/Logo";
import { AppIcon } from "@/components/AppIcon";
import { OpenAppLink, useSignedInBrowser } from "@/components/OpenAppLink";
import { AppearanceControl } from "@/components/Appearance";

export type PublicHeaderLink = { href: string; label: string; demoTrigger?: boolean };

// Every public header and its Explore menu reach Pricing (JITM-09 §2.83).
const PRICING_LINK: PublicHeaderLink = { href: "/pricing", label: "Pricing" };

// Keep public destinations available on narrow screens. `current` is the page's own path, marked for assistive technology.
export function PublicHeader({ links = [], scenarioId, current }: { links?: PublicHeaderLink[]; scenarioId?: string; current?: string }) {
  const sectionLinks = links.some(link => link.href === PRICING_LINK.href) ? links : [...links, PRICING_LINK];
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
      {sectionLinks.map(link => link.demoTrigger
        ? <a key={link.href} className="public-section-link" href={link.href} data-demo-trigger>{link.label}</a>
        : <Link key={link.href} className="public-section-link" href={link.href} aria-current={link.href === current ? "page" : undefined}>{link.label}</Link>)}
      <AppearanceControl compact labelHidden />
      <OpenAppLink className="public-sign-in" signedIn={signedIn} />
      <WaitlistLink className="button" scenarioId={scenarioId}><span className="public-join-full">Join the waitlist</span><span className="public-join-short" aria-hidden="true">Join</span></WaitlistLink>
    </nav>
    <details ref={menu} className="public-mobile-menu" onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); event.currentTarget.open = false; event.currentTarget.querySelector("summary")?.focus(); } }} onClick={event => { if (event.target instanceof Element && event.target.closest("a")) event.currentTarget.open = false; }}><summary aria-label="Explore"><AppIcon name="more" /></summary><nav aria-label="Explore the app">{sectionLinks.map(link => <Link key={link.href} href={link.href} aria-current={link.href === current ? "page" : undefined} data-demo-trigger={link.demoTrigger || undefined}>{link.label}</Link>)}<OpenAppLink signedIn={signedIn} /><Link href="/contact">Contact support</Link><div className="public-menu-appearance"><AppearanceControl compact /></div></nav></details>
  </header>;
}
