"use client";

import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { ACCOUNT_SHIELD_CLASS, useAccountConfirmation } from "@/components/BrowserAccountBoundary";
import { BEFORE_FORM_NAVIGATION } from "@/lib/form-navigation";
import { isOwnBack } from "@/lib/back-navigation";

// A save whose account its guard has just confirmed, sent again. No guard holds it or asks about it a second time.
const confirmedSaves = new WeakSet<HTMLFormElement>();
// What a held save says when, with the account confirmed, it still can't be sent as it was pressed.
const NOT_SENT = "Not saved yet. Your entries are still here; save again.";
// A submit button's own way of sending. Once that button has left the page, the browser can't send the save that way.
const OWN_SENDING = ["formaction", "formenctype", "formmethod", "formnovalidate", "formtarget"];

/**
 * A save as it was pressed: its button, its entries, and the form's hidden values, which the page sets for itself and
 * can lose to a re-render while the account is checked (the Mix editor's review confirmation does).
 */
type PressedSave = { submitter: HTMLElement | null; entries: [string, FormDataEntryValue][]; hidden: Map<HTMLInputElement, string> };
function pressedSave(form: HTMLFormElement, submitter: HTMLElement | null): PressedSave {
  const hidden = new Map<HTMLInputElement, string>();
  for (const control of form.elements) if (control instanceof HTMLInputElement && control.type === "hidden") hidden.set(control, control.value);
  let entries: [string, FormDataEntryValue][];
  try { entries = [...new FormData(form, submitter)]; } catch { entries = [...new FormData(form)]; }
  return { submitter, entries, hidden };
}

/**
 * Send a held save exactly as it was pressed (JITM-UXS-16-R1): from its own button while that is still the form's, and
 * otherwise from the form, always with the entries it was pressed with, its button's name and value included. The page's
 * own submit handlers see the hidden values as they were. False when it can't be sent that way: its button had its own
 * way of sending and has left the page, or the browser refused.
 */
function sendPressed(form: HTMLFormElement, save: PressedSave): boolean {
  const { submitter } = save;
  const present = !submitter || (submitter.isConnected && (submitter as HTMLButtonElement | HTMLInputElement).form === form);
  if (!present && OWN_SENDING.some(name => submitter.hasAttribute(name))) return false;
  const restored: [HTMLInputElement, string, string][] = [];
  for (const [field, value] of save.hidden) if (field.form === form && field.value !== value) { restored.push([field, value, field.value]); field.value = value; }
  const replay = (event: FormDataEvent) => {
    for (const name of new Set(event.formData.keys())) event.formData.delete(name);
    for (const [name, value] of save.entries) event.formData.append(name, value);
  };
  form.addEventListener("formdata", replay);
  confirmedSaves.add(form);
  try { form.requestSubmit(present ? submitter : null); return true; }
  catch { return false; }
  finally {
    confirmedSaves.delete(form); form.removeEventListener("formdata", replay);
    // The sent save has read the pressed values; the page's own come back unless its handler has set another meanwhile.
    for (const [field, pressed, current] of restored) if (field.value === pressed) field.value = current;
  }
}

