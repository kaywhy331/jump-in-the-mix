import type { Metadata } from "next";
import Link from "next/link";
import { PublicDocument } from "@/components/PublicDocument";

export const metadata: Metadata = { title: "Terms of use", description: "Account access and responsible use of the free Jump in the Mix invitation release." };

export default function TermsPage() {
  return <PublicDocument title="Terms of use">{details => <>
    <p>These terms describe use of the Jump in the Mix service operated by {details.operatorName}. Contact <a href={`mailto:${encodeURIComponent(details.supportEmail)}`}>{details.supportEmail}</a> about these terms or your account.</p>
    <section><h2>Free accounts and invitations</h2><p>The current invitation release is free and requires no payment card. Access is limited by available capacity. Waitlist waves, invitation redemption, or new accounts may pause while capacity or operational issues are resolved. Joining the waitlist does not guarantee an invitation date. Each member receives five lifetime personal invitations through the System Mix.</p></section>
    <section><h2>Your account and information</h2><p>Use accurate account information and protect your sign-in credentials. Use only accounts and workspaces you are authorized to access. Only upload contact details or other content you have permission to use. You remain responsible for the accuracy of your content, your intended recipients, and your messaging choices.</p><p>You retain ownership of the content you provide. You permit us and our service providers to process it as needed to operate the features you use, provide support, and protect the service, as described in the <Link href="/privacy">privacy notice</Link>.</p></section>
    <section><h2>Respect other people</h2><p>Do not use the service for spam, harassment, impersonation, unlawful content, or attempts to bypass access controls or sending limits. Respect recipient opt-outs and the rules of the messaging providers you connect. An invitation allowance does not give permission to contact someone who has asked you to stop.</p></section>
    <section><h2>Review before sending</h2><p>Review suggested messages, contact details, and dates before acting on them. Opening a messaging app or marking a follow-up done does not prove a message was delivered, read, or answered. Automatic sending and notifications depend on the services and devices involved and can be delayed or unavailable.</p></section>
    <section><h2>Availability and account access</h2><p>We may change features or temporarily limit access for maintenance, capacity, security, or abuse prevention. We can restrict accounts that misuse the service. If you believe a restriction is mistaken, contact support so we can review it. Keep an export of information you need independently of the service.</p></section>
    <section><h2>Leaving and getting help</h2><p>You can export your data or permanently delete your account in Settings → Data &amp; privacy. Deletion cannot retract messages already sent or remove copies controlled by recipients and other providers. The <Link href="/privacy">privacy notice</Link> explains retained operational records and backup handling.</p><p>Use <Link href="/contact">Contact &amp; support</Link> for help, privacy requests, or account-access concerns.</p></section>
  </>}</PublicDocument>;
}
