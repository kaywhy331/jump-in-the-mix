# First 10–20 testers — admission and triage

Prepared 2026-10-01 UTC. **Draft only: no invitations sent, people enrolled, limits changed or permissions granted.** Dates below are proposed gates, not promised readiness dates.

## Before the first invitation

1. Review and accept the isolated candidate, then separately authorize any merge/release. Record the actual deployed revision when that happens.
2. Have an existing authorized operator verify current Render readiness, worker freshness, database schema, mail health, support inbox owner, admission limits/reservations and pause controls. Confirm billing and automatic customer email remain off. This task did not inspect or change those live settings.
3. Complete one controlled-inbox single-use invitation → signup → verification → login → logout → password reset round trip. Check spam, expired/reused links, and the public support fallback. No customer inboxes or real tester accounts are needed for this gate.
4. Complete the same first-person/first-follow-up loop on physical iPhone Safari and Android Chrome: keyboard, microphone allow/deny, text/email/call handoff, returning without sending, explicit completion, Undo, 200% text and light/dark. Opening another app must never count as sent.
5. Name a support owner and backup. Resolve every P0/P1, review the remaining P2s, and assign a next review time. Verify an issue can reach the private queue and be found by its reference. Do not add staff access as part of this checklist.

Use current JITM-09 and actual saved admission settings. Do not change account-and-reservation capacity just to fit a target number, assume that a paused wave stops every invitation path, or assume an old invitation expired. Three lifetime personal member invitations cannot cover a planned 10–20-person cohort; staff-managed confirmed waitlist admission needs its own existing authorization and capacity review. No invitation link is generated in this document.

## Dated finish-line milestones

| Target date (UTC) | Finish line | Evidence required / gate |
|---|---|---|
| 2026-10-01 | Isolated implementation and bounded local audit ready for review | Candidate source, actual pass/fail/not-run record and screenshots |
| 2026-10-02 | First-batch authorization decision | Controlled-inbox round trip, physical-device matrix, current operational/admission checks, named support coverage; all P0/P1 closed |
| 2026-10-03, conditional | First five testers admitted by the authorized operator | Each can enter, add one person, prepare a follow-up and report feedback; no live action is authorized by this document |
| 2026-10-05, conditional | Expand to ten | At least 24 hours of observed first-batch use, zero unresolved P0/P1, backlog reviewed, worker/email/capacity still healthy |
| 2026-10-07, conditional | Expand toward twenty | At least 48 hours of observed ten-person use, no new P0/P1, every report assigned, support workload and hosting headroom accepted by owner |

If a gate is unmet, move the date; do not relax the gate or claim completion. Billing activation remains a separate project with L4/L5 resolution and provider/concurrency qualification.

## What to ask each tester to try

- Sign in and add one test person you control. Keep private customer information out of bug reports.
- Prepare one follow-up, edit the wording, and inspect the handoff. Sending is optional and remains your choice in your own app. Return and record the actual outcome; try Undo.
- Use Help → Share feedback for anything confusing or broken. Basic diagnostics are optional and visible before submission. Check the cleaned preview and remove names, addresses or business details yourself.

## Unsent invitation draft

Subject: Try Jump in the Mix with us

Hi [first name],

Would you try Jump in the Mix and tell us what feels useful or confusing? Start with one person and one follow-up. You review the wording and send it from your own text or email app.

Your invitation: [single-use access link supplied by the authorized operator]

Free beta. No card required. Once you're in, Help → Share feedback keeps questions and replies together. Please leave private customer details out of reports.

Thanks,
Kevin

Before sending: verify the free-beta/no-card statements against the actual live state, match the recipient to the authorized invitation, test the support destination, and approve the final copy. Never paste live access tokens into a ticket, spreadsheet or project report. This draft is not a bulk-send instruction or an enrollment authorization.

## Lean triage

Use existing private support conversations and their references. Record a short internal entry with reference, category, severity, impact, reproducible steps, expected/actual result, coarse environment, candidate/deployed revision, owner, next action and retest result. The ticket creation time supplies the report timestamp; request an approximate occurrence time if needed. Request only the missing detail. Do not request raw cookies, tokens, exports, contact lists or unsanitized screenshots.

| Severity | Examples | Internal action |
|---|---|---|
| P0 | Cross-workspace exposure, lost data, unintended send/charge | Stop the next admission batch; notify the existing owner through the approved channel; preserve sanitized evidence and investigate before retrying |
| P1 | Cannot enter/recover account, save the first person, prepare/review a follow-up, or submit feedback | Block expansion; assign owner and reproduce on the tested revision; fix and retest before further admission |
| P2 | Repeated confusion or a broken secondary action with a usable workaround | Record workaround and fix date; owner explicitly accepts any carryover into the next batch |
| P3 | Cosmetic spacing or wording that does not block work | Group duplicates and review after the first cohort |

Check the queue at least once each working day during the pilot and before every new batch. These are proposed internal operating targets, not public response-time commitments. Reply through the existing conversation; distinguish acknowledged, reproduced, fixed in candidate, deployed, and tester-confirmed. Never tell a tester a candidate fix is live before a deployment receipt exists.

NOT RUN: every live operational/admission action, actual invitation, inbox delivery, real enrollment and outgoing support communication described above.
