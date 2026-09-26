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

Evidence: `.artifacts/onboarding-resume-20260922/`. Earlier implementation evidence remains in `.artifacts/onboarding-journey-20260922/`. These checks establish local behavior, not measured customer outcomes or successful hosted publication.

## Deployment status

These improvements remain unpublished. At 19:10 UTC on September 22, a read-only preflight verified the dedicated Netlify test site `8fd20ccd-5c35-47e5-99ce-98e5670d52fe` at `https://jump-in-the-mix-test.netlify.app/`. Its PostgreSQL connection failed with SQLSTATE `53000`: the account or project has exceeded its quota. Authenticated liveness returned 200; readiness and worker health returned 503. No hosted migration or publication was attempted.

Resume deployment after test-database access is restored: verify the migration history, take the required backup, apply pending migrations, build using the explicit test-site identity, verify the deployment and publish to the stable test URL. Hosted acceptance must include authenticated onboarding, preference persistence, scheduling and worker health. The customer site is a separate target.
