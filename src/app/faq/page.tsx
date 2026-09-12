import type { Metadata } from "next";
import Link from "next/link";
import { PublicHeader } from "@/components/PublicHeader";
import { PublicFooter } from "@/components/PublicFooter";
import { publicPageMetadata } from "@/lib/public-seo";

export const metadata: Metadata = publicPageMetadata({
  path: "/faq",
  title: "Client follow-up questions",
  description: "How Mixes, sending, replies, your data, cost and invitations work in Jump in the Mix. You review every follow-up and stay in control of the conversation."
});

// The questions that used to close the homepage, on a page of their own with the same shell.
// Each answer states what the product does today; nothing here describes reply reading or
// automatic sending as the default.
export default function FaqPage() {
  return <div className="public-page">
    <a className="public-skip-link" href="#main-content">Skip to content</a>
    <PublicHeader links={[{ href: "/#sample", label: "Try the demo" }, { href: "/follow-up-templates", label: "Templates" }]} />
    <main id="main-content" tabIndex={-1}>
      <section className="section public-questions standalone" id="questions" aria-labelledby="questions-title">
        <div className="section-heading"><h1 id="questions-title">A little clarity before you start.</h1><p>How Mixes, sending, replies, your data, cost and invitations work. You stay in control of the conversation.</p><p><Link href="/">Back to home</Link></p></div>
        <div className="public-faq">
          <details id="what-is-a-mix"><summary>What is a Mix?</summary><p>A Mix is a reusable follow-up plan for one kind of conversation, such as an estimate that’s out for a decision. Each Beat inside it is one scheduled message or call step. You choose the Mix, set the timing, and make each message your own.</p></details>
          <details><summary>Will Jump in the Mix be sending messages for me?</summary><p>You review your follow-ups and send them through your own messaging app by default. Automatic sending is optional and needs a connected provider. Personal invitations are emailed through the System Mix after you choose a contact and press Send.</p></details>
          <details id="replies"><summary>Does it know when someone replies?</summary><p>No. Jump in the Mix doesn’t read your messages or watch for replies. You decide whether a response changes the plan and whether another message is appropriate, and you record whether each Beat was sent, not sent, or skipped.</p></details>
          <details id="phone-number"><summary>Do I need a new phone number?</summary><p>No. A text follow-up opens in your phone’s own messaging app with the draft ready, so it comes from the number you already use. On a computer, copy the draft into whichever app you use.</p></details>
          <details id="your-data"><summary>How can I control my data?</summary><p>Keep contact details, notes, and follow-up history together. In Settings, open Data &amp; privacy to export your data or delete your account. Private notes stay out of text messages and emails.</p></details>
          <details><summary>Does it cost anything to join?</summary><p>Joining the waitlist and creating your account are free. You don’t need a payment card.</p></details>
          <details><summary>How do invitations work?</summary><p>Join the waitlist and we’ll email you as soon as your spot is ready.</p></details>
        </div>
      </section>
    </main>
    <PublicFooter />
  </div>;
}
