# Follow-up preparation storage contract

**Status:** Proposed for review. Not an owner-approved decision, not a migration, not a release step.
**Date:** September 13, 2026
**Scope:** Slice 1 of the context-aware follow-up work (durable drafts and exact handoff attempts), plus the three Slice 2 binding rules that were settled during review. Pricing, customer-facing vocabulary and provider integrations are outside this contract.

Baseline for the inspected code: commit `820d4155044a8a1f560260f7c160154d3840ce0f` on `codex/production-release-checkpoint`, plus pull request #52 (`snoozedUntil`, write guards, generation window). Everything below is source inspection and local design; nothing here has device, test-site or production evidence.

## 1. Ownership

| Data | Owner | Rule |
| --- | --- | --- |
| Base due instant | Scheduler | Recomputed every pass; recorded in the snapshot's scheduling provenance |
| `Jump.snoozedUntil` | Owner | Never written by the scheduler; the effective due time is the later of base and override (#52) |
| `Jump.scheduledAt` | Derived | Written by the scheduler and the snooze action with the same rule; writes are guarded on the row as read (#52) |
| Draft source per family | Owner | The scheduler never writes it; tokens resolve at render from the bound context |
| Rendered projection | Derived | Refreshed when sources change; frozen only into an attempt |
| Attempt | History | Created once, never updated except to attach an outcome reference |
| Hold reason | Its cause | Each reason is cleared only by the event that set it |

Two rules follow from the table. Reconciliation never reads or writes drafts or attempts. An outcome never rewrites a preparation: the outcome route may set the attempt's outcome reference and recorded time, and nothing else on the row.

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
3. If a row with that id already exists, compute the payload hash of the incoming immutable fields with sorted keys and compare it to the stored hash. Equal means the retry is acknowledged as already recorded. Different means the request is refused with a payload-mismatch error, the stored row is untouched, and the tray shows the owner that the recorded attempt differs from what it holds. Nothing is ever merged.
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

Drafts save while editing, debounced, by jump and family with the revision the client last saw. A stale revision is refused and the client reloads the current draft; no silent overwrite across devices. There is no per-keystroke history: the row is overwritten in place, and the only frozen copies are attempts. The card shows the rendered projection and one primary action; editing controls are revealed on demand. Whether that editor is segmented inputs or a token-preserving rich field is decided by device qualification, not by this contract. Historical literal text stays literal, and a removed critical token is recorded as detached so later source changes raise a review notice rather than a guess.

## 7. Lifecycle hooks

| Event | Rule |
| --- | --- |
| Account export | The account export route includes drafts and attempts, with the recipient decrypted for the owner's own export |
| Account or contact deletion | Cascades through the jump relation, as every other follow-up record does |
| Contact merge | Attempts follow their jump. Merge already moves done and skipped follow-ups to the survivor and cancels pending ones for regeneration; drafts of cancelled pending follow-ups are removed, attempts on them are kept as history |
| Reconciliation cancel and resurrect | Drafts stay attached to the jump row, so a paused mix that resumes shows the owner's draft again |
| Retention | Attempts are history and stay with the follow-up. Drafts are removed 30 days after their follow-up reaches a terminal state. Recipient ciphertext follows section 4. All cleanup runs in bounded batches like the existing retention jobs |
| Automatic delivery | An approval bound to one draft revision and context version is invalidated when either changes; the existing review window and receipt rules are unchanged |

## 8. Acceptance mapping

| Case | Where it is proven |
| --- | --- |
| B07 last keystroke then handoff | The gesture payload is built from the on-screen draft; a unit test compares the attempt to the rendered field |
| B08 persistence fails, source changes later | The retry carries the original payload; the stored attempt never re-renders |
| B09 two contacts opened before outcomes | Two unresolved attempts in the session list resolve independently |
| B10 repeated logging retry | Same id, same payload, one row, no send |
| Concurrent creation | Two simultaneous inserts with one id produce one row and two acknowledgments |
| Retry with a changed payload | Refused, stored row untouched, tray informed |
| Outcome after preparation | Only `outcomeActivityId` and `recordedAt` change; a test diffs the row before and after |
| B20 export, deletion, sign-out, retention | Export includes both tables; deletion cascades; sign-out clears the session list; retention job removes drafts and minimizes recipients |
| B21 family switch, reload, second device | Drafts per family survive reload; a stale revision is refused |
| B23 device handoff | Requires physical devices; not covered by this contract |
| B24 business updates with drafts present | Reconciliation refreshes the projection only; drafts and attempts are untouched |

## 9. Slice 2 binding rules settled during review

These are contract rules for the next slice. The binding schema itself is not part of this document.

**Enrollment reuse.** A new appointment attaches to an existing enrollment only when that enrollment is already bound to this exact appointment, or was created by an appointment flow for this appointment. A pre-existing enrollment with no appointment scope never matches merely because its plan matches, whether it came from a manual start, a tag or a journey stage. In every other case the flow creates a separate binding. A conversion of unscoped work is offered only when it is safe: the existing enrollment has no completed, skipped or attempted actions, its pending actions can be recomputed from the appointment, and the preview lists exactly those actions. When conversion is safe and the same plan is already active for the contact, the flow asks once, inline, to keep both or attach the existing work to this appointment. When it is not safe, there is no attach offer, both proceed, and the confirmation says so.

**Failed evaluation.** When a binding cannot be evaluated, because its appointment or contact is missing, its timezone is invalid, or a required field cannot be resolved, the binding and its existing records are preserved. Its pending actions are held through the existing cancellation-with-reason mechanism using a new reconcilable reason, so they return when evaluation succeeds. The binding records the last evaluation time and error. Rendered content is not refreshed from unverified sources, and the card shows the existing readiness message instead of presenting possibly stale appointment details as current. No automatic delivery may claim an approval while the binding is in this state.

**Evaluated bindings are cleaned up.** Reconciliation records every binding it evaluated successfully, including one that correctly produced no actions, and its stale pass cancels pending rows of those bindings that are absent from the desired set. A binding that failed evaluation is excluded from the stale pass and reported, so a failure never cancels work.

## 10. Out of scope

No pricing, limits or entitlements. No customer-facing vocabulary changes. No provider OAuth, hosted files or paid AI. No changes to saved-date, manual or broadcast identities. Implementation lands in its own pull request after this contract is reviewed.
