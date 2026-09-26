"use client";
import { useEffect, useRef, useState } from "react";
import { dateInputInTimezone } from "@/lib/date-input";

export function LocalDateInput({ id, name, initialValue, timezone }: { id: string; name: string; initialValue: string; timezone?: string }) {
  const [minimum, setMinimum] = useState(initialValue);
  const [value, setValue] = useState(initialValue);
  const edited = useRef(false);
  useEffect(() => {
    const today = dateInputInTimezone(new Date(), timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone);
    setMinimum(today);
    if (!edited.current) setValue(today);
  }, [initialValue, timezone]);
  return <input id={id} name={name} type="date" min={minimum} value={value} onChange={event => { edited.current = true; setValue(event.target.value); }} required />;
}
