# Lane 2 — Core daily loop

> Raw lane report from the read-only lane reviewer, kept as written. The reconciled severities, merged IDs and runtime labels are in [../FINDINGS_TABLE.md](../FINDINGS_TABLE.md), which takes precedence where the two differ.

**Lane verdict: blocks inviting until LOOP-01 is fixed (or its controls are hidden).** The part of the loop a plumber
repeats all day is sound and honest: Today's review says "Open text / Open email / Call", the tray says "Opening an app
does not send it", message edits are durable drafts, outcomes are idempotent per logical attempt, failed automatic sends
are visible, and Quick Add creates exactly the follow-up it shows. The last step of the canonical loop, "record the
outcome and next promise", does not work: "Schedule the next follow-up" and a non-journey "Rescheduled" write a
"Follow-up" saved date that only date-triggered Mixes read, so for most people nothing reaches Today, and for people on
the onboarding starter plan the whole plan replays on the plan's own days and times (LOOP-01). The same root cause makes
"Start mix" on a contact confirm follow-ups that never come (LOOP-02). Automatic email identity and failure wording are
confirmed from this lane but owned by Lane 5 (MSG-01, MSG-02).

Reviewed at production commit `4b5abd8` in `/tmp/jitm-beta-audit-20260926` (read-only; no build, server, tests or
network). Prior-audit inputs read: `docs/audit-2026-09-24/today-followups-calendar.md`, `FINDINGS_TABLE.md`, the
headings of `contacts.md` and `mixes-journey-marketplace.md`, `docs/FULL_AUDIT_2026-09-24.md` §4–§8,
`docs/AUDIT_RELEASE_A2_2026-09-25.md`, `docs/AUDIT_RELEASE_B_2026-09-25.md`, `git log 2377fdd..4b5abd8`, and the Lane 5
and Lane 7 reports (to avoid double reporting). Marketing/ICP files: none opened (not needed for this lane).

## Summary table

| ID | Severity | Label | Title |
|---|---|---|---|
| LOOP-01 | BLOCKER | INFERRED (code path VERIFIED end to end) | "Schedule the next follow-up" and "Rescheduled" never create the promised follow-up: nothing reaches Today for most people; on a starter-plan person the whole plan replays on the plan's own days, times and wording |
| LOOP-02 | HIGH | INFERRED (code path VERIFIED) | "Start mix" / "Add to a mix" on a contact and "Save & schedule follow-up" on Add contact confirm follow-ups that never come for date-triggered plans (the only kind a new owner has), or backdate them to an old saved date |
| LOOP-03 | MEDIUM | VERIFIED (code) / INFERRED (impact) | Turning on automatic sending sends the whole overdue backlog within minutes, oldest first, with wording written for the original day; a Reopen or Undo of a hand-sent follow-up can send it again |
| LOOP-04 | MEDIUM | VERIFIED (code) / INFERRED (UX) | Beats after a visit wait until "Visit happened" is recorded on the Calendar, and nothing on Today asks for it, so they silently never appear |
| LOOP-05 | MEDIUM | VERIFIED (code) / INFERRED (text shown) | Today's in-place actions show raw browser, auth and database text ("Load failed", "Authentication required.", Prisma messages) with no next step; the tray's typed note lives only in memory |
| LOOP-06 | MEDIUM | INFERRED | After importing a customer list, Today stays empty and nothing points the owner to a way of getting the imported people onto it |
| LOOP-07 | LOW | VERIFIED | Quiet hours that cover all working hours can be saved in Personal preferences; follow-up preparation then fails for that workspace and the automatic-send pass aborts for every workspace after it |
| LOOP-08 | LOW | VERIFIED | Calendar "Cancel event", "Hold follow-ups" and "Allow automatic sending" say "Calendar updated." even when nothing changed |
| LOOP-09 | LOW | VERIFIED (still open, prior TOD-F13) | "Mark sent"/"Skip" do not check for an automatic send in flight |

