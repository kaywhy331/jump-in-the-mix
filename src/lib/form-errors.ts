import { AsyncLocalStorage } from "node:async_hooks";
import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

export type FormResult = { error?: string };
const recoverable = new AsyncLocalStorage<boolean>();
class FormValidationError extends Error {}
/** Only the explicitly wrapped request returns validation; normal action redirects stay intact. */
export function captureFormFailure(message: string): void {
  if (recoverable.getStore()) throw new FormValidationError(message);
}
export async function recoverableFormAction(action: () => Promise<void>): Promise<FormResult> {
  return recoverable.run(true, async () => {
    try { await action(); return {}; }
    catch (error) { if (error instanceof FormValidationError) return { error: error.message }; throw error; }
  });
}

/*
 * Public pages (sign-in, registration, password reset, verification, waitlist, staff invitation) show a
 * ?error= message only when one of our own redirects signed it, so a crafted link cannot put an attacker's
 * sentence into the trusted error banner. A signature can be replayed by anyone who sees the URL, so sign
 * fixed server wording only, never text that carries what a visitor typed.
 */
const SIGNED_ERROR_MAX_LENGTH = 500;
export const UNVERIFIED_ERROR_MESSAGE = "Something went wrong. Please try again.";

function errorSignature(message: string): string {
  return createHmac("sha256", env.authRateLimitSecret).update(`jitm-public-error:v1:${message}`, "utf8").digest("base64url");
}

/** `path` plus `error=<message>&sig=<HMAC>`, for a redirect to one of the public pages. */
export function withSignedError(path: string, message: string): string {
  const text = message.slice(0, SIGNED_ERROR_MAX_LENGTH);
  return `${path}${path.includes("?") ? "&" : "?"}${new URLSearchParams({ error: text, sig: errorSignature(text) })}`;
}

/**
 * The banner text for a public page: the ?error= message when its signature verifies (compared in
 * constant time), the fixed `fallback` sentence for any other error text, and null when there is none.
 * Old links and bookmarks with an unsigned error therefore still render, just with the fixed sentence.
 */
export function verifiedErrorMessage(params: { error?: string | string[]; sig?: string | string[] }, fallback = UNVERIFIED_ERROR_MESSAGE): string | null {
  const { error, sig } = params;
  if (error === undefined || error === "") return null;
  if (typeof error !== "string" || typeof sig !== "string" || error.length > SIGNED_ERROR_MAX_LENGTH) return fallback;
  const expected = Buffer.from(errorSignature(error), "utf8");
  const received = Buffer.from(sig, "utf8");
  return received.length === expected.length && timingSafeEqual(received, expected) ? error : fallback;
}

/*
 * Signed-in pages carry the same ?error=&sig= pair, signed for the account that caused it: the HMAC covers
 * that account's id (the signed-in person, `session.authUser`, who is staff during a support view) and the
 * time it was issued (`at`). A page shows the text only to that account, within VIEWER_ERROR_MAX_AGE_SECONDS;
 * anyone else, and any link signed for someone else, sees the page's fixed sentence. Because a signature
 * works only for the person who caused it, these messages may name what that person typed or chose (a
 * contact's name, a Beat), unlike the public ones above. Separate namespace from the public signatures.
 */
const VIEWER_ERROR_MAX_AGE_SECONDS = 60 * 60;

/** Who a signed-in page's error is for: the signed-in person, from the session every guard returns. */
export type ErrorViewer = { authUser: { id: string } };

function viewerErrorSignature(viewerId: string, issuedAt: number, message: string): string {
  return createHmac("sha256", env.authRateLimitSecret).update(`jitm-viewer-error:v1:${viewerId}:${issuedAt}:${message}`, "utf8").digest("base64url");
}

/** `path` plus `error=<message>&at=<seconds>&sig=<HMAC>`, for a redirect to a signed-in page this viewer will open. */
export function withViewerError(path: string, message: string, viewer: ErrorViewer, now = new Date()): string {
  const text = message.slice(0, SIGNED_ERROR_MAX_LENGTH);
  const at = Math.floor(now.getTime() / 1000);
  return `${path}${path.includes("?") ? "&" : "?"}${new URLSearchParams({ error: text, at: String(at), sig: viewerErrorSignature(viewer.authUser.id, at, text) })}`;
}

/**
 * The banner text for a signed-in page: the ?error= message when it was signed for this viewer less than an
 * hour ago (compared in constant time), the page's fixed `fallback` sentence for any other error text, and
 * null when there is none.
 */
export function viewerErrorMessage(params: { error?: string | string[]; sig?: string | string[]; at?: string | string[] }, viewer: ErrorViewer, fallback = UNVERIFIED_ERROR_MESSAGE, now = new Date()): string | null {
  const { error, sig, at } = params;
  if (error === undefined || error === "") return null;
  if (typeof error !== "string" || typeof sig !== "string" || typeof at !== "string" || !/^\d{9,11}$/.test(at) || error.length > SIGNED_ERROR_MAX_LENGTH) return fallback;
  const issuedAt = Number(at), age = Math.floor(now.getTime() / 1000) - issuedAt;
  if (age < -300 || age > VIEWER_ERROR_MAX_AGE_SECONDS) return fallback;
  const expected = Buffer.from(viewerErrorSignature(viewer.authUser.id, issuedAt, error), "utf8");
  const received = Buffer.from(sig, "utf8");
  return received.length === expected.length && timingSafeEqual(received, expected) ? error : fallback;
}

/** The query keys a signed error travels in, for pages that forward one (the old /mixes/<id>/edit address). */
export const SIGNED_ERROR_PARAMS = ["error", "at", "sig"] as const;
