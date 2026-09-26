# Mixes, Journey and Marketplace audit — 2026-09-24 (d70ec54)

## Scope and method

Read-only static review of the worktree at `the repository` (d70ec54 = e26fdd4 + docs). Deepest review of today's commits b3ab089 (numbering), aeae0db (named Mega-Mixes, export/import), 91e5aad (Marketplace), 931a9ea and e26fdd4.

Read end to end: `src/lib/journey-numbering.ts`, `src/lib/mix-portable.ts`, `src/lib/mega-mix-pipeline-service.ts`, `src/lib/mega-mix-pipeline-actions.ts`, `src/lib/marketplace.ts`, `src/lib/marketplace-service.ts`, `src/lib/marketplace-actions.ts`, `src/lib/mega-mix-service.ts`, `src/lib/mix-workflow.ts` (definition read/save), `src/lib/mix-workflow-validation.ts`, `src/lib/mix-workflow-config.ts`, `src/lib/mix-workflow-rule-save.ts`, `src/lib/mix-workflow-view.ts`, `src/lib/slug.ts`, `src/lib/step-timing.ts` (validator), `src/app/(app)/marketplace/page.tsx`, `src/app/(app)/mixes/page.tsx`, `src/app/(app)/mixes/mega/page.tsx`, `src/app/(app)/journey/page.tsx`, `src/app/(staff)/admin/marketplace/page.tsx`, `src/app/api/marketplace/favorites/route.ts`, `src/app/api/mixes/[mixId]/export/route.ts`, `src/app/api/mega-mixes/[pipelineId]/export/route.ts`, `src/app/api/mix-workflow/route.ts`, the account-export diff, `src/components/{MarketplaceControls,MarketplaceShare,MegaMixForms,PortableOutline,WorkflowJourney,WorkflowRuleEditor,WorkflowPathActions}.tsx` (the last three in the relevant parts), `prisma/mega-mix.prisma`, `prisma/marketplace.prisma`, both 20260924 migrations, `tests/journey-numbering.test.ts` and the test-case lists of the three new suites. Targeted greps for the Mix editor save path (`mix-editor-actions.ts`, `MixEditor.tsx`), activation-preference enforcement, date-trigger matching (`jump-engine.ts:432`), CSRF (`proxy.ts`), owner-visible audit reads, and the docs named in the brief.

The numbering algorithm was probed by copying `journey-numbering.ts` into the scratchpad and running 13 graphs under `node --experimental-strip-types` (no project code was compiled or run; nothing was written inside the repo).

Could not check statically: query cost under real data (F10 is SUSPECTED), the live Render database (whether any duplicate date types already exist from imports since the release), browser rendering, and physical devices. The Next.js server-action body limit (1 MB) was taken from the brief, not measured.

## Findings (ranked, most severe first)

### F1. Imported, copied and Marketplace-added date-based Mixes bind to a fresh duplicate date type and never start
- Severity: P1
- Status: VERIFIED
- Evidence: `src/lib/mega-mix-pipeline-service.ts:121-127` — `resolveDateType` computes `slug = slugify(dateType.slug || dateType.name)` and then `findFirst({ where: { slug, OR: [...] } })`. `src/lib/slug.ts:1-9` — `slugify` always appends a random six-character suffix (`${base}-${Math.random()...}`), so the lookup can never match an existing row; line 126 then creates a new `DateType` (`scopeKey: workspaceId`, name copied from the file). `installPortable` (`:140-143`) stores that new id as the Mix's `dateTypeId`. Date-based scheduling matches on the id only: `src/lib/jump-engine.ts:432` (`item.dateTypeId === assignment.mix.dateTypeId`). `buildPortable` exports the source's real slug (`:98`), e.g. `birthday` for the system type. The same pattern pre-exists in `src/lib/shared-mix-use-service.ts:21` and `src/lib/shared-mix-service.ts:84` (ready-made single-Mix use), so it is not new, but every path shipped today (file import, Mega-Mix duplicate, Marketplace add) inherits it. No test covers a `DATE_TRIGGERED` import (`tests/mega-mix-pipelines.integration.test.ts` only uses `MANUAL_START`).
- Failure scenario: Account A exports a Mega-Mix containing "Birthday note" (system date type `birthday`). Account B imports it (or A duplicates it). B's copy is `DATE_TRIGGERED` on a brand-new custom type also named "Birthday" (slug `birthday-k3j9x2`). B assigns contacts whose birthdays are saved under the system type; nothing is ever scheduled, with no error. Settings → Dates now shows two "Birthday" types; every further import adds another.
- Fix: in `resolveDateType`, build a deterministic key (reuse `stableKey` from `src/lib/contact-import-shared.ts:17`, as the contact import already does at `contact-import-service.ts:299-316`) and match `slug` OR case-insensitive `name` across system and workspace types before creating; for `duplicateMegaMixPipeline` (same account) pass the source `dateTypeId` straight through. Apply the same one-line change to `shared-mix-use-service.ts:21` and `shared-mix-service.ts:84`.
- Effort: S; Risk: low; Needs migration: no (a one-off cleanup of duplicate `DateType` rows created since release may be wanted; production had no listings at release, so likely none); Needs owner decision: no
- Tests: integration test exporting a `DATE_TRIGGERED` Mix on the system `birthday` type, importing into another account, asserting the new Mix's `dateTypeId` equals the system type and `dateType.count()` is unchanged; a second case for a workspace custom type matched by name.

