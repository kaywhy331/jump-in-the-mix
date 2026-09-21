# Design adoption follow-through — September 20, 2026

This pass continues the [detailed review](DESIGN_DETAIL_REVIEW_2026-09-20.md). The existing working tree already contains the shared design system, homepage/profession composition and redesigned workspaces from the previous sessions. Those changes were preserved. The [original export](jump-in-the-mix-designs/index.html) remains the visual authority, with continuing implementation rules in [DESIGN_GUIDELINES.md](DESIGN_GUIDELINES.md) and `AGENTS.md`.

## Corrections in this pass

- **Journey directions:** movement paths previously ended at stage centers, underneath the rings. Arrowheads now stop outside both the circles and selection halos. Recorded moves to the next stage use straight links; skips curve above stages and returns below them. A text list provides the recorded source, destination and count to assistive technology. Geometry checks exercise forward, skip and return paths.
- **Journey touchpoints:** upper captions now sit above their nodes and lower captions below, keeping wording clear of the connection lines. Lower space is reserved for actual lower nodes or returns. Single-stage maps center their stage; maps without touchpoints no longer reserve an upper touchpoint row unless skip curves need the space.
- **Tablet Journey:** stacked global/header/settings rows pushed the roster below the first screen. Portrait tablets now use the compact Journey header and existing search/options sheets through 900px, keeping the map and the first person visible together. Landscape layouts restore the desktop controls. Search, stage settings and whole-journey navigation remain available.
- **Short laptop navigation:** the compact and full desktop rails could place Profile below a 600px-high window without a scrollable container. Both rails now scroll independently and keep controls from shrinking. Keyboard checks traverse the rail, open Profile, dismiss it and verify restored visible focus.
- **Profession-page regression coverage:** an older assertion still expected a single phone column. It now checks the supplied two-column directory through 320px, consistent with the implementation and the later detailed review.

The shared palette, local fonts, System/Light/Dark controls, Today review and Undo, Contacts directory/profile, Mix editor, Calendar agenda/editor, phone Journey roster, homepage and profession demos retain their established implementations. No schema, activation, sending or admission behavior was changed.

## Verification

Open the [reference/current comparison and route gallery](../../.artifacts/design-followthrough-20260920/index.html). Evidence lives under `.artifacts/design-followthrough-20260920/`. Tests use a disposable local database and fictional records. Private environment and session files are excluded from the gallery.

- Optimized production build **`OIz30IOI-Fgb84bTej2HR`**, `npm run typecheck`, source syntax, imports/Server Action boundaries, Prisma schema validation and `git diff --check`: passed.
- **20 unit/integration tests passed** across Journey path geometry, timing buckets and roster ordering, contact occurrence matching, demo behavior and shared accessibility contracts.
- **33 distinct browser workflow tests passed.** Coverage includes theme persistence/system changes/blocked storage, contact selection and editing, draft retention across resizing, completion/Undo, Journey previews/selection/arrows, short-window keyboard navigation, Calendar saving, Mix authoring, activation review, Quick Add and all public demo/profession situations. The **16-check correction suite passed again on the final build**, including the additional tablet search/focus/roster assertions.
- **188 route/viewport checks passed**, covering all **84 page templates** through **93 distinct URLs / 94 authentication states**, at 1440px/light and 320px/dark. No unexpected horizontal overflow, browser exceptions, server failures, automated WCAG A/AA violations or covered action centers were found in the sampled controls. Missing-token routes remain fallback checks, not complete token-lifecycle verification.
- **52 core workspace/editor captures** passed overflow, runtime and automated accessibility checks at 390/1920px in both themes. Six full homepage captures at 390/834/1920px, two additional portrait-tablet Journey captures and four short-laptop rail captures supplement them. Screenshots were inspected for the changed Journey and navigation behavior, alongside core workspace and representative secondary/public/staff layouts.
- **168 responsive checks passed** across Today, Mixes, Calendar and Journey in both themes, spanning 320–3840px and the intervening navigation/pane boundaries. No page overflow, headers exceeding their pane or visible editors narrower than 280px were found.

The full route/capture/boundary matrices ran before the final tablet header correction. The affected Journey screenshots, automated accessibility checks, keyboard workflows and **42 Journey boundary checks** were repeated against the final build, including the unchanged phone and desktop layouts. The [verification summary](../../.artifacts/design-followthrough-20260920/verification.json), route/screen/boundary JSON, build/typecheck logs and browser logs retain the evidence. The gallery distinguishes public onboarding's sign-in redirect from the signed-in onboarding screen.

## Decisions still needing the owner

1. **Combined Quick Add saving:** the export suggests saving a person, event and follow-up together. Existing-person matching, event/time interpretation, duplicate handling and all-or-nothing saving need an explicit contract. The current editable review and established save form remain in use.
2. **“After 60 quiet days”:** define which events reset inactivity and whether the reminder repeats before introducing that trigger. Touchpoints currently use existing Mix assignments and can be started manually.
3. **Mix activation:** the visual Active control could imply immediate activation. The current implementation keeps audience and schedule review before activation.

These questions were raised again during this pass. Browser-local appearance, Monday-start calendar buckets and current-page dot selection remain documented assumptions. No new product decision is inferred from an unanswered question.

This pass is local; no deployment was performed. Automated checks and screenshot inspection do not establish pixel equivalence, physical-device acceptance, a manual screen-reader sign-off or measured customer outcomes.

## Subsequent owner decisions

The owner approved combined Quick Add and a per-user choice of Mix activation behavior after this audit. Their implementation and current verification are recorded in [Quick Add and activation follow-through](QUICK_ADD_AND_ACTIVATION_2026-09-20.md). The owner subsequently approved the quiet-day resolution rules; their implementation is recorded in [Quiet-day touchpoints](QUIET_DAY_TOUCHPOINTS_2026-09-20.md). The audit evidence above describes the earlier build.
