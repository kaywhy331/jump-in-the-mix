"use client";

import { useSyncExternalStore } from "react";

// Whether each follow-up on the page is still due, as its own card says: an outcome takes it away, and Undo or a fresh
// read brings it back. A person's card and reviews name their other follow-up only while it is still due (D71).
const due = new Map<string, boolean>();
const listeners = new Set<() => void>();
let version = 0;

/** Called by each follow-up's card; `null` when the card leaves the page. */
export function setFollowUpDue(jumpId: string, value: boolean | null): void {
  if (value === null ? !due.has(jumpId) : due.get(jumpId) === value) return;
  if (value === null) due.delete(jumpId);
  else due.set(jumpId, value);
  version += 1;
  for (const listener of listeners) listener();
}

/** Whether a follow-up is still due here; one with no card on the page counts as due. */
export function isFollowUpDue(jumpId: string): boolean {
  return due.get(jumpId) !== false;
}

/** Calls `listener` after each change; returns the function that stops it. */
export function subscribeFollowUpDue(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Whether a follow-up is still due here, read when the component renders; one with no card on the page counts as due. */
export function useFollowUpDue(): (jumpId: string) => boolean {
  useSyncExternalStore(subscribeFollowUpDue, () => version, () => 0);
  return isFollowUpDue;
}
