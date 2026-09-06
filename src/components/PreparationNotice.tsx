"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { isPreparationStatus, type PreparationStatus } from "@/lib/preparation-types";
import { todayUpdateBlocker } from "@/lib/today-update-state";
import styles from "./PreparationNotice.module.css";

export function PreparationNotice({ initial, contactId, canRetry = true, deferWhileEditing = false }: { initial: PreparationStatus; contactId?: string; canRetry?: boolean; deferWhileEditing?: boolean }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [deferred, setDeferred] = useState<"draft" | "undo" | null>(null);
  const [status, setStatus] = useState(initial);
  const [attempt, setAttempt] = useState({ number: 0, retry: false });
  const [error, setError] = useState("");
  const [signedOut, setSignedOut] = useState(false);
  const [busy, setBusy] = useState(false);
  const [finished, setFinished] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [refreshing, startTransition] = useTransition();
  const hadWork = useRef(initial.state !== "ready");
  const lastAttempt = useRef(0);
  const endpoint = `/api/follow-ups/preparation${contactId ? `?contactId=${encodeURIComponent(contactId)}` : ""}`;

  useEffect(() => {
    let stopped = false;
    let controller: AbortController | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = Date.now() + 60_000;
    let current = initial;
    const manual = attempt.number !== lastAttempt.current;
    lastAttempt.current = attempt.number;
    let retry = manual && attempt.retry;
    let interactive = manual;
    setReady(true); setDeferred(null);
    setStatus(initial); setError(""); setSignedOut(false); setBusy(false);
    if (initial.state !== "ready") { hadWork.current = true; setFinished(false); setDismissed(false); }
    const stopTimer = () => { clearTimeout(timer); const active = controller; controller = undefined; active?.abort(); };
    async function check() {
      if (stopped || document.hidden) return;
      if (Date.now() >= deadline) { setStatus({ ...current, state: "delayed" }); setBusy(false); return; }
      controller = new AbortController();
      const active = controller;
      const timeout = setTimeout(() => active.abort(), 10_000);
      if (interactive) setBusy(true);
      try {
        const response = await fetch(endpoint, { method: retry ? "POST" : "GET", credentials: "same-origin", cache: "no-store", redirect: "error", signal: active.signal });
        retry = false;
        if (stopped || document.hidden || controller !== active) return;
        if (response.status === 401) { setSignedOut(true); throw new Error("Sign in again to check your follow-ups. Your edits on this page are still here."); }
        if (response.status === 429) throw new Error("Please wait a few minutes before trying preparation again.");
        if (!response.ok) throw new Error("We couldn’t check your follow-ups. Check again when you’re ready.");
        const value: unknown = await response.json().catch(() => null);
        if (!isPreparationStatus(value)) throw new Error("We couldn’t check your follow-ups. Check again when you’re ready.");
        if (stopped || document.hidden || controller !== active) return;
        current = value;
        setStatus(value); setError("");
        if (value.state === "ready") {
          const blocker = deferWhileEditing ? todayUpdateBlocker(document) : null;
          if (blocker) setDeferred(blocker);
          else { setFinished(hadWork.current); startTransition(() => router.refresh()); }
        } else {
          hadWork.current = true;
          if (value.state !== "failed") timer = setTimeout(check, 3_000);
        }
      } catch (reason) {
        if (!stopped && !document.hidden && controller === active) setError(reason instanceof TypeError ? "We couldn’t check your follow-ups. Check again when you’re ready."
          : reason instanceof Error && reason.name !== "AbortError" ? reason.message : "This check took too long. Check again when you’re ready.");
      } finally {
        clearTimeout(timeout);
        interactive = false;
        if (!stopped && controller === active) setBusy(false);
      }
    }
    const visibility = () => {
      stopTimer();
      if (!document.hidden && current.state !== "ready") void check();
    };
    if (manual || initial.state === "preparing" || initial.state === "delayed") timer = setTimeout(check, manual ? 0 : 1_000);
    document.addEventListener("visibilitychange", visibility);
    return () => { stopped = true; stopTimer(); document.removeEventListener("visibilitychange", visibility); };
  }, [initial, attempt, endpoint, router, deferWhileEditing]);

  useEffect(() => {
    if (!deferred) return;
    // Reordering or canceling a follow-up can unmount its editor. Wait until
    // the owner finishes/discards drafts before merging a new Today list.
    const update = () => {
      const blocker = todayUpdateBlocker(document);
      if (blocker) { setDeferred(blocker); return; }
      observer.disconnect(); setDeferred(null); setFinished(true);
      startTransition(() => router.refresh());
    };
    const observer = new MutationObserver(update);
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-follow-up-draft", "data-follow-up-undo"] });
    update();
    return () => observer.disconnect();
  }, [deferred, router]);

  const returnToDraft = () => {
    const draft = document.querySelector<HTMLElement>('[data-follow-up-draft="true"]');
    const dialog = draft?.closest("dialog");
    if (dialog && !dialog.open) dialog.showModal();
    draft?.querySelector<HTMLElement>("textarea, input")?.focus();
  };

  if (status.state === "ready" && !error && !deferred && (!finished || dismissed)) return null;
  const complete = status.state === "ready" && !error && !deferred;
  const title = deferred ? "Follow-ups are prepared" : complete ? (refreshing ? "Updating your follow-up list…" : "Follow-up list updated")
    : error ? "Your changes are saved"
    : status.state === "failed" ? "Follow-ups need another try"
    : status.state === "delayed" ? "Follow-ups are taking longer to prepare"
    : "Preparing your follow-ups…";
  const description = error || (deferred === "draft" ? "Finish or discard your message edits to show the updated list. Your draft stays here." : deferred === "undo" ? "Your list will update when the Undo time finishes."
    : complete ? "Your latest saved changes have been checked."
    : status.state === "failed" ? "Your changes are saved. Try preparing follow-ups again for your business."
    : status.state === "delayed" ? "Your changes are saved. You can keep working and check again shortly."
    : "Your changes are saved. This list will update when they’re ready; you can keep working.");
  return <aside className={`notice ${complete ? "success" : "info"} ${styles.notice}`} aria-label="Follow-up preparation">
    <div role="status" aria-live="polite" aria-atomic="true"><strong>{title}</strong><p>{description}</p></div>
    <div className={styles.actions}>
      {deferred === "undo" ? null : deferred === "draft" ? <button type="button" className="button small" onClick={returnToDraft}>Return to draft</button>
        : complete ? <button type="button" className="button small" onClick={() => setDismissed(true)}>Dismiss</button>
        : <>
          {signedOut && <Link className="button small" href="/login" target="_blank" rel="noopener noreferrer">Sign in in a new tab</Link>}
          {!signedOut && status.state === "failed" && canRetry && <button type="button" className="button small" disabled={!ready} aria-disabled={!ready || busy} onClick={() => { if (ready && !busy) setAttempt(previous => ({ number: previous.number + 1, retry: true })); }}>Retry preparation</button>}
          <button type="button" className="button small" disabled={!ready} aria-disabled={!ready || busy} onClick={() => { if (ready && !busy) setAttempt(previous => ({ number: previous.number + 1, retry: false })); }}>{busy ? "Checking…" : "Check again"}</button>
        </>}
    </div>
  </aside>;
}
