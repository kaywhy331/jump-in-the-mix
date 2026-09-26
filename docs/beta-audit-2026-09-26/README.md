# Beta-readiness audit 2026-09-26: evidence

This folder supports [BETA_READINESS_AUDIT_2026-09-26.md](../BETA_READINESS_AUDIT_2026-09-26.md). That document holds the verdict, the list of blockers, the status of the earlier audit's fixes and the launch checklist. Production commit audited: `4b5abd8`.

| Path | Contents |
|---|---|
| [FINDINGS_TABLE.md](FINDINGS_TABLE.md) | All 82 findings ranked by severity after reconciliation (4 BLOCKER, 6 HIGH, 40 MEDIUM, 32 LOW/PARKED). It gives full details for every BLOCKER and HIGH finding and for the lead's own runtime findings (RUN-01 to RUN-04, TEST-03), and records each severity change made during reconciliation. |
| [lanes/00-prior-audit-fixes.md](lanes/00-prior-audit-fixes.md) | Status of the 40 P0/P1 findings of the 2026-09-24 audit in `4b5abd8`, with evidence and guarding tests |
| [lanes/01-first-run-onboarding.md](lanes/01-first-run-onboarding.md) | Lane 1: first run and onboarding (ONB-*) |
| [lanes/02-core-daily-loop.md](lanes/02-core-daily-loop.md) | Lane 2: the core daily loop (LOOP-*) |
| [lanes/03-data-integrity.md](lanes/03-data-integrity.md) | Lane 3: data integrity and trust (DATA-*) |
| [lanes/04-security-privacy.md](lanes/04-security-privacy.md) | Lane 4: security and privacy (SEC-*), including the tenant-isolation sweep table |
| [lanes/05-email-messaging.md](lanes/05-email-messaging.md) | Lane 5: email and messaging (MSG-*), including verbatim DNS output |
| [lanes/06-reliability-free-plan.md](lanes/06-reliability-free-plan.md) | Lane 6: reliability on the free plan (REL-*) |
| [lanes/07-beta-operations.md](lanes/07-beta-operations.md) | Lane 7: beta operations (BOPS-*) |
| [lanes/08-design-a11y-copy.md](lanes/08-design-a11y-copy.md) | Lane 8: design, accessibility and copy (UX-*) |
| [lanes/09-test-suite-health.md](lanes/09-test-suite-health.md) | Lane 9: test suite health (TEST-*), written by the lead from the runs in `runtime/` |
| [runtime/](runtime/) | Command outputs: validation, typecheck, vitest, build, backup/restore rehearsal, npm audit, production GET checks, the production build-identity check, the client-bundle secret scan and the GitHub CI state |
| [runtime/walkthroughs/](runtime/walkthroughs/) | Logs of the scripted browser walkthroughs and probes against the packaged production build. Each step prints the page outline (headings, notices, fields, buttons, links), and database queries show what was created. |
| [runtime/e2e/](runtime/e2e/) | Playwright batch summaries for each CI group |
| [captures/](captures/) | Screenshots named `<walkthrough>-<step>-<width>-<theme>`. The `m-*` files come from the 12-screen × 4-width × 2-theme matrix. |

**How the lane reports relate to the table.**
- The lane reports are the raw output of the read-only lane reviewers, kept as written.
- Severities and labels in [FINDINGS_TABLE.md](FINDINGS_TABLE.md) are the reconciled ones and take precedence where they differ.
- Where the lead reproduced a lane finding in a running build, the table's label says "VERIFIED (runtime)" and links the walkthrough log.

**Labels.**
- VERIFIED: run or read, with the evidence cited.
- INFERRED: reasoned from code, not observed in a running app.
- NOT RUN: not checked; the reason is given.
