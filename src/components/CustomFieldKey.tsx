"use client";

import { useState } from "react";

export function CustomFieldKey({ name, value }: { name: string; value: string }) {
  const [status, setStatus] = useState("");
  return <div>
    <span className="merge-field-chip">{name}</span>{" "}
    <button className="button" type="button" aria-label={`Copy key for ${name}`} onClick={async () => {
      try { await navigator.clipboard.writeText(value); setStatus("Copied"); }
      catch { setStatus("Couldn’t copy. Use Insert field in the Mix editor."); }
    }}>{status === "Copied" ? "Copied" : "Copy key"}</button>
    <span role="status">{status}</span>
  </div>;
}
