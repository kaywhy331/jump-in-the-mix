"use client";

import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { BEFORE_FORM_NAVIGATION } from "@/lib/form-navigation";

/** Keep private drafts in memory and warn before leaving; never persist form contents. */
export function FormGuard({ forceDirty, guardOtherForms = false, preservedQuery }: { forceDirty?: boolean; guardOtherForms?: boolean; preservedQuery?: Record<string, string> }) {
  const forced = useRef(forceDirty); forced.current = forceDirty;
  const preserved = useRef(preservedQuery); preserved.current = preservedQuery;
  const marker = useRef<HTMLSpanElement>(null);
  const dirty = useRef(false);
  const [changed, setChanged] = useState(false);
  const { pending } = useFormStatus();
  const submitting = useRef(pending);
  submitting.current = pending;
  useEffect(() => {
    const form = marker.current?.closest("form");
    if (!form) return;
    // A field the page fills in to report its own state, such as whether a preview loaded, is marked data-form-guard-ignore.
    const snapshot = () => {
      const ignored = new Set([...form.querySelectorAll<HTMLInputElement>("[data-form-guard-ignore]")].map(field => field.name));
      return JSON.stringify([...new FormData(form)].filter(([name]) => !name.startsWith("$ACTION_") && name !== "activationConfirmed" && !ignored.has(name)));
    };
    // Changes count from the person's first action on the page. Until then the page is still filling the form in (a detected
    // timezone, today's date in that timezone), and each of those values becomes part of the starting point.
    let initial = snapshot(), acted = false;
    const act = (event: Event) => {
      if (acted || !(event.isTrusted || event.type === "input" || event.type === "change")) return;
      acted = true;
      // A press comes before the change it causes; a click, input or change event arrives after the form has changed.
      if (event.type === "pointerdown" || event.type === "keydown" || event.type === "beforeinput") initial = snapshot();
    };
    const actions = ["pointerdown", "keydown", "beforeinput", "click", "input", "change"];
    for (const type of actions) document.addEventListener(type, act, true);
    const update = () => { const current = snapshot(); if (!acted) initial = current; dirty.current = current !== initial; setChanged(dirty.current); };
    const reset = (event: Event) => { queueMicrotask(() => { if (!event.defaultPrevented) { initial = snapshot(); update(); } }); };
    const allow = () => !(forced.current ?? dirty.current) || submitting.current || window.confirm("Leave without saving your changes?");
    const keepsDraft = (href: string) => {
      const destination = new URL(href, location.href);
      return preserved.current && destination.origin === location.origin && destination.pathname === location.pathname && Object.entries(preserved.current).every(([key, value]) => (destination.searchParams.get(key) ?? "") === value);
    };
    const programmatic = (event: Event) => {
      const href = (event as CustomEvent<{ href: string }>).detail.href;
      if (!event.defaultPrevented && !keepsDraft(href) && !allow()) event.preventDefault();
    };
    const unload = (event: BeforeUnloadEvent) => { if ((forced.current ?? dirty.current) && !submitting.current) { event.preventDefault(); event.returnValue = ""; } };
    const click = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(anchor instanceof HTMLAnchorElement) || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const destination = new URL(anchor.href, location.href);
      if (destination.pathname === location.pathname && destination.search === location.search && destination.hash) return;
      if (keepsDraft(anchor.href)) return;
      if (!allow()) { event.preventDefault(); event.stopImmediatePropagation(); }
    };
    const otherSubmit = (event: SubmitEvent) => {
      if (!guardOtherForms || event.defaultPrevented || event.target === form || !(forced.current ?? dirty.current) || submitting.current) return;
      if (!window.confirm("This action can reload the page. Continue without saving the other form’s changes?")) { event.preventDefault(); event.stopImmediatePropagation(); }
    };
    // The Navigation API also covers same-document Back/Forward where supported.
    const navigate = (event: Event) => { const navigation = event as Event & { navigationType?: string }; if (navigation.navigationType === "traverse" && event.cancelable && !allow()) event.preventDefault(); };
    const navigation = (window as Window & { navigation?: EventTarget }).navigation;
    const associated = (event: Event) => { const target = event.target as HTMLInputElement | null; if (target?.form === form) update(); };
    document.addEventListener("input", associated); document.addEventListener("change", associated); form.addEventListener("reset", reset);
    const observer = new MutationObserver(update); observer.observe(form, { childList: true, subtree: true, attributes: true, attributeFilter: ["value", "checked"] });
    document.addEventListener("submit", otherSubmit, true);
    document.addEventListener("click", click, true); window.addEventListener("beforeunload", unload); navigation?.addEventListener("navigate", navigate);
    window.addEventListener(BEFORE_FORM_NAVIGATION, programmatic);
    return () => { for (const type of actions) document.removeEventListener(type, act, true); observer.disconnect(); document.removeEventListener("submit", otherSubmit, true); document.removeEventListener("input", associated); document.removeEventListener("change", associated); form.removeEventListener("reset", reset); document.removeEventListener("click", click, true); window.removeEventListener("beforeunload", unload); navigation?.removeEventListener("navigate", navigate); window.removeEventListener(BEFORE_FORM_NAVIGATION, programmatic); };
  }, [guardOtherForms]);
  return <span ref={marker} className="form-guard-status muted-copy" role="status">{pending ? "Saving…" : (forceDirty ?? changed) ? "Unsaved changes. Save before leaving this page." : ""}</span>;
}
