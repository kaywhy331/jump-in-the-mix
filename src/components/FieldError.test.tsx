import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FieldError, FieldErrorScope } from "@/components/FieldError";
import { NO_FIELD_ERRORS, afterEdit, afterSubmit, type FieldErrorState } from "@/lib/field-validation";

const scope = (errors: Record<string, string>, round = 1) => ({ errorId: (name: string) => `form-${name}-error`, message: (name: string) => errors[name], register: () => () => undefined, round });

describe("FieldError", () => {
  it("renders nothing while its field has no message", () => {
    expect(renderToStaticMarkup(<FieldErrorScope value={scope({})}><FieldError name="email" /></FieldErrorScope>)).toBe("");
    expect(renderToStaticMarkup(<FieldError id="email-error" message={null} />)).toBe("");
  });

  it("shows its field's message beside the field, with the id the field's aria-describedby points to", () => {
    const html = renderToStaticMarkup(<FieldErrorScope value={scope({ email: "Enter your email address." })}><FieldError name="email" /></FieldErrorScope>);
    expect(html).toMatch(/^<span id="form-email-error" class="inline-field-error" role="alert">/);
    expect(html).toContain("Enter your email address.");
    // An icon as well as the colour; it is hidden from assistive technology, which reads the words.
    expect(html).toMatch(/<svg data-icon="alert"[^>]*aria-hidden="true"/);
  });

  it("is a phrasing element, so it may sit in any field wrapper", () => {
    const html = renderToStaticMarkup(<FieldError id="title-error" message="Give this event a title." />);
    expect(html).toMatch(/^<span /);
    expect(html).toMatch(/^<span [^>]*role="alert"/);
  });

  it("accepts a server reply for one field and keeps the given id", () => {
    const html = renderToStaticMarkup(<FieldError id="contact-email-error" message="Check this email address. It needs an @ and a domain, like name@example.com." />);
    expect(html).toContain('id="contact-email-error"');
    expect(html).toContain("It needs an @ and a domain");
  });

  it("prefers the check made before sending over an older server reply for the same field", () => {
    const html = renderToStaticMarkup(<FieldErrorScope value={scope({ email: "Enter your email address." })}><FieldError name="email" message="That email already belongs to someone." /></FieldErrorScope>);
    expect(html).toContain("Enter your email address.");
    expect(html).not.toContain("already belongs");
  });

  it("is announced: the words are inside the role=\"alert\" element, for a check before sending and for a server reply", () => {
    for (const html of [
      renderToStaticMarkup(<FieldErrorScope value={scope({ email: "Enter your email address." })}><FieldError name="email" /></FieldErrorScope>),
      renderToStaticMarkup(<FieldError id="contact-email-error" message="That email already belongs to someone." />),
    ]) {
      const alert = /^<span [^>]*role="alert"[^>]*>(.*)<\/span>$/.exec(html);
      expect(alert).not.toBeNull();
      expect(alert![1]).toMatch(/Enter your email address\.|That email already belongs to someone\./);
    }
    // No other element in it is an alert or a live region, so it is announced once, not once per wrapper.
    expect(renderToStaticMarkup(<FieldError id="title-error" message="Give this event a title." />).match(/role="alert"|aria-live/g)).toHaveLength(1);
  });

  // A role="alert" node is announced when it is added or its words change. <FieldError> renders its message as a new
  // node for each round (its key), so an announcement is a step where a message shows with a new round or new words.
  const shown = (state: FieldErrorState) => renderToStaticMarkup(<FieldErrorScope value={scope(state.errors, state.round)}><FieldError name="email" /></FieldErrorScope>);
  const announced = (before: FieldErrorState, after: FieldErrorState) => shown(after) !== "" && (after.round !== before.round || shown(after) !== shown(before));

  it("is announced exactly once for each refused submit, even with the same words, and never while typing", () => {
    const missing = { email: "Enter your email address." }, malformed = { email: "Check this email address." };
    const steps: [string, (state: FieldErrorState) => FieldErrorState][] = [
      ["submit, empty", state => afterSubmit(state, missing)],
      ["type a letter, still failing for another reason", state => afterEdit(state, () => malformed)],
      ["type another letter", state => afterEdit(state, () => malformed)],
      ["submit again, malformed", state => afterSubmit(state, malformed)],
      ["submit again, same words", state => afterSubmit(state, malformed)],
      ["type, still malformed", state => afterEdit(state, () => malformed)],
      ["type until it passes", state => afterEdit(state, () => ({}))],
      ["submit, valid", state => afterSubmit(state, {})],
    ];
    const log: string[] = [];
    let state = NO_FIELD_ERRORS;
    for (const [label, step] of steps) {
      const next = step(state);
      if (announced(state, next)) log.push(label);
      state = next;
    }
    expect(log).toEqual(["submit, empty", "submit again, malformed", "submit again, same words"]);
    // Typing never rewords the message: it keeps what the submit said until the next submit.
    expect(shown(afterEdit(afterSubmit(NO_FIELD_ERRORS, missing), () => malformed))).toContain("Enter your email address.");
  });
});
