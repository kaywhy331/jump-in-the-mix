# Private pilot feedback workflow

This workflow separates private pilot support from public project discussion. It applies to `v0.1.0-rc.2` and later immutable pilot candidates.

## Private reporting destination

**Status: NOT CONFIGURED — ENROLLMENT BLOCKER**

Before inviting anyone, the pilot owner must insert and test one access-controlled destination:

- private email address, or
- private form with restricted responses, or
- private repository, or
- private issue tracker.

The destination must be shared directly with participants, not committed here if doing so would expose a private address or access token. The pilot coordinator must record where the private destination is maintained and confirm a test report can be received and answered.

Security vulnerabilities should use GitHub private vulnerability reporting when available. Product feedback containing private relationship data must never use a public GitHub issue. A fully sanitized public issue may be used only when the reporter is certain it contains no personal or confidential data.

## Privacy rule

Do not submit Contact names, phone numbers, email addresses, Customer Notes, Private Relationship Updates, prepared messages, call details, imported-file content, exports, databases, backups, credentials, or screenshots/recordings containing that information.

Use invented data in reproduction steps. Crop or redact evidence before sending it, and verify the redaction cannot be reversed. When safe redaction is not possible, describe the interface state without attaching evidence.

## Intake record

Capture:

- participant pseudonym
- release tag
- device model and OS version
- browser and version
- date and tester/reporter
- task attempted
- expected result
- actual result
- exact reproduction steps
- number of taps, screens, or corrections
- confusing wording
- whether search, filter, scroll, form, or workflow context was lost
- severity
- sanitized screenshot or recording reference, when permission was granted
- permission to follow up
- workaround, when one exists

Do not put the participant's Contact data in the intake record.

## Severity and response

- **P0:** security issue, data loss, corruption, or unusable application. Stop affected pilot use, preserve sanitized evidence, and begin a focused hotfix immediately.
- **P1:** a core pilot task is blocked. Pause affected onboarding or workflow until a focused fix is validated and released.
- **P2:** material friction with a practical workaround. Record the workaround and obtain explicit owner acceptance or schedule a focused fix.
- **P3:** cosmetic, wording, or minor spacing issue. Record it for later prioritization.

For a P0 or P1, record exact steps and sanitized evidence, branch from `main`, add a regression test where practical, and require CI, Docker, and Security success. Distribute only under a new immutable RC tag with backup and upgrade notes. Never move `v0.1.0-rc.2`.

## Operational measurements

Track only:

- time to first Contact
- time to first Important Date
- time to first generated Jump
- time to first completed Jump
- completed Jumps per active week
- Quick Add correction count
- Contact-search zero-result count
- Mix creation abandonment
- import failure count
- unnecessary tap or screen count
- terminology confusion count
- device-specific defect count by severity

Record duration and counts against a participant pseudonym. Do not copy application content into the measurement log, and do not add product telemetry merely to collect these pilot measurements.

## Follow-up and closure

Record whether the participant permits follow-up and the status of each report. Close a report only after the participant confirms the fix or the coordinator verifies it on the same class of device. Keep reports access-controlled and delete private evidence according to the agreed retention period.
