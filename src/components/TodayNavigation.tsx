"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useTodayUpdates } from "@/components/useTodayUpdates";

const DraftGuard = createContext<(href: string) => boolean>(() => false);

export function TodayLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  const blocked = useContext(DraftGuard);
  return <Link href={href} className={className} prefetch={false} onNavigate={event => { if (blocked(href)) event.preventDefault(); }}>{children}</Link>;
}

export function TodayNavigation({ children, viewKey }: { children: ReactNode; viewKey: string }) {
  const router = useRouter();
  const root = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const previousKey = useRef(viewKey);
  const [destination, setDestination] = useState<string | null>(null);
  const titleId = useId(), descriptionId = useId();
  const { content, updateState, retry } = useTodayUpdates(children, viewKey, root);
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
      if (sheet && !sheet.open) sheet.showModal();
      draft.querySelector<HTMLElement>("textarea, input")?.focus();
    });
  };
  const discardAndContinue = () => {
    if (!destination) return;
    const href = destination;
    // Each editor owns its state. Discard only drafts in this Today view.
    root.current?.querySelectorAll<HTMLButtonElement>('[data-follow-up-draft="true"] [data-discard-follow-up-draft]').forEach(button => button.click());
    dialog.current?.close();
    router.push(href);
  };
  useEffect(() => {
    if (previousKey.current === viewKey) return;
    previousKey.current = viewKey;
    const heading = root.current?.querySelector<HTMLElement>("h1");
    const focusHeading = () => { if (previousKey.current === viewKey && heading?.isConnected) heading.focus(); };
    root.current?.querySelectorAll<HTMLDialogElement>("dialog[open]").forEach(open => {
      // Sheet restores its trigger in the queued close event. Navigation owns
      // the new focus destination, after those close handlers have finished.
      open.addEventListener("close", () => queueMicrotask(focusHeading), { once: true });
      open.close();
    });
    focusHeading();
  }, [viewKey]);

  return <DraftGuard.Provider value={blocked}><div ref={root} className="page today-page" onSubmitCapture={event => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || form.method.toLowerCase() !== "get" || form.target === "_blank") return;
    const target = new URL(form.action, location.href);
    if (target.origin !== location.origin || target.pathname !== "/jumps") return;
    event.preventDefault();
    const params = new URLSearchParams();
    for (const [key, value] of new FormData(form)) if (typeof value === "string") params.append(key, value);
    const href = `/jumps?${params}`;
    if (blocked(href)) form.reset();
    else router.push(href);
  }}>
    {updateState && updateState !== "undo" && <aside className="notice info" aria-label="Today updates">
      <p role="status">{updateState === "draft" ? "There are updates for this list. Finish or discard your message edits to show them."
        : updateState === "offline" ? "Your progress is saved. Reconnect to update this list."
        : updateState === "retry" ? "Your progress is saved. We couldn’t update this list. Try again when you’re ready."
        : "Updating your follow-up list…"}</p>
      {updateState === "draft" && <button className="button" type="button" onClick={keepEditing}>Return to message edits</button>}
      {updateState === "retry" && <button className="button" type="button" onClick={retry}>Update list</button>}
    </aside>}
    {content}
    <dialog ref={dialog} className="confirm-dialog" aria-labelledby={titleId} aria-describedby={descriptionId} onClose={() => setDestination(null)}>
      <div className="confirm-dialog-header"><div><h2 id={titleId}>Keep your message edits?</h2><p id={descriptionId}>Changing this list would close your unsent message edits. Keep editing, or discard them and continue.</p></div></div>
      <div className="confirm-dialog-actions">
        <button type="button" className="button primary" onClick={keepEditing}>Keep editing</button>
        <button type="button" className="button danger" onClick={discardAndContinue}>Discard edits and continue</button>
      </div>
    </dialog>
  </div></DraftGuard.Provider>;
}
