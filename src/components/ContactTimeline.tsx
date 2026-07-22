"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "@/components/JumpWorkflow.module.css";

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
  if (item.kind === "CUSTOMER_NOTE") return "Customer note";
  if (item.kind === "PRIVATE_UPDATE") return "Private relationship update";
  if (item.kind === "SYSTEM") return "System update";
  if (item.outcome === "CONNECTED") return "Connected";
  if (item.outcome === "LEFT_VOICEMAIL") return "Left voicemail";
  if (item.outcome === "NO_ANSWER") return "No answer";
  if (item.outcome === "NOT_SENT") return "Not sent";
  if (item.outcome === "WRONG_NUMBER") return "Wrong number";
  if (item.outcome === "RESCHEDULED") return "Rescheduled";
  if (item.outcome === "SKIPPED") return "Jump skipped";
  if (item.outcome === "REOPENED") return "Jump reopened";
  return "Jump completed";
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export function ContactTimeline({ contactId }: { contactId: string }) {
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [kind, setKind] = useState<"CUSTOMER_NOTE" | "PRIVATE_UPDATE">("CUSTOMER_NOTE");
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

  useEffect(() => { void load(); }, [contactId]);

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
        body: JSON.stringify({ kind, summary, requestId: requestId() })
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
      <form className={styles.noteComposer} onSubmit={submit}>
        <label>
          <span>{kind === "CUSTOMER_NOTE" ? "Add customer note" : "Add private relationship update"}</span>
          <textarea value={summary} onChange={(event) => setSummary(event.target.value)} maxLength={4000} placeholder={kind === "CUSTOMER_NOTE" ? "How you met, preferences, interests, family context, or reusable background" : "Phone-call context, deal movement, objections, commitments, or sensitive updates"} required />
        </label>
        <div>
          <select aria-label="Note type" value={kind} onChange={(event) => setKind(event.target.value as typeof kind)}>
            <option value="CUSTOMER_NOTE">Customer note</option>
            <option value="PRIVATE_UPDATE">Private update</option>
          </select>
          <button className="button primary" type="submit" disabled={saving}>{saving ? "Saving…" : "Add update"}</button>
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
      {!loading && !visibleItems.length && <p className={styles.loading}>No timeline entries yet. Complete a Jump or add the first note above.</p>}
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
                  <time dateTime={item.occurredAt}>{formatDateTime(item.occurredAt)}</time>
                </div>
                {item.summary && <p>{item.summary}</p>}
                {item.nextCommitmentAt && <p><strong>Next follow-up:</strong> {formatDateTime(item.nextCommitmentAt)}</p>}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
