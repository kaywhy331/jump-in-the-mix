# Design review and follow-through — September 20, 2026

This continues the prior adoption, correction, Contacts, responsive and homepage-parity work. The [original export](jump-in-the-mix-designs/index.html) remains unchanged and authoritative; the [guidelines](DESIGN_GUIDELINES.md) record the implementation rules. Existing workspace changes from earlier sessions were preserved.

## Corrections in this review

- **Today/review:** restored the horizontal pending-Beat track, with a selected marker, real dates, keyboard links and 44px targets. The track now uses Contacts' occurrence matching rather than joining different Mixes or repeated runs. It always includes the selected Beat; its additional entries come from the bounded six-item pending preview. Legacy records without occurrence evidence stay separate. Removed a legacy selector that painted the phone draft white inside its violet bubble.
- **Journey:** the phone header puts stage/transition settings and whole-journey/contact links in an accessible options sheet. The stage strip and roster lead the page. Maps with fewer than four touchpoints no longer reserve an empty lower node row. Counts, timing groups, recorded movement and manual touchpoint behavior remain based on existing data.
- **More and navigation:** compact grouped rows, lighter labels and smaller icon/chevron boxes keep Appearance and Sign out reachable. The Quick Add control uses the supplied plain-plus treatment. Desktop Settings, Help and Account now identify the current destination, including nested pages.
- **Appearance:** cross-tab synchronization runs in the root layout, so sign-in and recovery pages update even without their own picker. Public contact/policy documents include the shared picker. System/Light/Dark, first-paint application and blocked-storage behavior remain supported.
- **Secondary pages:** account/session/support lists use flat separators; customer conversation bubbles use semantic surfaces, directional tails and Newsreader for personal wording. Staff message bodies share the voice font while retaining their operational layout. Account identity fields preserve their actual capitalization.

The homepage and five profession pages already share the supplied responsive composition and previously clarified three-Beat fictional demo. This review checks those pages without changing their access, pricing or marketing claims.

## Verification

Evidence is local under `.artifacts/design-review-20260920/`. The review uses the existing disposable local design database and fictional records. Provider sending is not exercised. Environment and session files in that directory are private; the comparison viewer uses only screenshots.

The page inventory covers all **84 page templates** through **93 distinct route/state URLs**, including populated dynamic pages, staff pages, public documents, authentication and deliberate missing-token/404 states. A successful fallback check does not establish every token lifecycle.

- Optimized production build, TypeScript, schema/syntax/import validation and `git diff --check`: passed. No dependency or database-schema changes were needed.
- **24 unit/integration tests passed** across Journey timing, contact occurrence matching, demo/readiness behavior and Today pagination. The latter includes 629-record navigation and workspace/date/status boundaries.
- **28 distinct browser checks passed across the initial run and focused reruns.** Coverage includes theme persistence and blocked storage, cross-tab sign-in updates, contact selection and notes, Today draft retention through phone/tablet/ultrawide reflow, occurrence isolation and horizontal Beat geometry, completion/Undo, Journey keyboard previews/selection/options, More density and active navigation, Calendar creation/editing, Mix editing, Quick Add draft transfer, all demo situations and all profession pages. Two old Contacts selectors were updated to the previously adopted last-name sort and Details heading. A More chevron line-height regression was fixed rather than relaxing its layout assertion.
- **188 route/viewport checks passed**, at desktop/light (1440px) and narrow-phone/dark (320px), with no unexpected overflow, browser exceptions, server failures or axe WCAG A/AA violations. Public policy pages use explicitly fictional local operator settings. The final phone Journey specificity correction is checked separately in both themes and by its keyboard/layout regression.
- **46 supplied screen/state counterparts** were captured at 390, 834, 1194 and 1920px in both themes, including review, completion/Undo and Quick Add. The captured states passed the same overflow/error/accessibility checks. Screenshots exposed the numbered Beat list, opaque phone compose field and duplicated phone Journey controls that automated accessibility checks alone missed. Core comparisons and representative secondary/public/staff screenshots were inspected; this is not a claim of pixel equivalence or manual sign-off of every unmocked template.

Open the [reference/current comparison viewer](../../.artifacts/design-review-20260920/index.html). The [route results](../../.artifacts/design-review-20260920/routes.json), [screen results](../../.artifacts/design-review-20260920/visual.json), build logs and browser logs distinguish the first attempts from accepted reruns. The earlier development-only router error did not recur in the optimized-build audits. A full local disk interrupted the first browser attempt; removing only this review's disposable development cache allowed verification to continue.

## Open design/function decisions

1. **Quick Add multi-item saving:** the export proposes matching existing people and saving a contact, event and follow-up together. The current reviewed person/follow-up workflow is retained. Matching, duplicate resolution, event/time interpretation and whether saves are atomic still require a product decision. The revised visual treatment does not imply that this new workflow is implemented.
2. **“After 60 quiet days”:** no inactivity trigger has been added. The events that reset the clock, reminder behavior and recurrence need definition. Existing touchpoints remain available manually.
3. **Existing implementation assumptions:** theme choice remains browser-local; Journey weeks start Monday; Today/Tomorrow take precedence; dot/unscheduled selection applies to the current page while counts describe the filtered set. These are documented assumptions, not newly supplied owner decisions.

This review does not claim exact pixel equivalence, physical-device acceptance, measured customer outcomes, or deployment. The remaining functional decisions prevent calling the entire exported concept complete.

The [subsequent detail review](DESIGN_DETAIL_REVIEW_2026-09-20.md) covers the deeper pane, popup, copy and button-placement pass, its corrections and final verification.
