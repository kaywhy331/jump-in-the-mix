"use client";

import { useSyncExternalStore } from "react";

// The confirmation slot of the review Today opened by itself after an outcome, or on a phone of any open review, while it
// stays open (D70, JITM-08 §2.4, §2.36).
let openSlot: Element | null = null;
const listeners = new Set<() => void>();

export function setOpenReviewSlot(slot: Element | null): void {
  if (slot === openSlot) return;
  openSlot = slot;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/**
 * Where a follow-up's confirmation and its Undo show: inside the review Today opened by itself, which takes the owner's
 * focus at every width, or on a phone inside any open review, since each covers the floating stack; or else in Today's
 * floating stack. A card's own review closes as its confirmation appears, so it never holds it.
 */
export function useConfirmationTarget(jumpId: string): Element | null {
  const slot = useSyncExternalStore(subscribe, () => openSlot, () => null);
  if (typeof document === "undefined") return null;
  if (slot?.isConnected && !slot.closest(`[data-jump-workflow="${CSS.escape(jumpId)}"]`)) return slot;
  return document.getElementById("follow-up-undos");
}
