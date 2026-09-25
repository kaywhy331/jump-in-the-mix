import type { Metadata } from "next";
import Link from "next/link";
import { PublicDocument } from "@/components/PublicDocument";

export const metadata: Metadata = { title: "Security", description: "How to report a security problem in Jump in the Mix, what happens next, and how to research in good faith." };

// public/.well-known/security.txt lists this address first; tests/security-txt.test.ts keeps them in step.
const SECURITY_EMAIL = "security@jumpinthemix.com";

export default function SecurityPage() {
  return <PublicDocument title="Security" effectiveDate="2026-09-25">{details => <>
    <p>{details.operatorName} operates Jump in the Mix. If you find a security problem in the service, tell us privately at <a href={`mailto:${encodeURIComponent(SECURITY_EMAIL)}`}>{SECURITY_EMAIL}</a> so we can fix it before anyone misuses it.</p>
    <section><h2>Report a problem</h2><p>Describe what you found, where it happens, the steps to reproduce it, and what someone could do with it. Include how we can reach you. If you have not heard from us within five business days, also write to <a href={`mailto:${encodeURIComponent(details.supportEmail)}`}>{details.supportEmail}</a>.</p><p>Show the problem with your own account or a test account. Do not include other people&apos;s information, passwords, sign-in links, or authenticator codes in your report. We read reports in English. These contact details are also published in <a href="/.well-known/security.txt">security.txt</a>.</p></section>
    <section><h2>What happens next</h2><p>We confirm that we received your report, investigate it, and tell you what we found. We fix confirmed problems as quickly as we can and let you know when the fix is live. Tell us if you would like to be credited when we describe the fix.</p></section>
    <section><h2>Research in good faith</h2><p>If you follow this page in good faith, we will not take legal action against you or report you to law enforcement for your research, we will not treat it as a breach of the <Link href="/terms">terms of use</Link>, and we will work with you to understand and fix the problem.</p><p>Test only accounts you own or have permission to use. Stop as soon as you reach someone else&apos;s information, do not keep, share, or change it, and tell us what you saw. Do not disrupt the service: no denial-of-service or load testing, no high-volume automated scanning, and no messages to people who did not ask for them. Do not use social engineering, phishing, or physical access against our team, our customers, or our service providers. Give us reasonable time to fix a problem before you describe it publicly, and agree the timing with us.</p></section>
    <section><h2>What this covers</h2><p>This page covers jumpinthemix.com: the application, its sign-in, account and invitation pages, and the email the service sends. The providers named in the <Link href="/privacy">privacy notice</Link> run their own security programs; report problems in their services to them.</p><p>These are not security problems on their own: missing headers, email authentication records, or software versions without a demonstrated risk; problems that need a stolen device or an account that is already compromised; and denial-of-service attacks.</p></section>
    <section><h2>Your own account</h2><p>If you think someone else is using your account, <Link href="/forgot-password">reset your password</Link> and contact <a href={`mailto:${encodeURIComponent(details.supportEmail)}`}>{details.supportEmail}</a>.</p></section>
  </>}</PublicDocument>;
}
