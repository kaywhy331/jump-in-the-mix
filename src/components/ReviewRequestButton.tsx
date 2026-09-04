"use client";

import { useState } from "react";

type ReviewRequestResult = {
  reviewUrl: string;
  message: string;
  smsUrl: string | null;
  emailUrl: string | null;
  expiresAt: string;
};

export function ReviewRequestButton({ contactId }: { contactId: string }) {
  const [result, setResult] = useState<ReviewRequestResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const create = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/contacts/${encodeURIComponent(contactId)}/review-request`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const payload = await response.json().catch(() => null) as (ReviewRequestResult & { error?: string }) | null;
      if (!response.ok || !payload?.reviewUrl) throw new Error(payload?.error || "The review request could not be prepared.");
      setResult(payload);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The review request could not be prepared.");
    } finally {
      setLoading(false);
    }
  };

  const copy = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.message);
      setCopied(true);
    } catch {
      setError("Copy is unavailable here. Open the text or email composer instead.");
    }
  };

  if (!result) return <span className="review-request-control"><button className="button" type="button" onClick={create} disabled={loading}>{loading ? "Preparing…" : "Ask for a review"}</button>{error && <span className="field-error" role="alert">{error}</span>}</span>;

  return <section className="review-request-ready" aria-live="polite">
    <strong>Private check-in ready</strong>
    <p>Your customer rates the experience first. Happy customers can continue to your public review page and share a referral.</p>
    <div className="card-actions">
      {result.smsUrl && <a className="button primary" href={result.smsUrl}>Text request</a>}
      {result.emailUrl && <a className="button primary" href={result.emailUrl}>Email request</a>}
      <button className="button" type="button" onClick={copy}>{copied ? "Copied" : "Copy message"}</button>
    </div>
    <small>Link expires {new Date(result.expiresAt).toLocaleDateString()}.</small>
  </section>;
}
