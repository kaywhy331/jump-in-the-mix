/**
 * An error whose message is fixed wording written in this codebase for the person using it: safe to show on the
 * page that caused it, and to sign for that viewer (form-errors.ts). Never put text from a database, a provider or
 * the person's own input in one.
 */
export class UserFacingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserFacingError";
  }
}
