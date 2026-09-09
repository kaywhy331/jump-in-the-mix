# Browser end-to-end coverage

The aggregate report suite is `e2e/admin-reports.spec.ts`, enabled by `REPORTS_E2E=1` with `AUTH_REQUIRE_ADMIN_MFA=true` on a disposable loopback `jitm_design_*` database. It checks synthetic cohort values, date/preset controls, interactive trends, payload privacy, background exports, operator failure retry, actual CSV download, cross-session/expired-file denial, saved-history detail, live permission removal, MFA/customer/anonymous boundaries, and 320/1440-pixel layouts in both themes with DOM and axe checks. Screenshot, video, and trace capture are disabled. See [Report definitions](ADMIN_REPORTS.md).

Playwright runs the production application in desktop Chromium and a Pixel 7 profile. Tests are serial because seeded accounts and MFA state are shared. Failures retain trace, screenshot, and video artifacts.

The suite covers:

- password sign-in, onboarding, and a first prepared message with resolved placeholders;
- Today actions, native-composer return flow, outcomes, undo, and contact history;
- live contact search, compact add/edit, archive/restore, duplicate review, and queued import status;
- device Contact Picker fallback plus an injected supported-browser API path;
- simple plan authoring and one-screen use of a ready-made plan;
- fixed responsive contact layout, readable controls, overflow protection, dialogs, and visual primitives;
- unavailable retired routes;
- export/account-deletion and stale-session behavior;
- administrator MFA enrollment, recovery-code step-up, support view, and mutation rejection;
- staging web/database/worker health and authenticated route smoke.

## Local execution

After applying migrations and building:

```bash
RESET_DEMO_DATA=true DEMO_MODE=true npm run db:seed
npm run db:seed:e2e-admin
npx playwright install chromium
PLAYWRIGHT_WEB_SERVER_COMMAND="npm run start" npm run test:e2e
```

The normal seeded identities are local-only and can be overridden with `E2E_USER_EMAIL`, `E2E_USER_PASSWORD`, `E2E_ADMIN_EMAIL`, and `E2E_ADMIN_PASSWORD`. Never create deterministic browser-test credentials in production.

The CI order is schema/static validation → migration rehearsal → database deployment → typecheck → unit/integration tests → production build → seed → encrypted backup/restore rehearsal → browser tests. Accessibility scans and Lighthouse budgets run against the same built application.

External checks remain explicit: real Android Contact Picker permission, iPhone/Android native SMS/email/call handoffs, Apple and Google provider consent, email inbox placement, push permission and delivery, and Twilio carrier behavior require controlled staging or physical devices. Record physical results in [Manual device qualification](MANUAL_DEVICE_QUALIFICATION.md).

## Staff and closed-access fixtures

The new staff/waitlist database browser suites require `STAFF_E2E=1` and `WAITLIST_E2E=1`, a loopback database named `jitm_design_*`, and a separate local web process with `AUTH_REQUIRE_ADMIN_MFA=false`. This bypass is only for their synthetic staff fixtures. The main browser suite and staff request integration tests enforce MFA separately. Include `e2e/user-administration.spec.ts` for suspension/restoration and session controls, and `e2e/email-operations.spec.ts` with a synthetic `RESEND_WEBHOOK_SECRET` (CI provides one) to test signed delivery events and Admin Email. Set test sender configuration but leave workers and activity-triggered worker dispatch disabled; these cases queue and cancel mail without sending to external recipients.

Run `e2e/staff-permissions.spec.ts` and `e2e/waitlist-admin.spec.ts` against that process. They exercise manual selection, recipient withdrawal/rejoining, staff-only sign-in, permission changes and denial, grant revocation, safe retry and a retry window expiring after page render. Public waitlist/homepage/registration tests need no administrator bypass. `PLAYWRIGHT_CAPTURE=off` disables image/video/trace capture when only DOM and accessibility evidence is desired.

Vitest database files run serially because singleton wave schedules and the global invitation worker cannot safely share fixtures across concurrent files. Enable `RUN_PUSH_DATABASE_TESTS=true` and `RUN_PLAN_DATABASE_TESTS=true` for the optional database suites; CI now sets both.

