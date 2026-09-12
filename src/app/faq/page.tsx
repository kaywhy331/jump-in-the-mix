import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { PublicFooter } from "@/components/PublicFooter";
import { env } from "@/lib/env";

const description = "How sending, your data, cost and invitations work in Jump in the Mix. You review every follow-up and stay in control of the conversation.";

export const metadata: Metadata = {
  title: "Questions",
  description,
  alternates: { canonical: new URL("/faq", env.appUrl).href },
  openGraph: { title: "Questions | Jump in the Mix", description, url: new URL("/faq", env.appUrl).href, siteName: "Jump in the Mix", type: "website", images: [{ url: new URL("/relationship-preview.png?v=4", env.appUrl).href, width: 1200, height: 630, alt: "Jump in the Mix. Good relationships have a rhythm." }] }
};

// The questions that used to close the homepage, on a page of their own with the same shell.
export default function FaqPage() {
  return <div className="public-page">
    <a className="public-skip-link" href="#main-content">Skip to content</a>
    <header className="public-header">
      <Logo />
      <nav className="public-site-nav" aria-label="Public navigation">
        <Link className="public-section-link" href="/#sample">Try the demo</Link>
        <Link className="public-sign-in" href="/login">Sign in</Link>
        <Link className="button primary" href="/waitlist">Join the waitlist</Link>
      </nav>
    </header>
    <main id="main-content" tabIndex={-1}>
      <section className="section public-questions standalone" id="questions" aria-labelledby="questions-title">
        <div className="section-heading"><h1 id="questions-title">A little clarity before you start.</h1><p>Thoughtful follow-ups should feel natural. You stay in control of the conversation.</p><p><Link href="/">Back to home</Link></p></div>
        <div className="public-faq">
          <details><summary>Will Jump in the Mix be sending messages for me?</summary><p>You review your follow-ups and send them through your own messaging app by default. Automatic sending is optional and needs a connected provider. Personal invitations are emailed through the System Mix after you choose a contact and press Send.</p></details>
          <details id="your-data"><summary>How can I control my data?</summary><p>Keep contact details, notes, and follow-up history together. In Settings, open Data &amp; privacy to export your data or delete your account. Private notes stay out of text messages and emails.</p></details>
          <details><summary>Does it cost anything to join?</summary><p>Joining the waitlist and creating your account are free. You don’t need a payment card.</p></details>
          <details><summary>How do invitations work?</summary><p>Join the waitlist and we’ll email you as soon as your spot is ready.</p></details>
        </div>
      </section>
    </main>
    <PublicFooter />
  </div>;
}
