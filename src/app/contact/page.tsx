import type { Metadata } from "next";
import Link from "next/link";
import { PublicDocument } from "@/components/PublicDocument";

export const metadata: Metadata = { title: "Contact and support", description: "Get help with Jump in the Mix, your account, or a privacy request." };

export default function ContactPage() {
  return <PublicDocument title="Contact & support">{details => <>
    <p>Jump in the Mix is operated by {details.operatorName}.</p>
    <section><h2>Account help and privacy requests</h2><p>Email <a href={`mailto:${encodeURIComponent(details.supportEmail)}`}>{details.supportEmail}</a>. Include the account email and a short description of the issue. Do not send passwords, sign-in links, authenticator codes, or private contact lists.</p><p>If you are already signed in, you can use Support in the application to keep your conversation together. We may ask you to verify your email before discussing private records.</p></section>
    <section><h2>Invitations and the waitlist</h2><p>Use the unique invitation link sent to your email to create an account. For existing accounts, <Link href="/forgot-password">request a password reset</Link>.</p><p>You can <Link href="/waitlist/leave">leave the waitlist or stop invitation emails</Link> without creating an account. Contact support if you cannot complete that process.</p></section>
    <section><h2>Export or delete your information</h2><p>Open Settings → Data &amp; privacy in your account. If you cannot sign in, or someone else entered information about you, contact the support address above. See <Link href="/privacy">how information is used and retained</Link>.</p></section>
  </>}</PublicDocument>;
}