## New staff onboarding

`e2e/staff-onboarding.spec.ts` uses a disposable loopback PostgreSQL database named `jitm_design_*`, `STAFF_ONBOARDING_E2E=1`, and `AUTH_REQUIRE_ADMIN_MFA=true`. It creates synthetic staff fixtures, queues an invitation without sending it, and completes recipient setup and authenticator enrollment through the browser. It also verifies per-person permissions, revocation, recipient-link headers, and phone/desktop accessibility in both themes. Capture is disabled inside this suite so setup secrets and recovery codes are not retained in recordings.

Run against the packaged standalone build with the existing test-only sender/encryption configuration, worker dispatch disabled, and:

```sh
STAFF_ONBOARDING_E2E=1 AUTH_REQUIRE_ADMIN_MFA=true PLAYWRIGHT_CAPTURE=off npx playwright test e2e/staff-onboarding.spec.ts --project desktop-chromium
```

Do not reuse a server that has MFA disabled. CI runs this in a separate process from the older staff/waitlist fixture suite. The main customer suite continues to enforce MFA. This browser test exercises application behavior and mocked/local setup data; it does not verify a real sender, mailbox, or physical authenticator device.

## Voice-assisted capture and summary

`e2e/voice-capture.spec.ts` requires `VOICE_E2E=1` and a disposable loopback database named `jitm_design_*`. Run it against the standalone build with the same local sender/encryption configuration and worker dispatch disabled. It simulates recognition and synthesis APIs; no real audio, provider request or recording is used. Keep `PLAYWRIGHT_CAPTURE=off`.

```sh
VOICE_E2E=1 PLAYWRIGHT_CAPTURE=off npx playwright test e2e/voice-capture.spec.ts --project desktop-chromium
```

This suite covers typed/dictated drafts through explicit saving, failure and cancellation, account isolation, local speech fallback, completion counts, timezone handling, and both themes at 320/1440 widths. Run `e2e/browser-privacy.spec.ts` alongside it for cross-account and offline regression coverage. Its separate legacy-service-worker upgrade case still requires the preserved-worker HTTPS proxy fixture and must not be counted as passed when skipped.

## Admission controls

`e2e/admission-controls.spec.ts` requires `ADMISSION_E2E=1`, `AUTH_REQUIRE_ADMIN_MFA=true`, and a disposable loopback database named `jitm_design_*`. Use the same standalone server, local email/encryption placeholders, and disabled dispatch as staff onboarding. No email worker runs. The suite temporarily configures limits and restores the original policy.

```sh
ADMISSION_E2E=1 AUTH_REQUIRE_ADMIN_MFA=true PLAYWRIGHT_CAPTURE=off npx playwright test e2e/admission-controls.spec.ts --project desktop-chromium
```

It covers password/MFA-gated settings, live capacity errors on manual selection, emergency signup and collection pauses, preserved links, stale revisions, removed permissions, and 320/1440 layouts with axe in both themes. The older waitlist-admin fixture now explicitly configures test capacity; production defaults remain zero. CI runs admission alongside the MFA-enabled staff onboarding and voice group.


## Library review and rollback

When multiple projects use different Playwright versions, use an isolated browser cache for installation and execution: `PLAYWRIGHT_BROWSERS_PATH=/tmp/jitm-playwright-1.58.0 npx playwright install chromium`, then pass the same variable to the test command. This prevents another project's browser cleanup from removing this project's required executable.

`e2e/library-administration.spec.ts` requires `LIBRARY_E2E=1`, `AUTH_REQUIRE_ADMIN_MFA=true`, and a disposable loopback database named `jitm_design_*`. Run against the packaged standalone server with capture off; no worker or real messages are used. It creates and removes its own staff, customer, library, and copy fixtures.

```sh
LIBRARY_E2E=1 AUTH_REQUIRE_ADMIN_MFA=true PLAYWRIGHT_CAPTURE=off npx playwright test e2e/library-administration.spec.ts --project desktop-chromium
```

Coverage includes staff-only authoring, saved long-name/missing-field previews, publication, stale customer setup, independent copies after rollback, hiding, revoked publication permission, and both themes at 320/1440 widths. CI includes this in the separate group with required MFA.


