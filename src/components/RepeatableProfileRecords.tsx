"use client";

import { useState } from "react";
import { AppIcon } from "@/components/AppIcon";

type RecordValue = { name: string; value: string };

export function RepeatableProfileRecords({ fieldName, title, description, initial, maximum }: { fieldName: string; title: string; description: string; initial: RecordValue[]; maximum: number }) {
  const [rows, setRows] = useState<RecordValue[]>(initial.length ? initial : [{ name: "", value: "" }]);
  const move = (index: number, direction: -1 | 1) => setRows((current) => { const next = [...current]; const target = index + direction; if (target < 0 || target >= next.length) return current; [next[index], next[target]] = [next[target], next[index]]; return next; });
  return <section className="repeatable-profile-records"><div><h3>{title}</h3><p>{description}</p></div><input type="hidden" name={fieldName} value={JSON.stringify(rows.filter((row) => row.name.trim() || row.value.trim()))}/><div className="repeatable-profile-list">{rows.map((row, index) => <div className="repeatable-profile-row" key={index}><input value={row.name} onChange={(event) => setRows((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item))} aria-label={`${title} name ${index + 1}`} placeholder="Name"/><input value={row.value} onChange={(event) => setRows((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, value: event.target.value } : item))} aria-label={`${title} value ${index + 1}`} placeholder="Value"/><div className="repeatable-profile-actions"><button className="icon-button small" type="button" onClick={() => move(index, -1)} disabled={!index} aria-label={`Move ${row.name || `record ${index + 1}`} up`}><AppIcon name="arrowUp" /></button><button className="icon-button small" type="button" onClick={() => move(index, 1)} disabled={index === rows.length - 1} aria-label={`Move ${row.name || `record ${index + 1}`} down`}><AppIcon name="arrowDown" /></button><button className="button small" type="button" onClick={() => setRows((current) => current.filter((_, itemIndex) => itemIndex !== index))}>Remove</button></div></div>)}</div>{rows.length < maximum && <button className="button" type="button" onClick={() => setRows((current) => [...current, { name: "", value: "" }])}>Add record</button>}</section>;
}
