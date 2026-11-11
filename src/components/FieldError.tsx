"use client";

import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ComponentProps, type FormEvent, type ReactNode, type RefObject } from "react";
import { AppIcon } from "@/components/AppIcon";
import { NO_FIELD_ERRORS, afterEdit, afterSubmit, fieldMessage, idTokens, type FieldErrorState, type FieldMessages } from "@/lib/field-validation";

/*
 * The shared inline field error (JITM-08 §2.37). A form that uses `useFieldValidation` checks its fields when it is
 * sent instead of showing the browser's tooltips: each field with a <FieldError> slot gets its message beside it,
 * aria-invalid and an aria-describedby link to the message, and focus moves to the first field to fix. A field
 * without a slot keeps the browser's own message, so nothing is ever refused without saying why.
 *
 * Each message is announced once for each refused submit, whether focus moved to its field or stayed there (Enter in
 * a field), and never while someone types (JITM-10 §2.15). The message itself carries role="alert", rather than a
 * polite region the form fills: JITM-10 §2.15 names role="alert" for errors; the words announced are the same node
 * that is shown and that aria-describedby links, with no hidden copy to drift; a refused submit is an interruption
 * the owner has to act on; and a server reply shown through <FieldError> is announced the same way, with no wiring
 * in each form. A refused submit renders every message as a new node (keyed by its round, see FieldErrorState), so
 * one that reads as before is announced again; an edit only removes messages, which is not announced.
 */

type Slot = { count: number; messages?: FieldMessages };
type Scope = { errorId(name: string): string; message(name: string): string | undefined; register(name: string, messages?: FieldMessages): () => void; round: number };

const FieldErrorContext = createContext<Scope | null>(null);
/** Set by this file on a control it marked invalid, so it clears only its own marks (a server reply may set one too). */
const MARK = "data-field-error";

type Control = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
const controlsOf = (form: HTMLFormElement): Control[] => [...form.elements].filter((element): element is Control => element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement);
/** A field is named by its id, or by its name when it has none (a radio group). <FieldError name> uses the same key. */
const keyOf = (control: Control) => control.id || control.name;

/**
 * The message beside one field. Inside a form that uses `useFieldValidation`, `name` is the field's id (or the
 * radio group's name) and `messages` words its checks. On its own, give `id` and `message` to show a server
 * reply for one field, and point the field's aria-describedby at that id. Either way it is announced (role="alert")
 * when it appears or its words change and, inside a form that uses `useFieldValidation`, again after each refused submit.
 */
export function FieldError({ name, messages, id, message }: { name?: string; messages?: FieldMessages; id?: string; message?: string | null }) {
  const scope = useContext(FieldErrorContext);
  const fallbackId = useId();
  const register = scope?.register;
  // Keyed by the wording's content, so an inline messages object does not re-register on every render.
  const wording = JSON.stringify(messages ?? {});
  useLayoutEffect(() => name && register ? register(name, JSON.parse(wording) as FieldMessages) : undefined, [register, name, wording]);
  const text = (name && scope?.message(name)) || message;
  if (!text) return null;
  // A new node for each refused submit, so the alert is announced once for it even when the words are the same.
  return <span key={scope?.round} id={name && scope ? scope.errorId(name) : id ?? fallbackId} className="inline-field-error" role="alert"><AppIcon name="alert" />{text}</span>;
}

/** Puts a form's <FieldError> slots in its validation scope. */
export function FieldErrorScope({ value, children }: { value: Scope; children: ReactNode }) {
  return <FieldErrorContext.Provider value={value}>{children}</FieldErrorContext.Provider>;
}

/** A plain form, such as one whose server action redirects, that checks its <FieldError> fields before sending. */
export function CheckedForm({ children, ...props }: Omit<ComponentProps<"form">, "ref" | "onSubmit" | "noValidate">) {
  const form = useRef<HTMLFormElement>(null);
  const { validate, scope } = useFieldValidation(form);
  return <form ref={form} {...props} onSubmit={validate}><FieldErrorScope value={scope}>{children}</FieldErrorScope></form>;
}

/**
 * Validate on submit. Spread nothing on the fields: pass the form's ref, call `validate` from the form's onSubmit
 * (it returns false and stops the submission when a field needs fixing), and wrap the fields in
 * <FieldErrorScope value={scope}>. `check` adds rules the attributes cannot state, keyed like the slots.
 */
