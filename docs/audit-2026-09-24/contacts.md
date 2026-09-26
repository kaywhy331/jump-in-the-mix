# Contacts audit — 2026-09-24 (d70ec54)

## Scope and method

Read-only static review of the worktree at `the repository` (commit `d70ec54`, the code running on jumpinthemix.com). Nothing was built, run or edited. All line numbers below refer to that tree.

Read end to end:

- Pages: `src/app/(app)/contacts/{page,loading}.tsx`, `archived/page.tsx`, `duplicates/page.tsx`, `custom-fields/page.tsx`, `import/page.tsx`, `new/page.tsx`, `[contactId]/page.tsx`, `[contactId]/edit/page.tsx`.
- Components: `ContactsBulkWorkspace`, `ContactForm`, `NewContactForm`, `ContactProfile`, `ContactTimeline`, `ContactJourneyPanel`, `ContactRelationshipStatePanel`, `ContactSavedViewsBar`, `ContactsBackLink`, `ContactAnchorReveal`, `DuplicateMergeForm`, `MergeFieldText`, `RepeatableProfileRecords`, `DeviceContactQuickAdd`, `ContactImportWizardV2`, `ReviewRequestButton`, `FormSubmitButton`.
- Libs: `contact-actions`, `contact-input`, `contact-custom-fields`, `custom-field-actions`, `bulk-contact-actions`, `contact-lifecycle-actions`, `contact-merge-actions`, `contact-state-actions`, `contact-view-actions`, `contact-list-state`, `contact-profile-view`, `contact-follow-up-summary`, `contact-mix-actions`, `contact-quick-add`, `device-contact`, `contact-file-parser`, `contact-import-mapping`, `contact-import-service`, `contact-import-jobs`, `contact-import-lease`, `contact-import-state`, `contact-import-report`, `contact-import-shared`, `contact-import-types`, `contact-export`, `customer-return-path`, `workflow-continuation`, `mix-stop-actions` (stop/resume), `mix-start-eligibility`, `intake`, `lead-form-actions`, `review-requests`, relevant parts of `journey.ts`, `jump-engine.ts`, `mix-workflow.ts`, `appointment-bindings.ts`, `group-actions.ts`, `important-date-actions.ts`, `workspace-repository.ts`.
- API: `src/app/api/contacts/{audience,import,quick-add,recipient-search}/route.ts`, `[contactId]/{activity,review-request}/route.ts`, `src/app/api/reviews/[token]/{route,public-review/route,refer/route}.ts`, `src/app/review/[token]/page.tsx`, `src/app/lead/[connectionId]/page.tsx`.
- Schema: `prisma/schema.prisma` (Contact, ContactEmail/Phone/Address, CustomField*, GroupMembership, JumpDate, MixAssignment, Jump), `contact-lifecycle.prisma`, `appointments.prisma`, `workflow.prisma` (MixStop), `product-platform.prisma` (ReviewRequest), `customer-journey.prisma`, `activity.prisma`.
- Styles and design authority: `src/styles/contacts-workspace.css`, `phone-icons.css:46`, `docs/design/DESIGN_GUIDELINES.md` (Contacts bullets and the "Contacts implementation contract"), the two prior contacts audits and `docs/UI_UX_DEEP_GAP_AUDIT_2026-09-23.md`.

Could not be checked statically: real phone/browser behaviour (focus order, reflow, keyboard), whether Prisma 7.10's query compiler escapes `%`/`_` in `contains` (the decoded `query_compiler_fast_bg.postgresql` wasm contains `LIKE`/`ILIKE` tokens but no `ESCAPE` clause; parameter pre-escaping is not visible), exact header spellings of every address-book export version (the common Google, Outlook and hand-made spreadsheet headers are cited), whether an appointment-held Beat is what the Next card should show, and production data volumes.

Status of the prior audit's open items in this scope: items 6, 11, 12 are still open (F7, F8, F9). "Bulk archive has no Undo" (F4), "Creating a contact has no idempotency key" (F14), "Add contact Back drops the Mix context" and "No save confirmation" (F17) are still open. "Contacts list uses 100vh" is closed: no `100vh` remains under `src/styles` (removed in `2fddfc2`/`7bade1f`); `contacts-workspace.css:137` uses `min-height: 100dvh` only from 1200px. "Archived search field named Find a calendar contact" is closed for Contacts: `archived/page.tsx:58` names the field "Search archived Contacts"; the mismatched name lives on the Calendar page (`src/app/(app)/calendar/page.tsx:85`, outside this scope). "Merge chips don't wrap at 320px": `phone-icons.css:46` still sets `white-space: nowrap` on `.merge-field-chip`; the component is not rendered on any Contacts page, so it is noted for the Today/Mix auditors.

