# No Mix, visits and invitations implementation — October 17, 2026

Local candidate on `kaywhy331/dispatch-job_63d01ab935c4`, continuing `32e5181`. This is implementation and self-review evidence, not a release. No push, merge, deployment, publication, live-data change or customer message is authorized or performed. Final commit identity and private evidence hashes are in `.artifacts/jitm05-20261017/HANDOFF.md`.

## Authority and scope

VERIFIED-DOC: Hub task `job_63d01ab935c4`, Task `task_fcc1ec4a886c`, Dispatch `ctx_752d3a5dd762` match the live preflight and exact workspace `/home/trix/orca/workspaces/jump-in-the-mix/dispatch-job_63d01ab935c4`. Kevin's answer is recorded in Hub note `note_a3933cbd738654eb` and delivered as `relay_af0234373314`: “I will go off your recommendations for the questions”. The exact choices are now D125–D127 in [the owner decision log](standards-audit-2026-09-28/OWNER_DECISIONS.md#no-mix-visits-and-invitation-follow-ups--2026-10-17). D122–D124 were already allocated by open PR #155 at `5e7314d`; those IDs and that separate process amendment are preserved.

VERIFIED-CODE: `git ls-remote origin refs/heads/main` still reports `0a50aedcb752c61242c784696f5570d8083155ce`. Prerequisite `18e5d33065d1b7d35f06c4222be42aab2f37de7b` is imported as `6dd71a4`; all three files are identical and their SHA-256 values match the prerequisite handoff. The assigned retry explicitly resumes this existing isolated workspace, rather than resetting the dirty registered root. The supplied October 14 release record at `9510295` and [the prerequisite reconciliation](RELEASE_LEDGER_AUDIT_2026-10-15.md) were reread. Completed #157/#158 behavior is retained.

WF-01–WF-05 and WF-08 apply through `jitm-feature`, `jitm-ui-change`, `jitm-copy`, `jitm-review` and `jitm-standards-update`, with the requested Dee role and TokenPak workflow. The concept fit is that owners can find people needing attention, undo only their own start, and trust the resulting follow-up list (JITM-01 §2.1–§2.4; JITM-09 §2.76–§2.77). The engineering gates are tenancy, idempotent scheduling and settled history (JITM-00 §2.5–§2.7; JITM-11 §2.9–§2.17). The installed framework Server Action and browser-testing guides were read before code changes.

## Decisions and observable scenarios

| Choice | Governing rule | Observable scenario and implementation |
|---|---|---|
| Keep every filter | D125.1; JITM-09 §2.77 | No Mix count links and action returns retain search, tags and other filters; old notices do not return. Existing implementation retained. |
| Undo removes only its new saved date | D125.2; JITM-09 §2.77 | Starting a date-based Mix for someone without a date creates one; Undo removes it, while an existing or subsequently edited date stays. Existing behavior retained. |
| Changed starts and repeated Undo stay untouched | D125.3; JITM-09 §2.77 | Another tab changes the assignment or its Journey run; Undo leaves it. A second Undo does nothing. Older date runs no longer veto Undo of the new start. |
| Restore the earlier assignment and No Mix needed | D125.4; JITM-09 §2.77 | Undo of a restart restores the prior start and confirmation, while completed/skipped Beats remain history. Existing restoration retained. |
| Keep work supplied by other routes | D125.5; JITM-09 §2.77 | Bulk Add leaves tag, Everyone, visit or Journey work alone. Preparation can use another unchanged enrollment when two routes share a follow-up. |
| Wording matches start type | D125.6; JITM-04 §2.7–§2.8 | Manual starts explain restarting; saved-date starts explain date reuse; fixed-date starts say follow-ups are due. Profile and Today confirmations no longer claim the chosen start day controls a fixed-date Mix. |
| Count actionable waits | D125.7; JITM-09 §2.76 | Resumable paused connections count, removed connections and exhausted repeat paths do not. Existing status logic retained. |
| End this run's waiting Journey work | D125.8; JITM-09 §2.77 | Undo or Remove ends the root run's pending work and choices; settled history, older runs and already-started downstream work remain. Explicit later restart still works. |
| Preserve visit-only No Mix | D126; JITM-09 §2.76 | With no other qualifying work, Beats awaiting booking or a visit outcome leave the contact in No Mix. Paused Mix membership and D78 owner attention remain. No new visit-state policy is introduced. |
| Retain staff publication handoff | D127; JITM-09 §2.18–§2.19 | Preparing invitations creates Today reminders, never email delivery. TRU-09's saved wording publication remains Kevin's separately authorized staff action. |

