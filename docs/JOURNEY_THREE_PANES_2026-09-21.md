# Journey workspace panes

The owner requested the Contacts/Mixes pane structure for Journey: people on the left, the account’s Mix/Beat map in the center, and useful selection details on the right. This supersedes the older Journey pane composition, while preserving the supplied export and the existing dynamic workflow behavior.

Journey now meets the application rail directly. Its directory holds the title, Mix links, searchable people, status/stage filters and pagination. Selecting a person highlights their work and shows their existing progress controls without replacing the directory. The directory and its counts remain scoped to the account; instance details remain scoped to the selected person. Selecting a Mix filters the directory and exposes its actual Beats, status, pending work and connections in Details. Path selection and connection editing also use Details. With no selection, Details shows actual Mix, Beat and enabled-connection counts and guidance. Quiet-day check-ins remain available there, including the existing direct link.

Responsive assumption: inherit Contacts/Mixes’ available-space breakpoints. At 1700px and above, the workspace has a 440px directory, flexible map and 340px context pane. From 1200px, the directory is 360px and context follows the map. Selecting a Mix reveals that context; selected people have a View details shortcut. Below 1200px, People / Map / Details controls switch mounted panes. Selecting a person shows the map; selecting a Mix or path shows Details. Connection drafts survive pane switches and resizing. Map fit ignores hidden panes so switching panels cannot collapse its zoom.

The UI uses shared semantic colors, Instrument Sans, flat pane dividers, selected rows and the existing account-defined graph. No sample metrics, new execution rules or schema migration are introduced. The original design export is unchanged.

Verification evidence is retained in `.artifacts/journey-panes-20260921/`:

- All eight Journey browser scenarios passed, including search, filters, pagination, counts, Mix/Beat selection, person progress and pausing, starting work, independent directory selection, pane geometry, draft preservation and the quiet-day direct link. Responsive checks cover 21 widths from 320px to 3840px in both themes, with scoped Axe scans on all visible panes at five representative widths and a 200% text check. Contacts/Mixes directory boundaries match at 1200, 1440, 1700, 1920 and 3840px.
- All 17 existing connection browser scenarios passed, including Mix/Beat dragging, keyboard/touch controls, configuration conflicts, retry/recovery, advanced paths, path deletion and read-only views.
- The focused analytics, display and rule-save suites passed (20 tests); the final analytics integration rerun passed all three cases, including the added check that selecting one person preserves the account-wide directory while work and cross-account access remain correctly scoped.
- Screenshots were inspected against the supplied light/dark Journey phone/tablet/desktop screens and Contacts/Mixes exports. Final captures also show the selected-person and selected-Mix context on desktop and phone.
- Static schema, syntax, import and server-action checks passed. The final production build and its TypeScript check passed.

An earlier visual run reported theme contrast failures during live edits; inspected final computed colors and the complete repeat run passed. A phone selector that assumed an expanded node label was corrected to accept the overview label. These early failures are retained in the logs; they are not counted as successful checks.

Qualification uses disposable local databases and synthetic accounts. The isolated preview, fixture databases and task-specific build caches were removed after qualification. This local qualification preceded publication.

Published to https://jumpinthemix.com/journey on September 21, 2026 at 5:34 p.m. Pacific (September 22, 00:34 UTC), following the owner’s explicit “publish” instruction. The customer Render web service `srv-dagt93lbedkc738552o0` is live on commit `def2e96ed80dd5dc6062b5f76f0400da3e377077`, deployment `dep-daosoo740ujc738be7g0`, built from the isolated `release/journey-panes-20260921` branch. The existing worker remains live on `334d59d366254285e9b1aba4f2e8041f5744a2e9`; no migration or service configuration change was needed.

Production evidence is retained in `.artifacts/journey-panes-deploy-20260921/`:

- The hosted revision and all 793 runtime source hashes match the qualified release. All 20 fetched public assets match their hosted build files; the build ID is `XWeMGaJl_Yn8BKiUg-ZEc`.
- Liveness, readiness, worker and recovery-boundary health checks, plus public pages, returned HTTP 200. Protected routes, including Journey, redirected signed-out visitors to sign-in. All 66 database release requirements match.
- The authenticated live check passed all 16 checkpoints: real password sign-in; Contacts/Mixes pane alignment; directory counts, search, pagination and stage filters; keyboard person selection retaining the roster; persisted pause; empty-person highlighting; Mix details in Setup/Progress/Results; preserved connection drafts and a persisted disabled connection; quiet-day direct links; and both themes at 390, 834, 1440 and 1920px. All visible Journey panes passed scoped Axe checks without horizontal overflow. No browser page errors occurred. Live phone and desktop screenshots were inspected.
- The synthetic account, workspace and their fixtures were removed and their absence verified. No automated deliveries were created.

Render’s SSH connection briefly reached the previous draining instance after the deployment became live; source verification and the authenticated check ran after the hosted instance matched the new commit. The separate Netlify test site was not published: its existing database quota block was recorded in preflight, and the owner selected publication to the customer site.
