"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { AppIcon } from "@/components/AppIcon";

function cityLabel(zone: string): string {
  return zone === "UTC" ? "Coordinated Universal Time (UTC)" : zone.split("/").slice(1).join(" / ").replaceAll("_", " ") || zone;
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
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  // ICU lists and abbreviations differ between the server and browsers.
  // The first render is deterministic; discover the browser's full list after hydration.
  const [zones, setZones] = useState(INITIAL_ZONES);
  const visibleZones = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const sorted = [...new Set([...zones, value])].sort((left, right) => cityLabel(left).localeCompare(cityLabel(right)));
    return needle ? sorted.filter((zone) => `${zone} ${cityLabel(zone)}`.toLowerCase().includes(needle)) : [value, ...sorted.filter(zone => zone !== value)];
  }, [query, zones, value]);
  const open = () => {
    setQuery("");
    dialogRef.current?.showModal();
    searchRef.current?.focus({ preventScroll: true });
  };
  const detect = () => {
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    setValue(detected);
    dialogRef.current?.close();
  };

  useEffect(() => {
    if (typeof Intl.supportedValuesOf === "function") setZones(["UTC", ...Intl.supportedValuesOf("timeZone")]);
    if (!confirmDetection) return;
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (detected) setValue(detected);
  }, [confirmDetection]);

  return <div className="timezone-picker">
    <input id={id} name={name} value={value} type="hidden" />
    <div className="timezone-current"><span><small>{label}</small><strong>{cityLabel(value)}</strong></span><button ref={triggerRef} className="button" type="button" onClick={open} aria-label={`Change ${label.toLowerCase()}`}>Change</button></div>
    {confirmDetection && <small>Detected automatically for follow-up times.</small>}
    <dialog ref={dialogRef} className="sheet timezone-sheet" aria-labelledby={titleId} onClose={() => triggerRef.current?.focus({ preventScroll: true })} onClick={(event) => { if (event.target === event.currentTarget) dialogRef.current?.close(); }}>
      <div className="sheet-panel">
        <header className="sheet-header"><div className="sheet-heading-copy"><h2 id={titleId}>Choose a timezone</h2><p>Search a city or region. Daylight saving changes are handled automatically.</p></div><button className="icon-button" type="button" onClick={() => dialogRef.current?.close()} aria-label="Close timezone picker"><AppIcon name="close" /></button></header>
        <div className="sheet-body">
          <button className="button" type="button" onClick={detect}>Use device timezone</button>
          <label className="field"><span>Search timezones</span><input ref={searchRef} type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Chicago, London, Tokyo…" autoComplete="off" /></label>
          <div className="timezone-city-list">{visibleZones.map((zone) => <button className={zone === value ? "timezone-city selected" : "timezone-city"} type="button" aria-pressed={zone === value} key={zone} onClick={() => { setValue(zone); dialogRef.current?.close(); }}><strong>{cityLabel(zone)}{zone === value && <span className="timezone-selected-label">Selected</span>}</strong><small>{zone}</small></button>)}</div>
          {!visibleZones.length && <p role="status">No matching timezone. Try a nearby major city or region.</p>}
        </div>
      </div>
    </dialog>
  </div>;
}
