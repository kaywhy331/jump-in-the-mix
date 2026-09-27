"use client";

import { useEffect, useId, useState, useSyncExternalStore } from "react";
import { AppIcon } from "@/components/AppIcon";
import { QUICK_ADD_SHORTCUT_EVENT, readQuickAddShortcut, writeQuickAddShortcut } from "@/lib/quick-add-shortcut";

type Appearance = "system" | "light" | "dark";
const key = "jitm-appearance";
const valid = (value: string | null): Appearance => value === "light" || value === "dark" ? value : "system";
const darkQuery = "(prefers-color-scheme: dark)";

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
 * A sun and moon switch: the knob slides to the chosen side and the other side greys out. Until the
 * person chooses, it follows the device and shows the device's current look; "Match my device"
 * (full form only) returns to that. `compact` drops the hint, the reset and the Quick Add switch;
 * `labelHidden` keeps the "Appearance" name for assistive technology only.
 */
export function AppearanceControl({ compact = false, labelHidden = false }: { compact?: boolean; labelHidden?: boolean }) {
  const id = useId();
  const shortcutHintId = useId();
  const [appearance, setAppearance] = useState<Appearance>("system");
  const [deviceDark, setDeviceDark] = useState(false);
  // The knob only animates once the first read is done, so it never slides into place on load.
  const [ready, setReady] = useState(false);
  const [saved, setSaved] = useState(true);
  const shortcut = useQuickAddShortcut();
  useEffect(() => {
    const update = () => setAppearance(valid(document.documentElement.dataset.theme ?? null));
    const media = window.matchMedia(darkQuery);
    const device = () => setDeviceDark(media.matches);
    update();
    device();
    const frame = requestAnimationFrame(() => setReady(true));
    window.addEventListener("jitm:appearance", update);
    media.addEventListener("change", device);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("jitm:appearance", update); media.removeEventListener("change", device); };
  }, []);
  const dark = appearance === "dark" || (appearance === "system" && deviceDark);
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
    <div className={`appearance-control${compact ? " appearance-compact" : ""}${labelHidden ? " appearance-icons-only" : ""}`}>
      <span id={id} className={labelHidden ? "sr-only" : "appearance-label"}>Appearance</span>
      <button type="button" role="switch" aria-checked={dark} aria-label="Dark mode" title={dark ? "Switch to light" : "Switch to dark"} className="theme-switch" data-ready={ready || undefined} onClick={() => change(dark ? "light" : "dark")}>
        <span className="theme-switch-track" aria-hidden="true">
          <span className="theme-switch-thumb" />
          <span className="theme-switch-icon theme-switch-sun"><AppIcon name="sun" /></span>
          <span className="theme-switch-icon theme-switch-moon"><AppIcon name="moon" /></span>
        </span>
      </button>
      {!compact && <small>{appearance === "system" ? "Following your device’s setting." : <>Chosen for this browser. <button type="button" className="text-button" onClick={() => change("system")}>Match my device</button></>}</small>}
      {!saved && <small role="status">Applied for this visit. This browser could not remember your choice.</small>}
    </div>
    {!compact && <>
      <label className="checkbox-row"><input type="checkbox" role="switch" checked={shortcut} aria-describedby={shortcutHintId} onChange={event => changeShortcut(event.target.checked)} /><span>Quick Add keyboard shortcut (N)</span></label>
      <p className="muted-copy" id={shortcutHintId}><small>Press N outside a text field to open Quick Add. Turn it off if it gets in the way of dictation or typing.</small></p>
    </>}
  </>;
}
