"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requestInvitationStopLink, stopInvitationEmails } from "@/lib/invitation-preferences";
import { normalizeWaitlistEmail } from "@/lib/waitlist";
import { consumeRateLimit } from "@/lib/rate-limit";
import { getRequestMetadata } from "@/lib/request-context";
import { escapeHtml, sendTransactionalEmail, transactionalEmailConfigured } from "@/lib/transactional-email";
import { hashAuthToken } from "@/lib/auth-tokens";

function fail(message: string): never { redirect(`/waitlist/leave?error=${encodeURIComponent(message)}`); }

export async function requestStopInvitationsAction(formData: FormData): Promise<void> {
  const email = normalizeWaitlistEmail(String(formData.get("email") ?? ""));
  if (!email) fail("Enter a valid email address.");
  const { ipAddress } = await getRequestMetadata();
  const ip = await consumeRateLimit({ scope: "invitation-stop.ip", identifiers: [ipAddress], limit: 10, windowMs: 60 * 60_000 });
  if (!ip.allowed) fail("Too many requests. Please try again in an hour.");
  const recipient = await consumeRateLimit({ scope: "invitation-stop.email", identifiers: [email], limit: 3, windowMs: 24 * 60 * 60_000 });
  if (!recipient.allowed) redirect("/waitlist/leave?submitted=1");
  if (!transactionalEmailConfigured()) fail("Email is temporarily unavailable. Please try again later or use the stop link in an earlier invitation.");
  try {
    const url = await requestInvitationStopLink(email);
    if (url) {
      const result = await sendTransactionalEmail({ category: "AUTH", to: email, subject: "Manage your Jump in the Mix invitation emails",
        text: `You requested a link to leave the waitlist and stop invitation emails. Confirm your choice here: ${url}\n\nThis link expires in 90 days. If you didn’t request this, ignore this email.`,
        html: `<p>You requested a link to leave the waitlist and stop invitation emails.</p><p><a href="${escapeHtml(url)}">Review and confirm your choice</a></p><p>This link expires in 90 days. If you didn’t request this, ignore this email.</p>`,
        idempotencyKey: `invitation-stop-${hashAuthToken(url)}` });
      if (!result.delivered) throw new Error("Delivery unavailable");
    }
  } catch { fail("We couldn’t complete your request. Please try again later."); }
  redirect("/waitlist/leave?submitted=1");
}

export async function stopInvitationsAction(formData: FormData): Promise<void> {
  const { ipAddress } = await getRequestMetadata();
  const limit = await consumeRateLimit({ scope: "invitation-stop.confirm", identifiers: [ipAddress], limit: 30, windowMs: 60 * 60_000 });
  if (!limit.allowed) fail("Too many attempts. Please try again in an hour.");
  const stopped = await stopInvitationEmails(String(formData.get("token") ?? ""));
  if (!stopped) fail("This link expired or was already used. Request a new link below if needed.");
  revalidatePath("/admin/waitlist");
  redirect("/waitlist/leave?stopped=1");
}
