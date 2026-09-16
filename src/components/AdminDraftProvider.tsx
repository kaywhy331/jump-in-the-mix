"use client";
import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { BROWSER_CHANGE_CHANNEL, BROWSER_CHANGE_KEY } from "@/lib/private-browser-state";

type Entry = { value: unknown; expires: number };
function draftStore() {
  const entries = new Map<string, Entry>();
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach(listener => listener());
  return {
    get: (key: string) => entries.get(key)?.value,
    set: (key: string, value: unknown) => { entries.set(key, { value, expires: Date.now() + 30 * 60_000 }); notify(); },
    remove: (key: string) => { entries.delete(key); notify(); },
    clear: () => { entries.clear(); notify(); },
    expire: () => { for (const [key, entry] of entries) if (entry.expires <= Date.now()) entries.delete(key); notify(); },
    dirty: () => entries.size > 0,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; }
  };
}
const DraftContext = createContext<ReturnType<typeof draftStore> | null>(null);
/** In-memory only: no message bodies, reasons, passwords, or codes enter browser storage. */
export function AdminDraftProvider({ scope, children }: { scope: string; children: ReactNode }) {
  const [store] = useState(draftStore);
  const [checking, setChecking] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const retry = useRef<(() => Promise<void>) | null>(null);
  useEffect(() => {
    let alive = true;
    let generation = 0;
    const check = async () => {
      const request = ++generation;
      setChecking(true);
      setUnavailable(false);
      try {
        const result = await fetch("/api/admin/browser-context", { cache: "no-store" });
        if (!result.ok) throw new Error("The staff session check is temporarily unavailable.");
        const current = await result.json();
        if (!alive || request !== generation) return;
        if (current.scope !== scope) { store.clear(); window.location.reload(); return; }
        setChecking(false);
      } catch { if (alive && request === generation) setUnavailable(true); }
    };
    retry.current = check;
    const onStorage = (event: StorageEvent) => { if (event.key === BROWSER_CHANGE_KEY) void check(); };
    const onVisibility = () => { if (document.visibilityState === "visible") void check(); };
    const beforeUnload = (event: BeforeUnloadEvent) => { if (store.dirty()) event.preventDefault(); };
    let channel: BroadcastChannel | undefined;
    try { channel = new BroadcastChannel(BROWSER_CHANGE_CHANNEL); channel.onmessage = () => { void check(); }; } catch { /* focus rechecks cookies */ }
    const timer = window.setInterval(store.expire, 30_000);
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", check);
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("visibilitychange", onVisibility);
    return () => { alive = false; retry.current = null; channel?.close(); window.clearInterval(timer); window.removeEventListener("storage", onStorage); window.removeEventListener("focus", check); window.removeEventListener("beforeunload", beforeUnload); document.removeEventListener("visibilitychange", onVisibility); };
  }, [scope, store]);
  return <DraftContext.Provider value={store}>{checking && <p role="status">{unavailable ? "The staff session check is temporarily unavailable. Your unsaved edits are retained in this tab." : "Checking your staff session…"} <button type="button" disabled={!unavailable} onClick={() => void retry.current?.()}>Retry session check</button></p>}<div hidden={checking}>{children}</div></DraftContext.Provider>;
}
export function useAdminDraft<T>(key: string, initial: T) {
  const store = useContext(DraftContext);
  if (!store) throw new Error("Staff drafts need the admin draft provider.");
  const saved = useSyncExternalStore(store.subscribe, () => store.get(key), () => undefined) as T | undefined;
  return { value: saved ?? initial, dirty: saved !== undefined, set: (value: T) => store.set(key, value), clear: () => store.remove(key) };
}
