"use client";
import { AppIcon } from "@/components/AppIcon";

import type { ReactNode } from "react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import styles from "@/components/JumpWorkflow.module.css";
import { useBrowserScope } from "@/components/BrowserAccountBoundary";
import { clearOpenedJump, readOpenedJump, validOpenedJump, type OpenedJumpDetail } from "@/lib/opened-jump-state";
import { WhenPicker } from "@/components/WhenPicker";
import { addDays, dateKeyOf } from "@/lib/when-picker";
export type { OpenedJumpDetail } from "@/lib/opened-jump-state";

type Outcome =
  | "COMPLETED"
  | "CONNECTED"
  | "LEFT_VOICEMAIL"
  | "NO_ANSWER"
  | "NOT_SENT"
  | "WRONG_NUMBER"
  | "RESCHEDULED"
  | "SKIPPED"
  | "REOPENED";

type OutcomeResponse = {
  status: "PENDING" | "DONE" | "SKIPPED";
  activityId: string;
  nextCommitmentAt: string | null;
  jumpDateId: string | null;
  error?: string;
};

type JumpStateDetail = {
  jumpId: string;
  status: OutcomeResponse["status"];
};

function requestId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function dispatchJumpState(detail: JumpStateDetail): void {
  // Refresh observers must see the committed Undo control before their queued
  // checks run. An async outcome event otherwise leaves a gap before React
  // paints, allowing an early read to become stale during the Undo window.
  flushSync(() => {
    window.dispatchEvent(new CustomEvent<JumpStateDetail>("jitm:jump-state", { detail }));
  });
}

async function saveOutcome(
  jumpId: string,
  outcome: Outcome,
  details: { note?: string; visibility?: "WORKSPACE" | "PRIVATE"; nextDate?: string; nextTime?: string } = {}
): Promise<OutcomeResponse> {
  const response = await fetch(`/api/jumps/${encodeURIComponent(jumpId)}/outcome`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ outcome, requestId: requestId(), ...details })
  });
  const payload = await response.json().catch(() => ({})) as OutcomeResponse;
  if (!response.ok) throw new Error(payload.error || "The follow-up outcome could not be saved.");
  dispatchJumpState({ jumpId, status: payload.status });
  return payload;
}

export function JumpWorkflowCard({
  jumpId,
  contactName,
  revision,
  children
}: {
  jumpId: string;
  contactName: string;
  revision: string;
  children: ReactNode;
}) {
  const [state, setState] = useState<"ACTIVE" | "DONE" | "SKIPPED" | "HIDDEN">("ACTIVE");
  const [undoing, setUndoing] = useState(false);
  const [error, setError] = useState("");
  const hideTimer = useRef<number | null>(null);
  const latestRevision = useRef(revision), outcomeRevision = useRef(revision);
  useLayoutEffect(() => { latestRevision.current = revision; }, [revision]);
  useEffect(() => {
    // A fresh server read may show completion, or a later reopening by someone
    // else. Accept it after Undo without remounting untouched form controls.
    if (state === "HIDDEN" && revision !== outcomeRevision.current) setState("ACTIVE");
  }, [revision, state]);

  useEffect(() => {
    const onState = (event: Event) => {
      const detail = (event as CustomEvent<JumpStateDetail>).detail;
      if (!detail || detail.jumpId !== jumpId) return;
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
      if (detail.status === "PENDING") {
        setState("ACTIVE");
        return;
      }
      outcomeRevision.current = latestRevision.current;
      setState(detail.status);
      hideTimer.current = window.setTimeout(() => setState("HIDDEN"), 10_000);
    };
    window.addEventListener("jitm:jump-state", onState);
    return () => {
      window.removeEventListener("jitm:jump-state", onState);
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
    };
  }, [jumpId]);

  const undo = async () => {
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    setUndoing(true);
    setError("");
    try {
      await saveOutcome(jumpId, "REOPENED");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The follow-up could not be reopened.");
      hideTimer.current = window.setTimeout(() => setState("HIDDEN"), 10_000);
    } finally {
      setUndoing(false);
    }
  };

  if (state === "HIDDEN") return null;
  if (state !== "ACTIVE") {
    return (
      <div className={styles.cardWrapper} data-jump-workflow={jumpId} data-follow-up-undo="true">
        <div className={styles.completedPlaceholder} role="status">
          <span>
            <strong>{state === "SKIPPED" ? "Follow-up skipped" : "Follow-up completed"}</strong>
            <small>{contactName} · you can undo this for a moment</small>
          </span>
          <button className="button small" type="button" onClick={undo} disabled={undoing}>{undoing ? "Restoring…" : "Undo"}</button>
        </div>
        {error && <p className={styles.error} role="alert">{error}</p>}
      </div>
    );
  }
  return <div className={styles.cardWrapper} data-jump-workflow={jumpId}>{children}</div>;
}

