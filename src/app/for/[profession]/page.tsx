import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Logo } from "@/components/Logo";
import { ProductDemo } from "@/components/ProductDemo";
import { MixesFor } from "@/components/MixesFor";
import { WaitlistForm } from "@/components/WaitlistForm";
import { PublicFooter } from "@/components/PublicFooter";
import { env } from "@/lib/env";
import { PERSONAS, persona as findPersona } from "@/lib/persona-mixes";

export function generateStaticParams() { return PERSONAS.map(item => ({ profession: item.slug })); }

export async function generateMetadata({ params }: { params: Promise<{ profession: string }> }): Promise<Metadata> {
  const { profession } = await params;
  const persona = findPersona(profession);
  if (!persona || persona.slug !== profession) return {};
  const url = new URL(`/for/${persona.slug}`, env.appUrl).href;
  return {
    title: persona.headline,
    description: persona.supporting,
    alternates: { canonical: url },
    openGraph: { title: `${persona.headline} | Jump in the Mix`, description: persona.supporting, url, images: [{ url: new URL("/relationship-preview.png?v=4", env.appUrl).href, width: 1200, height: 630 }] }
  };
}

// Same page composition and styling as the homepage; only the hero copy and the mixes in the
// demo belong to this profession.
export default async function ProfessionPage({ params }: { params: Promise<{ profession: string }> }) {
  const { profession } = await params;
  const persona = findPersona(profession);
  if (!persona || persona.slug !== profession) notFound();
  return <div className="public-page">
    <a className="public-skip-link" href="#main-content">Skip to content</a>
    <header className="public-header">
      <Logo />
      <nav className="public-site-nav" aria-label="Public navigation">
        <a className="public-section-link" href="#sample">Try the demo</a>
        <Link className="public-sign-in" href="/login">Sign in</Link>
        <Link className="button primary" href="/waitlist">Join the waitlist</Link>
      </nav>
    </header>
    <main id="main-content" tabIndex={-1}>
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-copy">
          <span className="eyebrow">{persona.eyebrow}</span>
          <h1 id="hero-title">{persona.headline}</h1>
          <p>{persona.supporting}</p>
          <div className="hero-actions"><Link className="button primary" href="/waitlist">Join the waitlist</Link><a className="button" href="#sample" data-demo-trigger>Try the demo</a></div>
          <MixesFor current={persona.id} />
        </div>
        <ProductDemo scenarios={persona.mixes} heading={persona.demoHeading} legend={`Choose a ${persona.label.toLowerCase()} mix`} />
      </section>
      <section id="waitlist" className="section" aria-labelledby="waitlist-title"><div className="section-heading"><h2 id="waitlist-title">Get in the mix.</h2><p>We’re glad you’re here. Join the waitlist and we’ll let you know the moment it’s your turn to start mixing—your people, your words, your rhythm.</p></div><WaitlistForm scenarioId={persona.id} /></section>
    </main>
    <PublicFooter />
  </div>;
}
