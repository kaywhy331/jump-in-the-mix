"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ActionForm } from "@/components/ActionForm";
import { AutomaticSendPreview } from "@/components/AutomaticSendPreview";
import { FormSubmitButton } from "@/components/FormSubmitButton";
import type { FormResult } from "@/lib/form-errors";
import { AUTOMATIC_DELIVERY_WINDOWS, DEFAULT_AUTOMATIC_DELIVERY_WINDOW, automaticDeliveryPreviewMinutes } from "@/lib/automatic-delivery-window-options";

type SendingPreference = { enabled: boolean; emailEnabled: boolean; smsEnabled: boolean; reviewWindowMinutes: number };

export function SendingSettingsContent({ automation, emailAvailable, smsAvailable, locale, viewOnly, saveAction, consent }: {
  consent: ReactNode;
  automation: SendingPreference | null;
  emailAvailable: boolean;
  smsAvailable: boolean;
  locale: string;
  viewOnly: boolean;
  saveAction: (previous: FormResult, data: FormData) => Promise<FormResult>;
}) {
  const enabled = automation?.enabled ?? false;
  const emailEnabled = automation?.emailEnabled ?? false;
  const smsEnabled = automation?.smsEnabled ?? false;
  // Disabling must preserve a valid saved window, even if it is no longer a choice.
  const savedMinutes = automation?.reviewWindowMinutes ?? DEFAULT_AUTOMATIC_DELIVERY_WINDOW;
  const minutes = automaticDeliveryPreviewMinutes(savedMinutes);
  const available = emailAvailable || smsAvailable;
  const selectedAvailable = (emailEnabled && emailAvailable) || (smsEnabled && smsAvailable);
  const selectedUnavailable = (emailEnabled && !emailAvailable) || (smsEnabled && !smsAvailable);
  const status = !enabled ? "Off" : !emailEnabled && !smsEnabled ? "On · No channels selected"
    : selectedUnavailable ? selectedAvailable ? "On · Some channels unavailable" : "On · Unavailable" : "On";
  const disabledReason = viewOnly ? "sending-view-only" : undefined;

  return <>
    <section className="card sending-status">
      <h2>{!enabled ? "You review and send" : selectedAvailable ? "Automatic sending is on" : "Nothing can send automatically (saved setting: On)"}</h2>
      <p>{enabled
        ? "Your saved choice is on. Check the channel status below and review upcoming messages in Today."
        : "Review a follow-up in Today, open your text, email or call app, then return to record what happened. Opening an app does not mark a message sent."}</p>
      <Link className="button" href="/jumps">Open Today</Link>
    </section>
    <section className="card automation-settings-card">
      <div className="card-header"><div><h2>Automatic sending <span className="status-pill">{status}</span></h2>
        <p>{!available ? "Automatic sending is unavailable here."
          : enabled && selectedUnavailable ? "Check the unavailable channels below before changing your setup."
          : enabled && !selectedAvailable ? "No channel is selected for automatic sending."
          : enabled ? "Eligible messages can send after your review window. Quiet hours still apply."
          : "Optional. Choose an available channel and review the affected messages before turning it on."}</p>
        {enabled && selectedUnavailable && <p>Your saved choice stays on when a channel is unavailable. It can apply again when that channel becomes available.</p>}
      </div></div>
      {viewOnly && <p id="sending-view-only" className="muted-copy">This session is view-only. You can preview messages, but cannot save changes.</p>}
      {enabled && <ActionForm action={saveAction}>
        <input type="hidden" name="reviewWindowMinutes" value={savedMinutes} />
        <FormSubmitButton label="Turn off automatic sending" pendingLabel="Turning off…" disabled={viewOnly} describedBy={disabledReason} />
        <p className="muted-copy">Stops future attempts. A message already handed off for sending may still arrive.</p>
      </ActionForm>}
      <details className="card" onInvalidCapture={event => { event.currentTarget.open = true; }}>
        <summary>{available ? "Configure automatic sending" : "Automatic sending details"}</summary>
        <p>Email: {enabled && emailEnabled ? "On" : "Off"} · {emailAvailable ? "Available" : "Unavailable"}<br />
          Text: {enabled && smsEnabled ? "On" : "Off"} · {smsAvailable ? "Available" : "Unavailable"}</p>
        {available ? <ActionForm protect={!viewOnly} action={saveAction} className="form-stack">
          <fieldset className="sending-options">
            <label className="checkbox-card"><input type="checkbox" name="automationEnabled" defaultChecked={enabled} /><span><strong>Send prepared messages automatically</strong><small>Off by default. Calls and voicemails always stay manual.</small></span></label>
            <div className="form-grid">
              <label className="checkbox-card"><input type="checkbox" name="automationEmailEnabled" defaultChecked={emailEnabled} disabled={!emailAvailable} aria-describedby="sending-email-availability" /><span><strong>Email</strong><small id="sending-email-availability">{emailAvailable ? "Available" : "Unavailable here; not included when you save."}</small></span></label>
              <label className="checkbox-card"><input type="checkbox" name="automationSmsEnabled" defaultChecked={smsEnabled} disabled={!smsAvailable} aria-describedby="sending-sms-availability" /><span><strong>Text</strong><small id="sending-sms-availability">{smsAvailable ? "Available" : "Unavailable here; not included when you save."}</small></span></label>
            </div>
            <label className="field"><span>Time to review before sending</span><select name="reviewWindowMinutes" defaultValue={String(minutes)}>{AUTOMATIC_DELIVERY_WINDOWS.map(choice => <option key={choice.minutes} value={choice.minutes}>{choice.label}</option>)}</select><small>The window starts no earlier than the scheduled time. Quiet hours still apply.</small></label>
            <AutomaticSendPreview locale={locale} />
            {consent}
            <FormSubmitButton label="Save automatic sending" pendingLabel="Saving…" disabled={viewOnly} describedBy={disabledReason} />
          </fieldset>
        </ActionForm> : <form onSubmit={event => event.preventDefault()}>
          {/* Preview the saved channels without mounting activation or required consent fields. */}
          {emailEnabled && <input type="hidden" name="automationEmailEnabled" value="on" />}
          {smsEnabled && <input type="hidden" name="automationSmsEnabled" value="on" />}
          <input type="hidden" name="reviewWindowMinutes" value={minutes} />
          <AutomaticSendPreview locale={locale} />
        </form>}
      </details>
    </section>
  </>;
}
