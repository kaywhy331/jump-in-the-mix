"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { joinWaitlistFormAction } from "@/lib/waitlist-actions";
import { marketingScenarioId } from "@/lib/marketing-scenarios";

function Submit() {
  const { pending } = useFormStatus();
  return <button className="button primary" type="submit" disabled={pending}>{pending ? "Sending…" : "Join the waitlist"}</button>;
}

export function WaitlistForm({ scenarioId }: { scenarioId?: string } = {}) {
  const [scenario, setScenario] = useState(() => marketingScenarioId(scenarioId));
  const [state, action] = useActionState(joinWaitlistFormAction, { status: "idle" as const });
  useEffect(() => {
    const update = (event: Event) => setScenario(marketingScenarioId((event as CustomEvent<{ scenario?: string }>).detail?.scenario));
    window.addEventListener("jitm:scenario", update);
    return () => window.removeEventListener("jitm:scenario", update);
  }, []);
  return <form action={action} className="form-stack">
    {scenario && <input type="hidden" name="scenario" value={scenario} />}
    <div aria-live="polite">{state.status === "error" && <p className="inline-form-error">{state.message}</p>}{state.status === "submitted" && <p className="inline-form-success">{state.message}</p>}</div>
    <label className="field"><span>Email address</span><input name="email" type="email" autoComplete="email" maxLength={254} defaultValue={state.email} aria-invalid={state.status === "error" || undefined} required /></label>
    <Submit />
  </form>;
}
