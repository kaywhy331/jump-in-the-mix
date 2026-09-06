"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { BROWSER_CHANGE_CHANNEL, BROWSER_CHANGE_KEY, browserChangeMarker, clearForeignNotifications, clearPrivateBrowserState, signalBrowserChange } from "@/lib/private-browser-state";

const AccountScope = createContext<string | null>(null);
export function useBrowserScope() { return useContext(AccountScope); }
type State = "checking" | "ready" | "offline" | "expired" | "changed" | "signed-out";

export function BrowserAccountBoundary({ scope, children }: { scope: string; children: ReactNode }) {
  const [state, setState] = useState<State>("checking");
  const [discarded, setDiscarded] = useState(false);
  const checkRef = useRef<() => void>(() => undefined);
  const content = useRef<HTMLDivElement>(null);
  const gate = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    let sequence = 0, controller: AbortController | null = null, gone = false;
    let focus: HTMLElement | null = null, scroll = 0;
    let signedOut = false;
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
      try { if (showDialog && !document.hidden && gate.current && !gate.current.open) gate.current.showModal(); } catch { /* Inactive document. */ }
    };
    const check = async (mask = true) => {
      if (gone) return;
      const id = ++sequence, marker = browserChangeMarker();
      controller?.abort(); controller = new AbortController();
      const active = controller;
      const timeout = window.setTimeout(() => active.abort(), 10_000);
      if (mask) { hide(); setState("checking"); }
      try {
        const response = await fetch("/api/auth/browser-context", { cache: "no-store", credentials: "same-origin", signal: active.signal });
        if (!response.ok) throw new Error("Unavailable");
        const result: unknown = await response.json();
        if (!result || typeof result !== "object" || !("scope" in result) || (result.scope !== null && typeof result.scope !== "string")) throw new Error("Invalid response");
        if (id !== sequence || gone) return;
        if (marker !== browserChangeMarker()) { void check(); return; }
        void clearForeignNotifications(result.scope);
        if (result.scope === scope) {
          signedOut = false;
          clearPrivateBrowserState(scope);
          if (document.hidden) { hide(); setState("checking"); return; }
          setState("ready");
          delete document.documentElement.dataset.browserLocked;
          if (content.current) { content.current.style.visibility = "visible"; content.current.inert = false; }
          gate.current?.close();
          if (focus?.isConnected && document.hasFocus()) { focus.focus({ preventScroll: true }); window.scrollTo({ top: scroll, behavior: "instant" }); focus = null; }
        } else if (result.scope === null && !signedOut) {
          hide(); setState("expired");
        } else {
          hide(); clearPrivateBrowserState(); gone = true; setDiscarded(true);
          setState(result.scope === null ? "signed-out" : "changed");
        }
      } catch {
        if (id === sequence && !gone) { hide(); setState("offline"); }
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
    const onPageHide = () => { controller?.abort(); sequence++; hide(false); };
    const onFocus = () => { if (gone) hide(); else void check(); };
    const onVisible = () => { if (document.hidden) onPageHide(); else onFocus(); };
    const onPageShow = (event: PageTransitionEvent) => { if (event.persisted) onFocus(); };
    const onOffline = () => { if (!gone) { controller?.abort(); sequence++; hide(); setState("offline"); } };
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
    signalBrowserChange(); void check();
    return () => {
      delete document.documentElement.dataset.browserLocked;
      gone = true; sequence++; controller?.abort(); channel?.close(); window.clearInterval(timer);
      window.removeEventListener("storage", onStorage); window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onFocus); window.removeEventListener("offline", onOffline);
      window.removeEventListener("pageshow", onPageShow); window.removeEventListener("pagehide", onPageHide);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [scope]);

  return <AccountScope.Provider value={scope}>
    <div ref={content} data-browser-scope={scope} inert={state !== "ready"} style={{ visibility: state === "ready" ? "visible" : "hidden" }}>
      {!discarded && children}
    </div>
    <dialog ref={gate} className="browser-account-gate" aria-labelledby="browser-account-title" onCancel={event => event.preventDefault()} onKeyDown={event => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); }
    }}><div className="auth-card">
      <h1 id="browser-account-title">{state === "checking" ? "Checking your account…" : state === "changed" ? "Your account changed" : state === "signed-out" ? "You’re signed out" : state === "expired" ? "Sign in to continue" : "Reconnect to continue"}</h1>
      <p role="status">{state === "checking" ? "Your workspace will be ready in a moment." : state === "changed" || state === "signed-out" ? "This tab’s previous account has been cleared." : state === "expired" ? "Sign in to the same account in another tab, then return here to keep your draft." : "We couldn’t confirm your account. Reconnect, then try again. Your unsaved work stays in this tab."}</p>
      {(state === "changed" || state === "signed-out") ? <a className="button primary" href={state === "changed" ? "/jumps" : "/login"}>{state === "changed" ? "Open current account" : "Sign in"}</a> : state !== "checking" && <div className="page-actions">
        {state === "expired" && <a className="button primary" href="/login" target="_blank" rel="noopener noreferrer">Sign in in another tab</a>}
        <button className="button" type="button" onClick={() => checkRef.current()}>Check again</button>
      </div>}
      <noscript>Enable JavaScript to confirm your account and open your workspace.</noscript>
    </div></dialog>
  </AccountScope.Provider>;
}
