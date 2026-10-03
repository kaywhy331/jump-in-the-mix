# Local account-flow mail capture — 2026-10-01

Application candidate: `6f23e4359355c4a54c633b1aff5c7e1c2e2999bf`. This follow-up changes tests and documentation only. No production mail or authentication code is changed.

## What the repository supports

VERIFIED-CODE: `transactional-email.ts` has a fixed HTTPS Resend endpoint, with no SMTP/sink endpoint override. Development auth pages expose development links, but the packaged production app intentionally does not. Hosted signup requires configured transactional mail even when the general email-verification environment flag is false. The earlier two registration failures were therefore expected in the deliberately mail-free packaged app.

Existing integration tests (`auth-abuse.integration.test.ts`, `email-controls.integration.test.ts`) replace global fetch. The new opt-in `auth-mail-capture.integration.test.ts` reuses that approach to join the real account actions and verification route into one database-backed sequence. A test-only server startup hook was considered but not introduced: the existing integration boundary gives a smaller, immediately verifiable path without production hooks.

## Executed bounded check

PASS — VERIFIED-RUNTIME: 1 integration test, approximately 5.6 seconds total. The test claims a synthetic invitation; creates an unverified account; refuses login before verification; captures and replaces a verification link; rejects the obsolete link; verifies through the real route; checks repeat-link behavior and secure/HttpOnly/Lax cookie options; signs out and in; captures a password-reset link; resets once; invalidates existing sessions; rejects reset reuse and the old password; signs in with the new password; and captures the password-change notice.

The first attempt failed because the test expected `/login` after logout; current code redirects to `/signed-out`. Correcting that assertion made the test pass. Both logs remain private under `.artifacts/tester-readiness/` (`auth-mail-capture-first-attempt.log`, `auth-mail-capture.log`). No product fix was needed.

The transport never calls original fetch. It accepts only the existing mail POST shape, a fixed dummy key and the one generated `jitm-mail-…@example.test` recipient, then returns a synthetic provider ID. All other fetches fail closed. Four messages were captured only in memory. Token links were consumed from those captured messages, not manufactured from database hashes; they were not printed or saved. The test uses production-mode auth branches, leaves email verification required, and verifies the cookie options without weakening them. Next request/cookie/redirect boundaries and worker wake-up are mocked, as in existing integration tests.

Execution requires explicit opt-in, a parsed loopback PostgreSQL URL with a `jitm_design_*` name and no query/fragment override, and billing/automatic customer email both false. Cleanup scopes accounts, workspaces, invitations, tokens, mail ledgers and rate-limit keys to this test's synthetic identifiers. No roles, grants, real accounts or persistent provider credentials are created.

```sh
# Use the existing disposable local environment; never point this at production.
LOCAL_AUTH_MAIL_CAPTURE=1 npx vitest run tests/auth-mail-capture.integration.test.ts --maxWorkers=1
```

## What remains unproven

This is not a browser or inbox-delivery pass. NOT RUN: this complete account sequence through the packaged app's browser forms, HTTP origin checks and actual browser cookie storage; external provider acceptance/webhooks; inbox/spam placement; physical-device email-link navigation; true provider errors. Heavy build/browser/typecheck work remains deferred while Yoink owns the Trix window. Vitest compiled and executed the new test; a final full typecheck of the test addition is deferred.

For a later coordinated browser pass, use a test-only transport interception restricted to the synthetic loopback server and synthetic recipients, with capture disabled and all external networking blocked. Do not add a production mail bypass, disable verification, change secure cookie policy, or set PILOT_MODE to make tests pass. Such a browser harness is NOT implemented or qualified here.

## Read-only live observation

At the recorded check timestamp, `2026-10-01T23:39:34Z`, public GETs returned: `/api/health/live` 200/ok; `/api/health/ready` 200/ready, database ready, configuration valid, standard deployment; `/api/health/worker` 200/ready; `/register` 200 with invitation-only entry. Source inspection confirms these health endpoints perform bounded reads, not migrations or customer writes. This is one observation, not the three-pass release preflight.

NOT RUN: authenticated admission limits/reservations/pause settings, Render service revision/auto-deploy verification, explicit live billing flags, recipient mail health and support ownership. No authenticated Render tool or inherited API credential was available in this task; no secrets were searched for or printed. Public readiness is not proof of those details.

Standards: WF-01/07, JITM-12 §2.1, §2.13, §2.19–2.25; JITM-14 §2.11 and §2.29; JITM-15 records. Kevin's forwarded instruction explicitly authorizes this local synthetic test and public read-only checks, while reserving all external writes.
