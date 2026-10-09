"use client";
import { useEffect, useState } from "react";
import type { ReadyMadePlan } from "@/lib/plan-library-types";
import type { OnboardingUse } from "@/lib/onboarding-options";
import { timeOfDayLabel } from "@/lib/display-labels";

export function StarterPreview({ purposes, reason, businessType, scenarioId }: { purposes: OnboardingUse[]; reason: string; businessType: string; scenarioId?: string }) {
  const params = new URLSearchParams({ reason, business: businessType });
  purposes.forEach(value => params.append("use", value));
  if (scenarioId) params.set("scenario", scenarioId);
  const key = params.toString();
  const [state, setState] = useState<{ key: string; plan?: ReadyMadePlan; error?: boolean }>({ key: "" });
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); setState({ key });
    fetch(`/api/onboarding/preview?${key}`, { cache: "no-store", signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error("Unavailable");
      const { plan } = await response.json(); if (!plan) throw new Error("Unavailable");
      if (!controller.signal.aborted) setState({ key, plan });
    }).catch(() => { if (!controller.signal.aborted) setState({ key, error: true }); });
    return () => controller.abort();
  }, [key, retry]);
  const plan = state.key === key ? state.plan : undefined;
  return <section className="onboarding-preview" aria-label="Review your starter">
    <h2>Review your first Mix</h2>
    {state.error ? <p role="alert">The starter preview is unavailable. <button type="button" onClick={() => setRetry(value => value + 1)}>Retry preview</button></p> : !plan ? <p role="status">Loading your starter…</p> : <>
      <h3>{plan.title}</h3><p>{plan.description}</p>
      <ol>{plan.steps.map((step, index) => <li key={index}><strong>{step.name}</strong><p>{step.channel === "EMAIL" ? "Email" : step.channel === "SMS" ? "Text" : "Call"} · {step.dayOffset === 0 ? "Your chosen day" : `${step.dayOffset} ${step.dayOffset === 1 ? "day" : "days"} after`} · {timeOfDayLabel(step.sendTimeMinutes)} your time</p>{step.subject && <p>Subject: {step.subject}</p>}<blockquote>{step.body ?? step.script}</blockquote></li>)}</ol>
      <p>Names and signatures fill from your details. Your timing preferences can move reminders. Review each prepared message in Today before sending. You can change or pause this Mix after setup.</p>
    </>}
    <label className="checkbox-card"><input name="starterReviewed" type="checkbox" required disabled={!plan} key={key} /><span>I reviewed this Mix and its timing.</span></label>
    <input type="hidden" name="starterPreviewAvailable" value={plan ? "1" : "0"} data-form-guard-ignore />
  </section>;
}
