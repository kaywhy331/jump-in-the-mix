# Recover the first onboarding save — 2026-10-04

Status: draft PR #116; not merged or deployed. The original local qualification is retained below; see the exact-head CI correction addendum. Base: `edaf12f9afbbef027e16f10f8b47d68768c9c864`. Branch: `fix/onboarding-save-retry-20261004`.

## Problem and resulting behavior

VERIFIED-RUNTIME: submitting the same first-person onboarding request twice on the unchanged base created two contacts, two saved dates and two Mix assignments. A response lost after the first commit therefore left the owner with an unsafe retry. This is the historical ONB-09 risk; it is separate from the two unreproduced PR115 browser flakes.

The mounted one-person form now keeps one request identifier. Its authenticated workspace and member scope an existing `IdempotencyKey` receipt. The first successful transaction saves the starter, person, date, assignment, profile changes and receipt together. Concurrent submissions serialize on the existing workspace-row lock and recheck the receipt before writing. Starter creation uses that same transaction; its other callers take the same lock.

A retry recovers the original person and Mix and reruns the existing idempotent preparation step if it was interrupted after commit. It does not apply later edits under the original request identifier. Review confirmation and writable-session checks still run before replay. A removed or archived person opens Contacts; an inactive assignment or archived Mix opens Today without reactivation. Completed and skipped occurrences remain settled. Opening **Run setup again** mounts a fresh form and permits an intentional new person.

The existing `ActionForm` error presentation, focus behavior and saved-entry preservation are reused. No customer-facing wording, styles, layout or shared form component changed. The visual reference is the existing onboarding-card archetype; there is no dedicated onboarding export screen.

## Scope, rules and data impact

WF-01/04/05 with `jitm-feature`, `jitm-review` and `jitm-ui-change` for form behavior. Main rules: JITM-09 §2.20; JITM-11 §2.9–2.11, §2.17; JITM-12 §2.4–2.5, §2.9, §2.14, §2.21, §2.24; JITM-13 §2.1–2.2. The installed Next.js forms and error-handling guides were read before implementation.

The product fit is a reliable first prepared follow-up, even when the browser loses the save response. No schema, dependency, credentials, access policy, billing, automatic sending, invitation or production configuration changes are included. The existing receipt table stores only the saved contact and Mix identifiers, scoped to the workspace and member; the expiry follows the existing Add-contact seven-day contract. No contact notes, form contents or diagnostics are added to the receipt. Existing receipt cleanup remains unchanged. Requests without a request identifier keep the legacy server-action behavior; the current mounted form always supplies one. This does not promise replay protection after the receipt has been purged.

One pre-existing limitation is deliberately retained: a new request that assigns the same existing person to the same starter conflicts with the existing unique assignment key. The transaction rolls back without appending notes or another date. That is distinct from retrying the original request, which now succeeds. Changing intentional re-enrollment behavior is outside this repair.

## Verification

VERIFIED-RUNTIME against the original candidate a1dd086 five source/test files, with their hashes recorded before and after every check:

| Check | Result | Total elapsed |
|---|---|---|
| Focused PostgreSQL suite and existing contact/onboarding checks | 34 passed, no skips | 20 seconds |
| `npm run check` (generation, static checks, typecheck, unit/integration tests and production build) | Passed; 2,225 tests passed, 68 existing gated skips | 10m 54s |
| New browser recovery cases, desktop/mobile, repeated twice | 12 passed, no skips or flakes, retries zero | 1m 56s |
| Onboarding, recovery, feedback and existing core-page accessibility regression | 29 passed, one intentional mobile skip, no flakes, retries zero | 2m 45s |

The new PostgreSQL cases cover committed-save replay, concurrent saves and generated-occurrence counts, post-commit preparation failure, existing-person notes, workspace/member isolation, review and writable-session guards, removed/archived people, inactive assignments, archived Mixes, and DONE/SKIPPED history. The retained fresh-request assignment conflict is separately asserted to roll back.

The browser cases deliberately lose a request before commit and a response after commit. They verify preserved entries, focused error feedback, keyboard retry, exactly one contact/date/assignment/receipt, the prepared follow-up, a local private feedback conversation, and intentional setup for a second person. Axe reports no violations in the onboarding card in either theme; 200% text retains horizontal fit and a 44px-or-larger action. Four final light/dark desktop/mobile captures were visually inspected: the existing alert wraps without overlap or horizontal clipping. These are scoped checks, not a full accessibility certification. The tablet-profile accessibility test intentionally skips the mobile project; its desktop invocation passed. The aggregate's 68 gated skips are not counted as passes.

