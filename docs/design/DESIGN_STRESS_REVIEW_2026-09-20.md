# Interaction and reflow review — September 20, 2026

This pass extends the [page inventory](DESIGN_PAGE_REVIEW_2026-09-20.md) and [pane review](DESIGN_PANE_POLISH_2026-09-20.md) into resizing, failed saves, hidden validation, long content and enlarged text. The supplied export remains unchanged. These are verified local changes, not a deployment or measured customer outcomes.

[Before/after gallery and all 144 captures](../../.artifacts/design-stress-20260920/index.html)

## Verified corrections

| Area | Problem and resulting behavior |
| --- | --- |
| Today review and Snooze | Resizing an open desktop review to phone width promoted the parent above Snooze. Snooze’s buttons could not be clicked and Escape closed the wrong layer. The modal stack is now reopened in order, preserving the focused control and unsent wording. Closing Snooze returns focus to its trigger and leaves the review open. |
| Quick Add failures | Disabling the save controls dropped focus onto the document. Returned errors now receive visible focus, including after repeated failures and a long original capture. Entered names, notes and the retry identity remain intact. |
| Calendar validation | An invalid optional URL inside collapsed More event details silently blocked saving. Invalid fields now reveal their enclosing disclosures before browser validation focuses them. |
| Calendar errors and person choices | Returned save errors and ambiguous contact matches now receive focus. Titles, URLs and person details survive retries. A browser test selects the reviewed contact and verifies that the saved event belongs to that person. |
| Forms and actions | Intrinsic input widths expanded the Mix editor and schedule preview beyond a narrow viewport at 200% text size. Grid tracks and controls can shrink; action rows wrap. Preference save links and Mix buttons remain reachable. |
| Sticky actions and keyboard use | Calendar and Mix save areas scroll with their forms through the phone/tablet layout. Keyboard focus is moved clear of fixed navigation and sticky save bars, respecting native modal boundaries. Short-height behavior from the earlier pass remains. |
| Navigation and dates | Mobile navigation grows with wrapped labels. Calendar’s day strip can scroll horizontally when enlarged dates cannot fit. Public header links wrap; profession entries become one column when their available width cannot accommodate the labels. Standard phone layouts retain the supplied two-column profession structure where it fits. |

No new product behavior or sample metrics were introduced. Existing browser-local appearance and Monday-start Journey assumptions remain as recorded in the implementation guidelines. The custom Snooze date selector in More options is inline; it does not introduce a third modal.

## Verification

Accepted production build: `T3DLxu4rLnSSxeSTmURDg`.

- Production build, explicit TypeScript, schema/syntax/import checks and `git diff --check` passed.
- **35 distinct Chromium workflow scenarios passed:** 18 design-correction, 5 homepage-conversion and 12 sheet/interaction scenarios. The main run passed 34; the corrected enlarged-text keyboard test passed separately on the same build.
- **144 layout checks passed:** 12 routes × 320/834/1440px × light/dark × normal/200% root text size. No document overflow, out-of-bounds checked headings/action groups or covered checked controls remained. Each sweep checks the first 18 visible controls; the regression suite additionally checks the later save actions, public navigation and profession links.
- Tests exercise popup layout and focus, viewport transitions with Snooze open, retained wording, nested confirmations, timezone search, saved views, long captures and contact names, repeated failures, native invalid-input focus, ambiguous contact selection, actual Calendar saving, Today completion/Undo, Mix saving and homepage interactions. Accessibility assertions run in the relevant browser workflows.
- Screenshots were compared with the prior accepted build and relevant supplied references. The gallery includes all route captures plus focused before/after examples.

The route sweep covers Today, the contact directory and profile, Mix editor, Journey, Calendar editor, More, personal preferences, Journey settings, support ticket, homepage and contractor page. It supplements the earlier 84-template inventory; this pass does not claim a new full inventory run. Enlarged root text is distinct from actual browser zoom. Verification used Chromium; WebKit/Firefox and real-device soft keyboards were not run in this pass.

Evidence is in `.artifacts/design-stress-20260920/`: `build-accepted.log`, `typecheck.log`, `static.log`, `browser-accepted.log`, `reflow-regression-keyboard.log`, `verified-reflow.json`, `verified-errors.json`, `rotation-accepted.log` and `index.html`.

Initial failures are retained but excluded from acceptance. One build ran out of disk while packaging; disposable compiler caches were removed and the build then succeeded. Harness corrections used the actual Quick Add field label, avoided waiting for an app-only boundary on public pages, waited for fonts, and used explicit reverse/forward Tab navigation to verify keyboard reachability. The accepted keyboard test verifies focus before measuring the target. Temporary build-generated configuration references are restored after verification. No deployment was performed.
