"use client";

import { useId, useLayoutEffect, useRef, useState } from "react";

/** A paragraph shown to its first three lines, with "Show all" only when there is more (D77's notes near the top). */
export function ClampedText({ text, className = "" }: { text: string; className?: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const id = useId();
  const [open, setOpen] = useState(false), [more, setMore] = useState(false);
  useLayoutEffect(() => {
    const paragraph = ref.current;
    if (!paragraph || open) return;
    const measure = () => setMore(paragraph.scrollHeight > paragraph.clientHeight + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(paragraph);
    return () => observer.disconnect();
  }, [open, text]);
  return <>
    <p ref={ref} id={id} className={`${className} clamped-text${open ? "" : " is-clamped"}`.trim()}>{text}</p>
    {(more || open) && <button type="button" className="text-button clamped-text-toggle" aria-expanded={open} aria-controls={id} onClick={() => setOpen(value => !value)}>{open ? "Show less" : "Show all"}</button>}
  </>;
}
