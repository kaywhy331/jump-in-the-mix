"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppIcon, type AppIconName } from "@/components/AppIcon";
import { JumpActionLink, JumpCopyButton } from "@/components/JumpActionControls";
import { applyDraftEdit, draftSource, parseDraftSource, projectDraft, type DraftSegment, type DraftValues } from "@/lib/draft-segments";
import { DRAFT_LIMITS, type DraftContent, type PreparationFamily } from "@/lib/preparation-family";

type ActionType = "COMPOSED" | "CALLED" | "VOICEMAIL_STARTED";
type SavedDraft = DraftContent & { revision: number };
type SaveStatus = "idle" | "saving" | "saved" | "retrying" | "conflict" | "unavailable";
type Source = { subject: string; content: string };
type Saved = Source & { revision: number | null };

const AUTOSAVE_DELAY_MS = 700;
const RETRY_DELAY_MS = 4000;

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

function composeUrl(channel: string, email: string | null, phone: string | null, subject: string, content: string): string | null {
  const body = encodeURIComponent(content);
  if (channel === "EMAIL" && email) return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${body}`;
  if (channel === "SMS" && phone) return `sms:${phone}?body=${body}`;
  if (channel === "WHATSAPP" && phone) return `https://wa.me/${phone.replace(/\D/g, "")}?text=${body}`;
  if ((channel === "PHONE_CALL" || channel === "VOICEMAIL") && phone) return `tel:${phone}`;
  return null;
}

function statusLabel(status: SaveStatus, unsaved: boolean, hasSavedDraft: boolean): string {
  if (status === "saving") return "Saving…";
  if (status === "retrying") return "Not saved yet. Trying again…";
  if (status === "conflict") return "Updated on another device. Showing the latest.";
  if (status === "unavailable") return "This follow-up changed. Refresh to see it.";
  return !unsaved && hasSavedDraft ? "Saved" : "";
}

