/**
 * Inline field errors (JITM-08 §2.37): the form checks its own rules when it is sent and says, beside each
 * field, how to fix it. The rules are the fields' own constraint attributes (required, type, minLength…), so
 * the browser's checks and these messages never disagree. The server still checks everything again.
 */

/** Wording for each way a field can fail its constraint attributes. Missing entries use the defaults below. */
export type FieldMessages = Partial<Record<"valueMissing" | "typeMismatch" | "tooShort" | "tooLong" | "patternMismatch" | "badInput" | "rangeUnderflow" | "rangeOverflow" | "stepMismatch", string>>;

/** The parts of a form control the check reads; an input, select or textarea fits. */
export type CheckedControl = {
  validity: Pick<ValidityState, "valid" | "customError" | "valueMissing" | "typeMismatch" | "tooShort" | "tooLong" | "patternMismatch" | "badInput" | "rangeUnderflow" | "rangeOverflow" | "stepMismatch">;
  validationMessage: string;
  type: string;
  minLength?: number;
  maxLength?: number;
};

export const EMAIL_TYPE_MESSAGE = "Check this email address. It needs an @ and a domain, like name@example.com.";
export const EMAIL_FIELD_MESSAGES: FieldMessages = { valueMissing: "Enter your email address.", typeMismatch: EMAIL_TYPE_MESSAGE };

/** The Add contact rule, shared with the server so both say the same thing (contact-actions.ts). */
export const CONTACT_IDENTITY_MESSAGE = "Add a name, company, email, or phone number.";

/** The message for a control that fails its constraints, or null when it passes. */
export function fieldMessage(control: CheckedControl, messages: FieldMessages = {}): string | null {
  const { validity } = control;
  if (validity.valid) return null;
  // A page sets its own wording with setCustomValidity (Calendar's contact search does); show it as written.
  if (validity.customError) return control.validationMessage;
  if (validity.valueMissing) return messages.valueMissing ?? (control.type === "radio" ? "Choose one of these options." : control.type === "checkbox" ? "Check this box to continue." : "Fill in this field.");
  if (validity.typeMismatch) return messages.typeMismatch ?? (control.type === "email" ? EMAIL_TYPE_MESSAGE : control.type === "url" ? "Enter a full web address that starts with https://." : "Check this entry.");
  if (validity.tooShort) return messages.tooShort ?? `Use at least ${control.minLength} characters.`;
  if (validity.tooLong) return messages.tooLong ?? `Use ${control.maxLength} characters or fewer.`;
  if (validity.badInput) return messages.badInput ?? "Finish this entry, or clear it.";
  if (validity.patternMismatch) return messages.patternMismatch ?? "Check this entry.";
  if (validity.rangeUnderflow) return messages.rangeUnderflow ?? "Choose a later value.";
  if (validity.rangeOverflow) return messages.rangeOverflow ?? "Choose an earlier value.";
  if (validity.stepMismatch) return messages.stepMismatch ?? "Choose one of the allowed values.";
  return "Check this entry.";
}

/** A space-separated id list (aria-describedby) with `add` included and `remove` left out, in their first order. */
export function idTokens(current: string | null | undefined, { add, remove }: { add?: string; remove?: string }): string {
  const tokens = (current ?? "").split(/\s+/).filter(token => token && token !== remove);
  if (add && !tokens.includes(add)) tokens.push(add);
  return tokens.join(" ");
}

/** The server's Add contact rule (contact-actions.ts): at least a name, company, email or phone. */
export function hasContactIdentity(data: Pick<FormData, "get" | "getAll">): boolean {
  const filled = (value: FormDataEntryValue | null) => typeof value === "string" && value.trim() !== "";
  return ["firstName", "lastName", "company"].some(name => filled(data.get(name))) || ["emailValue", "phoneValue"].some(name => data.getAll(name).some(filled));
}

/**
 * The messages a form shows after a submit, and which refused submit showed them. Each refused submit is a new
 * round, and <FieldError> shows its message as a new role="alert" node for each round, so every message is announced
 * once for that submit, even one that reads as before, whether focus moved or stayed in the field (JITM-10 §2.15).
 * An edit never starts a round or rewords a message; it only takes away the messages of fields that are now fixed,
 * so nothing is announced while someone types.
 */
export type FieldErrorState = { errors: Record<string, string>; round: number };

export const NO_FIELD_ERRORS: FieldErrorState = { errors: {}, round: 0 };

/** After a submit: the messages it found, in a new round when there are any. */
export function afterSubmit(state: FieldErrorState, found: Record<string, string>): FieldErrorState {
  return { errors: found, round: Object.keys(found).length ? state.round + 1 : state.round };
}

/**
 * After an edit: the messages of fields that still fail stay word for word, in the same round; the others go. The
 * same state comes back when none went. `failing` is read only while a message is showing.
 */
export function afterEdit(state: FieldErrorState, failing: () => Record<string, string>): FieldErrorState {
  const names = Object.keys(state.errors);
  if (!names.length) return state;
  const fresh = failing();
  const kept = names.filter(name => fresh[name]);
  return kept.length === names.length ? state : { ...state, errors: Object.fromEntries(kept.map(name => [name, state.errors[name]])) };
}
