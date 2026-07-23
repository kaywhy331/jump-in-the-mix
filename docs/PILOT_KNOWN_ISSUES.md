# Pilot known issues and enrollment blockers

This file records confirmed limitations for `v0.1.0-rc.2`. It does not list speculative defects, and it does not convert an unperformed test into a pass.

## Enrollment blockers

| ID | Confirmed condition | Classification | Required resolution |
| --- | --- | --- | --- |
| GATE-001 | The owner-license field was supplied as a placeholder; no license is selected and no `LICENSE` file exists. | Enrollment blocker | Owner selects exactly one of proprietary, MIT, or Apache-2.0; focused license PR is approved and merged. |
| GATE-002 | No iPhone model, iOS version, or Safari version was supplied or detected. Physical iPhone qualification was not performed. | Enrollment blocker | Run and record the complete iPhone Safari matrix on a physical device. |
| GATE-003 | No Android model, Android version, or Chrome version was supplied or detected. Physical Android qualification was not performed. | Enrollment blocker | Run and record the complete Android Chrome matrix on a physical device. |
| GATE-004 | The required basic screen-reader and manual accessibility passes were not performed. | Enrollment blocker | Record VoiceOver or TalkBack plus keyboard, zoom, reduced-motion, forced-colors, focus, errors, and overflow checks. |
| GATE-005 | No private product-feedback destination was supplied or configured. | Enrollment blocker | Owner configures and tests a private email, form, repository, or issue tracker. |
| GATE-006 | No actual two-to-five-person cohort was supplied. Planning slots exist, but zero people are identified or invited. | Enrollment blocker | Assign pseudonymous participant IDs and complete the cohort record without Contact data. |

## Accepted release-candidate limitations

| ID | Limitation | Operational treatment |
| --- | --- | --- |
| LIMIT-001 | Pilot hosting is local/self-hosted and loopback-bound by default. | Do not expose it publicly without a separately qualified TLS and access-control boundary. |
| LIMIT-002 | Backup copies are local unless the owner manually places an encrypted copy on a second controlled storage location. | Do not claim offsite backup or disaster-recovery certification. |
| LIMIT-003 | No email provider is included for password recovery. | Preserve an authenticated session and use in-account password controls during the pilot. |
| LIMIT-004 | This is a release candidate, not a generally production-certified release. | Restrict use to the approved small private pilot after all enrollment gates pass. |

## Current defect disposition

No physical-device or manual-accessibility defect result exists because those tests were not run. Therefore the absence of a recorded P0, P1, or P2 is not evidence of a pass.

The exact-main automated CI, Docker, and Security runs passed at `e08e1d35a197f9c13d12e44f492c30637457c098`. The workstation replay also produced a successful encrypted backup and separate-database restore rehearsal on July 23, 2026. Those results do not waive the enrollment blockers above.
