"use client";

import { useFormStatus } from "react-dom";
import { joinWaitlistAction } from "@/lib/waitlist-actions";

function Submit() {
  const { pending } = useFormStatus();
  return <button className="button primary" type="submit" disabled={pending}>{pending ? "Sending…" : "Join the waitlist"}</button>;
}

export function WaitlistForm() {
  return <form action={joinWaitlistAction} className="form-stack">
    <label className="field"><span>Email address</span><input name="email" type="email" autoComplete="email" maxLength={254} required /></label>
    <Submit />
    <small>Free account. Confirm your email to enter the waitlist. We’ll email you when you’re invited.</small>
  </form>;
}
