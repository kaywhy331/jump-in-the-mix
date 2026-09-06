"use client";

import { privateStorageKey } from "@/lib/private-browser-state";
const MAX_STATE_AGE_MS = 30 * 60 * 1000;

export type ContactListState = {
  href: string;
  scrollY: number;
  savedAt: number;
};

function isSafeContactsListHref(value: string): boolean {
  return value === "/contacts" || value.startsWith("/contacts?");
}

export function readContactListState(scope: string): ContactListState | null {
  try {
    const key = privateStorageKey(scope, "contacts:list-state");
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ContactListState>;
    if (
      typeof parsed.href !== "string"
      || !isSafeContactsListHref(parsed.href)
      || typeof parsed.scrollY !== "number"
      || !Number.isFinite(parsed.scrollY)
      || typeof parsed.savedAt !== "number"
      || !Number.isFinite(parsed.savedAt)
      || parsed.savedAt > Date.now()
      || Date.now() - parsed.savedAt > MAX_STATE_AGE_MS
    ) {
      window.sessionStorage.removeItem(key);
      return null;
    }
    return { href: parsed.href, scrollY: Math.max(parsed.scrollY, 0), savedAt: parsed.savedAt };
  } catch {
    return null;
  }
}

export function saveContactListState(scope: string): void {
  try {
    const href = `${window.location.pathname}${window.location.search}`;
    if (!isSafeContactsListHref(href)) return;
    const state: ContactListState = { href, scrollY: window.scrollY, savedAt: Date.now() };
    window.sessionStorage.setItem(privateStorageKey(scope, "contacts:list-state"), JSON.stringify(state));
  } catch {
    // Session storage is an enhancement; navigation remains functional without it.
  }
}

export function restoreContactListScroll(scope: string): void {
  const state = readContactListState(scope);
  if (!state) return;
  const currentHref = `${window.location.pathname}${window.location.search}`;
  if (state.href !== currentHref) return;
  window.requestAnimationFrame(() => window.scrollTo({ top: state.scrollY, behavior: "auto" }));
}
