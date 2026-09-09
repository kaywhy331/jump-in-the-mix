import {
  formatSharedMixTime,
  sharedMixChannelLabel,
  type SharedMixStep
} from "@/lib/shared-mix";
import { AppIcon, type AppIconName } from "@/components/AppIcon";

function sharedMixChannelIcon(channel: SharedMixStep["channel"]): AppIconName {
  if (channel === "EMAIL") return "email";
  if (channel === "PHONE_CALL" || channel === "VOICEMAIL") return "phone";
  return "message";
}

function dayLabel(offset: number): string {
  if (offset === 0) return "Cue day";
  return offset > 0 ? `${offset} day${offset === 1 ? "" : "s"} after` : `${Math.abs(offset)} day${offset === -1 ? "" : "s"} before`;
}

function contentForStep(step: SharedMixStep): string {
  return step.body ?? step.script ?? "No prepared content";
}

export function SharedMixPreview({
  title,
  triggerMode,
  dateTypeName,
  durationDays,
  steps,
  expanded = false
}: {
  title: string;
  triggerMode: string;
  dateTypeName: string | null;
  durationDays: number;
  steps: SharedMixStep[];
  expanded?: boolean;
}) {
  const summary = (
    <div className="shared-mix-sequence" aria-label={`${title} follow-up sequence`}>
      {steps.map((step, index) => {
        const time = formatSharedMixTime(step.sendTimeMinutes);
        return (
          <article className="shared-mix-step" key={`${index}-${step.name}`}>
            <span className="shared-mix-step-number">Beat {index + 1}</span>
            <span className="shared-mix-channel-icon"><AppIcon name={sharedMixChannelIcon(step.channel)} /></span>
            <span className="shared-mix-step-copy">
              <strong>{step.name}</strong>
              <small>{sharedMixChannelLabel(step.channel)} · {dayLabel(step.dayOffset)}{time ? ` · ${time}` : ""}</small>
            </span>
          </article>
        );
      })}
    </div>
  );

  const details = (
    <div className="shared-mix-content-list">
      {steps.map((step, index) => (
        <article className="shared-mix-content-card" key={`${index}-${step.name}-content`}>
          <div className="section-label">
            <h4>Beat {index + 1} · {step.name}</h4>
            <span>{sharedMixChannelLabel(step.channel)}</span>
          </div>
          {step.subject && <p><strong>Subject:</strong> {step.subject}</p>}
          <p className={`shared-mix-message ${step.channel === "PHONE_CALL" || step.channel === "VOICEMAIL" ? "conversation-note" : "speech-bubble"}`}>{contentForStep(step)}</p>
        </article>
      ))}
    </div>
  );

  return (
    <div className="shared-mix-preview">
      <div className="shared-mix-trigger-summary">
        <span><strong>Cue · starts</strong>{triggerMode === "DATE_TRIGGERED" ? "from a date" : triggerMode === "MANUAL_START" ? "when you choose" : "on one date"}</span>
        {dateTypeName && <span><strong>Starts from</strong>{dateTypeName}</span>}
        <span><strong>Tempo · span</strong>{durationDays} day{durationDays === 1 ? "" : "s"}</span>
        <span><strong>Beats</strong>{steps.length}</span>
      </div>
      {summary}
      {expanded ? details : (
        <details className="shared-mix-content-details">
          <summary>Read prepared messages</summary>
          {details}
        </details>
      )}
    </div>
  );
}
