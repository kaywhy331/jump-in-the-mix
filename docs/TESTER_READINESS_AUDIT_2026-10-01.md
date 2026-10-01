# Tester readiness audit — 2026-10-01

## Verdict and scope

**A locally verified candidate is prepared; invitations are not yet cleared.** This audit supports admitting the first 10–20 testers in small, gated batches. It is not a production qualification, a load qualification, or a claim that every screen is polished.

Base: fresh `origin/main` at `6cf9ad6356226a99667d7aac980f969408660283`. Branch: `feat/tester-readiness-20261001`. The clean October 1 release checkout and the original checkout with 484 dirty entries were preserved. Two existing Codex processes used the original checkout; they were neither contacted nor directed. Implementation and all test writes used the isolated task worktree and a disposable loopback `jitm_design_*` database.

WF-01/02/03/04/05/07; skills: `jitm-audit`, `jitm-ui-change`, `jitm-copy`, `jitm-feature`, `jitm-review`. Main rules: JITM-00 §2.3–2.10; JITM-06 §2; JITM-07 §2.10; JITM-08 §2.6, §2.21, §2.24; JITM-09 §2.15–2.20, §2.63–2.64; JITM-11 §2.38, §2.42; JITM-12 §2.1, §2.13, §2.21, §2.24. Help follows the existing reading/detail archetype; no dedicated Help mockup exists. Interface wording remains short; no marketing outcome claims were added.

Kevin's October 1 task authorizes isolated feedback capture and narrow readiness fixes. It forbids production deployment/mutations, real invitations or enrollment, billing activation, credential or permission changes, and external-agent direction. No such action was performed. No database roles or permissions were altered. Billing and automatic customer email remained off in the local runtime; provider credentials were absent. Production configuration was not read or changed.

## Concrete acceptance checklist

PASS/FAIL describes a result; VERIFIED/INFERRED/NOT RUN/BLOCKED describes evidence. Local browser emulation is separate from physical devices.

| Acceptance criterion | Result and evidence | Remaining gate |
|---|---|---|
| Work is isolated from active changes | PASS — VERIFIED-CODE: verified base, separate branch/worktree; release tree clean and original dirty count preserved | Review/merge and deployment are separate authorized tasks |
| Schema matches candidate | PASS — VERIFIED-RUNTIME: all 73 migrations applied only to the disposable database; verifier returned ready, missing 0, mismatched 0 | Production migration state was not reverified |
| Production build compiles | PASS — VERIFIED-RUNTIME: final build including the navigation correction | Full release gate is not represented by this targeted check |
| Invitation entry and bad links behave safely | PASS — VERIFIED-RUNTIME: existing public registration layout and invalid-link tests passed before the incompatible cases; public GETs to home/login/register returned 200 | Live version and admission configuration are NOT RUN |
| Invited signup reaches verification and a real inbox | BLOCKED — two existing registration cases FAIL with mail credentials intentionally absent; server says account verification is unavailable | Controlled-inbox signup/verification before any tester invitation |
| Login retains intended route; validation preserves email and clears password | PASS — VERIFIED-RUNTIME: desktop/mobile sign-in regression checks | Real OAuth providers are NOT RUN |
| Recovery failure offers a useful path | PASS — VERIFIED-RUNTIME: desktop/mobile tests for unavailable reset email, incomplete reset link, public support link, and corrected data/privacy link | Actual email receipt and end-to-end recovery remain NOT RUN |
| First user reaches a prepared first follow-up | PASS — VERIFIED-RUNTIME: all seven one-person onboarding scenarios on desktop/mobile, including account/device timezone mismatch and 320px at 200% text | Real-device validation remains |
| Quick Add supports typing and optional voice | PASS — VERIFIED-RUNTIME: recognized name/email/phone flows; mocked dictation, microphone errors, unsupported speech and blocked storage | Physical microphone permission and dictation are NOT RUN |
| Contacts can be searched, archived, restored, and reviewed for duplicates | PASS — VERIFIED-RUNTIME: selected desktop lifecycle checks and phone-number search; discovery on both projects | Full mobile lifecycle was skipped by existing suite design |
| Mixes/Beats support channel wording and safe handoff | PASS — VERIFIED-RUNTIME: desktop/mobile authoring, text/email/call switching, private-note exclusion, draft persistence, handoff freezing and single completion | Actual SMS/mail/call apps and return behavior on devices are NOT RUN |
| Existing contact custom-field tokens render unchanged | PASS — VERIFIED-RUNTIME: four existing custom-field tests passed; report redaction preserves the canonical token shape | No custom-field implementation was edited; canonical shape remains `{{contact.custom.policy_number}}` |
| Feedback is easy to find and reaches a private conversation | PASS — VERIFIED-RUNTIME: desktop/mobile new-report submission and conversation lookup | Actual support notification delivery/triage coverage is NOT RUN |
| Diagnostics and report redaction are bounded | PASS — VERIFIED-RUNTIME: allowlist/adversarial unit tests and browser redaction preview; tenant and rate-limit checks retained | Redaction is best effort: names, addresses and business details still require review |
| Empty Today offers a working next action | PASS — VERIFIED-RUNTIME: desktop/mobile empty Today links open Add a contact | Broader empty/error-state inventory remains incomplete |
| View-only support contains no dead Quick Add control and blocks changes | PASS — VERIFIED-RUNTIME: 8 desktop/mobile checks passed (audited view-only support, feedback submission/layout, empty Today) | Full permission suite and restricted runtime-role qualification are NOT RUN |
| Feedback fits mobile/desktop, keyboard and enlarged text | PASS — VERIFIED-RUNTIME: 320/390/767/768/900/901/1280/1440 widths, both themes, automated accessibility within the form, 44px control heights, keyboard traversal, 200% text; screenshots inspected at 390/1440 in both themes | Full-app accessibility and physical-device review remain |
| Billing remains off | PASS for local configuration and PASS — VERIFIED-RUNTIME: 1 selected billing-off test passed; 4 billing-on cases intentionally skipped; VERIFIED-CODE default-off gate | Live flag/secrets state NOT RUN; L4/L5 remain activation gates |
| Hosting safely supports 10–20 testers | NOT RUN — targeted functional tests are not a concurrency or load test | Observe worker/readiness, capacity and service headroom before scaling beyond the first small batch |