/** Keep private drafts in memory and warn before leaving; never persist form contents. */
export function FormGuard({ forceDirty, guardOtherForms = false, preservedQuery, nativeSubmit = false }: { forceDirty?: boolean; guardOtherForms?: boolean; preservedQuery?: Record<string, string>; nativeSubmit?: boolean }) {
  const forced = useRef(forceDirty); forced.current = forceDirty;
  const preserved = useRef(preservedQuery); preserved.current = preservedQuery;
  const marker = useRef<HTMLSpanElement>(null);
  const dirty = useRef(false);
  const [changed, setChanged] = useState(false);
  const { pending } = useFormStatus();
  const submitting = useRef(pending);
  submitting.current = pending;
  const confirmAccount = useAccountConfirmation();
  const confirmRef = useRef(confirmAccount); confirmRef.current = confirmAccount;
  const [confirming, setConfirming] = useState(false);
  const [notSent, setNotSent] = useState(false);
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
    // The sign-in shield has already said what happens to unsaved work, so following its own link doesn't ask again.
    let leaving = false;
    const unload = (event: BeforeUnloadEvent) => { if ((forced.current ?? dirty.current) && !submitting.current && !leaving) { event.preventDefault(); event.returnValue = ""; } };
    const restored = (event: PageTransitionEvent) => { if (event.persisted) leaving = false; };
    const click = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(anchor instanceof HTMLAnchorElement) || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      if (anchor.closest(`.${ACCOUNT_SHIELD_CLASS}`)) { leaving = true; return; }
      const destination = new URL(anchor.href, location.href);
      if (destination.pathname === location.pathname && destination.search === location.search && destination.hash) return;
      if (keepsDraft(anchor.href)) return;
      if (!allow()) { event.preventDefault(); event.stopImmediatePropagation(); }
    };
    const otherSubmit = (event: SubmitEvent) => {
      if (!guardOtherForms || event.defaultPrevented || event.target === form || (event.target instanceof HTMLFormElement && confirmedSaves.has(event.target)) || !(forced.current ?? dirty.current) || submitting.current) return;
      if (!window.confirm("This action can reload the page. Continue without saving the other form’s changes?")) { event.preventDefault(); event.stopImmediatePropagation(); }
    };
    // The Navigation API also covers same-document Back/Forward where supported. The app's own back (a back control,
    // the edge swipe) has already asked, so it isn't asked twice.
    const navigate = (event: Event) => { const navigation = event as Event & { navigationType?: string; destination?: { key?: string } }; if (navigation.navigationType === "traverse" && event.cancelable && !isOwnBack(navigation.destination?.key) && !allow()) event.preventDefault(); };
    const navigation = (window as Window & { navigation?: EventTarget }).navigation;
    const associated = (event: Event) => { const target = event.target as HTMLInputElement | null; if (target?.form === form) update(); };
    // Native GET review forms have no React pending state; other guards run in capture first.
    const submit = (event: Event) => { if (nativeSubmit && !event.defaultPrevented) submitting.current = true; };
    // Right before a save is sent, the account boundary confirms the account with one check, shown as this form's saving
    // state. An expired session opens the sign-in shield instead, and every entry stays (JITM-08 §2.24). The held submit
    // never reaches the page's own handlers; once confirmed it is sent exactly as it was pressed, and a save that can't be
    // sent that way says so. A second press meanwhile is the same save.
    let holding = false;
    const save = (event: SubmitEvent) => {
      const confirm = confirmRef.current;
      if (nativeSubmit || !confirm || event.defaultPrevented || confirmedSaves.has(form)) return;
      event.preventDefault(); event.stopImmediatePropagation();
      if (holding) return;
      holding = true; setConfirming(true); setNotSent(false);
      const pressed = pressedSave(form, event.submitter);
      void confirm().then(confirmed => {
        holding = false; setConfirming(false);
        // A false answer has opened the shield, which says why.
        if (confirmed && form.isConnected && !sendPressed(form, pressed)) setNotSent(true);
      });
    };
    form.addEventListener("submit", save);
    form.addEventListener("submit", submit);
    document.addEventListener("input", associated); document.addEventListener("change", associated); form.addEventListener("reset", reset);
    const observer = new MutationObserver(update); observer.observe(form, { childList: true, subtree: true, attributes: true, attributeFilter: ["value", "checked"] });
    document.addEventListener("submit", otherSubmit, true);
    document.addEventListener("click", click, true); window.addEventListener("beforeunload", unload); navigation?.addEventListener("navigate", navigate);
    window.addEventListener(BEFORE_FORM_NAVIGATION, programmatic); window.addEventListener("pageshow", restored);
    return () => { holding = false; form.removeEventListener("submit", save); form.removeEventListener("submit", submit); window.removeEventListener("pageshow", restored); for (const type of actions) document.removeEventListener(type, act, true); observer.disconnect(); document.removeEventListener("submit", otherSubmit, true); document.removeEventListener("input", associated); document.removeEventListener("change", associated); form.removeEventListener("reset", reset); document.removeEventListener("click", click, true); window.removeEventListener("beforeunload", unload); navigation?.removeEventListener("navigate", navigate); window.removeEventListener(BEFORE_FORM_NAVIGATION, programmatic); };
  }, [guardOtherForms, nativeSubmit]);
  return <span ref={marker} className="form-guard-status muted-copy" role="status">{pending || confirming ? "Saving…" : notSent ? NOT_SENT : (forceDirty ?? changed) ? "Unsaved changes. Save before leaving this page." : ""}</span>;
}
