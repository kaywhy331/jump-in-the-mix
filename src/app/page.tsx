import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { WaitlistForm } from "@/components/WaitlistForm";
import { ProductDemo } from "@/components/ProductDemo";
import { env } from "@/lib/env";
import { MixesFor } from "@/components/MixesFor";
import { ProfessionMarks } from "@/components/ProfessionMarks";
import { PublicFooter } from "@/components/PublicFooter";

const description = "Keep your contacts, thoughtful follow-ups, and next steps in one simple daily list. Build relationships that matter to you and your business.";

export const metadata: Metadata = {
  title: "Know who to follow up with. And what to say.",
  description,
  alternates: { canonical: new URL("/", env.appUrl).href },
  openGraph: {
    title: "Know who to follow up with. And what to say. | Jump in the Mix",
    description,
    url: new URL("/", env.appUrl).href,
    siteName: "Jump in the Mix",
    type: "website",
    images: [{ url: new URL("/relationship-preview.png?v=4", env.appUrl).href, width: 1200, height: 630, alt: "Jump in the Mix. Good relationships have a rhythm." }]
  },
  twitter: { card: "summary_large_image", title: "Know who to follow up with. And what to say.", description, images: [new URL("/relationship-preview.png?v=4", env.appUrl).href] }
};

export default function HomePage() {
  return <div className="public-page">
    <a className="public-skip-link" href="#main-content">Skip to content</a>
    <header className="public-header">
      <Logo />
      <nav className="public-site-nav" aria-label="Public navigation">
        <Link className="public-section-link" href="/faq">Questions</Link>
        <Link className="public-sign-in" href="/login">Sign in</Link>
        <Link className="button primary" href="/waitlist">Join the waitlist</Link>
      </nav>
    </header>
    <main id="main-content" tabIndex={-1}>
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-copy">
          <h1 id="hero-title">Know who to follow up with. <em>And what to say.</em></h1>
          <p>Keep customers, friends, and new connections in one place. Choose when to reach out, get a message to make your own, and pick up the conversation from your daily list.</p>
          <div className="hero-actions"><Link className="button primary" href="/waitlist">Join the waitlist</Link><a className="button" href="#sample" data-demo-trigger>Try the demo</a></div>
          <MixesFor current="all" />
        </div>
        <ProductDemo />
      </section>
      <ProfessionMarks />
      <section id="waitlist" className="section" aria-labelledby="waitlist-title"><div className="section-heading"><h2 id="waitlist-title">Get in the mix.</h2><p>We’re glad you’re here. Join the waitlist and we’ll let you know the moment it’s your turn to start mixing—your people, your words, your rhythm.</p></div><WaitlistForm /></section>
      </main>
    <PublicFooter />
  </div>;
}
