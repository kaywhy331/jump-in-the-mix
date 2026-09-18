"use client";
import { useEffect, useRef, useState } from "react";

export function PublicContents() {
  const container = useRef<HTMLElement>(null);
  const [sections, setSections] = useState<Array<{ id: string; label: string }>>([]);
  useEffect(() => {
    const main = container.current?.closest("main");
    if (!main) return;
    const headings = [...main.querySelectorAll("h2")];
    if (headings.length < 3) return;
    setSections(headings.map((heading, index) => {
      if (!heading.id) heading.id = `topic-${index + 1}`;
      return { id: heading.id, label: heading.textContent ?? `Topic ${index + 1}` };
    }));
  }, []);
  return <nav ref={container} aria-label="On this page" hidden={!sections.length} className="public-contents"><strong>On this page</strong><ul>{sections.map(section => <li key={section.id}><a href={`#${section.id}`}>{section.label}</a></li>)}</ul></nav>;
}
