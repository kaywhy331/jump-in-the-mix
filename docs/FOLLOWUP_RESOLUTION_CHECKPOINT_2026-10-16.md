# No Mix, visits and invitations checkpoint — October 16, 2026

Status: partial implementation; owner decisions and invitation publication remain unresolved. This is a local candidate, not a release. No merge, push, publication, customer message, production data change or provider configuration change was performed. The two code fixes are in `889d665` and `a1753bd`; the final receipt and file hashes are in the private `.artifacts/jitm05-20261016/HANDOFF.md`.

## Scope and authority

VERIFIED-DOC: this is Dispatch Hub JITM-05 (`job_63d01ab935c4`), Task `task_fcc1ec4a886c`, Dispatch `ctx_417479aaacc1`, in `/home/trix/orca/workspaces/jump-in-the-mix/dispatch-job_63d01ab935c4`, branch `kaywhy331/dispatch-job_63d01ab935c4`. The live preflight matched those identities. The existing Orca workspace is the task's isolated checkout; the dirty registered root was not edited.

VERIFIED-CODE: fresh `origin/main` is `0a50aedcb752c61242c784696f5570d8083155ce`. The prerequisite candidate `18e5d33065d1b7d35f06c4222be42aab2f37de7b` and its private handoff were present. All three reported SHA-256 values matched their committed files. Its documentation was cherry-picked as `6dd71a4` before implementation. See [the prerequisite reconciliation](RELEASE_LEDGER_AUDIT_2026-10-15.md). Existing Orca bootstrap changes to `AGENTS.md` and untracked instruction files were preserved and excluded from this candidate.

