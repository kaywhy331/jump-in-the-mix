"use client";

import { useEffect, useRef, useState } from "react";
import { AppIcon } from "@/components/AppIcon";
import { LIVE_SEARCH_DELAY_MS } from "@/components/GlobalLiveSearch";

/**
 * Today's search field: the list follows the typing, with no Search button (JITM-08 §2.29). TodayNavigation runs each
 * search, so a message draft still asks before the list changes, and focus stays in this field while the list updates.
 */
export function TodaySearch({ query, hidden, resultLine }: { query: string; hidden: [string, string][]; resultLine: string }) {
  const input = useRef<HTMLInputElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const searching = useRef(false);
  const [filled, setFilled] = useState(Boolean(query));
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => {
    // A link such as Reset filters changes the search without remounting this field. Follow it, but never overwrite
    // what the owner is still typing.
    const field = input.current;
    if (field && field !== document.activeElement && field.value.trim() !== query) {
      field.value = query;
      setFilled(Boolean(query));
    }
    if (searching.current) {
      searching.current = false;
      setAnnouncement(resultLine);
    }
  }, [query, resultLine]);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const search = () => {
    window.clearTimeout(timer.current);
    const field = input.current;
    if (!field?.form || field.value.trim() === query) return;
    searching.current = true;
    field.form.requestSubmit();
  };

  return <form className="today-search" action="/jumps" method="get" role="search" aria-label="Search Today" data-today-live-search="true" onSubmit={() => window.clearTimeout(timer.current)}>
    <AppIcon name="search" />
    <input ref={input} type="search" name="q" defaultValue={query} maxLength={160} placeholder="Search Today" aria-label="Find a person, Mix, or reason" autoComplete="off"
      onInput={event => {
        setFilled(Boolean(event.currentTarget.value));
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(search, LIVE_SEARCH_DELAY_MS);
      }} />
    {hidden.map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
    {filled && <button className="icon-button" type="button" aria-label="Clear search" onClick={() => {
      const field = input.current;
      if (!field) return;
      field.value = "";
      setFilled(false);
      field.focus();
      search();
    }}><AppIcon name="close" /></button>}
    <span className="sr-only" role="status" aria-live="polite">{announcement}</span>
  </form>;
}
