import Link from "next/link";
import { Logo } from "@/components/Logo";

export default function HomePage() {
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

          <div className="hero-demo" aria-label="Product preview">
            <div className="demo-window">
              <div className="demo-toolbar"><span /><span /><span /></div>
              <div className="demo-content">
                <h3>Today&apos;s Jumps</h3>
                <p>Three relationships need your attention.</p>
                <div className="demo-card">
                  <strong>Sarah Chen · BrightPath</strong>
                  <small>Referral follow-up · SMS</small>
                  <div className="mini-action">Open message →</div>
                </div>
                <div className="demo-card">
                  <strong>Marcus Reed · Northline</strong>
                  <small>Renewal check-in · Phone call</small>
                  <div className="mini-action">View call notes →</div>
                </div>
                <div className="demo-card">
                  <strong>Elena Torres</strong>
                  <small>Client anniversary · Email</small>
                  <div className="mini-action">Open email →</div>
                </div>
              </div>
            </div>
          </div>
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
            <article className="step-card"><div className="number-badge">1</div><h3>Start with one person</h3><p>Add a contact in seconds. Import and sync options can be connected as the product rollout expands.</p></article>
            <article className="step-card"><div className="number-badge">2</div><h3>Record what matters</h3><p>Add an Important Date such as a follow-up, referral, renewal, birthday, event, or custom business moment.</p></article>
            <article className="step-card"><div className="number-badge">3</div><h3>Complete your Jumps</h3><p>See who needs attention, why they matter, and the next email, text, or call to make.</p></article>
          </div>
        </section>

        <section id="pricing" className="section">
          <div className="section-heading">
            <span className="eyebrow">Start at your pace</span>
            <h2>Test the workflow before paying for more automation.</h2>
          </div>
          <div className="pricing-grid">
            <article className="pricing-card"><h3>Free</h3><p>For organizing a focused personal network.</p><h2>$0</h2><Link href="/register" className="button">Start free</Link></article>
            <article className="pricing-card"><span className="plan-pill">Popular</span><h3>Plus</h3><p>For entrepreneurs building a consistent relationship routine.</p><h2>$15 <small>/ month</small></h2><Link href="/register" className="button primary">Start with Plus</Link></article>
            <article className="pricing-card"><h3>Pro</h3><p>For growing businesses managing a broader network.</p><h2>$18 <small>/ month</small></h2><Link href="/register" className="button">Start with Pro</Link></article>
          </div>
        </section>

        <section className="cta-band">
          <div><h2>Stop relying on memory for relationships that matter.</h2><p>Your first follow-up plan can be ready in minutes.</p></div>
          <Link href="/register" className="button">Create a free account</Link>
        </section>
      </main>

      <footer className="public-footer">© {new Date().getFullYear()} Jump in the Mix. Built to make follow-through feel lighter.</footer>
    </div>
  );
}
