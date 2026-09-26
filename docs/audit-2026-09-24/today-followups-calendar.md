# Today, follow-ups and calendar audit — 2026-09-24 (d70ec54)

## Scope and method

Read-only static review of the worktree at `the repository` (commit d70ec54). No build, server, test runner or network was used; `node -e` was used twice for pure computations (the DST day-count and the merge-chip regex).

Read end to end:

- Today: `src/app/(app)/jumps/page.tsx`, `src/components/JumpWorkflow.tsx`, `EditableFollowUpAction.tsx`, `JumpActionControls.tsx`, `FollowUpChannelChoice.tsx`, `MergeFieldText.tsx`, `Sheet.tsx`, `TodayNavigation.tsx`, `useTodayUpdates.ts` (triggers only), `WorkflowOutcomeFields.tsx`, `WorkflowAttention.tsx`, `PreparationNotice.tsx`, `src/lib/today-list.ts`, `opened-jump-state.ts`, `jump-drafts.ts`, `jump-attempts.ts`, `jump-variants.ts`, `draft-segments.ts`, `preparation-variants.ts`, `preparation-family.ts`, `variant-generation.ts`, `jump-render.ts`, `workflow-attention.ts`, `preparation.ts`.
- API: `src/app/api/jumps/[jumpId]/{outcome,draft,variant,attempts,completed-at,actions}/route.ts`, `src/app/api/follow-ups/preparation/route.ts`, `src/app/api/settings/sending-preview/route.ts`.
- Engine: `src/lib/jump-engine.ts`, `step-timing.ts`, `automatic-delivery.ts`, `mix-workflow.ts`, `mix-workflow-engine.ts`, `snooze-actions.ts`, `snooze-schedule.ts`, `jump-schedule.ts`, `workflow-scheduling.ts` (step time only), `src/worker/index.ts`.
- Quick capture: `QuickAdd.tsx`, `DeviceContactQuickAdd.tsx`, `VoiceNoteButton.tsx`, `QuietDaySuggestions.tsx`, `src/lib/quick-capture.ts`, `quiet-days.ts`, `src/app/api/{quick-capture,contacts/quick-add,quiet-days}/route.ts`.
- Calendar: `src/app/(app)/calendar/page.tsx`, `CalendarEntryForm.tsx`, `src/lib/calendar.ts`, `calendar-actions.ts`, `calendar-ical.ts`, `calendar-time.ts`, `calendar-availability.ts`, `calendar-feed-fetch.ts`, `src/app/api/calendar/{availability,export,feed/[token]}/route.ts`.
- Notifications: `src/app/api/notifications/{subscribe,test}/route.ts`, `src/lib/follow-up-push.ts`, `notification-delivery.ts`, `notification-actions.ts`, `push-request-context.ts`, `PushNotificationControl.tsx`, `public/sw.js`.
- Schema: `Jump`, `JumpDraft`, `JumpAttempt`, `AutomatedDelivery`, `IdempotencyKey`, `FollowUpPushDelivery`, `PushSubscription`, `NotificationPreference`, `CalendarEntry`, `CalendarPreference`, `CalendarConnection`, `AppointmentBinding`, `WorkspaceMember`/`WorkspaceRole`.
- Design authority: `docs/design/jump-in-the-mix-designs/screens/{Main,Review,TodaySent}.html` (text and 11px usages), `docs/design/DESIGN_GUIDELINES.md` line 45. Prior audits: the P2 lists in `docs/UI_UX_DEEP_GAP_AUDIT_2026-09-23.md`, plus `CHANNEL_VERSIONS_FOR_EVERY_BEAT_2026-09-23.md` and `UI_UX_WORKFLOW_AND_ICON_AUDIT_2026-09-22.md` for context; git history was used to date the workflow-undo reversal (6c8927d, 2026-09-21).

