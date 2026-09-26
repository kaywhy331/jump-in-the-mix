# Onboarding and personal invitations — September 17, 2026

This implements the owner's September 17 UI/UX corrections. It supersedes the earlier five-invitation, application-email personal referral flow. The original research and marketing source files are unchanged.

## Behavior

- Email verification redirects, including invalid/used links and rate-limit recovery, use the configured public `APP_URL`. A standalone server's `https://0.0.0.0:10000` request origin and forwarded host headers cannot become the destination.
- Onboarding accepts any combination of Business, Personal connections, and Networking. Choices persist in `WorkspaceProfile.useCases`; the starting-point dropdown combines their reasons. A carried marketing example is an option in that same dropdown.
- Phone and email both say “recommended”. A user can import CSV/vCard contacts in another tab without losing the setup form, refresh the saved-person list, or use the existing device contact picker where the browser supports it. Choosing an imported person reuses that contact. This is contact import/selection, not continuous address-book synchronization.
- Members can prepare 1–3 invitations by entering email addresses or text numbers, or selecting saved contact methods. Preparation creates the contact if necessary, a random 256-bit single-use access link, and a pending Today reminder in one transaction. Nothing enters the application invitation-email queue. Automatic follow-up delivery excludes these reminders even when the member has opted into automation.
- The lifetime allowance is three, including previously issued invitations. Existing invitation links and accepted accounts remain valid. Revocation does not refund allowance. Repeated preparation for the same contact and method reuses its reminder and link.
- Email invitations remain bound to the selected email. A text invitation lets the holder choose the email they will verify. Claim and account creation share a transaction; a failed signup rolls back the claim, and concurrent claims admit only one account. Opening a link does not consume it.
- Personal invitations use the member allowance rather than the shared email-wave reservation ceilings, fixing the reported default-capacity failure. Referral/global issuance pauses, redemption pauses, verified-sender requirements, recipient opt-outs, contact ownership and rate limits still apply. Waitlist and staff email workflows retain their existing delivery controls.
- Today uses the exact invited email/number, including a saved secondary address. Revocation or acceptance cancels a pending reminder. Opening a messaging app retains the existing pending-until-user-confirmation behavior.

## Copy basis and scope

Consulted `assets/README.md`, the independent consultant ICP, the supplied conversion-copywriting and marketing-principles references, and the homepage roadmap's P4/P5 criteria. The ICP is a fictional hypothesis. The working hypothesis is that explicit checkbox selection, one starting-point control, and literal “Add invitations to Today” wording address the reported confusion. There is no claim of measured conversion or customer-outcome improvement. FAQ, privacy/terms product descriptions, registration, and staff invitation previews follow the implemented behavior.

## Release requirements

Migration `20260917160000_personal_invitation_reminders` adds persisted use cases, phone/manual-delivery fields, and the invitation-to-reminder relationship; it permits an invitation with a phone and no email. Apply the migration, then publish the web application and updated worker (which excludes personal reminders from automatic delivery) together on Netlify. For separately managed workers, update the worker before the web application. Verify `APP_URL` matches that environment's public URL.

An older worker must not be restored while pending manual invitation reminders exist: it lacks the automatic-delivery exclusion. Prefer a forward fix with the compatible worker. Do not remove the new fields or phone invitations as a routine rollback.

These changes do not themselves authorize or perform a customer-site deployment. Any staging publication must use the stable test site specified in `AGENTS.md`.

## Validation

Implementation validation used disposable loopback databases; no real invitations were sent. Subsequent hosted checks used temporary synthetic accounts on the private test site and removed them afterwards.

- The new migration applied successfully to two fresh databases, alongside all preceding migrations. Catalog seeding succeeded.
- `npm run validate:static` passed schema, syntax and import/Server Action checks. `npm run typecheck` passed.
- The broad Vitest run passed 160 suites (1,200 tests) and skipped 68 gated tests. Its five failures were in two test suites: expectations for the replaced email-queue flow and an incorrectly parameterized batch-validation test. Both were updated. A final focused run passed all 96 tests across eight suites, including both affected suites, verification redirects, referral concurrency/redemption, admission, wording releases and handoff attempts.
- `e2e/onboarding-invitations.spec.ts` passed all four desktop/mobile Chromium journeys. These cover multi-selection persistence, the single starting-point dropdown, imported-contact reuse without duplicate creation, retained form state on refresh, the onboarding accessibility scan (no serious/critical findings), three mixed-channel reminders, selected secondary email handoff, no queued invitation mail, non-consuming signup-link visits, and revocation.
- The phone invitation integration test also verifies that scheduler reconciliation preserves the reminder, enabled automatic delivery does not claim it, and concurrent signups with different emails produce only one account.
- The final production build completed successfully, including TypeScript and page generation. Builds/browser runs used `JITM_BUILD_DIR` under ignored `.artifacts/` to avoid the existing local development server. The first build process stopped during checks; the separate rerun with `NODE_OPTIONS=--max-old-space-size=1536` passed.
- Mobile screenshots were visually reviewed: `.artifacts/onboarding-mobile-chromium.png` and `.artifacts/invitations-mobile-chromium.png`. Desktop screenshots use the same filenames with `desktop-chromium`.

The onboarding and invitation changes were published to the stable private test site on September 17 at 23:56 UTC. See [the deployment receipt](ONBOARDING_DEPLOYMENT_2026-09-17.md) for the release, migration and hosted checks. The customer site was not deployed. Native device-picker availability remains browser-dependent; continuous contact synchronization is not claimed.
