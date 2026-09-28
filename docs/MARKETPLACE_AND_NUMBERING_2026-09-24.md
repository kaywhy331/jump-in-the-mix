# Beat numbering, named Mega-Mixes and the Marketplace

On September 24 the owner asked for three connected changes to the Journey and Mix library. Each is a separate commit on `feat/marketplace-numbering-20260924`, based on the live `fix/design-consistency-20260923` (5d1b832). This record separates what was built and verified locally from what has not been released or measured.

| Commit | Change | Migration |
| --- | --- | --- |
| b3ab089 | Beat numbering by position, with a letter per branch | none |
| aeae0db | Named Mega-Mixes, Journey switcher, file export and import | `20260924120000_mega_mix_pipelines` (additive, backfilled) |
| 91e5aad | Marketplace: official and community sections, sharing, favorites, reports, staff review | `20260924180000_marketplace` (additive) |

## Owner decisions (September 24)

- **Nested splits** append letters: 1 → 2 → 3 → 4a / 4b, and a split inside branch a gives 6aa / 6ab.
- **Live edits**: a Marketplace listing always shows the author's latest saved version. Copies other people added never change by themselves; their pages say when the original changed, and adding the new version is the owner's choice.
- **Attribution**: the author chooses a public name on first share (the business name by default). Email addresses and phone numbers are refused as names and never shown.
- **Moderation**: shares go live at once after a privacy check. Reports take a reason and details. Serious reasons (private information, offensive content, spam or harmful links) hide the share at once. Staff review every report from the admin library and can restore the share. The author is always told.

## 1. Beat numbering

> **Superseded on September 28.** The owner replaced position numbering (1, 2, 3a, 4a/4b, 6aa) with Mix-and-Beat labels. Each starting point is a lettered journey. Its Mixes are numbered in the order its paths reach them: A1, A2, A3. Each Mix's Beats are lettered in order: A1.a, A1.b. Journeys are lettered by when their starting Mix was created. When a path hands people off into another journey's Mixes, the journey created first keeps them. Map cards and outlines show the Mix number (A3) instead of a Beat range (3a–4a). The implementation is `numberJourney` in `src/lib/journey-numbering.ts`; the rules below describe the September 24 scheme.

`src/lib/journey-numbering.ts` numbers every Beat from the saved Journey graph:

- Beats in a Mix are numbered in order.
- Where a path splits into new destinations, each branch gets a letter: 4a, 4b. A split inside a branch adds another letter: 6aa, 6ab. When a Beat in the middle of a Mix also leads elsewhere, the rest of that Mix becomes branch a.
- A join continues without letters, after the longest joined branch.
- Bounded return paths (those with a repeat limit), finishes and destinations that already have a number never start a branch, so loops keep their original numbers. When two paths reach the same Beat, it keeps its earliest number.
- A separate entry point gets its own track: B1, B2. An example is the Recruiter mega-mix's client entry beside its candidate entry.
- Archived and one-time Mixes are not numbered.

The numbers appear on:
- Beats on the Journey map, and each Mix's range (such as 3b–6b), at every zoom level.
- The list view, now in journey order, with numbered destinations on every path.
- Mix details, the selected-path panel, and the connection editor's Mix and Beat choices.
- Every Mega-Mix and Marketplace outline.

Numbers are computed, not stored. Editing a path renumbers what follows it.

## 2. Named Mega-Mixes, export and import

A Mega-Mix (`MegaMixPipeline`) is a named group of an account's Mixes. The account still has one Journey graph, and a Mix belongs to at most one Mega-Mix.

- **Existing installs:** the migration turns every ready-made install into a Mega-Mix with the same name, holding the Mixes it created that still exist.
- **New ready-made installs** create one too; a taken name becomes "Contractor 2".
- **Mixes → Mega-Mixes tab:** create, rename, describe, choose Mixes (a chosen Mix moves from its old Mega-Mix, with a notice), duplicate, and remove. Removing a Mega-Mix keeps its Mixes, people, follow-ups and connections, and allows its ready-made version to be added again.
- **Journey switcher:** Journey has a Mega-Mix switcher (All Mixes, each Mega-Mix, or Not in a Mega-Mix). It shows and numbers one pipeline at a time and keeps the choice in the address (`?megaMix=`).
- **File format:** Mix and Mega-Mix files are versioned JSON (`format: "jump-in-the-mix", version: 1`). They hold names, wording, text/email/call versions, timing (including appointment anchors), paths, waiting Beats and finishes. They never contain people, account ids or history.
  - Paths that lead outside a Mega-Mix, and Mixes without Beats or with a fixed-date start, are left out of the file. The page says how many.
