"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AppIcon } from "@/components/AppIcon";
import { FormSubmitButton } from "@/components/FormSubmitButton";
import type { JumpStateDetail } from "@/components/JumpWorkflow";
import { Sheet } from "@/components/Sheet";
import { assignMixToContactAction } from "@/lib/contact-mix-actions";
import { oneMixStartSentence } from "@/lib/contact-mix-status-labels";
import { setNoMixNeededAction } from "@/lib/contact-no-mix-actions";
import type { MixEndQuestion } from "@/lib/mix-end-question";

/**
 * Asks what's next when the owner finishes the last Beat of a Mix with nothing after it, and the person is left
 * with no Mix (JITM-09 §2.77, D48): add the
 * person to a Mix, schedule a one-time follow-up, or confirm No Mix needed. Closing it changes nothing, so the person
 * stays No Mix. It lives outside the list, so Today's refresh after the outcome doesn't take the question away.
 */
export function MixEndPrompt({ mixes, todayKey, address, viewOnly = false }: { mixes: Array<{ id: string; name: string; triggerMode: string; startedByOwner: boolean }>; todayKey: string; address: string; viewOnly?: boolean }) {
  const [question, setQuestion] = useState<(MixEndQuestion & { jumpId: string }) | null>(null);
  const [choice, setChoice] = useState("");
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  // An answer returns to Today with its notice in the address; the question has been dealt with.
  useEffect(() => setQuestion(null), [address]);
  useEffect(() => {
    const onState = (event: Event) => {
      const detail = (event as CustomEvent<JumpStateDetail>).detail;
      if (!detail) return;
      if (detail.mixEnd) {
        const finished = detail.mixEnd.mixId;
        setQuestion({ ...detail.mixEnd, jumpId: detail.jumpId });
        // Another Mix the owner starts comes first. A date-based or fixed-date Mix is never preselected: starting it
        // here would save the start day as their date, or send a fixed date's Beats late (END-02).
        setChoice(mixes.find(mix => mix.startedByOwner && mix.id !== finished)?.id ?? "");
      }
      // Undo reopened the Beat, so the Mix hasn't ended after all.
      else if (detail.status === "PENDING") setQuestion(current => current?.jumpId === detail.jumpId ? null : current);
    };
    window.addEventListener("jitm:jump-state", onState);
    return () => window.removeEventListener("jitm:jump-state", onState);
  }, [mixes]);
  // The question goes after the stack's list of confirmations, such as the 10-second Undo for the same outcome, so they
  // stay in view above it and come first to keyboard and screen-reader users too, even ones that arrive later (LAY-02,
  // A11Y-02, A11Y-03).
  const questionId = question?.jumpId;
  useEffect(() => {
    const target = questionId ? document.getElementById("follow-up-confirmations") : null;
    if (!target) return;
    const element = document.createElement("div");
    element.className = "mix-end-slot";
    target.append(element);
    setSlot(element);
    return () => { element.remove(); setSlot(null); };
  }, [questionId]);
  if (!question) return null;

  const { contactId, contactName, mixName, oneTimeFollowUp } = question;
  const chosen = mixes.find(mix => mix.id === choice);
  // Closing it leaves the person as they are, and keyboard focus moves on rather than to the page (UX-02).
  const close = () => {
    // An Undo may float or sit inside the review Today opened.
    const next = document.querySelector<HTMLElement>("[data-follow-up-undo] button") ?? document.querySelector<HTMLElement>(".today-page-header h1");
    setQuestion(null);
    requestAnimationFrame(() => next?.focus());
  };
  // Only what is true (JITM-09 §2.25, D44): a one-time follow-up still reminds the owner, though it isn't a Mix.
  const status = `No Mix will remind you about them.${oneTimeFollowUp ? " A one-time follow-up is still coming." : ""}`;
  const card = <section className="mix-end-question" aria-label={`What’s next for ${contactName}`} data-mix-end={contactId}>
    <p role="status"><strong>{mixName} is finished for {contactName}.</strong><small>{status}</small></p>
    <div className="mix-end-question-actions">
      <Sheet trigger={<button type="button" className="button small primary">What’s next?</button>} title={`What’s next for ${contactName}`} description="No Mix has work to come for this person.">
        {mixes.length > 0 ? <form action={assignMixToContactAction} className="form-stack">
          <input type="hidden" name="contactId" value={contactId} /><input type="hidden" name="returnTo" value="/jumps" />
          <label className="field"><span>Choose a Mix</span><select name="mixId" required value={choice} onChange={event => setChoice(event.target.value)}><option value="" disabled>Choose a Mix</option>{mixes.map(mix => <option value={mix.id} key={mix.id}>{mix.name}</option>)}</select></label>
          <label className="field"><span>Start on</span><input type="date" name="startDate" required min={todayKey} defaultValue={todayKey} aria-describedby={chosen ? "mixEndStartHint" : undefined} />{chosen && <small id="mixEndStartHint">{oneMixStartSentence(chosen.triggerMode)}</small>}</label>
          <FormSubmitButton label="Start Mix" pendingLabel="Starting…" disabled={viewOnly} />
        </form> : <p>Create a Mix first. <Link href="/mixes">Go to Mixes</Link></p>}
        <Link className="button" href={`/contacts?intent=one-time-jump&people=${encodeURIComponent(contactId)}&q=${encodeURIComponent(contactName)}`}>Schedule a one-time follow-up</Link>
        <form action={setNoMixNeededAction} className="form-stack contact-no-mix-form">
          <input type="hidden" name="contactIds" value={contactId} /><input type="hidden" name="returnTo" value="/jumps" />
          <p className="muted-copy">Doesn’t need follow-ups from a Mix? Confirm it so they leave the No Mix list. It clears itself if they join a Mix later.</p>
          <FormSubmitButton label="Mark No Mix needed" pendingLabel="Saving…" className="button" disabled={viewOnly} />
        </form>
      </Sheet>
      <button type="button" className="icon-button" aria-label={`Not now: leave ${contactName} as they are`} onClick={close}><AppIcon name="close" /></button>
    </div>
  </section>;
  return slot ? createPortal(card, slot) : null;
}
