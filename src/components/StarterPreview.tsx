"use client";
import { useEffect, useState, type ReactNode } from "react";
import type { ReadyMadePlan } from "@/lib/plan-library-types";
import { parseDraftSource } from "@/lib/draft-segments";
import { beatWhen, onboardingPreviewValues, type OnboardingPreviewDetails } from "@/lib/onboarding-preview";

const CHANNEL_LABEL: Record<string, string> = { SMS: "Text", EMAIL: "Email" };

/** The message as it will be sent; a detail that's still missing shows its stand-in, marked. */
function Message({ source, details }: { source: string; details: OnboardingPreviewDetails }) {
  const { values, standIns } = onboardingPreviewValues(details);
  return <>{parseDraftSource(source, values).map((segment, index) => segment.kind === "token" && standIns.has(segment.token) ? <mark key={index}>{segment.text}</mark> : segment.text)}</>;
}

/**
 * The first follow-up the starter prepares, filled in from the form and dated from the chosen day (JITM-09 §2.20, D73).
 * `onAvailable` tells the form whether there is a starter to start; `children` follow the message (the signature).
 */
export function StarterPreview({ reason, businessType, scenarioId, details, firstDate, locale, onAvailable, children }: { reason: string; businessType: string; scenarioId?: string; details: OnboardingPreviewDetails; firstDate: string; locale: string; onAvailable: (available: boolean) => void; children?: ReactNode }) {
  const params = new URLSearchParams({ reason, business: businessType, use: "business" });
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
  useEffect(() => { onAvailable(Boolean(plan)); }, [plan, onAvailable]);
  const [first, ...later] = plan?.steps ?? [];
  const person = details.personName.trim().split(/\s+/)[0];
  return <section className="onboarding-preview" aria-label="Preview of the first follow-up">
    <h2>{person ? `${person}’s first follow-up` : "Their first follow-up"}</h2>
    {state.error ? <p id="starter-preview-status" role="alert">The preview is unavailable. <button type="button" className="text-button" onClick={() => setRetry(value => value + 1)}>Retry preview</button></p> : !plan || !first ? <p id="starter-preview-status" role="status">Preparing the preview…</p> : <>
      <h3>{plan.title}</h3>
      <p className="onboarding-preview-when">{CHANNEL_LABEL[first.channel] ?? "Call"} · {beatWhen(firstDate, first.dayOffset, first.sendTimeMinutes, locale)}</p>
      {first.subject && <p className="onboarding-preview-subject">Subject: <Message source={first.subject} details={details} /></p>}
      <p className="speech-bubble onboarding-preview-message"><Message source={first.body ?? first.script ?? ""} details={details} /></p>
      {children}
      {later.length > 0 && <ol className="onboarding-preview-later" aria-label="Then">{later.map((step, index) => <li key={index}>Then {CHANNEL_LABEL[step.channel]?.toLowerCase() ?? "call"}: <strong>{step.name}</strong> · {beatWhen(firstDate, step.dayOffset, step.sendTimeMinutes, locale)}</li>)}</ol>}
      <p className="onboarding-preview-note">{onboardingPreviewValues(details).standIns.size ? "Highlighted words fill in when you add those details. " : ""}You review each message in Today before you send it.</p>
    </>}
    <input type="hidden" name="starterPreviewAvailable" value={plan ? "1" : "0"} data-form-guard-ignore />
  </section>;
}
