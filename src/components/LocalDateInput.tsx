"use client";
import { useEffect, useRef, useState } from "react";
import { dateInputInTimezone } from "@/lib/date-input";

/** `onValueChange` hears every value, including the move to today in a newly chosen timezone. */
export function LocalDateInput({ id, name, initialValue, timezone, onValueChange }: { id: string; name: string; initialValue: string; timezone?: string; onValueChange?: (value: string) => void }) {
  const [minimum, setMinimum] = useState(initialValue);
  const [value, setValue] = useState(initialValue);
  const edited = useRef(false);
  useEffect(() => {
    const today = dateInputInTimezone(new Date(), timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone);
    setMinimum(today);
    if (!edited.current) setValue(today);
  }, [initialValue, timezone]);
  useEffect(() => { onValueChange?.(value); }, [value, onValueChange]);
  return <input id={id} name={name} type="date" min={minimum} value={value} onChange={event => { edited.current = true; setValue(event.target.value); }} required />;
}
