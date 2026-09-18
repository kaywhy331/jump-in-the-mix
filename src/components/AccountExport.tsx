"use client";
import { useState } from "react";
export function AccountExport() {
  const [busy, setBusy] = useState(""); const [message, setMessage] = useState(""); const [error, setError] = useState(false);
  const download = async (format: "csv" | "json") => {
    setBusy(format); setError(false); setMessage("Preparing your export…");
    try {
      const response = await fetch(`/api/account/export${format === "csv" ? "?format=csv" : ""}`);
      if (!response.ok) { const body = await response.json().catch(() => null); throw new Error(body?.error || "The export could not be prepared. Try again."); }
      if (!response.headers.get("content-type")?.includes(format === "csv" ? "zip" : "json")) throw new Error("Your session may have ended. Sign in again, then retry the export.");
      const blob = await response.blob(); const url = URL.createObjectURL(blob); const link = document.createElement("a");
      link.href = url; link.download = format === "csv" ? "jump-in-the-mix-export.zip" : "jump-in-the-mix-export.json"; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 60_000); setMessage("Export prepared and passed to your browser. Check Downloads for the file.");
    } catch (cause) { setError(true); setMessage(cause instanceof Error ? cause.message : "The download failed. Try again."); }
    finally { setBusy(""); }
  };
  return <div><p>The bundle contains your account and workspace records, including contacts, notes, dates, plans, and follow-up history. Keep the downloaded copy private.</p><div className="page-actions"><button className="button primary" disabled={Boolean(busy)} onClick={() => download("csv")}>Spreadsheet bundle</button><button className="button" disabled={Boolean(busy)} onClick={() => download("json")}>Complete JSON</button></div>{message && <p role={error ? "alert" : "status"}>{message}</p>}</div>;
}
