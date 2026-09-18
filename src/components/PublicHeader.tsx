import Link from "next/link";
import { WaitlistLink } from "@/components/WaitlistLink";
import { Logo } from "@/components/Logo";

export type PublicHeaderLink = { href: string; label: string; demoTrigger?: boolean };

// Keep public destinations available on narrow screens.
export function PublicHeader({ links = [], scenarioId }: { links?: PublicHeaderLink[]; scenarioId?: string }) {
  return <header className="public-header">
    <Logo />
    <nav className="public-site-nav" aria-label="Public navigation">
      {links.map(link => link.demoTrigger
        ? <a key={link.href} className="public-section-link" href={link.href} data-demo-trigger>{link.label}</a>
        : <Link key={link.href} className="public-section-link" href={link.href}>{link.label}</Link>)}
      <Link className="public-sign-in" href="/login">Sign in</Link>
      <WaitlistLink className="button" scenarioId={scenarioId}>Join the waitlist</WaitlistLink>
    </nav>
    {links.length > 0 && <details className="public-mobile-menu"><summary>Explore</summary><nav aria-label="Explore the app">{links.map(link => <Link key={link.href} href={link.href} data-demo-trigger={link.demoTrigger || undefined}>{link.label}</Link>)}<Link href="/contact">Contact support</Link></nav></details>}
  </header>;
}
