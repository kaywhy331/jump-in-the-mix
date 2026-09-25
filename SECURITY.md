# Security policy

Jump in the Mix is a hosted service at https://jumpinthemix.com. This policy covers that service. The same policy is published for the public at https://jumpinthemix.com/security, and the contact details are also published at https://jumpinthemix.com/.well-known/security.txt ([RFC 9116](https://www.rfc-editor.org/rfc/rfc9116)).

## Report a vulnerability

Email **security@jumpinthemix.com**. If you have not heard back within five business days, also write to **support@jumpinthemix.com**.

Include:

- what you found and where: the page, address or feature;
- the steps to reproduce it;
- what someone could do with it;
- how we can reach you.

Show the problem with your own account or a test account. Do not send other people's information, passwords, sign-in links, authenticator codes, database dumps, backup archives, encryption keys or session tokens. Do not report a vulnerability in a public issue. We read reports in English.

## What to expect

- We confirm that we received your report, investigate it, and tell you what we found.
- We fix confirmed problems as quickly as we can and tell you when the fix is live.
- Tell us if you would like to be credited when we describe the fix.
- We do not promise a fixed response or fix time.

## Safe harbour

If you follow this policy in good faith:

- we will not take legal action against you or report you to law enforcement for your research;
- we will not treat your research as a breach of the [terms of use](https://jumpinthemix.com/terms);
- we will work with you to understand and fix the problem.

In return:

- Test only accounts you own or have permission to use.
- Stop as soon as you reach someone else's information. Do not keep, share or change it, and tell us what you saw.
- Do not disrupt the service. No denial-of-service or load testing, no high-volume automated scanning, and no messages to people who did not ask for them.
- Do not use social engineering, phishing or physical access against our team, our customers or our service providers.
- Give us reasonable time to fix a problem before you describe it publicly, and agree the timing with us.

## Scope

In scope:

- jumpinthemix.com: the application, its sign-in, account and invitation pages;
- the email the service sends.

Out of scope:

- The services of our providers, named in the [privacy notice](https://jumpinthemix.com/privacy). Report problems in them to the provider.
- Missing headers, email authentication records or software versions, unless you show a risk.
- Problems that need a stolen device or an account that is already compromised.
- Denial-of-service attacks.

Only the version running at jumpinthemix.com receives security fixes. The service is deployed from this repository's reviewed commits.

## Self-hosted copies

Someone who runs their own copy of this code (for example with `compose.pilot.yml`) operates it, not us. That operator is responsible for:

- unique secrets;
- host and Docker updates;
- access control;
- encrypted backups and restore testing;
- limiting network exposure.

Report a vulnerability in the code itself to the addresses above.

## For maintainers

- `public/.well-known/security.txt` expires. Before its `Expires` date, set a new one at most a year ahead. `tests/security-txt.test.ts` fails 30 days before the date.
- Keep the security@jumpinthemix.com alias delivering to a monitored inbox. Check that it still delivers whenever the email forwarding changes.
- Keep this file, the `/security` page (`src/app/security/page.tsx`) and `security.txt` in step.