All 824 production-build input hashes matched the candidate after the checks. The five protected worktrees retained their initial heads, branches and dirty-status hashes. The fixture PostgreSQL server, test browsers/server and three owned Claude review processes exited; the station's heavy-workload lock was free. Private logs, request/session metadata and fictional-data captures remain outside the commit.

The baseline duplicate failure, a pre-transfer broad run, and the initial aggregate TypeScript failure are retained. The broad run used unchanged product source because a Windows command-length error prevented the patch transfer; it is not candidate evidence. The new fixture's preparation assertions were also corrected to use a date inside the scheduler's horizon. The first aggregate run stopped on an optional-argument type error in the new test; the corrected assertion still requires the exact saved contact on both generation calls. No product assertion, timeout or quality budget was weakened.

Independent review used actual installed Claude Code 2.1.289 with requested and provider-reported `claude-sonnet-5-5`, low effort, read-only and bounded. The first complete review found no confirmed implementation defect and requested stronger tests for concurrent generated occurrences, archived/inactive records and unconditional skipped-history coverage. Those tests were added without changing the reviewed production source. The independent closeout verdict was **Approve**, with nothing above LOW. Its browser-locator uncertainty was subsequently resolved by the passing browser runs. Slow-database timing remains unmeasured; no timeout was increased.

Both completed reviews exited zero after one provider turn each. Their combined CLI list-price estimate was $0.297542; actual billing is unknown. A prior design-only review was interrupted at its one-turn output limit and is not counted as a completed approval; its final usage and cost are unknown. Codex implemented the candidate and ran its checks; it is not represented as Claude implementation.

## Limits and publication

NOT RUN: live authenticated account acceptance, controlled inbox delivery, physical iPhone/Android/native-app handoff, automatic messages or invitations, paid services, production mutations, deployment. Publication subsequently created draft PR #116. Local tests use fictional accounts on a disposable loopback `jitm_design_*` database with external browser/server requests blocked. Existing internal workers and protected worktrees were preserved, and only one heavy workload ran on the station.

NOT RUN: the complete browser suite, full-app accessibility, public Lighthouse, image builds, live load qualification and migration/restore rehearsals. The browser checks are scoped to onboarding, recovery, feedback and the existing core-page accessibility suite; there are no public-page, schema, dependency, infrastructure or worker-code changes. Existing installed dependencies were reused under the task's no-install instruction.

This is one verified readiness improvement, not clearance to admit all 10–20 testers. Live login/device/inbox acceptance and the existing operational/support-owner decisions remain separate. Kevin subsequently authorized publication and deployment through the existing release workflow after exact-head CI and independent review. Draft PR #116 is published; merge and deployment remain gated on that evidence. No separate backup or rollback gate was introduced.

## Exact-head CI fixture correction - 2026-10-04

FAILED-CI: original candidate `a1dd086` in [PR #116](https://github.com/kaywhy331/jump-in-the-mix/pull/116), [CI run 37220011666](https://github.com/kaywhy331/jump-in-the-mix/actions/runs/37220011666), passed aggregate checks/build and failed **Seed browser-test workspaces** before browser testing. The new integration fixture created the system follow-up date type with a random identifier. Its unique system/slug key prevented the shipped catalog's duplicate-skipping insertion of `system_follow_up`; the seed's stable-ID lookup then failed with Prisma P2025.

VERIFIED-RUNTIME: the original test on a fresh disposable PostgreSQL database reproduced the same failure: migrations and 34 focused tests passed, then the actual browser seed failed. The correction uses the shipped `system_follow_up` identifier when the fixture inserts this entry and only reactivates an existing entry. No production source, schema, CI configuration, assertion, timeout or retry changed.

VERIFIED-RUNTIME: the corrected fixture passed migrations, all 34 focused tests and the actual browser seed in 24.014 seconds, exit zero, on another fresh disposable database. Source hashes stayed unchanged during the run. All 824 production-build input hashes still match the original reviewed implementation. Both outcomes are retained; the failure was not hidden by rerunning unchanged CI.

Independent native Claude Code 2.1.289 follow-up review requested and received `claude-opus-5-5`, low effort, bounded and read-only. Verdict: **Approve**, exit zero. The reviewer assessed the exact corrected test plus catalog and seed dependencies; it did not execute the coordinator's checks. The original full-source Sonnet and Opus approvals remain applicable to unchanged production code. Exact corrected-head GitHub CI is still pending at this commit; no merge or deployment completion is claimed.
