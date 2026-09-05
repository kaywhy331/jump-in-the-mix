"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import styles from "@/components/JumpWorkflow.module.css";

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

export type OpenedJumpDetail = {
  jumpId: string;
  contactName: string;
  channel: string;
  openedAt: number;
};

type JumpStateDetail = {
  jumpId: string;
  status: OutcomeResponse["status"];
};

const SESSION_KEY = "jitm:opened-jump";
const SESSION_MAX_AGE_MS = 2 * 60 * 60 * 1000;

function requestId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function dispatchJumpState(detail: JumpStateDetail): void {
  window.dispatchEvent(new CustomEvent<JumpStateDetail>("jitm:jump-state", { detail }));
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
  children
}: {
  jumpId: string;
  contactName: string;
  children: ReactNode;
}) {
  const [state, setState] = useState<"ACTIVE" | "DONE" | "SKIPPED" | "HIDDEN">("ACTIVE");
  const [undoing, setUndoing] = useState(false);
  const [error, setError] = useState("");
  const hideTimer = useRef<number | null>(null);

  useEffect(() => {
    const onState = (event: Event) => {
      const detail = (event as CustomEvent<JumpStateDetail>).detail;
      if (!detail || detail.jumpId !== jumpId) return;
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
      if (detail.status === "PENDING") {
        setState("ACTIVE");
        return;
      }
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
    setUndoing(true);
    setError("");
    try {
      await saveOutcome(jumpId, "REOPENED");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The follow-up could not be reopened.");
    } finally {
      setUndoing(false);
    }
  };

  if (state === "HIDDEN") return null;
  if (state !== "ACTIVE") {
    return (
      <div className={styles.cardWrapper} data-jump-workflow={jumpId}>
        <div className={styles.completedPlaceholder} role="status">
          <span>
            <strong>{state === "SKIPPED" ? "Follow-up skipped" : "Follow-up completed"}</strong>
            <small>{contactName} · the next follow-up is ready</small>
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

function readOpenedJump(): OpenedJumpDetail | null {
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<OpenedJumpDetail>;
    if (!value.jumpId || !value.contactName || !value.channel || !value.openedAt) return null;
    if (Date.now() - value.openedAt > SESSION_MAX_AGE_MS) {
      window.sessionStorage.removeItem(SESSION_KEY);
      return null;
    }
    return value as OpenedJumpDetail;
  } catch {
    return null;
  }
}

function clearOpenedJump(): void {
  try { window.sessionStorage.removeItem(SESSION_KEY); } catch { /* Storage may be blocked. */ }
}

export function JumpReturnTray() {
  const [session, setSession] = useState<OpenedJumpDetail | null>(null);
  const [visible, setVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [outcome, setOutcome] = useState<Outcome>("COMPLETED");
  const [note, setNote] = useState("");
  const [visibility, setVisibility] = useState<"WORKSPACE" | "PRIVATE">("WORKSPACE");
  const [nextDate, setNextDate] = useState("");
  const [nextTime, setNextTime] = useState("10:00");

  useEffect(() => {
    const revealStored = () => {
      const stored = readOpenedJump();
      if (!stored) return;
      setSession(stored);
      setVisible(true);
    };
    const onOpened = (event: Event) => {
      const detail = (event as CustomEvent<OpenedJumpDetail>).detail;
      if (!detail) return;
      setSession(detail);
      setVisible(false);
      window.setTimeout(() => {
        const stored = readOpenedJump();
        if (stored?.jumpId === detail.jumpId) setVisible(true);
      }, 900);
    };
    const onVisibility = () => { if (document.visibilityState === "visible") revealStored(); };
    const onState = (event: Event) => {
      const detail = (event as CustomEvent<JumpStateDetail>).detail;
      if (detail && session?.jumpId === detail.jumpId && detail.status !== "PENDING") {
        clearOpenedJump();
        setVisible(false);
      }
    };

    window.addEventListener("jitm:jump-opened", onOpened);
    window.addEventListener("focus", revealStored);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("jitm:jump-state", onState);
    return () => {
      window.removeEventListener("jitm:jump-opened", onOpened);
      window.removeEventListener("focus", revealStored);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("jitm:jump-state", onState);
    };
  }, [session?.jumpId]);

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
    clearOpenedJump();
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
        nextDate: nextDate || undefined,
        nextTime: nextDate ? nextTime : undefined
      } : {});
      clearOpenedJump();
      setVisible(false);
      setNote("");
      setNextDate("");
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
          <label>
            <span>Next follow-up date</span>
            <input type="date" value={nextDate} onChange={(event) => setNextDate(event.target.value)} required={outcome === "RESCHEDULED"} />
          </label>
          <label>
            <span>Time</span>
            <input type="time" value={nextTime} onChange={(event) => setNextTime(event.target.value)} disabled={!nextDate} />
          </label>
          <div className={styles.formActions}>
            <button className="button primary" type="submit" disabled={saving}>{saving ? "Saving…" : "Save outcome"}</button>
          </div>
        </form>
      </details>
      {error && <p className={styles.error} role="alert">{error}</p>}
    </aside>
  );
}
