import type { Metadata } from "next";
import Link from "next/link";
import { AiMixWizardForm } from "@/components/AiMixWizardForm";
import { Notice } from "@/components/Notice";
import { isAiMixProviderConfigured } from "@/lib/ai-mix";
import { requireWorkspace } from "@/lib/auth";
import { mergeGroupActivity } from "@/lib/group-activity";
import { formatTimeInput } from "@/lib/mix-broadcast";
import { getPlatformBoolean, getPlatformStringList } from "@/lib/platform-settings";
import { PLAN_LIMITS } from "@/lib/plans";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "AI Mix Wizard" };

type SearchParams = { error?: string; canceled?: string };

export default async function MixWizardPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const [params, { workspace }] = await Promise.all([searchParams, requireWorkspace()]);
  const limits = PLAN_LIMITS[workspace.planTier];

  if (!limits.aiWizard) {
    return (
      <div className="page ai-wizard-page">
        <header className="page-header"><div><h1>AI Mix Wizard</h1><p>A guided preflight form that turns your goal into a complete follow-up sequence.</p></div></header>
        <Notice type="info">The AI Mix Wizard is included with Plus and Pro. You can still create a Mix manually or use an approved Mix Template.</Notice>
        <div className="page-actions"><Link href="/templates" className="button">Browse Mix Templates</Link><Link href="/mixes" className="button primary">Return to Mixes</Link></div>
      </div>
    );
  }

  const [rawGroups, groupStates, dateTypes, recentDrafts, objectives, frameworks, tones, providerEnabled] = await Promise.all([
    prisma.group.findMany({ where: { workspaceId: workspace.id }, orderBy: { name: "asc" } }),
    prisma.contactGroupState.findMany({ where: { workspaceId: workspace.id }, select: { groupId: true, isActive: true } }),
    prisma.dateType.findMany({ where: { isActive: true, OR: [{ workspaceId: workspace.id }, { workspaceId: null, isSystem: true }] }, orderBy: [{ isSystem: "asc" }, { name: "asc" }] }),
    prisma.aiMixDraft.findMany({ where: { workspaceId: workspace.id, status: "DRAFT", expiresAt: { gt: new Date() } }, orderBy: { updatedAt: "desc" }, take: 5 }),
    getPlatformStringList("ai.objectives"),
    getPlatformStringList("ai.frameworks"),
    getPlatformStringList("ai.tones"),
    getPlatformBoolean("feature.aiProviderGeneration")
  ]);
  const groups = mergeGroupActivity(rawGroups, groupStates).filter((group) => group.isActive);
  const profile = workspace.profile;
  const timezone = profile?.timezone ?? "UTC";
  const providerConnected = providerEnabled && isAiMixProviderConfigured();

  return (
    <div className="page ai-wizard-page">
      {params.error && <Notice type="error">{params.error}</Notice>}
      {params.canceled && <Notice type="info">The AI Mix draft was discarded.</Notice>}
      <header className="page-header">
        <div><h1>AI Mix Wizard</h1><p>Four focused decisions produce one final review without a long AI conversation.</p></div>
        <div className="page-actions"><Link href="/templates" className="button">Mix Templates</Link><Link href="/mixes" className="button">My Mixes</Link></div>
      </header>
      <div className="ai-wizard-intro card">
        <div><strong>Private by design</strong><p>The strategist receives workspace business context and audience labels—not Contact records, private notes, phone numbers, or email addresses.</p></div>
        <span className={`status-pill ${providerConnected ? "done" : ""}`}>{providerConnected ? "AI provider connected" : "Built-in strategist ready"}</span>
      </div>
      <AiMixWizardForm
        objectives={objectives}
        frameworks={frameworks}
        tones={tones}
        dateTypes={dateTypes.map((item) => ({ id: item.id, name: item.name, isSystem: item.isSystem }))}
        groups={groups.map((item) => ({ id: item.id, name: item.name, description: item.description }))}
        products={[profile?.product1 ?? null, profile?.product2 ?? null, profile?.product3 ?? null, profile?.product4 ?? null, profile?.product5 ?? null]}
        industry={profile?.industry ?? null}
        timezone={timezone}
        quietHours={`${formatTimeInput(profile?.quietHoursStart)}–${formatTimeInput(profile?.quietHoursEnd)}`}
        voicemailLimit={limits.ringlessVoicemailsPerMonth}
      />
      {recentDrafts.length > 0 && (
        <section className="card ai-recent-drafts">
          <div className="card-header"><div><h2>Recent final reviews</h2><p>Resume a review before its 48-hour expiration.</p></div><span className="status-pill">{recentDrafts.length}</span></div>
          <div className="ai-recent-draft-list">{recentDrafts.map((draft) => <Link href={`/mixes/wizard/${draft.id}`} className="quick-action" key={draft.id}><span><strong>AI Mix review</strong><small>Updated {new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(draft.updatedAt)}</small></span><span>Review →</span></Link>)}</div>
        </section>
      )}
    </div>
  );
}
