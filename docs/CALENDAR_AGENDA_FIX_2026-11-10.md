# Calendar agenda — November 10, 2026

VERIFIED locally for Hub task `job_7e372db56d61` (JITM-UXA-09), based on `origin/main` at `7281bd53d0c531621e767a81b9db279c65774a2f`. This is an implementation record, not a production release. Final landing SHA and hosted check results are recorded on the Hub task.

Calendar now opens on its agenda at every width. New event, an explicit event edit, or a contact's scheduling link opens the editor through URL state. Back closes a newly opened form; Cancel returns to the agenda. Filtering the agenda does not open a form. Closing the editor unmounts its form so a saved or discarded draft cannot leave an invisible unsaved-change guard.

The existing visible Title label is protected by browser assertions. Event type and custom Ends now also have visible labels. The previously horizontal form rows and timezone label stack above their values. Week navigation uses Previous / Today / Next with chevrons and complete accessible names; in a narrow container it retains Today and the named chevrons. It stays on one line with full touch targets.

WF-02, WF-03 and WF-04 apply. The interface register follows JITM-04 §2.3. The requested editor keeps the Calendar multi-pane composition in JITM-07 §2.21; an absent editor collapses under §2.28. Labels follow JITM-10 §2.14, draft protection JITM-08 §2.24/§2.30, and validation JITM-12 §2.9/§2.10/§2.18/§2.21. The reference screens are Calendar, DarkCalendar, DesktopCalendar and DarkDesktopCalendar. Uniform above-field labels and a deliberate editor are the task's intended differences from the reference. Connection forms and the requested editor's existing contact-column layout remain outside this slice.

## Verification

All commands below ran in the assigned worktree. Database commands exported `.env` in the same shell and positively checked the effective loopback database name, `jitm_design_uxa09`. Browser commands used `PLAYWRIGHT_WEB_SERVER_COMMAND="npm run start"`, `PLAYWRIGHT_CAPTURE=off`, the project browser cache and `http://127.0.0.1:3099`.

| Evidence | Command | Exit and result |
|---|---|---|
| VERIFIED | `npm ci` | Initial sandbox esbuild EPERM; exact escalated retry 0 |
| VERIFIED | `npm run db:generate`; `npm run db:deploy` | Each 0 on the task fixture |
| VERIFIED | `DEMO_MODE=true npm run db:seed`; `npm run db:seed:e2e-admin` | Each 0; the initial non-demo seed could not supply the admin seed's prerequisite |
| VERIFIED | `npm run check` | 1: static checks and typecheck passed; 2,752 unit/integration tests passed, 75 skipped, three staff-bootstrap tests failed against the seeded admin fixture |
| VERIFIED | `npm run test:isolated -- tests/staff-access.integration.test.ts` | 0: all nine passed against the helper's empty disposable database (JITM-12 §2.16) |
| VERIFIED | `npm run typecheck` | Final 0; corrected a test-only DOM typing error from an earlier exit 2 |
| VERIFIED | `npm run build` | 0: production build |
| VERIFIED | `npx playwright test e2e/calendar-agenda.spec.ts e2e/appointment-visit.spec.ts e2e/calendar-connections.spec.ts --project desktop-chromium --project mobile-chromium` | 0: 16 passed |
| VERIFIED | `npx playwright test e2e/design-correction.spec.ts e2e/save-recovery.spec.ts e2e/sheet-interactions.spec.ts --grep Calendar --project desktop-chromium --project mobile-chromium` | 0: 10 passed |
| VERIFIED | `npx playwright test e2e/customer-journey.spec.ts e2e/phone-form-controls.spec.ts --project desktop-chromium --project mobile-chromium` | 0: 32 passed |
| VERIFIED | `npm run test:a11y` | 0: three passed, one desktop-only case skipped in the mobile project |
| VERIFIED | `npm run standards:check` | 0: existing JITM-09 length warning only |
| VERIFIED | `git diff --check` | 0 |

VERIFIED: both browser profiles and both themes cover widths 320, 375, 390, 767/768, 834, 900/901, 1024, 1099/1100, 1194, 1199/1200, 1279/1280, 1440, 1599/1600, 1699/1700, 1920, 2560 and 3440; also 844×390 and 1440×600. Enlarged text runs at 320, 375, 1024 and 1440; 110% zoom yields fractional CSS width below 1100. Assertions measure full-width default agenda, hidden unsolicited editor, labels above controls, navigation alignment, minimum targets, gaps and no page overflow. The matrix saved 228 synthetic screenshots with verified PNG headers/dimensions; logs, captures and manifest stay private in `.artifacts/uxa09/`.

VERIFIED: keyboard opening, required-title focus, field tab order, Back, Cancel, empty/filtered-empty, missing-event selection, availability failure with preserved input, signed-out redirection, failed-save recovery and pending-save locks. Existing picker/connection cases cover keyboard recovery and retained values. Calendar-specific automated accessibility checks passed in both themes. The previous desktop test's automatic event-selection assertion was recorded on the Hub before changing it; it now explicitly opens the event and retains the original title/contact and save assertions.

VERIFIED self-check: the diff meets all four acceptance criteria, uses existing spacing/color tokens and shared controls, does not change the glossary, and stays below the independent-QA size threshold. No schema, sending, authentication or release behavior changes. Main landing is explicitly authorized through the deploy-key Git route; deployment is excluded.

## Limits and NOT RUN

BLOCKED native browser: `desktop_browser_bridge_unavailable`; the installed browser guide was read and the repository browser runner used as the justified fallback. Screenshot visual inspection was NOT RUN because the task's explicit note prohibits opening images in agent context; DOM/geometry, accessibility, PNG checks and saved reference captures are the available evidence. Physical devices, real soft keyboards and OS text scaling are NOT RUN; browser profiles are emulation. Shared route-loading, generic offline-page and error-boundary designs were not changed or separately fault-injected. Production, migration/restore rehearsals and unrelated browser suites were NOT RUN because this is a scoped Calendar UI change with no deploy.

The coordinator identified an existing hosted `validate` timeout at the browser step, tracked by `job_f78d77dc501b`. Only that timeout with no listed failing test may be classified as pre-existing; this record does not claim hosted CI is green.
