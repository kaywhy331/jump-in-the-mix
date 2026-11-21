"use client";

export const BROWSER_CHANGE_KEY = "jitm:browser-change";
export const BROWSER_CHANGE_CHANNEL = "jitm:browser-change";
const PRIVATE_PREFIX = "jitm:private:";
const LEGACY_KEYS = new Set(["jitm:opened-jump", "jitm:contacts:list-state"]);

export function privateStorageKey(scope: string, name: string): string {
  return `${PRIVATE_PREFIX}${scope}:${name}`;
}

// A copy of a storage area's keys. Removing an item can reorder the keys that remain
// (Chromium orders them by hash), so never remove while walking the live storage:
// take this snapshot first, then remove.
export function storageKeys(storage: Pick<Storage, "length" | "key">): string[] {
  const keys: string[] = [];
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index);
    if (key !== null) keys.push(key);
  }
  return keys;
}

export function clearPrivateBrowserState(keepScope?: string): void {
  try {
    const storage = window.sessionStorage;
    for (const key of storageKeys(storage)) {
      if (LEGACY_KEYS.has(key) || (key.startsWith(PRIVATE_PREFIX) && (!keepScope || !key.startsWith(`${PRIVATE_PREFIX}${keepScope}:`)))) storage.removeItem(key);
    }
  } catch { /* Browser recovery is optional when storage is unavailable. */ }
}

export function browserChangeMarker(): string | null {
  try { return window.localStorage.getItem(BROWSER_CHANGE_KEY); } catch { return null; }
}

export async function clearForeignNotifications(keepScope?: string | null): Promise<void> {
  try {
    const registration = await navigator.serviceWorker?.getRegistration();
    const notifications = await registration?.getNotifications();
    for (const notification of notifications ?? []) {
      if (!keepScope || notification.data?.scope !== keepScope) notification.close();
    }
  } catch { /* Notification access is optional in unsupported browsers. */ }
}

/**
 * Tell this browser's other tabs that its account may have changed. `via` is the caller's own open channel: a channel never
 * receives its own messages, so a listener that sends through it isn't woken by its own signal.
 */
export function signalBrowserChange(signedOut = false, via?: BroadcastChannel | null): void {
  // Signals contain no identity and grant no authority. Receivers check current cookies.
  const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const message = { id, signedOut };
  try { window.localStorage.setItem(BROWSER_CHANGE_KEY, JSON.stringify(message)); } catch { /* Fall back to broadcast/focus. */ }
  try {
    const channel = via ?? new BroadcastChannel(BROWSER_CHANGE_CHANNEL);
    channel.postMessage(message);
    if (!via) channel.close();
  } catch { /* Focus and visibility checks also work without broadcast support. */ }
}
