# Remaining UI/UX qualification

Nine findings require observations that automated engineering checks cannot supply. They remain unchecked in the implementation checklist. PUBLIC-05 is complete following the owner's September 18 review of the presented claims, with no wording changes requested. The engineering release does not claim product-readiness signoff or measured customer outcomes.

The September 18 continuation prepared an executable [session runbook](QUALIFICATION_RUNBOOK.md) for the original ten findings and a [claim-by-claim owner review](CLAIM_REVIEW.md). Participant/device sessions remain pending. The subsequent [authorized implementation report](AUTHORIZED_FOLLOWUP.md) records the receipt-recovery correction and additional provider evidence.

| Finding | Required evidence | Suggested owner |
| --- | --- | --- |
| HOME-02 | Moderated task: explain the demo and access-request choices before choosing. Record observed confusion and revisions. | Product/research |
| DEMO-03 | Participants distinguish opening, sending, recording an outcome and skipping without coaching. | Product/research |
| PRO-05 | Profession-specific task completion and comprehension sessions using the roadmap recruitment criteria. | Product/research |
| NAV-05 | Physical iPhone/Android voice and device-contact capture; permission denial, cancellation, refresh and retained typed text. | Device QA |
| SEND-05 | Physical text/email/WhatsApp/telephone handoff, cancellation, interrupted return, and explicit sent/not-yet outcomes using controlled recipients. | Device QA |
| REVIEW-05 | Recipient can explain where private feedback goes and that the public-review link is optional at every rating. | Product/research |
| NOTIFY-05 | Authorized controlled-recipient reminder tests with actual receipt times, configured timezone/quiet hours, opt-out and failure feedback. | Delivery owner |
| EMAIL-05 | Correlate the staff UI and controlled inbox with provider receipts; exercise an eligible recovery through the staff UI. Actual provider simulator events, identical-key retry, and receipt validation now supplement the passing integration tests. A simulator is not an observed inbox or completed staff session. | Delivery/operations owner |
| RECOVER-05 | Manual screen-reader, keyboard, 200% zoom/reflow, interruption and physical-device checks, with any blockers repaired and retested. | Accessibility/device QA |

For each session, record: date, reviewer, device/OS/browser or assistive technology, test account, exact task, observed result, safe evidence reference and retest outcome. Do not place customer content, credentials, invitation tokens or recovery codes in this report.

The designated staging site also needs its existing Neon quota restored, or an explicitly authorized replacement test database. The current provider quota blocker is separate from the customer site's database. No billing upgrade or database substitution is included in this release.
