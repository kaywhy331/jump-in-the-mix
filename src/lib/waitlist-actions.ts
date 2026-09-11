"use server";

import { redirect } from "next/navigation";
import { env } from "@/lib/env";
import { hashAuthToken } from "@/lib/auth-tokens";
import { consumeRateLimit } from "@/lib/rate-limit";
import { getRequestMetadata } from "@/lib/request-context";
import { AdmissionError } from "@/lib/admission";
import { confirmWaitlistEntry, normalizeWaitlistEmail, requestWaitlistEntry } from "@/lib/waitlist";
import { escapeHtml, sendTransactionalEmail, transactionalEmailConfigured } from "@/lib/transactional-email";
import { marketingScenarioId } from "@/lib/marketing-scenarios";
import { WAITLIST_EMAIL_REQUESTS_PER_DAY } from "@/lib/waitlist-limits";

function fail(message: string): never {
  redirect(`/waitlist?error=${encodeURIComponent(message)}`);
}

class WaitlistSubmissionError extends Error {}
export type WaitlistFormState = { status: "idle" | "error" | "submitted"; message?: string; email?: string };

async function processWaitlistSubmission(formData: FormData): Promise<{ email: string }> {
  if (env.pilotMode) throw new WaitlistSubmissionError("This private installation does not have a public waitlist.");
  const email = normalizeWaitlistEmail(String(formData.get("email") ?? ""));
  const scenario = marketingScenarioId(formData.get("scenario"));
  if (!email) throw new WaitlistSubmissionError("Enter a complete email address.");
  const { ipAddress } = await getRequestMetadata();
  const ipLimit = await consumeRateLimit({ scope: "waitlist.ip", identifiers: [ipAddress], limit: 10, windowMs: 60 * 60_000 });
  if (!ipLimit.allowed) throw new WaitlistSubmissionError("Too many requests. Please try again in an hour.");
  const emailLimit = await consumeRateLimit({ scope: "waitlist.email", identifiers: [email], limit: WAITLIST_EMAIL_REQUESTS_PER_DAY, windowMs: 24 * 60 * 60_000 });
  // Same receipt for duplicates, rate-limited emails, existing accounts, and grants.
  if (!emailLimit.allowed) return { email };
  if (!transactionalEmailConfigured()) throw new WaitlistSubmissionError("The waitlist is temporarily unavailable. Please try again later.");
  try {
    const token = scenario ? await requestWaitlistEntry(email, scenario) : await requestWaitlistEntry(email);
    if (token) {
      const url = new URL("/waitlist/confirm", env.appUrl);
      url.searchParams.set("token", token);
      const leaveUrl = new URL("/waitlist/leave", env.appUrl).href;
      const result = await sendTransactionalEmail({
        category: "ACCESS_CONFIRMATION", to: email, subject: "Confirm your Jump in the Mix waitlist request",
        text: `Confirm your email to join the free-account waitlist: ${url.href}\n\nThis confirmation link expires in 24 hours. Once you’ve confirmed, we’ll email you as soon as your spot is ready. If you didn’t request this, ignore this email.\n\nLeave the waitlist or stop invitations: ${leaveUrl}`,
        html: `<p><a href="${escapeHtml(url.href)}">Confirm your email to join the waitlist</a></p><p>This link expires in 24 hours. Once you’ve confirmed, we’ll email you as soon as your spot is ready.</p><p>If you didn’t request this, ignore this email.</p><p><a href="${escapeHtml(leaveUrl)}">Leave the waitlist or stop invitations</a></p>`,
        idempotencyKey: `waitlist-confirm-${hashAuthToken(token)}`
      });
      if (!result.delivered) throw new Error("Email unavailable.");
    }
  } catch (error) {
    if (error instanceof AdmissionError) throw new WaitlistSubmissionError(error.message);
    throw new WaitlistSubmissionError("We couldn’t submit that. Your email is still here—please try again.");
  }
  return { email };
}

export async function joinWaitlistAction(formData: FormData): Promise<void> {
  try { await processWaitlistSubmission(formData); }
  catch (error) { fail(error instanceof WaitlistSubmissionError ? error.message : "We couldn’t complete your request. Please try again later."); }
  redirect("/waitlist?submitted=1");
}

export async function joinWaitlistFormAction(_previous: WaitlistFormState, formData: FormData): Promise<WaitlistFormState> {
  const entered = String(formData.get("email") ?? "").trim();
  try {
    const { email } = await processWaitlistSubmission(formData);
    return { status: "submitted", email, message: "If that address needs confirmation, we’ve sent a link — check your inbox. If you’re already confirmed or invited, your place is unchanged." };
  } catch (error) {
    return { status: "error", email: entered, message: error instanceof WaitlistSubmissionError ? error.message : "We couldn’t submit that. Your email is still here—please try again." };
  }
}

export async function confirmWaitlistAction(formData: FormData): Promise<void> {
  const { ipAddress } = await getRequestMetadata();
  const limit = await consumeRateLimit({ scope: "waitlist.confirm", identifiers: [ipAddress], limit: 30, windowMs: 60 * 60_000 });
  if (!limit.allowed) fail("Too many attempts. Please try again in an hour.");
  const confirmed = await confirmWaitlistEntry(String(formData.get("token") ?? ""));
  if (!confirmed) fail("This confirmation link expired or was already used. Submit your email again if you still need to confirm it.");
  redirect("/waitlist?confirmed=1");
}
