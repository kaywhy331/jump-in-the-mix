"use client";

import Link from "next/link";
import { useEffect, useId, useRef } from "react";

export function JourneyPersonDot({ person, canMove = true }: { person: { id: string; name: string; stage: string; next: { id: string; label: string; reason: string } | null }; canMove?: boolean }) {
  const id = useId();
  const button = useRef<HTMLButtonElement>(null);
  const popover = useRef<HTMLDivElement>(null);
  const position = () => {
    const bounds = button.current?.getBoundingClientRect();
    if (!bounds || !popover.current) return;
    const panel = popover.current;
    const width = Math.min(320, innerWidth - 32);
    panel.style.width = `${width}px`;
    const height = panel.getBoundingClientRect().height;
    const below = bounds.bottom + 12;
    const top = below + height <= innerHeight - 16 ? below : bounds.top - height - 12;
    panel.style.left = `${Math.max(16, Math.min(bounds.left + bounds.width / 2 - width / 2, innerWidth - width - 16))}px`;
    panel.style.top = `${Math.max(16, Math.min(top, innerHeight - height - 16))}px`;
  };
  useEffect(() => {
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    const observer = new ResizeObserver(position);
    if (popover.current) observer.observe(popover.current);
    return () => { observer.disconnect(); window.removeEventListener("resize", position); window.removeEventListener("scroll", position, true); };
  }, []);
  return <><button ref={button} type="button" popoverTarget={id} onClick={position} className="journey-person-dot" aria-label={`View ${person.name}`} title={person.name}><span /></button>
    <div ref={popover} id={id} popover="auto" className="person-preview-bubble" onToggle={event => { if (event.newState === "open") position(); }} aria-labelledby={`${id}-name`}>
      <strong id={`${id}-name`}>{person.name}</strong><small>{person.stage}</small>
      <p>{person.next ? `${person.next.reason} · ${person.next.label}` : "Nothing scheduled"}</p>
      <div className="person-preview-actions">{person.next && <Link className="button small primary" href={`/jumps?jump=${encodeURIComponent(person.next.id)}&range=all`}>Review</Link>}
        {canMove && <button className="button small" type="button" onClick={() => { popover.current?.hidePopover(); document.getElementById(`journey-move-${person.id}`)?.click(); }}>Move</button>}
        <Link className="button small" href={`/contacts/${person.id}#contact-mixes`}>Touchpoint</Link><Link className="inline-action" href={`/contacts/${person.id}`}>Open</Link>
      </div>
    </div></>;
}

export function SelectQuietPeople({ count }: { count: number }) {
  return <aside className="journey-quiet-callout"><p>{count} on this page have nothing scheduled.</p><button className="button small primary" type="button" onClick={() => window.dispatchEvent(new Event("jitm:select-quiet"))}>Select them</button></aside>;
}
