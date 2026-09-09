import type { Metadata } from "next";
import Link from "next/link";
import { AppIcon } from "@/components/AppIcon";
import { Logo } from "@/components/Logo";
import { WaitlistForm } from "@/components/WaitlistForm";
import { ProductDemo } from "@/components/ProductDemo";
import { env } from "@/lib/env";

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
        <a className="public-section-link" href="#how-it-works">How it works</a>
        <a className="public-section-link" href="#features">Who it’s for</a>
        <Link className="public-sign-in" href="/login">Sign in</Link>
        <Link className="button primary" href="/waitlist">Join the waitlist</Link>
      </nav>
    </header>
    <main id="main-content" tabIndex={-1}>
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-copy">
          <span className="eyebrow">Personal follow-ups, planned</span>
          <h1 id="hero-title">Know who to follow up with. <em>And what to say.</em></h1>
          <p>Keep customers, friends, and new connections in one place. Choose when to reach out, get a message to make your own, and pick up the conversation from your daily list.</p>
          <div className="hero-actions"><Link className="button primary" href="/waitlist">Join the waitlist</Link><a className="button" href="#sample" data-demo-trigger>Try the demo <AppIcon name="arrowDown" /></a></div>
          <ul className="hero-audiences" aria-label="Made for your relationships"><li><AppIcon name="mixes" />Business</li><li><AppIcon name="heart" />Personal</li><li><AppIcon name="people" />Your network</li></ul>
          <p className="hero-note">Free accounts are opening by invitation. Join the waitlist or get invited by a member.</p>
        </div>
        <ProductDemo />
      </section>
      <section className="section public-audiences" id="features" aria-labelledby="audience-title">
        <div className="section-heading"><span className="eyebrow">Different connections. The same care.</span><h2 id="audience-title">For the relationships you’re building.</h2><p>A new customer, a familiar face, or someone you’ve just met. Keep the conversation going in your own way.</p></div>
        <div className="relationship-use-cases">
          <article><span className="relationship-icon"><AppIcon name="mixes" /></span><h3>Grow your business</h3><p>Follow up on an inquiry, talk through a quote, and check in after the work is done.</p><span className="relationship-example speech-bubble speech-bubble--soft">“Any questions I can help with?”</span></article>
          <article><span className="relationship-icon"><AppIcon name="heart" /></span><h3>Keep your people close</h3><p>Remember what matters, make time for a check-in, and reconnect when life gets busy.</p><span className="relationship-example speech-bubble speech-bubble--soft">“You crossed my mind today.”</span></article>
          <article><span className="relationship-icon"><AppIcon name="people" /></span><h3>Build your network</h3><p>Pick up after an introduction, share something useful, and turn a meeting into a relationship.</p><span className="relationship-example speech-bubble speech-bubble--soft">“I enjoyed our conversation.”</span></article>
        </div>
      </section>
      <section className="section public-workflow" id="how-it-works" aria-labelledby="workflow-title">
        <div>
          <div className="section-heading"><span className="eyebrow">A little follow-through, every day</span><h2 id="workflow-title">Know who’s next. Remember what matters.</h2></div>
          <ol className="relationship-steps">
            <li><span className="workflow-number">01</span><div><h3>Bring your people</h3><p>Add a person or import your contacts. Keep the details and notes that help you pick up the conversation.</p></div></li>
            <li><span className="workflow-number">02</span><div><h3>Find your rhythm</h3><p>Select a premade mix or create a mix: a series of messages and reminders. Each beat is one thoughtful touchpoint. Set the tempo to choose when it happens.</p></div></li>
            <li><span className="workflow-number">03</span><div><h3>Make today count</h3><p>Open Today, review your follow-ups, and record what happened. Fine-tune each message so it sounds like you.</p></div></li>
          </ol>
        </div>
        <figure className="today-preview conversation-panel speech-bubble" aria-labelledby="today-preview-title">
          <div className="today-preview-heading"><div><span className="today-preview-kicker">Your daily list</span><h3 id="today-preview-title">Today</h3></div><span className="status-pill">3 follow-ups</span></div>
          <ol>
            <li><span className="today-preview-icon"><AppIcon name="message" /></span><div><strong>Alex Example</strong><p>Check in about the quote</p><small>Business · Text</small></div></li>
            <li><span className="today-preview-icon"><AppIcon name="phone" /></span><div><strong>Jordan Example</strong><p>Make time for a catch-up</p><small>Personal · Call</small></div></li>
            <li><span className="today-preview-icon"><AppIcon name="email" /></span><div><strong>Sam Example</strong><p>Continue your conversation</p><small>Networking · Email</small></div></li>
          </ol>
          <figcaption>Illustrative daily list with fictional contacts.</figcaption>
          <Link className="button" href="/waitlist">Join the waitlist <span aria-hidden="true">→</span></Link>
        </figure>
      </section>
      <section className="section public-questions" id="questions" aria-labelledby="questions-title">
        <div className="section-heading"><span className="eyebrow">Your voice. Your choice.</span><h2 id="questions-title">A little clarity before you start.</h2><p>Thoughtful follow-ups should feel natural. You stay in control of the conversation.</p></div>
        <div className="public-faq">
          <details><summary>Is this for business or personal relationships?</summary><p>Both, and your professional network too. Use it to keep up with customers, friends, introductions, and the people you want to know better. Your mixes and messages can be as personal as the relationship.</p></details>
          <details><summary>Will Jump in the Mix be sending messages for me?</summary><p>You review your follow-ups and send them through your own messaging app by default. Automatic sending is optional and needs a connected provider. Personal invitations are emailed through the System Mix after you choose a contact and press Send.</p></details>
          <details><summary>Can I bring my existing contacts?</summary><p>Yes. Add someone individually or import a contact file. You can review the details and possible duplicates as you bring your people in.</p></details>
          <details id="your-data"><summary>How can I control my data?</summary><p>Keep contact details, notes, and follow-up history together. In Settings, open Data &amp; privacy to export your data or delete your account. Private notes stay out of text messages and emails.</p></details>
          <details><summary>Does it cost anything to join?</summary><p>Joining the waitlist and creating an invited account are free. You don’t need a payment card.</p></details>
          <details><summary>How do invitations work?</summary><p>Join the waitlist for a free account. Every 7 days, we invite up to 10 people: the 5 earliest confirmed signups and 5 chosen at random from the rest. Members can also share five personal invitations with contacts through the Jump in the Mix System Mix. Open the unique link sent to your email to create your free account. You’ll get five invitations of your own.</p></details>
        </div>
      </section>
      <section id="waitlist" className="section" aria-labelledby="waitlist-title"><div className="section-heading"><span className="eyebrow">Free · By invitation</span><h2 id="waitlist-title">Get in the mix.</h2><p>Join our waitlist. Every 7 days, we invite up to 10 people: 5 in signup order and 5 at random. Confirm your email to be eligible. Waves may pause while we make room.</p></div><WaitlistForm /></section>
      <section className="section public-control speech-bubble speech-bubble--soft" aria-labelledby="closing-title"><div className="section-heading"><span className="eyebrow">Simple on purpose</span><h2 id="closing-title">Keep good connections in the mix.</h2><p>Start with one person you’ve been meaning to contact. Keep their details, your next step, and the words you want to say together.</p><p>Join the free-account waitlist. We’ll ask you to confirm your email, then send your personal access link when you’re selected.</p></div><div className="public-closing-action"><Link className="button primary" href="/waitlist">Join the waitlist</Link><span>Your people. Your words. Your pace.</span></div></section>
    </main>
    <footer className="public-footer"><Logo /><p>A little follow-through goes a long way.</p><nav aria-label="Footer navigation"><a href="#questions">Questions</a><a href="#your-data">Your data</a><Link href="/login">Sign in</Link></nav></footer>
  </div>;
}
