# Qualification sessions for the remaining findings

Prepared September 18, 2026; updated after owner review and the [authorized follow-up](AUTHORIZED_FOLLOWUP.md). PUBLIC-05 is complete in the separate owner review record. Nine findings remain open; this worksheet records no passed participant, physical-device, accessibility or controlled-inbox session. Current production revision: `8520b73cc41d72c40ecec1ca06ca752fd95ce5d5`.

Use the [remaining-finding register](REMAINING_QUALIFICATION.md) and preserve the original [acceptance criteria](IMPLEMENTATION_CHECKLIST.md). Record results against the exact deployed revision. Any defect found needs a fix, regression check, deployment and a repeat of the failed task before closing its finding.

## Session record

Copy this record for each participant or test configuration. Use anonymous participant/account aliases and private evidence references; omit addresses, contact content, tokens and recovery codes.

| Field | To complete during the session |
| --- | --- |
| Finding(s), date and reviewer | NOT RUN |
| Target URL and deployed revision | NOT RUN |
| Participant/account alias | NOT RUN |
| Device model, OS, browser and assistive technology versions | NOT RUN |
| Exact task and starting state | NOT RUN |
| Observation, elapsed time and assistance needed | NOT RUN |
| Result | NOT RUN / PASS / FAIL / BLOCKED |
| Safe evidence reference and defect reference | NOT RUN |
| Retest date, revision and outcome | NOT RUN |

The designated test site is `https://jump-in-the-mix-test.netlify.app/`, site `8fd20ccd-5c35-47e5-99ce-98e5670d52fe`. Its login/readiness outage was reconfirmed during this continuation. Authenticated staging sessions are blocked until its database is available. Do not use real customer accounts or silently replace the test database with production. Public production demo sessions can proceed without signing in or submitting a waitlist request.

## HOME-02, DEMO-03 and PRO-05: observed comprehension

Recruit by working behavior, using the [roadmap](../HOMEPAGE_EXPERIENCE_ROADMAP_2026-09-10.md), the [reference index](../../assets/README.md), and the relevant fictional ICP as a hypothesis. Do not use the personas' invented ages, incomes or quotations as research evidence or recruitment requirements. Obtain participant consent and keep the moderator's answers out of the initial task.

| Profession / route | Behavior to establish before the session | Task situation |
| --- | --- | --- |
| Real estate / `/for/real-estate-agents` | Personally manages client relationships and future check-ins | A client wants to reconnect at an agreed later time. |
| Consulting / `/for/consultants` | Personally balances current delivery with future-client conversations | Continue a conversation after a handover. |
| Photography / `/for/photographers` | Personally handles inquiries and project communication | Revisit an unfinished pricing conversation. |
| Contracting / `/for/contractors` | Personally manages estimates amid work-site interruptions | Follow up on an open estimate. |
| Recruiting / `/for/independent-recruiters` | Personally maintains hiring-manager and candidate relationships between searches | Respect someone's stated timing when there is no active role. |

1. **HOME-02:** Show the initial page. Ask, “What can you do from here, and what do you expect each main action to do?” Record the answer before any click. Then ask the participant to explore an example and explain how they would request access. Pass only when the participant distinguishes the fictional practice task from the waitlist/confirmation/invitation path without coaching.
2. **DEMO-03:** Ask the participant to revise a draft, preview it, record a next step, and try leaving another step for later. Ask what happened after each action and whether anyone received a message. Record whether they distinguish a preview or app opening, a real send, recording an outcome, and skipping. The public sandbox must not be described as having sent a real message.
3. **PRO-05:** Start on the relevant profession page and give the task situation above. Record completion time, unprompted explanation of the product, access expectations, an appropriate real use case, channel mismatch, and duplicate-entry objections. Record any assumptions that the app replaces transaction management, project delivery, quoting or an ATS.

The roadmap requires five suitable real-estate participants and five consultants, then at least five in each other profession. Apply its P1 criteria: at least four of five in each group identify follow-up software, finish the sandbox without coaching within two minutes, explain confirmation followed by invitation, and describe an appropriate real situation. Every participant must understand that the sandbox sent no real message. Any sending misconception requires revision and retest. These are usability gates, not measured conversion gains or validated market demand. Keep HOME-02's acquisition-choice and DEMO-03's action-distinction observations separately visible in the record.

## PUBLIC-05: owner factual review

Use the [claim review worksheet](CLAIM_REVIEW.md). For every row, record the owner's name, date, accepted wording or correction, and supporting business/provider evidence. Source checks and page availability do not approve pricing policy, retention practices, support commitments or current provider configuration. Apply corrections and recheck every affected page before closing PUBLIC-05.

## NAV-05 and SEND-05: physical devices

Use a physical iPhone/Safari and Android/Chrome with isolated test accounts and controlled recipients. Record OS/browser versions and run the detailed [manual device worksheet](../MANUAL_DEVICE_QUALIFICATION.md). Browser emulation and mocked permission APIs do not replace these rows.

