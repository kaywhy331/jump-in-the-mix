"use client";
import { useEffect, useState, type ReactNode } from "react";
import { parseDraftSource } from "@/lib/draft-segments";
import { beatWhen, onboardingPreviewValues, type OnboardingPreviewDetails } from "@/lib/onboarding-preview";
import type { OnboardingPreview } from "@/lib/onboarding-preview-schedule";

const CHANNEL_LABEL: Record<string, string> = { SMS: "Text", EMAIL: "Email" };

/** The message as it will be sent; a detail that's still missing shows its stand-in, marked. */
function Message({ source, details }: { source: string; details: OnboardingPreviewDetails }) {
  const { values, standIns } = onboardingPreviewValues(details);
  return <>{parseDraftSource(source, values).map((segment, index) => segment.kind === "token" && standIns.has(segment.token) ? <mark key={index}>{segment.text}</mark> : segment.text)}</>;
}

/** " · Tue, Oct 13 · 10:00 AM": the day and the time each stay whole; nothing until there's a time. */
function When({ at, timezone, locale }: { at: string | null; timezone: string; locale: string }) {
  const when = beatWhen(at, timezone, locale);
  if (!when) return null;
  const [day, time] = when.split(" · ");
  return <> · <span className="onboarding-preview-time">{day}</span> · <span className="onboarding-preview-time">{time}</span></>;
}

/**
 * The first follow-up as onboarding will start it, filled in from the form, with each Beat dated by the scheduler from the
 * chosen day (JITM-09 §2.20, D73). `onAvailable` tells the form whether there is a follow-up to start; `children` follow
 * the message (the signature).
 */
export function StarterPreview({ reason, businessType, scenarioId, details, firstDate, timezone, locale, onAvailable, children }: { reason: string; businessType: string; scenarioId?: string; details: OnboardingPreviewDetails; firstDate: string; timezone: string; locale: string; onAvailable: (available: boolean) => void; children?: ReactNode }) {
  const params = new URLSearchParams({ reason, business: businessType, use: "business" });
  if (scenarioId) params.set("scenario", scenarioId);
  const planKey = params.toString();
  params.set("date", firstDate); params.set("timezone", timezone);
  const key = params.toString();
  // A new date or timezone keeps the message on screen and shows the times once the scheduler has dated them.
  const [loaded, setLoaded] = useState<{ key: string; planKey: string; preview: OnboardingPreview } | null>(null);
  const [failed, setFailed] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/onboarding/preview?${key}`, { cache: "no-store", signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error("Unavailable");
      const { preview } = await response.json() as { preview: OnboardingPreview | null };
      if (!preview?.steps.length) throw new Error("Unavailable");
      if (!controller.signal.aborted) { setLoaded({ key, planKey, preview }); setFailed(""); }
    }).catch(() => { if (!controller.signal.aborted) setFailed(key); });
    return () => controller.abort();
  }, [key, planKey, retry]);
  const preview = loaded?.planKey === planKey ? loaded.preview : undefined;
  const dated = loaded?.key === key;
  useEffect(() => { onAvailable(Boolean(preview)); }, [preview, onAvailable]);
  const [first, ...later] = preview?.steps ?? [];
  const person = details.firstName.trim();
  return <section className="onboarding-preview" aria-label="Preview of the first follow-up">
    <h2>{person ? `${person}’s first follow-up` : "Their first follow-up"}</h2>
    {failed === key ? <p id="starter-preview-status" role="alert">The preview is unavailable. <button type="button" className="text-button" onClick={() => { setFailed(""); setRetry(value => value + 1); }}>Retry preview</button></p> : !preview || !first ? <p id="starter-preview-status" role="status">Preparing the preview…</p> : <>
      <h3>{preview.title}</h3>
      <p className="onboarding-preview-when">{CHANNEL_LABEL[first.channel] ?? "Call"}<When at={dated ? first.at : null} timezone={timezone} locale={locale} /></p>
      {first.subject && <p className="onboarding-preview-subject">Subject: <Message source={first.subject} details={details} /></p>}
      <p className="speech-bubble onboarding-preview-message"><Message source={first.body ?? first.script ?? ""} details={details} /></p>
      {children}
      {later.length > 0 && <ol className="onboarding-preview-later" aria-label="Then">{later.map((step, index) => <li key={index}>Then {CHANNEL_LABEL[step.channel]?.toLowerCase() ?? "call"}: <strong>{step.name}</strong><When at={dated ? step.at : null} timezone={timezone} locale={locale} /></li>)}</ol>}
      <p className="onboarding-preview-note">{onboardingPreviewValues(details).standIns.size ? "Highlighted words fill in when you add those details. " : ""}You review each message in Today before you send it.</p>
    </>}
    <input type="hidden" name="starterPreviewAvailable" value={preview ? "1" : "0"} data-form-guard-ignore />
  </section>;
}
