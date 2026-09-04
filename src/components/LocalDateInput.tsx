"use client";

import { useEffect, useState } from "react";

function browserToday(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function LocalDateInput({ id, name, initialValue }: { id: string; name: string; initialValue: string }) {
  const [minimum, setMinimum] = useState(initialValue);
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    const today = browserToday();
    setMinimum(today);
    setValue((current) => current === initialValue ? today : current);
  }, [initialValue]);

  return <input id={id} name={name} type="date" min={minimum} value={value} onChange={(event) => setValue(event.target.value)} required />;
}
