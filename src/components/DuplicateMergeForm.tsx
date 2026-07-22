"use client";

import { useState } from "react";
import { mergeContactsAction } from "@/lib/contact-merge-actions";

export function DuplicateMergeForm({
  left,
  right
}: {
  left: { id: string; name: string };
  right: { id: string; name: string };
}) {
  const [survivorId, setSurvivorId] = useState(left.id);
  const source = survivorId === left.id ? right : left;
  return (
    <form action={mergeContactsAction} className="form-grid duplicate-merge-form">
      <label className="field full"><span>Keep this Contact as the survivor</span><select name="survivorContactId" value={survivorId} onChange={(event) => setSurvivorId(event.target.value)}><option value={left.id}>{left.name}</option><option value={right.id}>{right.name}</option></select></label>
      <input type="hidden" name="sourceContactId" value={source.id} />
      <label className="field full"><span>Type {source.name} to confirm</span><input name="confirmation" key={source.id} placeholder={source.name} required /></label>
      <small className="field full">The source is archived as an audit record after its useful data and history are moved to the survivor.</small>
      <div className="form-actions field full"><button className="button danger" type="submit">Merge Contacts</button></div>
    </form>
  );
}