Could not check statically: how iOS and Android actually parse the generated `sms:`/`tel:` links (physical devices have not been run per the project's own records), real push delivery, worker timing under load, Postgres query plans for the unbounded reads noted below, rendered CSS at each breakpoint (font sizes are read from the stylesheets, not measured), and the Playwright suites (not run by rule).

Prior-audit items 1, 2, 5, 7, 8, 9, 10 are not re-reported. Of the open P2 items handed to me, each gets a verdict below (F3, F5, F6, F7, F8, F9, F10, F11 and the "Checked and fine" list).

## Findings (ranked, most severe first)

### F1. A failed automatic delivery is silent, never retried, and Today keeps implying it will send
- Severity: P1
- Status: VERIFIED
- Evidence:
  - `src/lib/automatic-delivery.ts:266-272` — any provider or recipient error marks the `AutomatedDelivery` row `FAILED` with an `error` string and leaves the Jump `PENDING`.
  - `src/lib/automatic-delivery.ts:185-189` — on the next pass the claim returns `null` when a previous row exists unless it is `CANCELED` without a `providerId`; a `FAILED` row is therefore never retried. `:94-102` does the same for a lease that expired mid-send ("not retried to prevent a duplicate").
  - `src/app/(app)/jumps/page.tsx:168-176, 318` — the page never reads `AutomatedDelivery`; the status text is computed from the automation preference alone, so the follow-up still reads "Automatic sending enabled" (and that pill is hidden anyway, see F2). `AutomatedDelivery` has no Prisma relation to `Jump` (`prisma/product-platform.prisma`), so nothing on Today can currently see it.
  - The only surface that mentions it is the settings preview: `src/app/api/settings/sending-preview/route.ts:32` says "An earlier delivery attempt is recorded. Review its status" — but there is no page that shows that status or the stored `error`.
- Failure scenario: automation on for texts; Twilio rejects a message (unverified destination on a trial account, carrier block, 1,600-character limit at `:54`) or the worker restarts mid-send. The follow-up stays in Today looking like every other item; the owner, who turned on automatic sending precisely so he does not have to review each text, assumes it went out. The customer never hears from him and the Beat quietly ages into "Overdue" with no explanation.
- Fix: in `page.tsx`, alongside `readJumpDrafts`, load `prisma.automatedDelivery.findMany({ where: { workspaceId, jumpId: { in: pendingIds } }, select: { jumpId, status, error, deliveredAt, updatedAt } })`. For a `FAILED` row render a visible notice in the review composer (above the action bar) and force the status to "Manual · you send": "Automatic sending failed on {date}. Send it yourself from here." with a plain-language mapping of the stored error (missing recipient, empty message, provider rejected). Consider showing the same on the card's `jump-meta` (see F2 for placement). Separately decide whether transient provider failures (5xx, timeout) should be retried once after the lease window; today nothing is.
- Effort: M; Risk: low; Needs migration: no; Needs owner decision: yes (retry policy)
- Tests: unit test for the status/notice computation given a `FAILED` row; e2e (isolated DB) seeding a `FAILED` `AutomatedDelivery` for a due follow-up and asserting the notice and "Manual · you send"; a worker test asserting `FAILED` rows are not re-claimed (documents current behavior) or are retried per the decision.

### F2. Automatic-sending state and its send time are invisible on Today at every width
- Severity: P1
- Status: VERIFIED
- Evidence:
  - `src/app/(app)/jumps/page.tsx:318` — the card computes "Automatic sending enabled" / "Held for your review" / "Manual · you send" into a `.status-pill`.
  - `src/styles/design-workspaces.css:314` — `.today-page .jump-meta .status-pill, .today-page .channel-pill { display: none; }` unconditionally; `:102` repeats it inside the phone media query. Nothing else renders the automatic state: the review shows it only once a draft exists (`EditableFollowUpAction.tsx:414`) or another channel was chosen (`page.tsx:259-265`).
  - The eligible send time is never computed for display: `page.tsx:171` selects only `enabled/emailEnabled/smsEnabled` (not `reviewWindowMinutes`) and `today-list.ts:44-66` does not select `createdAt`, although `automaticDeliveryEligibleAt` (`automatic-delivery.ts:26-28`) is the exact rule the worker uses.
  - Design conflict: the export (`Main.html`, `Review.html`) shows no status element on a card or in the review, while `docs/design/DESIGN_GUIDELINES.md:45` requires "automatic-delivery holds remain visible". The implementation followed the export and lost the guideline.
- Failure scenario: automation on with a 30-minute window. At 9:50 the plumber opens the 9:30 follow-up, reads the text and decides to call at lunch instead; nothing tells him it goes out at 10:00. The text sends at 10:00, he calls at 12:30, and the customer hears twice. Conversely a follow-up that is held (invite, appointment binding without automatic delivery, missing method) looks identical to one that will send.
- Fix: keep the card as designed and put the state in the review, directly above `.review-action-bar`: "Sends automatically at {time} unless you send, snooze or skip it first" / "Held for your review: {reason}" / nothing for manual accounts. Add `reviewWindowMinutes` to the automation select and `createdAt` to the Today select, compute `eligibleAt = automaticDeliveryEligibleAt(scheduledAt, createdAt, reviewWindowMinutes)` (respecting quiet hours as `sending-preview/route.ts:28-30` does), and render it with `formatDateTime`. Turn the hidden card pill into `sr-only` text or remove it so the code stops claiming a status nobody can see.
- Effort: M; Risk: low; Needs migration: no; Needs owner decision: yes (placement: review only, or also a small card marker)
- Tests: e2e with automation enabled asserting the review shows the eligible time and that a drafted/held follow-up shows the hold reason; snapshot at 320/390/768/1194 to confirm the card stays as designed.

### F3. A new request id per attempt turns a lost response into a false "no longer pending" failure
- Severity: P1
- Status: VERIFIED
- Evidence:
  - `src/components/JumpWorkflow.tsx:45-47, 64-67` — `requestId()` is called inside `saveOutcome`, so every click, including a retry, is a new idempotency key.
  - `src/app/api/jumps/[jumpId]/outcome/route.ts:134-139, 232-236, 329-339` — replay only matches the same key; a retry after the first request committed finds the Jump already `DONE`, `updateMany` returns 0, and the client gets 409 "This follow-up is no longer pending."
  - `JumpWorkflow.tsx:69-72` — `dispatchJumpState` runs only after a successful response, so after a lost response the card stays `ACTIVE` (the Undo placeholder never appears) and the tray keeps its session (`:303-331`), showing the error; tapping "Later" leaves the persistent "Outcome not recorded for {name}" strip (`:334`) although it was recorded.
- Failure scenario: the owner taps "Sent" in the return tray on a weak signal; the request commits but the response times out. He taps again and reads "This follow-up is no longer pending." under a card that still looks pending; the tray never advances to the next handoff; a third tap on the card's "Mark sent" errors the same way until he reloads.
- Fix: create the id once per logical attempt and reuse it until success: in `JumpOutcomeButton` a `useRef<string | null>` cleared after success; in the tray derive it from the handoff (`outcome:${session.attemptId}` when present, else a ref keyed by `session.jumpId + openedAt`), and pass it into `saveOutcome`. Also let the route include the current status in the 409 body (`{ error, status: jump.status }`) so the client can treat "already DONE/SKIPPED" for a completion outcome as success and dispatch `jitm:jump-state`.
- Effort: S; Risk: low; Needs migration: no; Needs owner decision: no
- Tests: component test with a mocked `fetch` that rejects once then resolves `{ duplicate: true }` on the same body; route test posting the same `requestId` twice and asserting `duplicate: true`; e2e using Playwright's route abort on the first outcome POST.

### F4. Handoff links are built from the display phone and rely on `?body=`
- Severity: P2
- Status: VERIFIED (link construction) / SUSPECTED (device behavior)
- Evidence:
  - `src/components/EditableFollowUpAction.tsx:43-49` — `sms:${phone}?body=…`, `tel:${phone}`, `https://wa.me/${phone.replace(/\D/g, "")}`; `phone` is the raw stored value.
  - `src/lib/today-list.ts:58` selects `phone` (display) not `normalized`; `src/lib/contact-actions.ts:181` stores the user's typed value in `phone` and digits in `normalized`; `contact-input.ts` `normalizePhone` keeps `+` only when typed.
  - The e2e fixtures use E.164 (`e2e/follow-up-drafts.spec.ts:66` expects `sms:+15550100200?body=`), so tests never exercise a real-world "(555) 555-0123".
- Failure scenario: a contact typed as "(555) 555-0123" yields `sms:(555) 555-0123?body=…` (spaces are not percent-encoded in an opaque-path URL) and `https://wa.me/5555550123` without a country code, which WhatsApp rejects as invalid. On iOS the `?body=` form (rather than `?&body=`) has a history of being ignored on some versions; the app would open Messages with an empty body and the owner would retype the message. Physical devices have not been run per the project's records.
- Fix: select `normalized` in `today-list.ts` and use it (with `+` and a default country code when absent) for `tel:`, `sms:` and `wa.me`; emit `sms:${e164}?&body=…`; keep the display phone only for the "To {phone}" hint at `:386`. Update the e2e expectation accordingly.
- Effort: S; Risk: low; Needs migration: no; Needs owner decision: yes (default country code)
- Tests: unit test for `composeUrl` with formatted, dashed, international and missing-country inputs; a device pass on iOS Safari and Android Chrome recorded in the release notes.

### F5. "won't send automatically" appears before the hold exists
- Severity: P2
- Status: VERIFIED
- Evidence: `src/components/EditableFollowUpAction.tsx:149` (`hasDraft = saved.revision !== null || unsaved`) and `:414` show the held note on the first keystroke; the worker holds only on a saved `JumpDraft` row (`src/lib/automatic-delivery.ts:152` and the pre-send recheck at `:219`). While the save is `retrying`, `signed-out` or `unavailable` (`:207-224`) the note still claims the follow-up is held.
- Failure scenario: an already-eligible follow-up (past its review window) is opened and edited while the session has expired; the editor says "waits for you and won't send automatically", the PUT fails with 401, and the next worker minute sends the plan's original wording.
- Fix: gate the held note on `persists && saved.revision !== null`; while `unsaved` show "Saving your edit… it holds automatic sending once saved"; when `status` is `retrying`/`signed-out`/`unavailable` and `automaticDelivery` is true, show a warning "Not held yet: this follow-up can still send automatically" (`data-follow-up-held="pending"` so tests can target it).
- Effort: S; Risk: low; Needs migration: no; Needs owner decision: no
- Tests: extend `e2e/follow-up-drafts.spec.ts:175` with the PUT route held (no note until 200) and with a 401 (warning shown).

### F6. Skip has no confirmation; the Done list's "Undo" is unbounded and reopens automatically sent follow-ups
- Severity: P2
- Status: VERIFIED
- Evidence:
  - `src/app/(app)/jumps/page.tsx:287, 334` — Skip is a plain `JumpOutcomeButton`; the `confirmation` prop that exists at `JumpWorkflow.tsx:162, 182` is not passed. The 10-second Undo placeholder (`JumpWorkflow.tsx:111, 136-150`) is the only safety net; it is reachable on phones because the card and its modal sheet unmount when the outcome lands.
  - `page.tsx:325` renders Undo for every completed item regardless of age or `completionMethod`; the route (`outcome/route.ts:210-216`) reopens any `DONE`/`SKIPPED` row. For an `automatic:*` completion the `AutomatedDelivery` row has a `providerId`, so the worker never resends (`automatic-delivery.ts:187`): the reopened row sits pending, still classed as "Automatic sending enabled", after the customer already received the message.
  - Prior-audit claim "Undo doesn't reverse a connected Mix that already started": the reversal exists. `mix-workflow-engine.ts:83-95` (`observeWorkflow`) reactivates the run and calls `invalidateWorkflowEvaluation` (`:60-67`) → `cancelWorkflowTransition` (`:46-58`) cancels the child run and its non-terminal visits, and `mix-workflow.ts:229-237` cancels their Jumps (`workflow_updated`/`workflow_stopped`). It was added in 6c8927d on 2026-09-21. Child Beats already completed stay as history by design; a child message that was already sent automatically cannot be recalled.
- Failure scenario: on a phone the Skip button sits beside "Mark sent" and "Snooze" in the review action bar; a mis-tap skips the Beat and the 10-second toast is the only recovery. Weeks later, "Undo" on a Done item that was sent automatically reopens it; the owner, seeing it pending, texts the customer a second time.
- Fix: (a) keep Skip confirmation-free only if the owner accepts the 10-second Undo as sufficient; otherwise pass `confirmation="Skip this Beat?"` for the review-sheet Skip only. (b) In the Done list label the control "Reopen" and hide it (or show "Sent automatically · can't be undone") when `completionMethod` starts with `automatic:`.
- Effort: S; Risk: low; Needs migration: no; Needs owner decision: yes (Skip confirmation)
- Tests: e2e asserting the Done list shows "Reopen" for an old item and no control for an `automatic:*` completion; keep the existing skip-then-undo flow green.

### F7. Discarding a saved draft has no confirmation and no undo
- Severity: P2
- Status: VERIFIED
- Evidence: `src/components/EditableFollowUpAction.tsx:412` calls `discard()` directly; `:287-325` sends `DELETE` and `src/lib/jump-drafts.ts:184` deletes the row. The edited wording is gone from the server and, unless the owner typed meanwhile (`:302-303`), from the screen.
- Failure scenario: the owner rewrote a text over two evenings; "Discard edits" sits in the draft-status row next to "Saved"; one tap replaces it with the plan's wording with no way back.
- Fix: wrap in `useConfirmDialog` ("Discard your edits? The Mix's wording comes back.", danger) or keep a 10-second "Undo" that re-`PUT`s the captured `before` source with `revision: null`.
- Effort: S; Risk: low; Needs migration: no; Needs owner decision: no
- Tests: update the three e2e call sites that click "Discard edits" (`follow-up-drafts.spec.ts:72,153`, `today-navigation.spec.ts:226,425`) for the confirmation step.

### F8. No "Contact saved" confirmation when returning to Today from "Add phone/email"
- Severity: P2
- Status: VERIFIED
- Evidence: `src/lib/contact-actions.ts:338-340` redirects to the validated `returnTo` (`/jumps?jump=…&range=all`) unchanged; `src/app/(app)/jumps/page.tsx:360-369` has no notice for it, so the owner lands back on the review with no acknowledgement that the phone number was saved (the "Add phone" button is simply gone).
- Failure scenario: the owner adds a number, is sent back to the follow-up, and is not sure the save happened; on a slow connection he goes back and adds it again.
- Fix: `redirect(withParam(todayReturn, "contactSaved", "1"))` (the `withParam` helper in `snooze-actions.ts:19-21` is the pattern) and `{params.contactSaved && <Notice type="success">Contact saved. The follow-up below now uses the new details.</Notice>}` in `page.tsx`.
- Effort: S; Risk: low; Needs migration: no; Needs owner decision: no
- Tests: e2e round trip from a follow-up missing a phone → edit → back to Today asserting the notice and the enabled "Open text" link.

### F9. Archive and archive-Undo double submit turn a success into an error (contacts scope, verified as requested)
- Severity: P2
- Status: VERIFIED
- Evidence: `src/app/(app)/contacts/page.tsx:250` — the Undo form uses a plain `<button>`; `src/lib/contact-lifecycle-actions.ts:19-22` and `:55-56` — the second submit finds no matching row and redirects with "Contact not found." / "Archived Contact not found.", replacing the success notice.
- Failure scenario: a double tap on a phone restores the contact and then shows an error banner; the owner restores again from Archived and sees another error.
- Fix: use `FormSubmitButton` (`src/components/FormSubmitButton.tsx`) for both forms and make restore idempotent: if the contact exists in the workspace and `archivedAt` is already null, redirect to `?restored=1`.
- Effort: S; Risk: low; Needs migration: no; Needs owner decision: no
- Tests: e2e double-click on Undo asserting one success notice and no error.

### F10. Merge-field chips: `{{ }}` renders an empty chip and every chip claims "Filled in automatically"
- Severity: P2
- Status: VERIFIED (by regex evaluation)
- Evidence: `src/components/MergeFieldText.tsx:5-8`; evaluating the regexes on `Hi {{ }} and {{First Name}}` yields a chip whose text is a single space for `{{ }}`. The `title` promises a value the contact may not have. Used only on Mix previews (`MixBeatPreview.tsx:13`, `MegaMixPreview.tsx:18`), not on Today, which renders real values.
- Failure scenario: a Beat with a stray `{{ }}` shows a blank pill in the preview; a `{{Company}}` chip says "Filled in automatically" for a contact without a company (the render falls back to "your business" at `jump-render.ts:85`, which is at least not blank; `{{My Website}}` renders empty).
- Fix: regex `\{\{\s*([^{}\s][^{}]*?)\s*\}\}` for both split and match; title "Filled in from the person or your business details when you send; blank when that detail is missing".
- Effort: S; Risk: low; Needs migration: no; Needs owner decision: no
- Tests: unit test for `{{ }}`, `{{First Name}}` and `{{ contact.custom.x }}`.

### F11. Visible 11px text on Today outside the design's use of it
- Severity: P2
- Status: VERIFIED (stylesheets; not measured in a browser)
- Evidence: `src/styles/phone-icons.css:85` sets `.channel-recommended` (the "Recommended" tag in the review) to `.6875rem` (11px). `design-workspaces.css:309` sets the card initials to 11px, but they are `aria-hidden` decoration. The design export uses 11px only for the bottom-nav labels (`Main.html`, four inline styles); `Review.html` has no "Recommended" tag at all. The 10px rule at `design-workspaces.css:499` touches no text (the overflow icon is sized at `phone-icons.css:21`).
- Failure scenario: the one word that tells the owner which version Today will open is the smallest text on the screen.
- Fix: `.channel-recommended { font-size: .75rem; }`; leave the decorative initials.
- Effort: S; Risk: low; Needs migration: no; Needs owner decision: no
- Tests: visual snapshot of the review at 390px.

### F12. "N days overdue" is off by one across a daylight-saving change
- Severity: P2
- Status: VERIFIED (computed)
- Evidence: `src/app/(app)/jumps/page.tsx:277` divides elapsed milliseconds by 86,400,000. With `startToday` = 2026-03-09 00:00 America/New_York and `scheduledAt` = 2026-03-07 23:30 America/New_York, the difference is 23.5 h, so the card says "1 day overdue" although the calendar distance is two days (checked with `node -e`).
- Failure scenario: for a day after each spring-forward, evening follow-ups from two days earlier read as one day late.
- Fix: compute the difference between logical dates: `const dueDay = logicalDateInTimezone(followUp.scheduledAt, timezone); const days = Math.round((Date.UTC(today.year, today.month - 1, today.day) - Date.UTC(dueDay.year, dueDay.month - 1, dueDay.day)) / 86_400_000);`.
- Effort: S; Risk: low; Needs migration: no; Needs owner decision: no
- Tests: unit test with the March 2026 fixture above and a November fall-back fixture.

### F13. Race between an automatic send in flight and the owner marking the same follow-up
- Severity: P2
- Status: SUSPECTED
- Evidence: `src/lib/automatic-delivery.ts:219-228` rechecks the row then calls the provider; `src/app/api/jumps/[jumpId]/outcome/route.ts:232-238` does not look at `AutomatedDelivery` at all, so "Mark sent"/"Skip" succeeds while a `PROCESSING` row exists, and the worker's final transaction records `jumpWasPending: false` (`:234-237, 255`) but the message has already gone. Today has no "sending now" state.
- Failure scenario: within the few seconds of a Twilio call the owner texts the customer from his phone and taps Sent; the customer gets both texts. Probability is low; consequence is the exact thing the product promises not to do.
- Fix: in the outcome route, when an `AutomatedDelivery` row for the jump is `PROCESSING` and its `lockedAt` is fresher than `uncertainLeaseMs`, return 409 "This message is being sent automatically right now. Refresh in a moment." and show "Sending…" on the card while such a row exists.
- Effort: M; Risk: low; Needs migration: no; Needs owner decision: yes
- Tests: route test with a seeded `PROCESSING` row; worker test unchanged.

### F14. Unbounded reads on two hot paths
- Severity: P2
- Status: SUSPECTED (scale-dependent)
- Evidence: `src/lib/follow-up-push.ts:75-79` loads every due `PENDING` jump for the workspace (no `take`) with nested deliveries, per subscription, every minute; the `slice(0, batchSize)` at `:80` happens after loading. `src/lib/workflow-attention.ts:35-58` walks all `ACTIVE` workflow instances (250 per page, JSON `state` parsed for each) on every Today render (`page.tsx:173`) and again in the digest.
- Failure scenario: an account with a few thousand never-actioned follow-ups or hundreds of active journeys pays a growing cost per Today load and per worker minute; nothing breaks first, it just slows.
- Fix: push: bound the query (`take: batchSize * 3`, oldest first) and track a per-subscription high-water mark; attention: store a small denormalized `attentionCount`/`nextCommitmentAt` on `MixWorkflowInstance` when the engine writes state, and read only rows with a due marker.
- Effort: M–L; Risk: medium; Needs migration: yes (for the denormalized markers); Needs owner decision: no
- Tests: query-count assertions in the worker tests; a fixture with 2,000 due jumps for the push pass.

### F15. Small honesty gaps in labels
- Severity: P2
- Status: VERIFIED
- Evidence: "Later this week" (`page.tsx:396`) counts a rolling seven days (`:124, 163`), not the calendar week; the Done summary shows `completed.length || completedTodayCount` (`:397`), so on a page with completed items the number is the page's items, not today's total; the calendar "Disable subscription" (revoke) button (`calendar/page.tsx:93`) has no confirmation while "Replace private link" does, and one tap breaks every calendar app subscribed to it; the DST ambiguous-hour message (`calendar-time.ts:22`) tells a tradesperson to "Choose UTC as the timezone".
- Failure scenario: counts that do not match what the owner sees when expanding; an accidental tap kills the calendar feed; a plumber booking 1:30 AM on fall-back day is asked to think in UTC.
- Fix: label "Next 7 days"; use `completedTodayCount` consistently in the due view; wrap revoke in `ConfirmDialog`; offer "first / second 1:30 AM" radio choices instead of the UTC instruction.
- Effort: S each; Risk: low; Needs migration: no; Needs owner decision: yes (DST wording)
- Tests: unit test for the Done count; e2e for the revoke confirmation.

## Checked and fine

- Outcome idempotency: key created inside the same transaction, replay on race (`outcome/route.ts:200-207, 317-324, 329-335`); rate-limited (`:110-122`).
- Draft concurrency: optimistic revisions, create-once on `P2002`, conflict payload returns the other version (`jump-drafts.ts:146-176`); the editor keeps local wording and offers an explicit choice (`EditableFollowUpAction.tsx:207-210, 265-283`); saves and discards are serialized (`:159-165`).
- Handoff attempts: create-once by client UUID, payload hash on retry, recipient must be a stored method, never delays the phone (`jump-attempts.ts:118-186`, `JumpActionControls.tsx:78-88`).
- Automatic delivery safety: contact row lock and one `PROCESSING` per contact, recheck of draft/selection/DNC/stop/preference before the provider call, email idempotency key, expired lease marked failed rather than resent (`automatic-delivery.ts:94-102, 179-224, 80`).
- Quick Add: idempotent by `requestId` with payload hash and a receipt on mismatch (`quick-capture.ts:32-41, 95`); the follow-up is `manualOnly` on a `ONE_TIME` mix that reconciliation never touches (`:84-90`, `jump-engine.ts:174-181`); the dialog reuses the same id on retry (`QuickAdd.tsx:136`).
- Snooze: guarded on the snooze it read, never earlier than the scheduler's base (`snooze-actions.ts:59-71`); reconciliation and workflow steps keep the floor (`jump-engine.ts:639-640`, `workflow-scheduling.ts:10`); offered presets are pre-filtered so none is refused (`snooze-schedule.ts:185-212`).
- Reconciliation: updates guarded on `status` and `updatedAt` (`jump-engine.ts:675-699`); snoozes and drafts carried onto regenerated rows (`:278-292, 646-673`); appointment holds keep rows out of the stale pass (`:703-740`).
- Day boundaries: computed from the user's saved timezone with logical dates (`page.tsx:121-125`), DST-safe; the timezone is captured from the browser at onboarding and on skip (`onboarding-actions.ts:61, 124, 134-146`).
- Workflow Undo: reopening a Beat reactivates its run and cancels dependent transitions and their pending Beats (`mix-workflow-engine.ts:83-95, 46-67`; `mix-workflow.ts:229-237`).
- Calendar feed: 32-byte token, format check, hash lookup, owner-created entries only, titles and times only, `no-store`, no referrer (`feed/[token]/route.ts`); export requires a session and refuses impersonation.
- Calendar subscriptions: HTTPS only, DNS pinned against rebinding, private ranges blocked, 1 MB cap, two redirects (`calendar-feed-fetch.ts`); import bounds and floating-time handling (`calendar-ical.ts:8-45`).
- Calendar conflicts: the picker and the save share one rule (`calendar-availability.ts`, `calendar.ts:29-36`); edits and cancels are version-guarded; bound follow-ups are re-anchored through a queued pass.
- Push: endpoint allow-list, subscriptions bound to the session and rechecked before send, receipts keyed by subscription+jump+due time so a reminder fires once per due time and again after a snooze, quiet hours respected, the service worker confirms scope before showing text (`follow-up-push.ts`, `notification-delivery.ts:351-356`, `public/sw.js:58-82`).
- `WorkspaceRole` has only `OWNER`, so the per-workspace notification `userId` cannot be taken over by another member.
- Skip/Done Undo placeholder is reachable on phones: the card and its modal sheet unmount when the outcome lands, so the 10-second toast is not behind a modal.
- Accessible names: "Later" → "Record outcome later" (`JumpWorkflow.tsx:346`) and the profile initial → "Open profile menu for {name}" (`AppShell.tsx:72`) both contain their visible label; optional polish only.
- Preparation: status read before the list to avoid a stale "ready" (`page.tsx:151-152`); retry limited to 3 per 5 minutes; the notice stops polling after 60 s and reports "delayed" (`PreparationNotice.tsx:31-43`).
- Today updates never reorder the list under an open draft or an active Undo (`today-update-state.ts`, `useTodayUpdates.ts:48-49`).
- Draft guard on navigation covers only unsaved keystrokes (`TodayNavigation.tsx:31-35`), so a saved draft never blocks leaving.
- `wa.me` opens in a new tab; `mailto:` subject and body are percent-encoded (`EditableFollowUpAction.tsx:44-47`).

## Open questions for the owner

1. Where should the automatic-sending state and send time live on Today: the review only (keeps the card exactly as the export), or also a small marker on the card? The export shows neither; the guideline requires holds to stay visible.
2. Should a failed automatic delivery be retried automatically for transient provider errors, or always fall back to "send it yourself" with a notice? Today it does neither.
3. What is the default country code for numbers typed without one? It decides whether `wa.me` and E.164 `sms:` links can be generated for those contacts.
4. Is the 10-second Undo sufficient for Skip, or should the review-sheet Skip ask first? Should old Done items say "Reopen", and should automatically sent items lose the control?
5. Calendar DST ambiguous hour: keep the "choose UTC" instruction or offer "first / second occurrence"?
6. Can a device pass (iOS Safari, Android Chrome) be scheduled to confirm the `sms:` body separator and formatted-number handling before F4 is closed?
