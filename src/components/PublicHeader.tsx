import Link from "next/link";
import { Logo } from "@/components/Logo";

export type PublicHeaderLink = { href: string; label: string; demoTrigger?: boolean };

// The header shared by the public marketing pages. Section links hide on phones, where the
// footer repeats them; the sign-in and waitlist actions always show.
export function PublicHeader({ links = [] }: { links?: PublicHeaderLink[] }) {
  return <header className="public-header">
    <Logo />
    <nav className="public-site-nav" aria-label="Public navigation">
      {links.map(link => link.demoTrigger
        ? <a key={link.href} className="public-section-link" href={link.href} data-demo-trigger>{link.label}</a>
        : <Link key={link.href} className="public-section-link" href={link.href}>{link.label}</Link>)}
      <Link className="public-sign-in" href="/login">Sign in</Link>
      <Link className="button primary" href="/waitlist">Join the waitlist</Link>
    </nav>
  </header>;
}