- **Import:** a file is checked on the server and previewed before anything is saved, and needs a review confirmation. It adds new, independent Mixes that start no one.

## 3. Marketplace

The Ready-made tab is now **Marketplace**, with three sections:

- **Jump in the Mix:** the published ready-made Mixes and the five built-in Mega-Mixes, each with its full numbered outline. Setup goes through the existing ready-made flows, so audience and preference choices still apply.
- **Community:** shares from other accounts.
- **My shares:** your own shares, each with its status, favorites, number of copies added and reports.

Browsing:
- Filter by type (All, Mixes, Mega-Mixes).
- Search names, descriptions and author names.
- Filter by business type, channel (text, email or call) and length.
- Sort by most favorited (the default), newest or most added.
- Show favorites only.
- Community rows show a heart with the number of favorites.

Sharing:
- Every Mix and Mega-Mix page has a Share button.
- The privacy check flags email addresses, phone numbers, links, and greetings that name a person instead of `{{First Name}}`, in every Beat and channel version. The author confirms before sharing.
- Stop sharing takes a share down at once. Copies people already added stay theirs, and favorites return if it is shared again.
- Listings read the author's saved content every time they are viewed, so edits appear at once. Cached counts are refreshed on every read.
- Adding a share checks that the author hasn't changed it since the viewer reviewed it.

Reports:
- One report per person per share, at most 10 per hour.
- You can't report your own share.
- "Something else" needs details.
- Serious reasons hide the share at once.
- The author sees the reason and details, never who reported. Notices appear on the Mixes, Mega-Mixes and share pages, and an email is sent when transactional email is configured.
- Staff review under Admin → Content → Community reports. Viewing needs `mixes.edit`; restoring a share or keeping it hidden needs `mixes.publish` and a note for the author. These actions are recorded as platform audit events.
- JSON account exports include the Marketplace data. Reports received omit the reporter.

## Design assumptions

The supplied design export has no Mega-Mix or Marketplace screen. Both pages reuse the implemented Mix library workspace, which already follows the supplied Mixes screens:

- a directory with collection tabs, search, filter sheet and favorites;
- a central preview;
- a details pane;
- the same phone pane switcher.

They use only the shared tokens and components.

- **Beat numbers** follow the export's numbered Beat markers, extended to a pill so labels like 4a and 14baa fit.
- **Collection tabs:** the three tabs share the directory width.
- **Marketplace sections** use the segmented style, and types use chips.

## Verification (local, jitm_design_market database)

- **Unit and integration tests:**
  - Numbering: 12, including every built-in Mega-Mix, unique and single-entry.
  - Mega-Mixes and files: 7.
  - Marketplace rules: 7.
  - Marketplace service: 7.
  - The related existing suites also pass. `tests/shared-mix-boundary.test.ts` fails identically on 5d1b832, where the page no longer contains the string it checks for.
- **Browser, desktop and phone projects:**
  - `e2e/mega-mix-pipelines.spec.ts` (3 tests): create, rename, Journey switcher, export, import into another account, duplicate, remove, bad-file refusal.
  - `e2e/marketplace.spec.ts` (2 tests): privacy check, share, favorite count, add, live edit and update notice, report auto-hide, author notice, staff restore, filters.
  - Both specs also cover light and dark themes at 320–1920px with WCAG axe checks and no horizontal overflow.
- **Existing browser specs:** the journey-analytics, journey-connections, journey-rule-editing, mega-mixes, ready-made-panes and mix-library-workspace specs were run on desktop, and their failures were compared against 5d1b832. `mega-mixes.spec.ts:28` ("Mix started."), `journey-analytics.spec.ts:188` and `journey-rule-editing.spec.ts:149` fail identically there. One dark-theme contrast failure in `mix-library-workspace.spec.ts:66` passed on two reruns. `accessibility.spec.ts` passes (the demo seed is needed). `design-correction.spec.ts` (8 of 18 fail) and `visual-fitment.spec.ts` (6 of 9 fail) have failure sets identical to 5d1b832, run against the same database.
- Typecheck passes.

The isolated production build (`next build`) passes. Not done: physical-device testing. No customer outcome has been measured.

## Release requirements

1. Apply both additive migrations before the application code: `20260924120000_mega_mix_pipelines` backfills Mega-Mixes from existing installs, then `20260924180000_marketplace`.
2. Author emails need transactional email configured. Without it, authors still see in-app notices.
3. Community content is shared across accounts. Before opening it widely, the owner may want to confirm the report reasons that hide automatically, and the staff who hold `mixes.publish`.
