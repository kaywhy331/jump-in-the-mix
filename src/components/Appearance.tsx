"use client";

import { useEffect, useId, useState } from "react";

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

export function AppearanceControl({ compact = false }: { compact?: boolean }) {
  const id = useId();
  const [appearance, setAppearance] = useState<Appearance>("system");
  const [saved, setSaved] = useState(true);
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
  return <div className={`appearance-control${compact ? " appearance-compact" : ""}`}>
    <label htmlFor={id}>Appearance</label>
    <select id={id} value={appearance} onChange={event => change(event.target.value as Appearance)}>
      <option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option>
    </select>
    {!compact && <small>Use your device setting or choose a look for this browser.</small>}
    {!saved && <small role="status">Applied for this visit. This browser could not remember your choice.</small>}
  </div>;
}