export function JumpOutcomeButton({
  jumpId,
  outcome = "COMPLETED",
  className,
  ariaLabel,
  children,
  disabled
}: {
  jumpId: string;
  outcome?: Outcome;
  className?: string;
  ariaLabel?: string;
  children: ReactNode;
  disabled?: boolean;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    setSaving(true);
    setError("");
    try {
      await saveOutcome(jumpId, outcome);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The follow-up could not be updated.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <span>
      <button className={className} type="button" aria-label={ariaLabel} onClick={submit} disabled={saving || disabled}>{saving ? "Saving…" : children}</button>
      {error && <small className={styles.error} role="alert">{error}</small>}
    </span>
  );
}

export function JumpReturnTray() {
  const scope = useBrowserScope();
  const opened = useRef<OpenedJumpDetail | null>(null);
  const revealTimer = useRef<number | undefined>(undefined);
  const [session, setSession] = useState<OpenedJumpDetail | null>(null);
  const [visible, setVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [outcome, setOutcome] = useState<Outcome>("COMPLETED");
  const [note, setNote] = useState("");
  const [visibility, setVisibility] = useState<"WORKSPACE" | "PRIVATE">("WORKSPACE");
  // Opt in to a next follow-up; once chosen it starts on the usual window, tomorrow at ten.
  const [scheduleNext, setScheduleNext] = useState(false);
  const [nextDate, setNextDate] = useState(() => addDays(dateKeyOf(new Date()), 1));
  const [nextTime, setNextTime] = useState("10:00");
  const wantsNext = scheduleNext || outcome === "RESCHEDULED";

  useEffect(() => {
    if (!scope) return;
    const revealStored = () => {
      const stored = readOpenedJump(scope) ?? (validOpenedJump(opened.current, scope) ? opened.current : null);
      if (!stored) return;
      opened.current = stored;
      setSession(stored);
      setVisible(true);
    };
    const onOpened = (event: Event) => {
      const detail = (event as CustomEvent<OpenedJumpDetail>).detail;
      if (!validOpenedJump(detail, scope)) return;
      opened.current = detail;
      setSession(detail);
      setVisible(false);
      window.clearTimeout(revealTimer.current);
      revealTimer.current = window.setTimeout(() => setVisible(true), 900);
    };
    const onVisibility = () => { if (document.visibilityState === "visible") revealStored(); };
    const onState = (event: Event) => {
      const detail = (event as CustomEvent<JumpStateDetail>).detail;
      if (detail && opened.current?.jumpId === detail.jumpId && detail.status !== "PENDING") {
        clearOpenedJump(scope);
        opened.current = null;
        window.clearTimeout(revealTimer.current);
        setVisible(false);
      }
    };

    window.addEventListener("jitm:jump-opened", onOpened);
    window.addEventListener("focus", revealStored);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("jitm:jump-state", onState);
    revealStored();
    return () => {
      window.clearTimeout(revealTimer.current);
      window.removeEventListener("jitm:jump-opened", onOpened);
      window.removeEventListener("focus", revealStored);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("jitm:jump-state", onState);
    };
  }, [scope]);

  const isCall = session?.channel === "PHONE_CALL" || session?.channel === "VOICEMAIL";
  const quickOutcomes = useMemo<Array<{ value: Outcome; label: string }>>(() => isCall
    ? [
        { value: "CONNECTED", label: "Connected" },
        { value: "LEFT_VOICEMAIL", label: "Left voicemail" },
        { value: "NO_ANSWER", label: "No answer" },
        { value: "NOT_SENT", label: "Did not call" }
      ]
    : [
        { value: "COMPLETED", label: "Sent" },
        { value: "NOT_SENT", label: "Not sent" }
      ], [isCall]);

  const close = () => {
    opened.current = null;
    window.clearTimeout(revealTimer.current);
    if (scope) clearOpenedJump(scope);
    setVisible(false);
    setError("");
  };

  const save = async (selected: Outcome, details = false) => {
    if (!session) return;
    setSaving(true);
    setError("");
    try {
      await saveOutcome(session.jumpId, selected, details ? {
        note,
        visibility,
        nextDate: wantsNext ? nextDate : undefined,
        nextTime: wantsNext ? nextTime : undefined
      } : {});
      if (scope) clearOpenedJump(scope);
      opened.current = null;
      window.clearTimeout(revealTimer.current);
      setVisible(false);
      setNote("");
      setScheduleNext(false);
      setNextDate(addDays(dateKeyOf(new Date()), 1));
      setNextTime("10:00");
      setOutcome("COMPLETED");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The outcome could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  if (!visible || !session) return null;
  return (
    <aside className={styles.returnTray} aria-label={`Finish follow-up with ${session.contactName}`}>
      <div className={styles.trayHeading}>
        <div>
          <strong>How did the follow-up with {session.contactName} go?</strong>
          <p>Record what happened, then continue with the next follow-up.</p>
        </div>
        <button className="button small" type="button" onClick={close} aria-label="Close outcome tray">Close</button>
      </div>
      <div className={styles.outcomeGrid}>
        {quickOutcomes.map((item) => (
          <button className={item.value === "NOT_SENT" ? "button" : "button primary"} type="button" key={item.value} disabled={saving} onClick={() => save(item.value)}>{item.label}</button>
        ))}
      </div>
      <details className={styles.detailDisclosure}>
        <summary>Add a note, detailed outcome, or next follow-up</summary>
        <form className={styles.detailForm} onSubmit={(event) => { event.preventDefault(); void save(outcome, true); }}>
          <label>
            <span>Outcome</span>
            <select value={outcome} onChange={(event) => setOutcome(event.target.value as Outcome)}>
              <option value="COMPLETED">Completed</option>
              <option value="CONNECTED">Connected</option>
              <option value="LEFT_VOICEMAIL">Left voicemail</option>
              <option value="NO_ANSWER">No answer</option>
              <option value="NOT_SENT">Not sent</option>
              <option value="WRONG_NUMBER">Wrong number</option>
              <option value="RESCHEDULED">Rescheduled</option>
              <option value="SKIPPED">Skip</option>
            </select>
          </label>
          <label className={styles.fullField}>
            <span>Outcome note</span>
            <textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={4000} placeholder="What happened, what they committed to, or what matters next" />
          </label>
          <label className={`checkbox-card ${styles.fullField}`}>
            <input type="checkbox" checked={visibility === "PRIVATE"} onChange={(event) => setVisibility(event.target.checked ? "PRIVATE" : "WORKSPACE")} />
            <span><strong>Keep private</strong><small>Never insert this note into messages.</small></span>
          </label>
          <label className={`checkbox-card ${styles.fullField}`}>
            <input type="checkbox" checked={wantsNext} disabled={outcome === "RESCHEDULED"} onChange={(event) => setScheduleNext(event.target.checked)} />
            <span><strong>Schedule the next follow-up</strong><small>{outcome === "RESCHEDULED" ? "A rescheduled follow-up needs its new date." : "Pick a day and time to see them again on Today."}</small></span>
          </label>
          {wantsNext && <div className={styles.fullField}>
            <WhenPicker label="Next follow-up" date={nextDate} time={nextTime} noPast onChange={(next) => { setNextDate(next.date); if (next.time) setNextTime(next.time); }} />
          </div>}
          <div className={styles.formActions}>
            <button className="button primary" type="submit" disabled={saving}>{saving ? "Saving…" : "Save outcome"}</button>
          </div>
        </form>
      </details>
      {error && <p className={styles.error} role="alert">{error}</p>}
    </aside>
  );
}

// The recorded completion time is a button; clicking it opens a picker so it can be corrected.
export function JumpStampEditor({ jumpId, completedAt, label }: { jumpId: string; completedAt: string; label: string }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(() => { const d = new Date(completedAt); const pad = (n: number) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; });
  const [shown, setShown] = useState(label);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const save = async () => {
    const next = new Date(value);
    if (Number.isNaN(next.getTime())) { setError("Choose a valid date and time."); return; }
    setSaving(true); setError("");
    try {
      const response = await fetch(`/api/jumps/${encodeURIComponent(jumpId)}/completed-at`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ completedAt: next.toISOString() }) });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "The time could not be saved.");
      setShown(new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(next));
      setEditing(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The time could not be saved.");
    } finally { setSaving(false); }
  };
  if (!editing) return <button type="button" className="jump-stamp" title="Click to change the time" aria-label={`Completed ${shown}. Change the time`} onClick={() => setEditing(true)}><AppIcon name="check" /><span>{shown}</span></button>;
  return <span className="jump-stamp-editor">
    <input type="datetime-local" aria-label="Completed time" value={value} onChange={(event) => setValue(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void save(); } if (event.key === "Escape") setEditing(false); }} />
    <button className="button small" type="button" onClick={() => void save()} disabled={saving}>{saving ? "Saving…" : "Save"}</button>
    <button className="button small" type="button" onClick={() => setEditing(false)} disabled={saving}>Cancel</button>
    {error && <small className={styles.error} role="alert">{error}</small>}
  </span>;
}
