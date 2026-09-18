# Remaining UI/UX qualification

These ten findings require observations or approval that automated engineering checks cannot supply. They remain unchecked in the implementation checklist. The engineering release does not claim product-readiness signoff or measured customer outcomes.

| Finding | Required evidence | Suggested owner |
| --- | --- | --- |
| HOME-02 | Moderated task: explain the demo and access-request choices before choosing. Record observed confusion and revisions. | Product/research |
| DEMO-03 | Participants distinguish opening, sending, recording an outcome and skipping without coaching. | Product/research |
| PRO-05 | Profession-specific task completion and comprehension sessions using the roadmap recruitment criteria. | Product/research |
| PUBLIC-05 | Dated factual review of access, free-account, sending, privacy and support claims against the running product and business policy. | Product/content owner |
| NAV-05 | Physical iPhone/Android voice and device-contact capture; permission denial, cancellation, refresh and retained typed text. | Device QA |
| SEND-05 | Physical text/email/WhatsApp/telephone handoff, cancellation, interrupted return, and explicit sent/not-yet outcomes using controlled recipients. | Device QA |
| REVIEW-05 | Recipient can explain where private feedback goes and that the public-review link is optional at every rating. | Product/research |
| NOTIFY-05 | Authorized controlled-recipient reminder tests with actual receipt times, configured timezone/quiet hours, opt-out and failure feedback. | Delivery owner |
| EMAIL-05 | Match the UI to actual provider receipts and exercise an authorized safe-retry recovery without duplicate delivery. Synthetic recovery tests already pass. | Delivery/operations owner |
| RECOVER-05 | Manual screen-reader, keyboard, 200% zoom/reflow, interruption and physical-device checks, with any blockers repaired and retested. | Accessibility/device QA |

For each session, record: date, reviewer, device/OS/browser or assistive technology, test account, exact task, observed result, safe evidence reference and retest outcome. Do not place customer content, credentials, invitation tokens or recovery codes in this report.

The designated staging site also needs its existing Neon quota restored, or an explicitly authorized replacement test database. The current provider quota blocker is separate from the customer site's database. No billing upgrade or database substitution is included in this release.
