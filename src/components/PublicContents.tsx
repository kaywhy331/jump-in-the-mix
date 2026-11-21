"use client";
import { useEffect, useRef, useState } from "react";

// The one public table of contents (JITM-06 §2.28). It is a disclosure: open where there is room, and
// collapsed to its summary on phones, where the full list would fill the screen (JITM-08 §2.21). The
// phone query is the public menu boundary (JITM-07 §2.1) written as a range, so no width falls between.
const PHONE = "(width < 761px)";

export function PublicContents() {
  const container = useRef<HTMLElement>(null);
  const disclosure = useRef<HTMLDetailsElement>(null);
  const [sections, setSections] = useState<Array<{ id: string; label: string }>>([]);
  useEffect(() => {
    const main = container.current?.closest("main");
    if (!main) return;
    const headings = [...main.querySelectorAll("h2")];
    if (headings.length < 3) return;
    if (disclosure.current) disclosure.current.open = !matchMedia(PHONE).matches;
    setSections(headings.map((heading, index) => {
      if (!heading.id) heading.id = `topic-${index + 1}`;
      return { id: heading.id, label: heading.textContent ?? `Topic ${index + 1}` };
    }));
  }, []);
  return <nav ref={container} aria-label="On this page" hidden={!sections.length} className="public-contents"><details ref={disclosure}><summary>On this page</summary><ul>{sections.map(section => <li key={section.id}><a href={`#${section.id}`}>{section.label}</a></li>)}</ul></details></nav>;
}
