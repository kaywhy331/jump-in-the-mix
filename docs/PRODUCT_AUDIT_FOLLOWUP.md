# Product audit follow-up

The resumed handoff described the audit at `e08e1d3`. The actual checkout was clean at `2fddfc2`, with the audit already committed and five subsequent remediation commits. The original report remains historical evidence, rather than a list of currently open defects.

## Work already present

| Commit | Implemented work |
| --- | --- |
| `cc76f1b` | Business settings, message fallbacks, timezone display, recovery, vertical plans, and phone workflows |
| `c8c3668` | Installable app and scheduled reminders |
| `54215f2` | Hosted sign-in and account data controls |
| `793b091` | Opt-in delivery and customer review/referral flows |
| `2fddfc2` | Dormant-feature retirement, hosted deployment configuration, product documentation, and release checks |

These commits establish the current implementation; they do not establish that a hosted deployment or real-device qualification has taken place.

## Additional first-use defect fixed

Onboarding collected a follow-up reason but selected the starter plan only from the business type. A home-services owner choosing the default **“Follow up about an estimate”** received **“thanks for trusting … today. Is everything working the way you expected?”**

The selected reason now determines the starter message: estimate, completed job, review request, or reconnect. The plan retains the selected business type. Onboarding offsets start on the chosen follow-up date; for example, the estimate text runs on that date and the follow-up call five days later. Library templates retain their original offsets relative to the event date. Previously created plans are not rewritten.

The browser regression checks message meaning, signature, resolved placeholders, a usable text-composer link, normalized international phone data, the chosen date, and Chicago time display. It runs on desktop and mobile. The strengthened assertion failed against the previous production build with the exact incorrect thank-you message above.

## Verification

Validation uses synthetic accounts in an isolated PostgreSQL 16 cluster and the production Next.js build. Provider credentials are absent and `CI=true` uses the repository's test configuration; this does not validate hosted provider configuration or delivery.

| Check | Result |
| --- | --- |
| Prisma schema, source syntax, and import/Server Action boundaries | Passed |
| TypeScript and production build after the fix | Passed |
| Full unit/integration suite after the fix | 242 passed across 61 files |
| Greenfield and populated migration, core rollback/reapply, admin, MFA, and worker-heartbeat rehearsals | Passed |
| Existing desktop/mobile browser suite, including automated accessibility checks | 41 passed, 33 intentional skips |
| Strengthened onboarding regression against the rebuilt app | 2 passed: desktop and mobile |
| Encrypted backup, separate-database restore, and restored-data smoke | Passed |
| Production dependency audit | Zero vulnerabilities reported |
| Mobile Lighthouse budgets on the rebuilt landing/sign-in pages | Passed; performance 99/87, accessibility 100/100, best practices 93/100 |

Local verification logs are in the ignored `.artifacts/audit-followup/` directory. The browser suite's skips include viewport-specific cases and staging-only checks; skipped tests are not counted as passing. The temporary test database server was stopped after verification.

## Remaining release work

Configure the hosted environment and verify actual Google/Apple sign-in, email verification/recovery and inbox delivery, Web Push, and any enabled Twilio delivery using [Hosted deployment](HOSTED_DEPLOYMENT.md). Complete the physical iPhone/Android checks in [Manual device qualification](MANUAL_DEVICE_QUALIFICATION.md). Local Chromium emulation cannot qualify native composers, OS permissions, or carrier delivery. Production container images were not built during this continuation.
