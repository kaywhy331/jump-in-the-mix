# UX, design and layout audit — 2026-10-08

**Status:** read-only audit (WF-07, skill `jitm-audit`). **Audited commit:** `origin/main` `f23db11` (production `dae3fab` plus release-record docs; `src/`, `prisma/` and `package.json` are identical to production). **Evidence:** [`ux-design-audit-2026-10-08/`](ux-design-audit-2026-10-08/README.md). **Full finding list:** [`FINDINGS.md`](ux-design-audit-2026-10-08/FINDINGS.md). **All copy fixes with proposed wording:** [`COPY.md`](ux-design-audit-2026-10-08/COPY.md).

Kevin asked for an audit of every page, slider, section, popup, drawer, minimize/maximize control and the copy, from a design and layout standpoint, to decide whether what is in place is optimal for the owner's workflow. Scores and severities follow JITM-17 §2.12–§2.14; evidence labels follow JITM-12 §2.1. Screenshot names such as `09-review-stars.png` refer to [`ux-design-audit-2026-10-08/captures/`](ux-design-audit-2026-10-08/captures/); all images hold synthetic data from a local build. Because JITM-01 §2.24 (D20) preserves the current structure unless a specific problem requires a change, every structural recommendation below names the problem it solves and whether it needs Kevin's decision.

---

## 1. Summary and verdict

**Verdict: not yet optimal.** The core moment of the product is close to optimal. On a phone the review sheet fits one screen: the person, the Mix and its dates, the editable message, Text/Email/Call, "Open text" with Copy, and Mark sent / Snooze / Skip Beat (`02-review-phone.png`). Opening an app is never treated as sending. Every outcome confirms what happened and when the next follow-up is due, with Undo (`03-done-undo-phone.png`). Public pages, sign-in, registration and the waitlist are short and honest.

The surrounding structure has accumulated friction in five ways:

1. **Things that are not true on screen.**
   - The customer review page records the opposite rating (TRU-01, BLOCKER).
   - Saving a wording edit in a running Mix asks "Start this Mix?" and says no one is enrolled (TRU-02).
   - Three public pages make a claim the product stopped honoring (TRU-03).
   - Unrelated contacts say "Awaiting follow-up preparation" (TRU-04).
2. **Key actions are hard to find.**
   - Bulk placement is hidden two levels deep (DIS-02).
   - Held lead inquiries never reach Today (DIS-01).
   - Booking a visit sits inside the stage sheet (DIS-05).
   - On a phone, a Marketplace item has no add button (DIS-03).
   - Starting someone on a Mix puts the form about 1,900px down (DIS-04).
3. **Pages that repeat themselves or run long.**
   - Onboarding is 4,435px on a phone (LEN-01).
   - Personal preferences is 4,433px and mixes business settings into it (LEN-02).
   - The contact profile shows the same Beats up to four times (LEN-03).
   - Calendar lists every follow-up as an appointment row (LEN-04).
   - Ready-made content has three catalogs (LEN-05).
4. **The two maps you can't read.**
   - Journey opens at 15–22% zoom with 8px names (VIS-01).
   - Calendar's agenda is set in 12px (VIS-02).
5. **Copy and formatting drift.**
   - Machine dates and 24-hour times, and raw "America/New_York".
   - Raw codes such as "sms" and "active".
   - Contact stages called "Journey".
   - Words like "background worker" and "queue".
   - "We" on pages the owner's customers see (FMT-01–FMT-05, VOI-01).

**BLOCKER needing action now (TRU-01).** On the private review page `/review/[token]`, the five stars are drawn right-to-left. A customer who taps the rightmost star, which most people read as five stars, records "1 out of 5", and the screen lights all five stars. Reproduced at runtime on the audited build (`09-review-stars.png`). It has been live since `793b091` (2026-09-04). Ratings stored since then may be inverted. See Q1.

**Counts.**
- **Lane-level findings: 247.** 1 BLOCKER, 11 HIGH, 109 MEDIUM, 126 LOW.
- **Consolidated:** 1 BLOCKER, 11 HIGH and 67 MEDIUM, after merging duplicates across lanes (§5).
- **133 page and overlay verdicts:** 3 Optimal, 94 "Good, fix details", 36 "Needs rework" (§2).
- **Re-verified at runtime by the lead auditor:** the BLOCKER, six HIGH findings and one MEDIUM (§10).

**What to keep (do not "fix" these).**
- The phone review sheet and its handoff wording.
- The outcome card with Undo.
- Unavailable channels that stay visible with a reason and an "Add …" link.
- Do not contact refused by name in bulk actions.
- The ten-second Undo on bulk Add to a Mix.
- Archive with confirmation.
- The rail and the phone tab bar order.
- The staff console's eight groups and its MFA-safe drafts.
- Sign-in, reset, registration and waitlist forms.

### Scorecard (JITM-17 §2.12)

A 0 means at least one MUST rule is broken somewhere in that dimension. It does not mean the whole dimension fails. The "breadth" column says how widespread the problem is.

