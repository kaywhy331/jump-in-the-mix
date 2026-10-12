"use client";

import { useSyncExternalStore } from "react";

// Whether each follow-up on the page is still due, as its own card says: an outcome takes it away, and Undo or a fresh
// read brings it back. A person's card and reviews name their other follow-up only while it is still due (D71). Those
// recorded as done, not skipped, mean the person was contacted today (D98).
const due = new Map<string, boolean>();
const done = new Set<string>();
const listeners = new Set<() => void>();
let version = 0;

/** Called by each follow-up's card, with `recordedDone` once its outcome is a done one; `null` when the card leaves the page. */
export function setFollowUpDue(jumpId: string, value: boolean | null, recordedDone = false): void {
  const isDone = value === false && recordedDone;
  if ((value === null ? !due.has(jumpId) : due.get(jumpId) === value) && done.has(jumpId) === isDone) return;
  if (value === null) due.delete(jumpId);
  else due.set(jumpId, value);
  if (isDone) done.add(jumpId);
  else done.delete(jumpId);
  version += 1;
  for (const listener of listeners) listener();
}

/** Whether a follow-up is still due here; one with no card on the page counts as due. */
export function isFollowUpDue(jumpId: string): boolean {
  return due.get(jumpId) !== false;
}

/** Whether a follow-up's card on this page has recorded it as done, so its person was contacted (D98). */
export function isFollowUpDone(jumpId: string): boolean {
  return done.has(jumpId);
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

/** Whether a follow-up was recorded as done here, read when the component renders (D98). */
export function useFollowUpDone(): (jumpId: string) => boolean {
  useSyncExternalStore(subscribeFollowUpDue, () => version, () => 0);
  return isFollowUpDone;
}
