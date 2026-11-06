import { AppIcon } from "@/components/AppIcon";
import { describeStepTiming, describeStepReadiness } from "@/lib/step-timing";
import { channelName, timeOfDayLabel, zonedDateTimeLabel, zoneLabel } from "@/lib/display-labels";
import { MergeFieldText } from "@/components/MergeFieldText";
import type { StepAnchor } from "@/generated/prisma/client";
import type { BeatWordingPreview } from "@/lib/workflow-start-preview";

const detailTitle = "Filled in from saved person or business details; missing details may use default wording or stay blank";

type Beat = { id: string; plannedAt: Date | null; dayOffset: number; sendTimeMinutes: number | null; anchor: StepAnchor; offsetMinutes: number | null; stepVersion: { subject: string | null; body: string | null; script: string | null; stepTemplate: { name: string; channel: string } } };
export function MixBeatPreview({ steps, gatedStepIds, timezone, locale, triggerMode, wording, contactName }: { steps: Beat[]; gatedStepIds: string[]; timezone: string; locale: string; triggerMode?: string; wording?: Record<string, BeatWordingPreview>; contactName?: string }) {
  return <section className="mix-beat-preview" aria-label="Beat preview"><div className="mix-beat-preview-heading"><h3>Beats</h3><span>{steps.length}</span></div>
    <p className="muted-copy">{contactName ? `Preview for ${contactName}, using saved details.` : `${triggerMode ? "Choose a person to see their details in the wording. " : ""}Chips show details that will be filled in.`} Nothing is started, saved or sent by this preview.</p>
    {triggerMode && steps.some(beat => beat.anchor === "CALENDAR_DAY" && !beat.plannedAt && !gatedStepIds.includes(beat.id)) && <p className="muted-copy">For starting Beats, Day 0 is {triggerMode === "BROADCAST" ? "the scheduled start date" : triggerMode === "MANUAL_START" ? "the day this Mix starts for the person" : "the date that starts this Mix"}. Later days count from there, not from the previous Beat. Times use {zoneLabel(timezone)}; your scheduling preferences can move a flexible time.</p>}
    {steps.length ? <ol>{steps.map((beat, index) => {
      const channel = beat.stepVersion.stepTemplate.channel, icon = channel === "EMAIL" ? "email" : ["PHONE_CALL", "VOICEMAIL"].includes(channel) ? "phone" : "message";
      const gated = gatedStepIds.includes(beat.id), preview = wording?.[beat.id];
      const timing = gated ? "After a connection" : beat.anchor !== "CALENDAR_DAY" ? describeStepTiming(beat) : beat.plannedAt ? zonedDateTimeLabel(beat.plannedAt, timezone, locale) : `Day ${beat.dayOffset}${beat.sendTimeMinutes === null ? " · your default follow-up time" : ` · ${timeOfDayLabel(beat.sendTimeMinutes, locale)}`}`;
      const content = preview ?? beat.stepVersion;
      return <li key={beat.id}><span className="mix-beat-position">{index + 1}</span><details open={index === 0}>
        <summary><span className="mix-beat-channel"><AppIcon name={icon}/></span><span><strong>{beat.stepVersion.stepTemplate.name}</strong><small>{timing} · {channelName(channel)}</small></span><AppIcon name="chevronDown" /></summary>
        {gated && <p className="muted-copy">This Beat waits for a connected path. Its date depends on when that path reaches it.</p>}
        {beat.anchor !== "CALENDAR_DAY" && <p className="muted-copy">{describeStepReadiness(beat)} An appointment must be linked before its date can be shown.</p>}
        {preview?.recipient && <p className="muted-copy">To: {preview.recipient}</p>}
        {preview?.warnings.map(warning => <p className="muted-copy" key={warning}><MergeFieldText text={warning} title={detailTitle} /></p>)}
        <div className="mix-beat-wording">{content.subject && <strong>{preview ? content.subject : <MergeFieldText text={content.subject} title={detailTitle} />}</strong>}<p>{content.body || content.script ? preview ? content.body || content.script : <MergeFieldText text={content.body || content.script || ""} title={detailTitle} /> : "No wording added yet."}</p></div>
      </details></li>;
    })}</ol> : <p>No Beats yet. Edit this Mix to add one.</p>}
  </section>;
}
