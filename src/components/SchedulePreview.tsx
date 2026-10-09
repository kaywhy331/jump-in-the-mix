"use client";
import { useEffect, useRef, useState } from "react";
import { dateInputInTimezone } from "@/lib/date-input";
import { zoneLabel } from "@/lib/display-labels";
type Step = { anchor: string; offsetMinutes: string; dayOffset: number; sendTimeMinutes: number | null; plannedAt: string };
export function SchedulePreview({ timezone, steps, settings = false }: { timezone: string; steps?: Step[]; settings?: boolean }) {
  const version = useRef(0);
  const marker = useRef<HTMLDivElement>(null);
  const [start, setStart] = useState(() => `${dateInputInTimezone(new Date(), timezone)}T10:00`);
  const [end, setEnd] = useState(() => `${dateInputInTimezone(new Date(), timezone)}T11:00`);
  const [appointment, setAppointment] = useState(false);
  const [result, setResult] = useState<{ items: Array<{ at: string | null; note: string }>; timezone: string } | null>(null);
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const fingerprint = JSON.stringify(steps); const last = useRef(fingerprint);
  const stale = last.current !== fingerprint;
  useEffect(() => {
    const form = marker.current?.closest("form"); if (!form) return;
    const changed = () => { version.current++; setResult(null); setBusy(false); };
    form.addEventListener("input", changed); form.addEventListener("change", changed);
    return () => { version.current++; form.removeEventListener("input", changed); form.removeEventListener("change", changed); };
  }, []);
  const preview = async () => {
    const request = ++version.current;
    setBusy(true); setError(""); setResult(null);
    try {
      const form = marker.current?.closest("form"); const data = form ? new FormData(form) : null;
      const minutes = (name: string) => { const [h, m] = String(data?.get(name) ?? "").split(":").map(Number); return h * 60 + m; };
      const rules = settings ? { defaultFollowUpMinutes: minutes("defaultFollowUpTime"), quietHoursStart: minutes("quietHoursStart"), quietHoursEnd: minutes("quietHoursEnd"), weekendScheduling: data?.get("weekendScheduling") } : undefined;
      const response = await fetch("/api/mixes/schedule-preview", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ timezone, start, end: appointment ? end : start, appointment, rules, steps: steps ?? [{ anchor: "CALENDAR_DAY", offsetMinutes: "", dayOffset: 0, sendTimeMinutes: null, plannedAt: "" }] }) });
      const payload = await response.json(); if (!response.ok) throw new Error(payload.error || "The schedule could not be previewed.");
      if (request === version.current) { last.current = fingerprint; setResult(payload); }
    } catch (cause) { if (request === version.current) setError(cause instanceof Error ? cause.message : "The preview is unavailable. Try again."); }
    finally { if (request === version.current) setBusy(false); }
  };
  return <div ref={marker} className="card schedule-preview"><h3>Try a schedule example</h3><p>This example saves nothing. Times show when work becomes due; sending preferences and contact eligibility still apply.</p><label className="field"><span>Example start</span><input type="datetime-local" value={start} onChange={event => { setStart(event.target.value); setResult(null); }} /></label>{!settings && <label className="checkbox-row"><input type="checkbox" checked={appointment} onChange={event => { setAppointment(event.target.checked); setResult(null); }} />Use a linked appointment</label>}{appointment && <label className="field"><span>Example appointment end</span><input type="datetime-local" value={end} onChange={event => { setEnd(event.target.value); setResult(null); }} /></label>}<p>Times are {zoneLabel(timezone)}.</p><button type="button" className="button" disabled={busy} onClick={preview}>{busy ? "Checking schedule…" : "Preview these dates"}</button>{error && <p role="alert">{error}</p>}{result && !stale && <ol aria-label="Example follow-up dates">{result.items.map((item, index) => <li key={index}><strong>Beat {index + 1}: {item.at ? new Intl.DateTimeFormat(undefined, { timeZone: result.timezone, dateStyle: "medium", timeStyle: "short" }).format(new Date(item.at)) : "Waiting"}</strong><p>{item.note}</p></li>)}</ol>}{result && stale && <p role="status">Timing changed. Preview again for current dates.</p>}{settings && <p>Saving updates pending follow-ups in the background. Completed history stays unchanged. Explicit planned times and appointment offsets keep their exact times.</p>}</div>;
}
