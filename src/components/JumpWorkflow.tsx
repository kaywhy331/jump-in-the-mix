"use client";
import { AppIcon } from "@/components/AppIcon";
import { WorkflowChoicesStatus, WorkflowOutcomeFields, useWorkflowChoices } from "@/components/WorkflowOutcomeFields";

import type { ReactNode } from "react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal, flushSync } from "react-dom";
import styles from "@/components/JumpWorkflow.module.css";
import { useBrowserScope } from "@/components/BrowserAccountBoundary";
import { readOpenedJump, readUnresolvedAttempts, resolveOpenedJump, validOpenedJump, type OpenedAttemptPayload, type OpenedJumpDetail } from "@/lib/opened-jump-state";
import { WhenPicker } from "@/components/WhenPicker";
import { useConfirmDialog } from "@/components/useConfirmDialog";
import { addDays, dateKeyOf } from "@/lib/when-picker";
import type { MixEndQuestion } from "@/lib/mix-end-question";
import { useConfirmationTarget } from "@/components/useConfirmationTarget";
import { setFollowUpDue } from "@/components/useFollowUpDue";
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
  nextJumpId?: string | null;
  attempt?: { id: string; evidence: "attempt" | "unavailable" | "mismatch" };
  /** Set when this outcome finished a Mix with nothing after it; Today asks what's next for the person. */
  mixEnd?: MixEndQuestion | null;
  duplicate?: boolean;
  error?: string;
};

// What the route answers: the stored outcome, or a refusal that names the follow-up's current
// status so a retry after a lost response can tell "already recorded" apart from a real conflict.
type OutcomePayload = Partial<Omit<OutcomeResponse, "status">> & { status?: OutcomeResponse["status"] | "CANCELED"; error?: string };

type OutcomeDetails = {
  note?: string;
  visibility?: "WORKSPACE" | "PRIVATE";
  nextDate?: string;
  nextTime?: string;
  workflowDecisions?: Array<{ ruleId: string; outcome: string }>;
};

// The handoff the outcome belongs to. An unacknowledged attempt travels again in full so the
// server can create or acknowledge it; this is logging only and never sends anything.
type OutcomeAttempt = { attemptId: string; payload?: OpenedAttemptPayload };

export type JumpStateDetail = {
  jumpId: string;
  status: OutcomeResponse["status"];
  /** Shown in the card's confirmation when a retry found the outcome already recorded. */
  notice?: string;
  /** The follow-up this outcome scheduled, named in the confirmation instead of the plan's next step. */
  nextFollowUpAt?: string | null;
  mixEnd?: MixEndQuestion | null;
  /** Where the owner recorded it: in a review, or in the tray after returning from their app. Today opens the next
   * review only after those, not after a quick action from the list (D70). */
  origin?: "review" | "tray";
  /** A done outcome that reached the person. A call with no answer or a wrong number didn't, so it doesn't count as
   * contacting them today (D98, TDY-01). Unset when this device doesn't know the outcome. */
  reached?: boolean;
};

/** Done outcomes that didn't reach the person (D98). The page's read leaves out the same ones. */
const UNREACHED_OUTCOMES = new Set<Outcome>(["NO_ANSWER", "WRONG_NUMBER"]);

type SaveResult =
  | { recorded: true; response: OutcomeResponse }
  | { recorded: false; status: "DONE" | "SKIPPED" };

/** Outcomes that finish the follow-up. A retry that finds it already finished counts as recorded, not as an error. */
const FINISHING_OUTCOMES: ReadonlySet<Outcome> = new Set<Outcome>(["COMPLETED", "CONNECTED", "LEFT_VOICEMAIL", "NO_ANSWER", "WRONG_NUMBER", "RESCHEDULED", "SKIPPED"]);

