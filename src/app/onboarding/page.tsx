import type { Metadata } from "next";
import Link from "next/link";
import { dateInputInTimezone } from "@/lib/date-input";
import { Logo } from "@/components/Logo";
import { Notice } from "@/components/Notice";
import { UrlErrorNotice } from "@/components/UrlErrorNotice";
import { OnboardingForm } from "@/components/OnboardingForm";
import { requireWorkspace } from "@/lib/auth";
import { timezoneForUser } from "@/lib/display-preferences";
import { onboardingUses } from "@/lib/onboarding-options";
import { storedMarketingScenario } from "@/lib/marketing-scenarios";
import { initialJourneySetup } from "@/lib/journey-preferences";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Choose your starting point" };

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ error?: string; at?: string; sig?: string; useCase?: string | string[]; verified?: string; again?: string }> }) {
  const [params, { session, workspace, user }] = await Promise.all([searchParams, requireWorkspace()]);
  // Only a finished setup reaches step 5 ("Save answers and finish later" marks it done at step 1), so a
  // finished workspace that opens setup from Help sees where to go instead of adding the same person again.
  if ((workspace.profile?.onboardingStep ?? 0) >= 5 && params.again !== "1") return (
    <main className="onboarding-shell">
      <div className="onboarding-top"><Logo /><span className="setup-step">Your starting point</span></div>
      <section className="onboarding-card first-win-onboarding">
        <h1>Setup is complete</h1>
        <p className="onboarding-intro">Your follow-ups are on Today, and the Marketplace has more ready-made mixes to add.</p>
        {params.verified === "1" && <Notice type="success">Your email is verified.</Notice>}
        <div className="page-actions"><Link className="button primary" href="/jumps">Open Today</Link><Link className="button" href="/marketplace">Browse the Marketplace</Link></div>
        <p>Want a different starting point? <Link href="/onboarding?again=1">Run setup again</Link>.</p>
      </section>
    </main>
  );
  const [timezone, marketingPreference, contacts, scheduling] = await Promise.all([timezoneForUser(user.id), prisma.workspaceMarketingPreference.findUnique({ where: { workspaceId: workspace.id } }), prisma.contact.findMany({ where: { workspaceId: workspace.id, archivedAt: null }, select: { id: true, displayName: true }, orderBy: { createdAt: "desc" }, take: 100 }), prisma.workspacePreference.findUnique({ where: { workspaceId: workspace.id } })]);
  const selectedUses = onboardingUses(params.useCase ? [params.useCase].flat() : workspace.profile?.useCases.length ? workspace.profile.useCases : ["business"]);
  const today = dateInputInTimezone(new Date(), timezone);
  const scenario = storedMarketingScenario(marketingPreference?.scenario, marketingPreference?.version);
  return (
    <main className="onboarding-shell">
      <div className="onboarding-top"><Logo /><span className="setup-step">Your starting point</span></div>
      <section className="onboarding-card first-win-onboarding">
        <h1>Jump in the mix.</h1>
        <p className="onboarding-intro">Choose a connected journey or build your own. We’ll help it fit your working day.</p>
        {scenario && <p className="onboarding-intro">You tried the {scenario.label.toLowerCase()} example. We’ll use it to suggest a starting point.</p>}
        {params.verified === "1" && <Notice type="success">Your email is verified.</Notice>}
        <UrlErrorNotice params={params} viewer={session} />
        <OnboardingForm initialSetup={initialJourneySetup(scheduling, timezone)} company={workspace.profile?.company ?? undefined} smsSignature={workspace.profile?.smsSignature ?? undefined} userName={user.name} industry={workspace.profile?.industry ?? scenario?.businessType ?? null} initialUses={selectedUses} contacts={contacts} timezone={timezone} today={today} scenarioId={scenario?.id} />
      </section>
    </main>
  );
}
