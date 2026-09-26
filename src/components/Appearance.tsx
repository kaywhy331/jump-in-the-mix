"use client";

import { useEffect, useId, useState, useSyncExternalStore } from "react";
import { QUICK_ADD_SHORTCUT_EVENT, readQuickAddShortcut, writeQuickAddShortcut } from "@/lib/quick-add-shortcut";

type Appearance = "system" | "light" | "dark";
const key = "jitm-appearance";
const valid = (value: string | null): Appearance => value === "light" || value === "dark" ? value : "system";

// Keep every route in sync, including sign-in and recovery pages without a picker.
export function AppearanceSync() {
  useEffect(() => {
    const storage = (event: StorageEvent) => {
      if (event.key !== key && event.key !== null) return;
      const next = valid(event.newValue);
      if (next === "system") delete document.documentElement.dataset.theme;
      else document.documentElement.dataset.theme = next;
      window.dispatchEvent(new Event("jitm:appearance"));
    };
    window.addEventListener("storage", storage);
    return () => window.removeEventListener("storage", storage);
  }, []);
  return null;
}

// The Quick Add "N" switch is kept in this browser like the theme; other tabs follow through the storage event.
const subscribeQuickAddShortcut = (notify: () => void) => {
  window.addEventListener(QUICK_ADD_SHORTCUT_EVENT, notify);
  window.addEventListener("storage", notify);
  return () => { window.removeEventListener(QUICK_ADD_SHORTCUT_EVENT, notify); window.removeEventListener("storage", notify); };
};

/** Whether the single-key Quick Add shortcut is on; the server and first paint assume the default. */
export function useQuickAddShortcut() {
  return useSyncExternalStore(subscribeQuickAddShortcut, readQuickAddShortcut, () => true);
}

export function AppearanceControl({ compact = false }: { compact?: boolean }) {
  const id = useId();
  const shortcutHintId = useId();
  const [appearance, setAppearance] = useState<Appearance>("system");
  const [saved, setSaved] = useState(true);
  const shortcut = useQuickAddShortcut();
  useEffect(() => {
    const update = () => setAppearance(valid(document.documentElement.dataset.theme ?? null));
    update();
    window.addEventListener("jitm:appearance", update);
    return () => window.removeEventListener("jitm:appearance", update);
  }, []);
  const change = (next: Appearance) => {
    if (next === "system") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = next;
    setAppearance(next);
    try { localStorage.setItem(key, next); setSaved(true); } catch { setSaved(false); }
    window.dispatchEvent(new Event("jitm:appearance"));
  };
  const changeShortcut = (next: boolean) => {
    setSaved(writeQuickAddShortcut(next));
    window.dispatchEvent(new Event(QUICK_ADD_SHORTCUT_EVENT));
  };
  return <>
    <div className={`appearance-control${compact ? " appearance-compact" : ""}`}>
      <label htmlFor={id}>Appearance</label>
      <select id={id} value={appearance} onChange={event => change(event.target.value as Appearance)}>
        <option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option>
      </select>
      {!compact && <small>Use your device setting or choose a look for this browser.</small>}
      {!saved && <small role="status">Applied for this visit. This browser could not remember your choice.</small>}
    </div>
    {!compact && <>
      <label className="checkbox-row"><input type="checkbox" role="switch" checked={shortcut} aria-describedby={shortcutHintId} onChange={event => changeShortcut(event.target.checked)} /><span>Quick Add keyboard shortcut (N)</span></label>
      <p className="muted-copy" id={shortcutHintId}><small>Press N outside a text field to open Quick Add. Turn it off if it gets in the way of dictation or typing.</small></p>
    </>}
  </>;
}
