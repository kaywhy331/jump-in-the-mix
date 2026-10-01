"use client";

import { useState } from "react";
import { SUPPORT_SECTIONS, supportBrowserFamily, supportDiagnosticsSummary, type SupportDiagnostics } from "@/lib/support-report";

export function SupportContext({ disabled = false }: { disabled?: boolean }) {
  const [diagnostics, setDiagnostics] = useState<SupportDiagnostics | null>(null);
  const summary = diagnostics ? supportDiagnosticsSummary(JSON.stringify(diagnostics)) : "";
  return <div className="support-context">
    <label className="checkbox-row"><input type="checkbox" disabled={disabled} checked={Boolean(diagnostics)} onChange={event => {
      const theme = document.documentElement.getAttribute("data-theme");
      setDiagnostics(event.target.checked ? {
        section: "Help",
        layout: window.innerWidth < 768 ? "phone" : "desktop/tablet",
        browser: supportBrowserFamily(navigator.userAgent),
        theme: theme === "light" || theme === "dark" ? theme : "system",
        connection: navigator.onLine ? "online" : "offline"
      } : null);
    }} />Include basic diagnostics (optional)</label>
    {diagnostics && <>
      <label className="field support-compact-field"><span>Affected section</span><select disabled={disabled} value={diagnostics.section} onChange={event => setDiagnostics({ ...diagnostics, section: event.target.value as SupportDiagnostics["section"] })}>{SUPPORT_SECTIONS.map(value => <option key={value}>{value}</option>)}</select></label>
      <input name="supportDiagnostics" type="hidden" value={JSON.stringify(diagnostics)} disabled={disabled} />
      <p className="support-diagnostics-preview">Will include: {summary}.</p>
      <small>No page contents, links, contact IDs or browser history are attached.</small>
    </>}
  </div>;
}
