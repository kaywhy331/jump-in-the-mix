import type { Metadata } from "next";
import { dateInputInTimezone } from "@/lib/date-input";
import { Logo } from "@/components/Logo";
import { Notice } from "@/components/Notice";
import { OnboardingForm } from "@/components/OnboardingForm";
import { requireWorkspace } from "@/lib/auth";
import { timezoneForUser } from "@/lib/display-preferences";
import { onboardingUses } from "@/lib/onboarding-options";
import { storedMarketingScenario } from "@/lib/marketing-scenarios";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Choose your starting point" };

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ error?: string; useCase?: string | string[] }> }) {
  const [params, { workspace, user }] = await Promise.all([searchParams, requireWorkspace()]);
  const [timezone, marketingPreference, contacts] = await Promise.all([timezoneForUser(user.id), prisma.workspaceMarketingPreference.findUnique({ where: { workspaceId: workspace.id } }), prisma.contact.findMany({ where: { workspaceId: workspace.id, archivedAt: null }, select: { id: true, displayName: true }, orderBy: { createdAt: "desc" }, take: 100 })]);
  const selectedUses = onboardingUses(params.useCase ? [params.useCase].flat() : workspace.profile?.useCases.length ? workspace.profile.useCases : ["business"]);
  const today = dateInputInTimezone(new Date(), timezone);
  const scenario = storedMarketingScenario(marketingPreference?.scenario, marketingPreference?.version);
  return (
    <main className="onboarding-shell">
      <div className="onboarding-top"><Logo /><span className="setup-step">Your starting point</span></div>
      <section className="onboarding-card first-win-onboarding">
        <h1>Jump in the mix.</h1>
        <p className="onboarding-intro">Start with one person, or choose a complete journey for your business.</p>
        {scenario && <p className="onboarding-intro">You tried the {scenario.label.toLowerCase()} example. Use its starter, choose another, or skip setup.</p>}
        {params.error && <Notice type="error">{params.error}</Notice>}
        <OnboardingForm userName={user.name} industry={workspace.profile?.industry ?? scenario?.businessType ?? null} initialUses={selectedUses} contacts={contacts} timezone={timezone} today={today} scenarioId={scenario?.id} />
      </section>
    </main>
  );
}
