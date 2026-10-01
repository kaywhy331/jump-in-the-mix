# Evidence index — tester readiness, 2026-10-01

Base `6cf9ad635622`; isolated branch `feat/tester-readiness-20261001`. All dates UTC. Raw local logs and captures remain private in `.artifacts/tester-readiness/`; only sanitized synthetic screenshots selected after inspection belong in this folder.

| Check | Result | Private log |
|---|---|---|
| Locked dependency installation | PASS; `npm ci --ignore-scripts --no-audit --no-fund`, then explicit Prisma generation | `npm-ci.log` |
| Prisma generation | PASS; 73 migrations, 117 models | initial checkpoint output |
| Fresh disposable migration deploy and release verification | PASS; ready, missing 0, mismatched 0 | `migrations.log`, `schema-check.log` |
| Initial focused tests | PASS, 19 tests / 3 files | `feedback-tests.log` |
| Initial typecheck | PASS | `typecheck.log` |
| Production build | PASS; after final navigation fix | `build-nav-fix.log` |
| Initial feedback browser run | PASS, 4 tests; then copy/layout refined from screenshot review | `feedback-browser.log` |
| Broad journey attempt with absent mail | 13 PASS, 2 FAIL, 1 interrupted, 24 NOT RUN; unchanged signup guard requires mail configuration | `journey-browser.log` |
| Mail-free journey batch | PASS, 30; desktop/mobile feedback, recovery fallback, onboarding, channel variants, selected mocked voice cases | `journey-mailfree-browser.log` |
| Contact/login selection | PASS, 11; 7 explicitly skipped by device-specific tests | `contacts-login-browser.log` |
| Initial stronger view-only assertion | FAIL, second Nav still rendered Quick Add; 3 NOT RUN and one non-test error after early stop | `permissions-empty-browser.log` |
| Corrected navigation + feedback + empty-state browser checks | PASS — VERIFIED-RUNTIME: 8 desktop/mobile checks passed (audited view-only support, feedback submission/layout, empty Today) | `permissions-feedback-final.log` |
| Final focused unit/integration tests | PASS — 69 tests across 11 files | `final-focused-tests.log` |
| Billing-off selected plan-limit test | PASS — VERIFIED-RUNTIME: 1 selected billing-off test passed; 4 billing-on cases intentionally skipped; billing-on cases intentionally excluded | `billing-off-test.log` |
| Static validation | PASS — schema, syntax (711 files) and import/Server Action boundary (645 files) checks | `static-checks.log` |
| Final typecheck | PASS — final candidate tsc --noEmit completed successfully | `typecheck-final.log` |

Browser runs used one worker against the local packaged production build. No external mail credentials were set, no worker was started, billing and automatic customer email were false. `next start` was used for the initial four feedback checks and warned about standalone output; subsequent suites used `.next/standalone/server.js` with copied public/static assets.

Commands: existing `playwright.config.ts`; targeted files and filters are recorded below; logs retain actual results. Final focused Vitest selection: support-report, support-report-actions, support-boundary, support-service.integration, contact-custom-fields, contact-quick-add.integration, auth-security, auth-abuse, route-authorization, account-deletion-action, account-deletion-guard. Plan test filter: `counts everyone and skips no one while billing is off`. Static command: `npm run validate:static`. Browser groups and exact exclusions are summarized in the main audit, not represented as the full suite.

Screenshot matrix: light/dark at 320, 390, 767, 768, 900, 901, 1280, 1440. Agent inspected 390 and 1440 in both themes. Visual reference: JITM-07 §2.10 reading/detail archetype and existing semantic design controls; Help has no dedicated export screen. Observed: compact selectors, readable one-column phone form, no horizontal overflow, no clipped labels, retained privacy disclosure, consistent input/voice type. An opted-in diagnostic snapshot is displayed explicitly; it is not a raw browser log. Selected captures hold synthetic content only.

NOT RUN: full check/e2e/a11y/drift/Lighthouse/load/recovery rehearsals, physical devices, real OAuth/inbox delivery, billing-on risks, production release and mutation. Skips and interrupted cases do not count as passes.


## Reproduction commands

Use the repository's existing local synthetic database setup, billing and automatic email off, external provider credentials absent, and a loopback standalone server. No live database may be used. Browser projects below are `desktop-chromium` and `mobile-chromium`; every run used `--workers=1`.

```sh
npm run build
npx playwright test e2e/tester-feedback.spec.ts e2e/tester-recovery.spec.ts e2e/registration.spec.ts e2e/onboarding-one-person-first.spec.ts e2e/channel-variants.spec.ts --project=desktop-chromium --project=mobile-chromium --workers=1
VOICE_E2E=1 npx playwright test e2e/tester-feedback.spec.ts e2e/tester-recovery.spec.ts e2e/onboarding-one-person-first.spec.ts e2e/channel-variants.spec.ts e2e/voice-capture.spec.ts --project=desktop-chromium --project=mobile-chromium --workers=1 --max-failures=2 --grep-invert 'Today speaks|voice capture and its review|briefing uses'
npx playwright test e2e/core-flows.spec.ts e2e/core-ux-friction.spec.ts e2e/contact-lifecycle-management.spec.ts e2e/ui-ux-public-auth.spec.ts --project=desktop-chromium --project=mobile-chromium --workers=1 --max-failures=2 --grep 'primary discovery|sign-in preserves|Quick Add carries|Contact selection|mobile Today|Contact state|Undo after archiving|Phone search'
SUPPORT_CASES_E2E=1 npx playwright test e2e/support-cases.spec.ts e2e/tester-feedback.spec.ts --project=desktop-chromium --project=mobile-chromium --workers=1 --max-failures=1 --grep 'support assigns a case|empty Today|a tester reviews|feedback fields'
npx vitest run tests/support-report.test.ts tests/support-report-actions.test.ts tests/support-boundary.test.ts tests/support-service.integration.test.ts tests/contact-custom-fields.test.ts tests/contact-quick-add.integration.test.ts tests/auth-security.test.ts tests/auth-abuse.test.ts tests/route-authorization.test.ts tests/account-deletion-action.test.ts tests/account-deletion-guard.test.ts --maxWorkers=1
npx vitest run tests/plan-limits.integration.test.ts --maxWorkers=1 -t 'counts everyone and skips no one while billing is off'
npm run validate:static
npm run typecheck
```

The broad registration attempt above intentionally does not have a passing result in the mail-free environment. Do not rerun against production or add provider credentials without separate authorization. The compatible batch preceded the added empty-state case; the final 8-check run includes it and the final navigation correction.

Selected final synthetic captures: [phone light](captures/feedback-light-390.png), [phone dark](captures/feedback-dark-390.png), [desktop light](captures/feedback-light-1440.png), [desktop dark](captures/feedback-dark-1440.png).