The home standard is JITM-09, clarified to version 10.0.1. Historical records carry a decision-update banner; their prior failed attempts are retained. Dependent skills, workflows, router and PR template were reviewed: they already route these topics to these rules and need no changed instructions. No feature-map status changes.

## Repairs

VERIFIED-CODE: preparation now checks and locks the exact enrollment revision before creating/reopening a Journey admission and again before writing follow-ups. Undo and Remove acquire the enrollment lock before Journey records and Beats. If preparation commits first, the ending action cancels that work; if the ending action commits first, preparation sees a changed revision and writes nothing for it. Follow-ups shared by multiple enrollments retain any unchanged source. No schema or migration changed.

VERIFIED-CODE: a newly admitted or explicitly reopened Journey run records its source enrollment revision. Undo uses that ownership, with a creation-time fallback for pre-existing records without the field. Older date-based records cannot be canceled, and their old business updates cannot incorrectly block Undo of a new start. Linked Beats use the same scope. Remove intentionally retains its broader current-enrollment occurrence scope.

VERIFIED-CODE: interface text replaces “It goes out…” with “Follow-ups are due…”, including the bulk notice. A fixed-date profile/Today start returns its actual schedule type for its confirmation. Layout, shared components, tokens and behavior of Today reviews and the Profile rail are preserved. The earlier observation guard (`889d665`) and enlarged-text Close icon repair (`a1753bd`) remain in the candidate.

## Verification

Private logs, screenshots and diagnostic scripts are under `.artifacts/jitm05-20261017/`; the unchanged baseline build and earlier evidence remain under `.artifacts/jitm05-20261016/`. This is bounded local implementation evidence, not a full-green release gate.

VERIFIED-RUNTIME: offline dependency installation and client generation passed after the sandboxed install could not spawn esbuild. `npm run check` passed schema/static/import checks and typecheck; its test stage reported 2,455 passing, eight failing and 75 skipped tests (313 passing, three failing and nine skipped files), so it did not reach its build step. That run began before the final fixed-date return value and race repair. A separate final production build passed, including TypeScript.

VERIFIED-RUNTIME: five original regressions failed before the repair (`logs/undo-baseline-db.log`): old date-run ownership and Undo/Remove racing preparation. Expanded testing exposed a concurrent-admission unique-key race; the repair now uses database conflict handling inside the enrollment-locked transaction. The first full run also caught an unfinished fixed-date return and an incorrect new fixture expectation about paused visit-only work. The latter was corrected to preserve existing behavior; no visit-state change was made.

VERIFIED-RUNTIME: the remaining five appointment failures reproduce identically in two runs on each tree (`logs/appointment-{candidate,baseline}-{1,2}.log`). Four are the already-past fixed appointment fixture; one is `appointment-outcomes.test.ts:135`, where a relative date crosses the autumn timezone change and a hardcoded 29-hour interval becomes 28 hours. JITM-03 owns these clock fixtures. They do not block this scoped implementation, and no assertion was weakened.

