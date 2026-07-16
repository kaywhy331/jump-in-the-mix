import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Checkout canceled" };

export default function BillingCancelPage() {
  return (
    <div className="page billing-result-page">
      <section className="card billing-verification-card pending">
        <div className="billing-verification-icon" aria-hidden="true">↩</div>
        <div>
          <h1>Checkout canceled</h1>
          <p>No subscription change was made. Your existing Jump in the Mix data and current plan remain unchanged.</p>
          <div className="page-actions">
            <Link className="button primary" href="/plans">Review plans</Link>
            <Link className="button" href="/account">Return to My Account</Link>
          </div>
        </div>
      </section>
    </div>
  );
}
