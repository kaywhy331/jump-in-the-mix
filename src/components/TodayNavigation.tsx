"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useTodayUpdates } from "@/components/useTodayUpdates";
import { FollowUpConfirmations } from "@/components/JumpWorkflow";
import { openSheet } from "@/lib/sheet-layout";
import { AppIcon } from "@/components/AppIcon";
import { TodayReviewPlacement } from "@/components/TodayReviewPlacement";

const DraftGuard = createContext<(href: string) => boolean>(() => false);
// A route transition can mount a new page instance. Keep this data-free focus
// intent outside that instance so its first effect can honor keyboard navigation.
let focusNextTodayPage = false;

export function TodayLink({ href, children, className, title, "aria-current": current }: { href: string; children: ReactNode; className?: string; title?: string; "aria-current"?: "page" }) {
  const blocked = useContext(DraftGuard);
  return <Link href={href} className={className} title={title} aria-current={current} prefetch={false} onNavigate={event => {
    if (blocked(href)) event.preventDefault();
    else focusNextTodayPage = true;
  }}>{children}</Link>;
}

export function TodayNavigation({ children, viewKey }: { children: ReactNode; viewKey: string }) {
  const router = useRouter();
  const root = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const previousKey = useRef(viewKey);
  const [destination, setDestination] = useState<string | null>(null);
  const titleId = useId(), descriptionId = useId();
  const { content, updateState, retry } = useTodayUpdates(children, viewKey, root);
  // A read follows every outcome (D99), and most land within a second. Saying "Updating your follow-up list…" only for a
  // slower one keeps the list from moving down and back after each outcome, and screen readers from hearing it each time.
  const [slowRead, setSlowRead] = useState(false);
  useEffect(() => {
    setSlowRead(false);
    if (updateState !== "refreshing") return;
    const timer = setTimeout(() => setSlowRead(true), 1_000);
    return () => clearTimeout(timer);
  }, [updateState]);
  const notice = updateState === "refreshing" && !slowRead ? null : updateState;
  const blocked = (href: string) => {
    if (!root.current?.querySelector('[data-follow-up-draft="true"]')) return false;
    setDestination(href);
    if (!dialog.current?.open) dialog.current?.showModal();
    return true;
  };
  const keepEditing = () => {
    dialog.current?.close();
    const draft = root.current?.querySelector<HTMLElement>('[data-follow-up-draft="true"]');
    const sheet = draft?.closest("dialog");
    root.current?.querySelectorAll<HTMLDialogElement>("dialog.sheet[open]").forEach(open => { if (open !== sheet) open.close(); });
    requestAnimationFrame(() => {
      if (!draft || !root.current?.contains(draft)) return;
      if (sheet) openSheet(sheet);
      draft.querySelector<HTMLElement>("textarea, input")?.focus();
    });
  };
  const discardAndContinue = () => {
    if (!destination) return;
    const href = destination;
    // Each editor owns its state. Discard only drafts in this Today view.
    root.current?.querySelectorAll<HTMLButtonElement>('[data-follow-up-draft="true"] [data-discard-follow-up-draft]').forEach(button => button.click());
    dialog.current?.close();
    focusNextTodayPage = true;
    router.push(href);
  };
  useEffect(() => {
    if (previousKey.current === viewKey && !focusNextTodayPage) return;
    focusNextTodayPage = false;
    previousKey.current = viewKey;
    let cancelled = false;
    const focusHeading = () => {
      if (cancelled) return;
      // Suspense can hide this page and detach its ref while committing the
      // destination. Wait for the visible destination instead of focusing the
      // hidden heading, which browsers silently ignore.
      const page = [...document.querySelectorAll<HTMLElement>("[data-today-view]")]
        .find(element => element.dataset.todayView === viewKey && element.getClientRects().length > 0 && !element.closest("[inert]"));
      const heading = page?.querySelector<HTMLElement>("h1");
      heading?.focus();
      if (heading && document.activeElement === heading) {
        observer.disconnect();
      }
    };
    const observer = new MutationObserver(focusHeading);
    observer.observe(document.documentElement, { subtree: true, childList: true,
      attributes: true, attributeFilter: ["style", "hidden", "inert"] });
    root.current?.querySelectorAll<HTMLDialogElement>("dialog[open]").forEach(open => {
      // Sheet restores its trigger in the queued close event. Navigation owns
      // the new focus destination, after those close handlers have finished.
      open.addEventListener("close", () => queueMicrotask(focusHeading), { once: true });
      open.close();
    });
    // Handle an already visible page as well as a later Suspense reveal.
    const frame = requestAnimationFrame(focusHeading);
    return () => { cancelled = true; observer.disconnect(); cancelAnimationFrame(frame); };
  }, [viewKey]);

  return <TodayReviewPlacement root={root} viewKey={viewKey}><DraftGuard.Provider value={blocked}><div ref={root} className="page today-page" data-today-view={viewKey} onSubmitCapture={event => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || form.method.toLowerCase() !== "get" || form.target === "_blank") return;
    const target = new URL(form.action, location.href);
    if (target.origin !== location.origin || target.pathname !== "/jumps") return;
    event.preventDefault();
    const params = new URLSearchParams();
    for (const [key, value] of new FormData(form)) if (typeof value === "string") params.append(key, value);
    const href = `/jumps?${params}`;
    if (blocked(href)) form.reset();
    else { focusNextTodayPage = true; router.push(href); }
  }}>
    {/* Confirmations go in the inner list, and an end-of-Mix question after it, so the order on screen is also the order
        for keyboard and screen-reader users (A11Y-03). */}
    <div id="follow-up-confirmations" className="follow-up-confirmations" aria-label="Recent follow-up results"><div id="follow-up-undos" className="follow-up-undos" /></div>
    {/* Outside the list, so a fresh read of it never takes a confirmation or its Undo away (D99). */}
    <FollowUpConfirmations />
    {notice && <aside className="notice info" aria-label="Today updates" data-today-notice={notice === "refreshing" ? undefined : true}>
      <p role="status">{notice === "draft" ? "There are updates for this list. Finish or discard your message edits to show them."
        : notice === "offline" ? "Your progress is saved. Reconnect to update this list."
        : notice === "retry" ? "Your progress is saved. We couldn’t update this list. Try again when you’re ready."
        : "Updating your follow-up list…"}</p>
      {notice === "draft" && <button className="button" type="button" onClick={keepEditing}>Return to message edits</button>}
      {notice === "retry" && <button className="button" type="button" onClick={retry}>Update list</button>}
    </aside>}
    {content}
    <div className="today-review-placeholder"><h2>One conversation at a time.</h2><p>Choose a follow-up to review its message and next step.</p></div>
    <dialog ref={dialog} className="confirm-dialog" aria-labelledby={titleId} aria-describedby={descriptionId} onClose={() => setDestination(null)}>
      <div className="confirm-dialog-header"><div><h2 id={titleId}>Keep your message edits?</h2><p id={descriptionId}>Your newest message edits haven’t finished saving. Keep editing, or discard those edits and continue.</p></div><button className="icon-button" type="button" onClick={keepEditing} aria-label="Close and keep editing"><AppIcon name="close" /></button></div>
      <div className="confirm-dialog-actions">
        <button type="button" className="button" autoFocus onClick={keepEditing}>Keep editing</button>
        <button type="button" className="button danger" onClick={discardAndContinue}>Discard edits and continue</button>
      </div>
    </dialog>
  </div></DraftGuard.Provider></TodayReviewPlacement>;
}