VERIFIED-RUNTIME: the affected worker/import/No Mix batch reported 141 passes and two five-second timeouts while the build was also running (`logs/affected-final.log`). Both entire failing suites then passed twice in isolation on the candidate and twice on unchanged main: 15 import-recovery cases and five No Mix lifecycle cases each time (`logs/serial-*.log`). Host memory during the overlap was 517 MiB available with active swap; serial verification restored headroom. These are recorded as environmental load failures, not erased retries.

VERIFIED-RUNTIME: `npm run worker:qualify` passed all ten scenarios, including process death, import recovery, worker shutdown, connection-outage recovery, duplicate-worker execution and the real five-minute preparation interval (`logs/worker-qualify.log`, 380.49 seconds). The qualification created and dropped only its own disposable loopback database.

VERIFIED-RUNTIME: `npm run standards:check` retains the same two pre-existing Orca bootstrap conflicts: the required Orca preamble precedes the Next.js block and contains a home-relative path. The existing JITM-09 length warning remains. The protocol files are preserved and excluded from the candidate; the prior unchanged-main archive check passed. `git diff --check` passed. No checker was weakened.

VERIFIED-RUNTIME: the core browser batch ran both Chromium projects with zero retries: 46 passed, six intentional project-specific skips, and two failures in the newly authored fixed-date case (`logs/browser-core.log`). That new case incorrectly looked for the Today hint in the existing Profile sheet, where that hint is absent; the corrected test selects the exact Mix, submits it, and checks the actual fixed-date confirmation. It then passed on both desktop and mobile (two passes in `logs/browser-fixed.log`), with light/dark captures. No product behavior or assertion about the confirmation was relaxed. The same test checks the Today rendering of that receipt, and integration coverage checks the real Today action redirect.

VERIFIED-RUNTIME: all browser URLs were loopback `http://127.0.0.1:3126`, with synthetic `/contacts`, `/contacts/[id]`, `/jumps`, `/contacts/import` and invitation/setup routes. The first core run used the production `next start` entry; its standalone-configuration warning prompted switching subsequent checks to `.next/standalone/server.js` from the same build, with copied public/static assets. Both previews were bound only to loopback. The invitations case prepares three mixed-channel Today reminders and verifies zero queued emails; it does not send or publish them.

VERIFIED-RUNTIME: final focused validation passed 42 tests in four files, including all 12 new enrollment/fixed-date/visit cases (`logs/focused-final-2.log`). Final `validate:static` and `typecheck` both passed after the test additions (`logs/static-final.log`, `logs/typecheck-final.log`). The affected 16-file batch and its serial comparisons account for the existing No Mix action/lifecycle, Journey, worker and import coverage; skipped suites in the full run are not counted as passes.

VERIFIED-RUNTIME: the final standalone-browser observation batch passed 25 cases with three intentional project skips, zero failures and zero retries (`logs/browser-observations.log`). Preparation polling, Check again, unsaved draft/focus preservation, search pagination and import-state timing observations did not reproduce, matching the prior unchanged-main observation run; those flows needed no speculative repair. The Today confirmation/Profile layout subset passed six cases with two project skips and zero retries (`logs/browser-today.log`).

VERIFIED-RUNTIME: the visual harness passed 28 states at widths 320, 390, 767, 768, 834, 1194 and 1920, in both themes at normal and 200% text (`candidate-visual.json`, `logs/visual.log`, `captures/`). Close controls measured 48×44 pixels with zero icon-center offset, visible keyboard focus, working center hit targets and no horizontal overflow or page errors. The harness opens with Enter, verifies heading then Close focus, and closes with Enter while restoring the trigger; four selected enlarged-text axe states have no violations. Representative narrow/wide enlarged-text captures and fixed-date confirmations were inspected against the shared sheet archetype and the export's Review/DarkReview composition. The centered Close icon, readable wrapped confirmation and preserved profile/navigation structure match those references; full-page screenshots include content below the fixed viewport, while the sheet itself remains scrollable within it. Physical-device evidence is still excluded.