## Findings and fixes

| ID | Rule | Finding / disposition | Evidence | Severity |
|---|---|---|---|---|
| T-01 | JITM-09 §2.63; JITM-11 §2.42 | Help's existing support flow lacked useful coarse diagnostics and a cleaned-report preview. Implemented opt-in allowlisted context, common sensitive-text redaction on new reports, and a direct feedback link. | VERIFIED-CODE/RUNTIME: `SupportContext`, `SupportReportFields`, `support-report`, focused action tests, browser submission | MEDIUM, addressed in candidate |
| T-02 | JITM-08 §2.24 | Attached context could satisfy the minimum description length. Validate actual report text before appending diagnostics. | VERIFIED-RUNTIME: empty body plus valid context is rejected before persistence | MEDIUM, addressed |
| T-03 | JITM-08 §2.6; JITM-09 §2.64 | View-only sessions rendered Quick Add without its dialog. Both navigation instances now receive the view-only rule. | First strengthened browser check failed on the second instance; final result: PASS — VERIFIED-RUNTIME: 8 desktop/mobile checks passed (audited view-only support, feedback submission/layout, empty Today) | MEDIUM, addressed |
| T-04 | JITM-09 §2.63 | Public support copy sent people to Settings for data controls. It now links to `/account?section=privacy`; signed-in help also links directly to the support form. | VERIFIED-RUNTIME: recovery fallback browser checks | LOW, addressed |
| T-05 | JITM-12 §2.6, §2.21 | Signup/inbox delivery and physical-device journeys are not qualified in this mail-free emulator run. | BLOCKED / NOT RUN; no real mail credentials or devices used | HIGH launch gates, not asserted production failures |
| T-06 | JITM-08 §2.21 | Retention/support boilerplate dominated the phone form. Moved unchanged details into the shared Replies and privacy disclosure. | VERIFIED-VISUAL: both themes at 390 and 1440; existing semantic tokens and controls | LOW, addressed |

## L4 and L5 recheck

**L4 — workflow-only over-limit admission:** VERIFIED-CODE, impact INFERRED, billing-on runtime NOT RUN. `plan-limits.ts:71` records active workflow instances with `mixId: null`; line 107 creates limit stops only for entries with a Mix ID. `jump-engine.ts:211` discovers global settlement workspaces through active assignments. `mix-workflow.ts` reserves capacity for explicit starts but its existing workflow-advance path does not independently check `PlanPerson` membership. The workflow-only/unseated repair path remains a billing activation concern. This task did not turn billing on to reproduce it. It does not establish an over-limit defect while billing is off, when limits deliberately do not apply.

