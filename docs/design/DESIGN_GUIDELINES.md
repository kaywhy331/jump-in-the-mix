# Jump in the Mix design guidelines

The supplied [design export](jump-in-the-mix-designs/index.html) is the visual authority for the homepage and webapp. Preserve its original HTML, tokens and canvas files. Its fixed-size screens illustrate layouts, not production content or product capabilities. Use the existing real logo. Consult the [homepage roadmap](../HOMEPAGE_EXPERIENCE_ROADMAP_2026-09-10.md), asset index and relevant fictional ICP hypotheses for content decisions.

## Shared foundation

- `src/styles/design-tokens.css` implements the supplied palette. Use semantic tokens rather than new page-specific hex colors. `design-system.css`, `design-workspaces.css` and `design-public.css` implement common controls and layouts; they load after legacy styles during migration.
- Instrument Sans is the interface font. Newsreader is for a person's words: drafts, message previews, notes and Quick Add capture. Both fonts are hosted locally with OFL licenses in `src/app/fonts`.
- Page, surface, raised and selected are distinct surfaces. Violet button fills remain `--violet` in both themes; readable violet text uses `--violet-text`, marks use `--violet-mark`, and quiet selection uses `--violet-wash`.
- Controls have 12px corners, sheets 24px, conversation bubbles 20px. A bubble tail uses the same fill variable as its body. Use flat rows and fine separators; shadows belong primarily to overlays.
- Every screen supports System, Light and Dark. System follows the operating system. Explicit choices are stored in this browser, synchronize between its tabs and apply before rendering with the request CSP nonce. There is no account-level theme setting. If storage is blocked, the choice applies to the current visit with an explanation.

## Layout and interaction

- Desktop uses a quiet left rail: Quick Add, Today, Contacts, Mixes, Journey and Calendar, then account/settings/help. Phones and portrait tablets retain a reachable bottom navigation with the central Quick Add bubble and More for secondary destinations.
- Today keeps the queue beside one review pane on wide screens; very wide screens add contact context beside the composer. Smaller screens use the review sheet. Opening another review or resizing retains the editor and its draft. Browser handoff to texting/email is not proof of delivery; retain the existing review, outcome and undo flow.
- Contacts use compact rows with readable names, notes and next steps. Put secondary details on the contact page. Keep selection, search, import, archive and restore reachable.
- Mixes use a desktop library rail and selected plan/editor. Smaller screens use the existing compact list and management sheets. A Mix is a reusable follow-up plan; preserve manual, date-based, appointment and broadcast behavior.
- Journey uses stage circles sized by actual contact counts. Ring portions classify the earliest pending follow-up as late, due within seven calendar days, or later/unscheduled. Arrows summarize recorded moves over the past 30 days. Smaller touchpoint nodes represent independent existing Mixes; all touchpoints remain reachable in the list. They do not introduce new automation.
- Selecting a stage exposes exclusive timing buckets and a roster. A dot represents one person on the current page; labels show full filtered counts. The roster is ordered globally by next follow-up, then name/id, with unscheduled people last, at 50 people per page. Dates use the viewer's saved timezone and calendar-day boundaries, including daylight-saving changes. Avoid decorative dots, fabricated movements or sample business data.
- Calendar presents a dated agenda alongside the event editor on desktop, stacked on smaller screens. Follow-ups link to Today for review. Meetings and time blocks retain their existing scheduling, conflict, import and connection behavior.
- Homepage uses open full-width bands, strong headings, the conversational demo, a simple three-step rhythm and a contrasting waitlist section. Preserve verified access and product claims. No invented testimonials, pricing or automatic-send promises.
- Apply the same foundation to account, settings, onboarding, authentication, support, staff and empty/error states. Mockups without matching product behavior require a product decision, not a misleading control.
- For pages without a mockup, choose a shared structure: workspaces and data lists use the 1440px maximum; account/help/conversation pages use `page--content` (1120px); focused contact, business and preference forms use `page--form` (1040px). Settings and More use the same flat destination rows within 960px. These are maximum widths; every layout contracts to the available space. Keep headers, actions, semantic colors, controls and navigation consistent across these structures.
- Size columns against their own bounded workspace. Today reserves a 324–380px queue and a 32px gap, then gives the remaining space to review. Never simulate a column with percentage padding against an uncapped parent. Long prose and forms should remain readable instead of stretching across an entire ultrawide monitor.

## Verification for future changes

Check light and dark themes, explicit overrides and system mode. Exercise narrow phones (320/390), portrait tablets (834), landscape/laptop sizes (1194/1440), wide desktop (1920), and ultrawide/4K (2560/3440/3840) when changing layout. Include widths immediately around navigation and column breakpoints (900/901, 1099/1100, 1199/1200). Check keyboard focus, readable contrast, usable touch targets, long names, empty states, dense real-data fixtures and horizontal overflow. Measure minimum usable column widths and check for overlapping content; an overflow-only scan missed the original ultrawide queue collapse. Inspect screenshots as well as automated results. Run the relevant workflow checks, typecheck and build before claiming completion.

## Product decisions still open

1. Whether appearance should synchronize across devices with an account. Current implementation is browser-local, matching the export's data-theme mechanism.
2. Whether touchpoints eventually become a distinct feature. Current implementation uses independent Mixes and existing assignments/pending follow-ups, including group assignments.
3. The mockup's “after 60 quiet days” needs an inactivity rule and a definition of what resets that clock (completed follow-up or any recorded interaction). No inactivity automation has been inferred or enabled.

These are implementation assumptions pending the owner's answers, not measured customer outcomes or promises of future features.
