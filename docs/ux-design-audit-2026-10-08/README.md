# Evidence — UX, design and layout audit 2026-10-08

Evidence folder for [`docs/UX_DESIGN_AUDIT_2026-10-08.md`](../UX_DESIGN_AUDIT_2026-10-08.md) (WF-07, JITM-15 §2 naming). Audited commit: `origin/main` `f23db11` (production `dae3fab` plus release-record docs only).

## Contents

| Path | What it is |
|---|---|
| [`FINDINGS.md`](FINDINGS.md) | All 247 lane-level findings (ID, rule, finding, evidence, label, severity, fix direction), with the severity changes made at consolidation |
| [`COPY.md`](COPY.md) | About 240 copy findings: exact string, location, rule, proposed wording |
| [`lanes/`](lanes/) | The eight review-lane reports: TDY (Today, review, Quick Add), CON (Contacts), MIX (Mixes, Mega-Mixes, Marketplace, Invite people), JRC (Journey and Calendar), SHL (navigation, Settings, Account, Help), PUB (public pages, sign-in, onboarding, customer-facing pages), STF (staff console), DSN (design-system consistency and the drift re-run) |
| [`captures/`](captures/) | 49 selected captures, listed below |

## How the evidence was produced

- **Build and data.** A local production build of `f23db11` (`next build`, then `next start`) and the background worker, against a fresh loopback database `jitm_design_uxa1008`.
  - Flags: automatic customer email off, billing off, demo mode off, administrator MFA on.
  - Outbound mail was intercepted on the machine, so nothing was sent.
  - All data is synthetic: fictional names, `example.com` / `example.test` addresses, 555-01xx numbers. It was built through the product's own flows: the Contractor Mega-Mix install, a CSV import of 36 contacts, bulk Add to a Mix, Calendar events, tags, a hosted lead form, a private review check-in, and a personal invitation followed through registration, email verification and onboarding.
- **Captures.**
  - Every route was captured with Playwright and Chromium at 390×844 (phone, light and dark), 320×700, 834×1194 (tablet), 1194×834 (landscape tablet, key routes), 1440×900 (light and dark) and 1920×1080.
  - Breakpoint pairs: 767/768, 900/901, 1199/1200, 1279/1280, 1600 and 1700.
  - 60+ overlay and interaction states, 200% text on 12 key routes, and a keyboard Tab-order pass.
  - Each page was measured for sideways scrolling, text under 13px and controls under 44px. The measurements are summarized in the main report.
- **Reference.** The 49 design-export screens were rendered to images for side-by-side comparison.
- **Review.** Eight read-only lanes reviewed the captures against the code at `f23db11` and the standards. The lead auditor consolidated them and re-verified the BLOCKER, six HIGH findings and one MEDIUM at runtime.
- **Private capture set.** The full set is about 800 images, crops, accessibility snapshots, metrics JSON and the capture scripts. It stays private and local (JITM-12 §2.19), under the git-ignored `.artifacts/ux-design-audit-20261008/` in the primary checkout. Paths written as `<captures>/…` in the lane reports refer to it.
- **Sanitizing.**
  - Every committed screenshot was checked for tokens, sensitive URLs and account details.
  - The administrator MFA enrollment screens were never captured.
  - Captures that show invitation or review links with tokens are excluded.

## Evidence classes (JITM-12 §2.6)

Local production build and emulated devices only. No physical device, assistive technology, production system or customer data was used.

## Screenshots

