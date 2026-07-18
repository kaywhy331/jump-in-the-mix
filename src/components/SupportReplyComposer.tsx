"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { adminReplyToSupportTicketAction } from "@/lib/support-admin-actions";
import { SUPPORT_REPLY_TEMPLATES } from "@/lib/support-content";

function SubmitSupportResponseButton() {
  const { pending } = useFormStatus();
  return (
    <button className="button primary" type="submit" disabled={pending}>
      {pending ? "Saving response…" : "Send Jump in the Mix Response"}
    </button>
  );
}

export function SupportReplyComposer({ ticketId }: { ticketId: string }) {
  const [body, setBody] = useState("");

  return (
    <form action={adminReplyToSupportTicketAction} className="form-stack support-reply-composer">
      <input type="hidden" name="ticketId" value={ticketId} />
      <label className="field">
        <span className="field-label">Response template</span>
        <select
          defaultValue=""
          onChange={(event) => {
            const selected = SUPPORT_REPLY_TEMPLATES.find((template) => template.name === event.target.value);
            if (selected) setBody(selected.body);
          }}
        >
          <option value="">Start from a blank response</option>
          {SUPPORT_REPLY_TEMPLATES.map((template) => (
            <option value={template.name} key={template.name}>{template.name}</option>
          ))}
        </select>
      </label>
      <label className="field">
        <span className="field-label">Jump in the Mix Response</span>
        <textarea
          name="body"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          minLength={2}
          maxLength={5000}
          rows={8}
          placeholder="Write a clear response with the next action the customer should take…"
          required
        />
        <small>The response is saved to the ticket first. Email delivery is recorded separately and can be retried.</small>
      </label>
      <div className="form-actions"><SubmitSupportResponseButton /></div>
    </form>
  );
}
