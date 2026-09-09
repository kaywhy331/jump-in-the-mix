"use client";

import { useId, useState } from "react";
import { SharedMixPreview } from "@/components/SharedMixPreview";
import { renderJumpSnapshot } from "@/lib/jump-render";
import type { SharedMixStep } from "@/lib/shared-mix";

export function LibraryPreview({ title, triggerMode, dateTypeName, steps }: { title: string; triggerMode: string; dateTypeName: string | null; steps: SharedMixStep[] }) {
  const id = useId(), [sample, setSample] = useState("original");
  const contact = { firstName: sample === "blank" ? null : sample === "long" ? "Alexandria Catherine" : "Jordan", lastName: sample === "blank" ? null : sample === "long" ? "Montgomery-Wellington" : "Lee",
    company: sample === "blank" ? null : "Example Studio", publicNotes: null, privateNotes: null, emails: [], phones: [], addresses: [] };
  const rendered = sample === "original" ? steps : steps.map(step => ({ ...step, ...renderJumpSnapshot(step, contact, null, { name: "Alex Morgan", email: "alex@example.test" }, step.channel) }));
  return <div className="form-stack"><label className="field" htmlFor={id}><span>Preview data</span><select id={id} value={sample} onChange={event => setSample(event.target.value)}>
    <option value="original">Saved placeholders</option><option value="sample">Example contact</option><option value="long">Long contact name</option><option value="blank">Missing contact fields</option>
  </select></label><p>Examples use invented data and the same text renderer as customer follow-ups. No message is sent. Check missing details and signatures before releasing.</p>
    <SharedMixPreview title={title} triggerMode={triggerMode} dateTypeName={dateTypeName} durationDays={Math.max(...steps.map(s => s.dayOffset)) - Math.min(...steps.map(s => s.dayOffset))} steps={rendered} expanded />
  </div>;
}
