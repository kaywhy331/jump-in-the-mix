# Pane and popup detail review — September 20, 2026

This follow-up addresses the request to inspect pane structure, popups, copy placement, button placement and smaller page details. It builds on the [page review](DESIGN_PAGE_REVIEW_2026-09-20.md), retaining the supplied [design export](jump-in-the-mix-designs/index.html) and existing working-tree changes. The source export was not edited.

Open the [before/after screenshots and expanded-page gallery](../../.artifacts/design-polish-20260920/index.html). Screenshots use disposable fictional fixtures. Private environment and session files are not linked by the gallery.

## Corrections

| Area | Finding and implemented change |
| --- | --- |
| Today pane | The desktop export places Snooze and Skip beside the person heading. They now occupy that position from 1200px, reserving heading space and the wide-screen context column. Mark sent stays beside the send controls; smaller screens retain the grouped outcomes below the message. The same controls remain mounted during resizing. |
| Nested Snooze popup | Docked review selectors also matched the nested popup. It became a full-width strip at the top of desktop screens, with its button borders stripped. Panel/header/body selectors now target the review pane’s direct children; outcome-button styles stop at the toolbar’s own buttons. The popup is centered on desktop and bounded on phones. |
| Contacts tools | Three tiny columns caused long labels to run into neighboring controls at 320px. Tools now use full-width destination rows with at least 48px height, normal UI typography and separators. |
| Saved contact views | Controls appeared only above 200 matching contacts, disappearing after narrow filters. They now live inside Filter regardless of result count. Their nested management popup preserves unfinished names when closed. Saving also retains last-name sorting. |
| Journey stage settings | Expanded stage forms placed four actions on one row, pushing Save off the left edge at 320px without page-level overflow. The action row now wraps, and a regression check verifies all four buttons’ actual bounds. |
| Staff filters and reports | Expanded invitation date filters exceeded their column width. Expanded report tables imposed their intrinsic width on the whole page. Date fields now contract to their columns, and report disclosures use a bounded grid track so their tables scroll inside the existing accessible regions. |
| Contact preferences | An invisible submit button was still keyboard-focusable behind auto-saving priority/channel controls. A visible submit is now supplied only in the no-JavaScript fallback. Existing automatic saving and confirmation behavior remain intact. |
| Timezone picker | Copy now describes timezone selection and device timezone detection accurately. The current zone appears first, carries a Selected label and `aria-pressed`, and stays available even if absent from the browser’s standard list. The full list is available instead of truncating to 100 choices. Search receives focus; closing or selecting returns focus to the specifically labeled Change control. |
| Short screens and Quick Add | On viewports no taller than 480px, Quick Add/review headers and editor action footers scroll with their contents. They cannot trap fields between two sticky blocks. Quick Add disclosures have 44px minimum targets. |
| Quick Add review wording | “Meet Morgan Friday at 2pm, then text them Monday…” previously proposed a person called “them” and missed the event. The parser now recognizes this explicit meeting phrasing and retains separate event/follow-up dates. A pronoun alone is left blank for explicit person selection. Missing follow-up times and wording remain blank for review. |

The audit also opened optional page sections before checking control reachability. It covered the existing Today, Contacts, Mixes, Journey and Calendar panes, account/settings/support/staff pages, homepage and five profession pages, authentication/onboarding, and token/error states. Popup inspection included filters, stage changes, touchpoint assignment, date/time selectors, activation review, destructive confirmations, Quick Add capture/review, Journey options/search, profile settings and public navigation. Pages without a mockup retain the shared design components and tokens.

## Verification

Accepted production build: `2op4zKgQj3RfN6fYg_7QQ`.

| Check | Result |
| --- | --- |
| Production build and Next.js TypeScript checks | Passed. |
| Explicit TypeScript and schema/syntax/import checks | Passed. |
| Focused unit tests | 13 passed, including combined capture names, separate dates and pronouns. |
| Browser workflow scenarios | 24 distinct scenarios passed: 22 in the main final run, the corrected nested-Snooze check, and the additional Journey stage-action regression. |
| Expanded page inventory | 188 route/theme/viewport checks across all 84 page templates. The 10 states affected by the last Journey/staff fixes were rechecked on the accepted build. |
| Popup and disclosure captures | 70 captures across light/dark and 320/1440px; no page overflow, browser errors or lost modal focus. Accessibility assertions are part of the workflow tests and route scans. |
| Workspace comparisons | 24 current captures across Today, Contacts, Mixes, Journey, Calendar and homepage at 390/1920px in both themes. |

Evidence lives in `.artifacts/design-polish-20260920/`: `build-accepted.log`, `typecheck-accepted.log`, `static-accepted.log`, `unit.log`, `browser-final.log`, `browser-snooze-final.log`, `browser-stage-final.log`, `routes.json`, `routes-recheck.log`, `after-popups.json`, `panes.json`, and the linked gallery. The final CSS corrections are scoped to Journey stage forms, staff date filters and report disclosures; unaffected captures and checks from the preceding accepted implementation are retained.

The local checks include both themes, 320px phone, portrait tablet, desktop and short landscape viewports; screenshot comparisons; keyboard opening/closing and focus return; nested dialogs; retained drafts; saved-view creation; date selection; and actual Mix, Calendar, Today and Quick Add workflows. The route inventory corresponds to the 84 templates documented in the earlier page review, including both signed-out and signed-in onboarding.

The browser runs exposed three test-harness mistakes: the date expectation mixed the runner’s local date with a UTC fixture, the timezone test used the old generic Change label, and a heading selector matched both the person and context headings. These were corrected. A rebuild during the initial route scan invalidated some old-server chunks; the final route scan uses a separate completed build and a fresh server. These initial results are retained and are not counted as final acceptance.

## Decisions and scope

No new product decision is required for these corrections. Existing open decisions about account-synchronized appearance and Journey’s week start remain as recorded in the [design guidelines](DESIGN_GUIDELINES.md). Browser-local appearance and Monday weeks are retained. General touchpoints continue to use independent Mixes; the previously approved quiet-day lifecycle, combined Quick Add and activation preferences remain in force.

This is local implementation and verification. No staging/customer deployment or customer database mutation was performed. Automated browser checks do not replace physical-device or manual screen-reader acceptance, and this pass does not claim measured customer outcomes.
