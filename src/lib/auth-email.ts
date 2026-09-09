import { hashAuthToken } from "@/lib/auth-tokens";
import { env } from "@/lib/env";
import { escapeHtml, sendTransactionalEmail } from "@/lib/transactional-email";

function absoluteUrl(path: string): string {
  return new URL(path, env.appUrl).toString();
}

function emailFrame(title: string, intro: string, actionLabel: string, actionUrl: string, expiryCopy: string): { html: string; text: string } {
  const safeTitle = escapeHtml(title);
  const safeIntro = escapeHtml(intro);
  const safeLabel = escapeHtml(actionLabel);
  const safeUrl = escapeHtml(actionUrl);
  const safeExpiry = escapeHtml(expiryCopy);

  return {
    html: `<!doctype html><html><body style="margin:0;background:#f5f6fa;color:#172036;font-family:Arial,sans-serif"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:32px 16px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e2e6ef;border-radius:16px"><tr><td style="padding:28px"><div style="font-weight:800;color:#5d4cf2;margin-bottom:18px">Jump in the Mix</div><h1 style="font-size:24px;margin:0 0 12px">${safeTitle}</h1><p style="line-height:1.6;margin:0 0 22px">${safeIntro}</p><p style="margin:0 0 22px"><a href="${safeUrl}" style="display:inline-block;padding:12px 18px;background:#5d4cf2;color:#ffffff;text-decoration:none;border-radius:10px;font-weight:700">${safeLabel}</a></p><p style="font-size:13px;color:#667085;line-height:1.5;margin:0 0 10px">${safeExpiry}</p><p style="font-size:13px;color:#667085;line-height:1.5;margin:0">If the button does not work, copy and paste this link into your browser:<br><a href="${safeUrl}">${safeUrl}</a></p></td></tr></table></td></tr></table></body></html>`,
    text: `Jump in the Mix\n\n${title}\n\n${intro}\n\n${actionLabel}: ${actionUrl}\n\n${expiryCopy}`
  };
}

export async function sendVerificationEmail(email: string, name: string, token: string): Promise<void> {
  const url = absoluteUrl(`/api/auth/verify-email?token=${encodeURIComponent(token)}`);
  const message = emailFrame(
    "Verify your email",
    `Hi ${name || "there"}, confirm this email address to finish securing your Jump in the Mix account.`,
    "Verify email",
    url,
    `This link expires in ${env.emailVerificationHours} hours and can be used once.`
  );
  await sendTransactionalEmail({ category: "AUTH", to: email, subject: "Verify your Jump in the Mix email", ...message, idempotencyKey: `verify-email:${hashAuthToken(token)}` });
}

export async function sendPasswordResetEmail(email: string, name: string, token: string): Promise<void> {
  const url = absoluteUrl(`/reset-password?token=${encodeURIComponent(token)}`);
  const message = emailFrame(
    "Reset your password",
    `Hi ${name || "there"}, use this secure link to choose a new Jump in the Mix password.`,
    "Reset password",
    url,
    `This link expires in ${env.passwordResetMinutes} minutes and can be used once.`
  );
  await sendTransactionalEmail({ category: "AUTH", to: email, subject: "Reset your Jump in the Mix password", ...message, idempotencyKey: `reset-password:${hashAuthToken(token)}` });
}

export async function sendPasswordChangedEmail(email: string, name: string): Promise<void> {
  const accountUrl = absoluteUrl("/account");
  const message = emailFrame(
    "Your password was changed",
    `Hi ${name || "there"}, the password for your Jump in the Mix account was changed. If this was not you, reset it immediately and review your active sessions.`,
    "Review account security",
    accountUrl,
    "For your protection, other active sessions may have been signed out."
  );
  await sendTransactionalEmail({ category: "AUTH", to: email, subject: "Your Jump in the Mix password changed", ...message });
}

export async function sendMagicLoginEmail(email: string, token: string): Promise<void> {
  const url = absoluteUrl(`/api/auth/magic?token=${encodeURIComponent(token)}`);
  const message = emailFrame(
    "Your secure sign-in link",
    "Tap the button below to sign in to Jump in the Mix. No password is needed.",
    "Sign in",
    url,
    "This link expires in 15 minutes and can be used once."
  );
  await sendTransactionalEmail({ category: "AUTH", to: email, subject: "Sign in to Jump in the Mix", ...message, idempotencyKey: `magic-login:${hashAuthToken(token)}` });
}
