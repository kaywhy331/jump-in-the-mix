import { AppIcon } from "@/components/AppIcon";
import { describeStepTiming } from "@/lib/step-timing";
import { channelName, timeOfDayLabel } from "@/lib/display-labels";
import { formatDateTime } from "@/lib/format";
import { MergeFieldText } from "@/components/MergeFieldText";
import type { StepAnchor } from "@/generated/prisma/client";

type Beat = { id: string; plannedAt: Date | null; dayOffset: number; sendTimeMinutes: number | null; anchor: StepAnchor; offsetMinutes: number | null; stepVersion: { subject: string | null; body: string | null; script: string | null; stepTemplate: { name: string; channel: string } } };
export function MixBeatPreview({ steps, gatedStepIds, timezone, locale }: { steps: Beat[]; gatedStepIds: string[]; timezone: string; locale: string }) {
  return <section className="mix-beat-preview" aria-label="Beat preview"><div className="mix-beat-preview-heading"><h3>Beats</h3><span>{steps.length}</span></div>
    {steps.length ? <ol>{steps.map((beat, index) => {
      const channel = beat.stepVersion.stepTemplate.channel, icon = channel === "EMAIL" ? "email" : ["PHONE_CALL", "VOICEMAIL"].includes(channel) ? "phone" : "message";
      const timing = gatedStepIds.includes(beat.id) ? "After a connection" : beat.plannedAt ? formatDateTime(beat.plannedAt, { locale, timeZone: timezone }, { year: "numeric" }) : beat.anchor === "CALENDAR_DAY" ? `Day ${beat.dayOffset}${beat.sendTimeMinutes === null ? "" : ` · ${timeOfDayLabel(beat.sendTimeMinutes, locale)}`}` : describeStepTiming({ anchor: beat.anchor, offsetMinutes: beat.offsetMinutes });
      return <li key={beat.id}><span className="mix-beat-position">{index + 1}</span><details open={index === 0}><summary><span className="mix-beat-channel"><AppIcon name={icon}/></span><span><strong>{beat.stepVersion.stepTemplate.name}</strong><small>{timing} · {channelName(channel)}</small></span><AppIcon name="chevronDown" /></summary><div className="mix-beat-wording">{beat.stepVersion.subject && <strong>{beat.stepVersion.subject}</strong>}<p>{beat.stepVersion.body || beat.stepVersion.script ? <MergeFieldText text={beat.stepVersion.body || beat.stepVersion.script || ""} /> : "No wording added yet."}</p></div></details></li>;
    })}</ol> : <p>No Beats yet. Edit this Mix to add one.</p>}
  </section>;
}
