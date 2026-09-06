"use client";
import { useState } from "react";
export function CopyField({ label, value, secret = false, multiline = false }: { label: string; value: string; secret?: boolean; multiline?: boolean }) {
  const [status, setStatus] = useState(""); const [visible, setVisible] = useState(!secret);
  return <div className="copy-field"><label className="field"><span>{label}</span>{multiline ? <textarea readOnly value={value} rows={9} spellCheck={false} /> : <input readOnly type={visible ? "text" : "password"} value={value} autoComplete="off" />}</label><div className="form-actions">{secret && <button className="button small" type="button" onClick={() => setVisible(!visible)}>{visible ? "Hide key" : "Show key"}</button>}<button className="button small" type="button" onClick={async () => { try { await navigator.clipboard.writeText(value); setStatus("Copied."); } catch { setStatus("Select the field and copy it using your keyboard."); } }}>Copy {label.toLowerCase()}</button><span role="status">{status}</span></div></div>;
}
