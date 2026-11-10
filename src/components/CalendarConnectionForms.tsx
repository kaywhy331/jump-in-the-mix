"use client";
import { Fragment, startTransition, useActionState, useEffect, useRef, type FormEvent, type ReactNode } from "react";
import { Notice } from "@/components/Notice";
import { TimezonePicker } from "@/components/TimezonePicker";
import { addCalendarConnectionAction, type CalendarConnectionState } from "@/lib/calendar-actions";
import { UNCONFIRMED_SAVE, isNavigationSignal } from "@/lib/unconfirmed-save";

/** The two ways to add a calendar to the connections panel; each answers inside its own open form. */
export function CalendarConnectionForms({ subscriptions, timezone, viewOnly }: { /** This installation can store subscription URLs. */ subscriptions: boolean; timezone: string; viewOnly: boolean }) {
  return <>
    <details><summary>Connect a calendar subscription</summary>{subscriptions ? <ConnectionForm intent="connect" viewOnly={viewOnly} label="Connect calendar" pending="Connecting…" primary>
      <label className="field"><span>Calendar name</span><input name="name" maxLength={100} placeholder="For example, Work calendar" required /></label><label className="field"><span>iCalendar subscription URL</span><input name="url" type="text" placeholder="https://…/calendar.ics" maxLength={4096} required /></label><TimezonePicker name="timezone" id="subscription-zone" label="Calendar timezone" defaultValue={timezone} /><p className="muted-copy">In Google, copy the secret iCal address from calendar settings. In Outlook, use Publish a calendar → ICS. In Apple, use the shared calendar’s link. Provider sharing settings determine who can access that link; keep it private.</p>
    </ConnectionForm> : <p>Calendar subscriptions are unavailable until this installation enables encrypted connections. File import is available below.</p>}</details>
    <details><summary>Import a calendar file</summary><ConnectionForm intent="import" viewOnly={viewOnly} label="Import availability" pending="Importing…">
      <label className="field"><span>Imported calendar name</span><input name="name" maxLength={100} required /></label><label className="field"><span>iCalendar file</span><input name="file" type="file" accept=".ics,text/calendar" required /></label><TimezonePicker name="timezone" id="file-zone" label="File timezone" defaultValue={timezone} />
    </ConnectionForm></details>
  </>;
}

/** The action's reply, plus how many calendars this form has added: each one starts a fresh, empty form. */
type ConnectionFormState = CalendarConnectionState & { added: number };

/**
 * A failed connect or import keeps every entry and moves focus to its error (JITM-08 §2.24); a
 * success names what was added (JITM-04 §2.7). The page stays where it is, panels open.
 */
function ConnectionForm({ intent, viewOnly, label, pending: pendingLabel, primary = false, children }: { intent: "connect" | "import"; viewOnly: boolean; label: string; pending: string; primary?: boolean; children: ReactNode }) {
  const [state, action, pending] = useActionState<ConnectionFormState, FormData>(async (previous, data) => {
    try { const result = await addCalendarConnectionAction({}, data); return { ...result, added: previous.added + (result.notice ? 1 : 0) }; }
    catch (cause) { if (isNavigationSignal(cause)) throw cause; return { error: UNCONFIRMED_SAVE, added: previous.added }; }
  }, { added: 0 });
  const message = useRef<HTMLDivElement>(null);
  useEffect(() => { if (state.error || state.notice) message.current?.focus(); }, [state]);
  // React clears a form submitted through its action prop once the action settles. Sending from the
  // submit event keeps what was typed and the chosen file (as CalendarEntryForm does).
  const send = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const data = new FormData(event.currentTarget); startTransition(() => action(data)); };
  return <form action={action} onSubmit={send} onReset={event => event.preventDefault()} className="form-stack">
    {(state.error || state.notice) && <div ref={message} tabIndex={-1}><Notice type={state.error ? "error" : "success"}>{state.error || state.notice}</Notice></div>}
    <input type="hidden" name="intent" value={intent} />
    <Fragment key={state.added}>{children}</Fragment>
    <button className={primary ? "button primary" : "button"} disabled={viewOnly || pending}>{pending ? pendingLabel : label}</button>
  </form>;
}