## Findings (ranked, most severe first)

### F1. Merging duplicates drops the merged person's Mix stops, so a stopped Mix resumes for the survivor
- Severity: P1
- Status: VERIFIED
- Evidence: `src/lib/mix-stop-actions.ts:33-41` — stopping a Mix for a person writes a `MixStop` row and cancels PENDING jumps but leaves the `MixAssignment` active. `src/lib/jump-engine.ts:342,408` — the engine only honours stops keyed by `(mixId, contactId)`. `src/lib/contact-merge-actions.ts:158-167` — the merge moves the source's assignments to the survivor (still `isActive`), `:216` queues `generate-jumps` for the survivor, and the file never reads or copies `MixStop` (also the `journey.stage.exit` stops written by `src/lib/journey.ts:32`). `workflow.prisma:14-26` — stops are unique per `(workspaceId, mixId, contactId)`, so the source's stop simply stays on the archived record.
- Failure scenario: Customer A asked the plumber to stop the "Estimate follow-up" texts; the owner pressed Stop on A. Later A is merged into duplicate B, who never had that Mix. A's assignment moves to B with no stop, the queued reconciliation regenerates the pending Beats, and the texts the customer asked to stop reappear on Today under B's name.
- Fix: inside the merge transaction, after the assignment loop, `const stops = await tx.mixStop.findMany({ where: { workspaceId, contactId: source.id } })` and for each `tx.mixStop.upsert({ where: { workspaceId_mixId_contactId: { workspaceId, mixId, contactId: survivor.id } }, create: { ...stop fields, contactId: survivor.id }, update: {} })` (a stop on either side stops the merged person, matching how `doNotContact` is OR-ed at `:182`). Record the count in `mergeSummary`.
- Effort: S; Risk: low; Needs migration: no; Needs owner decision: no
- Tests: integration test for `mergeContactsAction` with a stopped Mix on the source and none on the survivor, asserting a survivor stop exists and no PENDING jump is generated; extend `e2e/contact-lifecycle-management.spec.ts` duplicate flow.

### F2. Import silently drops phones and emails from Google Contacts, Outlook and common spreadsheet headers, and never shows the "no phone or email" warning
- Severity: P1
- Status: VERIFIED
- Evidence: `src/lib/contact-import-mapping.ts:73` email guess requires `^e ?mail( address)?( \d+)?$`; `:74` phone guess requires `^(mobile|cell|phone|telephone|tel)( number)?( \d+)?$`. Google's export headers `E-mail 1 - Value` and `Phone 1 - Value` normalise (`contact-import-shared.ts:8-15`) to `e mail 1 value` / `phone 1 value` and match nothing; Outlook's `Mobile Phone`, `Home Phone`, `Business Phone`, `E-mail 2 Address` and hand-made `Cell Phone` / `Work Phone` also match nothing, so they are mapped to `ignore` (`:102`). `buildImportRows` only adds a warning for such rows (`:255`), and `ContactImportWizardV2.tsx` never renders `row.warnings` or `table.warnings`: the review list is built from errors and duplicate matches only (`:185`), the mapping editor is a collapsed `<details>` (`:389-399`), and the clean-file message is "No issues need review. Every row is ready to create." (`:415`). Google's multi-value separator ` ::: ` is not split either (`contact-import-mapping.ts:107-111`), so a manually mapped `555-0100 ::: 555-0101` becomes one 14-digit "phone" that `normalizePhone` accepts (7–15 digits).
- Failure scenario: an Android user exports Google Contacts (CSV), drops the file in, sees "0 issues", queues 300 rows. 300 people are created with names and companies only; every row on Contacts says "Add phone or email" and Today can prepare nothing. The owner has no indication the import lost the numbers.
- Fix: (1) widen the guesses: email `/^e[- ]?mail(?: address)?(?: \d+)?(?: (?:address|value))?$/`, phone `/^(?:(?:mobile|cell|home|work|business|main|primary|other) )?(?:phone|telephone|tel|mobile|cell)(?: number)?(?: \d+)?(?: value)?$/`, and treat a sibling `<header> - Type|Label` column as the label for that value column; (2) split multi-values on ` ::: ` as well as `|` and newlines; (3) surface warnings in the REVIEW stage: "N of M rows have no phone or email" with a link that opens the mapping editor, and require an explicit confirmation on "Queue" when more than half the rows lack a contact method; (4) add Google/Outlook header fixtures.
- Effort: M; Risk: low; Needs migration: no; Needs owner decision: no
- Tests: unit tests for `guessImportMappings` with the Google classic and 2023 header sets, Outlook headers and `Cell Phone`/`Work Phone`; unit test for ` ::: ` splitting; e2e in `contact-search-import-jobs.spec.ts` asserting the warning count is visible before queueing.

