import Link from "next/link";
import Image from "next/image";
import { Logo } from "@/components/Logo";

export default async function HomePage({ searchParams }: { searchParams: Promise<{ billing?: string }> }) {
  const annual = (await searchParams).billing !== "monthly";
  return (
    <div className="public-shell">
      <header className="public-header">
        <Logo />
        <nav className="public-nav" aria-label="Public navigation">
          <a href="#problem">Why it matters</a>
          <a href="#how">How it works</a>
          <a href="#pricing">Pricing</a>
        </nav>
        <div className="public-actions">
          <Link href="/login" className="button">Sign in</Link>
          <Link href="/register" className="button primary">Start free</Link>
        </div>
      </header>

      <main>
        <section className="hero">
          <div className="hero-copy">
            <span className="eyebrow">Built for busy, relationship-driven businesses</span>
            <h1>How many opportunities have slipped away because the follow-up never happened?</h1>
            <p>
              Leads, clients, referrals, renewals, and promises to call back are difficult to keep in your head.
              Jump in the Mix turns those moments into clear next actions—without forcing you into a complicated CRM.
            </p>
            <div className="hero-actions">
              <Link href="/register" className="button primary">Stop missing follow-ups</Link>
              <a href="#how" className="button">See how it works</a>
            </div>
            <p className="hero-note">Start free. No external integrations are required to test the core workflow.</p>
          </div>

          <figure className="hero-product-proof"><Image src="/product-proof/today.png" width={1050} height={760} priority alt="Jump in the Mix Today queue showing prepared follow-up actions for synthetic demo contacts"/><figcaption>Actual Today queue · synthetic demo data</figcaption></figure>
        </section>

        <section id="problem" className="section">
          <div className="section-heading">
            <span className="eyebrow">The real problem</span>
            <h2>You care about the relationship. Your day simply gets in the way.</h2>
            <p>Most missed follow-ups are not caused by a lack of effort. They happen because information is scattered and timing is easy to lose.</p>
          </div>
          <div className="problem-grid">
            <article className="problem-card"><div className="number-badge">1</div><h3>The inquiry arrived at the wrong time</h3><p>A website lead came in while you were working, and the promised response disappeared into the day.</p></article>
            <article className="problem-card"><div className="number-badge">2</div><h3>The referral was never fully followed up</h3><p>A trusted client introduced someone, but neither the prospect nor the referrer received the attention they deserved.</p></article>
            <article className="problem-card"><div className="number-badge">3</div><h3>The important date passed quietly</h3><p>A renewal, anniversary, event, or decision date passed before you had the chance to reach out.</p></article>
          </div>
        </section>

        <section id="how" className="section">
          <div className="section-heading">
            <span className="eyebrow">A simpler rhythm</span>
            <h2>Capture the moment. Let the system prepare what happens next.</h2>
          </div>
          <div className="steps-grid">
            <article className="step-card"><div className="number-badge">1</div><h3>Start with one person</h3><p>Add a Contact in seconds, import a file, or connect Google Contacts on an eligible plan.</p></article>
            <article className="step-card"><div className="number-badge">2</div><h3>Record what matters</h3><p>Add an Important Date such as a follow-up, referral, renewal, birthday, event, or custom business moment.</p></article>
            <article className="step-card"><div className="number-badge">3</div><h3>Complete your Jumps</h3><p>See who needs attention, why they matter, and the next email, text, or call to make.</p></article>
          </div>
        </section>

        <section className="section product-proof-section" aria-labelledby="product-proof-heading">
          <div className="section-heading"><span className="eyebrow">See the real workflow</span><h2 id="product-proof-heading">A calm place to decide who needs you next.</h2><p>These are screenshots of the working product using a synthetic demo workspace—not concept art.</p></div>
          <div className="product-proof-grid">
            {[['contacts.png','Contact timeline and relationship state'],['mixes.png','Mix follow-up plan library'],['quick-add.png','Quick Add capture and review'],['mobile-jump.png','Mobile Jump action card']].map(([src, alt]) => <figure key={src}><Image src={`/product-proof/${src}`} width={900} height={650} alt={alt}/><figcaption>{alt}</figcaption></figure>)}
          </div>
        </section>

        <section id="pricing" className="section">
          <div className="section-heading">
            <span className="eyebrow">Start at your pace</span>
            <h2>Test the workflow free, then add more capacity and automation.</h2>
          </div>
          <nav className="public-billing-toggle" aria-label="Pricing period"><Link className={annual ? "active" : ""} href="/?billing=annual#pricing">Annual <span>Save up to 20%</span></Link><Link className={!annual ? "active" : ""} href="/?billing=monthly#pricing">Monthly</Link></nav>
          <div className="pricing-grid">
            <article className="pricing-card"><h3>Free</h3><p>For organizing a focused personal network.</p><h2>$0</h2><small>100 Contacts · 3 active Mixes</small><Link href="/register" className="button">Start free</Link></article>
            <article className="pricing-card"><span className="plan-pill">Popular</span><h3>Plus</h3><p>For entrepreneurs building a consistent relationship routine.</p><h2>${annual ? 12 : 15} <small>/ month{annual ? ' equivalent' : ''}</small></h2><small>{annual ? '$144 billed annually · save $36' : 'Billed monthly'}</small><Link href={`/register?plan=plus&period=${annual ? 'annual' : 'monthly'}`} className="button primary">Choose Plus</Link></article>
            <article className="pricing-card"><h3>Pro</h3><p>For growing businesses managing a broader network.</p><h2>${annual ? 15 : 18} <small>/ month{annual ? ' equivalent' : ''}</small></h2><small>{annual ? '$180 billed annually · save $36' : 'Billed monthly'}</small><Link href={`/register?plan=pro&period=${annual ? 'annual' : 'monthly'}`} className="button">Choose Pro</Link></article>
          </div>
          <div className="pricing-comparison-wrap"><table className="pricing-comparison"><caption>Full plan comparison</caption><thead><tr><th scope="col">Capability</th><th scope="col">Free</th><th scope="col">Plus</th><th scope="col">Pro</th></tr></thead><tbody><tr><th scope="row">Contacts</th><td>100</td><td>2,500</td><td>10,000</td></tr><tr><th scope="row">Active Mixes</th><td>3</td><td>25</td><td>100</td></tr><tr><th scope="row">Google Contacts</th><td>—</td><td>Included</td><td>Included</td></tr><tr><th scope="row">AI Mix drafts</th><td>—</td><td>Included</td><td>Included</td></tr><tr><th scope="row">Community sharing</th><td>Browse</td><td>3 shared</td><td>10 shared</td></tr></tbody></table></div>
        </section>

        <section className="section trust-section"><div className="section-heading"><span className="eyebrow">Clarity before automation</span><h2>A relationship tool, not another complicated CRM.</h2></div><div className="trust-grid"><article><h3>You stay in control</h3><p>Jumps prepare native email, SMS, phone, voicemail-script, and WhatsApp actions. You review and send them; the product does not silently message your Contacts.</p></article><article><h3>Your data has an exit</h3><p>Export Contacts, disconnect integrations, revoke sessions, or permanently delete the account. Provider revocation is best-effort and clearly reported.</p></article><article><h3>Honest integrations</h3><p>Google Contacts and Stripe are implemented with deterministic tests; live provider qualification remains pending. Resend live delivery is pending. Microsoft, Meta assistant, website webhooks, and Twilio are not production integrations today.</p></article></div></section>

        <section className="section"><div className="section-heading"><span className="eyebrow">Common questions</span><h2>Know what you are choosing.</h2></div><div className="public-faq"><details><summary>Does Jump in the Mix replace my CRM?</summary><p>No. It is designed for people who need a lighter relationship rhythm: remember the person, the moment, and the next action.</p></details><details><summary>Does it send messages automatically?</summary><p>Core Jump actions open your native channel with prepared content for review. Provider-driven automated sending is not claimed.</p></details><details><summary>What works without integrations?</summary><p>Contacts, Important Dates, Mixes, Today, prepared actions, imports, and manual workflows work without connecting a provider.</p></details><details><summary>What are the current limitations?</summary><p>Live Google, Stripe, and Resend qualification is pending. Microsoft sync, the WhatsApp assistant, website webhook ingestion, and Twilio are not complete product integrations.</p></details></div></section>

        <section className="cta-band">
          <div><h2>Stop relying on memory for relationships that matter.</h2><p>Your first follow-up plan can be ready in minutes.</p></div>
          <Link href="/register" className="button">Create a free account</Link>
        </section>
      </main>

      <footer className="public-footer">© {new Date().getFullYear()} Jump in the Mix. Built to make follow-through feel lighter.</footer>
    </div>
  );
}
