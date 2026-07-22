"use client";

import { useState } from "react";
import type { Channel } from "@/generated/prisma/client";
import type { AiMixGeneratedDraft } from "@/lib/ai-mix";
import { formatTimeInput } from "@/lib/mix-broadcast";
import { sharedMixChannelLabel } from "@/lib/shared-mix";
import styles from "@/components/MixEditor.module.css";

type ReviewStep = AiMixGeneratedDraft["steps"][number] & { key: string; keep: boolean };

function newStep(index: number, channel: Channel): ReviewStep {
  const messageChannel = ["EMAIL", "SMS", "WHATSAPP"].includes(channel);
  return {
    key: `new-${Date.now()}-${index}-${Math.random().toString(36).slice(2)}`,
    keep: true,
    name: `Follow-up action ${index + 1}`,
    channel,
    dayOffset: 0,
    sendTimeMinutes: 600,
    subject: channel === "EMAIL" ? "A quick follow-up" : null,
    body: messageChannel ? "Hi {{First Name}}, I wanted to follow up." : null,
    script: messageChannel ? null : "Review the relationship context and ask an open question about the next step.",
    longSms: false,
    includeOptOut: false
  };
}

export function AiMixReviewSteps({
  initialSteps,
  allowedChannels,
  durationDays
}: {
  initialSteps: AiMixGeneratedDraft["steps"];
  allowedChannels: Channel[];
  durationDays: number;
}) {
  const [steps, setSteps] = useState<ReviewStep[]>(() => initialSteps.map((step, index) => ({ ...step, key: `existing-${index}-${step.name}`, keep: true })));
  const [dragging, setDragging] = useState<number | null>(null);
  const [target, setTarget] = useState<number | null>(null);

  const update = (index: number, patch: Partial<ReviewStep>) => setSteps((current) => current.map((step, itemIndex) => itemIndex === index ? { ...step, ...patch } : step));
  const reorder = (from: number, to: number) => setSteps((current) => {
    if (from === to || from < 0 || to < 0 || from >= current.length || to >= current.length) return current;
    const next = [...current];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    return next;
  });
  const add = () => {
    if (steps.length >= 7) return;
    setSteps((current) => [...current, newStep(current.length, allowedChannels[0] ?? "EMAIL")]);
  };
  const remove = (index: number) => setSteps((current) => current.filter((_, itemIndex) => itemIndex !== index));

  return (
    <>
      <input type="hidden" name="stepCount" value={steps.length} />
      <div className="card-header"><div><h2>Edit prepared actions</h2><p>Add, remove, drag, reorder, or rewrite actions. The order shown here becomes the Mix order.</p></div><button className="button primary" type="button" onClick={add} disabled={steps.length >= 7}>+ Add action</button></div>
      <div className={`ai-draft-step-list ${styles.sequenceList}`}>
        {steps.map((step, index) => {
          const messageChannel = ["EMAIL", "SMS", "WHATSAPP"].includes(step.channel);
          const scriptChannel = ["PHONE_CALL", "VOICEMAIL"].includes(step.channel);
          return (
            <fieldset
              className={`ai-draft-step-card ${styles.sequenceCard} ${dragging === index ? styles.dragging : ""} ${target === index ? styles.dropTarget : ""}`}
              key={step.key}
              onDragOver={(event) => { event.preventDefault(); setTarget(index); }}
              onDrop={(event) => { event.preventDefault(); if (dragging !== null) reorder(dragging, index); setDragging(null); setTarget(null); }}
            >
              <legend>Action #{index + 1} · {sharedMixChannelLabel(step.channel)}</legend>
              <div className={styles.sequenceHeading}>
                <button className={styles.dragHandle} type="button" draggable onDragStart={() => setDragging(index)} onDragEnd={() => { setDragging(null); setTarget(null); }} onKeyDown={(event) => { if (event.key === "ArrowUp") { event.preventDefault(); reorder(index, index - 1); } if (event.key === "ArrowDown") { event.preventDefault(); reorder(index, index + 1); } }} aria-label={`Reorder AI action ${index + 1}`}>⋮⋮ Drag to reorder</button>
                <button className="button small danger" type="button" onClick={() => remove(index)} disabled={steps.length === 1}>Remove</button>
              </div>
              <input type="hidden" name={`stepKeep-${index}`} value={step.keep ? "on" : ""} />
              <div className="form-grid">
                <div className="field full"><label htmlFor={`stepName-${index}`}>Action name</label><input id={`stepName-${index}`} name={`stepName-${index}`} value={step.name} onChange={(event) => update(index, { name: event.target.value })} maxLength={160} required /></div>
                <div className="field"><label htmlFor={`stepChannel-${index}`}>Channel</label><select id={`stepChannel-${index}`} name={`stepChannel-${index}`} value={step.channel} onChange={(event) => { const channel = event.target.value as Channel; update(index, { channel, subject: channel === "EMAIL" ? step.subject || "A quick follow-up" : null, body: ["EMAIL", "SMS", "WHATSAPP"].includes(channel) ? step.body || "Hi {{First Name}}, I wanted to follow up." : null, script: ["PHONE_CALL", "VOICEMAIL"].includes(channel) ? step.script || "Review the relationship context and ask an open question." : null }); }}>{allowedChannels.map((channel) => <option key={channel} value={channel}>{sharedMixChannelLabel(channel)}</option>)}</select></div>
                <div className="field"><label htmlFor={`stepDayOffset-${index}`}>Day offset</label><input id={`stepDayOffset-${index}`} name={`stepDayOffset-${index}`} type="number" min={-durationDays} max={durationDays} value={step.dayOffset} onChange={(event) => update(index, { dayOffset: Number(event.target.value) })} required /><small>Negative is before the Important Date or broadcast; manual starts use zero or later.</small></div>
                <div className="field"><label htmlFor={`stepSendTime-${index}`}>Preferred local time</label><input id={`stepSendTime-${index}`} name={`stepSendTime-${index}`} type="time" value={formatTimeInput(step.sendTimeMinutes)} onChange={(event) => { const [hour, minute] = event.target.value.split(":").map(Number); update(index, { sendTimeMinutes: Number.isInteger(hour) && Number.isInteger(minute) ? hour * 60 + minute : null }); }} /></div>
                {step.channel === "EMAIL" && <div className="field full"><label htmlFor={`stepSubject-${index}`}>Email subject</label><input id={`stepSubject-${index}`} name={`stepSubject-${index}`} value={step.subject ?? ""} onChange={(event) => update(index, { subject: event.target.value })} maxLength={300} required /></div>}
                {messageChannel && <div className="field full"><label htmlFor={`stepBody-${index}`}>Prepared message</label><textarea id={`stepBody-${index}`} name={`stepBody-${index}`} value={step.body ?? ""} onChange={(event) => update(index, { body: event.target.value, longSms: step.channel === "SMS" && event.target.value.length > 160 })} rows={6} required /></div>}
                {scriptChannel && <div className="field full"><label htmlFor={`stepScript-${index}`}>Phone or voicemail notes</label><textarea id={`stepScript-${index}`} name={`stepScript-${index}`} value={step.script ?? ""} onChange={(event) => update(index, { script: event.target.value })} rows={6} required /></div>}
                <input type="hidden" name={`stepSubject-${index}`} value={step.subject ?? ""} disabled={step.channel === "EMAIL"} />
                <input type="hidden" name={`stepBody-${index}`} value={step.body ?? ""} disabled={messageChannel} />
                <input type="hidden" name={`stepScript-${index}`} value={step.script ?? ""} disabled={scriptChannel} />
                <label className="checkbox-card field full"><input type="checkbox" name={`stepIncludeOptOut-${index}`} checked={step.includeOptOut} onChange={(event) => update(index, { includeOptOut: event.target.checked })} disabled={step.channel !== "SMS"} /><span><strong>SMS opt-out delivery metadata</strong><small>This never inserts automated-marketing language into the prepared message.</small></span></label>
              </div>
            </fieldset>
          );
        })}
      </div>
    </>
  );
}