### F3. Phone numbers are normalised by format, not by number, so the same person is not detected as a duplicate across the form, device picker, import and lead form
- Severity: P1
- Status: VERIFIED
- Evidence: `src/lib/contact-input.ts:38-44` — `normalizePhone` keeps a leading `+` and otherwise stores bare digits: `+1 (555) 123-4567` → `+15551234567`, `(555) 123-4567` → `5551234567`, `1-555-123-4567` → `15551234567`. Every duplicate check compares that string exactly: form validation `contact-actions.ts:137-147`, import exact match `contact-import-service.ts:98-110` and conflict check `:236-264`, quick-add via the same service (`contact-quick-add.ts:48-60`, `device-contact.ts:82-85`), the duplicates page `duplicates/page.tsx:38`, lead intake `intake.ts:33`. The only softer match (`phoneTail`, `contact-import-service.ts:124-131`) applies solely when both records have a company and near-identical names.
- Failure scenario: "Add from phone contacts" saves Bob as `+15551234567` (the Contact Picker returns the device format). A week later a CSV row `Bob, (555) 123-4567` is analysed as `NONE` and creates a second Bob; both are in the "Estimate" tag, so Bob receives two texts. The duplicates page does not flag the pair (different keys, no shared company).
- Fix: canonicalise in `normalizePhone`: strip to digits; if the input started with `+` keep the country code; else if 10 digits prefix the workspace default country code (US `1` unless the owner decides otherwise); if 11 digits starting with `1` treat as `+1`; return E.164 (`+15551234567`). Add a data migration that recomputes `ContactPhone.normalized` (merge same-contact rows that collapse onto one key first, because of `@@unique([contactId, normalized])`), then re-run the duplicates review. Keep the display value untouched.
- Effort: L; Risk: medium; Needs migration: yes (data backfill); Needs owner decision: yes (default country; non-US customers)
- Tests: `src/lib/contact-input.test.ts` cases for the three US spellings collapsing to one key, `+44` preserved, 7-digit local numbers; import match test that `+1…` and `(555)…` are `EXACT`.

### F4. Bulk archive deactivates Mix assignments (single archive does not), has no Undo, and Restore cannot bring the plans back
- Severity: P1
- Status: VERIFIED
- Evidence: `src/lib/bulk-contact-actions.ts:80-92` — bulk archive sets `archivedAt`, sets every `mixAssignment.isActive = false` (`:88`) and cancels PENDING jumps; it writes no audit log and queues no reconciliation, and redirects with only `bulkArchived=<n>` (`:91`). `src/lib/contact-lifecycle-actions.ts:26-45` — single archive keeps assignments, cancels PENDING jumps, queues `generate-jumps` and logs. `restoreContactAction` (`:57-72`) only clears `archivedAt` and queues regeneration, so restore after a bulk archive regenerates nothing. The Archived page's Restore dialog counts active assignments (`archived/page.tsx:42-43,60`), so it truthfully says "0 active mixes" and the owner has no hint that anything was lost. Undo exists only for the single archive notice (`contacts/page.tsx:250`).
- Failure scenario: in selection mode the owner taps "Archive 5…" meaning "Remove tag". The notice offers no Undo. They restore the five people from Archived; each restore shows "0 active mixes"; nobody gets follow-ups again until the owner notices Today is empty and re-adds every Mix by hand.
- Fix: make bulk archive behave like single archive (leave assignments active; the engine already skips archived people at `jump-engine.ts:399-401`; add the audit row and job). Add Undo: redirect to `/contacts?bulkArchived=5&archivedContacts=<id,id,…>` (≤50 ids) and render the same notice-with-action form posting a new `restoreContactsAction(formData)` in `contact-lifecycle-actions.ts` that restores `id in ids AND workspaceId AND archivedAt not null`, queues one `generate-jumps`, and succeeds idempotently when nothing is left to restore.
- Effort: M; Risk: low; Needs migration: no; Needs owner decision: yes (only if the owner intended bulk archive to also end plans)
- Tests: e2e bulk archive → Undo → assignments still active and pending Beats regenerated; unit test that bulk archive no longer touches `MixAssignment`.

