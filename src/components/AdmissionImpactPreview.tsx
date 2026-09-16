"use client";
import { useEffect, useRef, useState } from "react";
export function AdmissionImpactPreview({ accounts, outstanding, currentRemaining }: { accounts: number; outstanding: number; currentRemaining: number }) {
  const target = useRef<HTMLDivElement>(null);
  const [proposed, setProposed] = useState<{ remaining: number; paused: string[] } | null>(null);
  useEffect(() => {
    const form = target.current?.closest("form");
    if (!form) return;
    function update() {
      const data = new FormData(form!);
      const total = Number(data.get("accountCeiling")), reservations = Number(data.get("outstandingCeiling"));
      const states = [["collectionPaused", "New waitlist requests"], ["grantsPaused", "All new customer invitations"], ["referralsPaused", "Member referrals"], ["redemptionPaused", "Account creation from issued invitations"]];
      setProposed({ remaining: Math.max(0, Math.min(total - accounts - outstanding, reservations - outstanding)), paused: states.filter(([name]) => data.get(name) === "on").map(([, label]) => label) });
    }
    update(); form.addEventListener("input", update); form.addEventListener("change", update);
    return () => { form.removeEventListener("input", update); form.removeEventListener("change", update); };
  }, [accounts, outstanding]);
  return <div className="notice info" ref={target} aria-live="polite"><strong>Review proposed impact</strong>{proposed ? <><p>{currentRemaining} currently available → {proposed.remaining} spaces under the proposed limits.</p><p>{proposed.paused.length ? `Paused after saving: ${proposed.paused.join("; ")}.` : "All four admission pause controls would be open."}</p></> : <p>Review the proposed limits and pauses before saving.</p>}<small>This estimate uses the current reservation counts. The server checks current authorization and configuration again when you save. Existing accounts and invitations are retained.</small></div>;
}
