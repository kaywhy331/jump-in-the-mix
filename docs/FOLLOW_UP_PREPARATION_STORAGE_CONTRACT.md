# Follow-up preparation storage contract

**Status:** Proposed for review. Not an owner-approved decision, not a migration, not a release step.
**Date:** September 13, 2026
**Scope:** Slice 1 of the context-aware follow-up work (durable drafts and exact handoff attempts), plus the three Slice 2 binding rules that were settled during review. Pricing, customer-facing vocabulary and provider integrations are outside this contract.

Baseline for the inspected code: commit `820d4155044a8a1f560260f7c160154d3840ce0f` on `codex/production-release-checkpoint`, plus pull request #52 (`snoozedUntil`, `baseScheduledAt`, write guards, generation window, snooze carry-over). Everything below is source inspection and local design; nothing here has device, test-site or production evidence.

## 1. Ownership

| Data | Owner | Rule |
| --- | --- | --- |
| `Jump.baseScheduledAt` | Scheduler | Recomputed every pass and stored beside the effective time (#52) |
| `Jump.snoozedUntil` | Owner | Never written by the scheduler; the effective due time is the later of base and override (#52) |
| `Jump.scheduledAt` | Derived | Written by the scheduler and the snooze action with the same rule; writes are guarded on the row as read (#52) |
| Draft source per family | Owner | The scheduler never writes its text; tokens resolve at render from the bound context. When a pass regenerates the same occurrence under a new row, the whole draft rows move to that row (section 6) |
| Rendered projection | Derived | Refreshed when sources change; frozen only into an attempt |
| Attempt | History | Created once, never updated except to attach an outcome reference |
| Hold reason | Its cause | Each reason is cleared only by the event that set it |

Two rules follow from the table. Reconciliation never reads or writes draft text or attempts; the one draft write it performs is the whole-row re-key of section 6, and it never inspects, renders or merges what the rows hold. An outcome never rewrites a preparation: the outcome route may set the attempt's outcome reference and recorded time, and nothing else on the row.

## 2. Slice 1 entities

Additive only. No existing column changes meaning. Prisma sketch, subject to naming review:

```prisma
enum PreparationFamily {
  TEXT   // SMS and WhatsApp
  EMAIL
  CALL   // phone call and voicemail
}

model JumpDraft {
  jumpId        String
  family        PreparationFamily
  workspaceId   String
  subject       String?
  body          String?
  script        String?
  stepVersionId String
  revision      Int      @default(1)
  detached      Json?    // { token: value when removed }, see section 6
  updatedAt     DateTime @updatedAt
  createdAt     DateTime @default(now())
  jump          Jump     @relation(fields: [jumpId], references: [id], onDelete: Cascade)

  @@id([jumpId, family])
  @@index([workspaceId, updatedAt])
}

model JumpAttempt {
  id                  String   @id            // client-generated UUID v4, validated
  workspaceId         String
  jumpId              String
  contactId           String
  channel             Channel
  family              PreparationFamily
  recipientCiphertext String                  // the address or number actually used
  recipientHash       String                  // normalized, for matching without decrypting
  subject             String?
  body                String?
  script              String?
  draftRevision       Int?
  stepVersionId       String
  contextVersions     Json                    // validated: { contactVersion, calendarEntryVersion?, businessProfileVersion }
  payloadHash         String                  // stable-key hash of the immutable fields above
  openedAt            DateTime                // client clock at the gesture
  createdAt           DateTime @default(now())
  outcomeActivityId   String?                 // ContactActivity of kind JUMP_OUTCOME
  recordedAt          DateTime?
  jump                Jump     @relation(fields: [jumpId], references: [id], onDelete: Cascade)

  @@index([jumpId, createdAt])
  @@index([workspaceId, createdAt])
}
```

`JumpActionEvent` gains a nullable `attemptId` so the existing opened, copied, composed and called telemetry can point at the attempt it belongs to. No other existing table changes.

Draft text is stored in the same double-brace token form the step editor already validates, so one representation is canonical. The rendered message a card shows is a projection of the draft over the bound context, and it is never stored except inside an attempt.

## 3. Attempts are created once

The attempt id is generated on the client before navigation and travels with the payload. The server applies one rule set:

1. Authorize from the session's workspace. The jump must belong to that workspace, and `contactId` must equal the jump's contact at the time of the write. The recipient must be one of that contact's stored methods, or the explicit ad-hoc value the owner typed, and either way it is stored as written.
2. Insert with the primary key. The insert is a single statement, so two concurrent requests with the same id cannot both succeed. The loser sees the unique violation and continues at step 3 as a retry.
3. If a row with that id already exists, compute the payload hash of the incoming immutable fields with sorted keys and compare it to the stored hash. Equal means the retry is acknowledged as already recorded. Different means the request is refused with a payload-mismatch error, the stored row is untouched, and the tray shows the owner that the recorded attempt differs from what it holds. Nothing is ever merged. This comparison is the whole rule for an existing id: the retry is acknowledged even after the contact's methods or the follow-up's contact have changed, because it records a handoff that already happened. The recipient and contact checks of step 1 apply only to the first creation of an id.
4. The immutable fields are `jumpId`, `contactId`, `channel`, `family`, recipient, `subject`, `body`, `script`, `draftRevision`, `stepVersionId`, `contextVersions` and `openedAt`. The hash is computed server-side from the validated fields, never trusted from the client.
5. Payloads are bounded by the same limits the step editor enforces on subject, body and script, and stay well under the browser's keepalive request limit. Oversized or malformed payloads are refused, not truncated.
6. Retries retry logging only. No path from an attempt ever sends a message or opens a composer.

## 4. The recipient is recoverable

The recipient value is encrypted with the existing integration-credential helper and stored beside a normalized hash. The owner can see which address or number an attempt used, in the app and in their own export, even after the contact's methods change or the contact is merged. Analytics, admin reports and logs use the hash or nothing. The ciphertext follows the existing minimization rule for delivery details: removed after 400 days without related activity, hash retained, in bounded batches.

## 5. Handoff and return

On the gesture the page builds the attempt payload from the on-screen draft, generates the id, stores the whole payload in the account-scoped session list, starts a keepalive request that is not awaited, and follows the existing native link immediately. Nothing awaits the network before navigation.

The session list extends the current opened-action marker rather than replacing it. It holds a small fixed number of unresolved attempts, currently proposed as eight, each with the same two-hour age limit, the same account scope key, and the same cleanup on sign-out or account change. Payloads never enter navigation URLs or analytics. Browser storage can fail; when both local and network persistence are gone, the outcome is still recorded and the activity carries an explicit preparation-evidence-unavailable marker instead of a substitute render.

On return the tray resolves against the attempt id it opened, not against the newest draft. Recording an outcome sends the id, and when the attempt was never acknowledged, the same payload again, so the server creates or acknowledges under section 3. If the server refuses a mismatch, the tray shows it and still records the owner's outcome with the unavailable marker.

## 6. Draft autosave

Drafts save while editing, debounced, by jump and family with the revision the client last saw. A stale revision is refused and the current draft travels back with the refusal. The client keeps the owner's local wording on screen and offers one inline choice between it and the saved version; nothing replaces local edits automatically, and autosave pauses until the owner chooses. A discard is sent with the revision the client saw and takes effect only when the server confirms it: a failed discard leaves the draft where it is and offers a retry, a discard that meets a newer revision offers the same inline choice, and text typed while a discard is in flight is kept as new unsaved wording. There is no per-keystroke history: the row is overwritten in place, and the only frozen copies are attempts. The card shows the rendered projection and one primary action; editing controls are revealed on demand. Whether that editor is segmented inputs or a token-preserving rich field is decided by device qualification, not by this contract.

Historical literal text stays literal. When a save removes a template token from the draft, the draft records that token and the value it resolved to at that moment. When the detail behind a recorded token later changes, the card shows a review notice naming the detail and its old and new values; the literal text is never rewritten and the owner decides what to do. A token the owner puts back is no longer recorded.

### Draft continuity across regeneration

A draft belongs to a logical occurrence, not to a row id. The scheduler regenerates a row whenever a legacy uniqueness key changes, and #52 settled which regenerations are the same occurrence: a time-only edit (default follow-up time, quiet hours, weekend rule, beat time) yields a new row for the same contact, beat, saved date and original local date, and the snooze is carried onto it. Drafts follow exactly that rule, and nothing looser.

- **Same occurrence.** When a pass creates a row whose occurrence key (contact, beat, saved date, original local date) matches a pending row it is replacing, and the old key is absent from the desired set, the draft rows are re-keyed to the new jump id in the same transaction as the creation, revisions intact. The carried snooze lands on the same row. The owner sees the same text at the same time and keeps editing without noticing.
- **Different work.** A moved occurrence is new work: the broadcast date changes, a saved date is edited to another day, a manual follow-up is rescheduled, or the beat itself is removed and re-added. Nothing is carried. The old row keeps its drafts and attempts until retention, and the new row starts from the step template. There is no heuristic match on contact and text, and no card ever shows another occurrence's draft.
- **Held rows.** A pause, archive or do-not-contact hold cancels and later resurrects the same row id, so the draft is simply still there when the row returns.
- **Attempts are never re-keyed.** An attempt is history of the row it was made against and stays on it. The contact's history shows it either way, and the outcome route resolves the attempt by its own id.
- **Autosave against a replaced row is refused** because the row is no longer pending. The client reloads and receives the draft on the regenerated row, with the same revision it last saw.
- **Appointment-anchored occurrences** get a stable identity in Slice 2; until then they follow the legacy rule above.

## 7. Lifecycle hooks

| Event | Rule |
| --- | --- |
| Account export | The account export route includes drafts and attempts, with the recipient decrypted for the owner's own export |
| Account or contact deletion | Cascades through the jump relation, as every other follow-up record does |
| Contact merge | Attempts follow their jump as history. Merge moves done and skipped follow-ups to the survivor and cancels the merged person's pending ones for regeneration. The merge never deletes a draft: a draft moves onto the survivor's pending follow-up for the same beat and occurrence when that row already exists and has no draft of that family, otherwise it stays on the cancelled row and the next pass carries it onto the survivor's regenerated row for that occurrence. A draft with no such row stays exportable until retention |
| Reconciliation cancel and resurrect | Drafts stay attached to the jump row, so a paused mix that resumes shows the owner's draft again. A time-only edit that regenerates the same occurrence moves the draft rows to the new row, as section 6 defines; a moved occurrence carries nothing |
| Retention | Attempts are history and stay with the follow-up. Drafts are removed 30 days after their follow-up reaches a terminal state, where terminal means done, skipped, or cancelled for a reason that is not an owner hold (paused mix, archived contact, do-not-contact); a stale or replaced row counts from the moment it left the desired set, and a held row's draft waits for the hold to lift. Recipient ciphertext follows section 4. All cleanup runs in bounded batches like the existing retention jobs |
| Automatic delivery | A follow-up with a draft is held from automatic delivery and waits on Today for the owner, where the card says so while delivery is switched on. The plan's text is never sent in place of an edit. Binding an approval to one draft revision and context version, invalidated when either changes, is deferred until approvals and attempts share a schema; the existing review window and receipt rules are unchanged |

## 8. Acceptance mapping

| Case | Where it is proven |
| --- | --- |
| B07 last keystroke then handoff | The gesture payload is built from the on-screen draft; a unit test compares the attempt to the rendered field |
| B08 persistence fails, source changes later | The retry carries the original payload; the stored attempt never re-renders |
| B09 two contacts opened before outcomes | Two unresolved attempts in the session list resolve independently |
| B10 repeated logging retry | Same id, same payload, one row, no send, acknowledged even after the contact's methods changed |
| Concurrent creation | Two simultaneous inserts with one id produce one row and two acknowledgments |
| Retry with a changed payload | Refused, stored row untouched, tray informed |
| Outcome after preparation | Only `outcomeActivityId` and `recordedAt` change; a test diffs the row before and after |
| B20 export, deletion, sign-out, retention | Export includes both tables; deletion cascades; sign-out clears the session list; retention job removes drafts and minimizes recipients |
| B21 family switch, reload, second device | Drafts per family survive reload; a stale revision is refused and the current draft returns with the refusal |
| Revision conflict on a device | Local wording stays on screen; one inline choice between it and the saved version; autosave paused until chosen |
| Discard fails or meets a newer revision | Draft unchanged on the server; retry or the same inline choice; text typed meanwhile kept |
| Contact merge with drafts | Draft moves to the survivor's matching pending row or waits on the cancelled row and is carried on regeneration; nothing deleted |
| Automatic delivery with a draft | Follow-up not claimed; card says it waits for the owner |
| Removed detail changes later | Draft records the token and its value at removal; the card shows old and new values; no rewrite |
| Time-only edit regenerates the occurrence | The regenerated row carries the draft rows and the snooze; the replaced row holds no draft; revisions are unchanged |
| Occurrence moves | The new row has no draft; the old row keeps its draft and attempts; no send, no copy of text |
| B23 device handoff | Requires physical devices; not covered by this contract |
| B24 business updates with drafts present | Reconciliation refreshes the projection only; drafts and attempts are untouched |

## 9. Slice 2 binding rules settled during review

These are contract rules for the next slice. The binding schema itself is not part of this document.

**Enrollment reuse.** A new appointment attaches to an existing enrollment only when that enrollment is already bound to this exact appointment, or was created by an appointment flow for this appointment. A pre-existing enrollment with no appointment scope never matches merely because its plan matches, whether it came from a manual start, a tag or a journey stage. In every other case the flow creates a separate binding. A conversion of unscoped work is offered only when it is safe: the existing enrollment has no completed, skipped or attempted actions, its pending actions can be recomputed from the appointment, and the preview lists exactly those actions. When conversion is safe and the same plan is already active for the contact, the flow asks once, inline, to keep both or attach the existing work to this appointment. When it is not safe, there is no attach offer, both proceed, and the confirmation says so.

**Failed evaluation.** When a binding cannot be evaluated, because its appointment or contact is missing, its timezone is invalid, or a required field cannot be resolved, the binding and its existing records are preserved. Its pending actions are held through the existing cancellation-with-reason mechanism using a new reconcilable reason, so they return when evaluation succeeds. The binding records the last evaluation time and error. Rendered content is not refreshed from unverified sources, and the card shows the existing readiness message instead of presenting possibly stale appointment details as current. No automatic delivery may claim an approval while the binding is in this state.

**Evaluated bindings are cleaned up.** Reconciliation records every binding it evaluated successfully, including one that correctly produced no actions, and its stale pass cancels pending rows of those bindings that are absent from the desired set. A binding that failed evaluation is excluded from the stale pass and reported, so a failure never cancels work.

## 9a. Slice 2 binding schema (implemented)

`AppointmentBinding` links one plan enrollment (`MixAssignment`, unique per binding) to one local appointment (`CalendarEntry`) for one contact, with `automaticDelivery` (default off), `heldAt` (an owner hold scoped to this visit), and `lastEvaluatedAt` / `lastEvaluationError`. `Jump.appointmentBindingId` marks every follow-up the binding generates. `CalendarEntry` gains `location`, `link` (https only) and `details`, resolved by the `{{Appointment …}}` / `{{appointment.…}}` tokens, which render empty on an unbound follow-up.

**Stable identity.** An anchored follow-up's uniqueness key is the binding and the beat; neither the scheduled time nor the timezone is part of it. Moving the appointment updates the rows in place, so drafts, snoozes and recorded attempts stay with them; the scheduler's base moves and the snooze rule still applies.

**Anchoring.** Day offsets count from the appointment's local date in the appointment's timezone; a beat without its own time goes out at the appointment's time; weekend and quiet-hour rules apply as elsewhere. The follow-up's reason is the appointment title.

**Scoped holds.** Three reconcilable reasons hold a binding's pending rows: `appointment_held` (owner hold), `appointment_canceled` (the appointment is canceled), `appointment_unresolved` (the binding could not be evaluated: missing appointment, contact mismatch, invalid timezone). Each is set by its cause and cleared only when that cause lifts. Held rows are never treated as stale, and a binding that failed evaluation records the reason.

**Scope.** A binding never reuses an enrollment without appointment scope; two appointments for the same person and plan are two bindings with separate rows, and moving one touches only its own. A bound follow-up is never claimed by automatic delivery unless its binding allows it.

**One-save person resolution.** A visit saved with a new person's name, phone and email reuses a saved person only when those methods point at exactly one person; a saved method is never duplicated. When they point at more than one (the phone at one person and the email at another, or one method shared by two people), nothing is saved and the form asks for one inline choice between those people with everything entered kept in place. The choice is rechecked against the same matches on the next save, and the chosen person's saved methods are left as they are.

## 10. Out of scope

No pricing, limits or entitlements. No customer-facing vocabulary changes. No provider OAuth, hosted files or paid AI. No changes to saved-date, manual or broadcast identities. Implementation lands in its own pull request after this contract is reviewed.
