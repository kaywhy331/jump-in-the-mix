import type { Metadata } from "next";
import Link from "next/link";
import { WaitlistForm } from "@/components/WaitlistForm";
import { ProductDemo } from "@/components/ProductDemo";
import { MixesFor } from "@/components/MixesFor";
import { ProfessionMarks } from "@/components/ProfessionMarks";
import { PublicHeader } from "@/components/PublicHeader";
import { PublicFooter } from "@/components/PublicFooter";
import { StructuredData } from "@/components/StructuredData";
import { PRODUCT_DEFINITION, publicPageMetadata, publicStructuredData } from "@/lib/public-seo";

// The homepage answers one search intent, "client follow-up app", in its title, opening copy and
// the how-it-works section. Mix and Beat are explained before any section relies on them.
export const metadata: Metadata = publicPageMetadata({
  path: "/",
  title: "Client Follow-Up App",
  description: "Stay in the mix with client follow-up plans, message templates, and reminders. Choose the timing, review each draft, and send it yourself."
});

export default function HomePage() {
  return <div className="public-page">
    <a className="public-skip-link" href="#main-content">Skip to content</a>
    <PublicHeader links={[{ href: "/follow-up-templates", label: "Templates" }, { href: "/faq", label: "Questions" }]} />
    <main id="main-content" tabIndex={-1}>
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-copy">
          <h1 id="hero-title">You meant to follow up. <em>Then work happened.</em></h1>
          <p>A client follow-up app for independent professionals. Put the next check-in on a simple plan, with a message ready to make your own. You choose the timing. You review, edit, and send.</p>
          <div className="hero-actions"><Link className="button primary" href="/waitlist">Join the waitlist</Link><a className="button" href="#sample" data-demo-trigger>Try the demo</a></div>
          <p className="hero-note">Explore a sample follow-up with a fictional contact. Nothing goes out unless you open your own messaging app and send it.</p>
          <MixesFor current="all" />
        </div>
        <ProductDemo />
      </section>
      <section id="how-it-works" className="section public-workflow" aria-labelledby="how-it-works-title">
        <div>
          <div className="section-heading"><h2 id="how-it-works-title">Put client follow-up into a rhythm.</h2><p>A Mix is a reusable follow-up plan. Each Beat is one scheduled message or call reminder, so the next step has a place in your day.</p></div>
          <ol className="relationship-steps">
            <li><span className="workflow-number">1</span><div><h3>Choose a Mix</h3><p>Start with the kind of follow-up you need: an estimate that’s out, a proposal under review, a client who isn’t ready yet.</p></div></li>
            <li><span className="workflow-number">2</span><div><h3>Set the rhythm</h3><p>Choose when each Beat belongs. Due Beats show up on your Today list, and you can turn on <Link href="/features/follow-up-reminders">reminders</Link> if you want them.</p></div></li>
            <li><span className="workflow-number">3</span><div><h3>Make it yours</h3><p>Review the draft, edit it, and send it from your own text or email app. Then record what happened.</p></div></li>
          </ol>
        </div>
        <div className="public-definition">
          <h2>Keep the rhythm. Keep your own voice.</h2>
          <p>A draft is a starting point, not a message you have to send. Review and edit before you send through your usual text or email app. Follow-up planning lives here; the conversation stays with you.</p>
          <p>{PRODUCT_DEFINITION}</p>
          <p className="public-definition-links"><Link href="/follow-up-templates">Client follow-up templates</Link><Link href="/faq">Questions before you jump in</Link></p>
        </div>
      </section>
      <ProfessionMarks />
      <section id="waitlist" className="section" aria-labelledby="waitlist-title"><div className="section-heading"><h2 id="waitlist-title">Ready to put one follow-up in the mix?</h2><p>Join the waitlist and we’ll email you when your spot is ready. Accounts are free, with no card to enter. Until then, try the demo with a conversation you already need to continue.</p></div><WaitlistForm /></section>
    </main>
    <PublicFooter />
    <StructuredData data={publicStructuredData()} />
  </div>;
}