/**
 * The message an owner fine-tunes before opening the phone. For a pending follow-up the edits are
 * a durable draft: the text on screen is the draft rendered over the contact's details, each edit
 * is mapped back onto the token form and saved after a short pause, and a stale save is refused
 * and replaced by whatever is current. `data-follow-up-draft` marks unsaved keystrokes only, so
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
  draft
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
}) {
  const persists = template !== null;
  const contentKey: "body" | "script" = family === "CALL" ? "script" : "body";
  const templateSource = useMemo<Source>(() => ({ subject: template?.subject ?? "", content: template?.[contentKey] ?? "" }), [template, contentKey]);
  const [ready, setReady] = useState(false);
  useEffect(() => { setReady(true); }, []);

  // Legacy path for rows without stored plan text: edits live in memory only, as before.
  const [legacySubject, setLegacySubject] = useState<string | null>(null);
  const [legacyContent, setLegacyContent] = useState<string | null>(null);

  const initialSource = useMemo<Source>(() => (draft ? { subject: draft.subject ?? "", content: draft[contentKey] ?? "" } : templateSource), [draft, contentKey, templateSource]);
  const [subjectSegments, setSubjectSegments] = useState<DraftSegment[]>(() => parseDraftSource(initialSource.subject, values));
  const [contentSegments, setContentSegments] = useState<DraftSegment[]>(() => parseDraftSource(initialSource.content, values));
  const [saved, setSaved] = useState<Saved>({ ...initialSource, revision: draft?.revision ?? null });
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [stopped, setStopped] = useState(false);

  const subject = persists ? projectDraft(subjectSegments) : legacySubject ?? initialSubject ?? "";
  const content = persists ? projectDraft(contentSegments) : legacyContent ?? initialContent;
  const source = useMemo<Source>(() => ({ subject: draftSource(subjectSegments), content: draftSource(contentSegments) }), [subjectSegments, contentSegments]);
  const unsaved = persists ? source.subject !== saved.subject || source.content !== saved.content : legacySubject !== null || legacyContent !== null;
  const hasDraft = persists ? saved.revision !== null || unsaved : unsaved;

  const latest = useRef({ source, saved, unsaved, stopped });
  latest.current = { source, saved, unsaved, stopped };
  const inFlight = useRef(false);
  const again = useRef(false);
  const retryTimer = useRef<number | undefined>(undefined);

  const adopt = useCallback((current: SavedDraft | null) => {
    const next: Source = current ? { subject: current.subject ?? "", content: current[contentKey] ?? "" } : templateSource;
    setSubjectSegments(parseDraftSource(next.subject, values));
    setContentSegments(parseDraftSource(next.content, values));
    setSaved({ ...next, revision: current?.revision ?? null });
  }, [contentKey, templateSource, values]);

  const flush = useCallback(async () => {
    if (!persists || latest.current.stopped) return;
    if (inFlight.current) { again.current = true; return; }
    const { source: current, saved: base } = latest.current;
    if (current.subject === base.subject && current.content === base.content) return;
    inFlight.current = true;
    setStatus("saving");
    try {
      const response = await fetch(`/api/jumps/${encodeURIComponent(jumpId)}/draft`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        keepalive: true,
        body: JSON.stringify({ family, subject: family === "EMAIL" ? current.subject : null, [contentKey]: current.content, revision: base.revision })
      });
      const payload = await response.json().catch(() => ({})) as { draft?: SavedDraft | null };
      if (response.ok && payload.draft) {
        setSaved({ ...current, revision: payload.draft.revision });
        setStatus("saved");
      } else if (response.status === 409) {
        adopt(payload.draft ?? null);
        setStatus("conflict");
      } else if (response.status === 404) {
        setStopped(true);
        setStatus("unavailable");
      } else {
        throw new Error("The draft could not be saved.");
      }
    } catch {
      setStatus("retrying");
      window.clearTimeout(retryTimer.current);
      retryTimer.current = window.setTimeout(() => { void flush(); }, RETRY_DELAY_MS);
    } finally {
      inFlight.current = false;
      if (again.current) { again.current = false; void flush(); }
    }
  }, [adopt, contentKey, family, jumpId, persists]);

  // Bounded autosave: one request after typing pauses, coalescing anything typed meanwhile.
  useEffect(() => {
    if (!persists || !unsaved || stopped) return;
    const timer = window.setTimeout(() => { void flush(); }, AUTOSAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [flush, persists, source.subject, source.content, stopped, unsaved]);

  // Leaving the page or unmounting sends what is pending; the request outlives the tab.
  useEffect(() => {
    if (!persists) return;
    const onHide = () => { if (latest.current.unsaved) void flush(); };
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      window.clearTimeout(retryTimer.current);
      onHide();
    };
  }, [flush, persists]);

  const editSubject = (next: string) => {
    if (!persists) { setLegacySubject(next); return; }
    setSubjectSegments((previous) => applyDraftEdit(previous, projectDraft(previous), next));
  };
  const editContent = (next: string) => {
    if (!persists) { setLegacyContent(next); return; }
    setContentSegments((previous) => applyDraftEdit(previous, projectDraft(previous), next));
  };

  // Drops keystrokes that have not reached the server; the Today guards use this before leaving.
  const revertUnsaved = () => {
    if (!persists) { setLegacySubject(null); setLegacyContent(null); return; }
    setSubjectSegments(parseDraftSource(saved.subject, values));
    setContentSegments(parseDraftSource(saved.content, values));
  };

  // Removes the whole draft so the follow-up reads from its plan again.
  const discard = async () => {
    if (!persists) { setLegacySubject(null); setLegacyContent(null); return; }
    const revision = saved.revision;
    adopt(null);
    if (revision === null) { setStatus("idle"); return; }
    setStatus("saving");
    try {
      const response = await fetch(`/api/jumps/${encodeURIComponent(jumpId)}/draft`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        keepalive: true,
        body: JSON.stringify({ family, revision })
      });
      if (response.status === 409) {
        const payload = await response.json().catch(() => ({})) as { draft?: SavedDraft | null };
        adopt(payload.draft ?? null);
        setStatus("conflict");
      } else {
        setStatus("idle");
      }
    } catch {
      setStatus("retrying");
    }
  };

  const url = useMemo(() => composeUrl(channel, email, phone, subject, content), [channel, content, email, phone, subject]);
  const needsEmail = channel === "EMAIL";
  const methodLabel = needsEmail ? "email" : "phone";
  const longSms = channel === "SMS" && content.length > 900;
  const copyContent = [subject, content].filter(Boolean).join("\n\n");
  const label = persists ? statusLabel(status, unsaved, saved.revision !== null) : "";

  return (
    <div className="editable-follow-up" data-follow-up-draft={unsaved} data-follow-up-saved={persists && saved.revision !== null}>
      {channel === "EMAIL" && <label className="field"><span>Subject</span><input disabled={!ready} value={subject} maxLength={DRAFT_LIMITS.subject} onChange={(event) => editSubject(event.target.value)} /></label>}
      {(channel === "SMS" || channel === "EMAIL" || channel === "WHATSAPP") ? (
        <label className="field"><span>Fine-tune before sending</span><span className="speech-bubble speech-bubble--compose"><textarea disabled={!ready} value={content} maxLength={DRAFT_LIMITS.body} onChange={(event) => editContent(event.target.value)} rows={5} /></span></label>
      ) : <div className="prepared-call-notes conversation-note"><small>Call notes</small><p>{content}</p></div>}
      {longSms && <p className="notice warning compact" role="status">This text is over 900 characters and may be cut off by some phones. Copy it instead, or shorten it.</p>}
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
        ><AppIcon name={channelIcon(channel)} /><span>{actionLabel(channel)}</span></JumpActionLink> : (
          <a className="button primary" href={`/contacts/${contactId}/edit`}><AppIcon name="add" />Add {methodLabel}</a>
        )}
        {copyContent && <span className={longSms ? "copy-primary" : ""}><JumpCopyButton jumpId={jumpId} text={copyContent} label="Copy" /></span>}
        {hasDraft && <button type="button" className="button" onClick={() => { void discard(); }}>Discard edits</button>}
        {unsaved && <button type="button" hidden data-discard-follow-up-draft onClick={revertUnsaved} tabIndex={-1} aria-hidden="true">Keep the saved version</button>}
        {label && <small className="muted-copy" role="status" data-draft-status={status}>{label}</small>}
      </div>
    </div>
  );
}
