"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { QuietDayPage, QuietDaySuggestion } from "@/lib/quiet-day-types";
import { formatDate } from "@/lib/format";
import { AppIcon } from "@/components/AppIcon";

export function QuietDaySuggestions({ initial, canResolve = true, compact = false, initialQuery = "", locale = "en-US" }: { initial: QuietDayPage; canResolve?: boolean; compact?: boolean; initialQuery?: string; locale?: string }) {
  const router = useRouter();
  const [data, setData] = useState(initial);
  const [query, setQuery] = useState(initialQuery);
  const [page, setPage] = useState(initial.page);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const version = useRef(0);
  const status = useRef<HTMLParagraphElement>(null);
  const refresh = useCallback(async () => {
    const request = ++version.current;
    setLoading(true);
    try {
      const response = await fetch(`/api/quiet-days?${new URLSearchParams({ q: query, page: String(page) })}`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Check-ins could not be refreshed.");
      if (request === version.current) { setData(result); setError(""); }
    } catch (cause) { if (request === version.current) setError(cause instanceof Error ? cause.message : "Check-ins could not be refreshed."); }
    finally { if (request === version.current) setLoading(false); }
  }, [query, page]);
  useEffect(() => { if (query === initialQuery && page === initial.page) setData(initial); else void refresh(); }, [initial]);
  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 250);
    const update = () => { if (document.visibilityState !== "hidden") void refresh(); };
    window.addEventListener("focus", update); window.addEventListener("jitm:jump-state", update); window.addEventListener("jitm:contact-activity", update); document.addEventListener("visibilitychange", update);
    return () => { window.clearTimeout(timer); version.current++; window.removeEventListener("focus", update); window.removeEventListener("jitm:jump-state", update); window.removeEventListener("jitm:contact-activity", update); document.removeEventListener("visibilitychange", update); };
  }, [refresh]);
  const resolve = async (item: QuietDaySuggestion, resolution: "COMPLETED" | "SKIPPED") => {
    if (pending) return;
    setPending(item.contactId); setError("");
    try {
      const response = await fetch("/api/quiet-days", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contactId: item.contactId, cycle: item.cycle, resolution }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "The check-in could not be updated.");
      setNotice(result.stale ? "This check-in changed or was already resolved. The list is up to date." : `${resolution === "SKIPPED" ? "Skipped" : "Completed"} check-in for ${item.name}. The quiet-day period starts again.`);
      await refresh(); router.refresh(); status.current?.focus({ preventScroll: true });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The outcome could not be saved. Try again."); }
    finally { setPending(null); }
  };
  if (!data.enabled && compact) return null;
  if (compact && !data.total && !notice && !error) return null;
  return <section className={`quiet-day-suggestions${compact ? " compact" : ""}`} aria-label="Quiet-day check-ins">
    <div className="section-label"><h2>{compact ? "Quiet-day check-ins" : "Just saying hello"}</h2><span>{data.total}</span></div>
    {data.enabled ? <p className="muted-copy">After {data.days} quiet days. A suggestion to reconnect; nobody changes stage.</p> : <p>Turn on quiet-day check-ins and choose an interval in your preferences.</p>}
    {!compact && <p><Link href="/account/preferences#quiet-days">Check-in preferences</Link></p>}
    {data.enabled && <>
      {!compact && <label className="field quiet-day-search"><span className="sr-only">Search quiet-day check-ins</span><input type="search" value={query} maxLength={160} placeholder="Find someone" onChange={event => { setQuery(event.target.value); setPage(1); }} /></label>}
      <p ref={status} tabIndex={-1} role="status" className={notice ? "notice success" : "sr-only"}>{notice || (loading ? "Updating check-ins…" : "")}</p>
      {error && <p role="alert" className="notice error">{error} <button className="text-button" type="button" onClick={() => void refresh()}>Try again</button></p>}
      <ul className="quiet-day-list">{(compact ? data.items.slice(0, 3) : data.items).map(item => <li key={item.contactId}>
        <div className="quiet-day-person"><span className="person-initials" aria-hidden="true">{item.name.split(/\s+/).slice(0, 2).map(part => part[0]).join("")}</span><div><Link href={`/contacts/${item.contactId}`}><strong>Check in with {item.name}</strong></Link><small>Due <time dateTime={item.dueDate}>{formatDate(`${item.dueDate}T12:00:00Z`, { locale, timeZone: "UTC" })}</time>{item.stage ? ` · ${item.stage}` : ""}</small></div></div>
        <div className="quiet-day-actions">{item.nextJumpId && <Link className="button small soft" href={`/jumps?jump=${item.nextJumpId}&range=all`}>Review follow-up</Link>}{canResolve && <><Link className="button small" href={`/contacts/${item.contactId}#log-conversation`}>Log conversation</Link><button type="button" className="button small" disabled={Boolean(pending)} onClick={() => void resolve(item, "SKIPPED")}>Skip</button><button type="button" className="button small primary" disabled={Boolean(pending)} onClick={() => void resolve(item, "COMPLETED")}>{pending === item.contactId ? "Saving…" : "Completed"}</button></>}</div>
      </li>)}</ul>
      {!data.items.length && !loading && <p>{query ? "No check-ins match this search." : "No quiet-day check-ins are due. Completed follow-ups, logged conversations and your check-in decisions restart the period."}</p>}
      {!compact && data.pages > 1 && <nav className="quiet-day-pagination" aria-label="Quiet-day check-in pages"><button className="button small" type="button" disabled={data.page <= 1 || loading} onClick={() => setPage(data.page - 1)}>Previous</button><span>{data.page} of {data.pages}</span><button className="button small" type="button" disabled={data.page >= data.pages || loading} onClick={() => setPage(data.page + 1)}>Next</button></nav>}
      {compact && <Link className="inline-action" href="/journey?touchpoint=quiet-days">View all check-ins<AppIcon name="chevronRight" className="inline-action-icon" /></Link>}
    </>}
  </section>;
}
