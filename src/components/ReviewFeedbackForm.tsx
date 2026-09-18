"use client";

import { useState } from "react";

type ReviewState = "READY" | "OPENED" | "HAPPY" | "NEEDS_ATTENTION" | "REVIEW_CLICKED" | "REFERRAL_CLICKED";

function completedState(status: ReviewState, rating: number | null): "happy" | "attention" | null {
  if (status === "NEEDS_ATTENTION" || (rating !== null && rating <= 3)) return "attention";
  if (["HAPPY", "REVIEW_CLICKED", "REFERRAL_CLICKED"].includes(status) || (rating !== null && rating >= 4)) return "happy";
  return null;
}

export function ReviewFeedbackForm({ token, initialStatus, initialRating, reviewAvailable, businessContact }: { token: string; initialStatus: ReviewState; initialRating: number | null; reviewAvailable: boolean; businessContact?: string | null }) {
  const [outcome, setOutcome] = useState<"happy" | "attention" | null>(() => completedState(initialStatus, initialRating));
  const [rating, setRating] = useState<number | null>(initialRating);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch(`/api/reviews/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating: Number(form.get("rating")), feedback: String(form.get("feedback") ?? "") })
      });
      const payload = await response.json().catch(() => null) as { outcome?: "happy" | "attention"; error?: string } | null;
      if (!response.ok || !payload?.outcome) throw new Error(payload?.error || "Your feedback could not be saved.");
      setOutcome(payload.outcome);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Your feedback could not be saved.");
    } finally {
      setLoading(false);
    }
  };

  if (outcome) return <div className="review-thanks" role="status"><h2>Thank you for your feedback</h2><p>Your rating and comments were recorded privately for the business. A reply is not guaranteed.</p><div className="review-next-actions">{reviewAvailable && <a className="button primary" href={`/api/reviews/${encodeURIComponent(token)}/public-review`}>Leave a public review (optional)</a>}<a className="button" href={`/api/reviews/${encodeURIComponent(token)}/refer`}>Recommend us to a friend (optional)</a></div><p>Need to correct your feedback or discuss the experience? {businessContact ? <a href={businessContact}>Contact the business directly</a> : "Reply to your original conversation with the business and describe the correction."}</p></div>;

  return <form className="review-feedback-form" onSubmit={submit}>
    <fieldset><legend>How was your experience?</legend><div className="rating-options">{[1, 2, 3, 4, 5].map((rating) => <label key={rating}><input type="radio" name="rating" value={rating} onChange={() => setRating(rating)} required /><span aria-hidden="true">★</span><span className="sr-only">{rating} out of 5</span></label>)}</div><p>1 — Poor · 5 — Excellent</p><p role="status">{rating ? `Selected ${rating} out of 5` : "Choose a rating"}</p></fieldset>
    <label className="field"><span>Anything you’d like us to know? <small>Optional and private</small></span><textarea name="feedback" rows={4} maxLength={2000} /></label>
    {error && <p className="notice error" role="alert">{error}</p>}
    <button className="button primary" type="submit" disabled={loading}>{loading ? "Sending…" : "Send private feedback"}</button>
  </form>;
}