**L5 — simultaneous last-owner deletion:** VERIFIED-CODE, billing-side-effect impact INFERRED, provider/concurrency reproduction NOT RUN. `account-deletion-actions.ts:45–47` checks the last-owner rule and closes billing before `deleteAccountData` acquires the staff lock and rechecks the rule (`account-deletion.ts:67,76`). Two callers could pass the initial check before the serialized deletion rejects one, after both billing calls. The database's last-owner guard remains present; it is not evidence that both owners can be deleted. Treat the external billing sequencing as an activation gate. No Stripe call, billing activation or production deletion was performed.

Do not interpret either finding as a reason to enable billing for this beta. Any future billing work needs focused isolated concurrency tests and review.

## Evidence and honest limits

The [evidence index](tester-readiness-audit-2026-10-01/README.md) records commands, counts and failures. The [admission and triage plan](tester-readiness-audit-2026-10-01/INVITATIONS_AND_TRIAGE.md) contains unsent drafts, admission gates and dated milestones.

The first broad browser batch ended with **13 passed, 2 failed, 1 interrupted, 24 not run**. Both failures were the unchanged hosted signup guard rejecting absent mail configuration (`auth-actions.ts:145–146`). The runner was gracefully stopped; these failures are retained and are not relabeled as passes. A subsequent compatible batch passed 30 tests. Contact/login selection passed 11, skipped 7. A stricter view-only regression test then exposed the second Nav instance; it was corrected and rerun. Final result: PASS — VERIFIED-RUNTIME: 8 desktop/mobile checks passed (audited view-only support, feedback submission/layout, empty Today).

The passing journey log also contains a rate-limit write-conflict message. VERIFIED-CODE: `rate-limit.ts:31–42,49–100` explicitly retries that conflict up to three times. The associated browser test passed. Next.js also logged a destination-stream-closed message during navigations; its independent cause was not investigated. Neither message is erased from the logs or represented as a clean server-log qualification.

No local restricted database role was created because the task forbids role/permission changes. Tests use the existing local setup; least-privilege production runtime qualification therefore remains NOT RUN. No baseline production rebuild was needed for a claimed new product regression: mail failures were configuration-bound, while the new permission assertion directly identified the incomplete task change. This is not a complete baseline comparison of every suite.

## Documentation disagreements and gaps

- Older admission/waitlist operations text still describes five personal invitations and capacity treatment that disagree with current JITM-09 §2.17–2.18 and `invitation-allowance`/`admission` code. Follow current rules: three lifetime member invitations, no refund on revoke, manual native sharing today, and member grants excluded from outstanding email-wave reservation capacity. Staff invitation batches are separately governed. Do not copy the stale numbers into invitations.
- Earlier release reports (including the reported 25/25 smoke result) are historical evidence, not a fresh qualification of this candidate.
- This task defines proposed batch sizes and internal triage targets, not a new product access policy or public response-time promise.
- No new unresolved product decision is needed for the implemented candidate. Root/owner still decide the live admission schedule, named support owner, and a later release authorization.

## Review scores and disposition

Targeted candidate review (0–3): constitution 3; concept 3; copy/vocabulary 2; design/layout 2; interaction/workflows 2; accessibility 2; engineering 2; testing/evidence 2; isolation/conduct 3. **Disposition: candidate for review; launch blocked on the explicit operational/device/inbox gates.** Scores describe this scoped review and do not rate the entire product.

## NOT READ / NOT RUN

NOT READ: production secrets, customer workspace data, private inboxes, local memory databases, external-agent conversations. NOT RUN: production mutations, invitations, email delivery, billing activation/provider calls, full `npm run check`, full browser/a11y suites, full drift-baseline remeasurement, load qualification, migration/restore rehearsals beyond fresh local deploy, Lighthouse, physical iOS/Android/native apps, real OAuth, full signup/verification/reset delivery, restricted runtime-role tests, production release/deployment/merge. Targeted checks are deliberately bounded under JITM-12 §2.13.


## Follow-up after the initial candidate

The original results above remain the dated application-candidate record. A later lightweight check passed the complete server-side account sequence with in-memory mail capture; public live/ready/worker GETs also returned 200. This does not convert the original browser failures into passes or prove inbox delivery. See [mail-capture follow-up](TESTER_MAIL_CAPTURE_2026-10-01.md) and [next approval bundle](TESTER_APPROVAL_BUNDLE_2026-10-01.md). Heavy browser/build work was deferred while the shared host was assigned elsewhere.
