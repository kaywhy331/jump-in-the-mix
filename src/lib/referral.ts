import { randomBytes } from "node:crypto";

export const REFERRAL_COOKIE = "jitm_referral";
export const REFERRAL_REWARD_DAYS = 30;
export const REFERRAL_MAX_REFERRER_DAYS = 360;
export const REFERRAL_CODE_LENGTH = 10;
export const DAY_MS = 24 * 60 * 60 * 1000;

export function normalizeReferralCode(value: string | null | undefined): string {
  return (value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, REFERRAL_CODE_LENGTH);
}

export function generateReferralCode(): string {
  return randomBytes(8)
    .toString("base64url")
    .replace(/[^A-Za-z0-9]/g, "")
    .toUpperCase()
    .slice(0, REFERRAL_CODE_LENGTH);
}

export function addReferralDays(value: Date, days: number): Date {
  return new Date(value.getTime() + Math.max(days, 0) * DAY_MS);
}

export function referralDaysRemaining(expiresAt: Date | null | undefined, now = new Date()): number {
  if (!expiresAt || expiresAt <= now) return 0;
  return Math.max(Math.ceil((expiresAt.getTime() - now.getTime()) / DAY_MS), 0);
}

export function referralShareUrl(appUrl: string, code: string): string {
  const base = appUrl.replace(/\/$/, "");
  return `${base}/r/${encodeURIComponent(normalizeReferralCode(code))}`;
}

export function referralShareMessage(url: string): string {
  return `I use Jump in the Mix to stay on top of the people and follow-ups that matter. Join with my invite and start with 30 days of Plus: ${url}`;
}

export function referralRewardStatusLabel(value: string): string {
  switch (value) {
    case "ACTIVE":
      return "Active Plus time";
    case "BANKED":
      return "Banked for later";
    case "CONSUMED":
      return "Used";
    case "CAPPED":
      return "Annual cap reached";
    case "REVOKED":
      return "Revoked";
    default:
      return "Pending qualification";
  }
}
