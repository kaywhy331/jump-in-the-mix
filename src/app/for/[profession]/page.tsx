import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ProductDemo } from "@/components/ProductDemo";
import { MixesFor } from "@/components/MixesFor";
import { WaitlistForm } from "@/components/WaitlistForm";
import { PublicHeader } from "@/components/PublicHeader";
import { PublicFooter } from "@/components/PublicFooter";
import { publicPageMetadata } from "@/lib/public-seo";
import { PERSONAS, persona as findPersona } from "@/lib/persona-mixes";

export function generateStaticParams() { return PERSONAS.map(item => ({ profession: item.slug })); }

export async function generateMetadata({ params }: { params: Promise<{ profession: string }> }): Promise<Metadata> {
  const { profession } = await params;
  const persona = findPersona(profession);
  if (!persona || persona.slug !== profession) return {};
  return publicPageMetadata({ path: `/for/${persona.slug}`, title: persona.seoTitle, description: persona.description });
}

// Same page composition and styling as the homepage; only the hero copy, the mixes in the demo
// and the short boundary note belong to this profession.
export default async function ProfessionPage({ params }: { params: Promise<{ profession: string }> }) {
  const { profession } = await params;
  const persona = findPersona(profession);
  if (!persona || persona.slug !== profession) notFound();
  return <div className="public-page">
    <a className="public-skip-link" href="#main-content">Skip to content</a>
    <PublicHeader links={[{ href: "#sample", label: "Try the demo", demoTrigger: true }, { href: "/follow-up-templates", label: "Templates" }]} />
    <main id="main-content" tabIndex={-1}>
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-copy">
          <h1 id="hero-title">{persona.headline}</h1>
          <p>{persona.supporting}</p>
          <div className="hero-actions"><Link className="button primary" href="/waitlist">Join the waitlist</Link><a className="button" href="#sample" data-demo-trigger>{persona.demoCta}</a></div>
          <p className="hero-note">{persona.supportLine} Explore a sample follow-up with a fictional contact; nothing goes out unless you send it yourself.</p>
          <MixesFor current={persona.id} />
        </div>
        <ProductDemo scenarios={persona.mixes} heading={persona.demoHeading} legend={`Choose a ${persona.label.toLowerCase()} mix`} />
      </section>
      <section className="section public-route-notes" aria-labelledby="route-notes-title">
        <div className="section-heading"><h2 id="route-notes-title">What this is, and what it isn’t.</h2><p>{persona.boundary}</p></div>
        <ul className="public-related-links">
          {persona.templates.map(template => <li key={template.href}><Link href={template.href}>{template.label}</Link></li>)}
          <li><Link href="/features/follow-up-reminders">How follow-up reminders work</Link></li>
          <li><Link href="/follow-up-templates">More client follow-up templates</Link></li>
        </ul>
      </section>
      <section id="waitlist" className="section" aria-labelledby="waitlist-title"><div className="section-heading"><h2 id="waitlist-title">Ready to put one follow-up in the mix?</h2><p>Join the waitlist and we’ll email you when your spot is ready. Accounts are free, with no card to enter. Until then, try the demo with a conversation you already need to continue.</p></div><WaitlistForm scenarioId={persona.id} /></section>
    </main>
    <PublicFooter />
  </div>;
}