| Finding | Required task | Expected observation |
| --- | --- | --- |
| NAV-05 | Start Quick Add with typed text. Try dictation; allow, deny, stop, interrupt and return. Reload the relevant draft state. | Existing typing is not lost; recognized text is reviewable; denial/cancellation has a usable typing fallback; canceled recording cannot later modify another form or account. Record refresh behavior at each point, rather than assuming every form persists a draft. |
| NAV-05 | Try device-contact selection where supported; select, cancel and deny access. Repeat in an unsupported browser. | Only selected contacts are processed; cancellation does not create a contact; denial and unsupported devices offer the manual/import path; existing manual entries survive. |
| SEND-05 | Prepare distinct text, email, WhatsApp and call follow-ups. Open each native app, verify recipient and draft, cancel and return. Then repeat an explicitly authorized send/call to the controlled recipient. | Opening is not recorded as a send; cancellation leaves an honest pending/not-sent outcome; explicit outcome recording is correct; private notes stay out of text/email; no duplicated completion. |
| SEND-05 | Interrupt after the handoff, background/close the browser, then return. Open two different follow-ups before recording either. | Each return/outcome remains attached to the correct person and prepared message. Missing handoff context is disclosed. |

No native sends or calls are authorized merely by preparing this worksheet. Record the controlled recipient's authorization before an actual communication.

## REVIEW-05: recipient comprehension

Use isolated review requests for each rating from one through five. Before submission, ask the participant who will receive the rating/comment and whether it will be published. After submission, ask which next actions are available and required. Observe their answer without explaining the labels first. Check that private feedback goes to the business and that the public-review action, where configured, remains optional at every rating. Record confusion, including an assumption that a business response is guaranteed, and retest any correction. Do not publish a test review to a real public review service.

## NOTIFY-05 and EMAIL-05: controlled delivery

Prerequisites: an explicitly authorized inbox/device, an isolated account, healthy database/worker, the actual provider, and a reviewer who can confirm receipt. The original continuation sent no messages. The owner subsequently authorized implementation and testing; the authorized follow-up used Resend's documented simulator recipients. A real controlled inbox/device and its reviewer are still needed for observed receipt.

1. Record the saved timezone, notification preferences, digest hour, applicable quiet hours, clock in UTC and local time, and initial worker health. Record the device's notification permission, Focus/Do Not Disturb and installed-app state for push.
2. Use the app's test reminder and device-test controls. Record request time, UI wording, provider acceptance/event reference and actual inbox/device receipt time separately. Acceptance is not evidence of inbox or on-device receipt.
3. Exercise a scheduled reminder at the configured hour, grouped due-item push, quiet-hours suppression and resumption, and opt-out before the next eligible attempt. Email summaries use their selected digest hour; scheduled push uses quiet hours. Compare the observed behavior with the settings' stated contract. A test button alone does not qualify background scheduling.
4. Record failure feedback through a safe, isolated provider test scenario. Check disabled/expired notification permission and that the UI does not report successful receipt after a failed attempt.
5. For EMAIL-05, correlate the app email-history status with the provider's receipt/event and the controlled inbox. Exercise an eligible recovery through the existing staff UI, preserving its original message/idempotency identity and retry deadline. Do not manufacture an ambiguous delivery in a customer record, clear a suppression, or retry an already accepted message simply to create evidence. When no safe case is available, record BLOCKED.
6. Confirm the intended recipient received exactly one message for the recovery case. Record both the immediate result and the provider/worker's next processing pass; an HTTP success alone does not demonstrate absence of duplicates. If a second message or uncertain state appears, stop the retry and investigate before continuing.
7. Restore test preferences, remove only the session's temporary fixtures/subscription, and record cleanup. Keep receipt evidence private and redact message bodies and recipient details from this report.

## RECOVER-05: accessibility and interruption

Complete the existing manual worksheet on physical devices and desktop assistive technology. Include VoiceOver/Safari, TalkBack/Chrome and an available desktop screen reader, recording versions and any unavailable configurations. Cover the demo, sign-in/recovery, contact capture/edit, prepared message and return tray, settings save/errors and account dialogs.

Use keyboard alone to enter, operate and exit each control/dialog; verify visible focus and its return after dismissal. With the screen reader, verify labels, selected state, error association, loading/result announcements and route changes. At actual 200% browser zoom, check navigation, forms, notices, dialogs and sticky controls; include the worksheet's 400% reflow rows. CSS zoom or a narrow viewport does not certify actual browser zoom. Interrupt with transport loss, backgrounding, reload and same-account reauthentication while holding a draft, then test account changes without exposing the prior account's content. Repair and repeat any blocking case before signoff.

The automated results in the continuation report are supporting evidence only. The nine remaining findings stay `awaiting-qualification` until their observations and responsible reviewer decisions are recorded. PUBLIC-05 is complete following the dated owner review.
