import { createHash } from "node:crypto";

export const REVIEW_REQUEST_LIFETIME_DAYS = 30;

export function hashReviewToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function reviewRequestExpiresAt(now = new Date()): Date {
  return new Date(now.getTime() + REVIEW_REQUEST_LIFETIME_DAYS * 24 * 60 * 60_000);
}

export function reviewResponseStatus(rating: number): "HAPPY" | "NEEDS_ATTENTION" {
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new Error("Choose a rating from 1 to 5.");
  return rating >= 4 ? "HAPPY" : "NEEDS_ATTENTION";
}

export function referralShareMessage(company: string, website: string | null): string {
  const destination = website?.trim() ? ` ${website.trim()}` : "";
  return `I had a great experience with ${company}. If you need someone dependable, I’d be happy to recommend them.${destination}`;
}
