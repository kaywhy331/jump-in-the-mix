"use client";

export const BROWSER_CHANGE_KEY = "jitm:browser-change";
export const BROWSER_CHANGE_CHANNEL = "jitm:browser-change";
const PRIVATE_PREFIX = "jitm:private:";
const LEGACY_KEYS = new Set(["jitm:opened-jump", "jitm:contacts:list-state"]);

export function privateStorageKey(scope: string, name: string): string {
  return `${PRIVATE_PREFIX}${scope}:${name}`;
}

export function clearPrivateBrowserState(keepScope?: string): void {
  try {
    const storage = window.sessionStorage;
    for (let index = storage.length - 1; index >= 0; index--) {
      const key = storage.key(index);
      if (key && (LEGACY_KEYS.has(key) || (key.startsWith(PRIVATE_PREFIX) && (!keepScope || !key.startsWith(`${PRIVATE_PREFIX}${keepScope}:`))))) storage.removeItem(key);
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

export function signalBrowserChange(signedOut = false): void {
  // Signals contain no identity and grant no authority. Receivers check current cookies.
  const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const message = { id, signedOut };
  try { window.localStorage.setItem(BROWSER_CHANGE_KEY, JSON.stringify(message)); } catch { /* Fall back to broadcast/focus. */ }
  try {
    const channel = new BroadcastChannel(BROWSER_CHANGE_CHANNEL);
    channel.postMessage(message);
    channel.close();
  } catch { /* Focus and visibility checks also work without broadcast support. */ }
}
