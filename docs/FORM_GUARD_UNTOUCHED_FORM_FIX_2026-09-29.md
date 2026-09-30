# Unsaved-changes warning on an untouched form — fix record, September 29, 2026

A new account's one-person onboarding form said "Unsaved changes. Save before leaving this page." before the person had typed anything. The shared form guard now counts changes only from the person's first action on the page. This was follow-up 2 of the [one-person onboarding record](ONBOARDING_ONE_PERSON_FIRST_IMPLEMENTATION_2026-09-29.md).

**Status:** merged on 2026-09-30 as `cb694a9`; not released. The release is a separate task (WF-06). It is code-only, with no migration.

| Item | Value |
| --- | --- |
| Branch | `fix/formguard-untouched-20260929`, pull request #101 |
| Base | `origin/main` at `9f967bc` |
| Code commit | `a49a509` |
| Decision | Kevin, 2026-09-29, answering whether the shared form component may change: "ok go ahead". |
| Workflow | WF-01, then WF-02 with WF-04 and WF-08; skills `jitm-ui-change`, `jitm-feature`, `jitm-standards-update` |

## Cause

`FormGuard` took its snapshot of the form when it mounted. On the onboarding form, three values change after that without the person doing anything:
- the timezone picker replaces an account's UTC with the device's timezone (`confirmDetection`);
- the date field moves to today's date in that timezone;
- the starter preview sets `starterPreviewAvailable` from 0 to 1 when it loads.

Each of those differed from the snapshot, so the guard showed the warning and would also have asked before leaving. Every new account starts on UTC, so every new owner on a device outside UTC saw it.

## What changed

**The shared form guard (`src/components/FormGuard.tsx`).**
- Changes count from the person's first action on the page: a pointer press, a key press, a click, or an input or change event. Until then, each value the page fills in becomes part of the starting point.
- A press comes before the change it causes, so the guard takes a fresh snapshot at that moment. A click, input or change event arrives after the form has changed, so it keeps the last snapshot from before.
- A field that only reports the page's own state can carry `data-form-guard-ignore`, and the guard leaves it out of the comparison. The starter preview's `starterPreviewAvailable` flag is the first such field (`src/components/StarterPreview.tsx`). Without it, a preview that finished loading after the person's first tap would still count as a change.
- Everything the person types is still protected, and undoing it clears the warning. Forced drafts (`forceDirty`), the reset behavior and both native prompts are unchanged.

**Standards.** JITM-08 §2.30 now says an untouched form never warns and names `data-form-guard-ignore` (version 1.0.1).

## Verification

Builds: baseline `origin/main` (`9f967bc`) and this branch, both production builds with the CI environment, served on separate ports against the local `jitm_design_onb0929` database.

- VERIFIED: the new browser test "an untouched form reports no unsaved changes and leaves without asking" (`e2e/onboarding-one-person-first.spec.ts`) runs with a Chicago device timezone and a UTC account. It passes on the candidate on desktop and phone. It fails on the baseline on both: the warning is present on the untouched form. The test also checks that typing a name shows the warning, that clearing it removes the warning, and that the page's home link leaves without a prompt.
- VERIFIED: the rest of the onboarding spec passes on desktop and phone (12 of 12).
- VERIFIED: the specs that exercise the guard pass on desktop and phone: the wide preference fields check (`design-adoption`), contact navigation asking before discarding edits (`ui-ux-readiness`), the other-form prompt on Personal preferences (`ui-ux-workflows`), the unsaved Beat in the Mix workspace and the directory tools (`mix-library-workspace`), the calendar filter prompt (`save-recovery`), and the staff System Mix spec with `SYSTEM_MIX_E2E=1` and required administrator MFA (`system-mix-administration`, 4 of 4).
- VERIFIED: `npm run test:a11y` passes (3 passed, 1 skipped by its own condition).
- VERIFIED: tier 1 — `db:generate`, `validate:static`, `typecheck` and `build` pass. Vitest: 2,117 passed and 24 failed. The 24 failures are in the four backup and recovery integration files, and they fail the same way on the baseline: `spawn pg_dump ENOENT`, because TrixBot has no PostgreSQL client tools. They are environmental, not regressions (JITM-12 §2.14).
- VERIFIED: screenshots of the untouched form, light and dark, at 390 and 1194 wide, from both builds. The baseline shows the warning in all four; the candidate shows none. They are kept privately in the worktree's `.artifacts/formguard-20260929/`. The layout is otherwise unchanged; no export screen exists for onboarding.

## NOT RUN

- The full browser suite: only the specs that use the guard ran (JITM-12 §2.13).
- Physical iPhone and Android devices, and screen readers. Assistive-technology activation that sends only a click is handled by keeping the pre-click snapshot, but it was not tried on a real screen reader.
- Lighthouse: no public page changed.
- Migration and restore rehearsals, worker suites and `npm run security:audit`: no schema, job, worker or dependency change.
- GitHub Actions CI, which is blocked by billing; the practiced set ran locally as listed above.

## Follow-ups

- Other forms with the guard may also fill fields in after loading, for example a detected timezone on Personal preferences. They now benefit from the same rule; none was found to need `data-form-guard-ignore`.
- A value the page fills in *after* the person's first action still counts as a change unless its field carries `data-form-guard-ignore`. Mark any new status-only field that way.
