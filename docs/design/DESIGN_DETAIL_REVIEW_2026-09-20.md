# Detailed pane and interaction review — September 20, 2026

This follows the [first review](DESIGN_REVIEW_2026-09-20.md) and the request to inspect pane structure, popups, copy placement, buttons and small details more closely. The [original export](jump-in-the-mix-designs/index.html) is preserved. Implementation rules have been added to the [guidelines](DESIGN_GUIDELINES.md).

Open the [visual comparison and route gallery](../../.artifacts/design-detail-20260920/index.html) to compare the supplied layouts with the local implementation and inspect open dialogs. All records in the captures are fictional local fixtures.

## Findings and corrections

| Area | Finding | Implemented correction |
| --- | --- | --- |
| Today review | Repeated labels and vertical gaps pushed phone outcomes out of view; Copy/Discard formed an unrelated stack. | Added the identity avatar; grouped Mix and due information; tightened the Beat track and message spacing; placed Copy beside the handoff and outcomes together; moved draft status/discard below. Retained save/conflict/hold warnings and recipient information. |
| Mix workspace | Beats looked like long forms, the library had no rhythm, and removal competed with writing. | Inline editable name, numbered Beat marker, timing/channel controls and wording. Appointment timing, alternatives, reorder and removal live under Beat options. Library tracks and summaries use actual Beats. Removed duplicate tabs and the fixed textarea height; aligned search/filter and the save footer. |
| Beat names | The editor regenerated generic channel names; the server also prefixed saved names with the Mix name. | Save the entered Beat name exactly. Alternate versions remain submitted when their disclosure is closed. A browser test checks the saved name and alternate call notes in the database. |
| Calendar | The title spanned the whole workspace, selection and editing were weakly separated, and row actions crowded the agenda. | Separate agenda/editor/context panes. Inline title/type and labelled event rows. Group optional details, move event management into its disclosure, and keep save/share actions beside the no-invitation explanation. Use a populated selected event for comparison. |
| Contacts and shared dialogs | The touchpoint sheet inherited a small section heading from its parent. Confirmation action order and close controls varied. | Give dialog headings their own typography; use round 44px close controls; bound scrolling; place Cancel before the consequential action and focus it initially. Check stage, history, touchpoint and archive dialogs in both themes. |
| Short-phone activation | The sticky review footer clipped its final action at 320×568. | Keep the footer inside the scroll boundary and test both decisions at full visibility. |
| Journey | Phone search took a full roster row, touchpoint headings/actions were bulky, and previews assumed a 260px height. | Header search sheet, compact selection/touchpoint controls, ordinary heading case, supporting copy after the touchpoint rows. Previews measure their content, center on the dot and fit above or below it. |
| Navigation | Some utility icons represented unrelated actions. | Consistent account, connection, preference, notification and Journey icons; expose the existing N shortcut beside desktop Quick Add. |
| Homepage and profession pages | Phone wordmark was hidden, the headline forced an extra line, profession links were single-column, and a footer flex basis created a large blank gap. | Visible wordmark, compact Join/Explore header, keyboard/dismissible menu, inline headline emphasis, introduction/demo/profession ordering, two-column profession directory and compact footer links. Retain the agreed fictional three-Beat demo and existing access wording. |

## Verification and limits

Evidence and logs are under `.artifacts/design-detail-20260920/`. Environment/session files used by the local runner remain private and are not linked from the viewer. Builds and tests use the disposable local design database; no customer data or provider sending is involved.

- Production build includes TypeScript checking. Schema, source syntax, imports, Server Action boundary checks and `git diff --check` pass. Final build: `ab0yBWXUpc6AJd6AZznr3` (`build-final-verified.log`).
- **34 distinct browser checks passed across the full runs and focused reruns.** The final 14-check correction suite includes the 320×568 activation footer regression; all 14 passed on the final build. The accepted 28-check run and five homepage checks cover the remaining workflows (`browser-popup-final.log`, `browser-accepted.log`, `browser-final.log`). Earlier failed attempts remain recorded; their fixes are described above.
- The route inventory covers 84 page templates through 93 route/state URLs: **188 desktop/light and narrow-phone/dark checks**, with no unexpected overflow, browser exceptions, server failures, axe WCAG A/AA violations or covered action centers in the sampled controls. This includes account/settings, support, templates, authentication, public documents and staff pages.
- **52 core page/editor states** at 390/1920px, **38 popup/menu states** at 320×568/1440×1000, and six full homepage captures at 390/834/1920px supplement the route inventory. All core states and popups were recaptured on the final build with no overflow, runtime or axe violations (`screens-accepted.json`, `popups-accepted.json`). Core comparisons and representative secondary screens were inspected visually, including the corrected short-phone activation footer and touchpoint heading. Popup capture selectors were corrected to open controls inside management disclosures and choose the visible phone/desktop instance.
- **168 boundary checks** cover the four workspaces in both themes around navigation/pane breakpoints and through 3840px, with no overflow, headers exceeding their pane or visible editors narrower than 280px. Workflow tests include draft persistence/conflicts, completion/Undo, Calendar save/edit, inline Mix authoring and saved alternatives, Journey previews/search, public navigation/demo and theme behavior. Accepted results and focused reruns are recorded alongside earlier failed attempts.

These checks do not claim pixel equivalence, a manual sign-off of every unmocked staff page, physical-device testing or measured customer outcomes. Broad route checks preceded the final small popup/icon refinements; affected dialogs and workspace states are checked again on the final build. No deployment was performed.

## Design/function decisions

- The supplied Mix Active toggle could imply immediate activation. **Current assumption: retain audience/schedule review before activation.** This was raised for owner clarification; layout work does not authorize bypassing that workflow.
- Quick Add still reviews recognized person/follow-up details before the existing save form. Matching existing people and saving contact/event/follow-up atomically remain the earlier open product decision.
- “After 60 quiet days” still needs a definition of inactivity, resetting events and recurrence. No inactivity trigger was added.

The public three-Beat demo, browser-local appearance preference, real Journey counts and manual touchpoints retain their previously documented contracts.

The subsequent [test-site deployment receipt](DESIGN_DEPLOYMENT_2026-09-20.md) records publication and the database quota outage that already affected staging before deployment.

The owner then requested the main site. The [production release receipt](DESIGN_PRODUCTION_2026-09-20.md) records the successful customer-site publication, healthy production database and live workflow checks.
