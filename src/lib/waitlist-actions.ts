"use server";

import { redirect } from "next/navigation";
import { env } from "@/lib/env";
import { hashAuthToken } from "@/lib/auth-tokens";
import { consumeRateLimit } from "@/lib/rate-limit";
import { getRequestMetadata } from "@/lib/request-context";
import { AdmissionError } from "@/lib/admission";
import { confirmWaitlistEntry, normalizeWaitlistEmail, requestWaitlistEntry } from "@/lib/waitlist";
import { escapeHtml, sendTransactionalEmail, transactionalEmailConfigured } from "@/lib/transactional-email";

function fail(message: string): never {
  redirect(`/waitlist?error=${encodeURIComponent(message)}`);
}

export async function joinWaitlistAction(formData: FormData): Promise<void> {
  if (env.pilotMode) fail("This private installation does not have a public waitlist.");
  const email = normalizeWaitlistEmail(String(formData.get("email") ?? ""));
  if (!email) fail("Enter a valid email address.");
  const { ipAddress } = await getRequestMetadata();
  const ipLimit = await consumeRateLimit({ scope: "waitlist.ip", identifiers: [ipAddress], limit: 10, windowMs: 60 * 60_000 });
  if (!ipLimit.allowed) fail("Too many requests. Please try again in an hour.");
  const emailLimit = await consumeRateLimit({ scope: "waitlist.email", identifiers: [email], limit: 3, windowMs: 24 * 60 * 60_000 });
  // Same receipt for duplicates, rate-limited emails, existing accounts, and grants.
  if (!emailLimit.allowed) redirect("/waitlist?submitted=1");
  if (!transactionalEmailConfigured()) fail("The waitlist is temporarily unavailable. Please try again later.");
  try {
    const token = await requestWaitlistEntry(email);
    if (token) {
      const url = new URL("/waitlist/confirm", env.appUrl);
      url.searchParams.set("token", token);
      const leaveUrl = new URL("/waitlist/leave", env.appUrl).href;
      const result = await sendTransactionalEmail({
        category: "ACCESS_CONFIRMATION", to: email, subject: "Confirm your Jump in the Mix waitlist request",
        text: `Confirm your email to join the free-account waitlist: ${url.href}\n\nThis confirmation link expires in 24 hours. We invite up to 10 people every 7 days: 5 in signup order and 5 selected at random. If you didn’t request this, ignore this email.\n\nLeave the waitlist or stop invitations: ${leaveUrl}`,
        html: `<p><a href="${escapeHtml(url.href)}">Confirm your email to join the waitlist</a></p><p>This link expires in 24 hours. We invite up to 10 people every 7 days: 5 in signup order and 5 selected at random.</p><p>If you didn’t request this, ignore this email.</p><p><a href="${escapeHtml(leaveUrl)}">Leave the waitlist or stop invitations</a></p>`,
        idempotencyKey: `waitlist-confirm-${hashAuthToken(token)}`
      });
      if (!result.delivered) throw new Error("Email unavailable.");
    }
  } catch (error) {
    if (error instanceof AdmissionError) fail(error.message);
    fail("We couldn’t complete your request. Please try again later.");
  }
  redirect("/waitlist?submitted=1");
}

export async function confirmWaitlistAction(formData: FormData): Promise<void> {
  const { ipAddress } = await getRequestMetadata();
  const limit = await consumeRateLimit({ scope: "waitlist.confirm", identifiers: [ipAddress], limit: 30, windowMs: 60 * 60_000 });
  if (!limit.allowed) fail("Too many attempts. Please try again in an hour.");
  const confirmed = await confirmWaitlistEntry(String(formData.get("token") ?? ""));
  if (!confirmed) fail("This confirmation link expired or was already used. Submit your email again if you still need to confirm it.");
  redirect("/waitlist?confirmed=1");
}
