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