### F5. Searching by phone number only matches the digits exactly as they were typed when the contact was saved
- Severity: P1
- Status: VERIFIED
- Evidence: `src/app/(app)/contacts/page.tsx:150` filters `phones: { some: { phone: { contains: q } } }` on the raw display string; same in `archived/page.tsx:32` and `src/app/api/contacts/recipient-search/route.ts:9`. The `normalized` column is never searched.
- Failure scenario: a missed call shows `+1 555-123-4567`. The owner opens Contacts and types `5551234567` (or `555-123-4567`). The customer was saved as `(555) 123-4567`, so the result is "No contacts matched" and the owner assumes it is a new lead.
- Fix: in the three query builders, compute `digits = q.replace(/\D/g, "")`; when `digits.length >= 4`, add `{ phones: { some: { normalized: { contains: digits } } } }` to the `OR` (after F3, `normalized` is canonical; before it, this already catches the common spellings because `+15551234567` contains `5551234567`).
- Effort: S; Risk: low; Needs migration: no; Needs owner decision: no
- Tests: e2e in `live-search-contact-layout.spec.ts`: save `(555) 123-4567`, search `555-123-4567` and `5551234567`, expect the row.

### F6. The contact form blocks on a number that belongs to an archived person and never says who has it
- Severity: P1
- Status: VERIFIED
- Evidence: `src/lib/contact-actions.ts:126-147` — the duplicate check has no `archivedAt` filter and returns "Another contact already uses X" without a name. The inline profile save excludes archived people and names the owner of the conflict (`contact-state-actions.ts:31-37`); import excludes archived people (`contact-import-service.ts:251-256`); lead intake routes an archived match to review (`intake.ts:70`). Four paths, three behaviours.
- Failure scenario: last year's "Bob" is archived. Bob calls again; the owner taps Add contact, types his number, and gets "Another contact already uses 555-123-4567. Your entries are still here". Bob is not in Contacts or Duplicates, so the message looks wrong; the only way out is to guess that Archived holds him.
- Fix: select `contact: { select: { displayName, archivedAt } }` in the two conflict queries and return "That phone already belongs to Bob Smith (archived). Restore Bob from Archived contacts or use another number." with a link `/contacts/archived?q=<number>`; for active conflicts link to the duplicates page like the inline action does. Whether to allow creating alongside an archived record is the owner's call.
- Effort: S; Risk: low; Needs migration: no; Needs owner decision: yes (allow vs. offer Restore)
- Tests: unit test on `validateContactPayload` for an archived conflict message; e2e Add contact with an archived duplicate.

### F7. Two devices editing one contact: the last save silently wins (prior audit item 6)
- Severity: P1
- Status: VERIFIED
- Evidence: `src/lib/contact-actions.ts:240-342` — `updateContact` reads nothing about the record's version; `:257-267` overwrites scalars, `:268-317` replaces emails, phones, addresses, tags and custom values with whatever the form held when it was opened. `Contact.updatedAt` exists (`schema.prisma:280`, `@updatedAt`) but is neither sent by `edit/page.tsx:50-62` nor checked. Tag writers that touch only child rows (`bulk-contact-actions.ts:60,75`, `group-actions.ts:131`) do not bump the parent row.
- Failure scenario: the owner adds Bob's second phone on the phone while the office laptop still has Bob's edit form open from the morning; the laptop's "Update contact" deletes the new phone (`:284` deletes anything not in the payload) with a green "Contact updated".
- Fix: (a) `edit/page.tsx` passes `updatedAt: contact.updatedAt.toISOString()`; `ContactForm.tsx` adds `<input type="hidden" name="revision">` beside `contactId` (`:161`); (b) in `updateContact`, replace `tx.contact.update` (`:257`) with `const saved = await tx.contact.updateMany({ where: { id: contactId, workspaceId: workspace.id, archivedAt: null, updatedAt: new Date(revision) }, data: {…} })` and `if (saved.count !== 1) throw new StaleSaveError()`; in the catch (`:331`) return `{ error: "This contact was changed on another device after you opened it. Reload to see the latest version, then apply your changes again." }` (entries stay on screen); (c) bump the parent in the child-only writers with `tx.contact.updateMany({ where: { id: { in } }, data: { updatedAt: new Date() } })` so a tag added in bulk is also protected. Prisma's `@updatedAt` already bumps on every form and inline save.
- Effort: M; Risk: low; Needs migration: no; Needs owner decision: no (copy only)
- Tests: unit test: two `updateContact` calls with the same revision, second returns the stale error and leaves the first save intact; e2e two-tab scenario if the harness allows.

