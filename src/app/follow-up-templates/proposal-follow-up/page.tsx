import type { Metadata } from "next";
import Link from "next/link";
import { CopyText } from "@/components/CopyText";
import { PublicArticle, TemplateExample } from "@/components/PublicArticle";
import { publicPageMetadata } from "@/lib/public-seo";

export const metadata: Metadata = publicPageMetadata({
  path: "/follow-up-templates/proposal-follow-up",
  title: "Proposal Follow-Up Email Templates",
  description: "Find proposal follow-up emails for agreed check-ins, questions, and changed timelines. Make the wording yours and explore a simple follow-up plan."
});

// A known prospect reviewing a proposal you discussed, not a cold recipient. The sample plan
// described below is the consultants' "Proposal sent" demo mix.
const EMAILS = [
  { id: "agreed", heading: "When you agreed on a review date", subject: "Next steps on the [project] proposal", body: "Hi [Name],\n\nYou mentioned reviewing the proposal with [person or group] this week. What questions would be useful to work through before you decide? Happy to clarify the scope or the timing.\n\n[Your name]" },
  { id: "process", heading: "When the decision process isn’t clear", subject: "Anyone else who should see the [project] proposal?", body: "Hi [Name],\n\nThanks for taking the proposal forward. If it helps, I can put together a one-page summary for anyone else who’s part of the decision, or walk them through the scope directly. Just let me know what would be useful.\n\n[Your name]" },
  { id: "timing", heading: "When the timing has moved", subject: "Checking in on timing for [project]", body: "Hi [Name],\n\nYou mentioned the project might move to [month]. Is that still the plan? If the timing has shifted, no problem at all. Tell me what works and I’ll check back then.\n\n[Your name]" }
];

export default function ProposalFollowUpPage() {
  return <PublicArticle title="Proposal follow-up emails that give the conversation a next step." deck="Keep the proposal in the mix.">
    <p>A proposal follow-up works when it picks up where the last conversation ended: the review you agreed on, the people who still need to see it, or a timeline that moved. Each example below asks one useful question and leaves the decision with them.</p>
    <p className="public-article-note">These are original, illustrative templates written for this page. They are not quotations from clients or proven scripts.</p>
    {EMAILS.map(item => <section key={item.id} aria-labelledby={`${item.id}-title`}><h2 id={`${item.id}-title`}>{item.heading}</h2><TemplateExample subject={item.subject}><p>{item.body}</p></TemplateExample><CopyText text={`Subject: ${item.subject}\n\n${item.body}`} label="Copy email" /></section>)}
    <section aria-labelledby="customize-title">
      <h2 id="customize-title">What to customize</h2>
      <ul>
        <li>Name the project and the specific thing they said they’d do, so the email reads as a continuation rather than a reminder.</li>
        <li>Keep one question. If you have two, the second one belongs in the next Beat.</li>
        <li>Offer something concrete and small, such as a summary or a short call, instead of asking for the decision.</li>
      </ul>
      <p>The sample proposal Mix in the demo runs like this: a same-day email confirming when you’ll check in, the check-in itself on the date you agreed, and an optional note about ten days later if the timing may have moved. Every Beat is a draft you review first.</p>
    </section>
    <section aria-labelledby="stop-title">
      <h2 id="stop-title">Know when to stop</h2>
      <p>A reply, a decline, or a change of plan should change the plan. Jump in the Mix doesn’t read replies or decide that for you. Skip or reschedule the next Beat, or close the plan, whenever the conversation calls for it.</p>
    </section>
    <section className="public-article-cta" aria-labelledby="cta-title">
      <h2 id="cta-title">Give the proposal a next step</h2>
      <p>Keep proposal follow-ups and past-client check-ins on a plan while you deliver current work. Review each draft and send it yourself.</p>
      <Link className="button primary" href="/for/consultants#sample">Try this proposal follow-up plan</Link>
      <small>Preview a fictional contact and an editable draft. Nothing goes out unless you open your own email app and send it.</small>
    </section>
    <nav className="public-article-related" aria-labelledby="related-title">
      <h2 id="related-title">Related</h2>
      <ul className="public-related-links">
        <li><Link href="/for/consultants">Client follow-up for consultants</Link></li>
        <li><Link href="/features/follow-up-reminders">How follow-up reminders work</Link></li>
        <li><Link href="/follow-up-templates">More client follow-up templates</Link></li>
      </ul>
    </nav>
  </PublicArticle>;
}
