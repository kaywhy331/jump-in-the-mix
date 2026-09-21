# Remaining interaction issues — September 20, 2026

Review of the local production build `T3DLxu4rLnSSxeSTmURDg`, following the [stress review](DESIGN_STRESS_REVIEW_2026-09-20.md). Five additional issues were reproduced in Chromium using a disposable workspace and synthetic records. This is a findings report: application code was not changed and nothing was deployed.

## Confirmed findings, in priority order

### 1. High — Calendar search and filters can silently discard a draft

Two reproductions:

1. Open New event, enter a title, expand Find a date or event, and change Starting date. The editor changes date and the title becomes empty. No discard confirmation appears.
2. With an existing event on the selected date, open New event, enter a title, then use Find a contact for this event. Typing into the contact search drops `new=1` from the URL. The new-event draft is replaced by the existing event and the action changes to Save changes. No confirmation appears.

The second case also creates a risk of editing the wrong event after the unexpected context switch; the probe did not overwrite the existing event.

Sources: [live navigation](../../src/components/GlobalLiveSearch.tsx#L49), [guard coverage](../../src/components/FormGuard.tsx#L24), and [Calendar editor identity/search parameters](../../src/app/(app)/calendar/page.tsx#L80). Live filters call `router.replace` directly. The guard covers links, unloading, optional other form submissions and history traversal, but not that replacement. The contact-search form preserves the date and existing edit ID, not new-event mode.

Suggested correction: preserve the active editor and its draft while filtering the directory; retain new/edit/contact context in search URLs. Apply the same unsaved-change policy to programmatic navigation that can replace the editor.

### 2. Medium — Calendar accepts edits during saving, then drops them

With a simulated 900ms request delay, save a new event titled “Before pending save”, then change the title to “Edited while save was pending”. The field remains editable. On successful redirect, both the database and visible editor contain the original title; the later edit is lost without warning.

Sources: [submit snapshot](../../src/components/CalendarEntryForm.tsx#L63), [editable fields](../../src/components/CalendarEntryForm.tsx#L72), and [pending save button](../../src/components/CalendarEntryForm.tsx#L101).

Suggested correction: either lock editable controls for the submitted snapshot or retain subsequent edits as a separate unsaved revision after the response. Do not silently discard changes accepted by the UI.

### 3. Medium — Rapid contact preference changes conflict with themselves

On a contact profile, change Priority to High and immediately change Prefers to Email. With a simulated 750ms request delay, two requests submit the same version. High saves, Email does not, and the page reports “This relationship state changed in another tab.” There was only one tab. The stored preferred channel remains unchanged.

Sources: [automatic submissions and version field](../../src/components/ContactRelationshipStatePanel.tsx#L26) and [version validation](../../src/lib/contact-state-actions.ts#L72).

Suggested correction: serialize or coalesce preference changes against the latest version, retain pending selections, and provide visible saving/error feedback. Keep optimistic concurrency protection for actual cross-tab changes.

### 4. Medium — Quick Add has no direct recovery after a committed save loses its response

The probe let the real Quick Add request commit, then dropped its response. The dialog showed the raw message “Failed to fetch”. After editing the proposed name and retrying, it showed “This capture was already saved. Open its person before adding more items.” The person did exist, but the dialog supplied no link to it and no receipt/recovery action.

Sources: [receipt/hash handling](../../src/lib/quick-capture.ts#L36), [API error response](../../src/app/api/quick-capture/route.ts#L27), and [client error handling](../../src/components/QuickAdd.tsx#L96).

The duplicate-protection check is functioning; the gap is the recovery experience. Suggested correction: expose an authorized lookup or return the saved receipt with the conflict so the user can open the saved result and handle later edits deliberately. Do not automatically retry with a new key after an unknown outcome.

### 5. Medium — Reloading Quick Add loses an unsaved capture without warning

Enter a capture, reload the page, then reopen Quick Add. The capture is empty and no discard warning appeared. The close button and Escape do ask before discarding, so the reload behavior is inconsistent.

Source: [local draft state and close-only confirmation](../../src/components/QuickAdd.tsx#L31).

Suggested correction: add unsaved-navigation protection for the capture and review stages. Persistent storage of private draft contents is a separate privacy/product decision and is not required to provide a warning.

## Additional risks requiring verification

- A stalled Quick Add POST has no explicit timeout/recovery mechanism, and its saving state prevents closing the modal. This is apparent from the request/close paths but was not exercised as a prolonged outage in this pass.
- WebKit, Firefox, real-device software keyboards and actual browser zoom remain coverage gaps. They are not confirmed failures. Earlier checks used Chromium and CSS text enlargement.

## Evidence and limits

The isolated probe exercised six paths (two Calendar navigation paths plus the other four findings), checked saved values in the database, captured dialogs and screenshots, and deleted its fixture workspace/user afterward. Simulated delays and a deliberately dropped response were confined to the local browser requests. The first attempt stopped on a test locator that targeted a visually hidden radio; the completed run clicked its visible label.

Evidence: `.artifacts/design-risk-review-20260920/probe.ts`, `probe.log`, `findings.json`, `calendar-lost-draft.png`, `calendar-contact-search.png`, `rapid-preferences.png`, and `capture-recovery.png`. The prior layout/workflow checks remain valid for their tested scenarios; these additional state-transition cases were not covered by them.
