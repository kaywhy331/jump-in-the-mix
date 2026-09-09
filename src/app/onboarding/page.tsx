import type { Metadata } from "next";
import { Logo } from "@/components/Logo";
import { Notice } from "@/components/Notice";
import { OnboardingForm } from "@/components/OnboardingForm";
import { requireWorkspace } from "@/lib/auth";
import { timezoneForUser } from "@/lib/display-preferences";
import { onboardingUse } from "@/lib/onboarding-options";

export const metadata: Metadata = { title: "Create your first follow-up" };

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ error?: string; useCase?: string }> }) {
  const [params, { workspace, user }] = await Promise.all([searchParams, requireWorkspace()]);
  const timezone = await timezoneForUser(user.id);
  const today = new Date().toISOString().slice(0, 10);
  return (
    <main className="onboarding-shell">
      <div className="onboarding-top"><Logo /><span className="setup-step">Your first follow-up</span></div>
      <section className="onboarding-card first-win-onboarding">
        <span className="eyebrow">Start with one person</span>
        <h1>Jump in the mix.</h1>
        <p className="onboarding-intro">Who would you like to reconnect with? A customer, a friend, or someone you just met—start with one person.</p>
        <p>Once you’re set up, try the Jump in the Mix System Mix: introduce a contact and share one of your five personal invitations.</p>
        {params.error && <Notice type="error">{params.error}</Notice>}
        <OnboardingForm userName={user.name} industry={workspace.profile?.industry ?? null} initialUse={onboardingUse(params.useCase ?? "")?.id ?? "business"} timezone={timezone} today={today} />
      </section>
    </main>
  );
}