| Dimension | Score | Why | Breadth |
|---|---|---|---|
| JITM-00 Constitution | 1 | Human review, no delivery claims, settled work and Undo all hold. The honesty principle (§2.4) is breached by false states (TRU-01–TRU-03) and the accessibility floor (§2.8) by sub-floor screens | Narrow |
| JITM-01 Concept and goals | 1 | Core loop works. Daily work leaks out of Today (visit outcomes, held inquiries; JITM-01 §2.11). The first-run path grew to 4,435px (§2.12) | Medium |
| JITM-02 ICP and positioning | 1 | Personal-tool framing remains in the invitation, empty states, onboarding and catalog defaults for a trades account (VOI-02, VOI-04) | Medium |
| JITM-03 Brand | 2 | Consistent; empty-state bubbles get the owner-side tail (DSN-26) | Narrow |
| JITM-04 Voice and copy | 0 | §2.6 implementation words, §2.7 confirmations that are not true, §2.28 a false public claim, §2.5 "we" defaults | Wide |
| JITM-05 Vocabulary | 0 | §2.11 internal names reach owners ("sms", "occurrence", "instances"). "Start" means two things. Stages are called Journey | Wide |
| JITM-06 Design system | 0 | §2.7 nine new color literals; §2.21 "+" glyphs; six selection looks; native controls left unstyled. Most other items are known §6 deviations | Medium |
| JITM-07 Layout | 1 | Archetypes hold and there's no sideways scroll at 320/834/1440. Context below the center at 1200–1699 hides Journey and Calendar details. The bulk bar covers content on desktop | Medium |
| JITM-08 Interaction | 0 | §2.26 sticky save bars cover fields on phone contact forms. Confirmations lack day and time. Search and filter entry differs on every list | Medium |
| JITM-09 IA and workflows | 0 | §2.7 stages labeled Journey; §2.39 the activation review runs on every save; held inquiries and visit outcomes are absent from Today | Medium |
| JITM-10 Accessibility | 0 | §2.2 12px text on Calendar, the desktop rail, Journey and staff; §2.1 phone targets under 44px; §2.3 200% text breaks words and overlaps the More badge | Medium |
| JITM-11–JITM-17 | n/a | Not in scope. JITM-11 §2.15 (dates in the account's locale) is cited by FMT-01 | — |

### The changes that would improve the workflow most (ranked)

| # | Change | Problem it solves | Effort | Kevin decision? |
|---|---|---|---|---|
| 1 | **Fix the review rating order** and check stored ratings since 2026-09-04 | TRU-01: customer feedback recorded backwards | S | Release timing (Q1) |
| 2 | **Truth pass:** save without "Start" for running Mixes; per-person preparation status; demo claim; review-request "— —"; snooze times; specific confirmations; "Unsaved changes" only after edits | TRU-02–TRU-12 | S each | Wording only |
| 3 | **One display formatter** for dates, times, zones, statuses and channel names; "Stage" instead of "Journey" for stages; no implementation words | FMT-01–FMT-05 | M | Time format (Q11) |
| 4 | **Today that keeps momentum:** after an outcome, open the next follow-up with Undo still on screen; compact rows you can tap anywhere; live counts; fix the clipped "Review"; plain filter; group one person's same-day follow-ups | LEN-06, TRU-05, TRU-06, NAV-04, ACC-06 | M | Q2, Q3 |
| 5 | **Fewer, later invitation prompts:** one compact prompt you can dismiss, shown after the first recorded outcome | NAV-01 | S | Q4 (changes JITM-09 §2.9, §2.24) |
| 6 | **Onboarding in about two phone screens:** the person first, a preview filled with real dates, Mega-Mix as a secondary link; the first Today has one primary action | LEN-01, VOI-03 | M | Q5 |
| 7 | **Contacts:** a visible "Select" control and a No Mix strip with "Add to a Mix"; Mix as the primary bulk action; warnings before starting people with no phone or email, and before tag changes that start or stop Mixes; one compact Mixes section on the profile plus a profile ••• menu (Ask for a review, Schedule a meeting, Archive); notes and the next appointment visible | DIS-02, LEN-03, DIS-05, DIS-06, SAF-01, SAF-02 | M | Q8, Q9 |
| 8 | **Calendar that shows appointments:** appointments first; follow-ups as one summary row per day linking to Today; 13px text; one "With" person search (no 200-name cap); visit outcomes on the card plus a Today prompt | LEN-04, VIS-02, DIS-12, DIS-07 | M | Q6, Q10 |
| 9 | **Journey you can read:** open at 100% on desktop and in the List view on phones; Start for someone as a focused sheet; selection summary docked in view; the view kept in the address | VIS-01, DIS-04, DIS-08 | M | Q7 |
| 10 | **Mixes:** show the channel and use inline Text / Email / Call tabs on each Beat; ship B-19 (Marketplace as the one catalog with "Add to my Mixes" in every preview); per-person ready-made Mixes need no audience to turn on; tell duplicate names apart; fix the Mega-Mix setup layout | EDT-01–EDT-07, LEN-05, DIS-03 | M–L | Q12 (B-19 is already decided) |
| 11 | **Settings and account:** a grouped Settings hub; working hours and scheduling moved out of Personal preferences; one desktop account control with Sign out and Plan and billing; held inquiries on Today | LEN-02, LEN-07, NAV-02, DIS-01 | M | Q10, Q13 |
| 12 | **Accessibility floor pass with a guard:** 13px and 44px on Calendar, Journey, profile, rail and the staff phone views; 200% text; checkbox cards; sticky bars | ACC-01–ACC-07 | M | Q14 |
| 13 | **Staff console:** an Overview "This week" queue, one name per page, a phone shell that meets the floors | DIS-10, TRU-09, ACC-07, STF-04 | M | Q15 |

---

## 2. Page and overlay verdicts

Verdicts: **Optimal** · **Good, fix details** · **Needs rework**. Phone is weighed first. Each lane report has the full reasoning per page (`lanes/<LANE>.md` §2).

### Navigation frame

| Page or control | Verdict | Why | Top fix |
|---|---|---|---|
| Phone tab bar and Quick Add bubble | Good, fix details | Right destinations and order. Labels break mid-word at 200% text; the More badge counts an allowance, not work | ACC-04, NAV-01 |
| Tablet header (768–900px) | Needs rework | Costs 64px and duplicates More and the invitations; its initial avatar is named "More" | SHL-24, JITM-07 §6 |
| Compact rail (901–1279px) | Good, fix details | No appearance switch; "Profil/e" breaks; the same icon for My account and Profile | SHL-14 |
| Full rail (1280+) | Good, fix details | Clear. 12px invitation hint and "Signed in as" on every page | ACC-01 |
| Profile sheet (desktop) | Needs rework | The only desktop Sign out; five of six rows repeat the rail; no profile information | SHL-13 |
| More (phone) | Good, fix details | Matches the export in light; in dark the rows sit on a raised slab; at 768–900px it loses bands and shows desktop-only rows | SHL-09, SHL-27 |
| Invitation prompts (six placements) | Needs rework (Kevin) | Up to three at once. The strip above overdue work is the only filled button in the page content, and it shows on a brand-new owner's first Today | NAV-01 |

### Today and Quick Add

| Page or control | Verdict | Why | Top fix |
|---|---|---|---|
| Today queue (phone) | Needs rework | About 3.5 follow-ups on the first screen (rows 117px against the export's 96px). The first card's "Review" is clipped. The Mix name and the reason run together. Nothing moves you to the next item | LEN-06, ACC-06 |
| Today (tablet, desktop) | Good, fix details | The docked review works. Two rows look selected; the context column lacks the export's last note and history | OVL-07, NAV-05 |
| Review sheet (phone) | Good, fix details | Fits one screen and is honest. The message box ignores length; changing the channel flashes a loading page | OVL-06, OVL-03 |
| Handoff, return tray, outcome, Undo | Good, fix details | Correct and honest. Counts freeze while Undo shows | TRU-06 |
| Row menu (•••) and Stop Mix | Good, fix details | Clear groups. Snooze presets show no times | TRU-05 |
| Filter sheet and layout modes | Needs rework | Raw codes ("sms", "whatsapp"); it filters on a channel the card no longer shows; layout modes are hidden here and "Compact scan" does nothing visible on a phone | FMT-03, DIS-09 |
| Search | Good, fix details | Needs a button press and a reload; placeholder clipped | TDY-21 |
| First Today after onboarding | Good, fix details | Invitation strip, More badge and an unrequested "Filter 1" compete with the first follow-up | NAV-01, PUB-07 |
| Quick Add | Good, fix details | Fast capture and a clear "Saving as" review. Not full screen on phones; the summary shows "2026-10-09 14:00" and hides the method | OVL-02, FMT-01 |

### Contacts

| Page or control | Verdict | Why | Top fix |
|---|---|---|---|
| Directory | Good, fix details | Follows the export; live search; No Mix on every row. Filter sheet shows a stray "0" and clips at 1440 | CON-19 |
| Contact tools sheet (•••) | Needs rework | Mixes navigation, selection mode and a whole tag manager | OVL-09, DIS-02 |
| Selection mode and bulk bar | Needs rework | Hard to find. "Message" is the primary action. The desktop bar covers the profile | DIS-02, CON-23 |
| Bulk Mix sheet | Good, fix details | Clear, with Undo. No warning for people with no phone or email; picks the alphabetically first Mix | SAF-01, EDT-03 |
| Bulk Tags sheet | Needs rework (safety) | A tag change can start or stop Mixes silently, with no Undo | SAF-02 |
| Profile header, actions, Next card | Good, fix details | Right and export-faithful. Can say "Awaiting follow-up preparation" falsely | TRU-04 |
| Profile below the Next card | Needs rework | Connected Mixes repeats the Beats. Four ways to start and four ways to end a Mix. Notes, Ask for a review, booking and Dates are collapsed or buried. The stage section is called "Journey" | LEN-03, DIS-05, DIS-06, FMT-04 |
| Add and edit contact | Good, fix details | On phones a sticky two-row save bar covers fields; "First follow-up" sits below it | ACC-03 |
| Import wizard | Good, fix details | Solid matching. The Mix choice is below the commit button; "Queue N valid rows" and "background worker"; browser-default progress bar; no next step | DIS-11, FMT-05, OVL-04 |
| Archived, Duplicates, Custom fields, Add from your phone | Good, fix details | Minor label, back-link and icon issues | CON-27 |

### Mixes, Mega-Mixes, Marketplace and invitations

| Page or control | Verdict | Why | Top fix |
|---|---|---|---|
| My Mixes list | Needs rework (phone) · Good (desktop) | On phones, chrome before the first Mix. Rows lack people counts and timing; duplicate names look identical | LEN-08, EDT-03, EDT-07 |
| Mix detail (Preview) | Good, fix details | "Start" enrolls a person here but turns the Mix on elsewhere | EDT-05 |
| Mix editor | Needs rework | Channel invisible; versions two disclosures deep; Save runs "Start this Mix?" with false counts | EDT-01, TRU-02 |
| Create a Mix | Good, fix details | Defaults to "When I add a date" and "Anniversary"; no back link on phones | MIX-22 |
| Mix tools sheet | Needs rework | Retire its current contents | MIX lane §2.5 |
| Filter, glossary and Share sheets | Good, fix details | Glossary lacks Marketplace and ready-made; "Any business" listed twice | MIX-30, MIX-25 |
| Own Mega-Mixes | Good, fix details | Read-only outline; a Mix can't be opened from its Mega-Mix | EDT-07 |
| Ready-made Mixes library (`/templates`) | Needs rework | A second catalog with its own layout (B-19) | LEN-05 |
| Use a ready-made Mix | Needs rework | Per-person Mixes can't be turned on without enrolling an audience | EDT-02 |
| Ready-made Mega-Mixes (`/templates/journeys`) | Needs rework | A 4,600px preview; the setup form in a 300px column clips its values; "Unsaved changes" after only reviewing | EDT-04, TRU-11 |
| Marketplace | Needs rework | On phones, no add action in the preview; on desktop only a text link; bounces to `/templates` | DIS-03, LEN-05 |
| Invite people | Good, fix details | Clear steps. Greets an email-only invitee by address | VOI-02 |

### Journey and Calendar

| Page or control | Verdict | Why | Top fix |
|---|---|---|---|
| Journey on phones | Needs rework | About 430px of header before the map; the map is unreadable at 15%; the list is behind Options | VIS-01, LEN-08 |
| Journey map (default zoom, all widths) | Needs rework | 8px names; no labels, points or results under 70% zoom; Setup, Progress and Results look the same | VIS-01 |
| Stat tiles and Mega-Mix switcher | Good, fix details | Red "0 Needs attention"; select 42px tall | JRC-05, JRC-14 |
| People roster | Good, fix details | "+1" unexplained; details only in a tooltip (known B-05) | JRC-04 |
| Selecting a Mix (1200–1699px, phones) | Needs rework | Its details land 1,000–1,600px below the map | DIS-08 |
| Start flow | Needs rework | Person picker about 1,900px down; capped at 50 names | DIS-04, DIS-12 |
| Journey at 1700+ | Good, fix details | Panes work; only the default zoom is a problem | VIS-01 |
| Calendar agenda | Needs rework | 22 follow-up rows on one day bury the appointments; 12px text | LEN-04, VIS-02 |
| Week strip, Find a date | Good, fix details | No marker for today or for event days | LEN-04 |
| Event card | Good, fix details | Visit outcomes hidden inside; actions stacked | DIS-07 |
| Event editor and WhenPicker | Good, fix details | Mix before person; three person controls; 200-name cap; raw zone | DIS-12, FMT-02 |
| After-save notices | Good, fix details | Two notices that name neither the event nor the time | TRU-07 |
| Contact context column | Needs rework (1100–1699, phones) | About 4,000px below the editor | DIS-08 |

### Settings, account and help

| Page | Verdict | Why | Top fix |
|---|---|---|---|
| Settings hub | Needs rework | Ungrouped, 1,510px on a phone; shrinking chevrons; overlaps More and My account | LEN-07 |
| My business | Good, fix details | Service rows have unlabeled fields; "Name" is never used | NAV-03 |
| Lead connections | Needs rework | H1 doesn't match the menu; creating a form ends on an empty form; held inquiries live only here | DIS-01, TRU-07 |
| Contact stages | Good, fix details | "Retire empty stage…" offered on a stage with 36 people | TRU-12 |
| Date types, New contacts, Notifications | Good, fix details | Squeezed checkboxes; "+" glyph headings | ACC-05 |
| Sending to customers | Needs rework (beta) | A full disabled form; "off during the beta" said three times | SHL-16 |
| My account, Plan and billing | Good, fix details | Billing has one way in; capital labels | SHL-12, SHL-19 |
| Personal preferences | Needs rework | 4,433px, five Saves, business-wide settings, two timezone pickers | LEN-02 |
| Help, support conversations | Good, fix details | "Getting started" leaves the app; no top back link | SHL-21, SHL-22 |

### Public pages, sign-in, onboarding and the owner's customers

| Page | Verdict | Why | Top fix |
|---|---|---|---|
| Public header, hero, directory, footer | Good, fix details | Honest and export-faithful | PUB lane |
| How it works, own-voice section | **Optimal** (apart from the known link style) | — | — |
| Interactive demo | Good, fix details | On phones the draft is about 1,466px down, behind a 55-word note; waitlist offered only after all three Beats; 12px labels | VOI-05 |
| FAQ, Pricing, documents | Good, fix details | FAQ ends with no action | PUB-23 |
| Feature and template pages | Good layout, copy fix | Claim false since D31 | TRU-03 |
| Waitlist pages; forgot and reset password | **Optimal** | One field, one action | — |
| Sign in | Good, fix details | Two email fields and two filled buttons on phones | PUB-25 |
| Registration from an invitation | Good, fix details | Lean | — |
| Verify-email pending | Needs rework (small) | Its only filled button sends a new link, which cancels the first | SAF-05 |
| Onboarding | Needs rework | 4,435px; required inputs at the bottom; 9 reasons give 4 starters; raw tokens; 24-hour times | LEN-01, VOI-03 |
| The invitation recipients receive | Needs rework (copy) | Greets by email address; "people in my circle" | VOI-02 |
| Hosted lead form | Good, fix details | Consent checkbox sits alone on its line; "we" | ACC-05, VOI-01 |
| Private review page | Needs rework | Reversed stars (BLOCKER); "we" | TRU-01, VOI-01 |

### Staff console

| Page | Verdict | Why | Top fix |
|---|---|---|---|
| Overview | Needs rework (content) | Never shows community reports; meta-heavy; "Next wave" shown while blocked | DIS-10, STF-09 |
| All other staff pages (22) | Good, fix details | One name per page needed; empty queues blame filters that aren't set; phone shell below the floors | STF-04, STF-03, ACC-07 |

---

## 3. Popups, drawers, toggles and collapsible sections

This section answers Kevin's list directly. Details are in `lanes/DSN.md` §2.

- **Popups and drawers (sheets, dialogs).** The shell is consistent: native dialogs, one heading, a 44px close, the shared scrim, bottom sheets on phones with a grabber, and Cancel-first confirmations.
  - Where it drifts: Quick Add is not full screen on phones and has no grabber (OVL-02). The WhenPicker has two closes. Phone confirmations are centered. The Today row menu mixes chips and buttons (OVL-08).
  - Problems of content rather than shell: Contact tools is a kitchen-sink sheet (OVL-09). The desktop Profile sheet holds the only Sign out (SHL-13).
  - **Verdict: Good, fix details.**
- **Sliders, toggles and segmented controls.**
  - The appearance switch is fine, apart from a 2px focus ring instead of 3px (lead observation O53).
  - The channel segmented control in the review is right.
  - Elsewhere there are six different "selected" looks for the same job. Today's layout switch has no visible selected state. Saved views use a primary fill that reads as an action (OVL-01).
  - There are 19 native date and time inputs against 4 uses of the WhenPicker, so dates read "10/08/2026" in one place and "Tomorrow, Oct 9" in another (DSN-24).
  - **Verdict: one segmented-control and chip family is needed.**
- **Minimize/maximize (disclosures, collapsible groups, pane switchers, zoom).** The disclosure pattern itself is consistent (chevron, 44px). What is collapsed by default is often wrong for the workflow:
  - Needed things collapsed: visit outcomes; Notes to remember; the profile's Mixes, Dates and Ask for a review; the waitlist's next-wave time in the staff console (DIS-07, LEN-03, STF-17).
  - Empty things expandable: "Done 0" (TDY-20).
  - Journey's "Fit map" is the default, so its zoom controls start at an unreadable 15–22% (VIS-01).
  - Phone pane switchers (Mixes/Beats/Details, People/Map/Details) hide primary actions in non-default panes (DIS-03, JRC-15).
  - Chevrons sit in three different positions (DSN-15).
  - **Verdict: keep the pattern; re-decide what starts collapsed.**
- **Sections and layout.** No owner page scrolls sideways at 320, 834 or 1440px, or at 200% text on 12 key routes. The density problems are listed in §5 (LEN-*).

---

## 4. Copy

The interface voice is mostly plain and honest, and the handoff copy ("Open your app to send, then record what happened.") is exemplary. The problems cluster by theme:

| Theme | Examples (exact) | Rule | IDs |
|---|---|---|---|
| Not true | "Start this Mix?" / "No one is enrolled yet" (12 people in the Mix); "The demo doesn't send anything or open another app."; "Awaiting follow-up preparation" on unrelated people; "Next wave: Oct 15" while blocked | JITM-04 §2.7, §2.28 | TRU-02, TRU-03, TRU-04, STF-09 |
| Machine formats | "2026-10-09 14:00"; "09:00–17:00"; "Prefer 10:00"; "America/New_Y ork"; "1 sessions"; "1 setup issues" | JITM-11 §2.15; JITM-05 §2.15 | FMT-01, FMT-02, STF-14, JRC-10 |
| Raw codes and lowercase status | "sms", "whatsapp", "active", "completed", "none", "phone call" | JITM-05 §2.11; JITM-04 §2.4 | FMT-03 |
| Implementation words | "background worker", "Queue 36 valid rows", "Search review queue", "instances", "cohort", "traversals", "Saved configuration 1", "while the worker runs", "occurrence" | JITM-04 §2.6; JITM-05 §2.11 | FMT-05 |
| Stage called Journey | "Journey" section on the profile, "Change journey stage: Inquiry", "Journey stage updated.", "Your journey rules may start follow-ups" | JITM-09 §2.7 | FMT-04 |
| Voice | "How did we do?", "so we can respond", "— — Alex at Northline Home Services", "Hi riley.newowner@example.test,", "people in my circle", "Make time for your circle" | JITM-04 §2.5, §2.21; JITM-02 | VOI-01, VOI-02, VOI-04 |
| Vague confirmations | "Calendar updated.", "Follow-up snoozed.", "Tag added.", "Your recorded updates are being prepared." | JITM-04 §2.7 | TRU-05, TRU-07 |
| One meaning, two words | "Call" and "Phone call"; "Start" for turning a Mix on and for enrolling a person; seven phrasings for "follow-ups are being prepared" | JITM-05 §2.1 | FMT-03, EDT-05, TRU-04 |

All exact strings, locations and proposed replacements are in [`COPY.md`](ux-design-audit-2026-10-08/COPY.md) (about 240 entries). Public copy changes go through WF-03 with Kevin's approval (JITM-04 §2.31).

---

## 5. Findings by dimension

Consolidated findings merge duplicates across lanes. "Lanes" lists the lane-level IDs in `FINDINGS.md`, which also holds all 126 LOW findings. Labels:
- **VR** = VERIFIED-RUNTIME;
- **VC** = VERIFIED-CODE;
- **INF** = INFERRED;
- "(lead)" = re-verified by the lead auditor.

### 5.1 BLOCKER and HIGH

| ID | Rule | Finding | Evidence | Label | Severity | Fix direction | Lanes |
|---|---|---|---|---|---|---|---|
| TRU-01 | JITM-00 §2.4; JITM-17 §2.14 (data corrupted) | Review page stars run 5…1 from left to right. Tapping the rightmost star selects "1 out of 5" and lights all five stars | `09-review-stars.png`; `src/components/ReviewFeedbackForm.tsx:43`; `src/styles/product.css:104,108` | VR (lead), VC | **BLOCKER** | Draw 1→5 left to right and fill from the left; add a test of the visual order; review stored ratings since 2026-09-04 | PUB-01 |
| TRU-02 | JITM-09 §2.39; JITM-04 §2.7 | Saving a wording edit in a running Mix shows "Review and start", then "Start this Mix?" with "0 people… No one is enrolled yet". For date-based Mixes started per person, the save is blocked unless Everyone or a tag is ticked | `10-mix-save-dialog.png`; `src/lib/mix-editor-actions.ts:146-148`; `src/components/MixEditor.tsx:191` | VR (lead), VC | HIGH | "Save changes" for running Mixes; review only when someone will start; true counts | MIX-01 |
| TRU-03 | JITM-04 §2.28; JITM-09 §2.67 | Three public pages say the demo doesn't send anything or open another app (false since D31) | `src/app/features/follow-up-reminders/page.tsx:46`; `src/app/follow-up-templates/page.tsx:48`; `src/app/follow-up-templates/estimate-follow-up/page.tsx:48` | VC (lead grep) | HIGH | Replace with the D31 wording through WF-03 | PUB-02 |
| DIS-01 | JITM-09 §2.25; gap | A lead inquiry that matches several contacts or an archived one is held, and only Settings → Lead connections shows it. Today, More, the Settings hub and Contacts show nothing | `28-held-inquiry.png`; `src/lib/intake.ts:84-87` | VR (lead), VC | HIGH | "{n} inquiries need a match" in Today's Needs your input; count on the Lead connections row | SHL-01 |
| DIS-02 | JITM-09 §2.77 | Bulk placement only through ••• → Contact tools → "Select contacts". The "No Mix" link and filter and Today's No Mix line land on lists with no action. The filled bulk action is "Message", not Mix | `14-contact-tools-sheet.png`, `15-bulk-bar.png`; `src/components/ContactsBulkWorkspace.tsx:181-184,272` | VR, VC | HIGH | Visible "Select"; a No Mix strip "Add these N to a Mix / Mark No Mix needed"; Mix as primary; labels on phones | CON-01, CON-22 |
| DIS-03 | JITM-09 §2.74, §2.46 | Phone and tablet Marketplace preview has no add action (it is only in the Details pane); on desktop it is a text link | `12-marketplace-listing-phone.png`; `src/app/(app)/marketplace/page.tsx:116-137` | VR (lead) | HIGH | One primary "Add to my Mixes" in every preview | MIX-03 |
| DIS-04 | JITM-10 §2.12; JITM-01 §2.11 | A Mix's "Start" (including the 13 Start buttons after adding a Mega-Mix) opens Journey's Setup map; the person picker is at y≈1,900 and "Start this Mix" at y≈2,300, with no scroll or focus. "Connect next" is the filled primary | `23-journey-start-flow.png`; `src/components/WorkflowJourney.tsx:256-260` | VR (lead) | HIGH | A focused Start sheet with a person search and one primary action | JRC-03, MIX-16 |
| VIS-01 | JITM-10 §2.2, §2.1; JITM-07 §2.20; JITM-10 §2.16 | Journey opens fitted at 15% (390), 21% (1440) and 22% (1920): 8px truncated names; no line labels, results or connection points below 70%. Setup, Progress and Results look the same. The list view is behind Options | `21-journey-phone.png`, `22-journey-laptop-selected.png`; `src/components/WorkflowJourney.tsx:215,231` | VR (lead) | HIGH | Open at 100% scrolled to the first numbered Mix on desktop; List by default on phones; a readable overview | JRC-01, JRC-07, JRC-08, JRC-09 |
| VIS-02 | JITM-10 §2.2 | Calendar's main content is 12px: times, Mix names, weekday labels, "No invitation is sent" (125 elements under 13px on the phone page) | `25-calendar-phone.png`; metrics; `src/styles/design-workspaces.css:340,345-346` | VR, VC | HIGH | 13px minimum; extend the text-floor test to Calendar and Journey | JRC-22, DSN-07 |
| EDT-01 | JITM-08 §2.28; JITM-10 §2.3 | The Beat channel select shows only a 38px chevron (CSS class collision), so you can't see whether a Beat is a text, email or call | `11-mix-editor-laptop.png`; `src/styles/mix-library.css:57` | VR (lead), VC | HIGH | Visible channel label; Text / Email / Call tabs per Beat | MIX-02 |
| EDT-02 | JITM-09 §2.11, §2.36 | Ready-made setup for a Mix that starts per person can't be turned on without enrolling Everyone or a tag; "Day 0 is when you first turn on this draft" is wrong for these Mixes | `src/components/TemplateUseForm.tsx:89-90,97-100,110,115` | VC | HIGH | No audience step for per-person Mixes; correct the Day 0 sentence | MIX-04 |
| FMT-01 | JITM-11 §2.15 | Times the owner confirms are machine-formatted: Quick Add "2026-10-09 14:00"; Mega-Mix setup "09:00–17:00", "Prefer 10:00"; onboarding preview "10:00". Elsewhere "10:00 AM" | `07-quickadd-review-phone.png`; `src/components/QuickAdd.tsx:180`; `src/components/JourneyPreferenceFields.tsx:41-42` | VR | HIGH | One formatter: "Fri, Oct 9 at 2:00 PM", the account's 12/24-hour convention | DSN-01, TDY-17, MIX-08, PUB-16 |

### 5.2 MEDIUM, by dimension

**JITM-04 voice and copy: truth and confirmations**

| ID | Rule | Finding | Evidence | Label | Fix direction | Lanes |
|---|---|---|---|---|---|---|
| TRU-04 | JITM-04 §2.7; JITM-09 §2.76 | After a bulk start, unrelated profiles say "Next: Awaiting follow-up preparation" while their chip says No Mix: the check ignores bulk jobs' `contactIds`. The same background state has seven phrasings | `16-awaiting-preparation.png`; `src/lib/preparation.ts:11` vs `src/lib/contact-mix-status.ts:56-61` | VR, VC | Check per person; one phrasing | CON-03, DSN-22 |
| TRU-05 | JITM-04 §2.7 | Snooze chips show no times; "Later today" lands the next morning from about 4 PM; "Follow-up snoozed." names no time | `src/components/JumpActionControls.tsx` (snooze); TDY lane | VC, VR | Times on the chips; confirmation with day and time | TDY-08 |
| TRU-06 | JITM-08 §2.4 | After Mark sent, header counts, section counts and Done stay frozen until the 10-second Undo window ends, so a fast owner sees no progress | `src/lib/today-update-state.ts:5` | VR, VC | Update counts at once; Undo restores them | TDY-12 |
| TRU-07 | JITM-04 §2.7 | Confirmations that don't say what or when: "Calendar updated." on every Calendar action (plus a second notice); "Tag added."; "New project inquiry started for 12 people." (all already due); lead form creation reloads to an empty form at the top; Personal preferences confirmations off-screen | `41-calendar-after-save.png`; `src/lib/calendar-actions.ts:29-76`; `src/lib/intake-actions.ts:41` | VR, VC | One specific notice that names the item and the time, placed by the saved section | JRC-28, DSN-23, CON-25, SHL-03, SHL-06 |
| TRU-08 | JITM-04 §2.7 | The owner card says "Happy customers can continue to your public review page", but the page offers it after any rating | `src/components/ReviewRequestButton.tsx:48` vs `src/components/ReviewFeedbackForm.tsx:40` | VC | Align copy or behavior (Kevin) | PUB-11 |
| TRU-09 | JITM-09 §2.17 | The stored invitation wording says "one of my five personal invitations"; members see "three" only through a render-time replacement | `src/lib/system-mix.ts:26` | VR, VC | Kevin publishes v2 ("three"), then remove the replacement | STF-02 |
| TRU-10 | JITM-05 §2.11 | Links to stopped or cancelled follow-ups print stored codes ("mix stopped for contact") (open since beta UX-05) | TDY lane | VR, VC | Plain sentences | TDY-15 |
| TRU-11 | JITM-08 §2.30 | "Unsaved changes. Save before leaving this page." after only pressing "Review my setup" (no Save on the page) | `42-megamix-review-step.png` | VR | Mark dirty only on edits | MIX-07 |
| TRU-12 | JITM-08 §2.6 | "Retire empty stage…" is enabled on a stage with 36 people and refused after confirmation | `45-stages-settings-phone-full.png`; `src/app/(app)/settings/journey/page.tsx:29` | VR, VC | Disabled, with "Move the 36 people first" | SHL-08 |

**JITM-09 workflows: hidden or misplaced actions**

| ID | Rule | Finding | Evidence | Label | Fix direction | Lanes |
|---|---|---|---|---|---|---|
| DIS-05 | gap; JITM-09 §2.32 | Booking a visit: the profile's only "Schedule a meeting" is inside the stage sheet and disappears without Contact stages; the profile never shows the person's appointments; Today has no booking action | `20-stage-sheet-phone.png`; `src/components/ContactJourneyPanel.tsx:12,22` | VR, VC | "Book a visit" in the profile actions (and in Today's outcome step, Q10); show the next appointment | CON-09, JRC-27 |
| DIS-06 | JITM-01 §2.16 | "Ask for a review" sits in collapsed More → Preferences, beside Archive | `src/components/ContactProfile.tsx:264` | VR, VC | Profile ••• menu or Next-card action after a job | CON-10 |
| DIS-07 | JITM-01 §2.11 | Visit outcomes (which release after-visit follow-ups) can be recorded only inside each event's collapsed card; nothing on Today asks | `src/app/(app)/calendar/page.tsx:82` | VR, VC | Outcome buttons on the card once the visit starts, plus a Today item | JRC-29, DSN-09 |
| DIS-08 | JITM-09 §2.59; JITM-07 §2.13 | At 1200–1699px, a selected Mix's details sit 1,000–1,600px below the map, and Calendar's contact column about 4,000px below the editor. On phones, choosing a person opens the unreadable map | `22-journey-laptop-selected.png`; `src/styles/design-details.css:156-160` | VR | Dock a selection summary in view; contact context inside the editor | JRC-02, JRC-15, JRC-16, JRC-24 |
| DIS-09 | JITM-04 §2.1 | Today's layout modes are hidden in Filter; "Compact scan" changes nothing visible on phones; no selected state | `06-today-filter-phone.png` | VR | Drop or redesign the modes (Kevin) | TDY-06, DSN-04 |
| DIS-10 | JITM-09 §2.49 | The staff Overview never counts community reports; email alerts reach only owner-role staff | `36-staff-overview.png`; `src/app/(staff)/admin/page.tsx:22-67` | VR, VC | Reports row in a "This week" queue | STF-01 |
| DIS-11 | JITM-09 §2.78; JITM-08 §2.26 | Import: the sticky "Queue N valid rows" bar floats over content and comes before the "New people and Mixes" choice, which is below the fold | `17-import-review.png`; `src/styles/contact-import.css:17` | VR | The choice before the commit; the bar scrolls with the form | CON-06 |
| DIS-12 | JITM-08 §2.28, §2.30 | Person pickers are capped (Journey Start: first 50; Calendar: first 200 by name) and backed by separate searches that reload the page; the Calendar editor asks for the visit's Mix before the person, across three controls | `src/lib/mix-workflow-view.ts:40`; `src/app/(app)/calendar/page.tsx:49`; `src/components/CalendarEntryForm.tsx:89-103` | VC | One shared person search over all contacts; export field order | JRC-20, JRC-25, JRC-26 |

**JITM-07 layout: long and repetitive pages**

| ID | Rule | Finding | Evidence | Label | Fix direction | Lanes |
|---|---|---|---|---|---|---|
| LEN-01 | JITM-01 §2.12; JITM-09 §2.10 | Onboarding is 4,435px on a phone (2,768px at the 09-18 audit). The required person name sits at about 2,300px and the review tick at about 4,100px. 9 reasons give 4 starters. "Phone recommended · optional" invites a skip that breaks the first text | `31-onboarding-phone-full.png` | VR | Two-screen form, person first (Q5) | PUB-03, PUB-04, PUB-06 |
| LEN-02 | gap (JITM-09 §2.65) | Personal preferences: 4,433px on a phone, five Saves, business-wide settings (working hours, quiet times, check-ins), and two timezone pickers that overwrite each other | `27-preferences-phone-full.png`; `src/app/(app)/account/preferences/page.tsx:54,62` | VR, VC | Split: My account profile; Settings → Working hours and scheduling | SHL-05, SHL-06, SHL-07 |
| LEN-03 | JITM-01 §2.24 (problem named); JITM-08 §2.7 | Profile below the Next card repeats the Beats up to four times (History starts at about 1,230px on phones; the export has it at about 610px); four entries to start a Mix, four ways to end one; two note systems under five labels | `19-contact-profile-phone-full.png`; `src/components/ContactProfile.tsx` | VR, VC | One Mixes section with a row menu; a profile ••• menu; notes near the top (Q9) | CON-04, CON-05, CON-16, CON-17, CON-28 |
| LEN-04 | JITM-05 §2.2; JITM-06 §2.33 | The Calendar agenda lists every follow-up (22 at 10:00 AM on one day); the first appointment is about 1,950px down; all kinds share one violet bar; the week strip marks neither today nor busy days | `24-calendar-laptop-full.png` | VR | Appointments first; one follow-up summary row per day (Q6) | JRC-21, JRC-23 |
| LEN-05 | known B-19 (JITM-09 §2.74) | Ready-made content has four to six entry points across `/templates`, `/templates/journeys` and the Marketplace, with three layouts, two pages titled "Mega-Mixes" and a bounce between them | MIX lane §2.10–§2.13 | VR | Ship B-19 | MIX-10 |
| LEN-06 | JITM-01 §2.16; gap | Today rows are 117px (about 3.5 per phone screen; about 1.5 at 320×700); the invitation strip takes about 108px; the Mix name and the reason print without a separator ("Estimate follow-up Referral follow-up") | `01-today-phone.png`; `src/styles/mobile-clarity.css:22` | VR, VC | 84–96px rows opened by a tap anywhere; restore " · " | TDY-01, TDY-02 |
| LEN-07 | JITM-07 §2.22; JITM-07 §2.8 | The Settings hub is ungrouped and 1,510px on a phone; back links and rail markers name parents the owner never opened; page titles don't match the labels that opened them | `26-settings-phone-full.png`; SHL lane | VR, VC | Grouped hub; back link to the real origin; H1 = label | SHL-02, SHL-09, SHL-28 |
| LEN-08 | JITM-07 §2.20, §2.8 | Phone chrome before content: Journey about 430px before the map (about 208px of map at 390×844, none at 320×700); the Mix library has the pane switcher, three tabs, a promo, search and a count before the first Mix | `21-journey-phone.png`; MIX lane | VR | One title row and one toolbar row | JRC-06, MIX-11 |

**JITM-09 editing Mixes**

| ID | Rule | Finding | Evidence | Label | Fix direction | Lanes |
|---|---|---|---|---|---|---|
| EDT-03 | gap | Installing the Contractor Mega-Mix created a second "Estimate follow-up" next to an existing one; lists and pickers show both identically; pickers preselect the alphabetically first Mix | MIX lane; `CON-17` | VR | Suffix or subtitle on duplicates; no silent preselection | MIX-05, CON-17 |
| EDT-04 | JITM-07 §2.13; JITM-10 §2.3 | Mega-Mix "Make it yours" sits in a 300px column; time and select values are clipped ("09:0", "No buffe") | `13-megamix-setup-laptop.png`; `src/components/MegaMix.module.css:1` | VR | Shared composition; one well-laid-out step | MIX-06 |
| EDT-05 | JITM-05 §2.1 | "Start" means both turning a Mix on and starting a person; "active" vs the filter's "On" | MIX lane | VR | "Turn on" vs "Start for someone" | MIX-09 |
| EDT-06 | JITM-04 §2.1 | Adding from the Marketplace or a file requires "I've reviewed the wording…" while the preview shows no wording | `src/components/MarketplaceControls.tsx:102` | VR, VC | Show the wording, or drop the tick | MIX-14 |
| EDT-07 | gap; JITM-06 §2.33 | Mega-Mix detail is read-only (Mix titles aren't links); list rows lack people counts and timing | MIX lane | VR | Links and counts | MIX-13, MIX-15 |

**JITM-05 vocabulary and formatting**

| ID | Rule | Finding | Evidence | Label | Fix direction | Lanes |
|---|---|---|---|---|---|---|
| FMT-02 | JITM-08 §2.28; gap | Raw "America/New_York" in eight places, once right under "New York" | `src/components/CalendarEntryForm.tsx:104`; `src/components/QuickAdd.tsx:166` | VR, VC | "New York time"; the zone only when it differs | DSN-02, JRC-30 |
| FMT-03 | JITM-05 §2.11; JITM-04 §2.4 | Raw values: the Today filter offers "sms…whatsapp" and filters on the Beat's original channel; status pills "active"/"completed"; "Call" vs "Phone call" (six label sets) | `06-today-filter-phone.png`; `src/app/(app)/jumps/page.tsx:110-114` | VR, VC | One label helper; filter by the shown version | TDY-05, DSN-03, MIX-20, CON-30, STF-15 |
| FMT-04 | JITM-09 §2.7 (MUST NOT) | Stages are labeled Journey: profile section, the stage chip's name, the sheet title, the notice, Calendar copy, the Settings icon | `20-stage-sheet-phone.png`; `src/components/ContactProfile.tsx:170,213` | VR, VC | "Stage" throughout | CON-02, JRC-35, SHL-18 |
| FMT-05 | JITM-04 §2.6 (MUST NOT); JITM-05 §2.11 | Implementation words: "background worker", "Queue 36 valid rows", "instances", "traversals", "cohort", "Saved configuration 1", "while the worker runs" | `src/app/(app)/contacts/import/page.tsx:53`; `src/components/WorkflowJourney.tsx:259,268` | VR, VC | Plain effect wording (COPY.md) | CON-07, JRC-11, JRC-34 |

**JITM-04 voice (owner messages and customer-facing pages)**

| ID | Rule | Finding | Evidence | Label | Fix direction | Lanes |
|---|---|---|---|---|---|---|
| VOI-01 | JITM-04 §2.5 (D23) | Pages and messages the owner's customers see default to "we" ("How did we do?", "so we can respond"); the review request prints "— — Alex at…" | `34-lead-form.png`; `src/app/api/contacts/[contactId]/review-request/route.ts:44-52` | VR, VC | Business name or "I" (Q16); no double dash | PUB-10, CON-11 |
| VOI-02 | JITM-04 §2.21; JITM-02 | The invitation greets an email-only invitee by address and saves them with the email as their name; "people in my circle" without naming the category | MIX lane; PUB lane (invitation text) | VR | Ask for a name or use "Hi,"; category wording (Kevin, JITM-09 §2.19) | PUB-08, MIX-17 |
| VOI-03 | JITM-06 §2.13; JITM-04 §2.21 | The onboarding starter preview shows raw `{{First Name}}`, `{{My Company}}`, `{{SMS Signature}}`; non-realtor first texts say "from my business" (known, ONB-10) | `31-onboarding-phone-full.png` | VR | Fill with real values or chips; ask for the business name | PUB-05, PUB-14 |
| VOI-04 | JITM-02 §2.2; JITM-04 §2.2 | A home-services account's ready-made catalog leads with seven networking "Relationships" Mixes with music-pun names; personal-tool empty states ("Make time for your circle") | MIX lane; `src/components/ContactsBulkWorkspace.tsx:244` | VR, VC | Order by business type; business wording (Q12 or Q13) | MIX-18, CON-31 |
| VOI-05 | JITM-04 §2.30 | On a phone the landing demo's draft is about 1,466px down behind a 55-word note; the waitlist is offered only after all three Beats | `33-landing-contractors-phone-full.png` | VR | One-line note; waitlist after the first Beat | PUB-13 |

**Safety in bulk work and flows (JITM-08, JITM-09)**

| ID | Rule | Finding | Evidence | Label | Fix direction | Lanes |
|---|---|---|---|---|---|---|
| SAF-01 | JITM-04 §2.14; JITM-09 §2.32 | No warning before starting people who have no phone or email (bulk Mix, bulk Message, profile Start) | `47-contact-no-method-phone.png`; `src/components/ContactsBulkWorkspace.tsx:254-271` | VR, VC | Name them, with "Add phone or email" | CON-13 |
| SAF-02 | JITM-09 §2.11; JITM-08 §2.5 | Bulk Add tag / Remove tag can start or stop tag-based Mixes with no warning and no Undo | `src/lib/bulk-contact-actions.ts:71-83` | VC | Say the effect; Undo | CON-14 |
| SAF-03 | prior MSG-07 | Profile and review-request handoff links use the typed number with spaces (`sms:+1 555 010 1002`); Today uses E.164 | `src/components/ContactProfile.tsx:217,219,246`; `src/lib/phone-dial.ts:34-52` | VC | Use `phone-dial.ts` everywhere | CON-12 |
| SAF-04 | JITM-10 §2.1 | Phone selection mode: tapping a row outside the checkbox opens the profile and drops the selection | `src/components/ContactsBulkWorkspace.tsx:235-238` | VC (runtime NOT RUN) | Row tap toggles in selection mode | CON-22 |
| SAF-05 | gap | The verify page's only filled button sends another link, which cancels the one in the inbox | PUB lane | VR, VC | "Open your email" primary; resend secondary | PUB-12 |

**JITM-10 accessibility**

| ID | Rule | Finding | Evidence | Label | Fix direction | Lanes |
|---|---|---|---|---|---|---|
| ACC-01 | JITM-10 §2.2 | Meaningful text under 13px: the rail's invitation hint and "Signed in as" (every desktop page); Mix outline details; profile labels ("Mobile", "Work"); review rhythm dates | metrics; `src/styles/base.css:194`; `src/styles/design-workspaces.css:422` | VR | 13px; add a sub-13px drift metric | DSN-07, MIX-19, CON-26, SHL-23 |
| ACC-02 | JITM-10 §2.1 | Phone targets under 44px: "View upcoming follow-ups" (16px), "Stop this work" and "Edit the generated…" (24px), "View journey" (24px), appointment titles (20px), tel/mailto links, the Mega-Mix select (42px), Mix tabs at 320px | metrics | VR | 44px rows | DSN-08, CON-26, JRC-31, JRC-14, MIX-12 |
| ACC-03 | JITM-08 §2.26 (MUST NOT); JITM-10 §2.11 | On phones the Add/Edit contact save bar (two rows, sticky above the tab bar) covers fields | `46-contact-new-phone.png`, `48-text200-contact-new-320.png`; `src/styles/components.css:268` | VR | Scroll with the form at ≤900px, as Calendar and Mixes do | CON-15 |
| ACC-04 | JITM-10 §2.3 | 200% text at 320px: the Today title breaks "Tod/ay"; tab labels split ("Cont/acts"); the More badge overlaps its icon; the review close "×" falls outside its circle; the profile name stays px-sized | `29-text200-today-320.png`, `30-text200-review-320.png` | VR (lead) | Let the header wrap; no `overflow-wrap:anywhere` on short labels; rem sizes | lead O48, CON-29 |
| ACC-05 | JITM-06 §2.28; JITM-10 §2.5 | Checkbox cards squeeze native checkboxes to 4–11px and run labels together ("automaticallyOff by default"), including the sending consent; the lead form's consent box sits alone on its line | `src/styles/base.css:170-171`; `34-lead-form.png` | VR, VC | Fix the shared component once | SHL-04, DSN-11, PUB-09 |
| ACC-06 | JITM-10 §2.3 | Today's first-card "Review" caption is clipped at 390px and 320px (a legacy −8px margin and two stylesheets disagreeing about the column) | `01-today-phone.png`; `src/styles/product.css:148`; `src/styles/phone-icons.css:17-19` | VR, VC | One style owner | TDY-03, DSN-06 |
| ACC-07 | JITM-10 §2.1, §2.2; JITM-07 §2.14 | The staff phone shell: header links 72×17, text at 9–12px, stale overrides squeeze tiles into three columns, 165–250px of chrome before the H1 | `37-staff-phone.png`; `src/styles/admin-density.css:164,167,267` | VR, VC | A single 56px bar; floors; delete overrides | STF-06, STF-07, STF-08, STF-27 |

**JITM-06 and JITM-08: overlays and controls**

| ID | Rule | Finding | Evidence | Label | Fix direction | Lanes |
|---|---|---|---|---|---|---|
| OVL-01 | JITM-10 §2.7; JITM-08 §1 | Six "selected" looks for one job; search and filter entry differs on each list screen | DSN lane §2.13 | VR, VC | One segmented/chip family; one list header | DSN-04, DSN-05 |
| OVL-02 | JITM-08 §2.11 | Quick Add on phones is a 640px sheet without a grabber, not full screen | `08-quickadd-open-phone.png`; `src/styles/design-system.css:116` | VR, VC | Full screen below 768px | DSN-10, TDY-16 |
| OVL-03 | JITM-08 §2.33 | Choosing Email in the phone review shows the route's "Loading follow-ups…" page for about half a second (the draft survives) | `43-review-email-loading-flash.png`; `src/components/FollowUpChannelChoice.tsx:41-46` | VR (lead, timed) | Swap the version in place | TDY-07 |
| OVL-04 | JITM-06 §2.7, §2.28 | Unstyled native controls: the Contacts "Done", "Recent imports" rows, the browser-blue 160px progress bar at 100% | `15-bulk-bar.png`, `18-import-results.png` | VR, VC | Shared components | DSN-12, CON-08, CON-24 |
| OVL-05 | JITM-08 §2.32 | No loading state for Journey, Marketplace, More, Settings, My account or Help | `find src/app -name loading.tsx` | VC | `(app)/loading.tsx` | DSN-13 |
| OVL-06 | JITM-08 §2.3; JITM-06 §2.20 | The review message box ignores length (115/190px minimum, resize grip in the bubble; emails cut off) | `04-today-desktop-1920.png` | VR | Auto-height, no grip | TDY-11, DSN-28 |
| OVL-07 | JITM-10 §2.7 | From 768px the open row and the "next" row share one violet wash, so two rows look selected | TDY lane | VR | Distinct open state | TDY-09 |
| OVL-08 | JITM-08 §2.10, §2.19, §2.28 | Overlay and control drift: centered close buttons, two closes on the WhenPicker, three chevron positions, 19 native date inputs against the WhenPicker, button emphasis that disagrees | DSN lane | VR, VC | Consolidate in `popups.css` and `disclosures.css` | DSN-14, DSN-15, DSN-24, DSN-25 |
| OVL-09 | JITM-08 §2.10 | Contact tools mixes navigation, selection mode and a whole tag manager with a native color input | `14-contact-tools-sheet.png` | VR | Tags page; tools = flat rows | CON-18 |

**JITM-09 navigation and Today structure**

| ID | Rule | Finding | Evidence | Label | Fix direction | Lanes |
|---|---|---|---|---|---|---|
| NAV-01 | JITM-01 §2.11–§2.12, JITM-04 §2.1 (in tension with JITM-09 §2.9, §2.24) | Up to three invitation prompts at once; the Today strip's filled "Invite people" sits above overdue work and appears on a new owner's first Today; the More badge reads like unread work | `01-today-phone.png`, `32-first-today-phone.png`, `40-today-tablet.png` | VR | Q4 | SHL-11, PUB-07, TDY lane |
| NAV-02 | JITM-07 §2.8; JITM-10 §2.15 | Back links and current markers name parents the owner didn't come from (see LEN-07) | SHL lane | VR, VC | Back to the origin | SHL-02 |
| NAV-03 | JITM-10 §2.14 | My business Services rows have unlabeled fields; "Name" is never used in messages | `src/components/RepeatableProfileRecords.tsx:11` | VR, VC | Labels; drop unused field | SHL-10 |
| NAV-04 | gap | One person with two follow-ups due the same day appears as unrelated rows (Marcus Reed: overdue text and today's call) | `01-today-phone.png` | VR | Group with "also due" (Q3) | TDY-13 |
| NAV-05 | JITM-06 §2.33 | The review's context shows only phone, email and Open contact; the export shows Last note and History; phones get no context | `04-today-desktop-1920.png` vs `05-export-desktop-today.png` | VR | Last note in the review | TDY-10 |
| NAV-06 | JITM-09 §2.13 | Beat-track dates are links that switch Today to a one-item view with "Filter 2" | TDY lane | VR | Open the Beat in place | TDY-14 |
| NAV-07 | JITM-01 §2.11 | "No stage" shows on every row and as a profile chip even with Contact stages off; imports put everyone in the arrival stage (CSV past customers become "Inquiry") | `44-contacts-no-mix-filter.png` | VR, VC | Hide when off; stage choice at import (Q17) | CON-20, CON-21 |

**Known items re-confirmed (no new severity):** B-13 Journey numbering by view (`B1` vs `A1`, JRC-12); B-05 People-row tooltips (JRC-04); B-19 ready-made catalog (LEN-05); B-09 "verified" wording (STF-21); inline link styling (JITM-10 §6; PUB-15, STF-11); LOOP-06 nothing after an import (CON-08); MSG-07 typed-number links (SAF-03); ONB-10 "my business" (VOI-03).

**LOW (126):** polish and consistency across all lanes. See `FINDINGS.md`. Several of these the owner meets often:
- "Done 0" disclosure (TDY-20);
- dates with no weekday (TDY-22);
- the stray "0" in the contact filter (CON-19, DSN-20);
- red "0 Needs attention" (JRC-05);
- capital labels (DSN-16, SHL-19);
- "Profil/e" in the compact rail (SHL-14, DSN-19);
- machine plurals (STF-14, JRC-10);
- desktop Sign out only in the Profile sheet (SHL-13).

---

## 6. Documents that disagree with each other

- **Stage naming.** The design export ("Journey … Start a touchpoint") and `docs/design/DESIGN_GUIDELINES.md:28,64` disagree with JITM-09 §2.7 / D4 / D16 and JITM-05 §2.10. The owner decision should win: mark the guidelines superseded (JITM-00 §2.16 already says so) and treat the export label as history. JITM-05 §6 lists only three "customer journey" links, not the profile heading, chip name, sheet title or notice.
- **Demo handoff.** JITM-04 §2.30's model line ("Nothing is sent and no messaging app opens.") and the export landing screens predate D31. JITM-09 §2.67 (3.0.0) now opens the visitor's own app.
- **JITM-09 §2.5 contradicts itself** for `/mixes/system`: "Mixes MUST be marked current on `/mixes/…`" against "pages reached through More mark More".
- **JITM-09 §2.65** names "Journey preferences" (working hours) while JITM-05 §2.2 and JITM-09 §2.7 reserve "Journey" for connected Mixes. It also puts a "profile" on both My account and Personal preferences.
- **JITM-09 §2.9 and §2.24** (six invitation placements; the strip above Overdue) pull against JITM-01 §2.11–§2.12 and JITM-04 §2.1. That is Kevin's call (Q4).
- **The README vs JITM-10.** `docs/standards/README.md:66` says every rule uses MUST, SHOULD or MAY. JITM-10 §2.1 and §2.2 use neither, so their severity is ambiguous (Q14).
- **Three estimate plans** meet a contractor on the way in: the template page (4 Beats), the demo (3) and the onboarding starter (2).
- **The 09-18 audit's ONB-06** (the first screen after setup makes the next action primary) against the 2026-09-27 invitation strip.
- **`docs/READY_MADE_MIX_PANES_2026-09-21.md`** (a setup link in the center when the right pane is hidden) against the Marketplace, which has none.
- **Runbooks against the staff console:** four runbooks name pages and tabs that no longer exist (STF lane §6).

## 7. Documents that disagree with the code

| Document | Says | Code does | Evidence |
|---|---|---|---|
| JITM-09 §2.39 | The review gates activation | The review runs on every save of a running Mix | `src/lib/mix-editor-actions.ts:146-148` |
| JITM-09 §2.24; JITM-05 §2.3 | The first card carries "Next up" | Hidden by CSS | `src/styles/design-workspaces.css:45` |
| JITM-08 §2.11 | Quick Add fills the screen below 768px | 640px sheet up to 600px | `src/styles/design-system.css:116` |
| JITM-08 §2.29 | Today search applies at once | Search button plus reload | TDY-21 |
| JITM-08 §2.26 | Sticky save bars never cover fields | Contact forms do on phones | `src/styles/components.css:268` |
| JITM-09 §2.3 | Desktop rails show all six destinations | More is hidden in every rail; desktop can't reach `/more` | `src/styles/design-workspaces.css:12` |
| JITM-09 §2.6 | Today and Ready-made rows on desktop only | Shown at 768–900px too | `src/styles/components.css:311-312` |
| JITM-07 §2.22 | Settings: 56px rows, groups, hidden descriptions at ≤900 | Rules scoped to `.more-page`; Settings ungrouped | `src/styles/design-system.css:150-159` |
| JITM-07 §2.23 | Reading pages use flat sections | Only `page--form` is flattened | `src/styles/design-workspaces.css:27` |
| JITM-06 §2.27 | The compact appearance switch sits in the rail | Hidden at 901–1279px | `src/styles/design-workspaces.css:205` |
| JITM-03 §2.13 | The app's bubbles get a left tail | Every bubble gets a right tail | `src/styles/design-system.css:62` |
| JITM-07 §2.13, §2.18 | One Mix-library composition | `/templates/journeys` uses `260px 1fr 300px` | `src/components/MegaMix.module.css:1` |
| JITM-09 §2.57 | Delete a path above the canvas | In the Details pane | `src/components/WorkflowJourney.tsx:247` |
| JITM-09 §2.68 | "Mixes for:" on every public page | Only on the six landing pages | `src/components/PublicLanding.tsx:28` |
| JITM-04 §6 | No per-visit automatic-sending control exists | It exists after saving (`appointmentBindingDeliveryAction`) | `src/app/(app)/calendar/page.tsx:82`; `src/lib/calendar-actions.ts:58-63` |
| JITM-06 §5 | The dark-token `diff` prints nothing | Prints 36 whitespace-only lines; `diff -w` is clean | DSN lane §6 |
| JITM-10 §6 | Journey's sub-floor text is 11–12px | Also 8px inline overview text; Calendar's agenda is 12px | `src/components/WorkflowJourney.tsx:231` |
| JITM-05 §2.3 | A one-time follow-up belongs to no Mix | Review and rows show its hidden "One-time follow-ups" Mix and "Skip Beat" | INF from `src/lib/one-time-follow-up.ts:34` |
| `src/lib/preparation.ts:11` vs `src/lib/contact-mix-status.ts:56-61` | Two definitions of "being prepared for this person" | — | TRU-04 |

## 8. Gaps where no rule exists

- **Date, time and zone display:** 12- or 24-hour, ISO or friendly, weekdays, and city names vs IANA ids.
- **Queue row content and separators; same-person same-day follow-ups; auto-advance after an outcome** (JITM-09 §2.10's budget leaves out the Review tap and the scroll).
- **Owner-action items outside Today must surface on Today:** held inquiries, visit outcomes.
- **Booking entry points** (profile, Today, Journey person card), and whether a profile shows appointments.
- **Bulk selection:** how it is entered and found, and which bulk action is primary.
- **Pickers:** default selection; telling duplicate Mix names apart; one shared person picker.
- **Calendar:** whether it shows follow-ups individually, summarized or not at all, and how kinds are told apart.
- **Journey:** a readable default and minimum zoom; whether the map follows journey-number order; keeping the view in the address.
- **Phone pane switchers:** the primary action must be visible in the default pane.
- **A page's H1 must match the label of the entry that opened it; which back link to show when several hubs link to a page.**
- **Navigation badges:** what they may count (work to do, not an allowance).
- **Whose voice the owner's customers read** (lead form, review page): D23 covers only messages and drafts.
- **Visual order of rating and choice controls:** tests pick by accessible name, so a reversed display passes (TRU-01).
- **Save confirmations on long pages with several forms.**
- **Filter and search entry anatomy; selection-state visuals beyond JITM-10 §2.7; when native date inputs are acceptable.**
- **Illustration exception** to JITM-06 §2.7 for device mock-ups; **icon-over-label captions** are not in JITM-10 §2.2's exceptions.
- **Touch tablets in landscape:** the 44px rule is width-based, so a 1194px touch tablet gets 36px buttons.
- **The drift baseline has no metric for sub-13px font sizes.** DSN lane proposes metric 13: 159 declarations under 13px today.

## 9. Drift baseline refresh (WF-07 step 6)

Commands from `docs/standards-audit-2026-09-28/DRIFT_BASELINE.md`, run read-only at `f23db11` against baseline `9439fd6` (DSN lane §6). VERIFIED-RUNTIME (command output).

| # | Metric | Baseline | Now | Change |
|---|---|---|---|---|
| 1 | Color literals in styles / CSS modules | 53 / 2 | 53 / **11** | **+9 new drift:** `ProductDemo.module.css:60-68` (phone-frame illustration) |
| 2 | Color literals in `.ts`/`.tsx` | 42 in 9 files | 45 in 11 files | +2 QR colors in `DemoPhoneQr.tsx:48` (functional), +1 false positive |
| 3 | Native `confirm` | 2 (FormGuard) | 2 | No change |
| 4 | Customer terms | Mega-Mix variants 31 | **2** | Improved; "Plan" up from billing and pricing only |
| 5 | Raw `<svg>` outside AppIcon | 4 | 5 | +1 `DemoPhoneQr.tsx` (data drawing) |
| 6–9 | Font families, stylesheets, `!important`, inline styles | — | — | No change |
| 10 | Routes | (app) 33 | (app) 36, +1 public | All new routes use an archetype |
| 11 | AppIcon without dimensions | 290/290 | 304/304 | Same proportion |
| 12 | Width breakpoints off the shared set | 126 | **127** | +1 `product.css:427` (600px) |

## 10. NOT READ / NOT RUN

**Runtime claims re-verified by the lead auditor** (VERIFIED-RUNTIME on the audited build):
- TRU-01: tap the rightmost star.
- TRU-02: edit and save a running Mix.
- DIS-01: ambiguous lead submitted; Today, More, Settings and Contacts checked.
- DIS-04: Start flow geometry.
- Journey Setup and Results tabs at the default zoom.
- OVL-03: channel switch timed at 100ms steps; the draft survives.

**NOT RUN:**
- Physical iPhone Safari and Android Chrome, VoiceOver, TalkBack, operating-system text scaling, real soft keyboards (no devices). Emulation does not qualify device rows (JITM-12 §2.6).
- The real handoff to Messages, Mail and Phone and the return tray after it (headless browser).
- States with automatic customer email or billing on (both off in production).
- The staff console at 1366×768 (captured at 1440×900).
- Lighthouse and performance. Firefox and WebKit.
- Journey decision prompts at a Mix's last Beat; the end-of-Mix "What's next?" sheet; Needs your input items; quiet-day check-ins; Community listings, support tickets and waitlist entries with data.
- The ReviewDialog after an audience change; the TimezonePicker sheet; WhenPicker time slots with buffers; loading states on a slow network; sheets at 480px height or less.
- Keyboard walkthroughs beyond the Tab order of Today and Contacts. 200% text on public and staff pages.
- Production: nothing touched; read-only by design (JITM-16 §2.10).
- The stored ratings in production (TRU-01) were not checked: that needs production access Kevin must approve.

**Deliberately not captured:** the administrator MFA enrollment screens (secret and recovery codes; JITM-12 §2.19).

**NOT READ:**
- production data and configuration;
- customer workspaces and private inboxes;
- local-only source documents;
- the plans behind the onboarding length change (JITM-01 §2.12);
- dated records beyond those cited.

**Environment:** a local production build with emulated devices only. The local worker stopped twice (at about 16:5x and 17:39 PDT) on a 12-second database transaction timeout while another project's test suite loaded the host (load ≈ 8). It had already prepared the follow-ups. The captures taken afterwards (held inquiry, review stars, Mix save, Journey tabs) do not depend on it.

**Outside this audit's scope, worth a look (WF-04):** the worker's main loop runs `requireDatabaseRelease()` every 30 seconds. A transient "unavailable" result throws out of `main` and ends the process instead of retrying (`src/worker/index.ts:391`; VERIFIED-CODE, and VERIFIED-RUNTIME locally under load). Production impact is NOT RUN. A restart policy may mask it (INFERRED).

## 11. Questions for Kevin

**Answered 2026-10-08.** Kevin chose the recommended option for every question (all A): "I will go off you recommendations. please go ahead and implement". The answers are recorded as owner decisions D69–D86 through WF-08 in a separate pull request, and the product changes follow as their own tasks.

Answer with a letter each.

1. **Review stars (BLOCKER).**
   - (A) Hotfix release now, plus a read-only check of ratings stored since 2026-09-04 that you approve.
   - (B) Hide "Ask for a review" until the fix ships.
   - (C) Fix it in the next batch.
2. **Today momentum.**
   - (A) After each outcome, open the next due follow-up automatically, with Undo still on screen, on phone and desktop.
   - (B) Phone only.
   - (C) Keep as is.
3. **One person, two follow-ups the same day.**
   - (A) One card with "also due" and "skip the earlier one".
   - (B) Separate rows, linked.
   - (C) Keep as is.
4. **Invitation prompts.**
   - (A) One compact prompt you can dismiss, shown only after the first recorded outcome; keep the rail callout and the More row; drop the More badge and the tablet header gift.
   - (B) Keep all, but move the Today strip below the due sections.
   - (C) Keep as is.
5. **Onboarding.**
   - (A) Two-screen phone form: the person first, a filled preview with real dates, Mega-Mix as a secondary link.
   - (B) Keep one page, but move the required inputs to the top and collapse the optional choices.
   - (C) Keep as is.
6. **Calendar and follow-ups.**
   - (A) Appointments first; follow-ups as one summary row per day linking to Today.
   - (B) Keep every follow-up row, visually distinct and collapsible per day.
   - (C) Keep as is.
7. **Journey default.**
   - (A) Open at 100% on desktop, scrolled to the first numbered Mix, and in List view on phones.
   - (B) Keep Fit, with a readable 13px minimum.
   - (C) Keep as is.
8. **Bulk placement.**
   - (A) A visible "Select" control, a No Mix strip with "Add these N to a Mix", and Mix as the primary bulk action.
   - (B) Only a visible "Select" control.
9. **Contact profile below the Next card.**
   - (A) One Mixes section, plus a profile ••• menu (Edit, Ask for a review, Schedule a meeting, Do not contact, Archive), with notes and the next appointment near the top.
   - (B) Remove the duplicates only.
10. **Work that must surface on Today.**
    - (A) Held lead inquiries, visits awaiting an outcome, and "Book a visit" in the outcome step.
    - (B) Held inquiries only.
    - (C) None; badges on their pages instead.
11. **Time format in the app.**
    - (A) 12-hour with AM/PM and city time-zone names (US-first).
    - (B) Follow the browser's locale.
12. **Mixes.**
    - (A) Inline Text / Email / Call tabs on each Beat, and B-19 next.
    - (B) Show the channel label only; B-19 later.
13. **Settings and account.**
    - (A) A grouped Settings hub; working hours and scheduling moved out of Personal preferences; one desktop account control with Sign out and Plan and billing.
    - (B) Fix duplicates and back links only.
14. **Accessibility floors.**
    - (A) Make JITM-10 §2.1 (44px) and §2.2 (13px) MUST rules for every owner screen, including Calendar and Journey, with an automated guard and a sub-13px drift metric.
    - (B) The same, with staff phone views exempt.
15. **Staff console.**
    - (A) An Overview "This week" queue, and "Customers" as the one name.
    - (B) The same queue, with "Users" as the name.
    - (C) Keep as is.
16. **Voice on pages the owner's customers see** (lead form, review page, review request).
    - (A) The business name ("Northline Home Services will reply").
    - (B) "I" (D23).
    - (C) Keep "we".
17. **Personal framing and import stages.**
    - (A) Business wording by default: drop "Personal connections" from onboarding, "people in my circle" from the invitation and personal empty states; import asks for the new people's stage.
    - (B) Keep the personal option, but use business wording by default.
    - (C) Keep as is.
18. **This report.**
    - (A) Commit it with its evidence on branch `audit/ux-design-20261008` and open a pull request.
    - (B) Keep it local for now.
