"use client";

import type { ReactNode } from "react";
import { useFollowUpDone, useFollowUpDue } from "@/components/useFollowUpDue";

/** "Also due: Call at 10:00 AM." In a follow-up's review, the person's other follow-ups still due today (D71, JITM-09 §2.82). */
export function AlsoDueNote({ items, className }: { items: Array<{ jumpId: string; label: string }>; className?: string }) {
  const stillDue = useFollowUpDue();
  const left = items.filter(item => stillDue(item.jumpId));
  if (!left.length) return null;
  return <p className={className}>Also due: {left.map(item => item.label).join(", ")}.</p>;
}

/**
 * Its children, the offer to skip this follow-up, while a later follow-up of the person's (`jumpIds`) is still due today
 * (D71), or once the person was contacted today: by another of their follow-ups (`doneIds`) recorded as done here, or as
 * the page read it (`contacted`), so the owner doesn't contact them twice in a day (D98).
 */
export function WhileAlsoDue({ jumpIds, doneIds = jumpIds, contacted = false, children }: { jumpIds: string[]; doneIds?: string[]; contacted?: boolean; children: ReactNode }) {
  const stillDue = useFollowUpDue(), done = useFollowUpDone();
  return contacted || jumpIds.some(stillDue) || doneIds.some(done) ? <>{children}</> : null;
}

/** "Contacted today at 9:05 AM" on a person's follow-up still due: as the page read it, or once another of their follow-ups is recorded as done here (D98). */
export function ContactedToday({ jumpIds, at, className }: { jumpIds: string[]; at: string | null; className?: string }) {
  const done = useFollowUpDone();
  if (at) return <p className={className}>Contacted today at {at}</p>;
  return jumpIds.some(done) ? <p className={className}>Contacted today</p> : null;
}
