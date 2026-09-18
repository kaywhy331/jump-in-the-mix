# UI/UX implementation and release evidence — September 18, 2026

This work implements the [184-finding audit](UI_UX_PRODUCT_READINESS_AUDIT_2026-09-18.md). The [individual checklist](ui-ux-audit-2026-09-18/IMPLEMENTATION_CHECKLIST.md) separates implementation, verification, external qualification and live deployment. A code change alone does not close a finding.

**175 findings are complete. Nine remain open for participant, physical-device, assistive-technology or controlled-inbox/staff recovery observations. The requested all-findings definition of done is not yet met.**

The [authorized follow-up](ui-ux-audit-2026-09-18/AUTHORIZED_FOLLOWUP.md) records owner approval and the subsequent receipt-recovery correction, deployed to production and the stable test site. Current production revision: `8520b73cc41d72c40ecec1ca06ca752fd95ce5d5`. Original release evidence below is retained as history.

## Current implementation

The release covers the public demo and profession continuity, authentication recovery, minimal onboarding with starter review, protected form drafts, contact editing and history, audience selection, scheduling previews, Today and native-app return recovery, invitations, intake review, feedback, preferences, account safeguards, support and administrative workflows.

Operational controls now show their consequences before submission. Email history can be searched and paged, support triage distinguishes customer messages from internal activity, publication states distinguish live versions from unpublished drafts, and MFA enrollment handles clipboard denial and requires recovery-code storage acknowledgment.

## Local verification

- Desktop and mobile Chromium: 28 of 32 initial regression cases passed. The four failures were ambiguous test selectors in history correction and deletion alerts. Corrected tests plus paged email-history checks passed all 14 cases on a fresh run. MFA used synthetic recovery material with recordings disabled.
- Full unit/integration run: 1,201 passed, 8 failed, 68 skipped across 171 files. Seven failures were source-text assertions for the new delegated form actions/account markup; one admission integration case exceeded the five-second limit during concurrent browser testing. The six affected files, including additional date/context assertions, then passed 54 tests in isolation with a 15-second test limit. Automatic-delivery tests separately passed all three cases.
- Type checking passed after the customer and staff changes. The isolated production build passed, including Next.js TypeScript checks. A separate repository type check also passed.

Evidence is retained in `.artifacts/ui-ux-implementation-20260918/`. Test fixtures use a disposable loopback PostgreSQL database; no local test intentionally sends real customer messages.

- The compiled staff/workflow suite initially passed 96 cases, failed 22 and skipped two viewport-specific cases. Label/selector and test-origin assumptions were corrected; reports/options/admission layout regressions were fixed. The corrected set passed 24 cases with one layout failure, then the layout and support-draft rerun passed three cases with one intentional mobile skip.
- MFA enrollment and one-time recovery passed. Seven magic-link redirect cases plus four readiness unit cases passed.
- The 162-state Chromium route scan and 26-state Firefox scan found one dark-theme demo-notice contrast issue, now fixed. A 78-state HTTPS follow-up across Chromium, Firefox and WebKit reported no axe violations or horizontal overflow after that fix. WebKit exposed canceled speculative staff-navigation requests during immediate navigation. A direct trace returned 200 when those requests completed. Staff navigation and overview links now fetch on demand; the targeted trace verifies the correction.
- A final multi-form save regression caught an unsaved scheduling draft being discarded by a profile save. A form-specific confirmation now protects that boundary. Desktop/mobile tests verify cancellation preserves both drafts, successful saves clear the warning, and support triage still preserves replies (four passed).
- After disabling speculative fetches for staff navigation, the targeted WebKit trace reported no page errors or failed requests, and the final admin navigation/layout checks passed both cases.

## Original deployment state

The original implementation release was published at **https://jumpinthemix.com/** on revision `32f276fc6bdd2a71d23692437e6836e1bebe090a`, from branch `release/ui-ux-readiness-20260918`. The isolated release package starts from production commit `ab323cd14ac09a9329315b10a4bb8e3b82fbbe65`. The schema, 61 migration files, dependency lockfile and deployment configuration match that baseline. This release required no schema migration. Existing unrelated working-tree changes were preserved; release documentation is committed separately after the deployed implementation.