### F2. Staff "Restore share" republishes a listing the author already withdrew
- Severity: P1
- Status: VERIFIED
- Evidence: `src/lib/marketplace-service.ts:264-271` — `reviewListing` sets `status: "LIVE"` on RESTORE and `status: "HIDDEN"` on HIDE regardless of the current status. `src/app/(staff)/admin/marketplace/page.tsx:22` — the "Needs review" tab lists any listing with an OPEN report, including `UNSHARED` ones (rendered as "Not shared", `:36`), and `:40-43` offers both buttons for them.
- Failure scenario: A MISLEADING report (no auto-hide) leaves the share LIVE with an OPEN report. The author reads the notice and clicks Stop sharing (`UNSHARED`). Staff later open the queue and click "Restore share" to close the report: the author's withdrawn wording is public again without their consent. Conversely "Keep hidden" on an unshared listing turns it `HIDDEN`, so the author can no longer re-share their own content (`marketplace-service.ts:56`).
- Fix: in `reviewListing`, change status only when `listing.status === "HIDDEN"` (RESTORE → LIVE) or `LIVE` (HIDE → HIDDEN); for `UNSHARED` just close the reports (DISMISSED/UPHELD) and keep the status. On the staff page, label the buttons by state ("Dismiss reports" when the share is not hidden) and show the status in the decision copy.
- Effort: S; Risk: low; Needs migration: no; Needs owner decision: no
- Tests: extend `tests/marketplace.integration.test.ts:66` with an unshare before the staff decision and assert the status stays `UNSHARED` while the report closes.

### F3. Removing a Mega-Mix silently deletes its Marketplace share and every report on it — a two-click way out of a hidden listing
- Severity: P1
- Status: VERIFIED
- Evidence: `src/lib/mega-mix-pipeline-service.ts:78-88` — `deleteMegaMixPipeline` deletes the pipeline without looking at its listing. `prisma/migrations/20260924180000_marketplace/migration.sql:109` — `MarketplaceListing.pipelineId → MegaMixPipeline ON DELETE CASCADE`; `:111,117,121` — favorites, imports and reports cascade from the listing (schema `prisma/marketplace.prisma:106,121,138,161`). Mixes cannot be hard-deleted by users (only archived), so this is specific to pipelines. The confirm dialog (`src/components/MegaMixForms.tsx:47`) says only "Its Mixes, their people, follow-ups and Journey connections all stay."
- Failure scenario: A community report for PRIVATE_INFO hides a Mega-Mix share. The author opens Mega-Mixes → Manage → Remove Mega-Mix (the Mixes stay), creates a new Mega-Mix with the same Mixes and shares it: it is LIVE again with zero reports and no HIDDEN state; the staff queue row and its report details are gone (only `auditLog`/`platformAuditEvent` rows remain). A LIVE share removed this way also drops other people's favorites and the "Update available" link on their copies without warning.
- Fix (minimal): in `deleteMegaMixPipeline`, refuse when the listing is `HIDDEN` or has OPEN reports ("This Mega-Mix's share is under review; it can be removed once the review is done"), and add "This also removes its Marketplace share" to the dialog when a listing exists. Fuller: change the `pipelineId`/`mixId` FKs to `SetNull`, mark the listing `UNSHARED` on removal and keep reports for staff.
- Effort: S (refusal) / M (FK change); Risk: low / medium; Needs migration: no / yes; Needs owner decision: yes (which behaviour is wanted)
- Tests: integration: hide a Mega-Mix listing by report, call `deleteMegaMixPipeline`, assert the refusal (or the surviving reports under the fuller option).

