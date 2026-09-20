"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { AppIcon, type AppIconName } from "@/components/AppIcon";
import type { PreparationFamily } from "@/lib/preparation-family";

export type ChannelChoiceOption = { family: PreparationFamily; label: string; icon: AppIconName; unavailable?: string };

/**
 * The compact choice between a follow-up's usable variants, shown on its Today card only when
 * there is more than one. Choosing records the family for this follow-up and re-reads the card;
 * it schedules nothing and sends nothing. Wording the owner has typed into the current variant
 * is flushed by its editor as the card re-renders, so switching never loses an edit.
 */
export function FollowUpChannelChoice({ jumpId, contactName, options, selected, heldNote }: {
  jumpId: string;
  contactName: string;
  options: ChannelChoiceOption[];
  selected: PreparationFamily;
  /** Shown when the choice takes the follow-up out of automatic delivery. */
  heldNote?: string | null;
}) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const [current, setCurrent] = useState(selected);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

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
          <button key={option.family} type="button" className="when-chip" aria-pressed={option.family === current} disabled={busy || Boolean(option.unavailable)} title={option.unavailable} onClick={() => { void choose(option.family); }}>
            <AppIcon name={option.icon} /><span>{option.label}</span>
          </button>
        ))}
      </div>
      {heldNote && <p className="muted-copy" data-follow-up-held>{heldNote}</p>}
      {error && <p className="notice error compact" role="alert">{error}</p>}
    </div>
  );
}
