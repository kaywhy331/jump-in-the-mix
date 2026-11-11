import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FieldError, FieldErrorScope } from "@/components/FieldError";

const scope = (errors: Record<string, string>) => ({ errorId: (name: string) => `form-${name}-error`, message: (name: string) => errors[name], register: () => () => undefined });

describe("FieldError", () => {
  it("renders nothing while its field has no message", () => {
    expect(renderToStaticMarkup(<FieldErrorScope value={scope({})}><FieldError name="email" /></FieldErrorScope>)).toBe("");
    expect(renderToStaticMarkup(<FieldError id="email-error" message={null} />)).toBe("");
  });

  it("shows its field's message beside the field, with the id the field's aria-describedby points to", () => {
    const html = renderToStaticMarkup(<FieldErrorScope value={scope({ email: "Enter your email address." })}><FieldError name="email" /></FieldErrorScope>);
    expect(html).toMatch(/^<span id="form-email-error" class="inline-field-error">/);
    expect(html).toContain("Enter your email address.");
    // An icon as well as the colour; it is hidden from assistive technology, which reads the words.
    expect(html).toMatch(/<svg data-icon="alert"[^>]*aria-hidden="true"/);
  });

  it("is a phrasing element, so it may sit in any field wrapper", () => {
    const html = renderToStaticMarkup(<FieldError id="title-error" message="Give this event a title." />);
    expect(html).toMatch(/^<span /);
    expect(html).not.toMatch(/role="alert"/);
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
});