### F4. Mix editor: two tabs, last save wins (gap-audit item 6 still open)
- Severity: P1
- Status: VERIFIED
- Evidence: `src/lib/mix-editor-actions.ts:105-135,238-306` — `saveMixAction` takes no Mix revision or `updatedAt`; only the AFTER_MIX connection carries `workflowRevision` (`:335`). `src/components/MixEditor.tsx` has no hidden revision field (grep for revision/updatedAt: none). Inside the transaction, Beats absent from the form are removed (`:300-306`). Contrast `src/lib/mix-workflow-rule-save.ts:44-46`, where connections are protected by a canonical-JSON compare. `docs/UI_UX_DEEP_GAP_AUDIT_2026-09-23.md:29,117` lists this as item 6 needing a decision; neither status section closes it.
- Failure scenario: Phone tab adds Beat 4 and saves. Desktop tab, opened earlier with three Beats, changes wording and saves: Beat 4 is deleted (unless it is gated or connected, in which case the save fails loudly with "Remove the Journey connections…").
- Fix: render `mix.updatedAt` (or a revision) as a hidden field; inside the existing `FOR UPDATE` block (`:240`) re-read the Mix and fail with "Changed on another device. Reload to compare." when it differs; MixEditor keeps the entries (the item-5 catch at `MixEditor.tsx:152-160` already handles that).
- Effort: M; Risk: low; Needs migration: no; Needs owner decision: no (the message wording only)
- Tests: integration: two saves with the same stale token; e2e: two contexts editing one Mix.