Confirmed from this lane, owned elsewhere (not renumbered): **MSG-01 / BOPS-03** (automatic customer email goes out as
the platform with the operator's Reply-To; addition from this lane: automatic texts, if Twilio is ever configured, go
from the single `TWILIO_FROM_NUMBER`, `automatic-delivery.ts:60`, so text replies would also miss the owner) and
**MSG-02** (Today reads an unconfirmed or budget-refused automatic email as "the provider rejected it. Send it
yourself."; I reproduced the mapping with `node -e`, output under "Automatic sends" below).

## Flows traced

1. **Today → review → phone composer.** `/jumps` `src/app/(app)/jumps/page.tsx:119-465` → `readTodayPage`
   `src/lib/today-list.ts:88-140` (dial target from the stored key, `:75-83`) → card and review `page.tsx:252-393` →
   `EditableFollowUpAction` (`src/components/EditableFollowUpAction.tsx:52-61` link, `:443-459` actions) →
   `JumpActionLink` `src/components/JumpActionControls.tsx:43-93` (closes the sheet, stores the handoff in
   sessionStorage via `rememberOpenedJump`, fires `/attempts` and `/actions` with keepalive) → `sms:`/`mailto:`/`tel:`/`wa.me`.
2. **Return tray → outcome → next promise.** `JumpReturnTray` `src/components/JumpWorkflow.tsx:316-518` (reveal on
   focus/visibilitychange `:339-387`) → `saveOutcome` `:145-163` → `POST /api/jumps/[jumpId]/outcome`
   `src/app/api/jumps/[jumpId]/outcome/route.ts:103-346` (status change `:211-240`, next date → `JumpDate` of the system
   "follow-up" type + `generate-jumps` job `:246-270`, activity `:272-294`, idempotency key `:319-326`) → worker
   `src/worker/index.ts:174-176` → `reconcileJumps` `src/lib/jump-engine.ts:188-755` (assignments `:191-197`,
   date-triggered triggers `:430-442`, step timing `:511-526`).
3. **Mark sent / Skip / Undo / Reopen.** `JumpOutcomeButton` `JumpWorkflow.tsx:252-314`, Undo `:214-228` → same route;
   Done list "Reopen" / "Sent automatically" `page.tsx:374-376`.
4. **Drafts.** Editor autosave/pagehide flush `EditableFollowUpAction.tsx:231-280` → `PUT/DELETE /api/jumps/[id]/draft`
   `route.ts:60-88` → `saveJumpDraft`/`discardJumpDraft` `src/lib/jump-drafts.ts:122-189`; worker hold on a saved draft
   `src/lib/automatic-delivery.ts:159,227`; Today guard `src/components/TodayNavigation.tsx:31-56`.
5. **Channel choice.** `FollowUpChannelChoice.tsx:34-53` → `PATCH /api/jumps/[id]/variant` → `selectJumpVariant`.
6. **Snooze.** Preset/custom forms `page.tsx:327-328,383-384` → `snoozeJumpAction` `src/lib/snooze-actions.ts:25-75`
   → `calculateSnoozeAt`/`resolveSnooze`/`snoozeChoices` `src/lib/snooze-schedule.ts:122-212`.
7. **Quick Add.** `QuickAddDialog` `src/components/QuickAdd.tsx:105-135` → `POST /api/quick-capture` →
   `src/lib/quick-capture.ts:66-101` (one-time Mix, `manualOnly` Jump at the exact chosen instant).
8. **Automatic sends.** `/settings/sending` `src/app/(app)/settings/sending/page.tsx` + `AutomaticSendPreview.tsx` →
   `updateAutomationPreferencesAction` `src/lib/notification-actions.ts:40-91` → worker `runAutomaticDeliveries`
   `automatic-delivery.ts:99-286` → `deliver` `:72-89` → `sendTransactionalEmail` `src/lib/transactional-email.ts:76-121`
   or Twilio `:50-67` → Today failure notice `page.tsx:177-190,293-299,329-332,367` + `src/lib/today-view.ts:44-50`;
   review line `page.tsx:210-221,301` + `src/lib/automatic-delivery-window.ts:55-88`.
9. **Contacts: add and start a plan.** `ContactForm.tsx:200-211` → `createContact` `src/lib/contact-actions.ts:280-382`
   (`initialFollowUpPayload` `:180-204`); `ContactProfile.tsx:142-146,256-258` → `assignMixToContactAction`
   `src/lib/contact-mix-actions.ts:18-62`; contact-page dates `createImportantDateAction`
   `src/lib/important-date-actions.ts:54-131` (auto-assigns a matching Mix — the contrast for LOOP-01).
10. **Calendar and visit-bound plans.** `CalendarEntryForm.tsx` → `saveCalendarAction` `src/lib/calendar-actions.ts:20-37`
    → `scheduleVisit` `src/lib/appointment-bindings.ts:118-166` → worker → binding holds `jump-engine.ts:375-395`;
    outcome `appointmentOutcomeAction` → `recordAppointmentOutcome` `appointment-bindings.ts:171-192`.
11. **Import.** `ContactImportWizardV2.tsx` → `/api/contacts/import` → worker; results `:452-468` →
    `/contacts?importBatch=` (`src/app/(app)/contacts/page.tsx:122-153,275`).
12. **Journey start** (entry point only): `/api/mix-workflow` action `start` → `startWorkflowInstance`
    (`src/app/api/mix-workflow/route.ts:23,75-76`). Not traced further.

## Findings

### LOOP-01 — "Schedule the next follow-up" and "Rescheduled" never create the promised follow-up
- Severity: BLOCKER   · Label: INFERRED (every code link below VERIFIED; user-visible result needs the runtime check)   · Prior: none
- What the user experiences: after a call or text, the tray asks "How did the follow-up with Sam go?". The owner opens
  "Add a note or next follow-up", ticks "Schedule the next follow-up — Pick a day and time to see them again on Today",
  picks Thursday 2 pm (or chooses the outcome "Rescheduled" with Thursday 2 pm) and saves. The tray moves on; the
  contact's timeline shows "Next follow-up: Thu 2:00 PM" and the contact page lists a "Next follow-up" date. Then:
  - For a person who is not on a Mix that starts from a "Follow-up" date (anyone added by Quick Add, imported, started
    on a Journey/Mega-Mix plan, bound to a visit, or added without choosing a plan), **nothing ever appears on Today**,
    no reminder, no push, no digest line. With "Rescheduled" on such a follow-up, the current follow-up is also marked
    done, so the promise disappears entirely.
  - For a person on the onboarding starter plan (or any ready-made home-services plan, all of which start from a
    "Follow-up" date), the **entire plan replays from Thursday using the plan's own day offsets and send times**, not
    the chosen time. For a plumber's default starter "Estimate sent: gentle follow-up" that is a "just checking you
    received the estimate" text on Saturday 10:00 and a call the Thursday after at 11:00, on top of the original
    sequence's remaining call. For "Job done" it is a Thursday 17:00 text "thanks for trusting {Company} today". Every
    later next-promise adds another full replay, and a person on two such plans gets both.
- Reproduction: 1. Complete onboarding at `/onboarding` as a home-services business with "Follow up about an estimate"
  and a first person with a phone. 2. `/jumps?range=all` → Review → "Open text" (the tray appears after about a second
  even where `sms:` does nothing). 3. In the tray: "Add a note or next follow-up" → tick "Schedule the next follow-up" →
  pick a day three days out at 14:00 → "Save outcome". 4. Let the worker run once. 5. `/jumps?range=all&status=pending`:
  expected one follow-up on that day at 2 pm; predicted: "Two-day text" two days after it at 10:00 and "One-week call"
  seven days after at 11:00. 6. Repeat with a Quick Add person ("Call Sam Friday at 9am about the quote"), using outcome
  "Rescheduled": predicted, the follow-up moves to Done and nothing new appears.
- Evidence:
  - `src/components/JumpWorkflow.tsx:505` — "Schedule the next follow-up … Pick a day and time to see them again on
    Today."; `:429-436` sends `nextDate`/`nextTime`; `:484-493` offers "Rescheduled".
  - `src/app/api/jumps/[jumpId]/outcome/route.ts:219` — only a Beat **with** `workflowInstanceId` is moved:
    `} else if (outcome === "RESCHEDULED" && jump.workflowInstanceId && nextCommitmentAt) {`. Otherwise `:233-236` marks
    it `DONE` with `completionMethod: \`outcome:${outcome.toLowerCase()}\``.
  - `route.ts:246-269` — the promise is stored only as a saved date plus a reconciliation job:
    `const followUpType = await tx.dateType.findFirst({ where: { scopeKey: "system", slug: "follow-up", … } })` →
    `tx.jumpDate.create({ … dateTypeId: followUpType.id, … timeMinutes: nextMinutes, recurrence: "NONE" … })` →
    `tx.job.create({ data: { …, task: "generate-jumps", payload: { contactId: jump.contactId } } })`. No Mix assignment,
    no Jump.
  - `src/lib/jump-engine.ts:191-197` — reconciliation reads only active `mixAssignment` rows; `:430-431`
    `} else if (assignment.mix.triggerMode === "DATE_TRIGGERED") { for (const jumpDate of contact.jumpDates.filter((item) => item.dateTypeId === assignment.mix.dateTypeId)) {`
    — a saved date produces Beats only through a date-triggered Mix of that date type already assigned to the person.
    `git grep "jumpDate" src/lib src/worker` shows no other generator.
  - `jump-engine.ts:513` `originalLogicalDate = addLogicalDays(trigger.logicalDate, mixStep.dayOffset);` and `:515`
    `const requestedMinutes = mixStep.sendTimeMinutes ?? trigger.timeMinutes ?? …` — every step of the Mix is placed
    at its own offset, and a step's own send time beats the chosen time.
  - Starter/ready-made plans are date-triggered on "Follow-up" with fixed times: `src/lib/starter-mix.ts:26-29`
    (`triggerMode: "DATE_TRIGGERED", dateTypeId: followUp.id`), `src/lib/onboarding-actions.ts:98-120` (first person's
    date + assignment), `src/lib/vertical-plan-library.ts:27-40` (`plan_home_estimate`: day 2 SMS 600, day 7 call 660),
    `:8-25` (`plan_home_job_done`: day 0 SMS 1020 "thanks for trusting {{My Company}} today").
  - Quick Add follow-ups have no workflow instance and no date-triggered assignment: `src/lib/quick-capture.ts:88-95`.
  - Contrast: the contact page's "Add date" does assign a matching Mix (`src/lib/important-date-actions.ts:75-106`); the
    tray path does not.
  - The UI reinforces the false belief: `src/components/ContactTimeline.tsx:175` renders "Next follow-up: {date}" from
    the activity's `nextCommitmentAt`, and the saved date appears in the contact's "Coming up" list
    (`src/components/ContactProfile.tsx:124-131,228`).
  - The only browser test asserts the saved date, not a follow-up, for a contact with no Mix at all:
    `e2e/jump-outcome-timeline.spec.ts:98` `prisma.jumpDate.count({ where: { contactId, …, label: { contains: "Next commitment" } } })).toBe(1)`.
- Root cause: the next promise is modelled as a "Follow-up" saved date (a Mix trigger) instead of as a follow-up.
- Fix direction: create one `manualOnly` follow-up at exactly the chosen instant on the one-time Mix, as Quick Add does
  (`quick-capture.ts:84-95`), and move non-journey Beats for "Rescheduled" the way journey Beats are moved (`route.ts:219-222`);
  keep the saved date only as history, or drop it. Until then, hide the "next follow-up" controls and "Rescheduled".
- Runtime check for the lead: steps 1–6 above; or, signed in on the test build, run in the console
  `fetch('/api/jumps/<pendingId>/outcome',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({outcome:'COMPLETED',requestId:crypto.randomUUID(),nextDate:'2026-10-01',nextTime:'14:00'})})`,
  run the worker once, then `SELECT "scheduledAt", reason, status FROM "Jump" WHERE "contactId"='<id>' ORDER BY "scheduledAt"`
  and `SELECT "dateValue","timeMinutes",label FROM "JumpDate" WHERE "contactId"='<id>'`. Confirmed if no Jump is at
  2026-10-01 14:00 local.

### LOOP-02 — Plan starts and first follow-ups confirm follow-ups that never come (date-triggered plans)
- Severity: HIGH   · Label: INFERRED (code path VERIFIED)   · Prior: none
- What the user experiences:
  - Contact page → "Start a touchpoint" → "Choose a mix" → "Start mix" (or the "Mixes" card → "Add to a mix") with the
    starter or any ready-made home-services plan. The page says "Start saved. Follow-ups are being prepared." For a
    person with no "Follow-up" saved date (imported, Quick Add, added without a plan), nothing is ever prepared. For a
    person with an older "Follow-up" date (the onboarding date, or a LOOP-01 next-promise date up to ~45 days back), the
    plan is laid out from that old date, so several Beats appear at once as overdue with day-0 wording.
  - Add contact → "First follow-up — Choose when you want this person to appear on Today" → "Save & schedule follow-up"
    with "Just save the date", or with no matching plan ("You can add a mix later."): only a saved date is stored and
    the person never appears on Today. With a plan chosen, the first follow-up appears at the plan's first offset
    (for `plan_home_estimate`, two days after the chosen date).
- Reproduction: 1. Add a contact at `/contacts/new` without scheduling. 2. Open the contact → "Start a touchpoint" →
  choose the starter Mix → "Start mix". 3. Note "Start saved. Follow-ups are being prepared." 4. After the worker runs,
  the contact shows "Nothing scheduled" and Today has nothing for them.
- Evidence: `src/components/ContactProfile.tsx:65` offers every active Mix (`status: "ACTIVE", source: { not: "ONE_TIME" }`,
  no trigger filter); `:144` "Start mix"; `:174` "Start saved. Follow-ups are being prepared.";
  `src/lib/contact-mix-actions.ts:39` `startDate: mix.triggerMode === "MANUAL_START" ? new Date() : null`;
  `jump-engine.ts:430-431` (date-triggered needs a matching saved date); `jump-engine.ts:56` `DEFAULT_PAST_DAYS = 45`
  and `:526` (only the horizon limits backdated Beats); `src/components/ContactForm.tsx:201,210` ("Choose when you want
  this person to appear on Today", "Just save the date", "You can add a mix later.");
  `src/lib/contact-actions.ts:191` `if (!requestedMixId) return { …, mixId: null }` (date without assignment).
  The ready-made "Use" flow is honest about this ("Follow-ups are scheduled around each person's Follow-up",
  `src/components/TemplateUseForm.tsx:115`); the contact page and Add contact are not.
- Root cause: same as LOOP-01 — "Follow-up" is a Mix trigger type, and starting a date-triggered Mix neither asks for
  the date nor warns when none exists.
- Fix direction: on the contact page offer only Mixes that can start now (manual start), or ask for the start date when
  the Mix is date-triggered and never backdate past today; make Add contact's "First follow-up" create a one-time
  follow-up on the chosen day when no plan is chosen.
- Runtime check for the lead: reproduction steps 1–4 on a fresh account; also add a contact with "Schedule a follow-up
  now" + "Just save the date" and check Today.

### LOOP-03 — Turning on automatic sending sends the overdue backlog at once
- Severity: MEDIUM   · Label: VERIFIED (code) / INFERRED (impact)   · Prior: none (related ACC-F5, fixed)
- What the user experiences: an owner who has fallen behind turns on automatic email to catch up. Within the next worker
  minutes every overdue follow-up whose channel is enabled goes out, 25 per minute per workspace, oldest first, however
  old, with wording written for the original day ("just checking you received the estimate" three weeks later). The
  preview is titled "Review the next 24 hours" and lists them as "Eligible from" now. Separately, "Reopen" in the Done
  list (no confirmation) or the 10-second Undo returns a hand-sent follow-up to pending; with automatic sending on, the
  next pass can send the plan's text to the customer a second time.
- Reproduction: 1. On a test account with two overdue email follow-ups, open `/settings/sending`. 2. Tick "Send prepared
  messages automatically" and "Email", click "Preview affected messages". 3. Both appear with "Eligible from" the
  current minute under "Review the next 24 hours".
- Evidence: `src/lib/automatic-delivery.ts:147-156` candidates are `scheduledAt: { lte: threshold }` with no lower
  bound; `:170-171` `orderBy: [{ scheduledAt: "asc" }…], take: candidateLimitPerWorkspace` (25);
  `src/components/AutomaticSendPreview.tsx:13` "<h3>Review the next 24 hours</h3>";
  `src/app/api/settings/sending-preview/route.ts:38-41` (no lower bound either); Reopen `page.tsx:376` and
  `outcome/route.ts:212-218` (back to `PENDING`, no `AutomatedDelivery` row for a manual completion, so
  `automatic-delivery.ts:193-209` will claim it).
- Root cause: eligibility is "due and past the review window", with no notion of "became due before automatic sending
  was on" or "already completed once by hand".
- Fix direction: only auto-send follow-ups that became due after automatic sending was enabled (store the enable time),
  or cap the age (for example 24 h); exclude reopened follow-ups whose earlier completion was manual; say "including N
  overdue" in the preview.
- Runtime check for the lead: reproduction steps 1–3 (no send needed).

### LOOP-04 — After-visit Beats silently wait for "Visit happened"
- Severity: MEDIUM   · Label: VERIFIED (code) / INFERRED (UX)   · Prior: none
- What the user experiences: an owner lines a plan up with a visit (thank-you text, review request after the job). The
  visit time passes. Nothing appears on Today and nothing asks how the visit went; the after-visit Beats stay held until
  the owner opens Calendar → the event → "Event details and actions" → "Visit happened". The booking confirmation does
  say "N beats after the visit wait until you record how it went", but a phone-first owner lives on Today.
- Reproduction: 1. Create a Mix with the cue "When I start it for someone" and a Beat timed after the appointment.
  2. `/calendar` → New event with a person and that plan, starting in the past hour. 3. After the worker runs, Today
  has no after-visit Beat and no prompt. 4. Calendar → event → "Visit happened" → the Beat appears.
- Evidence: `src/lib/jump-engine.ts:388-392` — without `entry.outcome === "COMPLETED"` the after-steps are held
  (`holdBinding(… outcomePending …, mixStepIds: after)`); the only control is inside a collapsed disclosure
  `src/app/(app)/calendar/page.tsx:82` ("Follow-ups after the visit wait until you record how it went."); Today,
  `src/lib/workflow-attention.ts` and `src/lib/today-briefing.ts` never read `calendarEntry` outcomes (grep).
- Fix direction: when a bound visit has ended with no outcome, show a Today item "How did the visit with {name} go?
  Visit happened / No-show" (same action as the Calendar).
- Runtime check for the lead: reproduction steps 1–4.

### LOOP-05 — Raw error text and no next step on Today's in-place actions
- Severity: MEDIUM   · Label: VERIFIED (code) / INFERRED (text shown)   · Prior: none
- What the user experiences: on a weak signal "Mark sent", "Skip beat", "Undo", "Reopen", the tray's "Sent"/"Not sent",
  a channel chip or a completion-time edit shows the browser's own text under the button: "Load failed" (iPhone),
  "Failed to fetch" (Chrome). After a session lapses they show "Authentication required." with no sign-in link. A
  database hiccup inside the outcome transaction (for example an interactive-transaction timeout on the small Postgres)
  is returned verbatim, so a Prisma message can appear under "Mark sent". A note typed in the tray exists only in
  memory; signing in again (or iOS discarding the tab) loses it. The draft editor's "Sign in in a new tab" opens Safari
  from an iOS home-screen app, which does not share the app's session (prior FUN-F10 pattern).
- Reproduction: 1. `/jumps` → Review → DevTools Network "Offline" → "Mark sent". 2. Read the text under the button.
- Evidence: `src/components/JumpWorkflow.tsx:152-159` (`await fetch(...)` with no catch) → `:298-299`
  `setError(reason instanceof Error ? reason.message : …)`; same for Undo `:222-223`, tray `:451-452`;
  `src/components/FollowUpChannelChoice.tsx:41-49`; `outcome/route.ts:106`
  `{ error: "Authentication required." }` and `:341-342` `{ error: error instanceof Error ? error.message : … }`
  (Release D `446aadc` did not touch this route); tray note `JumpWorkflow.tsx:331` (`useState`) only;
  `EditableFollowUpAction.tsx:468` `target="_blank"` sign-in link.
- Fix direction: map network failures to "No connection — nothing was changed; try again" and 401 to "You're signed
  out — sign in (keeps this page)"; return a fixed sentence for non-refusal errors in the outcome route; keep the tray
  note in sessionStorage with the handoff.
- Runtime check for the lead: reproduction steps 1–2 in Chromium and WebKit; also expire the session cookie and tap
  "Mark sent".

### LOOP-06 — After an import, nothing leads to Today
- Severity: MEDIUM   · Label: INFERRED   · Prior: none
- What the user experiences: a plumber imports 200 customers. The results screen offers "Import another file" and
  "View imported Contacts". Today still says "Nothing due right now … Add a person and choose a follow-up date". Getting
  imported people onto Today needs selecting them 50 at a time and using "Message", or building a Mix for everyone;
  quiet-day check-ins that would surface them are off by default.
- Evidence: `src/components/ContactImportWizardV2.tsx:466` (only those two actions);
  `src/app/(app)/contacts/page.tsx:24,275` (50 per page; "Showing Contacts touched by the selected … import.");
  `src/components/ContactsBulkWorkspace.tsx:230-243` (bulk "Message" per selection); `page.tsx:461` (empty state);
  `prisma/personal-preferences.prisma:29` `quietDaysEnabled Boolean @default(false)`.
- Fix direction: an owner decision (see Questions); a cheap option is a results-screen action "Plan a check-in with
  these N people" that opens the bulk message for the whole batch.
- Runtime check for the lead: import a 3-row CSV on a fresh account and look at Today and the results screen.

### LOOP-07 — Quiet hours covering working hours break preparation and the automatic-send pass
- Severity: LOW   · Label: VERIFIED   · Prior: none (Lane 3 may own the worker side)
- What the user experiences: an owner who set working hours (Journey setup) later sets quiet hours 08:00–18:00 in
  Personal preferences → Scheduling defaults. The save succeeds; follow-up preparation for that workspace then fails on
  every pass (Today shows a failed preparation with a Retry that fails again), and if automatic sending is on, the
  worker's automatic-send pass throws at that workspace and skips every workspace after it that minute.
- Evidence: `src/lib/account-preference-actions.ts:55-78` saves quiet hours with no working-hours check (the check
  exists only in Journey setup, `src/lib/journey-preferences.ts:34`); `src/lib/journey-availability.ts:17-18,30` throws
  "No available follow-up time was found" when every working minute is quiet; `jump-engine.ts:518-520` calls it during
  generation; `automatic-delivery.ts:138-141` calls `automaticSendingOpensAt` outside any try inside the per-workspace
  loop; `src/worker/index.ts:332` has one catch for the whole pass.
- Fix direction: apply the Journey-setup rule in `updatePersonalSchedulingAction`; wrap each workspace in the
  automatic pass in its own try/catch.
- Runtime check for the lead: none needed (static); optional: save 08:00–18:00 on an account with Journey working hours
  9–17 and watch the preparation notice.

### LOOP-08 — Calendar actions confirm changes that did not happen
- Severity: LOW   · Label: VERIFIED   · Prior: related TOD-F15 (revoke confirmation, fixed)
- What the user experiences: "Cancel event" on an event edited on another device (stale version), or "Hold follow-ups"
  / "Allow automatic sending" on a binding that no longer exists, lands on "Calendar updated." with nothing changed.
- Evidence: `src/lib/calendar-actions.ts:69-70,76` (`if (!entry) return;` then `redirect("/calendar?saved=1")`);
  `:52-55,59-62` ignore the `false` returned by `setAppointmentBindingHold`/`setAppointmentBindingDelivery`;
  `src/app/(app)/calendar/page.tsx:75` "Calendar updated.".
- Fix direction: redirect with "This event changed. Refresh before cancelling." when nothing matched.
- Runtime check for the lead: open the same event in two tabs, edit in one, cancel in the other.

### LOOP-09 — Manual outcome during an automatic send in flight
- Severity: LOW   · Label: VERIFIED (still open, prior TOD-F13)   · Prior: TOD-F13
- What the user experiences: within the seconds of a provider call the owner taps "Mark sent" after sending by hand;
  both messages reach the customer. Rare; only with automatic sending on.
- Evidence: `outcome/route.ts:233-238` never reads `AutomatedDelivery`; `automatic-delivery.ts:219-236` sends after its
  recheck.
- Fix direction: refuse with "This one is being sent automatically right now" while a fresh `PROCESSING` row exists.
- Runtime check for the lead: none needed.

## Answers to the lane questions

1. **Labels vs effects.** Honest. "Open text / Open email / Call / Open WhatsApp" open the phone app
   (`EditableFollowUpAction.tsx:37-43,52-61`); the hint is "Open your app to send, then record what happened" (`:443`);
   the tray says "Opening an app does not send it" (`JumpWorkflow.tsx:469`); "Mark sent" records the owner's own send;
   Quick Add says "This follow-up is not sent automatically" (`QuickAdd.tsx:162`); bulk "Schedule message" says "say when
   it should appear on Today" (`ContactsBulkWorkspace.tsx:230`). The dishonest confirmations are about scheduling, not
   sending: LOOP-01, LOOP-02, LOOP-08.
2. **Lost work.** Message edits: safe (autosave 700 ms, pagehide keepalive flush, revision conflicts keep local text,
   signed-out state keeps text and says to copy it, navigation guard; `EditableFollowUpAction.tsx:231-280,418-428,468`,
   `TodayNavigation.tsx:31-56`). Contact and Mix forms keep entries on refusals (`ContactForm.tsx:87,162`;
   `MixEditor.tsx:161-168`; validation redirects keep client state because Next keys the page segment without search
   params, `node_modules/next/dist/esm/client/components/layout-router.js:525`). At risk: the tray's note (memory only),
   Quick Add's text across an iOS tab discard (beforeunload only, `QuickAdd.tsx:78-83`), any server-action form when the
   session has lapsed (the action's redirect to `/login` drops the page; sessions last 14 idle / 90 max days,
   `src/lib/env.ts:59-61`). Return from the composer: handoff kept in sessionStorage and re-shown on focus/visibility
   (`opened-jump-state.ts:67-104`, `JumpWorkflow.tsx:339-387`); a cold relaunch of an iOS home-screen app would lose it
   (NOT RUN), leaving the follow-up pending with "Mark sent" still available.
3. **Automatic sends.** Default off, explicit consent and a required preview (`settings/sending/page.tsx:33,39`,
   `notification-actions.ts:52-55`, `AutomaticSendPreview.tsx:13`); only email can be switched on in production because
   `render.yaml` has no `TWILIO_*` keys and the option is disabled when unconfigured (`page.tsx:31-36`,
   `notification-actions.ts:60-67`). Worker: quiet hours (default 20:00–08:00, row created at provisioning,
   `account-provisioning.ts:46`), working hours when set, review window, one claim per follow-up with a contact lock,
   recheck of draft/DNC/stop/preference before the provider call, uncertain leases never retried
   (`automatic-delivery.ts:100-108,137-141,176-232`). Visibility: failures show on the card and in the review with
   "Tried {time}" and "Manual · you send" (`page.tsx:329-332,367`); the send time shows only inside the review
   (`page.tsx:301,351-352`), nothing on the card (owner's A2 placement of prior TOD-F2). Gaps: MSG-01 (identity,
   Lane 5), MSG-02 (wording), LOOP-03 (backlog), LOOP-09. `node -e` check of the wording (functions copied from
   `today-view.ts:27-50`):
   ```
   "Email acceptance could not be confirmed (status 503)." => FAILED: Couldn’t send automatically: the provider rejected it. Send it yourself.
   "Email capacity is temporarily reserved. Please try again later." => FAILED: Couldn’t send automatically: the provider rejected it. Send it yourself.
   "The operation was aborted due to timeout" => UNCERTAIN: check sent messages
   ```
4. **Phone 320–414 px (static).** Every step has a phone path: Calendar and Journey are under More (`Nav.tsx:8-15`,
   `more/page.tsx:12-13`); the review is a full-width sheet with 44 px outcome buttons below 768 px
   (`design-details.css:53-70`); the tray is fixed above the bottom nav and scrolls (`JumpWorkflow.module.css:191-197`);
   Undo toasts are fixed above the nav (`design-workspaces.css:256-259`). Browser checks listed below.
5. **Silent or unclear.** LOOP-01, LOOP-02, LOOP-04, LOOP-05, LOOP-08; Snooze presets are plain submit buttons with no
   pending state (`page.tsx:328,383`), harmless because repeated submits give the same result.
6. **Calendar.** Times render in the owner's saved timezone, with the event's own zone noted when different
   (`calendar/page.tsx:30,65,82`). Visit-bound plans work only with a Mix whose cue is "When I start it for someone";
   a new owner has none (the starter is date-triggered), and the form says so and links to creating one
   (`CalendarEntryForm.tsx:101-102`). Before-visit Beats lapse once the visit starts; after-visit Beats wait for the
   outcome (LOOP-04). Default Journey stages have no plans (`journey.ts:9-26`), so "Your journey rules may start
   follow-ups" (`CalendarEntryForm.tsx:111`) does nothing until configured.

## What holds up

- Handoff links use the server-computed E.164 target, `sms:{n}?&body=`, encoded `mailto:`, WhatsApp only with a full
  number (`today-list.ts:75-83`, `phone-dial.ts:49-52`, `EditableFollowUpAction.tsx:52-61`).
- Outcomes: one request id per logical attempt, replay inside the transaction, 409 carries the status and the card says
  "Already marked done." instead of an error (`JumpWorkflow.tsx:99-130,158,286-297,435-444`; `outcome/route.ts:134-139,
  152,203-209,319-344`) — prior TOD-F3 fixed.
- Drafts: create-once and revisioned updates with conflict payloads, discard asks first, held note only after a saved
  draft (`jump-drafts.ts:146-189`; `EditableFollowUpAction.tsx:364-367,431-441`) — prior TOD-F5/F7 fixed.
- Failed automatic sends are visible on the card and in the review and never retried (`page.tsx:177-190,293-299`;
  `automatic-delivery.ts:193-196`) — prior TOD-F1 fixed apart from MSG-02.
- Done list: "Reopen" with names; automatic sends show "Sent automatically" with no control (`page.tsx:374-376`) —
  prior TOD-F6 fixed; Skip keeps the owner-approved 10-second Undo.
- Snooze never offers a refused time, writes are guarded, the view is kept (`snooze-schedule.ts:185-212`;
  `snooze-actions.ts:16-19,69-74`).
- Quick Add: idempotent by request id, 30 s timeout with "couldn't confirm … saved items won't be duplicated", exact
  one-time follow-up, never automatic (`QuickAdd.tsx:105-135`; `quick-capture.ts:84-95`; `automatic-delivery.ts:153`).
- "Contact saved" after adding a missing phone from a follow-up (`contact-actions.ts:507`; `page.tsx:419`) — TOD-F8 fixed.
- DST-safe "N days overdue" (`today-view.ts:13-17`) — TOD-F12 fixed.
- Offline navigation shows a self-contained offline page, no stale account HTML (`public/sw.js:5-16,37-41`).
- Tenant scoping on every Today API route: workspace from the session, jump looked up by id + workspace
  (`outcome/route.ts:104-149`, `draft/route.ts:13-31`, `variant/route.ts:11-23`, `actions/route.ts:30-62`,
  `completed-at/route.ts:13-29`).

## Test coverage for this lane

- Review, drafts, variants: `e2e/follow-up-drafts.spec.ts`, `today-navigation.spec.ts`, `channel-variants.spec.ts`,
  `save-recovery.spec.ts`; `tests/jump-drafts.test.ts`, `draft-continuity.test.ts`, `draft-merge.test.ts`,
  `preparation-variants.test.ts`.
- Outcomes, tray, Undo: `e2e/outcome-retry.spec.ts`, `jump-outcome-timeline.spec.ts`; `tests/jump-outcome-idempotency.test.ts`;
  `src/components/JumpWorkflow.test.ts`.
- Automatic sends: `tests/automatic-delivery.test.ts`, `automatic-delivery-recipient.test.ts`, `delivery-hold.test.ts`;
  `src/lib/automatic-delivery-window.test.ts`, `src/lib/today-view.test.ts`; `e2e/automatic-delivery-states.spec.ts`.
- Snooze: `tests/snooze-action.test.ts`, `snooze-reconciliation.test.ts`, `snooze-reconciliation-races.test.ts`;
  `src/lib/snooze-schedule.test.ts`.
- Quick Add: `tests/quick-capture.integration.test.ts`, `quick-capture-review.test.ts`, `contact-quick-add*.test.ts`;
  `e2e/core-ux-friction.spec.ts`, `quick-capture-config.spec.ts`, `voice-capture.spec.ts`.
- Calendar/visits: `tests/appointment-bindings.test.ts`, `appointment-outcomes.test.ts`, `appointment-timing.test.ts`,
  `schedule-visit.test.ts`, `calendar-*.test.ts`; `e2e/appointment-visit.spec.ts`, `beat-timing.spec.ts`.
- Contacts/Mixes: `tests/contact-*.test.ts`, `mix-stale-save.integration.test.ts`; `e2e/a2-contacts.spec.ts`,
  `contact-lifecycle-management.spec.ts`, `contact-search-import-jobs.spec.ts`, `mix-authoring-convergence.spec.ts`.

**Critical flows with no test:** the next promise producing a follow-up at the chosen time (the only test asserts a
saved date, `e2e/jump-outcome-timeline.spec.ts:98`); "Start mix" on a contact producing follow-ups for a date-triggered
plan; the real email error strings in `failedDeliveryNotice` (tests use "Resend returned 422",
`src/lib/today-view.test.ts:64`); the overdue backlog at enable time; after-visit Beats without a recorded outcome;
offline/401 behaviour of Mark sent, the tray and the channel chips; quiet hours covering working hours.

## Browser checks for the lead (phone widths)

At 320×568 and 390×844, light and dark:
1. `/jumps` → Review a text follow-up: textarea, "Open text", "Copy", "Mark sent", "Snooze", "Skip beat" all visible
   without horizontal scroll; buttons ≥44 px; the Snooze sheet opens over the review and its presets are reachable.
2. After "Open text", the tray: "Sent"/"Not sent" reachable; open "Add a note or next follow-up", tick "Schedule the
   next follow-up": the picker and "Save outcome" reachable by scrolling inside the tray (the iOS keyboard case is
   device-only).
3. Quick Add from the bottom bar: "Continue", then "Save all N" reachable with the follow-up details open.
4. `/calendar?new=1` on a phone: the form, duration chips and "Save event" usable; the day strip does not overflow.
5. `/settings/sending`: preview list and both consent boxes usable at 320 px.

## NOT RUN

- Anything needing a running app: every user-visible result above is inferred from code until the lead reproduces it.
- Devices: iOS/Android composer handoff (`?&body=`), PWA app switching and sessionStorage survival, the iOS keyboard
  over the fixed tray.
- Worker end to end (generate-jumps after a next promise; automatic sends against a real provider) and the production
  values of `EMAIL_FROM`, `EMAIL_REPLY_TO`, `TWILIO_*` (secrets rule; `render.yaml` lists no `TWILIO_*`).
- The Journey client (`WorkflowJourney`) beyond its start endpoint; Mix editor refusal retention was reasoned from
  Next's router keying, not observed.

## Questions for Kevin

1. The next promise: should "Schedule the next follow-up" and "Rescheduled" always create one follow-up at exactly the
   chosen day and time (like Quick Add), whatever plans the person is on? (Recommended.)
2. Starting a date-triggered plan from a contact: ask for the start date, or offer only plans that start now?
3. Automatic sending: should follow-ups that were already overdue when it was switched on be sent? Should a follow-up
   that was once completed by hand ever be sent automatically after a Reopen?
4. Visits: after a bound visit ends with no outcome, should Today ask "How did the visit go?", or should after-visit
   Beats start on their own after the visit's end time?
5. Imports: should the results screen offer a one-step check-in for the imported people, or turn on quiet-day
   suggestions for them?
6. Keep the automatic-sending time only inside the review (A2 placement), or also mark cards that will send by
   themselves?
