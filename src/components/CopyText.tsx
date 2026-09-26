"use client";

import { useState } from "react";

// Copies a public template into the clipboard. Nothing is sent and nothing is stored.
export function CopyText({ text, label = "Copy text" }: { text: string; label?: string }) {
  const [status, setStatus] = useState("");
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setStatus("Copied. Paste it into your own messaging app and make it yours.");
    } catch {
      setStatus("Copy isn’t available here. Select the text above and copy it manually.");
    }
  }
  return <div className="template-example-actions"><button className="button" type="button" onClick={copy}>{label}</button><span role="status" aria-live="polite">{status}</span></div>;
}
