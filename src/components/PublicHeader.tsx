"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { WaitlistLink } from "@/components/WaitlistLink";
import { Logo } from "@/components/Logo";
import { AppIcon } from "@/components/AppIcon";

export type PublicHeaderLink = { href: string; label: string; demoTrigger?: boolean };

// Keep public destinations available on narrow screens.
export function PublicHeader({ links = [], scenarioId }: { links?: PublicHeaderLink[]; scenarioId?: string }) {
  const menu = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const dismiss = (event: PointerEvent) => { if (event.target instanceof Node && !menu.current?.contains(event.target) && menu.current) menu.current.open = false; };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, []);
  return <header className="public-header">
    <Logo />
    <nav className="public-site-nav" aria-label="Public navigation">
      {links.map(link => link.demoTrigger
        ? <a key={link.href} className="public-section-link" href={link.href} data-demo-trigger>{link.label}</a>
        : <Link key={link.href} className="public-section-link" href={link.href}>{link.label}</Link>)}
      <Link className="public-sign-in" href="/login">Sign in</Link>
      <WaitlistLink className="button" scenarioId={scenarioId}><span className="public-join-full">Join the waitlist</span><span className="public-join-short" aria-hidden="true">Join</span></WaitlistLink>
    </nav>
    {links.length > 0 && <details ref={menu} className="public-mobile-menu" onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); event.currentTarget.open = false; event.currentTarget.querySelector("summary")?.focus(); } }} onClick={event => { if (event.target instanceof Element && event.target.closest("a")) event.currentTarget.open = false; }}><summary aria-label="Explore"><AppIcon name="more" /></summary><nav aria-label="Explore the app">{links.map(link => <Link key={link.href} href={link.href} data-demo-trigger={link.demoTrigger || undefined}>{link.label}</Link>)}<Link href="/login">Sign in</Link><Link href="/contact">Contact support</Link></nav></details>}
  </header>;
}
