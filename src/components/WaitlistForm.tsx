"use client";

import { useActionState, useEffect, useId, useState } from "react";
import { useFormStatus } from "react-dom";
import { joinWaitlistFormAction, type WaitlistFormState } from "@/lib/waitlist-actions";
import { marketingScenarioId } from "@/lib/marketing-scenarios";
import { WAITLIST_EMAIL_REQUESTS_PER_DAY } from "@/lib/waitlist-limits";

function Submit({ submitted }: { submitted: boolean }) {
  const { pending } = useFormStatus();
  return <button className="button primary" type="submit" disabled={pending}>{pending ? "Sending…" : submitted ? "Request confirmation again" : "Join the waitlist"}</button>;
}

export function WaitlistForm({ scenarioId }: { scenarioId?: string } = {}) {
  const errorId = useId();
  const [scenario, setScenario] = useState(() => marketingScenarioId(scenarioId));
  const [state, action] = useActionState(joinWaitlistFormAction, { status: "idle" as const });
  // The server sends at most WAITLIST_EMAIL_REQUESTS_PER_DAY confirmation emails to an address a day and gives
  // every request the same receipt, so this form counts its own requests per address to say when one more
  // cannot send anything. The count is updated while rendering, so a receipt never shows the previous count.
  const [tally, setTally] = useState<{ counted: WaitlistFormState | null; requests: Record<string, number> }>({ counted: null, requests: {} });
  if (state.status === "submitted" && state.email && tally.counted !== state) {
    setTally({ counted: state, requests: { ...tally.requests, [state.email]: (tally.requests[state.email] ?? 0) + 1 } });
  }
  const overLimit = state.status === "submitted" && Boolean(state.email) && (tally.requests[state.email ?? ""] ?? 0) > WAITLIST_EMAIL_REQUESTS_PER_DAY;
  useEffect(() => {
    const current = document.querySelector("[data-marketing-scenario]")?.getAttribute("data-marketing-scenario");
    if (current) setScenario(marketingScenarioId(current));
    const update = (event: Event) => setScenario(marketingScenarioId((event as CustomEvent<{ scenario?: string }>).detail?.scenario));
    window.addEventListener("jitm:scenario", update);
    return () => window.removeEventListener("jitm:scenario", update);
  }, []);
  return <form action={action} className="form-stack">
    {scenario && <input type="hidden" name="scenario" value={scenario} />}
    <div aria-live="polite">{state.status === "error" && <p id={errorId} role="alert" className="inline-form-error">{state.message}</p>}{state.status === "submitted" && (overLimit
      ? <p role="alert" className="inline-form-error">No new email was sent. This address has reached today’s limit of {WAITLIST_EMAIL_REQUESTS_PER_DAY} confirmation emails. Check your spam folder, or request another tomorrow.</p>
      : <p className="inline-form-success">{state.message}</p>)}</div>
    <label className="field"><span>Email address</span><input name="email" type="email" autoComplete="email" maxLength={254} defaultValue={state.email} aria-invalid={state.status === "error" || undefined} aria-describedby={state.status === "error" ? errorId : undefined} required /></label>
    <Submit submitted={state.status === "submitted"} />
    {state.status === "submitted" && <p>Correct the email above to use another address, or request confirmation again. We send up to {WAITLIST_EMAIL_REQUESTS_PER_DAY} confirmation emails to an address each day, so check your spam folder before retrying.</p>}
  </form>;
}
