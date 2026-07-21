"use client";

const CONTACT_LIST_STATE_KEY = "jitm:contacts:list-state";
const MAX_STATE_AGE_MS = 30 * 60 * 1000;

export type ContactListState = {
  href: string;
  scrollY: number;
  savedAt: number;
};

function isSafeContactsListHref(value: string): boolean {
  return value === "/contacts" || value.startsWith("/contacts?");
}

export function readContactListState(): ContactListState | null {
  try {
    const raw = window.sessionStorage.getItem(CONTACT_LIST_STATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ContactListState>;
    if (
      typeof parsed.href !== "string"
      || !isSafeContactsListHref(parsed.href)
      || typeof parsed.scrollY !== "number"
      || !Number.isFinite(parsed.scrollY)
      || typeof parsed.savedAt !== "number"
      || Date.now() - parsed.savedAt > MAX_STATE_AGE_MS
    ) {
      window.sessionStorage.removeItem(CONTACT_LIST_STATE_KEY);
      return null;
    }
    return { href: parsed.href, scrollY: Math.max(parsed.scrollY, 0), savedAt: parsed.savedAt };
  } catch {
    return null;
  }
}

export function saveContactListState(): void {
  try {
    const href = `${window.location.pathname}${window.location.search}`;
    if (!isSafeContactsListHref(href)) return;
    const state: ContactListState = { href, scrollY: window.scrollY, savedAt: Date.now() };
    window.sessionStorage.setItem(CONTACT_LIST_STATE_KEY, JSON.stringify(state));
  } catch {
    // Session storage is an enhancement; navigation remains functional without it.
  }
}

export function restoreContactListScroll(): void {
  const state = readContactListState();
  if (!state) return;
  const currentHref = `${window.location.pathname}${window.location.search}`;
  if (state.href !== currentHref) return;
  window.requestAnimationFrame(() => window.scrollTo({ top: state.scrollY, behavior: "auto" }));
}
