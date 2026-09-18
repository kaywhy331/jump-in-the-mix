"use client";
import { useEffect, useRef, useState } from "react";
export function SignaturePreview() {
  const marker = useRef<HTMLDivElement>(null); const [text, setText] = useState({ sms: "", email: "" });
  useEffect(() => {
    const form = marker.current?.closest("form"); if (!form) return;
    const update = () => { const values = new FormData(form); setText({ sms: String(values.get("smsSignature") ?? ""), email: String(values.get("emailSignature") ?? "") }); };
    update(); form.addEventListener("input", update); return () => form.removeEventListener("input", update);
  }, []);
  return <div ref={marker} className="field full"><h3>Example with fictional Alex</h3><p className="muted-copy">These previews use the signatures above, including your spacing.</p><strong>Text</strong><p style={{ whiteSpace: "pre-wrap" }}>{`Hi Alex, just checking whether you have any questions.\n\n${text.sms}`}</p><strong>Email</strong><p style={{ whiteSpace: "pre-wrap" }}>{`Hi Alex,\n\nThanks for our conversation. Let me know what would help next.\n\n${text.email}`}</p></div>;
}
