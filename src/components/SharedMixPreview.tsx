import {
  formatSharedMixTime,
  sharedMixChannelIcon,
  sharedMixChannelLabel,
  type SharedMixStep
} from "@/lib/shared-mix";

function dayLabel(offset: number): string {
  if (offset === 0) return "Trigger day";
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
    <div className="shared-mix-sequence" aria-label={`${title} Jump sequence`}>
      {steps.map((step, index) => {
        const time = formatSharedMixTime(step.sendTimeMinutes);
        return (
          <article className="shared-mix-step" key={`${index}-${step.name}`}>
            <span className="shared-mix-step-number">Jump #{index + 1}</span>
            <span className="shared-mix-channel-icon" aria-hidden="true">{sharedMixChannelIcon(step.channel)}</span>
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
            <h4>Jump #{index + 1} · {step.name}</h4>
            <span>{sharedMixChannelLabel(step.channel)}</span>
          </div>
          {step.subject && <p><strong>Subject:</strong> {step.subject}</p>}
          <p className="shared-mix-message">{contentForStep(step)}</p>
        </article>
      ))}
    </div>
  );

  return (
    <div className="shared-mix-preview">
      <div className="shared-mix-trigger-summary">
        <span><strong>Trigger</strong>{triggerMode.replaceAll("_", " ").toLowerCase()}</span>
        {dateTypeName && <span><strong>Target Jump Date Type</strong>{dateTypeName}</span>}
        <span><strong>Length</strong>{durationDays} day{durationDays === 1 ? "" : "s"}</span>
        <span><strong>Jumps</strong>{steps.length}</span>
      </div>
      {summary}
      {expanded ? details : (
        <details className="shared-mix-content-details">
          <summary>Read prepared Jump content</summary>
          {details}
        </details>
      )}
    </div>
  );
}
