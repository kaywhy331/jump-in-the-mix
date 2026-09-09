"use client";

import { useState } from "react";

export function SendTimeField({ id, defaultMinutes }: { id: string; defaultMinutes: number | null }) {
  const [minutes, setMinutes] = useState(defaultMinutes);
  const value = minutes === null ? "" : `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  return <div className="field"><label htmlFor={id}>Send time</label>
    <input type="hidden" name="stepSendTimeMinutes" value={minutes ?? ""} />
    <input id={id} type="time" value={value} onChange={event => {
      const [hours, minute] = event.target.value.split(":").map(Number);
      setMinutes(event.target.value ? hours * 60 + minute : null);
    }} />
    <small>Leave blank to use the account’s default time.</small>
  </div>;
}
