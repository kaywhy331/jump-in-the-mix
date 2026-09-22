import type { Metadata } from "next";
import { dateInputInTimezone } from "@/lib/date-input";
import { Logo } from "@/components/Logo";
import { Notice } from "@/components/Notice";
import { OnboardingForm } from "@/components/OnboardingForm";
import { requireWorkspace } from "@/lib/auth";
import { timezoneForUser } from "@/lib/display-preferences";
import { onboardingUses } from "@/lib/onboarding-options";
import { storedMarketingScenario } from "@/lib/marketing-scenarios";
import { initialJourneySetup } from "@/lib/journey-preferences";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Choose your starting point" };

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ error?: string; useCase?: string | string[] }> }) {
  const [params, { workspace, user }] = await Promise.all([searchParams, requireWorkspace()]);
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
        {params.error && <Notice type="error">{params.error}</Notice>}
        <OnboardingForm initialSetup={initialJourneySetup(scheduling, timezone)} company={workspace.profile?.company ?? undefined} smsSignature={workspace.profile?.smsSignature ?? undefined} userName={user.name} industry={workspace.profile?.industry ?? scenario?.businessType ?? null} initialUses={selectedUses} contacts={contacts} timezone={timezone} today={today} scenarioId={scenario?.id} />
      </section>
    </main>
  );
}
