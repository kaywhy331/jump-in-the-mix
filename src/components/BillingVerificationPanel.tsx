"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppIcon } from "@/components/AppIcon";

type VerificationState = {
  phase: "VERIFYING" | "SUCCESS" | "PENDING" | "ERROR";
  message: string;
  planTier: string | null;
};

export function BillingVerificationPanel({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [state, setState] = useState<VerificationState>({
    phase: "VERIFYING",
    message: "Confirming the subscription with Stripe…",
    planTier: null
  });

  useEffect(() => {
    let canceled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;

    async function verify() {
      attempts += 1;
      try {
        const response = await fetch(`/api/billing/verify?session_id=${encodeURIComponent(sessionId)}`, {
          cache: "no-store"
        });
        const payload = await response.json() as {
          complete?: boolean;
          paymentStatus?: string;
          subscriptionStatus?: string | null;
          planTier?: string | null;
          error?: string;
        };
        if (canceled) return;
        if (!response.ok) {
          if (attempts < 4 && response.status >= 500) {
            timer = setTimeout(verify, 1800);
            return;
          }
          setState({ phase: "ERROR", message: payload.error || "The subscription could not be verified.", planTier: null });
          return;
        }
        if (payload.complete && payload.planTier) {
          setState({
            phase: "SUCCESS",
            message: `${payload.planTier.toLowerCase()} access is active. Your account has been updated.`,
            planTier: payload.planTier
          });
          router.refresh();
          return;
        }
        if (attempts < 8) {
          setState({ phase: "VERIFYING", message: "Stripe is still finalizing the subscription…", planTier: null });
          timer = setTimeout(verify, 1800);
          return;
        }
        setState({
          phase: "PENDING",
          message: "The payment is still processing. Stripe will update your account automatically when it completes.",
          planTier: null
        });
      } catch {
        if (canceled) return;
        if (attempts < 4) {
          timer = setTimeout(verify, 1800);
          return;
        }
        setState({ phase: "ERROR", message: "The verification request could not reach the server.", planTier: null });
      }
    }

    void verify();
    return () => {
      canceled = true;
      if (timer) clearTimeout(timer);
    };
  }, [router, sessionId]);

  return (
    <section className={`card billing-verification-card ${state.phase.toLowerCase()}`} aria-live="polite">
      <div className="billing-verification-icon" aria-hidden="true">
        <AppIcon name={state.phase === "SUCCESS" ? "check" : state.phase === "ERROR" ? "alert" : "refresh"} />
      </div>
      <div>
        <h1>{state.phase === "SUCCESS" ? "Subscription confirmed" : state.phase === "ERROR" ? "Verification needs attention" : "Verifying payment"}</h1>
        <p>{state.message}</p>
        <div className="page-actions">
          <Link className="button primary" href="/account">Open My Account</Link>
          <Link className="button" href="/jumps">Go to Jump</Link>
        </div>
      </div>
    </section>
  );
}
