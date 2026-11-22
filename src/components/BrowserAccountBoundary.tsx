"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { BROWSER_CHANGE_CHANNEL, BROWSER_CHANGE_KEY, browserChangeMarker, clearForeignNotifications, clearPrivateBrowserState, signalBrowserChange } from "@/lib/private-browser-state";
import { revealObscuredFocus } from "@/lib/focus-visibility";

const AccountScope = createContext<string | null>(null);
export function useBrowserScope() { return useContext(AccountScope); }
// Confirms this tab's account with the server right before a save. False means send nothing: the caller keeps every
// entry and says it wasn't saved (JITM-08 §2.24). The shield also says why, except when the tab went to the background
// meanwhile or is masked, which cancels the save without a shield.
const AccountConfirmation = createContext<(() => Promise<boolean>) | null>(null);
export function useAccountConfirmation() { return useContext(AccountConfirmation); }
/** The shield's class. Its own links leave on purpose: the shield has already said what happens to unsaved work. */
export const ACCOUNT_SHIELD_CLASS = "browser-account-gate";
const CHECKING = "Checking your account…";
// "offline": no answer reached the tab (no connection, a network error or no reply in time).
// "unconfirmed": the server answered, but not with a usable account check.
type State = "checking" | "ready" | "offline" | "unconfirmed" | "expired" | "changed" | "signed-out";

/** The tab title while the shield shows: its heading takes the place of the page's part (JITM-10 §2.22). */
export function shieldTitle(heading: string, pageTitle: string): string {
  const product = pageTitle.lastIndexOf(" | ");
  return !pageTitle ? heading : `${heading}${product < 0 ? ` | ${pageTitle}` : pageTitle.slice(product)}`;
}

