"use client";

import Link from "next/link";
import { useState } from "react";
import { Notice } from "@/components/Notice";
import { TimezonePicker } from "@/components/TimezonePicker";
import { AI_MIX_CADENCES, AI_MIX_PRODUCT_PLACEHOLDERS } from "@/lib/ai-mix";
import { generateAiMixDraftAction } from "@/lib/ai-mix-actions";

type TriggerMode = "MANUAL_START" | "DATE_TRIGGERED" | "BROADCAST";

type Option = { id: string; name: string; description?: string | null; isSystem?: boolean };

function cadenceLabel(value: typeof AI_MIX_CADENCES[number]): string {
  if (value === "SMS_FORWARD") return "SMS-forward";
  if (value === "EMAIL_FORWARD") return "Email-forward";
  if (value === "LIGHT_TOUCH") return "Light touch";
  return "Balanced";
}

function preferredOption(values: string[], preferred: string): string {
  return values.includes(preferred) ? preferred : values[0] ?? preferred;
}

export function AiMixWizardForm({
  objectives,
  frameworks,
  tones,
  dateTypes,
  groups,
  products,
  industry,
  timezone,
  quietHours,
  voicemailLimit
}: {
  objectives: string[];
  frameworks: string[];
  tones: string[];
  dateTypes: Option[];
  groups: Option[];
  products: Array<string | null>;
  industry: string | null;
  timezone: string;
  quietHours: string;
  voicemailLimit: number;
}) {
  const [objective, setObjective] = useState(preferredOption(objectives, "Follow Up With New Leads"));
  const [framework, setFramework] = useState(preferredOption(frameworks, "Question-Led Consultative"));
  const [triggerMode, setTriggerMode] = useState<TriggerMode>("MANUAL_START");
  const [industryContext, setIndustryContext] = useState(industry ? "MY_INFO" : "NONE");
  const [productPlaceholder, setProductPlaceholder] = useState<string>(AI_MIX_PRODUCT_PLACEHOLDERS[0] ?? "");
  const [assignAllContacts, setAssignAllContacts] = useState(false);

  return (
    <form action={generateAiMixDraftAction} className="ai-wizard-form">
      <fieldset className="card ai-wizard-section">
        <legend><span>1</span> Outcome and approach</legend>
        <p>Choose the result and strategic style. Additional fields appear only when they are relevant.</p>
        <div className="form-grid">
          <div className="field"><label htmlFor="objective">Primary objective</label><select id="objective" name="objective" value={objective} onChange={(event) => setObjective(event.target.value)}>{objectives.map((item) => <option key={item}>{item}</option>)}</select></div>
          {objective === "Other" && <div className="field"><label htmlFor="customObjective">Describe the objective</label><input id="customObjective" name="customObjective" maxLength={200} placeholder="Invite former clients to an annual review" required /></div>}
          <div className="field"><label htmlFor="framework">Strategic framework</label><select id="framework" name="framework" value={framework} onChange={(event) => setFramework(event.target.value)}>{frameworks.map((item) => <option key={item}>{item}</option>)}</select></div>
          {framework === "Other" && <div className="field"><label htmlFor="customFramework">Describe the approach</label><input id="customFramework" name="customFramework" maxLength={160} placeholder="Describe the strategist style" required /></div>}
          <div className="field"><label htmlFor="tone">Tone</label><select id="tone" name="tone" defaultValue={preferredOption(tones, "Warm")}>{tones.map((item) => <option key={item}>{item}</option>)}</select></div>
          <div className="field full"><label htmlFor="customContext">Helpful context</label><textarea id="customContext" name="customContext" maxLength={1200} placeholder="Optional offer details, situation, objections, or desired next step. Do not paste Contact data." /></div>
        </div>
      </fieldset>

      <fieldset className="card ai-wizard-section">
        <legend><span>2</span> Trigger and audience</legend>
        <p>Choose how the plan starts and deliberately select its audience.</p>
        <div className="form-grid">
          <div className="field"><label htmlFor="triggerMode">How should the Mix start?</label><select id="triggerMode" name="triggerMode" value={triggerMode} onChange={(event) => setTriggerMode(event.target.value as TriggerMode)}><option value="MANUAL_START">Start manually</option><option value="DATE_TRIGGERED">From an Important Date</option><option value="BROADCAST">On one fixed date</option></select></div>
          {triggerMode === "DATE_TRIGGERED" && <div className="field"><label htmlFor="dateTypeId">Important Date Type</label><select id="dateTypeId" name="dateTypeId" defaultValue="" required><option value="">Choose a type</option>{dateTypes.map((item) => <option key={item.id} value={item.id}>{item.isSystem ? "System" : "Custom"} · {item.name}</option>)}</select></div>}
          {triggerMode === "BROADCAST" && <div className="field full broadcast-fields"><div className="broadcast-field-grid"><label className="field"><span>Broadcast date</span><input name="broadcastDate" type="date" required /></label><label className="field"><span>Broadcast time</span><input name="broadcastTime" type="time" defaultValue="10:00" required /></label><label className="field"><span>Timezone</span><TimezonePicker name="broadcastTimezone" id="aiBroadcastTimezone" label="Broadcast timezone" defaultValue={timezone} /></label></div></div>}
          {triggerMode !== "BROADCAST" && <input type="hidden" name="broadcastTimezone" value={timezone} />}
          <label className="checkbox-card field full"><input type="checkbox" name="assignAllContacts" checked={assignAllContacts} onChange={(event) => setAssignAllContacts(event.target.checked)} /><span><strong>All active Contacts</strong><small>Use a snapshot of every active Contact currently in this workspace.</small></span></label>
          {!assignAllContacts && <div className="field full"><span className="field-label">Or choose active Contact Groups</span>{groups.length ? <div className="checkbox-row ai-audience-groups">{groups.map((group) => <label className="checkbox-card" key={group.id}><input type="checkbox" name="groupIds" value={group.id} /><span><strong>{group.name}</strong><small>{group.description || "Dynamic Group audience"}</small></span></label>)}</div> : <Notice type="info">No active Contact Groups are available. Choose All active Contacts or activate a Group from Contacts.</Notice>}</div>}
        </div>
      </fieldset>

      <fieldset className="card ai-wizard-section">
        <legend><span>3</span> Timing and intensity</legend>
        <p>Set the campaign length, number of actions, and channel emphasis.</p>
        <div className="form-grid">
          <div className="field"><label htmlFor="durationDays">Timeline</label><select id="durationDays" name="durationDays" defaultValue="14"><option value="7">7 days</option><option value="14">14 days</option><option value="21">21 days</option><option value="30">30 days</option><option value="60">60 days</option><option value="90">90 days</option></select></div>
          <div className="field"><label htmlFor="touches">Number of actions</label><select id="touches" name="touches" defaultValue="5"><option value="3">3 actions</option><option value="4">4 actions</option><option value="5">5 actions</option><option value="6">6 actions</option><option value="7">7 actions</option></select></div>
          <div className="field"><label htmlFor="cadence">Cadence and intensity</label><select id="cadence" name="cadence" defaultValue="BALANCED">{AI_MIX_CADENCES.map((item) => <option key={item} value={item}>{cadenceLabel(item)}</option>)}</select></div>
          <div className="field"><label htmlFor="preferredSendTime">Preferred local time</label><input id="preferredSendTime" name="preferredSendTime" type="time" defaultValue="10:00" /></div>
          <div className="field full"><small>Workspace quiet hours are {quietHours} in {timezone}. The final review remains editable before activation.</small></div>
        </div>
      </fieldset>

      <fieldset className="card ai-wizard-section">
        <legend><span>4</span> Channels and personalization</legend>
        <p>Select channels and only the My Info context the strategist may use.</p>
        <div className="form-grid">
          <div className="field full"><span className="field-label">Channels</span><div className="checkbox-row ai-channel-options"><label className="checkbox-card"><input type="checkbox" name="channels" value="EMAIL" defaultChecked /><span><strong>Email</strong><small>Subject and body</small></span></label><label className="checkbox-card"><input type="checkbox" name="channels" value="SMS" defaultChecked /><span><strong>SMS</strong><small>Personal concise text</small></span></label><label className="checkbox-card"><input type="checkbox" name="channels" value="PHONE_CALL" defaultChecked /><span><strong>Phone Call</strong><small>Question-led notes</small></span></label><label className="checkbox-card"><input type="checkbox" name="channels" value="WHATSAPP" /><span><strong>WhatsApp</strong><small>Prepared message</small></span></label>{voicemailLimit > 0 && <label className="checkbox-card"><input type="checkbox" name="channels" value="VOICEMAIL" /><span><strong>Voicemail Script</strong><small>{voicemailLimit}/month</small></span></label>}</div></div>
          <div className="field"><label htmlFor="productPlaceholder">Product or service context</label><select id="productPlaceholder" name="productPlaceholder" value={productPlaceholder} onChange={(event) => setProductPlaceholder(event.target.value)}><option value="">Do not reference a product</option>{AI_MIX_PRODUCT_PLACEHOLDERS.map((placeholder, index) => <option key={placeholder} value={placeholder}>{products[index]?.trim() ? `Product ${index + 1}: ${products[index]}` : `My Product ${index + 1}`}</option>)}</select></div>
          {productPlaceholder && <div className="field"><small>The strategist may use only the selected My Info placeholder and its saved workspace value.</small></div>}
          <div className="field"><label htmlFor="industryContext">Industry context</label><select id="industryContext" name="industryContext" value={industryContext} onChange={(event) => setIndustryContext(event.target.value)}><option value="NONE">No industry context</option><option value="MY_INFO">My Industry{industry ? ` · ${industry}` : ""}</option><option value="CUSTOM">Other industry or market</option></select></div>
          {industryContext === "CUSTOM" && <div className="field"><label htmlFor="customIndustry">Other industry or market</label><input id="customIndustry" name="customIndustry" maxLength={200} placeholder="Commercial property management" required /></div>}
          <label className="checkbox-card field full"><input type="checkbox" name="includeOptOut" /><span><strong>Keep SMS opt-out delivery metadata enabled</strong><small>This never inserts automated-marketing language into personal message content.</small></span></label>
          <div className="field full"><Notice type="info">The result opens one final review. You can add, remove, reorder, rewrite, save as a Mix Draft, or activate it directly. Nothing activates without your explicit choice.</Notice></div>
        </div>
      </fieldset>

      <div className="form-actions sticky-form-actions ai-wizard-submit"><Link href="/mixes" className="button">Cancel</Link><button type="submit" className="button primary">Generate final review</button></div>
    </form>
  );
}
