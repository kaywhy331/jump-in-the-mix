"use client";

import type { ReactNode } from "react";
import { useFollowUpDue } from "@/components/useFollowUpDue";

/** "Also due: Call at 10:00 AM." In a follow-up's review, the person's other follow-ups still due today (D71, JITM-09 §2.82). */
export function AlsoDueNote({ items, className }: { items: Array<{ jumpId: string; label: string }>; className?: string }) {
  const stillDue = useFollowUpDue();
  const left = items.filter(item => stillDue(item.jumpId));
  if (!left.length) return null;
  return <p className={className}>Also due: {left.map(item => item.label).join(", ")}.</p>;
}

/** Its children, only while another of the person's follow-ups is still due today: the offer to skip the earlier one. */
export function WhileAlsoDue({ jumpIds, children }: { jumpIds: string[]; children: ReactNode }) {
  const stillDue = useFollowUpDue();
  return jumpIds.some(stillDue) ? <>{children}</> : null;
}
