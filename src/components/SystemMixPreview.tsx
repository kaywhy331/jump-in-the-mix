"use client";
import { useState } from "react";
import { renderSystemMix, type SystemMixContent } from "@/lib/system-mix";

export function SystemMixPreview({ content }: { content: SystemMixContent }) {
  const [sample, setSample] = useState("example");
  const sender = sample === "blank" ? "" : "Alex Morgan";
  const contact = sample === "blank" ? "" : sample === "long" ? "Alexandria Catherine Montgomery-Wellington" : "Jordan Lee";
  const message = sample === "raw" ? content : renderSystemMix(content, sender, contact);
  return <div className="form-stack">
    <label className="field"><span>Preview data</span><select value={sample} onChange={event => setSample(event.target.value)}><option value="example">Example contact</option><option value="long">Long contact name</option><option value="blank">Missing names</option><option value="raw">Saved placeholders</option></select></label>
    <article className="speech-bubble speech-bubble--compose" style={{ overflowWrap: "anywhere" }} aria-label="Example personal invitation">
      <p><strong>Subject:</strong> {message.subject}</p><p style={{ whiteSpace: "pre-wrap" }}>{message.body}</p>
      <p><strong>Accept your personal invitation</strong> — Jump inserts the recipient's unique link here.</p>
      <p>This invitation is only for jordan@example.test and can be used once.</p>
      <p>Text invitations can be redeemed with the recipient’s chosen email address.</p>
    </article><p>This example uses invented data. No invitation or access link is created. Each member can prepare three single-use links. Invitations appear in Today for the member to send through their own text or email app.</p>
  </div>;
}
