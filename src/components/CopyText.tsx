"use client";

import { useState } from "react";

// Copies a public template into the clipboard. Nothing is sent and nothing is stored.
// The button itself confirms the copy; the status line still announces the result, and only a
// failure stays visible, with the text left in place to select by hand (JITM-08 §2.38).
export function CopyText({ text, label = "Copy text" }: { text: string; label?: string }) {
  const [result, setResult] = useState<"copied" | "failed" | null>(null);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setResult("copied");
    } catch {
      setResult("failed");
    }
  }
  return <div className="template-example-actions"><button className="button" type="button" onClick={copy}>{result === "copied" ? "Copied" : label}</button><span role="status" aria-live="polite" className={result === "copied" ? "sr-only" : undefined}>{result === "copied" ? "Copied. Paste it into your own messaging app and make it yours." : result === "failed" ? "Copy isn’t available here. Select the text above and copy it manually." : ""}</span></div>;
}