export function BrowserAccountBoundary({ scope, children }: { scope: string; children: ReactNode }) {
  const [state, setState] = useState<State>("checking");
  // An open shield checks again in place: its heading and actions stay, so the focus stays with them.
  const [rechecking, setRechecking] = useState(false);
  const [discarded, setDiscarded] = useState(false);
  // An installed app opens a new tab in the browser, which keeps its own sign-in (iOS), so sign in in place there.
  const [standalone, setStandalone] = useState(false);
  const checkRef = useRef<() => void>(() => undefined);
  const confirmRef = useRef<() => Promise<boolean>>(() => Promise.resolve(false));
  const confirmAccount = useCallback(() => confirmRef.current(), []);
  const content = useRef<HTMLDivElement>(null);
  const gate = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const titles = useRef<{ page: string; shown: string } | null>(null);

  // While the shield shows, the tab title follows its heading and the focus sits on that heading (JITM-10 §2.12, §2.22).
  // A background tab is never given focus.
  const present = useCallback((moveFocus = true) => {
    const text = heading.current?.textContent;
    if (!gate.current?.open || document.hidden || !text) return;
    const page = titles.current?.page ?? document.title;
    titles.current = { page, shown: shieldTitle(text, page) };
    document.title = titles.current.shown;
    if (moveFocus) heading.current?.focus({ preventScroll: true });
  }, []);
  const restoreTitle = useCallback(() => {
    // A page that set its own title meanwhile keeps it.
    if (titles.current && document.title === titles.current.shown) document.title = titles.current.page;
    titles.current = null;
  }, []);

  useEffect(() => { setStandalone(window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true); }, []);

  // Each new state, and each finished check in place, moves the focus to the heading. Mid-check it stays on the control used.
  useEffect(() => { if (state !== "ready") present(!rechecking); }, [state, rechecking, present]);

  useEffect(() => {
    let sequence = 0, controller: AbortController | null = null, gone = false;
    let focus: HTMLElement | null = null, scroll = 0;
    let signedOut = false, shown: State = "checking";
    const waiting: Array<(confirmed: boolean) => void> = [];
    const settle = (confirmed: boolean) => { for (const resolve of waiting.splice(0)) resolve(confirmed); };
    const show = (next: State) => { shown = next; setRechecking(false); setState(next); };
    const hide = (showDialog = true) => {
      document.documentElement.dataset.browserLocked = "true";
      if (content.current && !content.current.inert) {
        focus = document.activeElement instanceof HTMLElement && content.current.contains(document.activeElement) ? document.activeElement : null;
        scroll = window.scrollY;
        // Hide synchronously before an old tab or bfcache page can be used.
        content.current.style.visibility = "hidden";
        content.current.inert = true;
      }
      // Masking a background/exiting tab must not open a modal or move focus.
      try { if (showDialog && !document.hidden && gate.current && !gate.current.open) { gate.current.showModal(); present(); } } catch { /* Inactive document. */ }
    };
    const check = async (mask = true) => {
      if (gone) return;
      const id = ++sequence, marker = browserChangeMarker();
      controller?.abort(); controller = new AbortController();
      const active = controller;
      const timeout = window.setTimeout(() => active.abort(), 10_000);
      if (mask) {
        const inPlace = shown !== "checking" && Boolean(gate.current?.open);
        hide();
        if (inPlace) setRechecking(true); else show("checking");
      }
      let answered = false;
      try {
        const response = await fetch("/api/auth/browser-context", { cache: "no-store", credentials: "same-origin", signal: active.signal });
        answered = true;
        if (!response.ok) throw new Error("Unavailable");
        const result: unknown = await response.json();
        if (!result || typeof result !== "object" || !("scope" in result) || (result.scope !== null && typeof result.scope !== "string")) throw new Error("Invalid response");
        if (id !== sequence || gone) return;
        if (marker !== browserChangeMarker()) { void check(); return; }
        void clearForeignNotifications(result.scope);
        // A sign-out signal holds until the discard below runs, even when the same account has signed in again since.
        if (result.scope === scope && !signedOut) {
          clearPrivateBrowserState(scope);
          // A save asked for in a tab that has since gone to the background waits for the owner to press it again.
          if (document.hidden) { hide(); show("checking"); settle(false); return; }
          show("ready");
          delete document.documentElement.dataset.browserLocked;
          if (content.current) { content.current.style.visibility = "visible"; content.current.inert = false; }
          gate.current?.close(); restoreTitle();
          // A background success must not replay focus captured before the owner resumed work.
          if (mask && focus?.isConnected && document.hasFocus()) { focus.focus({ preventScroll: true }); window.scrollTo({ top: scroll, behavior: "instant" }); focus = null; }
          settle(true);
        } else if (result.scope === null && !signedOut) {
          hide(); show("expired"); settle(false);
        } else {
          hide(); clearPrivateBrowserState(); gone = true; setDiscarded(true);
          show(result.scope === null || result.scope === scope ? "signed-out" : "changed"); settle(false);
        }
      } catch {
        // Either way the tab stays masked; only the wording differs. A lost connection is not an account problem.
        if (id === sequence && !gone) { hide(); show(answered && navigator.onLine ? "unconfirmed" : "offline"); settle(false); }
      } finally { window.clearTimeout(timeout); }
    };
    const onSignal = (message: unknown) => {
      if (message && typeof message === "object" && "signedOut" in message && message.signedOut === true) signedOut = true;
      void check();
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key !== BROWSER_CHANGE_KEY) return;
      try { onSignal(JSON.parse(event.newValue ?? "null")); } catch { void check(); }
    };
    const onPageHide = () => { controller?.abort(); sequence++; hide(false); settle(false); };
    // Revalidate usable content in the background, like the periodic check. A new modal would swallow Escape meant
    // for the owner's open sheet. Hidden/restored tabs stay masked, and any failed check still locks immediately.
    const onFocus = () => { if (gone) hide(); else void check(content.current?.inert !== false); };
    const onVisible = () => { if (document.hidden) onPageHide(); else onFocus(); };
    const onPageShow = (event: PageTransitionEvent) => { if (event.persisted) onFocus(); };
    const onOffline = () => { if (!gone) { controller?.abort(); sequence++; hide(); show("offline"); settle(false); } };
    let channel: BroadcastChannel | null = null;
    try { channel = new BroadcastChannel(BROWSER_CHANGE_CHANNEL); channel.onmessage = event => onSignal(event.data); } catch { /* Storage/focus remain available. */ }
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onFocus);
    window.addEventListener("offline", onOffline);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("pagehide", onPageHide);
    document.addEventListener("visibilitychange", onVisible);
    const timer = window.setInterval(() => { if (!document.hidden) void check(false); }, 60_000);
    checkRef.current = onFocus;
    // Only a usable tab can save. The check runs unmasked, so the form shows its own saving state meanwhile.
    confirmRef.current = () => new Promise<boolean>(resolve => {
      if (gone || content.current?.inert !== false) { resolve(false); return; }
      waiting.push(resolve); void check(false);
    });
    // Sent through this boundary's own channel, the mount signal reaches the other tabs but doesn't re-check this one.
    signalBrowserChange(false, channel); void check();
    return () => {
      delete document.documentElement.dataset.browserLocked;
      gone = true; sequence++; controller?.abort(); channel?.close(); window.clearInterval(timer);
      settle(false); restoreTitle(); confirmRef.current = () => Promise.resolve(false);
      window.removeEventListener("storage", onStorage); window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onFocus); window.removeEventListener("offline", onOffline);
      window.removeEventListener("pageshow", onPageShow); window.removeEventListener("pagehide", onPageHide);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [scope, present, restoreTitle]);

  return <AccountScope.Provider value={scope}><AccountConfirmation.Provider value={confirmAccount}>
    {/* The shield comes first: closing it leaves the keyboard's starting point here, so the first Tab reaches the page's skip link (JITM-10 §2.9). */}
    <dialog ref={gate} className={ACCOUNT_SHIELD_CLASS} aria-labelledby="browser-account-title" onCancel={event => event.preventDefault()} onKeyDown={event => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); return; }
      if (event.key !== "Tab") return;
      // Tab and Shift+Tab stay inside the shield (JITM-10 §2.9): past its last control to its first, and back from the
      // first control or the heading to the last. With no control shown, the focus stays on the heading.
      const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("a[href], button")).filter(control => !control.matches(":disabled") && control.getClientRects().length > 0);
      const first = controls[0], last = controls.at(-1), active = document.activeElement;
      if (!first || !last) { event.preventDefault(); heading.current?.focus(); }
      else if (event.shiftKey ? active === first || active === heading.current : active === last) { event.preventDefault(); (event.shiftKey ? last : first).focus(); }
    }}><div className="auth-card">
      <h1 id="browser-account-title" ref={heading} tabIndex={-1}>{state === "checking" ? CHECKING : state === "changed" ? "Your account changed" : state === "signed-out" ? "You’re signed out" : state === "expired" ? "Sign in to continue" : "Reconnect to continue"}</h1>
      <p role="status">{rechecking ? CHECKING : state === "checking" ? "Your workspace will be ready in a moment." : state === "changed" ? "A different account is signed in on this browser, so anything not yet saved in this tab was removed." : state === "signed-out" ? "You signed out in another tab, so anything not yet saved in this tab was removed." : state === "expired" ? standalone ? "Sign in again to continue on this screen. Changes that haven’t been saved yet may be lost." : "Sign in to the same account in another tab, then return here to keep your draft." : state === "offline" ? "You’re offline. Your unsaved work stays in this tab." : "We couldn’t confirm your account. Reconnect, then try again. Your unsaved work stays in this tab."}</p>
      {(state === "changed" || state === "signed-out") ? <a className="button primary" href={state === "changed" ? "/jumps" : "/login"}>{state === "changed" ? "Open current account" : "Sign in"}</a> : state !== "checking" && <div className="page-actions">
        {state === "expired" && (standalone
          ? <a className="button primary" href={`/login?next=${encodeURIComponent(`${window.location.pathname}${window.location.search}`)}`}>Sign in</a>
          : <a className="button primary" href="/login" target="_blank" rel="noopener noreferrer">Sign in (opens a new tab)</a>)}
        <button className="button" type="button" onClick={() => checkRef.current()}>Check again</button>
      </div>}
      <noscript>Enable JavaScript to confirm your account and open your workspace.</noscript>
    </div></dialog>
    <div ref={content} data-browser-scope={scope} inert={state !== "ready"} style={{ visibility: state === "ready" ? "visible" : "hidden" }} onFocusCapture={event => revealObscuredFocus(event.target)}>
      {!discarded && children}
    </div>
  </AccountConfirmation.Provider></AccountScope.Provider>;
}
