import type { Metadata } from "next";
import Link from "next/link";
import { Notice } from "@/components/Notice";
import {
  AI_MIX_CADENCES,
  AI_MIX_FRAMEWORKS,
  AI_MIX_OBJECTIVES,
  AI_MIX_PRODUCT_PLACEHOLDERS,
  AI_MIX_TONES,
  isAiMixProviderConfigured
} from "@/lib/ai-mix";
import { generateAiMixDraftAction } from "@/lib/ai-mix-actions";
import { requireWorkspace } from "@/lib/auth";
import { formatTimeInput } from "@/lib/mix-broadcast";
import { PLAN_LIMITS } from "@/lib/plans";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "AI Mix Wizard" };

type SearchParams = { error?: string; canceled?: string };

function cadenceLabel(value: typeof AI_MIX_CADENCES[number]): string {
  if (value === "SMS_FORWARD") return "SMS-forward";
  if (value === "EMAIL_FORWARD") return "Email-forward";
  if (value === "LIGHT_TOUCH") return "Light touch";
  return "Balanced";
}

function productLabel(index: number, value: string | null | undefined): string {
  return value?.trim() ? `Product ${index}: ${value.trim()}` : `My Product ${index}`;
}

export default async function MixWizardPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const [params, { workspace }] = await Promise.all([searchParams, requireWorkspace()]);
  const limits = PLAN_LIMITS[workspace.planTier];

  if (!limits.aiWizard) {
    return (
      <div className="page ai-wizard-page">
        <header className="page-header"><div><h1>AI Mix Wizard</h1><p>A guided preflight form that turns your goal into a complete follow-up sequence.</p></div></header>
        <Notice type="info">The AI Mix Wizard is included with Plus and Pro. You can still create a Mix manually or import an approved Mix Template.</Notice>
        <div className="page-actions"><Link href="/templates" className="button">Browse Mix Templates</Link><Link href="/mixes" className="button primary">Return to Mixes</Link></div>
      </div>
    );
  }

  const [groups, dateTypes, recentDrafts] = await Promise.all([
    prisma.group.findMany({ where: { workspaceId: workspace.id }, orderBy: { name: "asc" } }),
    prisma.dateType.findMany({
      where: { isActive: true, OR: [{ workspaceId: workspace.id }, { workspaceId: null, isSystem: true }] },
      orderBy: [{ isSystem: "asc" }, { name: "asc" }]
    }),
    prisma.aiMixDraft.findMany({
      where: { workspaceId: workspace.id, status: "DRAFT", expiresAt: { gt: new Date() } },
      orderBy: { updatedAt: "desc" },
      take: 5
    })
  ]);
  const profile = workspace.profile;
  const products = [profile?.product1, profile?.product2, profile?.product3, profile?.product4, profile?.product5];
  const timezone = profile?.timezone ?? "UTC";
  const providerConnected = isAiMixProviderConfigured();

  return (
    <div className="page ai-wizard-page">
      {params.error && <Notice type="error">{params.error}</Notice>}
      {params.canceled && <Notice type="info">The AI Mix draft was discarded.</Notice>}
      <header className="page-header">
        <div><h1>AI Mix Wizard</h1><p>Four focused decisions produce an editable Mix Draft without a long AI conversation.</p></div>
        <div className="page-actions"><Link href="/templates" className="button">Mix Templates</Link><Link href="/mixes" className="button">My Mixes</Link></div>
      </header>

      <div className="ai-wizard-intro card">
        <div><strong>Private by design</strong><p>The strategist receives your business context and audience labels—not Contact records, private notes, phone numbers, or email addresses.</p></div>
        <span className={`status-pill ${providerConnected ? "done" : ""}`}>{providerConnected ? "AI provider connected" : "Built-in strategist ready"}</span>
      </div>

      <form action={generateAiMixDraftAction} className="ai-wizard-form">
        <fieldset className="card ai-wizard-section">
          <legend><span>1</span> Outcome and approach</legend>
          <p>Choose the result you want and the strategic style the Jumps should follow.</p>
          <div className="form-grid">
            <div className="field"><label htmlFor="objective">Primary objective</label><select id="objective" name="objective" defaultValue="Follow Up With New Leads">{AI_MIX_OBJECTIVES.map((item) => <option key={item}>{item}</option>)}</select></div>
            <div className="field"><label htmlFor="customObjective">Other objective</label><input id="customObjective" name="customObjective" maxLength={200} placeholder="Example: Invite former clients to an annual review" /></div>
            <div className="field"><label htmlFor="framework">Strategic framework</label><select id="framework" name="framework" defaultValue="Question-Led Consultative">{AI_MIX_FRAMEWORKS.map((item) => <option key={item}>{item}</option>)}</select></div>
            <div className="field"><label htmlFor="customFramework">Other framework or strategist style</label><input id="customFramework" name="customFramework" maxLength={160} placeholder="Describe the approach without copying protected material" /></div>
            <div className="field"><label htmlFor="tone">Tone</label><select id="tone" name="tone" defaultValue="Warm">{AI_MIX_TONES.map((item) => <option key={item}>{item}</option>)}</select></div>
            <div className="field"><label htmlFor="customContext">Helpful context</label><textarea id="customContext" name="customContext" maxLength={1200} placeholder="Optional: offer details, situation, objections, or the desired next step. Do not paste Contact data." /></div>
          </div>
        </fieldset>

        <fieldset className="card ai-wizard-section">
          <legend><span>2</span> Trigger and audience</legend>
          <p>Decide what starts the Mix and who should receive its Jumps.</p>
          <div className="form-grid">
            <div className="field"><label htmlFor="triggerMode">How should the Mix start?</label><select id="triggerMode" name="triggerMode" defaultValue="MANUAL_START"><option value="MANUAL_START">Manual start</option><option value="DATE_TRIGGERED">Target Jump Date Type</option><option value="BROADCAST">Fixed-date broadcast</option></select></div>
            <div className="field"><label htmlFor="dateTypeId">Target Jump Date Type</label><select id="dateTypeId" name="dateTypeId" defaultValue=""><option value="">Used only for date-triggered Mixes</option>{dateTypes.map((item) => <option key={item.id} value={item.id}>{item.isSystem ? "System" : "Custom"} · {item.name}</option>)}</select></div>
            <div className="field"><label htmlFor="broadcastDate">Broadcast date</label><input id="broadcastDate" name="broadcastDate" type="date" /></div>
            <div className="field"><label htmlFor="broadcastTime">Broadcast time</label><input id="broadcastTime" name="broadcastTime" type="time" defaultValue="10:00" /></div>
            <div className="field full"><label htmlFor="broadcastTimezone">Broadcast timezone</label><input id="broadcastTimezone" name="broadcastTimezone" defaultValue={timezone} /></div>
            <label className="checkbox-card field full"><input type="checkbox" name="assignAllContacts" /><span><strong>All active Contacts</strong><small>Use a snapshot of every active Contact currently in this workspace.</small></span></label>
            <div className="field full"><span className="field-label">Or choose Contact Groups</span>{groups.length ? <div className="checkbox-row ai-audience-groups">{groups.map((group) => <label className="checkbox-card" key={group.id}><input type="checkbox" name="groupIds" value={group.id} /><span><strong>{group.name}</strong><small>{group.description || "Dynamic Group audience"}</small></span></label>)}</div> : <Notice type="info">No Contact Groups exist yet. Choose All active Contacts or create a Group from Contacts first.</Notice>}</div>
          </div>
        </fieldset>

        <fieldset className="card ai-wizard-section">
          <legend><span>3</span> Timing and intensity</legend>
          <p>Set the campaign length, number of touches, and channel emphasis.</p>
          <div className="form-grid">
            <div className="field"><label htmlFor="durationDays">Timeline</label><select id="durationDays" name="durationDays" defaultValue="14"><option value="7">7 days</option><option value="14">14 days</option><option value="21">21 days</option><option value="30">30 days</option></select></div>
            <div className="field"><label htmlFor="touches">Number of Jumps</label><select id="touches" name="touches" defaultValue="5"><option value="3">3 Jumps</option><option value="4">4 Jumps</option><option value="5">5 Jumps</option><option value="6">6 Jumps</option><option value="7">7 Jumps</option></select></div>
            <div className="field"><label htmlFor="cadence">Cadence and intensity</label><select id="cadence" name="cadence" defaultValue="BALANCED">{AI_MIX_CADENCES.map((item) => <option key={item} value={item}>{cadenceLabel(item)}</option>)}</select></div>
            <div className="field"><label htmlFor="preferredSendTime">Preferred local time</label><input id="preferredSendTime" name="preferredSendTime" type="time" defaultValue="10:00" /></div>
            <div className="field full"><small>Workspace quiet hours are currently {formatTimeInput(profile?.quietHoursStart)}–{formatTimeInput(profile?.quietHoursEnd)} in {timezone}. Generated Jumps keep one preferred time, which remains editable before activation.</small></div>
          </div>
        </fieldset>

        <fieldset className="card ai-wizard-section">
          <legend><span>4</span> Channels and personalization</legend>
          <p>Select the channels and the My Info context the strategist may use.</p>
          <div className="form-grid">
            <div className="field full"><span className="field-label">Channels</span><div className="checkbox-row ai-channel-options"><label className="checkbox-card"><input type="checkbox" name="channels" value="EMAIL" defaultChecked /><span><strong>Email</strong><small>Subject and body</small></span></label><label className="checkbox-card"><input type="checkbox" name="channels" value="SMS" defaultChecked /><span><strong>SMS</strong><small>Personal, concise text</small></span></label><label className="checkbox-card"><input type="checkbox" name="channels" value="PHONE_CALL" defaultChecked /><span><strong>Phone Call</strong><small>Question-led script</small></span></label><label className="checkbox-card"><input type="checkbox" name="channels" value="WHATSAPP" /><span><strong>WhatsApp</strong><small>Prepared message</small></span></label>{limits.ringlessVoicemailsPerMonth > 0 && <label className="checkbox-card"><input type="checkbox" name="channels" value="VOICEMAIL" /><span><strong>Voicemail Script</strong><small>Pro · {limits.ringlessVoicemailsPerMonth}/month</small></span></label>}</div></div>
            <div className="field"><label htmlFor="productPlaceholder">Product or service context</label><select id="productPlaceholder" name="productPlaceholder" defaultValue={AI_MIX_PRODUCT_PLACEHOLDERS[0]}><option value="">Do not reference a product</option>{AI_MIX_PRODUCT_PLACEHOLDERS.map((placeholder, index) => <option key={placeholder} value={placeholder}>{productLabel(index + 1, products[index])}</option>)}</select></div>
            <div className="field"><label htmlFor="industryContext">Industry context</label><select id="industryContext" name="industryContext" defaultValue={profile?.industry ? "MY_INFO" : "NONE"}><option value="NONE">No industry context</option><option value="MY_INFO">My Industry{profile?.industry ? ` · ${profile.industry}` : ""}</option><option value="CUSTOM">Other industry or market</option></select></div>
            <div className="field full"><label htmlFor="customIndustry">Other industry or market</label><input id="customIndustry" name="customIndustry" maxLength={200} placeholder="Example: Commercial property management" /></div>
            <label className="checkbox-card field full"><input type="checkbox" name="includeOptOut" /><span><strong>Keep SMS opt-out metadata enabled</strong><small>This controls future delivery behavior only. The wizard never adds “Reply STOP” or unsubscribe language to personal message content.</small></span></label>
            <div className="field full"><Notice type="info">The result is an expiring review draft. You can edit every Jump, apply an optional refinement, and then create a normal editable Mix Draft. Nothing activates automatically.</Notice></div>
          </div>
        </fieldset>

        <div className="form-actions sticky-form-actions ai-wizard-submit"><Link href="/mixes" className="button">Cancel</Link><button type="submit" className="button primary">Generate review draft</button></div>
      </form>

      {recentDrafts.length > 0 && (
        <section className="card ai-recent-drafts">
          <div className="card-header"><div><h2>Recent review drafts</h2><p>Resume a draft before its 48-hour expiration.</p></div><span className="status-pill">{recentDrafts.length}</span></div>
          <div className="ai-recent-draft-list">{recentDrafts.map((draft) => <Link href={`/mixes/wizard/${draft.id}`} className="quick-action" key={draft.id}><span><strong>AI Mix draft</strong><small>Updated {new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(draft.updatedAt)}</small></span><span>Review →</span></Link>)}</div>
        </section>
      )}
    </div>
  );
}
