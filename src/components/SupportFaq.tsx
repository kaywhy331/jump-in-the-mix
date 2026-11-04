"use client";

import { useMemo, useState } from "react";
import { SUPPORT_FAQS } from "@/lib/support-content";
import { AppIcon } from "@/components/AppIcon";

export const INITIAL_FAQ_COUNT = 5;

export function SupportFaq() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [showAll, setShowAll] = useState(false);
  const categories = useMemo(
    () => [...new Set(SUPPORT_FAQS.map((item) => item.category))],
    []
  );
  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return SUPPORT_FAQS.filter((item) => {
      if (category !== "all" && item.category !== category) return false;
      if (!needle) return true;
      return [item.question, item.answer, item.category, ...item.keywords]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [category, query]);
  const filtering = Boolean(query.trim()) || category !== "all";
  const visibleResults = showAll || filtering ? results : results.slice(0, INITIAL_FAQ_COUNT);

  return (
    <section className="card support-faq-card" aria-labelledby="support-faq-heading">
      <div className="card-header">
        <div>
          <h2 id="support-faq-heading">Frequently asked questions</h2>
          <p>Search for a quick, plain-language answer.</p>
        </div>
        <span className="status-pill" role="status" aria-live="polite">{filtering ? `${results.length} matching answers` : `${visibleResults.length} of ${results.length} answers`}</span>
      </div>

      <div className="support-faq-filters">
        <label className="field">
          <span className="field-label">Search Help</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search contacts, Mixes, imports, privacy…"
            autoComplete="off"
          />
        </label>
        <label className="field">
          <span className="field-label">Topic</span>
          <select value={category} onChange={(event) => setCategory(event.target.value)}>
            <option value="all">All topics</option>
            {categories.map((item) => <option value={item} key={item}>{item}</option>)}
          </select>
        </label>
      </div>

      <div className="support-faq-list" id="support-faq-list">
        {visibleResults.map((item) => (
          <details className="support-faq-item" key={item.question}>
            <summary>
              <span>{item.question}</span>
              <AppIcon name="chevronDown" />
            </summary>
            <div>
              <span className="support-faq-topic">{item.category}</span>
              <p>{item.answer}</p>
            </div>
          </details>
        ))}
        {!results.length && (
          <div className="support-faq-empty" role="status">
            <strong>No FAQ matched that search.</strong>
            <span>Try another word, clear the filters or <a href="#contact-support">contact support</a>.</span>
            <button className="button" type="button" onClick={() => { setQuery(""); setCategory("all"); }}>Clear filters</button>
          </div>
        )}
      </div>
      {!filtering && results.length > INITIAL_FAQ_COUNT && (
        <div className="form-actions">
          <button className="button" type="button" aria-expanded={showAll} aria-controls="support-faq-list" onClick={() => setShowAll(!showAll)}>{showAll ? "Show fewer" : "View all"}</button>
        </div>
      )}
    </section>
  );
}