export function useFieldValidation(form: RefObject<HTMLFormElement | null>, { check }: { check?: (form: HTMLFormElement) => Record<string, string> } = {}) {
  const prefix = useId();
  const slots = useRef(new Map<string, Slot>());
  const checkRef = useRef(check);
  checkRef.current = check;
  // The messages shown and the refused submit that showed them; the round moves focus and renews the announcement.
  const [{ errors, round }, setState] = useState<FieldErrorState>(NO_FIELD_ERRORS);

  // The browser checks the fields itself until a slot exists, so forms without one, and pages before hydration, keep it.
  const settle = useCallback(() => { if (form.current) form.current.noValidate = slots.current.size > 0; }, [form]);
  const errorId = useCallback((name: string) => `${prefix}-${name}-error`, [prefix]);
  const register = useCallback((name: string, messages?: FieldMessages) => {
    const slot = slots.current.get(name);
    slots.current.set(name, { count: (slot?.count ?? 0) + 1, messages });
    settle();
    return () => {
      const current = slots.current.get(name);
      if (current && current.count > 1) current.count -= 1; else slots.current.delete(name);
      settle();
    };
  }, [settle]);

  const collect = useCallback((target: HTMLFormElement) => {
    const found: Record<string, string> = {};
    for (const control of controlsOf(target)) {
      const key = keyOf(control), slot = slots.current.get(key);
      if (!slot || found[key] || !control.willValidate) continue;
      const text = fieldMessage(control, slot.messages);
      if (text) found[key] = text;
    }
    for (const [key, text] of Object.entries(checkRef.current?.(target) ?? {})) if (slots.current.has(key) && !found[key]) found[key] = text;
    return found;
  }, []);

  const validate = useCallback((event: FormEvent<HTMLFormElement>): boolean => {
    const target = event.currentTarget;
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    if (!target.noValidate || submitter?.hasAttribute("formnovalidate")) return true;
    const found = collect(target);
    setState(current => afterSubmit(current, found));
    if (Object.keys(found).length) { event.preventDefault(); return false; }
    // A field without a slot keeps the browser's message.
    const unslotted = controlsOf(target).find(control => control.willValidate && !control.validity.valid);
    if (unslotted) { event.preventDefault(); unslotted.reportValidity(); return false; }
    return true;
  }, [collect]);

  // Keep each control's aria-invalid and aria-describedby in step with its message. React writes an attribute again
  // only when its own prop changes, so this runs after every render and keeps the server's links beside these.
  useLayoutEffect(() => {
    const target = form.current;
    if (!target) return;
    settle();
    for (const control of controlsOf(target)) {
      const key = keyOf(control);
      if (!key || control.type === "hidden") continue;
      const invalid = Boolean(errors[key]), current = control.getAttribute("aria-describedby");
      const describedBy = idTokens(current, invalid ? { add: errorId(key) } : { remove: errorId(key) });
      if (describedBy !== (current ?? "")) { if (describedBy) control.setAttribute("aria-describedby", describedBy); else control.removeAttribute("aria-describedby"); }
      if (invalid && control.getAttribute("aria-invalid") !== "true") { control.setAttribute("aria-invalid", "true"); control.setAttribute(MARK, ""); }
      if (!invalid && control.hasAttribute(MARK)) { control.removeAttribute(MARK); control.removeAttribute("aria-invalid"); }
    }
  });

  // After a refused submit, focus the first field to fix, opening any disclosure around it.
  useLayoutEffect(() => {
    const target = form.current;
    if (!round || !target) return;
    const first = controlsOf(target).find(control => errors[keyOf(control)]);
    if (!first) return;
    for (let details = first.closest("details"); details; details = details.parentElement?.closest("details") ?? null) details.open = true;
    // Show the field and the message just below it with the least movement, then centre them if a bar that stays on
    // screen (a header, the save bar, the phone navigation) still covers either. Instant, so the two moves never race.
    first.focus({ preventScroll: true });
    const message = document.getElementById(errorId(keyOf(first)));
    first.scrollIntoView({ block: "nearest", behavior: "instant" });
    message?.scrollIntoView({ block: "nearest", behavior: "instant" });
    const covered = (element: Element) => {
      const box = element.getBoundingClientRect();
      const hit = document.elementFromPoint(Math.min(box.left + Math.min(box.width / 2, 8), window.innerWidth - 1), Math.min(Math.max(box.top + box.height / 2, 0), window.innerHeight - 1));
      return box.top < 0 || box.bottom > window.innerHeight || !hit || (hit !== element && !element.contains(hit) && !hit.contains(element));
    };
    if (covered(first) || (message && covered(message))) (message ?? first).scrollIntoView({ block: "center", behavior: "instant" });
    // Only a refused submit moves focus (errors is read from that same render); fixing a field while typing must not.
  }, [round, form, errorId]);

  // Once a field is fixed its message goes; messages are not added while someone is still typing. The check waits a
  // task so a choice made by a click (a contact option, a duration) has updated the form and its custom rules first.
  useEffect(() => {
    const target = form.current;
    if (!target) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const recheck = () => { clearTimeout(timer); timer = setTimeout(() => setState(current => afterEdit(current, () => collect(target)))); };
    const events = ["input", "change", "click"] as const;
    for (const type of events) target.addEventListener(type, recheck);
    return () => { clearTimeout(timer); for (const type of events) target.removeEventListener(type, recheck); };
  }, [form, collect]);

  const scope = useMemo<Scope>(() => ({ errorId, message: name => errors[name], register, round }), [errorId, errors, register, round]);
  return { validate, scope };
}
