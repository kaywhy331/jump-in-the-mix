"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AppIcon } from "@/components/AppIcon";
import type { JumpStateDetail } from "@/components/JumpWorkflow";
import { Sheet } from "@/components/Sheet";
import { assignMixToContactAction } from "@/lib/contact-mix-actions";
import { setNoMixNeededAction } from "@/lib/contact-no-mix-actions";
import type { MixEndQuestion } from "@/lib/mix-end-question";

/**
 * Asks what's next when the owner finishes the last Beat of a Mix with nothing after it (JITM-09 §2.77): add the
 * person to a Mix, schedule a one-time follow-up, or confirm No Mix needed. Closing it changes nothing, so the person
 * stays No Mix. It lives outside the list, so Today's refresh after the outcome doesn't take the question away.
 */
export function MixEndPrompt({ mixes, todayKey, address, viewOnly = false }: { mixes: Array<{ id: string; name: string }>; todayKey: string; address: string; viewOnly?: boolean }) {
  const [question, setQuestion] = useState<(MixEndQuestion & { jumpId: string }) | null>(null);
  const [target, setTarget] = useState<HTMLElement | null>(null);
  useEffect(() => setTarget(document.getElementById("follow-up-confirmations")), []);
  // An answer returns to Today with its notice in the address; the question has been dealt with.
  useEffect(() => setQuestion(null), [address]);
  useEffect(() => {
    const onState = (event: Event) => {
      const detail = (event as CustomEvent<JumpStateDetail>).detail;
      if (!detail) return;
      if (detail.mixEnd) setQuestion({ ...detail.mixEnd, jumpId: detail.jumpId });
      // Undo reopened the Beat, so the Mix hasn't ended after all.
      else if (detail.status === "PENDING") setQuestion(current => current?.jumpId === detail.jumpId ? null : current);
    };
    window.addEventListener("jitm:jump-state", onState);
    return () => window.removeEventListener("jitm:jump-state", onState);
  }, []);
  if (!question) return null;

  const { contactId, contactName, mixName, stillInMix, oneTimeFollowUp } = question;
  // Only what is true (JITM-09 §2.25): a one-time follow-up still reminds the owner, though it isn't a Mix.
  const status = stillInMix ? "They’re still in another Mix." : oneTimeFollowUp ? "No Mix has more for them. A one-time follow-up is still coming." : "Nothing else will remind you about them.";
  const card = <section className="mix-end-question" aria-label={`What’s next for ${contactName}`} data-mix-end={contactId}>
    <p role="status"><strong>{mixName} is finished for {contactName}.</strong><small>{status}</small></p>
    <div className="mix-end-question-actions">
      <Sheet trigger={<button type="button" className="button small primary">What’s next?</button>} title={`What’s next for ${contactName}`} description={stillInMix ? undefined : "No Mix has work to come for this person."}>
        {mixes.length > 0 ? <form action={assignMixToContactAction} className="form-stack">
          <input type="hidden" name="contactId" value={contactId} /><input type="hidden" name="returnTo" value="/jumps" />
          <label className="field"><span>Choose a Mix</span><select name="mixId" required>{mixes.map(mix => <option value={mix.id} key={mix.id}>{mix.name}</option>)}</select></label>
          <label className="field"><span>Start on</span><input type="date" name="startDate" required min={todayKey} defaultValue={todayKey} /></label>
          <button className="button primary" type="submit" disabled={viewOnly}>Start Mix</button>
        </form> : <p>Create a Mix first. <Link href="/mixes">Go to Mixes</Link></p>}
        <Link className="button" href={`/contacts?intent=one-time-jump&people=${encodeURIComponent(contactId)}&q=${encodeURIComponent(contactName)}`}>Schedule a one-time follow-up</Link>
        {!stillInMix && <form action={setNoMixNeededAction} className="form-stack contact-no-mix-form">
          <input type="hidden" name="contactIds" value={contactId} /><input type="hidden" name="returnTo" value="/jumps" />
          <p className="muted-copy">Doesn’t need follow-ups from a Mix? Confirm it so they leave the No Mix list. It clears itself if they join a Mix later.</p>
          <button className="button" type="submit" disabled={viewOnly}>Mark No Mix needed</button>
        </form>}
      </Sheet>
      <button type="button" className="icon-button" aria-label={`Not now: leave ${contactName} as they are`} onClick={() => setQuestion(null)}><AppIcon name="close" /></button>
    </div>
  </section>;
  return target ? createPortal(card, target) : card;
}
