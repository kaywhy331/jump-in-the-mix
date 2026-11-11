import type { Metadata } from "next";
import Link from "next/link";
import { PublicHeader } from "@/components/PublicHeader";
import { PublicFooter } from "@/components/PublicFooter";
import { WaitlistLink } from "@/components/WaitlistLink";
import { publicPageMetadata } from "@/lib/public-seo";
import { PLANS, formatDollars } from "@/lib/plans";

export const metadata: Metadata = publicPageMetadata({
  path: "/pricing",
  title: "Plans and pricing",
  description: "Jump in the Mix is free during the beta, with no card required. When paid plans start: Free at $0, Plus at $15 a month and Pro at $29 a month."
});

// Kevin set these plans on 2026-09-29. Paid plans have not started, so the page states the prices without a way to buy
// them, and the structured data describes no offers (JITM-02 §2.18). The Free card carries the page's one action; Plus
// and Pro say plainly that paid plans start later (JITM-06 §2.37).
export default function PricingPage() {
  return <div className="public-page">
    <a className="public-skip-link" href="#main-content">Skip to content</a>
    <PublicHeader current="/pricing" links={[{ href: "/#how-it-works", label: "How it works" }, { href: "/faq", label: "Questions" }]} />
    <main id="main-content" tabIndex={-1}>
      <section className="section public-pricing" aria-labelledby="pricing-title">
        <div className="section-heading"><h1 id="pricing-title">Plans and pricing</h1><p>Free during the beta, with no card required. Paid plans haven’t started yet; these are the plans when they do.</p></div>
        <p>A Mix is a reusable follow-up plan. Each Beat is one planned text, email or call in a Mix. Today is your daily list of follow-ups and other items that need you.</p>
        <ul className="pricing-grid" role="list">
          {PLANS.map(plan => <li className="pricing-card" key={plan.id}>
            <h2>{plan.name}</h2>
            <p className="pricing-price"><strong>{formatDollars(plan.monthlyCents)}</strong>{plan.monthlyCents ? " a month" : ""}</p>
            <p className="pricing-yearly">{plan.yearlyCents ? `or ${formatDollars(plan.yearlyCents)} a year` : "No card needed"}</p>
            <p>{plan.summary}</p>
            <ul className="pricing-limits">
              <li>Up to {plan.people.toLocaleString("en-US")} people with follow-ups</li>
              <li>Up to {plan.activeMixes} active Mixes</li>
            </ul>
            <div className="pricing-card-action">{plan.monthlyCents
              ? <p>Paid plans start later. There’s nothing to buy yet.</p>
              : <><p>Free during the beta.</p><WaitlistLink className="button primary">Join the waitlist</WaitlistLink></>}</div>
          </li>)}
        </ul>
        <p className="pricing-note">Prices are in US dollars. You’re charged only if you choose a paid plan.</p>
        <div className="pricing-details">
          <section aria-labelledby="pricing-included">
            <h2 id="pricing-included">Every plan includes</h2>
            <ul>
              <li>Today, your daily list of who to contact next, with each message prepared for you to review and send yourself.</li>
              <li>Your contacts, with notes, saved dates and import from a file.</li>
              <li>Mixes, your reusable follow-up plans, with a text, email and call version of every Beat.</li>
              <li>Mega-Mixes, named sets of connected Mixes that cover your work from first inquiry to repeat business.</li>
              <li>The Marketplace, where you find ready-made Mixes and Mega-Mixes to add.</li>
              <li>Journey, a map of how your Mixes connect and where each person is right now.</li>
              <li>Calendar, for your meetings and time blocks.</li>
              <li>Quick Add, for adding a person, a note or a follow-up from any screen, by typing or speaking.</li>
              <li>Exporting your data or deleting your account.</li>
            </ul>
          </section>
          <section aria-labelledby="pricing-limits">
            <h2 id="pricing-limits">How the limits count</h2>
            <ul>
              <li>A person counts once, however many Mixes they’re in.</li>
              <li>A Mega-Mix counts as one Mix.</li>
              <li>Contacts without a follow-up don’t count, so importing your address book uses none of your limit.</li>
              <li>Reaching a limit never removes anything. Your contacts, Mixes and history stay; you can add more once you’re under the limit or on a larger plan.</li>
            </ul>
          </section>
        </div>
        <div className="pricing-join"><p><Link href="/faq">Questions about access and your data</Link></p></div>
      </section>
    </main>
    <PublicFooter />
  </div>;
}
