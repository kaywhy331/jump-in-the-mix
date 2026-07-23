"use client";

import { useEffect, useMemo, useState } from "react";

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
  const listId = `${id}-global-timezones`;
  const zones = useMemo(() => typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : ["UTC", "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles"], []);
  const detect = () => setValue(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
  useEffect(() => {
    if (!confirmDetection) return;
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (detected) setValue(detected);
  }, [confirmDetection]);
  return <div className="timezone-picker"><label htmlFor={id} className="sr-only">{label}</label><div className="timezone-input-row"><input id={id} name={name} value={value} onChange={(event) => setValue(event.target.value)} list={listId} autoComplete="off" required/><button className="button" type="button" onClick={detect}>Use detected</button></div><datalist id={listId}>{zones.map((zone) => <option value={zone} key={zone}/>)}</datalist>{confirmDetection && <label className="checkbox-card"><input type="checkbox" required/><span><strong>Confirm timezone</strong><small>Dates and Jump times will use {value}.</small></span></label>}</div>;
}