VERIFIED-RUNTIME: native Orca browser lookup for this exact workspace returned `browser_unavailable: Browser automation is unavailable on this host`. The installed guide was read first; installed local browser automation is the fallback. All database writes use loopback synthetic `jitm_design_*` fixtures, not production.

## Invitation publication handoff

VERIFIED-CODE/DOC: the allowance remains three lifetime personal invitations; the default wording says three, and rendering still accommodates an older saved version that says five. JITM-09 §2.19 makes the staff-published version authoritative. The [October 16 checkpoint](FOLLOWUP_RESOLUTION_CHECKPOINT_2026-10-16.md#invitation-wording-handoff) contains the review draft and publication sequence. D127 leaves those steps with Kevin: inspect the saved version in the staff console, review and publish an exact replacement with the existing permission/password/MFA gates, verify preview-version invalidation and frozen invitation compatibility, then qualify any later removal of the compatibility replacement. No live version ID or publication success is claimed. D26's future explicit email-send feature is not part of this task.

## Remaining work and dependent handoff

- JITM-03 owns the existing appointment-clock test repair and preparation/search/import CI stability. These are recorded, not changed here.
- JITM-06 owns physical-phone and assistive-technology qualification. Pass the final candidate and the screenshot/interaction receipt; browser emulation does not clear that gate.
- VIS-01's floating confirmation placement remains the existing LOW layout follow-up. This task preserves the completed Today redesign; a crowded-stack placement change needs its own scoped interaction coverage.
- Carry forward the earlier PAUSE-01(b), PLAN-01 and unrelated small layout findings as documented in [the No Mix release](NO_MIX_STATUS_RELEASE_2026-10-06.md#follow-ups). This bounded task does not execute the rest of the roadmap.
- Landing remains a separate owner-authorized task. There is no PR, push, merge, release or customer outreach from this dispatch.

## Acceptance and self-review

VERIFIED-CODE/DOC: every changed behavior is mapped to D125–D127 and a scenario above. The earlier eight defaults, visit alternatives and invitation publication choice are answered; no product-input gate remains for this local deliverable. Owner-reviewed outreach and the beta automatic-customer-email-off policy are preserved. Publication, deployment and physical-device qualification remain separate work.

Verdict: approve this scoped local candidate; this is not release qualification. Self-review under JITM-17 §2.12: constitution 3, concept 3, voice/copy 3, vocabulary 3, design system 3, layout 2, interaction 3, workflows 3, accessibility 2, engineering 3, testing/evidence 2, git/review 3, documents 3, agent conduct 3. Release and brand-identity changes are not applicable. This is the implementing worker's review, not independent QA. The completed Today and Profile redesigns were preserved.

| ID | Rule | Finding and evidence | Label | Severity | Direction |
|---|---|---|---|---|---|
| VIS-01 | JITM-07 §2; JITM-10 §2 | Existing floating confirmation stack covers two rows at 1920×1080; keyboard Undo works. The unchanged-main capture and measurements remain in `.artifacts/jitm05-20261016/baseline-floating-stack.json` and its linked capture. | VERIFIED-RUNTIME (prior attempt of this task) | LOW | Keep a separate scoped placement follow-up; do not reopen the completed redesign here. |

The five unchanged-main appointment failures and two bootstrap checker conflicts are explicitly retained above under JITM-12 §2.14–§2.15. They prevent a full-green claim, not acceptance of these locally verified repairs. The final private receipt binds the tested files and captures to the local commit.

## NOT RUN

Production deployment/smoke, Render actions, staff publication, real native message sending, physical devices and assistive technology, hosted CI/image builds, public Lighthouse, migration/restore rehearsals, load qualification, full gated packaged-server/staff/payment/provider suites, dependency audit and secret scan. These are excluded by the dispatch or unaffected by this candidate: there are no dependency, schema, infrastructure or publication changes. The 75 full-suite skips are not passes; exact local check results and limitations are recorded above and in the private receipt.
