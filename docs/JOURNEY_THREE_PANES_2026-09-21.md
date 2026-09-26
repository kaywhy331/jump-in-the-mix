# Journey workspace panes

The owner requested the Contacts/Mixes pane structure for Journey: people on the left, the account’s Mix/Beat map in the center, and useful selection details on the right. This supersedes the older Journey pane composition, while preserving the supplied export and the existing dynamic workflow behavior.

Journey now meets the application rail directly. Its directory holds the title, Mix links, searchable people, status/stage filters and pagination. Selecting a person highlights their work and shows their existing progress controls without replacing the directory. The directory and its counts remain scoped to the account; instance details remain scoped to the selected person. Selecting a Mix filters the directory and exposes its actual Beats, status, pending work and connections in Details. Path selection and connection editing also use Details. With no selection, Details shows actual Mix, Beat and enabled-connection counts and guidance. Quiet-day check-ins remain available there, including the existing direct link.

Responsive assumption: inherit Contacts/Mixes’ available-space breakpoints. At 1700px and above, the workspace has a 440px directory, flexible map and 340px context pane. From 1200px, the directory is 360px and context follows the map. Selecting a Mix reveals that context; selected people have a View details shortcut. Below 1200px, People / Map / Details controls switch mounted panes. Selecting a person shows the map; selecting a Mix or path shows Details. Connection drafts survive pane switches and resizing. Map fit ignores hidden panes so switching panels cannot collapse its zoom.

The UI uses shared semantic colors, Instrument Sans, flat pane dividers, selected rows and the existing account-defined graph. No sample metrics, new execution rules, schema migration or deployment are introduced. The original design export is unchanged.

Verification evidence is retained in `.artifacts/journey-panes-20260921/`:

- All eight Journey browser scenarios passed, including search, filters, pagination, counts, Mix/Beat selection, person progress and pausing, starting work, independent directory selection, pane geometry, draft preservation and the quiet-day direct link. Responsive checks cover 21 widths from 320px to 3840px in both themes, with scoped Axe scans on all visible panes at five representative widths and a 200% text check. Contacts/Mixes directory boundaries match at 1200, 1440, 1700, 1920 and 3840px.
- All 17 existing connection browser scenarios passed, including Mix/Beat dragging, keyboard/touch controls, configuration conflicts, retry/recovery, advanced paths, path deletion and read-only views.
- The focused analytics, display and rule-save suites passed (20 tests); the final analytics integration rerun passed all three cases, including the added check that selecting one person preserves the account-wide directory while work and cross-account access remain correctly scoped.
- Screenshots were inspected against the supplied light/dark Journey phone/tablet/desktop screens and Contacts/Mixes exports. Final captures also show the selected-person and selected-Mix context on desktop and phone.
- Static schema, syntax, import and server-action checks passed. The final production build and its TypeScript check passed.

An earlier visual run reported theme contrast failures during live edits; inspected final computed colors and the complete repeat run passed. A phone selector that assumed an expanded node label was corrected to accept the overview label. These early failures are retained in the logs; they are not counted as successful checks.

Qualification uses disposable local databases and synthetic accounts. The isolated preview, fixture databases and task-specific build caches were removed after qualification. No staging or customer deployment was made.