### F8. Errors are not tied to fields and the wrong control gets focus (prior audit item 11)
- Severity: P1
- Status: VERIFIED
- Evidence: `src/components/ContactForm.tsx:82-87` stores one `result.error`; `:144` sets `aria-describedby` on the `<form>`; `:159` renders a single banner and focuses it; no input in `:166-176` or `:198-219` ever gets `aria-invalid` or `aria-describedby`. The server only returns `{ error }` (`contact-actions.ts:154,166,252`), although every validation message already identifies the field (`contact-input.ts:54,76` include the offending value; `contact-actions.ts:54` is the missing-name case; `:135,146` are per-email/per-phone duplicates).
- Failure scenario: on a phone, the owner mistypes the second of three emails. The banner at the top says "Invalid email address: bob@@example" while the offending field is off-screen below; a screen-reader user hears the alert but the field itself is not marked.
- Fix: widen `ContactFormState` to `{ error?: string; field?: string }` where `field` is one of `firstName`, `emailValue:<index>`, `phoneValue:<index>`, `custom:<definitionId>`; map the throw sites (`buildEmailInputs`/`buildPhoneInputs` can throw an error carrying `index`; `validateContactPayload` knows the index of the duplicate). In `ContactForm`, when `result.field` matches a control give it `aria-invalid="true" aria-describedby="contact-save-error"` and focus it in the existing effect (`:87`), falling back to the banner. Keep the banner text.
- Effort: M; Risk: low; Needs migration: no; Needs owner decision: no
- Tests: e2e submit with an invalid second email, assert focus and `aria-invalid` on `#quick-email-1` (create) / the matching edit-mode input; unit test that the action returns `field`.

### F9. Desktop 3-pane: selecting a person leaves keyboard focus in the list (prior audit item 12)
- Severity: P1
- Status: VERIFIED
- Evidence: `src/components/ContactsBulkWorkspace.tsx:199` intercepts the click at ≥1200px and calls `router.push(…, { scroll: false })`; the embedded profile heading is a plain `<h2>` (`ContactProfile.tsx:162`) with no `tabIndex`, and nothing moves focus after the transition.
- Failure scenario: a keyboard user presses Enter on a row; the profile renders on the right but focus stays on the link, so the next Tab moves to the following row instead of into the profile.
- Fix: give the embedded heading `id="contact-profile-heading" tabIndex={-1}`; in `ContactsBulkWorkspace` keep a `pendingFocus = useRef<string | null>(null)` set to `contact.id` in the click handler, and `useEffect(() => { if (pendingFocus.current && pendingFocus.current === selectedContactId) { document.getElementById("contact-profile-heading")?.focus(); pendingFocus.current = null; } }, [selectedContactId])`. Layout unchanged; initial loads and Back navigation are unaffected because the ref is only set by a click.
- Effort: S; Risk: low; Needs migration: no; Needs owner decision: no
- Tests: e2e at 1440px: press Enter on a row, assert `document.activeElement` is the profile heading.

