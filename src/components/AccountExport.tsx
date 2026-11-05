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
      // The JSON export streams: a failure after the first bytes breaks the body, never a partial file.
      const blob = await response.blob().catch(() => { throw new Error("The download stopped before it finished. Try again."); }); const url = URL.createObjectURL(blob); const link = document.createElement("a");
      link.href = url; link.download = format === "csv" ? "jump-in-the-mix-export.zip" : "jump-in-the-mix-export.json"; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 60_000); setMessage("Export prepared and passed to your browser. Check Downloads for the file.");
    } catch (cause) { setError(true); setMessage(cause instanceof Error ? cause.message : "The download failed. Try again."); }
    finally { setBusy(""); }
  };
  return <div><p>Keep the downloaded copy private. It includes your contacts, notes, and follow-up history.</p><p id="account-export-formats">Spreadsheet files come in a ZIP of CSV files you can open in a spreadsheet. The JSON backup also includes your account records, Mixes, and settings in one structured file.</p><div className="page-actions"><button className="button primary" type="button" aria-describedby="account-export-formats" disabled={Boolean(busy)} onClick={() => download("csv")}>Spreadsheet files</button><button className="button" type="button" aria-describedby="account-export-formats" disabled={Boolean(busy)} onClick={() => download("json")}>JSON backup</button></div>{message && <p role={error ? "alert" : "status"}>{message}</p>}</div>;
}
