# Onboarding preferences and Journey selection

## Implemented behavior

Onboarding recommends a complete mega-mix and offers individual mixes as an alternative. The individual route saves preferences and opens the ready-made library without requiring a contact. The existing one-person setup remains reachable from that alternative. The owner's newer direction supersedes the homepage roadmap's original one-person-first onboarding sequence; the original roadmap and design export are preserved.

The questionnaire saves communication preference, follow-up spacing, working days and hours, timezone, preferred follow-up time, quiet times, appointment buffers and whether to avoid calendar appointments. Saved choices are reused for subsequent mega-mixes and can be edited in Account → Personal preferences. Preview and installation use the same tailored definitions. Communication and spacing choices apply to new mega-mixes; existing Mix wording and delays remain editable independently. Installing a journey creates no contacts or deliveries.

Flexible follow-ups move forward to an available working time, respecting quiet times and, when selected, calendar appointments and buffers. Explicit planned dates, snoozes and exact appointment offsets retain their chosen timing. Both ordinary Mix scheduling and connected Journey scheduling use these preferences. Accounts without saved Journey preferences retain their existing scheduling behavior.

Selecting a Mix preserves the diagram's scroll and zoom. Incoming paths are green, outgoing paths purple, with a legend and written connection descriptions. Unrelated paths fade; dense connection labels avoid nodes and one another. Explicit navigation and zoom controls remain available.

## Design and migration

There is no dedicated questionnaire mockup. The implementation uses the existing onboarding shell, shared semantic tokens, Instrument Sans, responsive fields and the supplied light/dark visual language. Journey follows the owner's Mix/Beat graph direction documented in the design guidelines, which supersedes the export's stage-based topology. The original export is unchanged.

The additive migration `20260922180000_journey_preferences` adds nullable JSON preferences to `WorkspacePreference`. Apply it before publishing the application or worker. The complete local release has 68 migrations. Existing records are not opted into working-hour restrictions by the migration alone.

## Verification on September 22

The resumed check compared 1,190 application, schema, public, infrastructure, script and test files with the isolated build copy. All matched. A fresh disposable local PostgreSQL database accepted all 68 migrations. Eight focused suites passed 89 tests, including preference reuse, installation retry safety, actual scheduling, workflow behavior and server-action authorization. The production build, including TypeScript and static-page generation, passed.

Four desktop browser scenarios passed against that production build: tailored onboarding and preference editing; saving an individual library Mix; keyboard, theme, reflow and enlarged-text checks; and Journey selection with stable scroll/zoom and collision-free labels. The responsive scenario checks 24 widths from 320 to 3840px, with Axe checks and screenshots at representative phone, tablet and desktop sizes. Supplied Journey references and representative application screenshots were inspected.

The phone recommended-onboarding scenario passed. The first phone individual-Mix test incorrectly assumed the desktop preview pane was already visible. The test now selects the actual Mix from the library before opening its setup. Both desktop and phone reruns passed, completing six distinct browser scenarios across the two devices. Disposable databases were removed after each run.

Evidence: `.artifacts/onboarding-resume-20260922/`. Earlier implementation evidence remains in `.artifacts/onboarding-journey-20260922/`. The following production checks establish hosted behavior separately; none of these checks establish measured customer outcomes.

## Production publication — September 22

The owner explicitly selected https://jumpinthemix.com/ after the dedicated Netlify test database failed its quota check. The customer application uses separate Render web and worker services. The test site and its database were unchanged by this production release.

All requested improvements are live at commit `84eda7a5e2752795712c1a1ed4275fe8e8a3a939` on branch `release/onboarding-preferences-20260922`. Web deployment `dep-dapdnvf40ujc739bemr0` became live at 2026-09-22T19:54:09.057999Z; worker deployment `dep-dapdn02d0e5s73fghia0` became live at 2026-09-22T19:49:53.351454Z. Automatic deployments remain off.

Before the initial feature publication, an encrypted production backup completed at 2026-09-22T19:24:04.058Z. All 67 existing migration checksums matched. Isolated migration job `job-dapdc1740ujc739a85ug` applied `20260922180000_journey_preferences`, bringing the database to 68 migrations. Customer record counts were unchanged. The restricted runtime login retains read-only migration history and no migration-owner credentials were added to application services. Temporary migration files were removed.

The first live accessibility scan found that the scaled Journey overview made selection and population controls too small. The final revision preserves a 28px rendered target height and adjusts row spacing at overview zoom. A fresh production build and browser test passed: light/dark scans, desktop and phone minimum zoom (15%), no card or label collisions, keyboard selection, stable scroll/zoom and no page overflow. Screenshots were inspected. The correction requires no additional schema changes.

Authenticated hosted verification passed for recommended mega-mix onboarding, saved preference reuse and editing, the individual-Mix alternative, keyboard and phone interactions, and incoming/outgoing paths. A scoped synthetic Friday-night start moved past the weekend and a Monday appointment to 11:15 UTC, including its 15-minute buffer. It produced no automated delivery. Live WCAG 2.2 AA scans and minimum-target checks passed in both themes and the tested responsive views.

The first live label assertion sampled the viewport/zoom reflow before it settled. The retained screenshot records that transitional frame; the final check waits for fonts and polls the actual geometry, which passed with zero collisions. The completed run also passed the scheduling and individual-Mix checks and removed its scoped fixtures.

The final worker completed a synthetic queue job. Hosted checks matched 812 source/schema/configuration files and 20 served assets to this release. Public pages returned 200, protected routes retained their sign-in boundary, and liveness, readiness, worker and recovery checks passed. All synthetic users, workspaces, installation receipts and probe jobs were removed; original customer record counts remained unchanged and no failed jobs were recorded during final verification.

Evidence: `.artifacts/onboarding-deploy-20260922/` records the original backup, migration and feature publication. `.artifacts/onboarding-touch-targets-20260922/` records the final local build and browser qualification. `.artifacts/onboarding-touch-deploy-20260922/` records the final deployments, live workflows, accessibility checks, source matching and cleanup.
