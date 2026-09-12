import type { Metadata } from "next";
import Link from "next/link";
import { AppIcon } from "@/components/AppIcon";
import { PublicArticle } from "@/components/PublicArticle";
import { PERSONAS } from "@/lib/persona-mixes";
import { publicPageMetadata } from "@/lib/public-seo";

export const metadata: Metadata = publicPageMetadata({
  path: "/follow-up-templates",
  title: "Client Follow-Up Templates",
  description: "Find client follow-up text and email templates for estimates, proposals, and check-ins. Make the wording yours, then explore a sample follow-up plan."
});

// The hub lists only template pages that exist. No placeholder cards, no synonym pages.
const TEMPLATE_PAGES = [
  { href: "/follow-up-templates/estimate-follow-up", title: "Estimate follow-up text templates", icon: "message" as const, audience: "Contractors and trades", summary: "Three texts and one email for an estimate that’s out for a decision: the check-in you promised, the customer who needed time, and timing that may have changed." },
  { href: "/follow-up-templates/proposal-follow-up", title: "Proposal follow-up email templates", icon: "email" as const, audience: "Consultants and professional services", summary: "Emails for a proposal under review: the agreed review date, an unclear decision process, and a timeline that moved." }
];

// One line per profession route, so each link says what the page is about.
const ROUTE_LINES: Record<string, string> = {
  painting: "Follow up on estimates while you’re focused on the job.",
  consulting: "Give proposals a next step while you deliver current work.",
  "real-estate": "Make “not yet” a plan to check back.",
  photography: "Keep the next client conversation from disappearing into editing.",
  recruiting: "Make room for relationships between searches."
};

export default function TemplatesPage() {
  return <PublicArticle title="Client follow-up templates for your next conversation." deck="Find your follow-up Mix.">
    <p>Useful wording for the conversations independent professionals actually need to continue: an estimate that’s out, a proposal under review, a client who said “not yet”. Every example here is original and illustrative, not a customer quote. Make the wording yours, then try the matching follow-up plan in the demo.</p>
    <section className="template-hub" aria-labelledby="template-pages-title">
      <h2 id="template-pages-title">Templates by situation</h2>
      <div className="relationship-use-cases">
        {TEMPLATE_PAGES.map(item => <article key={item.href}><span className="relationship-icon"><AppIcon name={item.icon} /></span><h3><Link href={item.href}>{item.title}</Link></h3><p>{item.summary}</p><p className="relationship-example">{item.audience}</p></article>)}
      </div>
      <p className="public-article-note">More situations are added as their examples are reviewed. Nothing is published as a placeholder.</p>
    </section>
    <section aria-labelledby="routes-title">
      <h2 id="routes-title">Follow-up plans by profession</h2>
      <p>Each page plays a demo with that profession’s own Mixes, so you can see the plan before you read the template.</p>
      <ul>{PERSONAS.map(item => <li key={item.id}><Link href={`/for/${item.slug}`}>{item.navLabel}</Link>: {ROUTE_LINES[item.id]}</li>)}</ul>
    </section>
    <section className="public-article-cta" aria-labelledby="hub-cta-title">
      <h2 id="hub-cta-title">Ready to put one follow-up in the mix?</h2>
      <p>Start with a sample conversation. See how a Mix turns “I’ll check back” into a planned next step.</p>
      <Link className="button primary" href="/#sample">Try the demo</Link>
      <small>A fictional contact and an editable draft. Nothing goes out unless you open your own messaging app and send it.</small>
    </section>
  </PublicArticle>;
}
