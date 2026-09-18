"use client";
import { useEffect, useRef, useState } from "react";
export function AdmissionImpactPreview({ accounts, outstanding, currentRemaining }: { accounts: number; outstanding: number; currentRemaining: number }) {
  const target = useRef<HTMLDivElement>(null);
  const [proposed, setProposed] = useState<{ remaining: number; paused: string[]; flags: Record<string, boolean> } | null>(null);
  useEffect(() => {
    const form = target.current?.closest("form");
    if (!form) return;
    function update() {
      const data = new FormData(form!);
      const total = Number(data.get("accountCeiling")), reservations = Number(data.get("outstandingCeiling"));
      const states = [["collectionPaused", "New waitlist requests"], ["grantsPaused", "All new customer invitations"], ["referralsPaused", "Member referrals"], ["redemptionPaused", "Account creation from issued invitations"]];
      setProposed({ remaining: Math.max(0, Math.min(total - accounts - outstanding, reservations - outstanding)), flags: Object.fromEntries(states.map(([name]) => [name, data.get(name) === "on"])), paused: states.filter(([name]) => data.get(name) === "on").map(([, label]) => label) });
    }
    update(); form.addEventListener("input", update); form.addEventListener("change", update);
    return () => { form.removeEventListener("input", update); form.removeEventListener("change", update); };
  }, [accounts, outstanding]);
  return <div className="notice info" ref={target} aria-live="polite">{proposed ? <details><summary><strong>After saving: </strong>{currentRemaining} → {proposed.remaining} spaces · {proposed.paused.length} pause controls on · Review effects</summary><p>{proposed.paused.length ? `Paused after saving: ${proposed.paused.join("; ")}.` : "No pauses enabled."}</p><table><caption>Effect of these settings</caption><thead><tr><th scope="col">Activity</th><th scope="col">After saving</th></tr></thead><tbody>{[
      ["New waitlist requests", proposed.flags.collectionPaused ? "Paused" : "Can be submitted"],
      ["New waitlist email grants", proposed.flags.grantsPaused ? "Paused" : proposed.remaining <= 0 ? "No reservation capacity" : "Subject to eligibility and sending readiness"],
      ["New member referrals", proposed.flags.grantsPaused || proposed.flags.referralsPaused ? "Paused" : "Use separate member invitation allowances"],
      ["Emails already queued", "Continue under delivery and recipient checks; these switches do not cancel them"],
      ["Account creation from issued invitations", proposed.flags.redemptionPaused ? "Paused until redemption resumes" : "Valid, unused links can be accepted"],
      ["Existing account sign-in", "Continues; these controls do not suspend accounts"]
    ].map(([activity, effect]) => <tr key={activity}><th scope="row">{activity}</th><td>{effect}</td></tr>)}</tbody></table></details> : <p>Review the proposed limits and pauses before saving.</p>}</div>;
}
