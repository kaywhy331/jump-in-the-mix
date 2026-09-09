"use client";

import { useMemo, useState } from "react";
import { SUPPORT_FAQS } from "@/lib/support-content";
import { AppIcon } from "@/components/AppIcon";

export function SupportFaq() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
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

  return (
    <section className="card support-faq-card" aria-labelledby="support-faq-heading">
      <div className="card-header">
        <div>
          <h2 id="support-faq-heading">Frequently asked questions</h2>
          <p>Search for a quick, plain-language answer.</p>
        </div>
        <span className="status-pill">{results.length}</span>
      </div>

      <div className="support-faq-filters">
        <label className="field">
          <span className="field-label">Search Help</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search contacts, mixes, imports, privacy…"
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

      <div className="support-faq-list">
        {results.map((item) => (
          <details className="support-faq-item" key={item.question}>
            <summary>
              <span>{item.question}</span>
              <AppIcon name="add" />
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
            <span>Clear the filters or use the help option below.</span>
          </div>
        )}
      </div>
    </section>
  );
}