VERIFIED-DOC: the October 14 release note was read from the supplied `today-release-20261014` worktree and checked against [PR #159](https://github.com/kaywhy331/jump-in-the-mix/pull/159). The completed #157/#158 Today review, confirmation containment, invitation navigation and compact Profile work was preserved. The narrower open items are the [No Mix release follow-ups](NO_MIX_STATUS_RELEASE_2026-10-06.md#follow-ups), [October 14 LOW findings](TODAY_LAYOUT_FOLLOWUPS_2026-10-14.md), and [TRU-09 handoff](UX_FOLLOWUPS_RELEASE_2026-10-13.md#follow-ups).

WF-01, WF-02, WF-03, WF-04 and WF-05 use `jitm-ui-change`, `jitm-copy`, `jitm-feature` and `jitm-review`, with the Dee role in `orca-fleet` and the installed `orca-tokenpak` workflow. The governing rules are JITM-00 §2.3–§2.8, JITM-01 §2.10–§2.11, JITM-09 §2.17–§2.19 and §2.76–§2.77, JITM-06 §2.28–§2.30, JITM-08 §2.10–§2.15, JITM-10 §2.1–§2.4 and §2.9–§2.14, JITM-11 §2.16–§2.17, JITM-12 §2, JITM-13 §2.1–§2.2 and JITM-15 §2.8–§2.16. Installed framework CSS ordering and browser-testing guides were read before edits.

## Behavior, decisions and observable scenarios

| Behavior | Current authority | Observable scenario and disposition |
|---|---|---|
| No Mix can coexist with a one-time follow-up | D33/D44; JITM-05 §2.3, JITM-09 §2.76 | A contact has one promised follow-up and no ongoing Mix: still No Mix, with wording that only says no **Mix** will remind the owner. Preserved. |
| A paused Mix counts as In a Mix | D45; JITM-09 §2.76 | Pause and resume a Mix; held work keeps membership, and resuming after a No Mix needed confirmation makes that confirmation lapse. Preserved. |
| Bulk start and Undo | D46/D47; JITM-09 §2.77; unresolved details below | Select filtered contacts, start a Mix and Undo without losing the list context or settled history. Existing defaults are not relabeled as owner decisions. |
| REOPEN-01 | JITM-00 §2.6–§2.7; existing Remove/Undo contract in JITM-09 §2.77 | Remove a start, or Undo it, before a delayed Journey observation arrives. The ended run must remain canceled; a later explicit restart must still work. Fixed at the observation boundary. |
| Visit-only Mix membership | JITM-09 §6; D51/D78 do not settle membership | Once preparation ends, a contact whose only Beats await a visit can show No Mix. The existing integration case confirms that an account/Mix-wide preparation job does not count, whereas a person-specific start temporarily does. No semantic change was made. |
| Personal invitations | JITM-09 §2.17–§2.19; D26/D83, TRU-09 | Preview up to three invitations, add reminders to Today, then use the owner's own messaging app and record the outcome. Publication of a saved wording version is separate from preparing or sending an invitation. Preserved. |
| Close control at enlarged text | JITM-08 §2.10; JITM-10 §2.1/§2.3 | Open the No Mix sheet using the keyboard at 200% text. The icon remains centered in its existing target, above the 44 px minimum. Corrected in the existing shared header rule. |

## Local fixes

1. `src/lib/mix-workflow-engine.ts`: `observeWorkflow` ignores observations belonging to a canceled run. Previously, a delayed observation could turn a completed Beat into HELD and set that run ACTIVE again; it could also overwrite an ended pending Beat with a stale completion. Explicit restart reopens the run before new observations are admitted. The existing downstream run remains independent.
2. `tests/enrollment-workflow.test.ts`: deterministic regression cases cover both Remove and Undo, preserved settled history, explicit restart of the same occurrence, and continued updates to an already-started downstream run. The two new regression cases failed on unchanged main before the fix; the original failure log is retained.
3. `src/styles/design-details.css`: the existing four sheet/dialog header Close selectors center their SVG with flex alignment and zero padding. The existing target remains at least 44×44 (measured 48×44 on the No Mix sheet), with existing colors, focus styles and markup. The baseline icon was 20 px below center at 200% text, versus 1 px at normal text. No Today/Profile structure or confirmation placement was changed.

The design references are the supplied `Review`, `DarkReview`, `TabletTodayWide` and `DarkDesktopToday` screens. The existing generic sheet anatomy is retained for No Mix: heading, supporting text, circular Close control and phone grabber. Accessible larger text and 44 px targets take precedence over sample proportions (JITM-06 §2.5).

## Owner choices still needed

VERIFIED-DOC: JITM-09 §6 and the prerequisite still leave #125's eight defaults open; [the owner log](standards-audit-2026-09-28/OWNER_DECISIONS.md) does not record a later confirmation of them. D54–D60 settle #128's different defaults, and D102/D110 settle #134's. They must not be applied to #125 by analogy.

The existing coordinator question is `relay_65afcf4520fe`; the same question was resumed after timeouts, and escalation `relay_2a75f83815b1` recorded the missing input. No reply was received while independent validation completed, and no answer is inferred from a timeout. JITM-16 §2.16 and the dispatch's missing-input contract require this checkpoint rather than a new product decision.

For each row, A retains the current reading; B needs Kevin's stated replacement. Recommendation: A for the behavioral defaults, with truthful due-date wording reviewed separately in row 6.

| #125 default | A: current reading | B: decision to specify | Scenario affected |
|---|---|---|---|
| 1 | Preserve every filter in the No Mix count link | Keep only search/tag, or name another subset | Priority, contact permission and import filters must lead to the people counted. |
| 2 | Undo removes only the saved date that start created | Retain that newly created date | A date-based start supplies a missing date, then the owner undoes it. |
| 3 | Leave changed starts alone; repeat Undo does nothing | Name which later changes Undo may overwrite | Another tab changes the enrollment before Undo. |
| 4 | Restore the previous assignment and No Mix needed confirmation | End the enrollment instead | Restart a finished Mix, then Undo the restart. |
| 5 | Leave people with existing work in that Mix by another route alone | Specify when to create another run | A tag, visit or Journey already supplies the Mix. |
| 6 | Keep separate descriptions for manual, saved-date and fixed-date starts | Confirm revised wording | A fixed-date start must describe its own date, not imply app delivery. Proposed replacement for “It goes out” is “Follow-ups are due”; not applied. |
| 7 | Count actionable Journey waits, including paused connections that can resume | Exclude specified wait types | Removed connections and exhausted repeat limits do not count; resumable waits do. |
| 8 | End the removed/undone run's waiting Journey work, retaining settled history and downstream work | Retain specified decisions or paths | Remove while a decision is waiting, then deliberately start again later. |

Visit membership is a separate choice:

- **A — current behavior:** show No Mix when there is no prepared future work and only a visit or its outcome is awaited. Keep the existing owner-attention work under D78 separate.
- **B — proposed behavior:** count eligible visit-waiting enrollment as In a Mix, with actionable booking/outcome attention under D78. Before implementation, specify the result for an unbooked visit, a future booking, an overdue visit without an outcome, a canceled visit and a completed visit with no remaining Beats. Also specify stopped Mix, paused Mix and Do not contact precedence. Recommendation: B only after those eligibility rules are explicit.

No new status, automatic send, visit completion or delivery claim has been inferred.

## Invitation wording handoff

VERIFIED-CODE: `REFERRAL_INVITE_LIMIT` is 3; new default copy already says “three personal invitations.” The preserved migration baseline says “five,” and `renderSystemMix` replaces that phrase at render time. The staff-published version is still authoritative (JITM-09 §2.19). This task has no evidence of the current live version ID and makes no live-data claim.

TRU-09 therefore cannot be closed by deleting the replacement locally. A separately authorized staff action must inspect the current saved version, prepare and review its replacement, publish that exact version with the existing permission/password/MFA gates, and preserve prior frozen invitations. After publication and rollback compatibility are verified, a code task can consider removing the compatibility replacement. No migration or historical version should be rewritten.

Proposed review copy, not saved or published, applies the already-decided allowance and D85's business wording (JITM-04 §2.38):

> Subject: {{Sender Name}} invited you to Jump in the Mix
>
> Hi {{Contact Name}},
>
> I’m using Jump in the Mix to keep up with client follow-ups. It’s in free beta and invitation-only, and I’d like to share one of my three personal invitations with you.
>
> {{Sender Name}}

This is the owner's personal-wording register. The proof is the three-slot constant, closed-access workflow and beta policy; it claims no measured outcome or delivery. The application supplies the recipient-bound link and notice. Existing manual sharing and copying remain; D26's future explicit email-send feature is not implemented here.

## Reproduction results and remaining defects

| Observation | Evidence | Disposition |
|---|---|---|
| Close icon at 200% text | VERIFIED-RUNTIME: baseline `visual.ts` captured 28 states, both themes, 320/390/767/768/834/1194/1920 px at 100%/200%; 20 px vertical offset at doubled text. | Small local fix above; final candidate checks below. |
| Floating confirmation overlaps Today content | VERIFIED-RUNTIME: at 1920×1080, a 540×89 confirmation at x=690/y=967 overlapped two list rows; keyboard Undo restored the synthetic follow-up. Capture `baseline-floating-stack-1920.png`. | Existing LOW VIS-01 retained. A placement change needs coverage of crowded stacks, next-step questions, open reviews and short viewports; no placement change is claimed. |
| Preparation polling, ready-made search and contact-import timing | VERIFIED-RUNTIME: the three unchanged specs on the baseline passed 25 cases with three project-specific skips and zero retries. Both preparation polling cases and both ready-made search cases passed; import review passed on desktop and is intentionally skipped on mobile. | Not reproduced in this bounded run. Historical failures remain open; no cause or fix is claimed. JITM-03 owns the CI investigation. |
| UNDO-06 | VERIFIED-CODE: date-based `runKeys` uses `jump-date:` when Undo did not create a date; the Journey lock selects every matching record without a per-start occurrence ownership bound. INFERRED: the older-run scope remains possible. | Not fixed or freshly reproduced end to end. A repair must distinguish the restarted occurrence from older date runs and protect work already moved on by Journey. |
| UNDO-05(c) / RACE-01 | VERIFIED-CODE: the scheduler refuses to reopen an existing ended record when its pass began earlier, but a record first created after Undo has no ended marker. INFERRED: the recorded race remains possible. | Not fixed or freshly reproduced. Needs a deterministic interleaving test and a shared enrollment/creation guard, with lock-order and idempotency verification. The REOPEN-01 fix does not close this distinct race. |

## Validation

Private evidence is under `.artifacts/jitm05-20261016/`. Raw captures and test configuration are not committed.

- VERIFIED-RUNTIME: native Orca browser lookup for this exact workspace returned `browser_unavailable: Browser automation is unavailable on this host`. The installed native guide was read first; local browser automation is the justified fallback.
- VERIFIED-RUNTIME: offline dependency installation failed with an incomplete cache (`ENOTCACHED`); the normal locked install then succeeded. Both attempts are retained in the task transcript.
- VERIFIED-RUNTIME: all 79 existing migrations applied to a newly created loopback `jitm_design_*` database. No application schema changed.
- VERIFIED-RUNTIME: unchanged production build passed. Baseline browser URL was `http://127.0.0.1:3125`; the baseline standalone output is preserved privately for comparisons.
- VERIFIED-RUNTIME: the first private visual harness attempted a backward/forward tab cycle inconsistent with heading-first dialog focus and failed its focus assertion. The corrected heading → Tab → Close → Enter → restored trigger sequence passed all 28 baseline states. Both logs are retained; no application assertion or timeout was weakened.
- VERIFIED-RUNTIME: focused unit/integration check passed six files and 58 tests after the engine fix. The final broader check includes the later downstream-run assertion.
- VERIFIED-RUNTIME: `npm run check` passed client generation, schema/static/import validation and typecheck, then stopped at Vitest: 314 files passed, one failed, nine skipped; 2,448 tests passed, four failed and 75 skipped. All four failures are in `tests/appointment-bindings.test.ts`; the subsequent build was run separately. No skipped case is counted as passing.
- VERIFIED-RUNTIME: the four appointment failures reproduced twice on the candidate and twice on unchanged `0a50aed` source. The fixture anchors appointments to October 5, 2026 without fixing the current clock; its first visit is already past. A private diagnostic setup that pins only `Date` to October 5 made all six unchanged baseline cases pass. This is a pre-existing test defect under JITM-12 §2.14–§2.15/§2.22, not a candidate-only regression. The initial baseline attempts did not reach any tests because the archive lacked its generated client; generated-client links repaired that environment, and all attempts remain recorded. JITM-03 should pin the test clock and restore it after the suite; no application behavior or assertion needs weakening.
- VERIFIED-RUNTIME: `standards:check` reports two errors against the pre-existing Orca bootstrap `AGENTS.md`: the mandatory Orca preamble precedes the Next.js block and contains a home-relative path. The same checker passes against the clean main archive, with its existing JITM-09 length warning. The newer owner directive and bootstrap files were preserved; neither the checker nor the router was changed to suppress the conflict.
- VERIFIED-RUNTIME: the candidate production build passed and was served at `http://127.0.0.1:3126`. The private visual check passed all 28 states: zero horizontal/vertical icon-center offset, 48×44 target, visible focus, center hit, no horizontal overflow and correct focus restoration. The four 200% phone/desktop axe checks had zero violations, and no page errors occurred. Inspected light/dark 390 px captures against the baseline, plus 834 px light and 1920 px dark captures against the shared sheet anatomy and `Review`/`DarkReview` references: the centered icon is the intended difference; existing text, surfaces, header spacing and phone/desktop sheet layout remain. Full-page screenshots extend below the viewport-bound scrim; they do not imply that the scrim fails to cover the visible viewport.
- VERIFIED-RUNTIME: `npx playwright test e2e/no-mix-status.spec.ts e2e/sheet-interactions.spec.ts e2e/accessibility.spec.ts e2e/onboarding-invitations.spec.ts --retries=0 --reporter=line` passed 44 cases with six project-specific skips, zero failures, across desktop and mobile Chromium. This covers No Mix confirmation/start/Undo, keyboard sheets, enlarged text, core-page accessibility and three mixed-channel invitations becoming pending Today reminders with zero queued emails. Invitation captures are retained under `captures/invitations/`; no native message was sent.
- VERIFIED-RUNTIME: `npx playwright test e2e/today-momentum.spec.ts --grep 'confirmation and rail layout' --retries=0 --reporter=line` passed six cases with two project-specific skips and zero failures. The failed-Undo containment and compact Profile keyboard/layout checks preserve #157/#158's completed work. The full Today momentum suite was not rerun.
- VERIFIED-CODE: the three edited code/test files match the tested tree at `a1753bd3102b4cc46422b9216b911d445c828f2a`; later changes are documentation only. `git diff --check` passed. All task-started application servers were stopped. The two task-owned loopback evidence databases are retained for review; no shared database was dropped.

The browser evidence records these local routes: `/contacts`, `/contacts/[synthetic-contact]`, `/jumps`, `/mixes/system`, `/account/preferences` and `/calendar`, plus the unchanged core routes enumerated in `e2e/accessibility.spec.ts`. The scripts and logs retain exact interactions and assertions; synthetic identifiers are not stable user-facing links. See `logs/candidate-browser.log`, `logs/candidate-today-preservation.log`, `candidate-visual.json`, `baseline-visual.json` and `baseline-floating-stack.json` under the private evidence directory. No failure unique to the candidate was observed in the checks run.

## Completion gate and dependent handoff

The two code repairs can be reviewed independently. The broader “resolve No Mix, visit and invitation follow-ups” outcome remains incomplete until the owner resolves the listed semantics; TRU-09 also needs its separately authorized staff publication. JITM-06 must receive the final candidate identity and known residuals before physical-device qualification; this checkpoint does not clear that prerequisite by itself.

| Acceptance | Result |
|---|---|
| Behaviors tied to current decisions and observable scenarios | VERIFIED-DOC/CODE: mapped above. BLOCKED: no owner choice settles the eight defaults and visit membership, so their final behavior is not newly approved. |
| Unresolved semantics presented as explicit choices; no invented automatic send | VERIFIED-DOC/CODE/RUNTIME: eight rows plus the visit alternatives and invitation handoff; no sending code changed; invitation tests assert zero queued emails. |
| Focused interaction/accessibility evidence; completed redesign preserved | VERIFIED-RUNTIME: 28 visual states, 44 affected browser passes and six Today/Profile preservation passes, with all skips disclosed. |

Concrete handoff: Kevin answers the existing question; the coordinator records those choices in their existing standards/decision homes and resumes only the remaining scoped implementation. The staff batch receives the invitation draft and publication/compatibility sequence. JITM-03 receives the reproducible appointment-clock failure and the passing fixed-clock diagnostic. UNDO-06 and UNDO-05(c)/RACE-01 still need deterministic reproductions and a scoped repair, and VIS-01 still needs a placement decision and crowded-stack coverage.

## Self-review (WF-05)

Verdict: **changes requested for the full assigned outcome** because the input gate is unmet. No new HIGH or MEDIUM defect was found in the two scoped code fixes. This is self-review, not independent QA; no additional reviewer was spawned, as required by the dispatch.

Scores (0–3): constitution 3; concept 3; copy/vocabulary 2; design system 3; layout 3; interaction 3; user workflows 1; accessibility 2; engineering 3; testing/evidence 2; git/review 2; records 3; agent conduct 3. The imposed Orca branch name was retained instead of renaming the assigned branch. Physical-device evidence remains separate from browser emulation.

| ID | Rule | Finding and evidence | Label | Severity | Next action |
|---|---|---|---|---|---|
| DEC-01 | JITM-09 §6; JITM-16 §2.16 | The current standard and prerequisite leave the eight defaults and visit membership open; coordinator question `relay_65afcf4520fe` has no answer. This blocks full acceptance, not review of the independent fixes. | BLOCKED | MEDIUM: missing decision evidence | Record Kevin's choices and then implement/qualify those exact semantics. |
| TST-01 | JITM-12 §2.14–§2.15/§2.22 | Four appointment assertions fail on both source trees; the fixed-Date baseline diagnostic passes all six. | VERIFIED-RUNTIME | MEDIUM, pre-existing; nonblocking for these fixes | JITM-03 pins and restores the suite clock. |
| VIS-01 | JITM-08 §2.10–§2.15 | The existing floating confirmation overlaps two Today rows in the baseline capture; placement was preserved. | VERIFIED-RUNTIME | LOW, pre-existing | Qualify a placement change separately across crowded and short views. |

The fixed-date “goes out” wording and saved invitation version remain explicitly unresolved copy follow-ups above. The local draft claims no delivery or measured result, and the current production invitation wording was not inspected or replaced.

## NOT READ / NOT RUN

- NOT READ: production invitation versions, customer records, private message bodies or credentials.
- NOT RUN: live staff publication, compatibility-removal rollout, live automatic customer email, customer outreach, production smoke/deployment, GitHub writes or merge; excluded by this task.
- NOT RUN: physical devices, native messaging handlers and assistive technology; hardware qualification belongs to JITM-06.
- NOT RUN: a deterministic UNDO-06/UNDO-05(c) race reproduction and repair, or a complete hosted CI matrix; no claim that passing focused checks closes these findings.
- NOT RUN: opt-in recovery/backup, hosted-load, push and long unattended checks represented by the 75 skipped unit/integration cases; no storage, delivery-provider or infrastructure change requires those gates here. `RECOVERY_TEST_DATABASE_URL` was not enabled.
- NOT RUN: dependency audit, secret scanning, Lighthouse, image builds, packaged-server/load qualification, migration/restore rehearsal and the complete browser matrix; this bounded task changed no dependency, public page, schema or deployment configuration. The build and existing migrations were exercised locally as recorded above.
