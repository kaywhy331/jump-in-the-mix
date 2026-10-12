"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { AppIcon } from "@/components/AppIcon";
import { isValidTimezone } from "@/lib/mix-broadcast";
import { zoneGenericName } from "@/lib/display-labels";

/**
 * A browser that cannot tell where the device is reports "UTC" or "Etc/Unknown"; only a real,
 * supported zone may replace the stored one.
 */
export function usableDetectedTimezone(detected: string | null | undefined): string | null {
  if (!detected || detected === "UTC" || detected === "Etc/Unknown" || !isValidTimezone(detected)) return null;
  return detected;
}

function deviceTimezone(): string | null {
  try {
    return usableDetectedTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone);
  } catch {
    return null;
  }
}

function cityLabel(zone: string): string {
  return zone === "UTC" ? "Coordinated Universal Time (UTC)" : zone.split("/").slice(1).join(" / ").replaceAll("_", " ") || zone;
}

// Each zone's everyday name ("Eastern Time"), worked out once per page and only in the browser, after the sheet opens:
// it costs an Intl formatter per zone, and ICU's names differ between the server and browsers. UTC's own row says it all.
const everydayNames = new Map<string, string>();
function everydayName(zone: string): string {
  let name = everydayNames.get(zone);
  if (name === undefined) {
    name = zone === "UTC" ? "" : zoneGenericName(zone);
    everydayNames.set(zone, name);
  }
  return name;
}

const INITIAL_ZONES = ["UTC", "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "Europe/London", "Asia/Tokyo", "Australia/Sydney"];

export function TimezonePicker({
  defaultValue,
  onChange,
  confirmDetection = false,
  name = "timezone",
  id = name,
  label = "Timezone"
}: {
  defaultValue: string;
  onChange?: (timezone: string) => void;
  confirmDetection?: boolean;
  name?: string;
  id?: string;
  label?: string;
}) {
  const [value, setValue] = useState(defaultValue);
  const onChangeRef = useRef(onChange); onChangeRef.current = onChange;
  useEffect(() => { onChangeRef.current?.(value); }, [value]);
  const [query, setQuery] = useState("");
  // The city list exists only while the sheet is open, so a closed picker re-renders for free.
  const [showing, setShowing] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  // ICU lists and abbreviations differ between the server and browsers.
  // The first render is deterministic; discover the browser's full list after hydration.
  const [zones, setZones] = useState(INITIAL_ZONES);
  const visibleZones = useMemo(() => {
    if (!showing) return [];
    const needle = query.trim().toLowerCase();
    const sorted = [...new Set([...zones, value])].sort((left, right) => cityLabel(left).localeCompare(cityLabel(right)));
    return needle ? sorted.filter((zone) => `${zone} ${cityLabel(zone)} ${everydayName(zone)}`.toLowerCase().includes(needle)) : [value, ...sorted.filter(zone => zone !== value)];
  }, [showing, query, zones, value]);
  const open = () => {
    setQuery("");
    setShowing(true);
    dialogRef.current?.showModal();
    searchRef.current?.focus({ preventScroll: true });
  };
  const [detected, setDetected] = useState(false);
  const detect = () => {
    const zone = deviceTimezone();
    if (zone) setValue(zone);
    dialogRef.current?.close();
  };

  useEffect(() => {
    if (typeof Intl.supportedValuesOf === "function") setZones(["UTC", ...Intl.supportedValuesOf("timeZone")]);
    if (!confirmDetection) return;
    const zone = deviceTimezone();
    if (!zone) return;
    setValue(zone);
    setDetected(true);
  }, [confirmDetection]);

  return <div className="timezone-picker">
    <input id={id} name={name} value={value} type="hidden" />
    <div className="timezone-current"><span><small>{label}</small><strong>{cityLabel(value)}</strong></span><button ref={triggerRef} className="button" type="button" onClick={open} aria-label={`Change ${label.toLowerCase()}`}>Change</button></div>
    {detected && <small>Detected from this device for follow-up times. Change it if you work somewhere else.</small>}
    <dialog ref={dialogRef} className="sheet timezone-sheet" aria-labelledby={titleId} aria-describedby={descriptionId} onClose={() => { setShowing(false); triggerRef.current?.focus({ preventScroll: true }); }} onClick={(event) => { if (event.target === event.currentTarget) dialogRef.current?.close(); }}>
      <div className="sheet-panel">
        <header className="sheet-header"><div className="sheet-heading-copy"><h2 id={titleId}>Choose a timezone</h2><p id={descriptionId}>Search a city or region. Daylight saving changes are handled automatically.</p></div><button className="icon-button" type="button" onClick={() => dialogRef.current?.close()} aria-label="Close timezone picker"><AppIcon name="close" /></button></header>
        <div className="sheet-body">
          <button className="button" type="button" onClick={detect}>Use device timezone</button>
          <label className="field"><span>Search timezones</span><input ref={searchRef} type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Chicago, London, Tokyo…" autoComplete="off" /></label>
          <div className="timezone-city-list">{visibleZones.map((zone) => <button className={zone === value ? "timezone-city selected" : "timezone-city"} type="button" aria-pressed={zone === value} key={zone} onClick={() => { setValue(zone); dialogRef.current?.close(); }}><strong>{cityLabel(zone)}{zone === value && <span className="timezone-selected-label">Selected</span>}</strong>{everydayName(zone) && <small>{everydayName(zone)}</small>}</button>)}</div>
          {showing && !visibleZones.length && <p role="status">No matching timezone. Try a nearby major city or region.</p>}
        </div>
      </div>
    </dialog>
  </div>;
}
