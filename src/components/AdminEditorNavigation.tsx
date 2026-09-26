"use client";
import { useEffect } from "react";
function reveal(id: string) {
  const target = document.getElementById(id);
  if (!target) return;
  let parent: HTMLElement | null = target;
  while (parent) { if (parent instanceof HTMLDetailsElement) parent.open = true; parent = parent.parentElement; }
  const details = target instanceof HTMLDetailsElement ? null : target.querySelector<HTMLDetailsElement>(":scope > details");
  if (details) details.open = true;
  target.tabIndex = -1;
  target.focus({ preventScroll: true });
  target.scrollIntoView({ block: "start", behavior: "smooth" });
}
export function AdminEditorNavigation({ prefix }: { prefix: string }) {
  useEffect(() => { if (window.location.hash.startsWith(`#${prefix}-`)) reveal(window.location.hash.slice(1)); }, [prefix]);
  return <nav className="admin-editor-jumps" aria-label="Content workflow">{[["draft", "1. Edit draft"], ["review", "2. Preview and publish"], ["history", "Version history"]].map(([step, label]) => <a key={step} href={`#${prefix}-${step}`} onClick={event => { event.preventDefault(); history.replaceState(null, "", `#${prefix}-${step}`); reveal(`${prefix}-${step}`); }}>{label}</a>)}</nav>;
}
