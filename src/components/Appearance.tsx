"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import type { KeyboardEvent } from "react";
import { AppIcon, type AppIconName } from "@/components/AppIcon";
import { QUICK_ADD_SHORTCUT_EVENT, readQuickAddShortcut, writeQuickAddShortcut } from "@/lib/quick-add-shortcut";

type Appearance = "system" | "light" | "dark";
const key = "jitm-appearance";
const valid = (value: string | null): Appearance => value === "light" || value === "dark" ? value : "system";
const choices: { value: Appearance; label: string; icon: AppIconName }[] = [
  { value: "system", label: "System", icon: "monitor" },
  { value: "light", label: "Light", icon: "sun" },
  { value: "dark", label: "Dark", icon: "moon" }
];

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

/**
 * System, Light and Dark as three icon buttons in one radio group: arrow keys move between them and
 * choose. `compact` drops the hint and the Quick Add switch; `labelHidden` keeps the name for
 * assistive technology only, for a header with room for the icons alone.
 */
export function AppearanceControl({ compact = false, labelHidden = false }: { compact?: boolean; labelHidden?: boolean }) {
  const id = useId();
  const shortcutHintId = useId();
  const group = useRef<HTMLDivElement>(null);
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
  const move = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
    const edge = event.key === "Home" ? 0 : event.key === "End" ? choices.length - 1 : null;
    if (!step && edge === null) return;
    event.preventDefault();
    const current = choices.findIndex(choice => choice.value === appearance);
    const index = edge ?? (current + step + choices.length) % choices.length;
    change(choices[index].value);
    group.current?.querySelectorAll<HTMLButtonElement>("button")[index]?.focus();
  };
  const changeShortcut = (next: boolean) => {
    setSaved(writeQuickAddShortcut(next));
    window.dispatchEvent(new Event(QUICK_ADD_SHORTCUT_EVENT));
  };
  return <>
    <div className={`appearance-control${compact ? " appearance-compact" : ""}${labelHidden ? " appearance-icons-only" : ""}`}>
      <span id={id} className={labelHidden ? "sr-only" : "appearance-label"}>Appearance</span>
      <div ref={group} className="appearance-toggle" role="radiogroup" aria-labelledby={id} onKeyDown={move}>
        {choices.map(choice => <button key={choice.value} type="button" role="radio" aria-checked={appearance === choice.value} tabIndex={appearance === choice.value ? 0 : -1} aria-label={choice.label} title={choice.label} onClick={() => change(choice.value)}><AppIcon name={choice.icon} /></button>)}
      </div>
      {!compact && <small>Use your device setting or choose a look for this browser.</small>}
      {!saved && <small role="status">Applied for this visit. This browser could not remember your choice.</small>}
    </div>
    {!compact && <>
      <label className="checkbox-row"><input type="checkbox" role="switch" checked={shortcut} aria-describedby={shortcutHintId} onChange={event => changeShortcut(event.target.checked)} /><span>Quick Add keyboard shortcut (N)</span></label>
      <p className="muted-copy" id={shortcutHintId}><small>Press N outside a text field to open Quick Add. Turn it off if it gets in the way of dictation or typing.</small></p>
    </>}
  </>;
}
