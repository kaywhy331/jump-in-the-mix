"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import styles from "@/components/ContactTimeline.module.css";
import { Sheet } from "@/components/Sheet";
import { AppIcon } from "@/components/AppIcon";
import { useConfirmDialog } from "@/components/useConfirmDialog";
import { formatDate, formatDateTime, type DisplayFormatPreferences } from "@/lib/format";

type TimelineItem = {
  conversation?: boolean;
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
  nextCursor?: string | null;
  error?: string;
};

function requestId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function label(item: TimelineItem): string {
  if (item.conversation) return item.visibility === "PRIVATE" ? "Private conversation" : "Conversation";
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
  const noteDetails = useRef<HTMLDetailsElement>(null);
  useEffect(() => { const openNote = () => { if (["#add-note", "#log-conversation"].includes(location.hash) && noteDetails.current) { noteDetails.current.open = true; if (location.hash === "#log-conversation") setConversation(true); noteDetails.current.querySelector("textarea")?.focus(); } }; openNote(); window.addEventListener("hashchange", openNote); return () => window.removeEventListener("hashchange", openNote); }, []);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [confirm, confirmDialog] = useConfirmDialog();
  const [correction, setCorrection] = useState("");
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [conversation, setConversation] = useState(false);
  const [privateNote, setPrivateNote] = useState(false);
  const [summary, setSummary] = useState("");
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<"ALL" | "COMMUNICATIONS" | "NOTES">("ALL");

  const requestVersion = useRef(0);
  const load = async (older = false) => {
    const version = ++requestVersion.current;
    setLoading(true);
    setError("");
    try {
      const query = new URLSearchParams({ filter });
      if (older && nextCursor) query.set("cursor", nextCursor);
      const response = await fetch(`/api/contacts/${encodeURIComponent(contactId)}/activity?${query}`, { cache: "no-store" });
      const payload = await response.json().catch(() => ({})) as TimelinePayload;
      if (version !== requestVersion.current) return;
      if (!response.ok) throw new Error(payload.error || "The Contact timeline could not be loaded.");
      setItems(current => older ? [...current, ...(payload.items ?? []).filter(item => !current.some(existing => existing.id === item.id))] : payload.items ?? []);
      setNextCursor(payload.nextCursor ?? null);
    } catch (reason) {
      if (version === requestVersion.current) setError(reason instanceof Error ? reason.message : "The Contact timeline could not be loaded.");
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  };

  useEffect(() => { setReady(true); void load(); return () => { requestVersion.current++; }; }, [contactId, filter]);

  const visibleItems = useMemo(() => items.filter((item) => {
    if (filter === "COMMUNICATIONS") return item.kind === "JUMP_OUTCOME" || item.conversation === true;
    if (filter === "NOTES") return item.kind === "CUSTOMER_NOTE" || item.kind === "PRIVATE_UPDATE";
    return true;
  }), [filter, items]);

  const correctNote = async (item: TimelineItem, remove = false) => {
    if (remove && !(await confirm({ title: "Remove this note from the timeline?", description: "This cannot be undone.", confirmLabel: "Remove note", danger: true }))) return;
    setSaving(true); setError("");
    try {
      const response = await fetch(`/api/contacts/${encodeURIComponent(contactId)}/activity`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: item.id, expectedSummary: item.summary ?? "", summary: correction, remove }) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error ?? "The note could not be changed.");
      setItems(current => remove ? current.filter(value => value.id !== item.id) : current.map(value => value.id === item.id ? { ...value, summary: correction } : value));
      setEditing(null); setCorrection(""); window.dispatchEvent(new Event("jitm:contact-activity"));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The note could not be changed. Your correction is still here."); }
    finally { setSaving(false); }
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!summary.trim()) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/contacts/${encodeURIComponent(contactId)}/activity`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: privateNote ? "PRIVATE_UPDATE" : "CUSTOMER_NOTE", summary, conversation, requestId: requestId() })
      });
      const payload = await response.json().catch(() => ({})) as { item?: TimelineItem; error?: string };
      if (!response.ok || !payload.item) throw new Error(payload.error || "The note could not be saved.");
      setItems((current) => [{ ...payload.item!, source: "activity", outcome: null, channel: null, nextCommitmentAt: null }, ...current]);
      setSummary(""); setConversation(false);
      window.dispatchEvent(new Event("jitm:contact-activity"));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The note could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.timeline}>
      <div className="contact-section-heading"><h2>History</h2><Sheet trigger={<button type="button" className="contact-icon-button" aria-label="History options"><AppIcon name="more" /></button>} title="History options">      <div className="filter-bar" aria-label="Timeline filters">
        <button className={filter === "ALL" ? "button primary" : "button"} type="button" aria-pressed={filter === "ALL"} onClick={() => setFilter("ALL")}>All</button>
        <button className={filter === "COMMUNICATIONS" ? "button primary" : "button"} type="button" aria-pressed={filter === "COMMUNICATIONS"} onClick={() => setFilter("COMMUNICATIONS")}>Communications</button>
        <button className={filter === "NOTES" ? "button primary" : "button"} type="button" aria-pressed={filter === "NOTES"} onClick={() => setFilter("NOTES")}>Notes</button>
        <button className="button" type="button" onClick={() => void load()} disabled={loading}>Refresh</button>
      </div>
</Sheet></div>
      <details className="contact-note-composer" ref={noteDetails}><summary>Add a note</summary><form id="add-note" className={styles.noteComposer} onSubmit={submit}>
        <label>
          <span>Add a note</span>
          <textarea disabled={!ready} value={summary} onChange={(event) => setSummary(event.target.value)} maxLength={4000} placeholder="What should you remember about this person or conversation?" required />
        </label>
        <div>
          <label className="checkbox-row"><input type="checkbox" disabled={!ready} checked={conversation} onChange={event => setConversation(event.target.checked)} /><span>This records a conversation</span></label>
          <label className="checkbox-row"><input type="checkbox" disabled={!ready} checked={privateNote} onChange={(event) => setPrivateNote(event.target.checked)} /><span>Keep private (never used in messages)</span></label>
          <button className="button primary" type="submit" disabled={!ready || saving}>{saving ? "Saving…" : "Add update"}</button>
        </div>
      </form></details>


      {error && <p className={styles.error} role="alert">{error}</p>}
      {loading && <p className={styles.loading} role="status">Loading relationship history…</p>}
      {!loading && !visibleItems.length && <p className={styles.loading}>{filter === "ALL" ? "No history yet. Complete a follow-up or add the first note above." : "No events match this filter. Choose All to see other history."}</p>}
      {visibleItems.length > 0 && (
        <ol className={styles.timelineList}>
          {visibleItems.map((item) => (
            <li className={styles.timelineItem} key={item.id}>
              <time className={styles.timelineDate} dateTime={item.occurredAt} title={formatDateTime(item.occurredAt, displayPreferences)}>{formatDate(item.occurredAt, displayPreferences, { year: undefined })}</time>
              <div className={styles.timelineBody}>
                <div className={styles.timelineMeta}>
                  {(!item.summary || item.kind === "JUMP_OUTCOME" || item.conversation) && <strong>{label(item)}</strong>}
                  {item.channel && <span>{item.channel.replaceAll("_", " ").toLowerCase()}</span>}
                  {item.visibility === "PRIVATE" && <span className={styles.privateBadge}>Private</span>}

                </div>
                {item.summary && <p className={item.kind === "CUSTOMER_NOTE" || item.kind === "PRIVATE_UPDATE" ? styles.personalWords : undefined}>{item.summary}</p>}
                {(item.kind === "CUSTOMER_NOTE" || item.kind === "PRIVATE_UPDATE") && <div>{editing === item.id ? <form onSubmit={event => { event.preventDefault(); void correctNote(item); }}><label className="field"><span>Correct note</span><textarea value={correction} onChange={event => setCorrection(event.target.value)} maxLength={4000} required /></label><button className="button primary" type="submit" disabled={saving}>{saving ? "Saving…" : "Save correction"}</button><button className="button" type="button" onClick={() => setEditing(null)}>Cancel correction</button></form> : <details className={`disclosure-menu ${styles.noteActions}`}><summary aria-label={`Options for note from ${formatDateTime(item.occurredAt, displayPreferences)}`}><AppIcon name="more" /></summary><div><button type="button" className="text-button" onClick={() => { setEditing(item.id); setCorrection(item.summary ?? ""); }}>Edit note</button><button type="button" className="text-button" disabled={saving} onClick={() => void correctNote(item, true)}>Remove note</button></div></details>}</div>}
                {item.nextCommitmentAt && <p><strong>Next follow-up:</strong> {formatDateTime(item.nextCommitmentAt, displayPreferences)}</p>}
              </div>
            </li>
          ))}
        </ol>
      )}
      <p className="sr-only" role="status">Showing {items.length} events in this view.</p>
      {nextCursor && <button type="button" className="button" disabled={loading} onClick={() => void load(true)}>Load older history</button>}
      {confirmDialog}
    </div>
  );
}