### F5. The privacy check skips wording the Marketplace shows publicly: connection names, path labels and outcomes
- Severity: P2
- Status: VERIFIED
- Evidence: `src/lib/marketplace.ts:37-58` scans package/mix names and descriptions, Beat name/subject/body/script and channel versions, but not `rule.name`, `route.label` or `route.outcome`. `src/components/PortableOutline.tsx:25` renders every `route.label` in the public outline (and `WorkflowJourney.tsx:216` in the author's list view). These fields are free text up to 160 characters typed in the connection editor (`WorkflowRuleEditor.tsx:67,74,78`). Also not scanned: `mix.category/industry/framework` and `dateType.name` (exported, not displayed).
- Failure scenario: a contractor names a path "Called Maria Gonzalez back, 555-201-4477 — wants June" and shares the Mega-Mix. "No private details found" is shown; the outline publishes the label to every account.
- Fix: in `shareWarnings`, add `scan(rule.name, rule.name)` and, per route, `scan(route.label, …)`, `scan(route.outcome, …)`; consider `category/industry/framework/dateType.name`.
- Effort: S; Risk: low; Needs migration: no; Needs owner decision: no
- Tests: `tests/marketplace.test.ts` case with a phone number in a route label.

### F6. Import validation is looser than the editor: files can create Beats the editor would refuse, and some files fail with a raw database message
- Severity: P2
- Status: VERIFIED
- Evidence: `src/lib/mix-portable.ts:15-21` allows `dayOffset` ±3650, `offsetMinutes` ±525,600, any anchor on any trigger mode, negative `VISIT_COMPLETED` offsets and up to three variants without family uniqueness. The editor enforces ±365 days (`mix-editor-actions.ts:19,171`), no negative calendar offsets for manual start (`:179`), appointment anchors only for manual start (`:176`), a 30-day appointment window and non-negative VISIT_COMPLETED (`step-timing.ts:16,38-40`). `prisma/preparation.prisma:83` has `@@id([stepVersionId, family])`, so two `TEXT` variants make `installPortable` (`mega-mix-pipeline-service.ts:148-150`) throw a Prisma unique-constraint error, which `failed()` (`mega-mix-pipeline-actions.ts:11`, `marketplace-actions.ts:10`) shows verbatim because it is an `Error`. Marketplace adds run the same code, so a file-imported Mix with such timing can be shared and copied on.
- Failure scenario: a hand-edited or third-party file with `dayOffset: -3650` on a manual-start Mix imports fine; starting someone schedules Beats ten years in the past. A file with duplicate variant families shows "Invalid `prisma.stepTemplate.create()` invocation … Unique constraint failed on the fields: (`stepVersionId`,`family`)".
- Fix: add to `portableSchema.superRefine`: per step, reuse `validateStepTiming`-equivalent rules (anchor vs trigger mode, offset caps, VISIT_COMPLETED ≥ 0, ±365 days, no negative calendar offsets on manual start) and unique variant families; in the import/add actions, map non-domain errors (Prisma) to the generic fallback.
- Effort: S–M; Risk: low; Needs migration: no; Needs owner decision: no
- Tests: unit cases for each refused shape in `tests/mega-mix-pipelines.integration.test.ts:98`.

### F7. Numbering edge cases: repeat-limited forward paths, disabled connections, track order, and join gaps
- Severity: P2
- Status: VERIFIED (by probe)
- Evidence: `src/lib/journey-numbering.ts:22` — `forward()` refuses any route with a repeat limit, so a *forward* path with "Repeat limit 1" is treated as a return; `:30` marks the destination as not entered; probe: `a→b (maxVisits 1)` gives `b1: "B1"` instead of `3`. `:22-23,48-53` never check `rule.enabled`; probe: a disabled `a→b` still numbers `b1: "3"`, whereas the validator treats disabled rules as non-edges (`mix-workflow-validation.ts:32`). `:69-71` assigns track letters in input order; Journey passes Mixes ordered by name (`mix-workflow.ts:27`, `WorkflowJourney.tsx:87`) while the Mega-Mix and Marketplace outline pass pipeline position order (`mega-mix-pipeline-service.ts:93-94`, `PortableOutline.tsx:10`); probe: swapping input order swaps `1…` and `B1…`. `:60-61` computes a join's span from the branch Mixes' full length even when a branch was already numbered on another track; probe: `B1, B2` then join `B5`.
- Failure scenario: an owner caps a normal hand-off at one repeat as a safety measure; its destination Mix drops out of the numbered flow and becomes "B1". Two unconnected entry Mixes "Estimate" and "Aftercare": renaming "Aftercare" to "Post-job care" re-letters every number on the map. The same Beat reads "1" in Journey and "B1" in the Mega-Mix outline when the pipeline's first member sorts later alphabetically.
- Fix: in the walk, follow limited routes whose target has no number yet (loops are already prevented by `labels`; keep the `maxVisits === null` test only for `entered`); skip `!rule.enabled` rules (or label them) — owner call; number from one canonical order on both surfaces (pipeline position, then name); document that joins count only unnumbered branch Beats or use `beats.filter(!labels.has)` for the span.
- Effort: S–M; Risk: low; Needs migration: no; Needs owner decision: yes (disabled connections; canonical order)
- Tests: add the four probe graphs to `tests/journey-numbering.test.ts`, plus a Journey-vs-outline equality test for a two-entry pipeline.

### F8. Popularity counters include the author's own favorites and adds; an author can add their own listing repeatedly
- Severity: P2
- Status: VERIFIED
- Evidence: `src/lib/marketplace-service.ts:192-204` — `addFromMarketplace` never compares `listing.workspaceId` with the caller's workspace; each add creates a `MarketplaceImport` row (`:201`). Sorting by "Most added"/"Most favorited" uses raw `_count` (`:128,133,140`); `setListingFavorite` (`:180-186`) allows the author. The detail pane hides the favorite button for own listings (`marketplace/page.tsx:109`) but the API does not.
- Failure scenario: an author adds their own one-Beat Mix twenty times (each add is a cheap new Mix in their own account) and tops "Most added".
- Fix: refuse `addFromMarketplace` and `setListingFavorite` when `listing.workspaceId === viewer.workspaceId`, or exclude that workspace from the counts (`_count: { imports: { where: { workspaceId: { not: … } } } }`).
- Effort: S; Risk: low; Needs migration: no; Needs owner decision: yes (block vs exclude)
- Tests: integration: own add refused / not counted.

### F9. A shared Mix that becomes unavailable stays LIVE, skews counts, and its own page shows the generic empty state
- Severity: P2
- Status: VERIFIED
- Evidence: `src/lib/marketplace-service.ts:21-27` — archiving, emptying or switching a shared Mix to a fixed-date start makes `livePackage` null (also for any thrown DB error, which is swallowed); `:137-138` filters such rows out of Community but `total` (`:129`) still counts them; `:180-186` still lets anyone favorite the listing by link. In "My shares" the row remains (`:138`), but `src/app/(app)/marketplace/page.tsx:106,134` renders "Nothing to show / Try another search" when `item.value` is null, so the author cannot see the status, reports or the "Open to edit" link. Moving the only Mix out of a shared Mega-Mix (`setMembers`) has the same effect.
- Failure scenario: an author archives a shared Mix that has an OPEN report; My shares lists it but selecting it shows an empty state, the report notice links to a dead pane, and "20 results" shows 19 rows.
- Fix: render the own-share pane (status, reports, manage link) even without content; exclude unavailable listings from `total` or mark them; consider setting `UNSHARED` when the underlying Mix is archived (`archiveMixAction`).
- Effort: S–M; Risk: low; Needs migration: no; Needs owner decision: yes (auto-unshare on archive)
- Tests: integration: archive a shared Mix, read "mine", assert the item still returns status/reports.

### F10. Listing reads do a full live export per row, loading the author's entire workspace graph each time
- Severity: P2
- Status: SUSPECTED (cost not measured)
- Evidence: `src/lib/marketplace-service.ts:137` — every Community/My-shares row calls `refreshListing`, which runs `exportSingleMix`/`exportMegaMixPipeline`; for Mega-Mixes that calls `readWorkflowDefinition` (`mix-workflow.ts:24-36`), which loads *all* Mixes of the author's workspace with steps, versions and variants, then may `UPDATE` the listing from a GET. `:166` repeats it for the selected item; `:211` again for update checks. Twenty Mega-Mix rows from large accounts = 20 × (pipeline + members + whole-workspace graph) queries per page view, by any visitor.
- Failure scenario: a few popular authors with 100+ Mixes make the Community tab slow for everyone and generate write traffic on read.
- Fix: refresh on write instead (after `saveMixAction`, `saveWorkflowConfiguration`, `setMembers`) or gate `refreshListing` on a cheap staleness signal (max `updatedAt` of member Mixes + workflow revision) and read only the pipeline's Mixes in the export path.
- Effort: M; Risk: medium; Needs migration: no; Needs owner decision: no
- Tests: query-count assertion around `readMarketplace` with 20 listings.

### F11. Journey wait field still shows "05" after clearing and rounds small values to 0 (gap-audit P2, unchanged)
- Severity: P2
- Status: VERIFIED
- Evidence: `src/components/WorkflowRuleEditor.tsx:16-19` — a controlled `type="number"` input whose value is `Math.round((minutes / unit) * 100) / 100`; clearing sends `Number("") = 0`, so the field snaps to `0` and the next keystroke reads "05"; with the unit on days, 1 minute displays as 0.
- Failure scenario: as described in `docs/UI_UX_DEEP_GAP_AUDIT_2026-09-23.md:97`.
- Fix: keep the typed string in local state and commit on blur/valid parse.
- Effort: S; Risk: low; Needs migration: no; Needs owner decision: no
- Tests: component test for clear-then-type and for 1 minute in days.

### F12. Add contact Back link drops the Mix context (gap-audit P2, unchanged; outside this dimension, noted because the brief named it)
- Severity: P2
- Status: VERIFIED
- Evidence: `src/app/(app)/contacts/new/page.tsx:44` — `<BackLink href="/contacts" …/>` while `:47-49` already carry `returnTo` for the notice and form.
- Fix: `href={workflowContinuation(query.returnTo) ?? "/contacts"}`.
- Effort: S; Risk: low; Needs migration: no; Needs owner decision: no
- Tests: e2e: Journey → Add contact → Back returns to Journey with the Mix.

### F13. After staff uphold a report the author has no in-product way back
- Severity: P2
- Status: VERIFIED
- Evidence: `src/lib/marketplace-service.ts:56` — re-sharing a `HIDDEN` listing throws; `:72` — unshare is a no-op for HIDDEN; `reviewListing` is the only path to LIVE and is staff-only. The author-facing copy promises "we'll let you know when the review is done" (`MarketplaceControls.tsx:40`) but after UPHELD nothing offers "I fixed it, please review again". Minor related polish: the Mega-Mix About pane (`mixes/mega/page.tsx:100`) attributes skipped Mixes to "no Beats or a fixed-date start" although archived members are also skipped (`mega-mix-pipeline-service.ts:91`).
- Failure scenario: a hidden share is corrected by the author; it stays hidden indefinitely unless they email support.
- Fix: a "Request another review" action that flags the listing (e.g., a new OPEN report row of kind REVIEW_REQUEST or a `reviewRequestedAt` column) so it re-enters the staff queue.
- Effort: M; Risk: low; Needs migration: yes (small); Needs owner decision: yes

## Checked and fine

- Cross-account authorization: share/unshare/add/import/duplicate/pipeline edits are owner-only via `assertOwner`/`lockOwnedWorkspace`; export routes, Mega-Mix page and listing lookups are scoped by `workspaceId`; `readMarketplaceItem` returns non-LIVE listings only to their owner; favorites/reports accept LIVE listings only; staff review needs `mixes.edit` to view and `mixes.publish` to decide (page and action).
- Reporter anonymity: report selects, the author email and the account export omit the reporter; the reporter's user id appears only in the author-workspace `auditLog` row (`marketplace-service.ts:232`), which is staff-only (no owner-facing audit read or export).
- Reports: one per person per share (unique index + `FOR UPDATE`), 10/hour via `consumeRateLimit`, own-share refusal, "Something else" needs details, auto-hide for PRIVATE_INFO/OFFENSIVE/SPAM only, in-app notices on Mixes/Mega-Mixes/Marketplace plus an idempotent email, platform audit events for staff decisions.
- Portable file: `.strict()` everywhere, key regex, capped arrays, `__proto__` rejected as an unknown key, 900 KB checked on both client (bytes) and server (chars), under the 1 MB action limit; ids re-keyed (`m1/b1`), no people, history or account ids; exported date-type slugs are random-suffixed strings, not ids.
- Import safety: connections, waiting Beats and finishes must point inside the file; the merged graph goes through `validateWorkflow`, so unbounded loops, self-loops, missing targets and un-gated Beat targets are refused and the whole transaction rolls back; nobody is assigned or started.
- Pipeline membership: `MegaMixPipelineMix.mixId` is the primary key, `setMembers` upserts (moves) under the workspace lock, names unique per workspace case-insensitively, removal keeps Mixes and clears the blueprint receipt.
- Backfill migration: `jsonb_each_text` over the object map written by `installMegaMix`, member positions ordered by Mix creation, `ON CONFLICT DO NOTHING`, cascades and indexes adequate for current sizes.
- Fingerprint gate on add and the "Update available" notice on both the Marketplace pane and Mix/Mega-Mix pages; unshare keeps copies and favorites; re-share resets `publishedAt`.
- `save-rule`/`remove-path` compare-and-swap on canonical JSON under the workspace lock; `configure` checks the revision; the workflow API is rate-limited and same-origin-guarded by `proxy.ts`.
- Numbering probes that behaved: nested letters, joins of unequal length, bounded returns, mutual bounded loops, deleted or archived targets, beat-level targets (consistent with "Starts only this Beat"), a gated Beat targeted from within its Mix, 27+ tracks (`AA1`), natural sort and range helpers.
- Activation preference is enforced server-side in the editor, list activation and ready-made single-Mix use; item 5 (failed save keeps entries) is present in `MixEditor.tsx:152-160`.
- Account export includes Mega-Mixes and Marketplace data with reports-received minus the reporter, as the record states.

## Owner decisions from the record: implemented / not implemented

- Nested splits append letters (4a/4b, 6aa/6ab): implemented (tests and probes).
- Live edits — listing shows the author's latest save, copies never change by themselves, pages say when the original changed: implemented (`livePackage` per read; import fingerprint compare; notices).
- Attribution — public name chosen on first share, business name default, email/phone/link refused, never shown: implemented (`cleanPublicName`; workspace name as default).
- Moderation — live at once after a privacy check; reports with reason and details; serious reasons hide at once; staff review from the admin library and can restore; author always told: implemented, with the caveats in F2 (restore on unshared listings), F3 (removal wipes reports) and F13 (no path back after an upheld report).
- Numbering surfaces (map, ranges, list in journey order, details, path panel, connection editor, outlines): implemented; "Archived and one-time Mixes are not numbered": implemented; "when two paths reach the same Beat it keeps its earliest number": implemented; "bounded return paths never start a branch": implemented but over-applied to forward paths with a limit (F7).
- Existing installs become named Mega-Mixes / new installs create one / "Contractor 2" on a taken name: implemented.
- Create, rename, describe, choose Mixes (moves with a notice), duplicate, remove keeping Mixes and re-enabling the ready-made version: implemented (removal side effect on shares: F3).
- Journey switcher with `?megaMix=` (All, each, Not in a Mega-Mix): implemented; numbering per scope differs from the outline's track order (F7).
- Versioned file format with no people, account ids or history; outside paths and Beat-less/fixed-date Mixes left out with counts: implemented (archived members are also left out but the message does not say so).
- Import checked on the server, previewed, review confirmation, adds independent Mixes that start no one: implemented — but imported Mixes are created `ACTIVE` (`installPortable:143`), like ready-made installs, not as drafts; and date-based Mixes are broken by F1.
- Marketplace sections, type/industry/channel/length filters, search, three sorts, favorites-only, hearts with counts: implemented (official search covers title/summary only, which is all that varies).
- Share button on every Mix and Mega-Mix page: implemented (not for one-time Mixes, by design).
- Privacy check "in every Beat and channel version", author confirms: implemented for Beats and versions; not for connection names, path labels and outcomes (F5); runs only at share time, later edits go live unchecked (documented as the live-edit decision).
- Stop sharing at once, copies stay, favorites return on re-share: implemented.
- Listings read live and cached counts refreshed on every read: implemented (cost: F10).
- One report per person, 10/hour, no self-report, "Something else" needs details, serious reasons hide, author sees reason and details never the reporter, notices plus email, staff view `mixes.edit` / decide `mixes.publish` with a note, platform audit events: implemented.
- JSON account export includes Marketplace data with the reporter omitted: implemented.

## Open questions for the owner

1. Any signed-in account can hide any share instantly with a PRIVATE_INFO/OFFENSIVE/SPAM report (10 per hour per user, no account-age or reputation gate). Is that the intended trade-off for launch, and should repeated dismissed reports from one account be throttled?
2. After staff uphold a report, should authors get a "request another review" path (F13), or is support email the intended route?
3. Should removing a Mega-Mix be refused while its share is hidden or reported, or should the share become "Not shared" with its reports kept (F3)?
4. Should archiving a shared Mix (or emptying a shared Mega-Mix) stop sharing it automatically (F9)?
5. Should editing a shared Mix re-run the privacy warnings or show "This wording is public" in the editor, given edits go live at once?
6. Imported, copied and Marketplace-added Mixes are created as "On" (ACTIVE) rather than drafts, while the personal activation preference gates every other activation. Intended?
7. Numbering: should disabled connections be numbered as flow (today yes), and which order should decide track letters — pipeline position (outline) or Mix name (Journey)?
8. Should an author's own favorites and adds count toward "Most favorited"/"Most added" (F8)?
9. If any date-based Mixes were imported or duplicated on production since the release, should the duplicate date types be merged as part of the F1 fix?
