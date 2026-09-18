"use client";

import { useActionState, useEffect, useId, useState } from "react";
import { useFormStatus } from "react-dom";
import { joinWaitlistFormAction } from "@/lib/waitlist-actions";
import { marketingScenarioId } from "@/lib/marketing-scenarios";

function Submit({ submitted }: { submitted: boolean }) {
  const { pending } = useFormStatus();
  return <button className="button primary" type="submit" disabled={pending}>{pending ? "Sending…" : submitted ? "Request confirmation again" : "Join the waitlist"}</button>;
}

export function WaitlistForm({ scenarioId }: { scenarioId?: string } = {}) {
  const errorId = useId();
  const [scenario, setScenario] = useState(() => marketingScenarioId(scenarioId));
  const [state, action] = useActionState(joinWaitlistFormAction, { status: "idle" as const });
  useEffect(() => {
    const current = document.querySelector("[data-marketing-scenario]")?.getAttribute("data-marketing-scenario");
    if (current) setScenario(marketingScenarioId(current));
    const update = (event: Event) => setScenario(marketingScenarioId((event as CustomEvent<{ scenario?: string }>).detail?.scenario));
    window.addEventListener("jitm:scenario", update);
    return () => window.removeEventListener("jitm:scenario", update);
  }, []);
  return <form action={action} className="form-stack">
    {scenario && <input type="hidden" name="scenario" value={scenario} />}
    <div aria-live="polite">{state.status === "error" && <p id={errorId} role="alert" className="inline-form-error">{state.message}</p>}{state.status === "submitted" && <p className="inline-form-success">{state.message}</p>}</div>
    <label className="field"><span>Email address</span><input name="email" type="email" autoComplete="email" maxLength={254} defaultValue={state.email} aria-invalid={state.status === "error" || undefined} aria-describedby={state.status === "error" ? errorId : undefined} required /></label>
    <Submit submitted={state.status === "submitted"} />
    {state.status === "submitted" && <p>Correct the email above to use another address, or request confirmation again. Check your spam folder before retrying.</p>}
  </form>;
}
