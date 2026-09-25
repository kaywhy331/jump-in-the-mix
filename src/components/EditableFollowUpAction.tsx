"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppIcon, type AppIconName } from "@/components/AppIcon";
import { JumpActionLink, JumpCopyButton, type AttemptDraft } from "@/components/JumpActionControls";
import { useConfirmDialog } from "@/components/useConfirmDialog";
import { applyDraftEdit, draftSource, parseDraftSource, projectDraft, type DraftSegment, type DraftValues } from "@/lib/draft-segments";
import { DRAFT_LIMITS, type DetachedChange, type DraftContent, type PreparationFamily } from "@/lib/preparation-family";
import { dialablePhone, phoneLinkTarget } from "@/lib/phone-dial";

type ActionType = "COMPOSED" | "CALLED" | "VOICEMAIL_STARTED";
type SavedDraft = DraftContent & { revision: number };
type SaveStatus = "idle" | "saving" | "saved" | "retrying" | "discard-failed" | "unavailable" | "signed-out";
type Source = { subject: string; content: string };
type Saved = Source & { revision: number | null };
// A newer version exists on the server. "save" arose from an autosave, "discard" from a discard;
// either way the owner's local wording stays on screen until they choose.
type Conflict = { kind: "save" | "discard"; theirs: SavedDraft | null };

const AUTOSAVE_DELAY_MS = 700;
const RETRY_DELAY_MS = 4000;
// How long after the owner last touched a saved draft the list still waits before reordering.
const RECENT_EDIT_MS = 90_000;

function actionType(channel: string): ActionType {
  if (channel === "PHONE_CALL") return "CALLED";
  if (channel === "VOICEMAIL") return "VOICEMAIL_STARTED";
  return "COMPOSED";
}

function channelIcon(channel: string): AppIconName {
  if (channel === "EMAIL") return "email";
  if (channel === "PHONE_CALL" || channel === "VOICEMAIL") return "phone";
  return "message";
}

function actionLabel(channel: string): string {
  if (channel === "PHONE_CALL") return "Call";
  if (channel === "VOICEMAIL") return "Open notes";
  if (channel === "EMAIL") return "Open email";
  if (channel === "WHATSAPP") return "Open WhatsApp";
  return "Open text";
}

/**
 * The handoff link for the text on screen. Phone apps get a number, never the typed display value:
 * E.164 when it can be derived, otherwise the digits as stored. WhatsApp needs a full international
 * number, so it is offered only then. The `?&body=` spelling is the one both iOS Messages and Android
 * accept. The "To" hint and the recorded attempt keep the stored display value.
 */
export function followUpHandoffUrl(channel: string, email: string | null, phone: string | null, subject: string, content: string): string | null {
  const body = encodeURIComponent(content);
  if (channel === "EMAIL") return email ? `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${body}` : null;
  const number = phoneLinkTarget(phone);
  if (!number) return null;
  if (channel === "SMS") return `sms:${number}?&body=${body}`;
  if (channel === "WHATSAPP") {
    const dialable = dialablePhone(phone);
    return dialable ? `https://wa.me/${dialable.slice(1)}?text=${body}` : null;
  }
  if (channel === "PHONE_CALL" || channel === "VOICEMAIL") return `tel:${number}`;
  return null;
}

function statusLabel(status: SaveStatus, unsaved: boolean, hasSavedDraft: boolean): string {
  if (status === "saving") return "Saving…";
  if (status === "retrying") return "Not saved yet. Trying again…";
  if (status === "discard-failed") return "Your edits are still saved; the discard didn't go through.";
  if (status === "unavailable") return "This follow-up changed. Refresh to see it; your wording is still on screen.";
  if (status === "signed-out") return "You’re signed out, so this wording isn’t saved. Copy it, then sign in again.";
  return !unsaved && hasSavedDraft ? "Saved" : "";
}

