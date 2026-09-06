"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "@/components/JumpWorkflow.module.css";
import { formatDateTime, type DisplayFormatPreferences } from "@/lib/format";

type TimelineItem = {
  id: string;
  source: "activity" | "jump";
  kind: "JUMP_OUTCOME" | "CUSTOMER_NOTE" | "PRIVATE_UPDATE" | "SYSTEM";
  outcome: string | null;
  channel: string | null;
  visibility: "WORKSPACE" | "PRIVATE";
  summary: string | null;
  nextCommitmentAt: string | null;
  occurredAt: string;
};

type TimelinePayload = {
  items?: TimelineItem[];
  error?: string;
};

function requestId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function label(item: TimelineItem): string {
  if (item.kind === "CUSTOMER_NOTE") return "Note";
  if (item.kind === "PRIVATE_UPDATE") return "Private note";
  if (item.kind === "SYSTEM") return "System update";
  if (item.outcome === "CONNECTED") return "Connected";
  if (item.outcome === "LEFT_VOICEMAIL") return "Left voicemail";
  if (item.outcome === "NO_ANSWER") return "No answer";
  if (item.outcome === "NOT_SENT") return "Not sent";
  if (item.outcome === "WRONG_NUMBER") return "Wrong number";
  if (item.outcome === "RESCHEDULED") return "Rescheduled";
  if (item.outcome === "SKIPPED") return "Follow-up skipped";
  if (item.outcome === "REOPENED") return "Follow-up reopened";
  return "Follow-up completed";
}

export function ContactTimeline({
  contactId,
  displayPreferences
}: {
  contactId: string;
  displayPreferences: DisplayFormatPreferences;
}) {
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [privateNote, setPrivateNote] = useState(false);
  const [summary, setSummary] = useState("");
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<"ALL" | "COMMUNICATIONS" | "NOTES">("ALL");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/contacts/${encodeURIComponent(contactId)}/activity`, { cache: "no-store" });
      const payload = await response.json().catch(() => ({})) as TimelinePayload;
      if (!response.ok) throw new Error(payload.error || "The Contact timeline could not be loaded.");
      setItems(payload.items ?? []);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The Contact timeline could not be loaded.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { setReady(true); void load(); }, [contactId]);

  const visibleItems = useMemo(() => items.filter((item) => {
    if (filter === "COMMUNICATIONS") return item.kind === "JUMP_OUTCOME";
    if (filter === "NOTES") return item.kind === "CUSTOMER_NOTE" || item.kind === "PRIVATE_UPDATE";
    return true;
  }), [filter, items]);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!summary.trim()) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/contacts/${encodeURIComponent(contactId)}/activity`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: privateNote ? "PRIVATE_UPDATE" : "CUSTOMER_NOTE", summary, requestId: requestId() })
      });
      const payload = await response.json().catch(() => ({})) as { item?: TimelineItem; error?: string };
      if (!response.ok || !payload.item) throw new Error(payload.error || "The note could not be saved.");
      setItems((current) => [{ ...payload.item!, source: "activity", outcome: null, channel: null, nextCommitmentAt: null }, ...current]);
      setSummary("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The note could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.timeline}>
      <form id="add-note" className={styles.noteComposer} onSubmit={submit}>
        <label>
          <span>Add a note</span>
          <textarea disabled={!ready} value={summary} onChange={(event) => setSummary(event.target.value)} maxLength={4000} placeholder="What should you remember about this person or conversation?" required />
        </label>
        <div>
          <label className="checkbox-row"><input type="checkbox" disabled={!ready} checked={privateNote} onChange={(event) => setPrivateNote(event.target.checked)} /><span>Keep private (never used in messages)</span></label>
          <button className="button primary" type="submit" disabled={!ready || saving}>{saving ? "Saving…" : "Add update"}</button>
        </div>
      </form>

      <div className="filter-bar" aria-label="Timeline filters">
        <button className={filter === "ALL" ? "button primary" : "button"} type="button" onClick={() => setFilter("ALL")}>All</button>
        <button className={filter === "COMMUNICATIONS" ? "button primary" : "button"} type="button" onClick={() => setFilter("COMMUNICATIONS")}>Communications</button>
        <button className={filter === "NOTES" ? "button primary" : "button"} type="button" onClick={() => setFilter("NOTES")}>Notes</button>
        <button className="button" type="button" onClick={() => void load()} disabled={loading}>Refresh</button>
      </div>

      {error && <p className={styles.error} role="alert">{error}</p>}
      {loading && <p className={styles.loading} role="status">Loading relationship history…</p>}
      {!loading && !visibleItems.length && <p className={styles.loading}>No history yet. Complete a follow-up or add the first note above.</p>}
      {visibleItems.length > 0 && (
        <ol className={styles.timelineList}>
          {visibleItems.map((item) => (
            <li className={styles.timelineItem} key={item.id}>
              <span className={styles.timelineDot} aria-hidden="true" />
              <div className={styles.timelineBody}>
                <div className={styles.timelineMeta}>
                  <strong>{label(item)}</strong>
                  {item.channel && <span>{item.channel.replaceAll("_", " ").toLowerCase()}</span>}
                  {item.visibility === "PRIVATE" && <span className={styles.privateBadge}>Private</span>}
                  <time dateTime={item.occurredAt}>{formatDateTime(item.occurredAt, displayPreferences)}</time>
                </div>
                {item.summary && <p>{item.summary}</p>}
                {item.nextCommitmentAt && <p><strong>Next follow-up:</strong> {formatDateTime(item.nextCommitmentAt, displayPreferences)}</p>}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
