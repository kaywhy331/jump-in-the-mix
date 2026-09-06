"use client";

import { useEffect, useMemo, useState } from "react";
import { AppIcon, type AppIconName } from "@/components/AppIcon";
import { JumpActionLink, JumpCopyButton } from "@/components/JumpActionControls";

type ActionType = "COMPOSED" | "CALLED" | "VOICEMAIL_STARTED";

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

export function EditableFollowUpAction({
  jumpId,
  contactId,
  contactName,
  channel,
  email,
  phone,
  initialSubject,
  initialContent
}: {
  jumpId: string;
  contactId: string;
  contactName: string;
  channel: string;
  email: string | null;
  phone: string | null;
  initialSubject?: string | null;
  initialContent: string;
}) {
  const [ready, setReady] = useState(false);
  const [subjectDraft, setSubject] = useState<string | null>(null);
  const [contentDraft, setContent] = useState<string | null>(null);
  const subject = subjectDraft ?? initialSubject ?? "";
  const content = contentDraft ?? initialContent;
  useEffect(() => { setReady(true); }, []);
  const url = useMemo(() => composeUrl(channel, email, phone, subject, content), [channel, content, email, phone, subject]);
  const needsEmail = channel === "EMAIL";
  const methodLabel = needsEmail ? "email" : "phone";
  const longSms = channel === "SMS" && content.length > 900;
  const copyContent = [subject, content].filter(Boolean).join("\n\n");

  return (
    <div className="editable-follow-up" data-follow-up-draft={subjectDraft !== null || contentDraft !== null}>
      {channel === "EMAIL" && <label className="field"><span>Subject</span><input disabled={!ready} value={subject} onChange={(event) => setSubject(event.target.value)} /></label>}
      {(channel === "SMS" || channel === "EMAIL" || channel === "WHATSAPP") ? (
        <label className="field"><span>Edit before sending</span><textarea disabled={!ready} value={content} onChange={(event) => setContent(event.target.value)} rows={5} /></label>
      ) : <div className="prepared-call-notes"><small>Call notes</small><p>{content}</p></div>}
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
        {(subjectDraft !== null || contentDraft !== null) && <button type="button" className="button" data-discard-follow-up-draft onClick={() => { setSubject(null); setContent(null); }}>Discard edits</button>}
      </div>
    </div>
  );
}
