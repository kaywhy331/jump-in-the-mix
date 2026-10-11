"use client";

import { useId, useLayoutEffect, useRef, useState } from "react";

/** A paragraph shown to its first three lines, with "Show all" only when there is more (D77's notes near the top).
 *  `what` names the text for the toggle's accessible name, so two toggles on a page differ. */
export function ClampedText({ text, what, className = "" }: { text: string; what: string; className?: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const id = useId();
  const [open, setOpen] = useState(false), [more, setMore] = useState(false);
  useLayoutEffect(() => {
    const paragraph = ref.current;
    if (!paragraph || open) return;
    const measure = () => setMore(paragraph.scrollHeight > paragraph.clientHeight + 1);
    measure();
    // A web font arriving later changes the text's height but not the clamped box's, so measure again then.
    void document.fonts?.ready.then(measure);
    const observer = new ResizeObserver(measure);
    observer.observe(paragraph);
    return () => observer.disconnect();
  }, [open, text]);
  return <>
    <p ref={ref} id={id} className={`${className} clamped-text${open ? "" : " is-clamped"}`.trim()}>{text}</p>
    {(more || open) && <button type="button" className="text-button clamped-text-toggle" aria-expanded={open} aria-controls={id} aria-label={`${open ? "Show less" : "Show all"} ${what}`} onClick={() => setOpen(value => !value)}>{open ? "Show less" : "Show all"}</button>}
  </>;
}