/** The review's automatic-sending line: the worker's computed "not before" time when known, the fixed wording when not. */
export function automaticSendingLine(automaticSendAt: string | null | undefined, due: boolean): { state: "now" | "scheduled" | "window"; text: string } {
  if (due) return { state: "now", text: "Sends automatically any minute now unless you send, snooze or skip it first." };
  if (automaticSendAt) return { state: "scheduled", text: `Sends automatically at ${automaticSendAt} unless you send, snooze or skip it first.` };
  return { state: "window", text: "Automatic sending is on: this sends by itself after your review window unless you send, snooze or skip it first." };
}

function preview(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > 140 ? `${flat.slice(0, 137)}…` : flat;
}

/**
 * The message an owner fine-tunes before opening the phone. For a pending follow-up the edits are
 * a durable draft: the text on screen is the draft rendered over the contact's details, each edit
 * is mapped back onto the token form and saved after a short pause, and a stale save keeps the
 * owner's wording on screen and offers one choice against the version saved elsewhere. Nothing
 * replaces local edits automatically. `data-follow-up-draft` marks unsaved keystrokes only, so
 * the Today guards protect what has not reached the server yet and nothing more.
 */
export function EditableFollowUpAction({
  jumpId,
  contactId,
  contactName,
  channel,
  email,
  phone,
  initialSubject,
  initialContent,
  family,
  template,
  values,
  draft,
  stepVersionId,
  contextVersions,
  automaticDelivery = false,
  automaticSendAt = null,
  automaticSendDue = false,
  deliveryStatus,
  channelChoice,
  outcomeActions,
  changedDetails = []
}: {
  jumpId: string;
  contactId: string;
  contactName: string;
  channel: string;
  email: string | null;
  phone: string | null;
  initialSubject?: string | null;
  initialContent: string;
  family: PreparationFamily;
  /** Token-form plan text; null when the follow-up is not open for drafting. */
  template: DraftContent | null;
  values: DraftValues;
  draft: SavedDraft | null;
  stepVersionId: string;
  /** Versions of the contact and business details the text was rendered from. */
  contextVersions: Record<string, string>;
  /** True when automatic delivery would send this follow-up unless a saved draft holds it for the owner. */
  automaticDelivery?: boolean;
  /** The earliest time the worker would send it, already formatted for the viewer; null when it cannot be computed. */
  automaticSendAt?: string | null;
  /** True when that time has passed, so the next worker pass sends it. */
  automaticSendDue?: boolean;
  /** Rendered by the page above the actions: a failed automatic send and the status that follows from it. */
  deliveryStatus?: React.ReactNode;
  /** Details the owner wrote over by hand that have changed since; shown, never rewritten. */
  channelChoice?: React.ReactNode;
  outcomeActions?: React.ReactNode;
  changedDetails?: DetachedChange[];
}) {
  const persists = template !== null;
  const contentKey: "body" | "script" = family === "CALL" ? "script" : "body";
  const templateSource = useMemo<Source>(() => ({ subject: template?.subject ?? "", content: template?.[contentKey] ?? "" }), [template, contentKey]);
  const [ready, setReady] = useState(false);
  useEffect(() => { setReady(true); }, []);

  // Legacy path for rows without stored plan text: edits live in memory only, as before.
  const [legacySubject, setLegacySubject] = useState<string | null>(null);
  const [legacyContent, setLegacyContent] = useState<string | null>(null);

  const sourceOf = useCallback((current: SavedDraft | null): Source => (current ? { subject: current.subject ?? "", content: current[contentKey] ?? "" } : templateSource), [contentKey, templateSource]);
  const initialSource = useMemo<Source>(() => sourceOf(draft), [draft, sourceOf]);
  const [subjectSegments, setSubjectSegments] = useState<DraftSegment[]>(() => parseDraftSource(initialSource.subject, values));
  const [contentSegments, setContentSegments] = useState<DraftSegment[]>(() => parseDraftSource(initialSource.content, values));
  const [saved, setSaved] = useState<Saved>({ ...initialSource, revision: draft?.revision ?? null });
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [stopped, setStopped] = useState(false);
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const [busy, setBusy] = useState(false);
  const [focused, setFocused] = useState(false);
  const [recentlyActive, setRecentlyActive] = useState(false);
  const [confirm, confirmDialog] = useConfirmDialog();
  const idleTimer = useRef<number | undefined>(undefined);
  const touch = useCallback(() => {
    setRecentlyActive(true);
    window.clearTimeout(idleTimer.current);
    idleTimer.current = window.setTimeout(() => setRecentlyActive(false), RECENT_EDIT_MS);
  }, []);

  const subject = persists ? projectDraft(subjectSegments) : legacySubject ?? initialSubject ?? "";
  const content = persists ? projectDraft(contentSegments) : legacyContent ?? initialContent;
  const source = useMemo<Source>(() => ({ subject: draftSource(subjectSegments), content: draftSource(contentSegments) }), [subjectSegments, contentSegments]);
  const unsaved = persists ? source.subject !== saved.subject || source.content !== saved.content : legacySubject !== null || legacyContent !== null;
  const hasDraft = persists ? saved.revision !== null || unsaved : unsaved;
  // The list waits to reorder while the owner is still in a draft, saved or not: focus within the
  // editor, or activity in the last minute and a half, since a click on a Today control such as
  // "Return to draft" moves focus away for a moment. Leaving the page is guarded only while
  // keystrokes have not reached the server.
  const editing = unsaved || (persists && saved.revision !== null && (focused || recentlyActive));
  // The worker holds a follow-up only on a saved draft row: keystrokes, a save in flight or a refused
  // save hold nothing yet, and the editor must not say otherwise.
  const heldBySavedDraft = persists && saved.revision !== null;
  const holdPending = status === "retrying" || status === "signed-out" || status === "unavailable";
  const paused = stopped || conflict !== null;

  const latest = useRef({ source, saved, unsaved, paused });
  latest.current = { source, saved, unsaved, paused };
  // Saves and discards run one at a time, in order, so a discard never races an autosave.
  const queue = useRef<Promise<void>>(Promise.resolve());
  const runExclusive = useCallback((task: () => Promise<void>): Promise<void> => {
    const next = queue.current.then(task, task);
    queue.current = next.catch(() => undefined);
    return next;
  }, []);
  const retryTimer = useRef<number | undefined>(undefined);

  const showSegments = useCallback((next: Source) => {
    setSubjectSegments(parseDraftSource(next.subject, values));
    setContentSegments(parseDraftSource(next.content, values));
  }, [values]);

  // A server refresh brings new plan text, details or a draft saved elsewhere. An untouched
  // message follows it; local keystrokes that have not been saved are never replaced.
  const propsKey = JSON.stringify({ initialSource, values, revision: draft?.revision ?? null });
  const seenPropsKey = useRef(propsKey);
  useEffect(() => {
    if (!persists || seenPropsKey.current === propsKey) return;
    seenPropsKey.current = propsKey;
    if (latest.current.unsaved) return;
    showSegments(initialSource);
    setSaved({ ...initialSource, revision: draft?.revision ?? null });
    setConflict(null);
    if (!stopped) setStatus("idle");
  }, [draft?.revision, initialSource, persists, propsKey, showSegments, stopped]);

  // keepalive only for the flush that must outlive the page; an ordinary save or discard is a
  // plain request the page can observe and retry.
  const request = useCallback((method: "PUT" | "DELETE", body: Record<string, unknown>, keepalive = false) => fetch(`/api/jumps/${encodeURIComponent(jumpId)}/draft`, {
    method,
    headers: { "content-type": "application/json" },
    keepalive,
    body: JSON.stringify({ family, ...body })
  }), [family, jumpId]);

  const flush = useCallback((keepalive = false) => runExclusive(async () => {
    if (!persists || latest.current.paused) return;
    const { source: current, saved: base } = latest.current;
    if (current.subject === base.subject && current.content === base.content) return;
    setStatus("saving");
    try {
      const response = await request("PUT", { subject: family === "EMAIL" ? current.subject : null, [contentKey]: current.content, revision: base.revision }, keepalive);
      const payload = await response.json().catch(() => ({})) as { draft?: SavedDraft | null };
      if (response.ok && payload.draft) {
        setSaved({ ...current, revision: payload.draft.revision });
        setStatus("saved");
      } else if (response.status === 409) {
        // Someone else saved first. Keep the owner's wording and let them choose.
        setConflict({ kind: "save", theirs: payload.draft ?? null });
        setStatus("idle");
      } else if (response.status === 404) {
        setStopped(true);
        setStatus("unavailable");
      } else if (response.status === 401 || response.status === 403) {
        setStopped(true);
        setStatus("signed-out");
      } else {
        throw new Error("The draft could not be saved.");
      }
    } catch {
      setStatus("retrying");
      window.clearTimeout(retryTimer.current);
      retryTimer.current = window.setTimeout(() => { void flush(); }, RETRY_DELAY_MS);
    }
  }), [contentKey, family, persists, request, runExclusive]);

  // Bounded autosave: one request after typing pauses, coalescing anything typed meanwhile.
  useEffect(() => {
    if (!persists || !unsaved || paused) return;
    const timer = window.setTimeout(() => { void flush(); }, AUTOSAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [flush, paused, persists, source.subject, source.content, unsaved]);

  // Leaving the page or unmounting sends what is pending; the request outlives the tab.
  useEffect(() => {
    if (!persists) return;
    const onHide = () => { if (latest.current.unsaved && !latest.current.paused) void flush(true); };
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      window.clearTimeout(retryTimer.current);
      window.clearTimeout(idleTimer.current);
      onHide();
    };
  }, [flush, persists]);

  const editSubject = (next: string) => {
    touch();
    if (!persists) { setLegacySubject(next); return; }
    setSubjectSegments((previous) => applyDraftEdit(previous, projectDraft(previous), next));
  };
  const editContent = (next: string) => {
    touch();
    if (!persists) { setLegacyContent(next); return; }
    setContentSegments((previous) => applyDraftEdit(previous, projectDraft(previous), next));
  };

  // Drops keystrokes that have not reached the server; the Today guards use this before leaving.
  const revertUnsaved = () => {
    if (!persists) { setLegacySubject(null); setLegacyContent(null); return; }
    setConflict(null);
    showSegments(saved);
  };

  // Keeps the owner's wording and saves it over the version found on the server.
  const keepMine = () => {
    if (!conflict) return;
    const revision = conflict.theirs?.revision ?? null;
    setSaved((current) => ({ ...current, revision }));
    latest.current = { ...latest.current, saved: { ...latest.current.saved, revision }, paused: false };
    setConflict(null);
    void flush();
  };

  // Takes the version saved elsewhere instead; an explicit choice, never automatic.
  const useTheirs = () => {
    if (!conflict) return;
    const theirs = conflict.theirs;
    showSegments(sourceOf(theirs));
    setSaved({ ...sourceOf(theirs), revision: theirs?.revision ?? null });
    setConflict(null);
    setStatus(theirs ? "saved" : "idle");
  };

  // Removes the whole draft so the follow-up reads from its plan again. The text on screen stays
  // until the server confirms; anything typed in the meantime is kept as new, unsaved wording.
  const discard = (revision: number | null = saved.revision) => runExclusive(async () => {
    if (!persists) { setLegacySubject(null); setLegacyContent(null); return; }
    if (revision === null) {
      showSegments(templateSource);
      setSaved({ ...templateSource, revision: null });
      setConflict(null);
      setStatus("idle");
      return;
    }
    const before = latest.current.source;
    setBusy(true);
    setStatus("saving");
    try {
      const response = await request("DELETE", { revision });
      if (response.status === 204) {
        const typedMeanwhile = latest.current.source.subject !== before.subject || latest.current.source.content !== before.content;
        if (!typedMeanwhile) showSegments(templateSource);
        setSaved({ ...templateSource, revision: null });
        setConflict(null);
        setStatus("idle");
      } else if (response.status === 409) {
        const payload = await response.json().catch(() => ({})) as { draft?: SavedDraft | null };
        setConflict({ kind: "discard", theirs: payload.draft ?? null });
        setStatus("idle");
      } else if (response.status === 404) {
        setStopped(true);
        setStatus("unavailable");
      } else if (response.status === 401 || response.status === 403) {
        setStopped(true);
        setStatus("signed-out");
      } else {
        throw new Error("The draft could not be discarded.");
      }
    } catch {
      setStatus("discard-failed");
    } finally {
      setBusy(false);
    }
  });

  // "Discard edits" sits one tap away in the status row and removes wording that may have taken
  // days; ask first. A retry after a failed discard was already confirmed.
  const confirmDiscard = async () => {
    if (status !== "discard-failed" && !await confirm({ title: "Discard your edits?", description: "The Mix’s wording comes back.", confirmLabel: "Discard edits", danger: true })) return;
    await discard();
  };

  const url = useMemo(() => followUpHandoffUrl(channel, email, phone, subject, content), [channel, content, email, phone, subject]);
  const needsEmail = channel === "EMAIL";
  const methodLabel = needsEmail ? "email" : "phone";
  const longSms = channel === "SMS" && content.length > 900;
  const copyContent = [subject, content].filter(Boolean).join("\n\n");
  const label = persists ? statusLabel(status, unsaved, saved.revision !== null) : "";
  const theirsText = conflict ? (conflict.theirs ? [conflict.theirs.subject, conflict.theirs[contentKey]].filter(Boolean).join(" · ") : "") : "";
  // The attempt is built from exactly what is on screen at the gesture, saved or not.
  const recipient = channel === "EMAIL" ? email : phone;
  const attempt: AttemptDraft | null = recipient ? {
    contactId,
    channel,
    family,
    recipient,
    subject: family === "EMAIL" ? subject : null,
    body: family === "CALL" ? null : content,
    script: family === "CALL" ? content : null,
    draftRevision: persists ? saved.revision : null,
    stepVersionId,
    contextVersions
  } : null;

  const sendingLine = automaticSendingLine(automaticSendAt, automaticSendDue);
  const automaticLine = <p className="muted-copy" data-follow-up-automatic={sendingLine.state}>{sendingLine.text}</p>;

  return (
    <div
      className="editable-follow-up"
      data-follow-up-draft={unsaved}
      data-follow-up-editing={editing}
      data-follow-up-saved={persists && saved.revision !== null}
      onFocusCapture={(event) => {
        // Choosing another method is an explicit request to replace this editor. Saved
        // wording must not hold that refresh; unsaved wording still waits for autosave.
        if ((event.target as HTMLElement).closest("[data-follow-up-channel-choice]")) {
          setFocused(false);
          setRecentlyActive(false);
          window.clearTimeout(idleTimer.current);
        } else { setFocused(true); touch(); }
      }}
      onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) { setFocused(false); touch(); } }}
    >
      {changedDetails.length > 0 && <div className="notice warning compact" role="status" data-follow-up-changed-details>
        {changedDetails.slice(0, 3).map((change) => <p key={change.token}>You wrote over the {change.label} in this message, and it has since changed from “{change.before || "blank"}” to “{change.after || "blank"}”. Check the wording before you send it.</p>)}
      </div>}
      {channel === "EMAIL" && <label className="field"><span>Subject</span><input disabled={!ready || busy} value={subject} maxLength={DRAFT_LIMITS.subject} onChange={(event) => editSubject(event.target.value)} /></label>}
      {(channel === "SMS" || channel === "EMAIL" || channel === "WHATSAPP") ? (
        <label className="field review-message-field"><span className="sr-only">Your message</span><span className="speech-bubble speech-bubble--compose"><textarea disabled={!ready || busy} value={content} maxLength={DRAFT_LIMITS.body} onChange={(event) => editContent(event.target.value)} rows={4} /></span></label>
      ) : <div className="prepared-call-notes conversation-note"><small>Call notes</small><p>{content}</p></div>}
      {conflict && <div className="notice warning compact" role="alert" data-follow-up-conflict={conflict.kind}>
        <p>{conflict.theirs
          ? `This message was changed on another device${theirsText ? `: “${preview(theirsText)}”` : ""}. Your wording here is not saved yet.`
          : "These edits were discarded on another device. Your wording here is not saved yet."}</p>
        <div className="editable-follow-up-actions">
          {conflict.kind === "save"
            ? <button type="button" className="button small primary" onClick={keepMine}>Keep my wording</button>
            : <button type="button" className="button small primary" onClick={() => { void discard(conflict.theirs?.revision ?? null); }}>Discard anyway</button>}
          <button type="button" className="button small" onClick={useTheirs}>{conflict.theirs ? "Use the other version" : "Start from the plan text"}</button>
        </div>
      </div>}
      {longSms && <p className="notice warning compact" role="status">This text is over 900 characters and may be cut off by some phones. Copy it instead, or shorten it.</p>}
      {channelChoice}
      {(deliveryStatus || automaticDelivery) && <div className="review-delivery-state">
        {deliveryStatus}
        {automaticDelivery && (!persists
          ? automaticLine
          : holdPending && !heldBySavedDraft
            ? <p className="notice warning compact" role="alert" data-follow-up-held="pending">Not held yet: this follow-up can still send automatically.</p>
            : heldBySavedDraft
              ? <p className="muted-copy" data-follow-up-held="saved">Because you edited it, this one waits for you and won’t send automatically.</p>
              : unsaved
                ? <p className="muted-copy" data-follow-up-held="saving">Saving your edit… it holds automatic sending once saved.</p>
                : automaticLine)}
      </div>}
      <p className="review-send-hint">{url ? `To ${channel === "EMAIL" ? email : phone}. ` : ""}Open your app to send, then record what happened.</p>
      <div className="review-action-bar">
      <div className="editable-follow-up-actions">
        {url ? <JumpActionLink
          jumpId={jumpId}
          action={actionType(channel)}
          href={url}
          target={channel === "WHATSAPP" ? "_blank" : undefined}
          className={`button ${longSms ? "" : "primary"} jump-channel-action`}
          ariaLabel={`${actionLabel(channel)} for ${contactName}`}
          title={actionLabel(channel)}
          contactName={contactName}
          channel={channel}
          attempt={attempt}
        ><AppIcon name={channelIcon(channel)} /><span>{actionLabel(channel)}</span></JumpActionLink> : (
          <a className="button primary" href={`/contacts/${contactId}/edit?returnTo=${encodeURIComponent(`/jumps?jump=${jumpId}`)}`}><AppIcon name="add" />Add {methodLabel}</a>
        )}
        <div className="workflow-option-actions">
        {copyContent && <span className={longSms ? "copy-primary" : ""}><JumpCopyButton jumpId={jumpId} text={copyContent} label="Copy" /></span>}
        </div>
        {unsaved && <button type="button" hidden data-discard-follow-up-draft onClick={revertUnsaved} tabIndex={-1} aria-hidden="true">Keep the saved version</button>}
      </div>
      {outcomeActions}
      </div>
      {(label || (hasDraft && !conflict)) && <div className="review-draft-status">
        {label && <small className={status === "signed-out" ? "draft-status-warning" : "muted-copy"} role="status" data-draft-status={status}>{label}{status === "signed-out" && <> <a className="inline-action" href={`/login?next=${encodeURIComponent(`/jumps?jump=${jumpId}&range=all`)}`} target="_blank" rel="noopener">Sign in in a new tab</a> <button type="button" className="text-button" onClick={() => { setStopped(false); setStatus("idle"); }}>Try saving again</button></>}</small>}
        {hasDraft && !conflict && <button type="button" className="text-button" disabled={busy} onClick={() => { void confirmDiscard(); }}>{status === "discard-failed" ? "Try discarding again" : "Discard edits"}</button>}
      </div>}
      {confirmDialog}
    </div>
  );
}
