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
// them, and the structured data describes no offers (JITM-02 §2.18).
export default function PricingPage() {
  return <div className="public-page">
    <a className="public-skip-link" href="#main-content">Skip to content</a>
    <PublicHeader links={[{ href: "/#how-it-works", label: "How it works" }, { href: "/faq", label: "Questions" }]} />
    <main id="main-content" tabIndex={-1}>
      <section className="section public-pricing" aria-labelledby="pricing-title">
        <div className="section-heading"><h1 id="pricing-title">Plans and pricing</h1><p>Free during the beta, with no card required. Paid plans haven’t started yet; these are the plans when they do.</p></div>
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
          </li>)}
        </ul>
        <p className="pricing-note">Prices are in US dollars. You’re charged only if you choose a paid plan.</p>
        <div className="pricing-details">
          <section aria-labelledby="pricing-included">
            <h2 id="pricing-included">Every plan includes</h2>
            <ul>
              <li>Today: who to contact next, with each message prepared for you to review and send yourself.</li>
              <li>Contacts with notes, saved dates and file import.</li>
              <li>Mixes with text, email and call versions of every Beat.</li>
              <li>Ready-made Mixes, Mega-Mixes and the Marketplace.</li>
              <li>The Journey map and the Calendar.</li>
              <li>Quick Add, typed or spoken.</li>
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
        <div className="pricing-join"><p>Free beta. No card required.</p><WaitlistLink className="button primary">Join the waitlist</WaitlistLink><p><Link href="/faq">Questions about access and your data</Link></p></div>
      </section>
    </main>
    <PublicFooter />
  </div>;
}
