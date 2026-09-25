import { beforeEach, describe, expect, it, vi } from "vitest";

const secret = vi.hoisted(() => ({ value: "" }));
vi.mock("@/lib/env", () => ({ env: { get authRateLimitSecret() { return secret.value; } } }));
import { UNVERIFIED_ERROR_MESSAGE, verifiedErrorMessage, viewerErrorMessage, withSignedError, withViewerError } from "../src/lib/form-errors";

const params = (location: string) => Object.fromEntries(new URL(location, "https://jumpinthemix.com").searchParams);
const owner = { authUser: { id: "user-owner" } }, someoneElse = { authUser: { id: "user-other" } };
const NAMED = "That phone already belongs to Maria Lopez. Open her record to merge them.";
const at = new Date("2026-09-25T12:00:00Z");
const later = (seconds: number) => new Date(at.getTime() + seconds * 1000);

beforeEach(() => { secret.value = "viewer-error-signing-test-secret-00001"; });

describe("signed error messages on signed-in pages", () => {
  it("shows the message, names included, to the person whose action it describes", () => {
    const location = withViewerError("/contacts/c1?section=phones", NAMED, owner, at);
    expect(location).toMatch(/^\/contacts\/c1\?section=phones&error=.+&at=\d+&sig=[\w-]+$/);
    expect(viewerErrorMessage(params(location), owner, "Fixed.", later(5))).toBe(NAMED);
  });

  it("shows anyone else, or a link signed for someone else, only the page's fixed sentence", () => {
    const location = withViewerError("/contacts", "Call 555-0100 to restore your account.", someoneElse, at);
    expect(viewerErrorMessage(params(location), owner, "That change could not be saved.", later(5))).toBe("That change could not be saved.");
    expect(viewerErrorMessage(params(location), someoneElse, "That change could not be saved.", later(5))).toBe("Call 555-0100 to restore your account.");
  });

  it("stops showing the text an hour after it was issued, and refuses a time far ahead", () => {
    const location = withViewerError("/mixes", NAMED, owner, at);
    expect(viewerErrorMessage(params(location), owner, "Fixed.", later(3599))).toBe(NAMED);
    expect(viewerErrorMessage(params(location), owner, "Fixed.", later(3601))).toBe("Fixed.");
    expect(viewerErrorMessage(params(location), owner, "Fixed.", later(-301))).toBe("Fixed.");
  });

  it("refuses altered text, an altered time, a missing time and repeated keys", () => {
    const signed = params(withViewerError("/mixes", NAMED, owner, at));
    expect(viewerErrorMessage({ ...signed, error: NAMED + "!" }, owner, "Fixed.", later(5))).toBe("Fixed.");
    expect(viewerErrorMessage({ ...signed, at: String(Number(signed.at) + 1) }, owner, "Fixed.", later(5))).toBe("Fixed.");
    expect(viewerErrorMessage({ error: signed.error, sig: signed.sig }, owner, "Fixed.", later(5))).toBe("Fixed.");
    expect(viewerErrorMessage({ ...signed, error: [NAMED, NAMED] }, owner, "Fixed.", later(5))).toBe("Fixed.");
    expect(viewerErrorMessage({}, owner, "Fixed.", later(5))).toBeNull();
    expect(viewerErrorMessage({ error: "" }, owner, "Fixed.", later(5))).toBeNull();
  });

  it("keeps the public and signed-in signatures apart", () => {
    const publicLink = params(withSignedError("/login", NAMED));
    expect(viewerErrorMessage({ ...publicLink, at: String(Math.floor(at.getTime() / 1000)) }, owner, "Fixed.", later(5))).toBe("Fixed.");
    const viewerLink = params(withViewerError("/login", NAMED, owner, at));
    expect(verifiedErrorMessage(viewerLink)).toBe(UNVERIFIED_ERROR_MESSAGE);
  });

  it("falls back to the general sentence when the page names none", () => {
    expect(viewerErrorMessage({ error: "Unsigned", at: "1790000000", sig: "x" }, owner, undefined, later(5))).toBe(UNVERIFIED_ERROR_MESSAGE);
  });
});