### F10. Merge leaves appointment bindings, review requests and access invites pointing at the archived record
- Severity: P2
- Status: VERIFIED (stale references); SUSPECTED (runtime effect on appointment-timed Beats)
- Evidence: `contact-merge-actions.ts` moves calendar entries (`:121`) and workflow instances (`:126`) but never touches `AppointmentBinding.contactId` (`appointment-bindings.ts:144` stores it), `ReviewRequest.contactId` or `ReferralAccessInvite.contactId`. `mix-workflow.ts:222` looks bindings up with `contactId: instance.contactId`, which after `mergeWorkflowContact` is the survivor, so the lookup misses. Public review/referral routes log activities on `record.contactId` (`api/reviews/[token]/public-review/route.ts:28`, `refer/route.ts:12`, `review/[token]/page.tsx:25`), i.e. on the archived source, invisible to the owner.
- Failure scenario: a review link was texted to A before A was merged into B. A rates 2/5; the "Private feedback received" entry lands on archived A and never appears in B's History.
- Fix: in the merge transaction add `appointmentBinding.updateMany`, `reviewRequest.updateMany` and `referralAccessInvite.updateMany` (`where: { contactId: source.id }`, guarding the invite's `@@unique([inviterUserId, contactId])` by skipping rows that would collide).
- Effort: S; Risk: low; Needs migration: no; Needs owner decision: no
- Tests: merge integration test asserting the three tables now reference the survivor.

### F11. Deleting a tag cascades away the Mix assignments that target it, but the dialog says nothing changes for people
- Severity: P2
- Status: VERIFIED
- Evidence: `prisma/schema.prisma:528` `MixAssignment.group … onDelete: Cascade`; `src/lib/group-actions.ts:71-99` deletes the group and queues reconciliation; the confirm copy at `ContactsBulkWorkspace.tsx:168` reads "People and completed history will stay in your account."
- Failure scenario: the owner deletes the "Spring maintenance" tag to tidy up; the Mix assigned to that tag silently loses its audience and the next reconciliation cancels those people's pending Beats.
- Fix: count `mixAssignment` rows for the group (active, `mode` any) and either block deletion while any exist ("Remove this tag from N Mixes first") or say plainly "N Mixes run for this tag's people and will stop". Owner decision which.
- Effort: S; Risk: low; Needs migration: no; Needs owner decision: yes
- Tests: e2e delete a tag with an assignment and assert the warning/blocking copy.

### F12. On phones, every Contacts list load also renders the hidden profile of the first person
- Severity: P2
- Status: VERIFIED
- Evidence: `contacts/page.tsx:236-238` falls back to `contacts[0]?.id` when no `person` is selected; `:291` renders `<ContactProfile embedded>` whenever an id exists; `contacts-workspace.css:8` hides `.contacts-selected` below 1200px. `ContactProfile.tsx:44-107` runs roughly 15 queries per render, including up to 100 journey events and up to 2,000 sequence rows.
- Failure scenario: the most-used phone screen does the work of two screens on every search keystroke submit and pagination click; the response also carries a full hidden profile.
- Fix: only default-select the first person when a `jitm-docked=1` cookie is present (set by `ContactsBulkWorkspace`'s existing `matchMedia("(min-width: 1200px)")` effect) or when `params.person` is set; otherwise render no embedded profile. Wrap the pane in `<Suspense>` so the directory streams first either way.
- Effort: M; Risk: low; Needs migration: no; Needs owner decision: yes (desktop first load may show an empty pane until a row is chosen; the design contract only requires selection to keep the directory beside the profile)
- Tests: unit/route test asserting no profile markup in the phone response; desktop e2e still shows the first person after one click.

### F13. Import: one bad email fails the whole row, and duplicates inside the same file are only discovered as failures after queueing
- Severity: P2
- Status: VERIFIED
- Evidence: `contact-import-mapping.ts:217-224` pushes an error for any invalid email or phone, which excludes the row (`ContactImportWizardV2.tsx:179` "Will be reported as failed"). `findImportMatches` compares each row only against saved contacts (`contact-import-service.ts:159-176`), so two rows sharing a phone both get `NONE`/`CREATE`; the second then fails in `assertNoMethodConflict` (`:236-264`) with "Review the duplicate choice", a choice that no longer exists on the results screen.
- Failure scenario: a 400-row spreadsheet with a typo'd email on row 12 loses row 12 entirely, including its good phone number; the office number shared by 6 rows produces 5 "failed" rows the owner cannot act on except by re-importing.
- Fix: downgrade invalid email/phone to a row warning that drops just that value (owner decision); in `analyze`, group valid rows by normalised email/phone and mark later rows "Duplicates row N in this file" with `SKIP` as the default decision.
- Effort: M; Risk: low; Needs migration: no; Needs owner decision: yes (drop the value vs. fail the row)
- Tests: unit tests for in-file duplicate detection and value-level warnings.

### F14. Creating a contact has no idempotency key (prior audit P2 still open)
- Severity: P2
- Status: VERIFIED
- Evidence: `contact-actions.ts:156-238` — no request id; the duplicate check (`:163`) runs before the transaction and the workspace lock (`:170`), so two in-flight submits both pass. `FormSubmitButton` only disables the button while the first request is pending; a retry after a lost response is a new submit.
- Failure scenario: weak signal, the save response is lost, the form shows "We couldn't confirm this save", the owner taps Save again and gets two Bobs (the duplicate check does not catch a name-only contact).
- Fix: `NewContactForm` renders `<input type="hidden" name="requestId" value={useMemo(() => crypto.randomUUID(), [])}>`; `createContact` uses the `IdempotencyKey` table exactly like `api/contacts/[contactId]/activity/route.ts:133-190` (`key = contact-create:<requestId>`, stored inside the transaction, replay redirects to the stored contact id).
- Effort: S; Risk: low; Needs migration: no; Needs owner decision: no
- Tests: unit test calling `createContact` twice with one requestId → one contact.

### F15. Opening an archived contact's link returns 404 instead of an archived state with Restore
- Severity: P2
- Status: VERIFIED
- Evidence: `ContactProfile.tsx:48` filters `archivedAt: null` and `:71` calls `notFound()`. Merge activity ("Merged duplicate Contact …", `contact-merge-actions.ts:198`) and browser history are the usual ways back to such a record.
- Failure scenario: after the Undo banner is gone, the owner taps a bookmarked or history link to an archived customer and reads "not found", concluding the data is gone.
- Fix: query without the filter; when `archivedAt` is set render a short page "Archived on <date>" with the existing `restoreContactAction` form and a link to Archived contacts.
- Effort: S; Risk: low; Needs migration: no; Needs owner decision: no
- Tests: e2e archive → visit `/contacts/<id>` → Restore button.

### F16. Undo and Restore can be submitted twice; the second submit shows an error that hides the success
- Severity: P2
- Status: VERIFIED
- Evidence: `contacts/page.tsx:250` Undo is a plain `<button>`; `archived/page.tsx:60` Restore likewise; `restoreContactAction` (`contact-lifecycle-actions.ts:55-56`) fails with "Archived Contact not found." when the contact is already restored.
- Failure scenario: double-tap on a phone → red "Archived Contact not found." although the person is back.
- Fix: in `restoreContactAction`, if the contact exists in the workspace and `archivedAt` is already null, redirect to `?restored=1`; use `FormSubmitButton` for both buttons.
- Effort: S; Risk: low; Needs migration: no; Needs owner decision: no
- Tests: unit test for idempotent restore.

### F17. Two prior P2 navigation items are still open: Add contact's Back drops the Mix context; returning to Today after an edit shows no confirmation
- Severity: P2
- Status: VERIFIED
- Evidence: `new/page.tsx:44` renders `<BackLink href="/contacts">` regardless of `returnTo`, while the form's Cancel already honours it (`ContactForm.tsx:283`). `contact-actions.ts:339-340` redirects to the Today return path with no flag, and `src/app/(app)/jumps/page.tsx` has no corresponding notice.
- Failure scenario: from Journey the owner taps "Add a person", changes their mind, presses Back and lands on the Contacts list, losing the Mix they were starting; after "Add phone" from a Today review the page returns silently and the owner cannot tell whether the number stuck.
- Fix: `href={workflowContinuation(query.returnTo) ?? "/contacts"}` with label "Back" on `new/page.tsx:44`; append `contactSaved=1` to `todayReturn` and render `<Notice type="success">Contact saved.</Notice>` on Today.
- Effort: S; Risk: low; Needs migration: no; Needs owner decision: no
- Tests: e2e for both paths.

### F18. Search text containing `%` or `_` may over-match
- Severity: P2
- Status: SUSPECTED
- Evidence: `contacts/page.tsx:143-154`, `archived/page.tsx:28-33`, `recipient-search/route.ts:9` pass the raw query to Prisma `contains`. Whether Prisma 7.10 escapes LIKE wildcards could not be confirmed statically (see Scope).
- Failure scenario: typing `_` or `%` lists every contact. No injection and no cross-account exposure; the query is workspace-scoped.
- Fix: if confirmed, strip `%` and `_` from `q` (or escape them and query with `$queryRaw … ILIKE … ESCAPE '\'`).
- Effort: S; Risk: low; Needs migration: no; Needs owner decision: no
- Tests: e2e search for `_` returns "No contacts matched".

### F19. The private review page marks a request "opened" on any GET, so link scanners can produce a false "Opened the private review check-in" entry
- Severity: P2
- Status: SUSPECTED
- Evidence: `src/app/review/[token]/page.tsx:22-27` flips READY → OPENED and writes a History entry during server rendering.
- Failure scenario: the carrier's or the customer's messaging app pre-fetches the link; the owner sees "Opened" and follows up as if the customer had looked.
- Fix: record OPENED from the client after first interaction (rating focus/click) via a small POST, or keep the entry but word it "Link was opened (may be automatic)". Owner decision.
- Effort: S; Risk: low; Needs migration: no; Needs owner decision: yes
- Tests: unit test that a plain GET no longer transitions the status.

### F20. A public lead-form submission that matches one existing customer is auto-attached and fires a journey event on that customer
- Severity: P2
- Status: SUSPECTED (abuse/quality risk; behaviour itself is verified)
- Evidence: `intake.ts:69-71` — a single active match is accepted without review; `acceptIntake` (`:49-50`) writes an activity containing the submitted message and applies `CONTACT_RECEIVED`; `journey.ts:75-98` — a customer with no journey row joins the first stage and `changeManagedPlan` (`:27-58`) starts that stage's Mix; a customer already in a stage moves if the owner configured a `CONTACT_RECEIVED` rule from it. Rate limits: 10/h per IP+form, 300/h per form (`lead-form-actions.ts:14-17`).
- Failure scenario: anyone who knows a client's phone number can post the hosted form and start the "new lead" Mix for a long-standing client, or inject text into their History. A genuine repeat inquiry needs the same path, which is why this is an owner decision.
- Fix: route matches to `REVIEW` when the matched contact already has completed follow-ups or a journey stage beyond the first, or add a per-contact cool-down; at minimum label the activity "Website form (unverified)".
- Effort: M; Risk: medium; Needs migration: no; Needs owner decision: yes
- Tests: intake unit test for the review routing rule.

### F21. The duplicates page renders every pair for a shared value, so a shared office number produces a wall of cards
- Severity: P2
- Status: SUSPECTED
- Evidence: `duplicates/page.tsx:43-58` builds all n(n−1)/2 pairs per shared email/phone key; 30 contacts sharing a brokerage's main line yield 435 cards, each with a merge form.
- Failure scenario: a realtor whose contacts share the office number cannot find the real duplicates among hundreds of false pairs.
- Fix: cap pairs per key (e.g. show the group as one "N people share 555-0100" card with a link to a filtered list) and skip keys shared by more than ~5 contacts from pairwise expansion.
- Effort: S; Risk: low; Needs migration: no; Needs owner decision: no
- Tests: unit test on `duplicateCandidates` with a 10-way shared phone.

## Checked and fine

- Workspace scoping holds on every contact read/write path read: list, profile, edit, activity GET/POST/PATCH, review-request, quick-add, import match/commit/queue/cancel (`targetContactId` re-checked in `mergeImportedContact`), audience (`group: { workspaceId }`), recipient search, merge, archive/restore, saved views, custom fields (`requireWorkspaceCustomFieldDefinitions`), important dates, tags. No cross-account read or write found.
- `customerReturnPath`/`workflowContinuation` accept only allow-listed in-app paths, reject backslashes, control characters and `//host` forms, and re-check after URL normalisation.
- Activity timeline pagination is keyset on `(occurredAt, key COLLATE "C")`, stable with equal timestamps; the cursor is validated and bounded; private notes are workspace-visible by design.
- Directory sorting has an `id` tiebreaker for all four sorts; the page is clamped to the total; sorting and filtering keep `person` via hidden `directoryContext` inputs, and the selected desktop row carries `aria-current` (both forensic-audit regressions fixed).
- CSV parser handles BOM, CRLF, quoted commas and newlines, doubled quotes, delimiter detection (comma/tab/semicolon), duplicate headers, and reports unclosed quotes; the 5,000-row and 10 MB limits fail honestly. VCF handles folded lines, quoted-printable, TEL/EMAIL/ADR/N/FN/ORG/BDAY.
- Import commits are idempotent per row (`contact-import:<importId>:<rowId>`), background batches are lease-locked, resumable and cancellable, and "Retry failed rows" uses a fresh importId; date types are reused by name rather than duplicated.
- CSV export neutralises spreadsheet formulas and quotes every cell.
- Review tokens: 32 random bytes, stored hashed, 30-day expiry, one response with safe replay, per-token and per-IP rate limits; the public-review hop only redirects to an `https:` reviewUrl with `Referrer-Policy: no-referrer`; `/review/<token>` is `noindex`.
- Hosted lead form: honeypot, per-IP and per-form rate limits, required consent, no leak of whether the email/phone matched an existing customer, form id is a cuid.
- Archived contacts are excluded by the jump engine (`jump-engine.ts:399-401`), audience counts, recipient search, quick-add/import matching and Mix start; archiving cancels PENDING jumps; activity POST on an archived contact returns 409.
- Custom field values are validated against workspace definitions and capped at 2,000 characters; deleting a definition confirms the value count and lists dependent Mixes.
- Relationship state uses an optimistic version; Do-not-contact blocks bulk messages, Start mix and review requests, cancels PENDING jumps, and is OR-ed on merge.
- Merge core: survivor wins scalar conflicts (as the preview states), notes are appended with provenance, emails/phones/addresses/tags/custom values are unioned, activities, journey events, calendar entries, intake identities, workflow instances, DONE/SKIPPED jumps and drafts move, the source is archived with a `ContactMergeRecord` snapshot, and the typed-name confirmation is checked server-side.
- Next card follows the implementation contract: earliest PENDING jump, its own occurrence matched by workflow run, appointment binding, one-time batch or original date; unrelated runs are never joined; legacy Beats show "—"; one-time follow-ups show "Beat 1 of 1"; the directory's next-due label uses the same PENDING minimum.
- Prior P2 "contacts list uses 100vh" and "archived search field named Find a calendar contact" are closed for this scope (see Scope and method).

## Open questions for the owner

1. Phone canonicalisation (F3): is a US default country code acceptable, or do non-US customers exist today? This decides the backfill rule.
2. Archived duplicates (F6): when a new contact's number belongs to an archived person, should the app offer Restore, or allow the new record alongside the archived one?
3. Bulk archive (F4): was ending Mix assignments intentional for bulk archive? The single archive keeps them so Restore/Undo works.
4. Tag deletion with running Mix assignments (F11): block, or warn and proceed?
5. Desktop first load (F12): keep auto-selecting the first person (costs every phone list load a hidden profile), or show an empty pane until a row is chosen?
6. Lead form (F20): should an inquiry that matches an existing customer with history go to Review instead of auto-attaching and firing the journey event?
7. Import (F13): should an invalid email drop just that value with a warning rather than failing the row?
8. Review "opened" (F19): accept scanner false positives, or record "opened" only after the customer interacts?
9. Should an appointment-held PENDING Beat be the profile's "Next" item, or should Next skip held Beats? (Not verifiable statically; `ContactProfile.tsx:66` picks the earliest PENDING regardless of holds.)
