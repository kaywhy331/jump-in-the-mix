"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { AppIcon } from "@/components/AppIcon";

function cityLabel(zone: string): string {
  return zone === "UTC" ? "Coordinated Universal Time (UTC)" : zone.split("/").slice(1).join(" / ").replaceAll("_", " ") || zone;
}

const INITIAL_ZONES = ["UTC", "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "Europe/London", "Asia/Tokyo", "Australia/Sydney"];

export function TimezonePicker({
  defaultValue,
  confirmDetection = false,
  name = "timezone",
  id = name,
  label = "Timezone"
}: {
  defaultValue: string;
  confirmDetection?: boolean;
  name?: string;
  id?: string;
  label?: string;
}) {
  const [value, setValue] = useState(defaultValue);
  const [query, setQuery] = useState("");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  // ICU lists and abbreviations differ between the server and browsers.
  // The first render is deterministic; discover the browser's full list after hydration.
  const [zones, setZones] = useState(INITIAL_ZONES);
  const visibleZones = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const sorted = [...zones].sort((left, right) => cityLabel(left).localeCompare(cityLabel(right)));
    return needle ? sorted.filter((zone) => `${zone} ${cityLabel(zone)}`.toLowerCase().includes(needle)).slice(0, 100) : sorted.slice(0, 100);
  }, [query, zones]);
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
    <div className="timezone-current"><span><small>{label}</small><strong>{cityLabel(value)}</strong></span><button className="button" type="button" onClick={() => dialogRef.current?.showModal()}>Change</button></div>
    {confirmDetection && <small>Detected automatically for follow-up times.</small>}
    <dialog ref={dialogRef} className="sheet timezone-sheet" aria-labelledby={titleId} onClick={(event) => { if (event.target === event.currentTarget) dialogRef.current?.close(); }}>
      <div className="sheet-panel">
        <header className="sheet-header"><div><h2 id={titleId}>Choose your city</h2><p>We’ll handle daylight saving time automatically.</p></div><button className="icon-button" type="button" onClick={() => dialogRef.current?.close()} aria-label="Close timezone picker"><AppIcon name="close" /></button></header>
        <div className="sheet-body">
          <button className="button" type="button" onClick={detect}>Use my current location setting</button>
          <label className="field"><span>Search cities</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Chicago, London, Tokyo…" autoComplete="off" /></label>
          <div className="timezone-city-list">{visibleZones.map((zone) => <button className={zone === value ? "timezone-city selected" : "timezone-city"} type="button" key={zone} onClick={() => { setValue(zone); dialogRef.current?.close(); }}><strong>{cityLabel(zone)}</strong><small>{zone}</small></button>)}</div>
          {!visibleZones.length && <p>No matching city found.</p>}
        </div>
      </div>
    </dialog>
  </div>;
}
