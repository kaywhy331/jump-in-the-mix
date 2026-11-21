"use client";

import { useEffect, useRef, useState } from "react";

// How long the button says "Copied" before it offers the copy again, so a second copy confirms again too.
export const COPIED_LABEL_MS = 1600;

// Copies a public template into the clipboard. Nothing is sent and nothing is stored.
// The button itself confirms the copy for a moment, then shows its label again; the status line still
// announces each result, and stays as it is when the label returns, so nothing more is announced. Only a
// failure stays visible, with the text left in place to select by hand (JITM-08 §2.38).
export function CopyText({ text, label = "Copy text" }: { text: string; label?: string }) {
  const [result, setResult] = useState<{ outcome: "copied" | "failed"; attempt: number } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; window.clearTimeout(timer.current); };
  }, []);
  async function copy() {
    let outcome: "copied" | "failed" = "copied";
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      outcome = "failed";
    }
    if (!mounted.current) return;
    // A repeated copy restarts the interval; a failure ends the confirmation at once.
    window.clearTimeout(timer.current);
    setResult(previous => ({ outcome, attempt: (previous?.attempt ?? 0) + 1 }));
    setConfirming(outcome === "copied");
    if (outcome === "copied") timer.current = window.setTimeout(() => setConfirming(false), COPIED_LABEL_MS);
  }
  const message = result?.outcome === "copied" ? "Copied. Paste it into your own messaging app and make it yours." : result?.outcome === "failed" ? "Copy isn’t available here. Select the text above and copy it manually." : "";
  // Each result is a new node in the live region, so the same result is announced again on a repeated copy.
  return <div className="template-example-actions"><button className="button" type="button" onClick={copy}>{confirming ? "Copied" : label}</button><span role="status" aria-live="polite" className={result?.outcome === "copied" ? "sr-only" : undefined}>{message && <span key={result?.attempt}>{message}</span>}</span></div>;
}
