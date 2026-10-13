"use client";

import { startTransition, useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { useRouter } from "next/navigation";
import { todayUpdateBlocker } from "@/lib/today-update-state";

type UpdateState = "draft" | "undo" | "offline" | "refreshing" | "retry" | null;

/** Retain the committed list while an edit or Undo is active, even if a server
 * response was already in flight when the owner started interacting. */
export function useTodayUpdates(children: ReactNode, viewKey: string, root: RefObject<HTMLDivElement | null>) {
  const router = useRouter();
  const [shown, setShown] = useState({ children, viewKey });
  const committed = useRef(shown), incoming = useRef(shown);
  const [updateState, setUpdateState] = useState<UpdateState>(null);
  const changed = useRef(false), version = useRef(0);
  const flight = useRef<{ version: number; failed: boolean } | null>(null);
  const timeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const check = useRef<() => void>(() => undefined);

  const applyIncoming = useCallback(() => {
    if (incoming.current === committed.current) return;
    if (incoming.current.viewKey === committed.current.viewKey && root.current && todayUpdateBlocker(root.current)) return;
    committed.current = incoming.current;
    // As a transition, so React keeps the list on screen while the new one renders, instead of hiding it for a moment:
    // hiding would drop the focus and scroll of a review open in it (D99, JITM-08 §2.33).
    const next = incoming.current;
    startTransition(() => setShown(next));
  }, [root]);

  useLayoutEffect(() => {
    const navigating = incoming.current.viewKey !== viewKey;
    incoming.current = { children, viewKey };
    if (navigating) {
      changed.current = false; version.current++;
      flight.current = null; clearTimeout(timeout.current);
    } else if (flight.current) {
      if (flight.current.version === version.current) changed.current = false;
      flight.current = null; clearTimeout(timeout.current);
    }
    applyIncoming();
    check.current();
  }, [children, viewKey, applyIncoming]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const attempt = () => {
      applyIncoming();
      const buffered = incoming.current !== committed.current;
      if (!changed.current && !buffered) { setUpdateState(null); return; }
      const blocker = root.current && todayUpdateBlocker(root.current);
      if (blocker) { setUpdateState(blocker); return; }
      if (document.hidden || root.current?.closest<HTMLElement>("[data-browser-scope]")?.inert) return;
      if (!navigator.onLine) { setUpdateState("offline"); return; }
      if (flight.current) { setUpdateState(flight.current.failed ? "retry" : "refreshing"); return; }
      if (!changed.current) { setUpdateState(null); return; }
      const request = { version: version.current, failed: false };
      flight.current = request;
      setUpdateState("refreshing");
      timeout.current = setTimeout(() => {
        if (flight.current !== request) return;
        request.failed = true; setUpdateState("retry");
      }, 20_000);
      startTransition(() => router.refresh());
    };
    const schedule = () => { clearTimeout(timer); timer = setTimeout(attempt, 0); };
    const onOutcome = (event: Event) => {
      const detail = (event as CustomEvent<{ jumpId?: string; status?: string }>).detail;
      if (!detail?.jumpId || !["PENDING", "DONE", "SKIPPED"].includes(detail.status ?? "")) return;
      changed.current = true; version.current++;
      if (flight.current?.failed) { flight.current = null; clearTimeout(timeout.current); }
      // Let the outcome component commit its Undo marker first.
      schedule();
    };
    const onWorkflow = () => { changed.current = true; version.current++; schedule(); };
    const workflowTimer = setInterval(() => { if (!document.hidden && root.current?.querySelector('[data-workflow-refresh="true"]')) onWorkflow(); }, 15000);
    window.addEventListener("jitm:workflow-updated", onWorkflow);
    window.addEventListener("focus", onWorkflow);
    check.current = schedule;
    const observer = new MutationObserver(schedule);
    observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true,
      attributeFilter: ["data-follow-up-draft", "data-follow-up-editing", "data-follow-up-undo", "inert"] });
    window.addEventListener("jitm:jump-state", onOutcome);
    window.addEventListener("online", schedule);
    document.addEventListener("visibilitychange", schedule);
    schedule();
    return () => {
      check.current = () => undefined;
      clearInterval(workflowTimer);
      window.removeEventListener("jitm:workflow-updated", onWorkflow);
      window.removeEventListener("focus", onWorkflow);
      clearTimeout(timer); clearTimeout(timeout.current); observer.disconnect();
      window.removeEventListener("jitm:jump-state", onOutcome);
      window.removeEventListener("online", schedule);
      document.removeEventListener("visibilitychange", schedule);
    };
  }, [applyIncoming, root, router]);

  const retry = () => { flight.current = null; clearTimeout(timeout.current); check.current(); };
  return { content: shown.children, updateState, retry };
}
