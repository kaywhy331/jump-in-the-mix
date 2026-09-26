import type { Metadata } from "next";
import Link from "next/link";
import { CopyText } from "@/components/CopyText";
import { PublicArticle, TemplateExample } from "@/components/PublicArticle";
import { publicPageMetadata } from "@/lib/public-seo";

export const metadata: Metadata = publicPageMetadata({
  path: "/follow-up-templates/estimate-follow-up",
  title: "Estimate Follow-Up Text Templates",
  description: "Use estimate follow-up text and email examples for an existing inquiry. Personalize the wording, choose an appropriate check-in, and preview a follow-up plan."
});

// Original, illustrative wording. Quote and estimate are one situation, so this is the only page
// for it. The sample plan described below is the contractors' "Estimate sent" demo mix.
const TEXTS = [
  { id: "agreed", heading: "When you agreed to check back", text: "Hi [Name], checking back as promised on the estimate for [project]. Any questions about the scope or timing I can help clear up?" },
  { id: "deciding", heading: "When the customer needed time to decide", text: "Hi [Name], you mentioned reviewing the estimate this week. Is there anything you’d like me to clarify before you decide?" },
  { id: "timing", heading: "When their timing may have changed", text: "Hi [Name], checking whether [project] is still on your calendar. If the timing has changed, no problem—just let me know." }
];
const EMAIL = { subject: "Checking in on the [project] estimate", body: "Hi [Name],\n\nI’m following up on the estimate I sent for [project]. Is there anything in the scope or timing you’d like to work through?\n\nHappy to answer questions.\n\n[Your name]" };

export default function EstimateFollowUpPage() {
  return <PublicArticle title="Estimate follow-up text templates." deck="Keep the conversation in the mix.">
    <p>A useful estimate follow-up refers to the work you discussed, asks one clear question, and respects the customer’s timing. Start from an existing inquiry or a check-in you agreed on, then adapt one of these examples.</p>
    <p className="public-article-note">These are original, illustrative templates written for this page. They are not quotations from customers or proven scripts.</p>
    {TEXTS.map(item => <section key={item.id} aria-labelledby={`${item.id}-title`}><h2 id={`${item.id}-title`}>{item.heading}</h2><TemplateExample><p>{item.text}</p></TemplateExample><CopyText text={item.text} /></section>)}
    <section aria-labelledby="email-title"><h2 id="email-title">Email alternative</h2><TemplateExample subject={EMAIL.subject}><p>{EMAIL.body}</p></TemplateExample><CopyText text={`Subject: ${EMAIL.subject}\n\n${EMAIL.body}`} label="Copy email" /></section>
    <section aria-labelledby="timing-title">
      <h2 id="timing-title">Choose the timing before the next busy day</h2>
      <p>Use the check-in date you agreed on. Without an agreed date, think about the customer’s timeline and how much time they need to review. These examples don’t establish a universally right interval.</p>
      <p>The sample estimate Mix in the demo runs like this:</p>
      <ol>
        <li><strong>Estimate on its way.</strong> A text the same day, so they know it’s in their inbox.</li>
        <li><strong>Help them choose.</strong> Two days later, one question about the options they were comparing.</li>
        <li><strong>Walk it through.</strong> A short call with your notes ready, around day five.</li>
        <li><strong>Dates filling up.</strong> Around day ten, an honest note about your schedule, only if it’s true.</li>
      </ol>
      <p>Every Beat is a draft you review first. Mark it sent, not sent, or skipped, and the plan moves on with you.</p>
    </section>
    <section aria-labelledby="stop-title">
      <h2 id="stop-title">Know when to stop</h2>
      <p>Don’t keep sending because a template has another step. A reply, a decline, a request to stop, or changed timing should shape your decision. Jump in the Mix doesn’t read replies or interpret those changes for you. You do, and you can skip or reschedule any Beat.</p>
    </section>
    <section className="public-article-cta" aria-labelledby="cta-title">
      <h2 id="cta-title">Make “I’ll follow up” a plan</h2>
      <p>Jump in the Mix keeps the next check-in on your list and brings the draft back when it’s due. You still decide what to say and whether to send it.</p>
      <Link className="button primary" href="/for/contractors#sample">Try this estimate follow-up plan</Link>
      <small>Preview a fictional contact and an editable draft. Nothing goes out unless you open your own messaging app and send it.</small>
    </section>
    <nav className="public-article-related" aria-labelledby="related-title">
      <h2 id="related-title">Related</h2>
      <ul className="public-related-links">
        <li><Link href="/for/contractors">Client follow-up for contractors</Link></li>
        <li><Link href="/features/follow-up-reminders">How follow-up reminders work</Link></li>
        <li><Link href="/follow-up-templates">More client follow-up templates</Link></li>
      </ul>
    </nav>
  </PublicArticle>;
}