| File | Shows | Findings |
|---|---|---|
| `01-today-phone.png` | Today on a 390px phone: invitation strip above Overdue; 117px rows; clipped "Review" on the first card; "Estimate follow-up Referral follow-up" | LEN-06, ACC-06, NAV-01, NAV-04 |
| `02-review-phone.png` | The phone review sheet: everything on one screen (keep) | — |
| `03-done-undo-phone.png` | Outcome card: "Follow-up completed … Next scheduled … Undo" (keep) | TRU-06 |
| `04-today-desktop-1920.png` | Today at 1920: docked review, thin context column, empty right gutter | NAV-05, OVL-06 |
| `05-export-desktop-today.png` | Design export DesktopToday for comparison (last note and history in context) | NAV-05 |
| `06-today-filter-phone.png` | Filter Today: raw "sms … whatsapp"; layout modes inside Filter | FMT-03, DIS-09 |
| `07-quickadd-review-phone.png` | Quick Add "Saving as": "Follow up 2026-10-09 14:00" | FMT-01 |
| `08-quickadd-open-phone.png` | Quick Add opens as a half-height sheet on a phone | OVL-02 |
| `09-review-stars.png` | Private review page after tapping the rightmost star: all five lit, "Selected 1 out of 5" | TRU-01 (BLOCKER) |
| `10-mix-save-dialog.png` | Saving a wording edit in a running Mix with 12 people: "Start this Mix? 0 people … No one is enrolled yet" | TRU-02 |
| `11-mix-editor-laptop.png` | Mix editor: the Beat channel select shows only a chevron beside "Day 0" | EDT-01 |
| `12-marketplace-listing-phone.png` | Marketplace listing on a phone: no add action in the Beats pane | DIS-03 |
| `13-megamix-setup-laptop.png` | Ready-made Mega-Mix at 1440: "Make it yours" form in a 300px column with clipped values | EDT-04 |
| `14-contact-tools-sheet.png` | Contact tools: navigation, "Select contacts" and a tag manager in one sheet | DIS-02, OVL-09 |
| `15-bulk-bar.png` | Selection mode: bulk bar ("Message" primary), native-looking "Done" | DIS-02, OVL-04 |
| `16-awaiting-preparation.png` | A person not in the bulk add shows "Awaiting follow-up preparation" with a No Mix chip | TRU-04 |
| `17-import-review.png` | Import review: sticky "Queue 36 valid rows" above the Mix choice | DIS-11, FMT-05 |
| `18-import-results.png` | Import results: browser-default progress bar, unstyled recent-imports row | OVL-04 |
| `19-contact-profile-phone-full.png` | Contact profile on a phone (full page): repeated Beats, History far down | LEN-03 |
| `20-stage-sheet-phone.png` | Stage sheet "Journey stage for …" holding the only "Schedule a meeting" | FMT-04, DIS-05 |
| `21-journey-phone.png` | Journey on a phone: header and tiles before a 15% map | VIS-01, LEN-08 |
| `22-journey-laptop-selected.png` | Journey at 1440 with a Mix selected: details off-screen, 21% map | VIS-01, DIS-08 |
| `23-journey-start-flow.png` | Start flow at 1440: person picker and "Start this Mix" about 1,900–2,300px down | DIS-04 |
| `24-calendar-laptop-full.png` | Calendar at 1440 (full page, half scale): follow-up rows bury the appointments | LEN-04 |
| `25-calendar-phone.png` | Calendar on a phone: 12px agenda text | VIS-02 |
| `26-settings-phone-full.png` | Settings hub on a phone (full page): ungrouped | LEN-07 |
| `27-preferences-phone-full.png` | Personal preferences on a phone (full page, 4,433px) | LEN-02 |
| `28-held-inquiry.png` | Lead connections: a held inquiry under "Needs a person's eye · 1" (the only place it shows) | DIS-01 |
| `29-text200-today-320.png` | Today at 320px with 200% text: "Tod/ay", split tab labels, overlapping badge | ACC-04 |
| `30-text200-review-320.png` | Review sheet at 320px with 200% text: close "×" out of its circle | ACC-04 |
| `31-onboarding-phone-full.png` | Onboarding on a phone (full page, half scale; 4,435px) | LEN-01, VOI-03 |
| `32-first-today-phone.png` | First Today after onboarding | NAV-01 |
| `33-landing-contractors-phone-full.png` | `/for/contractors` on a phone (full page, half scale) | VOI-05 |
| `34-lead-form.png` | Hosted lead form ("we"; consent checkbox alone on its line) | VOI-01, ACC-05 |
| `35-profile-sheet.png` | Desktop Profile sheet (the only desktop Sign out) | SHL-13 |
| `36-staff-overview.png` | Staff Overview at 1440 | DIS-10, STF-09 |
| `37-staff-phone.png` | Staff Overview on a phone | ACC-07 |
| `38-more-phone.png`, `38b-export-more.png` | More on a phone vs the design export | SHL-09 |
| `39-today-phone-dark.png` | Today on a phone in dark mode | — |
| `40-today-tablet.png` | Today at 834px: tablet header plus three invitation prompts | NAV-01 |
| `41-calendar-after-save.png` | Two notices after saving an event ("Calendar updated.") | TRU-07 |
| `42-megamix-review-step.png` | Mega-Mix review step: "Unsaved changes" with no edits; "America/New_Y ork"; 24-hour times | TRU-11, FMT-01, FMT-02 |
| `43-review-email-loading-flash.png` | The route loading page shown after choosing Email in the review | OVL-03 |
| `44-contacts-no-mix-filter.png` | Contacts filtered to No Mix: a list with no bulk action | DIS-02 |
| `45-stages-settings-phone-full.png` | Contact stages with all sections open ("Retire empty stage…" on a stage with 36 people) | TRU-12 |
| `46-contact-new-phone.png` | Add a contact on a phone: sticky two-row save bar | ACC-03 |
| `47-contact-no-method-phone.png` | A person in a Mix with no phone or email | SAF-01 |
| `48-text200-contact-new-320.png` | Add a contact at 320px with 200% text | ACC-03 |
