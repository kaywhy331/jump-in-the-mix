"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { AppIcon, type AppIconName } from "@/components/AppIcon";
import type { PreparationFamily } from "@/lib/preparation-family";

export type ChannelChoiceOption = { family: PreparationFamily; label: string; icon: AppIconName; unavailable?: string; recommended?: boolean };

/**
 * The compact choice between a follow-up's text, email and call versions. Every option stays
 * visible; one the person can't receive is greyed out with the reason in plain text, and the
 * version Today opens on carries a "Recommended" tag. Choosing records the family for this follow-up and re-reads the card;
 * it schedules nothing and sends nothing. Wording the owner has typed into the current variant
 * is flushed by its editor as the card re-renders, so switching never loses an edit.
 */
export function FollowUpChannelChoice({ jumpId, contactName, options, selected, heldNote, missingMethodHref }: {
  jumpId: string;
  contactName: string;
  options: ChannelChoiceOption[];
  selected: PreparationFamily;
  /** Shown when the choice takes the follow-up out of automatic delivery. */
  heldNote?: string | null;
  /** Where to add the missing phone number or email; returns to this follow-up. */
  missingMethodHref?: string;
}) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const [current, setCurrent] = useState(selected);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const selectedOption = options.find(option => option.family === current);

  const choose = async (family: PreparationFamily) => {
    if (family === current || busy) return;
    const previous = current;
    setCurrent(family);
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/jumps/${encodeURIComponent(jumpId)}/variant`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ family }) });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(payload.error || "That choice could not be saved.");
      }
      startRefresh(() => router.refresh());
    } catch (reason) {
      setCurrent(previous);
      setError(reason instanceof Error ? reason.message : "That choice could not be saved.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="follow-up-channel-choice" data-follow-up-channel-choice={current} aria-busy={busy || refreshing}>
      <div className="when-chips" role="group" aria-label={`How to reach ${contactName}`}>
        {options.map((option) => (
          <div key={option.family} className="channel-choice-option">
          <button type="button" className="when-chip" aria-pressed={option.family === current} disabled={busy || Boolean(option.unavailable)} aria-describedby={option.unavailable ? `${jumpId}-channel-${option.family}-missing` : undefined} onClick={() => { void choose(option.family); }}>
            <AppIcon name={option.icon} /><span>{option.label}</span>{option.recommended && <small className="channel-recommended">Recommended</small>}
          </button>
          {option.unavailable && <small id={`${jumpId}-channel-${option.family}-missing`} className="muted-copy">{option.unavailable}.{missingMethodHref && option.unavailable.startsWith("Needs") && <> <a className="inline-action" href={missingMethodHref}>Add {option.family === "EMAIL" ? "email" : "phone"}</a></>}</small>}
          </div>
        ))}
      </div>
      {selectedOption?.unavailable && <p className="muted-copy channel-missing">{selectedOption.label}: {selectedOption.unavailable.toLowerCase()}.</p>}
      {heldNote && <p className="muted-copy" data-follow-up-held>{heldNote}</p>}
      {error && <p className="notice error compact" role="alert">{error}</p>}
    </div>
  );
}