| Target | Deployment | Verified result |
| --- | --- | --- |
| Production worker | `dep-dammc0dbedkc73cag3t0` | Live at 16:26:58 UTC; synthetic no-op queue job processed and removed. |
| Production web | `dep-dammct61egvs73cqpcvg` | Live at 16:31:12 UTC; revision and served assets verified. |
| Stable Netlify test site | `6aad680b193c47aaf380fa28` | Published to https://jump-in-the-mix-test.netlify.app/; separate database quota restriction remains. |

Production postflight matched all **629 source files and 19 served assets** to the release. All 61 database migrations matched, and live, ready, worker and recovery-boundary health returned 200. Public routes rendered and protected routes redirected signed-out visitors to login.

The live synthetic customer check passed actual password sign-in, onboarding with all three purposes, first follow-up preparation, the three-invitation allowance, nine authenticated mobile surfaces without horizontal overflow, and the scoped automatic-sending preview. There were no page errors. An initial heading-count assertion included a closed account dialog; the corrected check verifies one accessible heading, visible workspace content and no open account gate. Both runs removed their temporary account, workspace, contacts and follow-ups. No real customer messages were sent.

The final production watch ended at 16:37:17 UTC: three rounds of live/ready/worker checks returned 200, the updated worker heartbeat was current, no jobs had failed since rollout, no synthetic accounts remained, and customer-table counts matched the postflight baseline.

Staging uses the explicit test site ID `8fd20ccd-5c35-47e5-99ce-98e5670d52fe`. Copied dependency executable links initially pointed into the production package and caused its first build to fail. Restoring local dependency paths allowed the normal Turbopack build and publication to succeed without a framework/configuration change. The staging package preserves its previously applied migration-file bytes; production migration history is unchanged.

The staging database has a pre-existing outage: Neon returns SQLSTATE 53000, quota exceeded, for project `tiny-wave-99766597`, endpoint `ep-super-unit-a5le0lzc`. Its provider record reports a quota reset on October 1. No paid upgrade or replacement database has been provisioned. The customer database is separate. Authenticated staging qualification remains blocked until the test database is available.

Staging postflight verified the stable URL's published deployment identity and matched 16 served assets to the uploaded build. Homepage and FAQ checks passed at 390 pixels/light and 1440 pixels/dark, with no axe violations or horizontal overflow. Login, Terms and Privacy returned 503, as did database and worker readiness; these routes are recorded as unavailable, not passed. Production equivalents passed. The [sanitized release receipt](ui-ux-audit-2026-09-18/release-verification.json) records both deployment outcomes.

The task's local test server, HTTPS proxy, disposable database, copied environment credentials and temporary TLS key were removed or stopped after verification. Original workspace configuration was restored from the session snapshots.

## Qualification still required

Physical iPhone/Android handoffs, native contact/voice capture, assistive technology, actual reminder/provider delivery, participant comprehension and owner-led trust-copy review need their own evidence. Automated browser and API results are not substitutes for these observations. The [remaining qualification worksheet](ui-ux-audit-2026-09-18/REMAINING_QUALIFICATION.md), [manual device worksheet](MANUAL_DEVICE_QUALIFICATION.md), and [roadmap reconciliation](HOMEPAGE_READINESS_RECONCILIATION_2026-09-18.md) name the outstanding evidence.

The [September 18 continuation](ui-ux-audit-2026-09-18/QUALIFICATION_CONTINUATION.md) reconfirmed the existing deployment, added 60 passing live browser states and 40 focused passing tests, and prepared exact review tasks for the ten open findings. It made no application or deployment changes and did not close any external qualification gate.

## Corrected owner review: mobile clarity

The corrected nine-item review led to the [mobile clarity release](MOBILE_CLARITY_2026-09-18.md), deployed as `a0bf38bb116de342e33290d4f75abe80f2c7359c` and verified 2026-09-18T22:44:54.967Z. It replaces the dense demo with a single guided example, simplifies Today and plan setup, makes profession examples discoverable, and improves private-feedback and install-prompt clarity. Production health, served sources/assets and live public browser checks passed. Staging is published but remains blocked by the existing Neon quota outage. The nine manual qualification gates remain open.