function newRequestId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** JSON-like data written with object keys sorted and undefined members dropped, so equal payloads read the same. */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item === undefined ? null : item)).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(",")}}`;
  }
  return JSON.stringify(value === undefined ? null : value);
}

/** A short deterministic hash (32-bit FNV-1a over the stable JSON): equal payloads share it, changed ones do not. */
export function stableHash(value: unknown): string {
  const text = stableStringify(value);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/**
 * One key per logical attempt: the same follow-up, outcome and payload retry under one request id,
 * while a changed payload or another handoff gets its own. Every key starts with the follow-up id
 * so all of its remembered attempts can be dropped together.
 */
export function outcomeRequestKey(jumpId: string, outcome: Outcome, details: OutcomeDetails = {}, attemptId?: string): string {
  return `${jumpId}:${outcome}:${stableHash(details)}${attemptId ? `:${attemptId}` : ""}`;
}

function alreadyRecordedCopy(status: "DONE" | "SKIPPED"): string {
  return status === "SKIPPED" ? "Already skipped." : "Already marked done.";
}

type OutcomeRequestIds = {
  /** The request id for this attempt, minted on first use and reused until the attempt succeeds. */
  claim: (key: string) => string;
  release: (key: string) => void;
  /** Drops every remembered attempt for a follow-up, e.g. once it changed state elsewhere, so an old answer cannot replay against its new state. */
  forget: (jumpId: string) => void;
};

function useOutcomeRequestIds(): OutcomeRequestIds {
  const ids = useRef<Map<string, string>>(new Map());
  return useMemo<OutcomeRequestIds>(() => ({
    claim: (key) => {
      const known = ids.current.get(key);
      if (known) return known;
      const id = newRequestId();
      ids.current.set(key, id);
      return id;
    },
    release: (key) => { ids.current.delete(key); },
    forget: (jumpId) => {
      for (const key of [...ids.current.keys()]) if (key.startsWith(`${jumpId}:`)) ids.current.delete(key);
    }
  }), []);
}

/** Focus is nowhere the owner put it: on the page itself, or still inside the confirmation. */
function focusIsFree(confirmation: HTMLElement | null): boolean {
  const focused = document.activeElement;
  return !focused || focused === document.body || Boolean(confirmation?.contains(focused));
}

/**
 * When a confirmation leaves with focus on its Undo, focus stays in the open review, or else goes to Today's heading.
 * If the owner has moved on, into a field for example, focus stays there.
 */
function focusAfterConfirmation(confirmation: HTMLElement | null, hadFocus = false): void {
  if (!(hadFocus || confirmation?.contains(document.activeElement)) || !focusIsFree(confirmation)) return;
  (document.querySelector<HTMLElement>(".follow-up-review-sheet[open] .sheet-header h2") ?? document.querySelector<HTMLElement>(".today-page-header h1"))?.focus({ preventScroll: true });
}

/**
 * A quick action from Today's list leaves with its card, which drops focus to the page. Unless the owner has moved on,
 * focus goes to the person's next row's Review, or else to the follow-up's Undo (JITM-10 §2.12, A11Y-02). In a review
 * Today moves focus itself (D70).
 */
function focusAfterQuickAction(jumpId: string, group: HTMLElement | null): void {
  const focused = document.activeElement;
  if (focused && focused !== document.body) return;
  (group?.querySelector<HTMLElement>("article.jump-card [data-review-trigger]") ?? document.querySelector<HTMLElement>(`[data-follow-up-undo][data-jump-workflow="${CSS.escape(jumpId)}"] button`))?.focus();
}

function formatNextFollowUp(value: string): string {
  return new Date(value).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
}

function dispatchJumpState(detail: JumpStateDetail): void {
  // Refresh observers must see the committed Undo control before their queued
  // checks run. An async outcome event otherwise leaves a gap before React
  // paints, allowing an early read to become stale during the Undo window.
  flushSync(() => {
    window.dispatchEvent(new CustomEvent<JumpStateDetail>("jitm:jump-state", { detail }));
  });
}

// The request id belongs to the logical attempt, not the call: a retry after a lost answer sends
// the same id and gets the stored outcome back instead of a "no longer pending" refusal. When a
// finishing outcome meets a follow-up that is already finished under another id, the caller learns
// that instead of an error and moves the card on; nothing is then called "saved".
async function saveOutcome(
  jumpId: string,
  outcome: Outcome,
  requestId: string,
  details: OutcomeDetails = {},
  attempt?: OutcomeAttempt,
  origin?: JumpStateDetail["origin"]
): Promise<SaveResult> {
  const response = await fetch(`/api/jumps/${encodeURIComponent(jumpId)}/outcome`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ outcome, requestId, ...details, ...(attempt ? { attemptId: attempt.attemptId, ...(attempt.payload ? { attempt: attempt.payload } : {}) } : {}) })
  });
  const payload = await response.json().catch(() => ({})) as OutcomePayload;
  if (response.status === 409 && FINISHING_OUTCOMES.has(outcome) && (payload.status === "DONE" || payload.status === "SKIPPED")) return { recorded: false, status: payload.status };
  if (!response.ok) throw new Error(payload.error || "The follow-up outcome could not be saved.");
  const stored = payload as OutcomeResponse;
  dispatchJumpState({ jumpId, status: stored.status, nextFollowUpAt: stored.nextJumpId ? stored.nextCommitmentAt : null, mixEnd: stored.mixEnd ?? null, origin, reached: stored.status === "DONE" && !UNREACHED_OUTCOMES.has(outcome) });
  return { recorded: true, response: stored };
}

export function JumpWorkflowCard({
  jumpId,
  contactName,
  nextScheduledLabel,
  revision,
  children
}: {
  jumpId: string;
  contactName: string;
  nextScheduledLabel?: string;
  revision: string;
  children: ReactNode;
}) {
  const [state, setState] = useState<"ACTIVE" | "DONE" | "SKIPPED" | "HIDDEN">("ACTIVE");
  const [notice, setNotice] = useState("");
  const [nextFollowUpAt, setNextFollowUpAt] = useState<string | null>(null);
  const [undoing, setUndoing] = useState(false);
  const [error, setError] = useState("");
  const ids = useOutcomeRequestIds();
  const hideTimer = useRef<number | null>(null);
  const latestRevision = useRef(revision), outcomeRevision = useRef(revision);
  useLayoutEffect(() => { latestRevision.current = revision; }, [revision]);
  // The person's other card and reviews name this follow-up only while it's still due (D71), and say they were contacted
  // today once it's done (D98). A done card that hides after its Undo window stays done.
  const recordedDone = useRef(false), reached = useRef(false);
  useEffect(() => {
    if (state === "DONE") recordedDone.current = reached.current;
    else if (state !== "HIDDEN") recordedDone.current = false;
    setFollowUpDue(jumpId, state === "ACTIVE", recordedDone.current);
  }, [jumpId, state]);
  useEffect(() => () => setFollowUpDue(jumpId, null), [jumpId]);
  // On Today the confirmation shows inside the open review, so its Undo stays beside the owner's work (D70).
  const target = useConfirmationTarget(jumpId);
  const confirmationRef = useRef<HTMLDivElement>(null);
  // A pressed Undo is disabled while it saves, which drops its focus; remember where the owner was.
  const undoHadFocus = useRef(false);
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
        focusAfterConfirmation(confirmationRef.current, undoHadFocus.current);
        undoHadFocus.current = false;
        setNotice("");
        setState("ACTIVE");
        return;
      }
      outcomeRevision.current = latestRevision.current;
      reached.current = detail.status === "DONE" && detail.reached === true;
      setNotice(detail.notice ?? "");
      setNextFollowUpAt(detail.nextFollowUpAt ?? null);
      setState(detail.status);
      hideTimer.current = window.setTimeout(() => { focusAfterConfirmation(confirmationRef.current); setState("HIDDEN"); }, 10_000);
    };
    window.addEventListener("jitm:jump-state", onState);
    return () => {
      window.removeEventListener("jitm:jump-state", onState);
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
    };
  }, [jumpId]);

  const undo = async () => {
    undoHadFocus.current = Boolean(confirmationRef.current?.contains(document.activeElement));
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    setUndoing(true);
    setError("");
    const key = outcomeRequestKey(jumpId, "REOPENED");
    try {
      await saveOutcome(jumpId, "REOPENED", ids.claim(key));
      ids.release(key);
    } catch (reason) {
      // Back on the Undo, to try again. It is enabled first: a disabled button can't take focus.
      flushSync(() => {
        setError(reason instanceof Error ? reason.message : "The follow-up could not be reopened.");
        setUndoing(false);
      });
      if (undoHadFocus.current && focusIsFree(confirmationRef.current)) confirmationRef.current?.querySelector("button")?.focus();
      undoHadFocus.current = false;
      hideTimer.current = window.setTimeout(() => { focusAfterConfirmation(confirmationRef.current); setState("HIDDEN"); }, 10_000);
    } finally {
      setUndoing(false);
    }
  };

  if (state === "HIDDEN") return null;
  if (state !== "ACTIVE") {
    const confirmation = (
      <div ref={confirmationRef} className={styles.cardWrapper} data-jump-workflow={jumpId} data-follow-up-undo="true">
        <div className={styles.completedPlaceholder} role="status">
          <span>
            <strong>{state === "SKIPPED" ? "Follow-up skipped" : "Follow-up completed"}</strong>
            {notice && <small>{notice}</small>}
            <small>{contactName} · you can undo this for a moment</small>
            {nextFollowUpAt ? <small>Next follow-up: {formatNextFollowUp(nextFollowUpAt)}</small> : nextScheduledLabel && <small>Next scheduled: {nextScheduledLabel}</small>}
          </span>
          <button className="button small" type="button" onClick={undo} disabled={undoing}>{undoing ? "Restoring…" : "Undo"}</button>
        </div>
        {error && <p className={styles.error} role="alert">{error}</p>}
      </div>
    );
    return target ? createPortal(confirmation, target) : confirmation;
  }
  return <div className={styles.cardWrapper} data-jump-workflow={jumpId}>{children}</div>;
}

export function JumpOutcomeButton({
  jumpId,
  outcome = "COMPLETED",
  className,
  ariaLabel,
  children,
  disabled,
  confirmation
}: {
  jumpId: string;
  outcome?: Outcome;
  className?: string;
  ariaLabel?: string;
  children: ReactNode;
  disabled?: boolean;
  confirmation?: string;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const ids = useOutcomeRequestIds();
  const workflow = useWorkflowChoices(outcome === "REOPENED" ? undefined : jumpId);
  const { choices } = workflow;
  const [decisions, setDecisions] = useState<Record<string, string>>({});
  const [showDecisions, setShowDecisions] = useState(false);
  const [confirm, confirmDialog] = useConfirmDialog();
  const root = useRef<HTMLSpanElement>(null);

  const submit = async (completionOnly = false) => {
    if (!completionOnly && (choices.length || workflow.status !== "ready") && !showDecisions) { setShowDecisions(true); return; }
    if (confirmation && !(await confirm({ title: confirmation, description: "This updates the follow-up now.", confirmLabel: "Continue" }))) return;
    const here = root.current;
    const quickAction = outcome !== "REOPENED" && Boolean(here?.closest("article.jump-card") && !here?.closest(".follow-up-review-sheet") && here?.contains(document.activeElement));
    const group = here?.closest<HTMLElement>(".jump-person-group") ?? null;
    setSaving(true);
    setError("");
    setNotice("");
    const details: OutcomeDetails = { workflowDecisions: Object.entries(completionOnly ? {} : decisions).filter(([, outcome]) => outcome).map(([ruleId, outcome]) => ({ ruleId, outcome })) };
    const key = outcomeRequestKey(jumpId, outcome, details);
    try {
      const result = await saveOutcome(jumpId, outcome, ids.claim(key), details, undefined, root.current?.closest(".follow-up-review-sheet") ? "review" : undefined);
      ids.release(key);
      setShowDecisions(false);
      if (!result.recorded) {
        // Finished already, by an earlier request whose answer was lost or from another control.
        // The card moves on and says so; the notice rides along because this button leaves with the card.
        const copy = alreadyRecordedCopy(result.status);
        setNotice(copy);
        dispatchJumpState({ jumpId, status: result.status, notice: copy });
      }
      if (quickAction) focusAfterQuickAction(jumpId, group);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The follow-up could not be updated.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <span ref={root}>
      <button className={className} type="button" aria-label={ariaLabel} onClick={() => void submit()} disabled={saving || disabled}>{saving ? "Saving…" : children}</button>
      {showDecisions && <span role="group" aria-label="Record journey outcome" data-outcome-choices><WorkflowChoicesStatus {...workflow} /><WorkflowOutcomeFields choices={choices} values={decisions} onChange={setDecisions} /><button className="button primary" type="button" disabled={saving || workflow.status !== "ready"} onClick={() => void submit()}>Save outcome</button>{workflow.status !== "ready" && <button className="button" type="button" disabled={saving} onClick={() => void submit(true)}>Record follow-up only</button>}<button className="button" type="button" onClick={() => setShowDecisions(false)}>Cancel</button></span>}
      {notice && <small className="muted-copy" role="status">{notice}</small>}
      {error && <small className={styles.error} role="alert">{error}</small>}
      {confirmDialog}
    </span>
  );
}

export function JumpReturnTray() {
  const scope = useBrowserScope();
  const opened = useRef<OpenedJumpDetail | null>(null);
  const revealTimer = useRef<number | undefined>(undefined);
  const [session, setSession] = useState<OpenedJumpDetail | null>(null);
  const workflowChoices = useWorkflowChoices(session?.jumpId);
  const [workflowDecisions, setWorkflowDecisions] = useState<Record<string, string>>({});
  useEffect(() => setWorkflowDecisions({}), [session?.jumpId]);
  const [visible, setVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const ids = useOutcomeRequestIds();
  const noticeTimer = useRef<number | undefined>(undefined);
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
      const current = opened.current;
      if (!detail?.jumpId) return;
      // The follow-up changed state (recorded, or reopened after a lost answer); a request id remembered
      // for it must not replay an older outcome against that new state.
      ids.forget(detail.jumpId);
      // A follow-up this tray never opened is not ours; a reopening keeps the handoff waiting.
      if (current && current.jumpId === detail.jumpId && detail.status !== "PENDING") {
        // Finished from the card instead of the tray; move on to the next unresolved handoff.
        const next = resolveOpenedJump(scope, { attemptId: current.attemptId, jumpId: detail.jumpId });
        opened.current = next;
        window.clearTimeout(revealTimer.current);
        if (next) setSession(next); else { setVisible(false); setSession(null); }
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
  }, [ids, scope]);

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

  // Each handoff resolves on its own: dismissing or recording one shows the next unresolved one.
  const advance = () => {
    const next = scope && session ? resolveOpenedJump(scope, { attemptId: session.attemptId, jumpId: session.jumpId }) : null;
    opened.current = next;
    window.clearTimeout(revealTimer.current);
    setError("");
    if (next) { setSession(next); setVisible(true); } else { setVisible(false); setSession(null); }
  };

  const showNotice = (text: string) => {
    setNotice(text);
    window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(""), 12_000);
  };

  const close = () => setVisible(false);

  const save = async (selected: Outcome, details = false) => {
    if (!session) return;
    setSaving(true);
    setError("");
    try {
      // The record is tied to the attempt this tray opened, never to the newest draft. The full
      // payload goes along only while the server has not acknowledged it.
      const stored = scope && session.attemptId ? readUnresolvedAttempts(scope).find((item) => item.attemptId === session.attemptId) : undefined;
      const acknowledged = stored?.acknowledged ?? session.acknowledged ?? false;
      const attempt: OutcomeAttempt | undefined = session.attemptId ? { attemptId: session.attemptId, payload: acknowledged ? undefined : stored?.attempt ?? session.attempt } : undefined;
      const payload: OutcomeDetails = { ...(details ? {
        note,
        visibility,
        nextDate: wantsNext ? nextDate : undefined,
        nextTime: wantsNext ? nextTime : undefined
      } : {}), workflowDecisions: Object.entries(workflowDecisions).filter(([, outcome]) => outcome).map(([ruleId, outcome]) => ({ ruleId, outcome })) };
      const key = outcomeRequestKey(session.jumpId, selected, payload, session.attemptId);
      const result = await saveOutcome(session.jumpId, selected, ids.claim(key), payload, attempt, "tray");
      ids.release(key);
      if (!result.recorded) {
        // Finished already under another request, so this handoff is over. Whatever was typed here did
        // not go in, and the owner is told exactly that rather than "saved".
        const missing = [details && note.trim() ? "Your note wasn't added." : "", details && wantsNext ? "The next follow-up wasn't scheduled." : ""].filter(Boolean);
        showNotice([alreadyRecordedCopy(result.status), ...missing].join(" "));
        dispatchJumpState({ jumpId: session.jumpId, status: result.status });
      } else if (result.response.attempt?.evidence === "mismatch") showNotice("Your outcome is saved. The message recorded when you opened it differs from what this device holds, so that record was not attached.");
      advance();
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

  if (!visible || !session) {
    if (session) return <aside className={styles.returnTray} aria-label="Pending follow-up outcome"><span>Outcome not recorded for {session.contactName}.</span><button className="button small" type="button" onClick={() => setVisible(true)}>Record outcome</button></aside>;
    if (!notice) return null;
    return <aside className={styles.returnTray} aria-label="Follow-up outcome notice" data-today-notice><p role="status">{notice}</p><button className="button small" type="button" onClick={() => setNotice("")}>Dismiss</button></aside>;
  }
  return (
    <aside className={styles.returnTray} aria-label={`Finish follow-up with ${session.contactName}`} data-today-notice>
      {notice && <p role="status">{notice}</p>}
      <div className={styles.trayHeading}>
        <div>
          <strong>How did the follow-up with {session.contactName} go?</strong>
          <p>Step 3 · Record what happened. Opening an app does not send it.</p>
        </div>
        <button className="button small" type="button" onClick={close} aria-label="Record outcome later">Later</button>
      </div>
      <WorkflowChoicesStatus {...workflowChoices} /><WorkflowOutcomeFields choices={workflowChoices.choices} values={workflowDecisions} onChange={setWorkflowDecisions} />
      <div className={styles.outcomeGrid}>
        {quickOutcomes.map((item) => (
          <button className={["COMPLETED", "CONNECTED"].includes(item.value) ? "button primary" : "button"} type="button" key={item.value} disabled={saving} onClick={() => save(item.value)}>{item.label}</button>
        ))}
      </div>
      <details className={styles.detailDisclosure}>
        <summary>Add a note or next follow-up</summary>
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
      setShown(new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true }).format(next));
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
