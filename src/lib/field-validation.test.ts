import { describe, expect, it } from "vitest";
import { CONTACT_IDENTITY_MESSAGE, EMAIL_FIELD_MESSAGES, EMAIL_TYPE_MESSAGE, NO_FIELD_ERRORS, afterEdit, afterSubmit, fieldMessage, hasContactIdentity, idTokens, type CheckedControl } from "@/lib/field-validation";

const VALID = { valid: true, customError: false, valueMissing: false, typeMismatch: false, tooShort: false, tooLong: false, patternMismatch: false, badInput: false, rangeUnderflow: false, rangeOverflow: false, stepMismatch: false };
const control = (failure: Partial<typeof VALID>, extra: Partial<CheckedControl> = {}): CheckedControl =>
  ({ validity: { ...VALID, valid: false, ...failure }, validationMessage: "", type: "text", ...extra });

describe("fieldMessage", () => {
  it("returns nothing for a field that passes", () => {
    expect(fieldMessage({ validity: VALID, validationMessage: "", type: "email" }, EMAIL_FIELD_MESSAGES)).toBeNull();
  });

  it("uses the form's own wording for each failed check", () => {
    expect(fieldMessage(control({ valueMissing: true }, { type: "email" }), EMAIL_FIELD_MESSAGES)).toBe("Enter your email address.");
    expect(fieldMessage(control({ typeMismatch: true }, { type: "email" }), EMAIL_FIELD_MESSAGES)).toBe(EMAIL_TYPE_MESSAGE);
    expect(fieldMessage(control({ tooShort: true }, { type: "password", minLength: 12 }), { tooShort: "Use a password with at least 12 characters." })).toBe("Use a password with at least 12 characters.");
  });

  it("says how to fix it when the form gives no wording", () => {
    expect(fieldMessage(control({ valueMissing: true }))).toBe("Fill in this field.");
    expect(fieldMessage(control({ valueMissing: true }, { type: "radio" }))).toBe("Choose one of these options.");
    expect(fieldMessage(control({ typeMismatch: true }, { type: "email" }))).toBe(EMAIL_TYPE_MESSAGE);
    expect(fieldMessage(control({ typeMismatch: true }, { type: "url" }))).toBe("Enter a full web address that starts with https://.");
    expect(fieldMessage(control({ tooShort: true }, { minLength: 12 }))).toBe("Use at least 12 characters.");
    expect(fieldMessage(control({ tooLong: true }, { maxLength: 160 }))).toBe("Use 160 characters or fewer.");
    expect(fieldMessage(control({ badInput: true }, { type: "datetime-local" }))).toBe("Finish this entry, or clear it.");
  });

  it("shows a page's own setCustomValidity wording as written, before any other check", () => {
    const search = control({ customError: true, valueMissing: true }, { validationMessage: "Choose a saved contact, create a new contact, or clear the search." });
    expect(fieldMessage(search, { valueMissing: "Not this" })).toBe("Choose a saved contact, create a new contact, or clear the search.");
  });

  it("checks a missing value before its format", () => {
    expect(fieldMessage(control({ valueMissing: true, typeMismatch: true }, { type: "email" }), EMAIL_FIELD_MESSAGES)).toBe("Enter your email address.");
  });
});

describe("idTokens", () => {
  it("adds an id once, keeping the ids already there and their order", () => {
    expect(idTokens("help contact-save-error", { add: "f-email-error" })).toBe("help contact-save-error f-email-error");
    expect(idTokens("help f-email-error", { add: "f-email-error" })).toBe("help f-email-error");
    expect(idTokens(null, { add: "f-email-error" })).toBe("f-email-error");
  });

  it("removes only the given id", () => {
    expect(idTokens("help  f-email-error contact-save-error", { remove: "f-email-error" })).toBe("help contact-save-error");
    expect(idTokens("f-email-error", { remove: "f-email-error" })).toBe("");
    expect(idTokens(undefined, { remove: "f-email-error" })).toBe("");
  });
});

describe("hasContactIdentity", () => {
  const form = (entries: Array<[string, string]>) => { const data = new FormData(); for (const [name, value] of entries) data.append(name, value); return data; };

  it("matches the server's rule: a name, company, email or phone", () => {
    expect(hasContactIdentity(form([["firstName", "Avery"]]))).toBe(true);
    expect(hasContactIdentity(form([["lastName", "Fixture"]]))).toBe(true);
    expect(hasContactIdentity(form([["company", "Fictional Plumbing"]]))).toBe(true);
    expect(hasContactIdentity(form([["emailValue", ""], ["emailValue", "avery@example.test"]]))).toBe(true);
    expect(hasContactIdentity(form([["phoneValue", "(555) 555-0123"]]))).toBe(true);
  });

  it("refuses an empty form, blank spaces and notes alone", () => {
    expect(hasContactIdentity(form([]))).toBe(false);
    expect(hasContactIdentity(form([["firstName", "  "], ["company", ""], ["emailValue", " "], ["phoneValue", ""], ["publicNotes", "Met at the expo"]]))).toBe(false);
  });

  it("uses the server's wording", () => {
    expect(CONTACT_IDENTITY_MESSAGE).toBe("Add a name, company, email, or phone number.");
  });
});

describe("afterSubmit and afterEdit", () => {
  it("starts a new round for each refused submit, even with the same messages, and none for a submit that passes", () => {
    const first = afterSubmit(NO_FIELD_ERRORS, { email: "Enter your email address." });
    expect(first).toEqual({ errors: { email: "Enter your email address." }, round: 1 });
    expect(afterSubmit(first, { email: "Enter your email address." })).toEqual({ errors: { email: "Enter your email address." }, round: 2 });
    expect(afterSubmit(first, {})).toEqual({ errors: {}, round: 1 });
  });

  it("keeps the messages of fields that still fail, word for word and in the same round, and drops the fixed ones", () => {
    const state = afterSubmit(NO_FIELD_ERRORS, { email: "Enter your email address.", name: "Add a name." });
    // Still failing, now for another reason: the same state comes back, so nothing renders or is announced.
    expect(afterEdit(state, () => ({ email: "Check this email address.", name: "Add a name." }))).toBe(state);
    expect(afterEdit(state, () => ({ email: "Check this email address." }))).toEqual({ errors: { email: "Enter your email address." }, round: 1 });
    expect(afterEdit(state, () => ({}))).toEqual({ errors: {}, round: 1 });
  });

  it("does not check the form while no message is showing", () => {
    let checked = 0;
    expect(afterEdit(NO_FIELD_ERRORS, () => { checked += 1; return {}; })).toBe(NO_FIELD_ERRORS);
    expect(checked).toBe(0);
  });
});
