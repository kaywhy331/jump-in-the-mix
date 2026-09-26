# Responsive layout follow-up — September 19, 2026

The live redesign's Today queue collapsed on wide monitors: contact rows measured 116px at 1920px and just 20px at 2560px and above. Percentage padding resolved against the uncapped parent while the page itself had a 1440px maximum. The document did not overflow, so the previous overflow-only check missed the problem.

Today now uses a bounded grid with a 324–380px queue, a 32px gap and the remaining space for review. At 1920–3840px, the queue measures about 374px and the workspace stays within 1440px. The docked editor and its mobile sheet keep the existing draft, focus and outcome behavior.

The review covered all 84 page definitions, including populated dynamic pages, staff pages, public pages, empty results and account states. The supplied export remains the visual authority. No source designs or product behavior were replaced with mockup sample data.

## Shared structures for pages without a mockup

| Page family | Structure |
| --- | --- |
| Today, Contacts, Mixes, Journey, Calendar | Quiet navigation rail, bounded workspace, flat data rows, separators and semantic selection colors. Columns collapse or become reachable sheets/scrollable maps according to available space. |
| Contact add/edit, business, personal preferences, notification and sending forms | `page--form`: maximum 1040px, common header/actions and flat sections. Fields remain flexible below the maximum. |
| Account, Help, support list and conversation detail | `page--content`: maximum 1120px, shared headers and controls, quiet rows and distinct conversation surfaces. |
| Settings and More | One shared flat destination-list pattern within 960px. |
| Import, custom fields/date types, journey configuration, connection setup and mix authoring | Bounded workspace with the existing task-specific controls; the shared typography, colors and controls apply throughout. |
| Authentication, onboarding, confirmation and error states | Existing focused card/document structure with shared fonts, surfaces and controls. Account-deleted confirmation now uses the same centered authentication frame. |
| Staff and reports | Existing grouped navigation and bounded data workspace. Mix-editor panels and timing fields wrap according to their container width, preventing squeezed tablet fields. Reports retain intentional internal table scrolling. |
| Homepage, profession pages and public documents | Existing supplied-design marketing bands or readable document widths, with the same light/dark tokens and locally hosted fonts. |

Additional corrections found during review:

- Journey's mobile stage strip no longer imposes its minimum width on the roster. Search and person actions fit inside a 320px phone.
- Mobile page headers use the app's gutters; obsolete negative margins no longer clip them.
- Empty form-save status regions remain mounted for accessibility without consuming a grid cell. Active save/unsaved notices occupy their own full-width row.
- Settings now follows More's flat navigation rows. Focused forms and support/account content no longer stretch across ultrawide monitors.

## Verification

Evidence is retained in ignored `.artifacts/responsive-audit-20260919/`. It includes measurements before and after the fix, screenshots/contact sheets, the route matrix, accessibility results, boundary checks and workflow logs. Final release evidence is in `.artifacts/responsive-deployment-20260919/`.

The route matrix covers 100 route/state combinations at 320, 834, 1440 and 3440px, with automated WCAG A/AA scans at the two extremes. Hosted support pages were tested with pilot mode disabled. A separate 83-case matrix checks core layouts around 900/901, 1099/1100, 1199/1200 and 1599/1600px, plus 2560/3840px, expanded library filters and Quick Add. Intentional map/table scrolling is distinguished from clipped controls.

Regression checks measure actual queue/editor widths, retain an edited draft through ultrawide and mobile resizing in both themes, contain Journey controls on a narrow phone, center the account-deleted page, and align preference fields before and after an unsaved-change notice appears. Existing tests cover pagination, keyboard focus, outcome updates, draft conflicts and recovery, sheets, mix authoring and browser zoom.

Final local results: production build and typecheck passed; seven unit/readiness tests passed; all 30 browser scenarios passed across the combined run and a focused rerun correcting the test's Locale locator. All 400 accepted route/viewport checks and 83 boundary/expanded-control checks passed. The accepted scans found no unintended horizontal overflow, clipped controls, browser errors or automated WCAG A/AA violations. Source comparison matched all 655 release-manifest files to the tested workspace.

These are browser and engineering checks, not physical-device acceptance or measured customer outcomes. Appearance remains browser-local; Journey uses existing Mixes and real contact state. No new automation, sending behavior, migration or dependency change is included.

## Production verification

The corrections are live at https://jumpinthemix.com/. Both Render services run code commit `6482a700c42ac0bb2c4d163088580a90aecf2779` from `fix/ultrawide-layout-20260919`.

| Service | Deployment | Live at (UTC) |
| --- | --- | --- |
| Web | `dep-dande3uk1f9s738c14q0` | 2026-09-19 18:43:28 |
| Worker | `dep-dandd38ae00c73ed9ur0` | 2026-09-19 18:39:25 |

Final verification at 18:46 UTC passed all four health endpoints, matched 655 source files and 19 served assets to the release, and confirmed all 61 migrations. The worker completed a scoped no-op job; its test record was removed. The initial rollout check reached the retiring worker, so verification was repeated after the new worker heartbeat appeared.

Nine public browser checks and 48 authenticated checks passed on the live site. The latter covered twelve customer pages at 390, 1440, 3440 and 3840px in light/dark themes, including direct queue/editor width assertions on desktop. Actual password sign-in and onboarding passed. The temporary account, workspace, contact and follow-up were removed; final checks found no release-test users, workspaces or jobs, and the six baseline table counts were unchanged.

The same-schema rollback target for both services is `2c029bccdb4704c24bb2d66c138687f6624398bb`. No rollback was needed. No Netlify deployment was published by this follow-up.
