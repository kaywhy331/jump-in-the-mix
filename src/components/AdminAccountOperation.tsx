"use client";
import { useEffect, useRef, useState } from "react";
import { FormSubmitButton } from "@/components/FormSubmitButton";
export function AdminAccountOperation({ email }: { email: string }) {
  const marker = useRef<HTMLDivElement>(null); const [operation, setOperation] = useState("");
  useEffect(() => { const form = marker.current?.closest("form"); const select = form?.querySelector<HTMLSelectElement>('select[name="operation"]'); if (!select) return; const update = () => setOperation(select.value); update(); const frame = requestAnimationFrame(update); form!.addEventListener("change", update); return () => { cancelAnimationFrame(frame); form!.removeEventListener("change", update); }; }, []);
  const label = operation === "suspend" ? "Suspend account" : operation === "restore" ? "Restore account access" : "End all sessions";
  return <div ref={marker}><p><strong>{label}: {email}</strong></p><ul>{(operation === "suspend" ? ["Current sessions end and unused referrals are revoked.", "Automatic sending and reminders switch off.", "Messages already handed to a provider may still arrive."] : operation === "restore" ? ["The member can sign in again.", "Sending and reminders stay off until the member enables them.", "Revoked invitations are not restored."] : ["Current sessions and existing email sign-in links stop working.", "The member can sign in again using their existing credentials."]).map(text => <li key={text}>{text}</li>)}</ul><FormSubmitButton label={label} pendingLabel="Applying change…" /></div>;
}
