# Mix library and canvas path controls

## Owner direction

Add direct path removal from Journey. Consolidate “Find a starting rhythm” and the full ready-made library into one destination. Keep the ready-made card layout. Make My mixes a searchable workspace with a library at left, Beat preview/editing in the center, related information at right, favorites and shared icon controls. Preserve the supplied design export and its semantic colors, typography and responsive navigation.

## Implementation

Journey lines now select a highlighted path and show compact Edit/Delete controls above the canvas. The confirmation names the path and its effect. A branch deletion preserves sibling branches; deleting a join removes the shared join rather than pretending one derived join line is independent. Deleting the last path removes the connection. The workspace-scoped transaction merges unrelated saved configuration, requires review of a concurrently changed connection and acknowledges repeated removals without another revision or job. Failed requests retain the confirmation; failed refreshes after acknowledged writes report that the deletion succeeded. Keyboard selection and view-only maps remain supported. The shared confirmation component explicitly focuses Cancel on opening.

Existing execution semantics are retained: partial path/join changes apply to new work, and existing work keeps its saved definition. Removing an entire connection stops future handoffs through it. Existing Beats and history remain. Destination Beat entry policies stay explicit; deleting a line never silently restores scheduled execution. The confirmation explains this when the destination Beat is gated.

`/mixes/new` now redirects to `/templates`; `/mixes/new?custom=1` opens creation directly. The ready-made library retains its card/preview layout, search and filters, with personal favorites and icon actions. Its previous 500-candidate cap is removed so pagination covers all qualifying approved catalog entries.

My mixes uses a paginated, searchable left library, center Beat preview with an explicit Edit view, and right context for start timing, real people and configured incoming/outgoing Journey connections. Management actions remain available in a disclosure. Direct edit URLs redirect into this same workspace while retaining save/error/activation query state. Selecting an ID outside the visible library page opens that actual scoped Mix; unavailable or foreign IDs do not silently select another Mix. Phone navigation switches between Mixes, Beats and Details while keeping drafts mounted. Search and navigation retain unsaved-change protection.

Favorites are personal to the signed-in user and current workspace, available for owned reusable Mixes and approved ready-made templates. They persist in the database, are idempotent, cannot target foreign/private Mixes, and do not start or import any Mix. Support impersonation cannot change them. They are included in account export and cascade with their user, workspace or target.

## Database and deployment

The additive `20260921210000_mix_favorites` migration creates one table, foreign keys, unique indexes and an exactly-one-target check. No existing customer records or execution-engine semantics are changed. The prior application/worker schema checks accept this additive table. Schema release: 66 migrations, 106 models. Use the existing isolated owner-migration job and retain the restricted application role. Runtime source and deployment evidence will be recorded after verification.

## Verification

Evidence is retained under ignored `.artifacts/journey-path-removal-20260921/` and `.artifacts/mix-library-20260921/`. Verification covers path selection/removal, sibling/join preservation, save/retry/conflict handling, favorites persistence and ownership, whole-library pagination, direct selection, preview/edit/save, unsaved edits, both library entry points, keyboard/dialog focus, scoped accessibility and both themes at phone/tablet/desktop sizes. All 61 focused tests across seven suites, all 27 combined browser scenarios, schema/syntax/import validation and the production build passed. Final screenshots were inspected in both themes; the phone view uses pane controls instead of a long stacked workspace. Production verification follows after deployment.