## System Mix copy publication

`e2e/system-mix-administration.spec.ts` requires `SYSTEM_MIX_E2E=1`, `AUTH_REQUIRE_ADMIN_MFA=true`, and a disposable loopback `jitm_design_*` database. It restores the original System Mix and admission singletons and removes its synthetic accounts/contacts. Run with the packaged standalone server, worker dispatch disabled, and capture off; no email provider is invoked.

```bash
SYSTEM_MIX_E2E=1 AUTH_REQUIRE_ADMIN_MFA=true PLAYWRIGHT_CAPTURE=off npx playwright test e2e/system-mix-administration.spec.ts --project desktop-chromium
```

Coverage includes saved long/missing-name previews, subject/body publication, stale member review without spending a slot, frozen queued emails, rollback for future invitations, removed publication permissions, and phone/desktop DOM/accessibility checks in both themes. Use the same isolated Playwright browser cache described above when projects share the machine.


## Case-scoped support

`e2e/support-cases.spec.ts` uses `SUPPORT_CASES_E2E=1` and `AUTH_REQUIRE_ADMIN_MFA=true` against the isolated `jitm_design_*` PostgreSQL database and packaged standalone server. It exercises the assignment and customer-view UI, ticket-only target selection, current-session cookie binding, transfer revocation, direct endpoint denial, MFA, mutation blocking, private-read audit content, and 320/1440-pixel DOM/WCAG checks in both themes. All image/video/trace capture is disabled. It creates only synthetic accounts/cases and sends no email. CI includes it in the required-MFA suite. See [Support case access](SUPPORT_CASE_ACCESS.md).


## Email recovery and suppression review

`e2e/email-recovery.spec.ts` runs with `EMAIL_RECOVERY_E2E=1` and `AUTH_REQUIRE_ADMIN_MFA=true` on the isolated `jitm_design_*` database. It exercises the actual clearance and receipt actions, recipient opt-out preservation, stale review rejection, live permission/MFA gates, invitation-type scope, no-content queue HTML, and 320/1440-pixel DOM/WCAG checks in both themes. It creates synthetic local receipts and sends no email or provider request; image, video and trace capture are disabled. CI includes this file in the required-MFA suite.

The same email recovery file also covers deliberate repeat approval, its same-grant guarantee, historical receipts, renewed MFA, and rejection of arbitrary provider URLs through the real action. A valid provider lookup is verified in PostgreSQL integration tests with mocked HTTP; browser tests do not make outbound provider requests. The isolated packaged browser process must have sending configuration placeholders but no running worker or dispatch mode, so queued synthetic repeats are never sent.

## Operational alerts

`e2e/operational-alerts.spec.ts` uses `OPS_ALERTS_E2E=1`, required administrator MFA and the isolated `jitm_design_*` database. It checks the actual acknowledgment form, unchanged critical state, stale evidence, permission/MFA denial, missing/stale monitor health and DOM/WCAG behavior at 320/1440 pixels in both themes. Synthetic observations do not send notices; keep the monitor and worker stopped, and keep capture off. CI includes it with the required-MFA staff flows.


`e2e/data-retention.spec.ts` uses `DATA_RETENTION_E2E=1`, required administrator MFA and the isolated `jitm_design_*` database. It checks missing/current/stale/failed cleanup checkpoints and private-data exclusion, live permission/MFA gates, support-policy visibility and actual case removal, expired invitation recovery omission and minimized provider-event displays. It uses DOM/axe checks at 320/1440 pixels in both themes with all capture off. Its cleanup calls never invoke the sending worker or release a wave. CI includes these cases in the required-MFA staff batch.

Support reply notifications now use the existing worker with an encrypted outbox, stable retry keys, receipt recovery, and explicit reviewed replacements. See [Support email operations](SUPPORT_EMAIL_OPERATIONS.md). The capture-free packaged browser suite is `SUPPORT_EMAIL_E2E=1` with `e2e/support-email.spec.ts`; run it with administrator MFA and matching sender/encryption configuration in runner and server.
