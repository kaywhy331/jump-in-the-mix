# Beta blockers release — September 26, 2026

Live at **https://jumpinthemix.com/** as of 2026-09-26 22:03 UTC. This release fixes the four blockers found by the [beta-readiness audit](BETA_READINESS_AUDIT_2026-09-26.md) of production `4b5abd8`. It is code-only: no migration and no configuration change. It was merged to `main` as PR #84, so `main` and production are now the same commit.

The audit's recommended defaults were adopted for the owner decisions it raised:
- automatic customer email is off for the beta;
- a "next follow-up" is exactly one follow-up at the chosen day and time;
- a finished follow-up never comes back;
- ticket alerts go to the support inbox;
- `/privacy` is reworded rather than a consent choice being added.

| Release | Value |
| --- | --- |
| Previous production commit | `4b5abd867eb015bc0293fe55922674025d0c0bd0` (audit leftovers, untagged) |
| Application commit | `b6b9575b9daea525046a0a7097206cd35bc5d23b` (merge of PR #84 into `main`; tag `prod-2026-09-26-b6b9575`) |
| Worker deploy | `dep-das3vl97lnhs73fh43j0`, live 2026-09-26 21:58:58 UTC |
| Web deploy | `dep-das40dt9fdbs73boq750`, live 2026-09-26 22:03:14 UTC, build `1cNyk3RBdiAFc9rtjDTpu` |
| Final check | 2026-09-26 22:05:28 UTC |

## What changed

| Finding | Change |
| --- | --- |
| LOOP-01 | These now create exactly one follow-up at the chosen time, outside every plan (`src/lib/one-time-follow-up.ts`, shared with Quick Add):<br>• "Schedule the next follow-up"<br>• "Rescheduled"<br>• "Save & schedule follow-up" when no plan is chosen<br>The confirmation names that time. "Add to a mix" asks for a start date. A date-triggered plan gets that date when the person has none, and a finished plan restarts from it. |
| DATA-01 | Generated follow-ups record their occurrence. An occurrence with a DONE or SKIPPED row is settled, so these no longer re-create it as pending:<br>• a weekend-rule, time-zone, quiet-hour or working-hour change;<br>• a change to a Beat's day or time.<br>Rows written before this release are matched by their original local date. |
| MSG-01, SEC-02 | Automatic customer email requires `AUTOMATIC_CUSTOMER_EMAIL=true`, which production does not set. Settings shows Email as "Not available yet", and the worker ignores an earlier email opt-in. The FAQ and `/privacy` say automatic sending is off during the beta. `/privacy` describes support sessions as the code grants them: only while handling an open ticket from the customer, and recorded. |
| REL-01 | New tickets, customer replies and reopenings queue a worker job that emails the support inbox (`OPERATOR_ALERT_EMAIL`, else `PUBLIC_SUPPORT_EMAIL`). The email carries the reference, title and Admin link, not the message. `.github/workflows/production-smoke.yml` runs the read-only production smoke every hour; a failed run makes GitHub email the repository owner. |
| DATA-03 | An import row with an unreadable date is no longer rejected. Outlook's `0/0/00` is ignored; any other unreadable date is left out with a warning shown before queueing. |
| CI | Two fixture findings were added to `.gitleaksignore`:<br>• a test's synthetic rate-limit secret;<br>• the domain's public Yahoo DNS verification record quoted in the audit.<br>A delivery test no longer fails after 20:00 UTC. |

## Verification

- **Static checks:** typecheck and `validate:static` clean; `npm run build` passed.
- **Vitest (CI on `18dcfbd`):** all tests passed, and the production build and browser-test seed steps succeeded.
  - The new `tests/beta-follow-up-loop.test.ts` covers each entry point and each setting.
  - Its DATA-01 cases fail on the previous engine and pass on this one.
- **Playwright:**
  - Run on TrixBot against a fresh, seeded database with CI's environment (desktop, phone, MFA and staff groups): 623 passed, 9 failed.
  - 7 of the 9 were fixed (`6e44ff8`) or passed on rerun.
  - The 2 left are `journey-connections:310` and `onboarding-invitations:60` (phone), both listed by the audit as test or CI-configuration problems.
  - CI's browser step still exceeds the job's 60-minute cap (audit PRO-F1). It was not waited for.

## Release

Released on 2026-09-26 between 21:57 and 22:06 UTC with the code-only pipeline (`.artifacts/market-live-20260924/bfix-*.mjs`). Every step passed on the first run:
- **Preflight:** read-only.
- **Worker deploy:** with its queue probe.
- **Web deploy.**
- **Postflight:** 18 public checks; 206 release files and 20 served assets hashed identically on the live instance.
- **Live smoke:** 13 checks, synthetic data removed. New checks:
  - an outcome with a next follow-up created exactly one review-only follow-up at the chosen time and no saved date;
  - Settings shows automatic email as not available;
  - the FAQ and `/privacy` wording is live.
- **Final check:** record counts unchanged; no probe jobs, failed jobs or rate-limit blocks; health 200; both services on `b6b9575` with auto-deploy off.

## Not done here (owner steps from the audit, §9)

- Turn on Render failure notifications.
- Confirm that the support inbox receives the new ticket alerts. No real ticket was filed during the release, so the alert email is NOT RUN on production.
- Watch for the hourly smoke's first failure email.
- Complete the rest of the owner checklist:
  - the device pass and the Gmail/Outlook invitation;
  - pause weekly waves before raising limits;
  - the backup restore check;
  - MFA recovery codes;
  - the `security@` alias.

## Rollback

Deploy `4b5abd867eb015bc0293fe55922674025d0c0bd0` to the web service, then to the worker. Nothing needs reversing:
- the previous engine ignores the new `occurrenceKey` snapshot field;
- one-time follow-ups created meanwhile stay valid;
- a queued `support-operator-alert` job would fail as an unsupported task.
