import type { Metadata } from "next";
import Link from "next/link";
import { BillingVerificationPanel } from "@/components/BillingVerificationPanel";
import { Notice } from "@/components/Notice";

export const metadata: Metadata = { title: "Subscription verification" };

export default async function BillingSuccessPage({
  searchParams
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const sessionId = (await searchParams).session_id?.trim() ?? "";
  return (
    <div className="page billing-result-page">
      {sessionId.startsWith("cs_") ? (
        <BillingVerificationPanel sessionId={sessionId} />
      ) : (
        <section className="card billing-verification-card error">
          <Notice type="error">The Stripe Checkout Session identifier is missing or invalid.</Notice>
          <div className="page-actions"><Link className="button primary" href="/plans">Return to plans</Link><Link className="button" href="/account">My Account</Link></div>
        </section>
      )}
    </div>
  );
}
