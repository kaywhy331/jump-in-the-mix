"use client";

import { useRef, useState } from "react";
import { customFieldPlaceholder } from "@/lib/contact-custom-fields";
import { CONTACT_PLACEHOLDERS, MY_INFO_PLACEHOLDERS, PRIVATE_NOTE_PLACEHOLDERS } from "@/lib/placeholders";
import { createReusableJumpAction, updateReusableJumpAction } from "@/lib/reusable-jump-update";

type Channel = "SMS" | "EMAIL" | "PHONE_CALL" | "VOICEMAIL" | "WHATSAPP";

type JumpValue = {
  id?: string;
  name?: string;
  channel?: Channel;
  subject?: string | null;
  body?: string | null;
  script?: string | null;
};

type CustomFieldOption = {
  id: string;
  name: string;
  key: string;
};

function insertAtCursor(element: HTMLInputElement | HTMLTextAreaElement | null, token: string) {
  if (!element) return;
  const start = element.selectionStart ?? element.value.length;
  const end = element.selectionEnd ?? start;
  const next = `${element.value.slice(0, start)}${token}${element.value.slice(end)}`;
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), "value")?.set;
  setter?.call(element, next);
  element.dispatchEvent(new Event("input", { bubbles: true }));
  requestAnimationFrame(() => {
    element.focus();
    element.setSelectionRange(start + token.length, start + token.length);
  });
}

function channelOptions() {
  return <><option value="SMS">SMS</option><option value="EMAIL">Email</option><option value="PHONE_CALL">Phone Call</option><option value="VOICEMAIL">Voicemail notes</option><option value="WHATSAPP">WhatsApp</option></>;
}

export function ReusableJumpForm({
  mode,
  jump,
  customFields
}: {
  mode: "create" | "edit";
  jump?: JumpValue;
  customFields: CustomFieldOption[];
}) {
  const [channel, setChannel] = useState<Channel>(jump?.channel ?? "SMS");
  const [activeField, setActiveField] = useState<"subject" | "body" | "script">(channel === "PHONE_CALL" || channel === "VOICEMAIL" ? "script" : "body");
  const subjectRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const scriptRef = useRef<HTMLTextAreaElement>(null);

  const insert = (token: string) => {
    if (activeField === "subject") insertAtCursor(subjectRef.current, token);
    else if (activeField === "script") insertAtCursor(scriptRef.current, token);
    else insertAtCursor(bodyRef.current, token);
  };

  const action = mode === "create" ? createReusableJumpAction : updateReusableJumpAction;
  return (
    <form action={action} className="jump-editor-form">
      {jump?.id && <input type="hidden" name="stepTemplateId" value={jump.id} />}
      <div className="form-grid">
        <div className="field full"><label htmlFor={`jump-name-${jump?.id ?? "new"}`}>Jump name</label><input id={`jump-name-${jump?.id ?? "new"}`} name="name" defaultValue={jump?.name ?? ""} placeholder="Birthday text" required /></div>
        <div className="field">
          <label htmlFor={`jump-channel-${jump?.id ?? "new"}`}>Channel</label>
          {mode === "edit" ? <><select id={`jump-channel-${jump?.id ?? "new"}`} value={channel} disabled aria-describedby={`jump-channel-note-${jump?.id ?? "new"}`}>{channelOptions()}</select><input type="hidden" name="channel" value={channel} /><small id={`jump-channel-note-${jump?.id ?? "new"}`}>Create a new Action Template to use another channel.</small></> : <select id={`jump-channel-${jump?.id ?? "new"}`} name="channel" value={channel} onChange={(event) => { const next = event.target.value as Channel; setChannel(next); setActiveField(next === "PHONE_CALL" || next === "VOICEMAIL" ? "script" : "body"); }}>{channelOptions()}</select>}
        </div>
        {channel === "EMAIL" && <div className="field full"><label htmlFor={`jump-subject-${jump?.id ?? "new"}`}>Email subject</label><input ref={subjectRef} onFocus={() => setActiveField("subject")} id={`jump-subject-${jump?.id ?? "new"}`} name="subject" defaultValue={jump?.subject ?? ""} placeholder="A quick note for {{First Name}}" required /></div>}
        {["SMS", "EMAIL", "WHATSAPP"].includes(channel) && <div className="field full"><label htmlFor={`jump-body-${jump?.id ?? "new"}`}>Message</label><textarea ref={bodyRef} onFocus={() => setActiveField("body")} id={`jump-body-${jump?.id ?? "new"}`} name="body" defaultValue={jump?.body ?? ""} placeholder="Write the message exactly as it should appear…" required /></div>}
        {["PHONE_CALL", "VOICEMAIL"].includes(channel) && <div className="field full"><label htmlFor={`jump-script-${jump?.id ?? "new"}`}>{channel === "PHONE_CALL" ? "Call script or notes" : "Voicemail script"}</label><textarea ref={scriptRef} onFocus={() => setActiveField("script")} id={`jump-script-${jump?.id ?? "new"}`} name="script" defaultValue={jump?.script ?? ""} placeholder={channel === "PHONE_CALL" ? "Type your call script or notes here…" : "Type the voicemail script here…"} required /></div>}
      </div>

      <details className="placeholder-picker">
        <summary>Insert a dynamic placeholder</summary>
        <div className="placeholder-groups">
          <section><h3>Contact</h3><div className="placeholder-chip-list">{CONTACT_PLACEHOLDERS.map((token) => <button type="button" className="placeholder-chip" onClick={() => insert(token)} key={token}>{token}</button>)}</div></section>
          {customFields.length > 0 && <section><h3>Contact custom fields</h3><div className="placeholder-chip-list">{customFields.map((field) => { const token = customFieldPlaceholder(field.key); return <button type="button" className="placeholder-chip" title={field.name} onClick={() => insert(token)} key={field.id}>{field.name} · {token}</button>; })}</div></section>}
          {channel === "PHONE_CALL" && <section><h3>Private call context</h3><div className="placeholder-chip-list">{PRIVATE_NOTE_PLACEHOLDERS.map((token) => <button type="button" className="placeholder-chip" onClick={() => insert(token)} key={token}>{token}</button>)}</div></section>}
          <section><h3>My Info</h3><div className="placeholder-chip-list">{MY_INFO_PLACEHOLDERS.map((token) => <button type="button" className="placeholder-chip" onClick={() => insert(token)} key={token}>{token}</button>)}</div></section>
        </div>
      </details>

      <div className="form-actions"><button type="submit" className="button primary">{mode === "create" ? "Create Jump" : "Update Jump"}</button></div>
    </form>
  );
}
