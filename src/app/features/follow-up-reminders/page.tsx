import type { Metadata } from "next";
import Link from "next/link";
import { PublicArticle } from "@/components/PublicArticle";
import { publicPageMetadata } from "@/lib/public-seo";

export const metadata: Metadata = publicPageMetadata({
  path: "/features/follow-up-reminders",
  title: "Follow-Up Reminder App",
  description: "Keep planned client follow-ups in view. Organize message drafts and call reminders, then review and take the next step yourself."
});

// Every statement here describes shipped behaviour: the Today list, the opt-in email digest, due
// push notifications with quiet hours, the weekly summary, and the outcomes a person records.
export default function FollowUpRemindersPage() {
  return <PublicArticle title="Follow-up reminders for the things you said you’d do." deck="A little rhythm. A lot less remembering.">
    <p>A follow-up reminder in Jump in the Mix is a Beat: one scheduled message or call step inside a Mix, your reusable follow-up plan. Here is who gets reminded, what shows up when it’s due, and which parts stay with you.</p>
    <section aria-labelledby="who-title">
      <h2 id="who-title">Who gets the reminder</h2>
      <p>You do. Reminders go to you, never to your contacts. Each Beat is a note to yourself that a planned check-in is due, with the draft you prepared for it.</p>
    </section>
    <section aria-labelledby="due-title">
      <h2 id="due-title">What appears when a Beat is due</h2>
      <p>Your Today list shows the Beats due today, anything overdue, and what’s coming this week. The next one is marked “Next up”, with the message ready to open in your own text or email app, or the call notes ready for a phone call. Editing the draft happens right there, before anything is sent.</p>
    </section>
    <section aria-labelledby="notifications-title">
      <h2 id="notifications-title">Optional notifications, off until you turn them on</h2>
      <ul>
        <li><strong>A daily email.</strong> A digest of the day’s follow-ups, sent at the hour you choose in your saved timezone.</li>
        <li><strong>A push notification when Beats become due.</strong> Items due together are grouped, quiet hours are respected, and a reminder arrives after the next background check, so it can take a few minutes. On iPhone or iPad, add the site to your Home Screen first.</li>
        <li><strong>A weekly summary email.</strong> A look at the week ahead, each Monday.</li>
      </ul>
      <p>Turn any of them on in Settings under Notifications. Nothing is sent to you until you do.</p>
    </section>
    <section aria-labelledby="manual-title">
      <h2 id="manual-title">What stays with you</h2>
      <ul>
        <li><strong>Sending.</strong> A Beat opens your own messaging or email app with the draft ready, or you copy it into whichever app you prefer. Nothing goes out on its own unless you connect an optional sending provider and turn that on.</li>
        <li><strong>Recording what happened.</strong> Mark a Beat sent, not sent, no answer, left a voicemail, rescheduled, or skipped. A reminder is never treated as proof that a message was sent.</li>
        <li><strong>Deciding the next step.</strong> Jump in the Mix doesn’t read replies. If someone answers, declines, or asks you to stop, you change the plan.</li>
      </ul>
    </section>
    <section className="public-article-cta" aria-labelledby="cta-title">
      <h2 id="cta-title">Try a follow-up reminder</h2>
      <p>In the demo, open a planned Beat and choose its date. In the product, that date is when the Beat lands on your Today list.</p>
      <Link className="button primary" href="/#sample">Try a follow-up reminder</Link>
      <small>A fictional contact and an editable draft. Nothing goes out unless you open your own messaging app and send it.</small>
    </section>
    <nav className="public-article-related" aria-labelledby="related-title">
      <h2 id="related-title">Related</h2>
      <ul className="public-related-links">
        <li><Link href="/#how-it-works">How a Mix and its Beats work</Link></li>
        <li><Link href="/follow-up-templates/estimate-follow-up">Estimate follow-up text templates</Link></li>
        <li><Link href="/follow-up-templates/proposal-follow-up">Proposal follow-up email templates</Link></li>
      </ul>
    </nav>
  </PublicArticle>;
}
