# Design adoption correction — 19 September 2026

This correction implements the missing workspace structures identified in the [gap analysis](DESIGN_GAP_ANALYSIS_2026-09-19.md). The original [design export](jump-in-the-mix-designs/index.html) remains unchanged and is the visual authority. [Implementation guidelines](DESIGN_GUIDELINES.md) and the repository instructions now require consulting its relevant screen and checking rendered screenshots, in addition to automated validation.

## Implemented

| Area | Result |
| --- | --- |
| Shared frame | 248px desktop rail, 80px compact rail at 901–1279px, bottom navigation at smaller widths. Shared semantic light/dark colors and locally hosted Instrument Sans/Newsreader continue across the application. |
| Today | Queue/review split starts at 768px, including portrait tablet. Overdue/Today groups, collapsed upcoming/done groups, compact avatar rows, person/stage heading, dated scheduled beats and desktop contact context. |
| Review | Visible channel choices, Copy, recorded completion, Snooze and Skip. Unusable channels explain why they are disabled. Saved per-channel drafts remain separate; unsaved text waits for autosave before a channel refresh. Completion floats above navigation with Undo and the next already-scheduled date when available. |
| Contacts | Desktop directory retains the selected profile; phones open the full profile. Last-name sorting, stage/due summaries, circular avatars, visible totals, direct contact actions, scheduled-beat rhythm, Journey and History. Existing selection, import and management workflows remain available. |
| Mixes | Desktop library opens a directly editable Mix with a beat timing line, real participants and Journey usage. Existing name/start settings collapse. Phone library has My mixes/Ready-made tabs and linked beat markers. Existing save, activation and appointment/broadcast behavior is retained. |
| Journey | Seven timing buckets, keyboard-accessible person popovers, explicit selection and current-page unscheduled selection. Selected roster precedes touchpoints on tablet; phone initially limits its roster to five rows. Stage and touchpoint counts come from stored records. |
| Calendar | Compact dated agenda, selected event editor and desktop contact context. Phone agenda leads; New event/Edit opens the form. Event scheduling and follow-up review remain distinct. |
| Quick Add | N shortcut outside typing fields, retained capture text and editable recognized details. The existing person/follow-up review form remains the save path. Rich multi-item creation is still pending the decisions below. |
| Homepage / More | Stronger responsive type, stacked tablet voice/waitlist sections, single-column phone profession directory and shared destination icons. Marketing claims were not expanded. |
| Other pages | Account, settings, help, onboarding, public forms, authentication and staff pages inherit the shared foundation and readable content/form widths. They have no exact supplied mockup; their review is against these shared components and actual available workflows. |

## Design/function decisions

- **Quick Add:** existing-person matching, duplicate resolution, event interpretation and atomic multi-item saves need a defined contract. The editable proposal is an improvement to the existing workflow, not completion of the export's “Save all” flow. The proposed direction is to review all items and resolve ambiguous people before saving them together.
- **Inactivity:** “after 60 quiet days” is not implemented as automation. A decision is needed on which recorded events reset that clock and whether the resulting Mix can recur.
- **Journey working assumption:** calendar weeks start Monday; Today/Tomorrow take precedence, including across a week boundary. “Select them” selects unscheduled people on the current page. Counts still cover the full filtered set. The stage ring separately uses its existing rolling seven-day window.
- **Appearance:** explicit theme choice is stored in this browser and synchronized between its tabs; account/device synchronization is not specified by the export.
- **Content and controls:** actual records, authored variants, available contact methods, the real logo and current access behavior take precedence over fictional example records. Ordinary navigation has no bubble tails; the branded Quick Add control is the documented export exception.

## Verification and review evidence

Verification uses a disposable local PostgreSQL database, fictional records and an optimized Next.js build. No email/text sending credentials are supplied. Screenshots and checks do not establish measured customer outcomes or exact pixel equivalence.

Local evidence and the [reference/implementation viewer](../../.artifacts/design-correction-20260919/index.html) are under `.artifacts/design-correction-20260919/` (ignored by Git). Session/environment files there are private and must not be shared. Validation completed so far:

- Optimized `npm run build`: passed, including TypeScript and 102 generated pages.
- Four focused Vitest files: **14 tests passed**, covering Journey boundaries/roster filtering, rendered follow-ups and UI readiness.
- **39 distinct browser checks passed across focused runs**: design correction (8), appearance/responsive adoption (6), sheet interactions (2), drafts (6), channel variants (2), Today navigation/recovery/zoom (14), outcome/contact timeline (1). Failed checks were diagnosed and rerun after correcting application behavior or outdated selectors. This is an aggregate, not a claim that one uninterrupted full-repository suite passed.
- Browser scenarios include durable per-channel drafts and private call notes, completion/Undo and recovery races, 625-record pagination, contact selection/back navigation, note saving, Journey keyboard previews and current-page selection, Quick Add detail transfer, Calendar creation/editing, and native 200%/400% browser zoom.
- The newest eight design workflow checks pass against the final CSS, including explicit channel-icon size checks and phone profile use.
- `git diff --check`: passed.

Rendered review:

- **188 route checks across 93 URLs**: desktop light (1440px) and narrow-phone dark (320px). After the focused recheck, no recorded horizontal overflow, WCAG A/AA violations, browser exceptions or server failures. The missing lead/not-found fixtures intentionally return 404. Public-policy pages were checked with explicitly fictional local operator settings; those are not deployment configuration.
- **46 screenshot states**, covering all 23 supplied light/dark layout pairs at 390, 834, 1194 and 1920px, with no recorded overflow, WCAG A/AA violations or browser exceptions. The review includes capture/proposal, phone review and completion/Undo states. Modified screenshot states were recaptured after final CSS corrections.
- Manual visual inspection included the core workspace, phone/tablet, homepage and dark equivalents, plus representative preference, settings, Help, archived-contact, profession and staff pages. The all-route scan is not a claim of visual sign-off for every unmocked template.
- **100 breakpoint measurements** across Today, Contacts, Mixes, Calendar and Journey in both themes: 767/768, 900/901, 1199/1200, 1279/1280, 1700 and 3840px. No document overflow, collapsed measured workspaces or measured workspace columns outside the viewport. All 46 reference/implementation image pairs resolve in the local viewer.
- Source data differs from the export by design. Local preparation notices can be visible because worker preparation is not continuously running in the isolated fixture environment. These notices were not suppressed to make screenshots look cleaner.

The comparison is about composition and usable workflows, not identical sample content. The full contact history remains on the contact profile; Today’s context pane currently shows contact methods and notes with a link to that profile. Mix editing retains the existing explicit save/activation review and additional timing controls. Quick Add remains the largest intentional functional difference from the supplied screens.

This is a local implementation, not a deployment. The earlier adoption report is historical evidence and does not establish completion of the open workflows above.
