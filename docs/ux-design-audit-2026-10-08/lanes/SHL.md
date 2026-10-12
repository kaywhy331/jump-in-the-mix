> Lane report SHL (Navigation, Settings, Account, Help) of the [UX, design and layout audit](../../UX_DESIGN_AUDIT_2026-10-08.md), 2026-10-08, commit `f23db11`. Written read-only by a review lane and consolidated by the lead auditor. Paths under `<captures>/` refer to the private local capture set (not committed; see [README](../README.md)); a selection is in [`../captures/`](../captures/). Severity adjustments made at consolidation are listed in [FINDINGS.md](../FINDINGS.md).

# SHL — App shell, navigation, More, Settings, account and Help

Lane report for the 2026-10-08 UX, design and layout audit. Audited code: `origin/main` = `f23db11` (production `dae3fab` plus docs), worktree the repository. Evidence paths are relative to `<captures>` (`<captures>`). Code is cited as `src/...:line`. Crops I made are in `lanes/crops/SHL/`. Read-only: nothing was built, run or changed.

Scope covered: the phone tab bar, the tablet header (768–900), the compact rail (901–1279, new `tabletLand-light` captures at 1194×834), the full rail (1280 and up), the Profile sheet, invitation prompts, More, the Settings hub and all seven settings pages, My account (Profile, Security, Data & privacy, deletion), Plan and billing, Personal preferences, Help and Support conversations. I also checked the frame on Today and Contacts captures at 390, 834, 900/901, 1194, 1280, 1440 and 1920.

---

## 1. Lane summary

**Verdict.** On phones the frame works well: the tab bar and More are the closest match to the export of any screen in this lane. The desktop rail works, but it carries more than the export does. **The settings and account information architecture is not optimal.** Five overlapping containers (the rail with its Profile sheet, More, the Settings hub, My account and Personal preferences) list the same destinations up to four times. Six of the 11 Settings rows can also be reached from More or My account. On those shared pages the back link or the rail marker often names a parent the owner never opened. Personal preferences always says "My account". Notifications and Lead connections say "Settings" even when opened from More. Settings' Password & sessions lands in My account, whose phone back link is "More". Settings that apply to the whole business live on a page called "Personal preferences". Some important things are hard to find or invisible:
- lead inquiries held for a match show only in Settings → Lead connections;
- Plan and billing has one way in;
- on desktop, Sign out is only inside a modal named "Profile";
- at 901–1279px the frame has no dark-mode switch.

The five changes that would help the owner's workflow most:
1. **Make Settings the one grouped home for setup.** Use four groups: Your business, People and leads, You, Account. Shrink More to Journey, Calendar, Invite people, Settings, Help, Appearance and Sign out. Replace the desktop "Signed in as" text, Profile button and sheet with one account control (name, My account, Plan and billing, Sign out). This removes about ten duplicate entries and the wrong back paths. It changes JITM-09 §2.4, §2.6, §2.7 and §2.65, so Kevin decides.
2. **Split Personal preferences (4,433px on a phone).** Move name, locale and timezone onto My account. Move working hours, quiet time, phone country and Quiet-day check-ins into a business page, "Working hours and scheduling". Keep one timezone control, and show each save's confirmation where the owner saved.
3. **Put held lead inquiries on Today** (Needs your input, with a count on Lead connections). After "Create shareable form", land on the new form's link instead of an empty form.
4. **Fix the shared `checkbox-card` component** where it is defined, not page by page. Today its checkboxes are squeezed into 4–11px dots and the hint text runs into the label ("automaticallyOff by default"). Also fix the compact rail: add the appearance switch, stop "Profil/e" breaking, and stop using the same person icon twice.
5. **Show fewer invitation prompts at once.** Today up to three show together (at 834px), and the Today strip, whose "Invite people" is the only filled button in the page content on a phone, sits above overdue work and appears on a brand-new owner's first Today. Keep one lasting entry per frame. This changes JITM-09 §2.9 and §2.24, so Kevin decides.

---

## 2. Page and overlay verdicts

### 2.0 The IA question: is navigation plus settings/account optimal?

**No.** Today's model has four overlapping words for "configuration": **Profile** (a desktop button that opens a sheet of links), **My account**, **Personal preferences** and **Settings**. "Profile" itself means three different things: the rail button and sheet, My account's first tab (name and email, read-only), and the first form on Personal preferences (display name, locale, timezone).

Where the same destination appears (VERIFIED-CODE: `src/app/(app)/more/page.tsx:12-21`, `src/app/(app)/settings/page.tsx:10-22`, `src/components/AppShell.tsx:53-73`, `src/components/Nav.tsx:18-22`):

| Destination | Entry points | Back link / rail highlight on arrival |
|---|---|---|
| Personal preferences (`/account/preferences`) | More, Settings, My account "Edit preferences" | "My account" in all cases; rail highlights My account (`shots/sweep/laptop-light/account-preferences.png`) |
| Notifications | More, Settings | "Settings", even when opened from More |
| Lead connections | More, Settings | "Settings", even when opened from More |
| Password & sessions / Data & privacy | Settings rows, My account tabs, My account "Your data, your choice" card | Lands in My account, whose phone back link is "More" |
| Calendar | rail or More, plus Settings "Calendar & time blocks" | Opens the Calendar workspace, not its connections panel |
| My account, Settings, Help | rail footer, plus the Profile sheet directly below it | — |
| Invite people | rail callout, Profile sheet, More row, More badge, Today strip, tablet header | — |
| Appearance | rail, More, Personal preferences (two on one desktop screen) | — |
| Support conversations (`/account/tickets`) | Help (three links) | Rail highlights **My account** (`shots/sweep/laptop-light/account-tickets.png`) |

**Where an owner looks for something and fails, or takes a detour:**

| Owner wants to… | Looks in | Where it is | Result |
|---|---|---|---|
| Change working days or business hours | My business | Personal preferences → "Journey preferences", about 2,500px down on a phone | Detour. My business has only a small "Timezone and scheduling" link (`src/app/(app)/settings/business/page.tsx:43`) |
| Act on a lead the app couldn't match | Today, Contacts | Only Settings → Lead connections → "Needs a person's eye" | **Fails silently** (SHL-01) |
| See the plan or billing | Settings, More | Only My account → Profile tab → "See your plan" card | Fails in Settings and More (SHL-12) |
| Sign out on desktop | Rail footer | Inside the "Profile" modal only | Detour (SHL-13) |
| Switch to dark mode at 901–1279px | Rail, Profile sheet | Settings → Personal preferences → "Make yourself at home" | Detour (SHL-14) |
| Change their own name | My account → Profile (shows Name) | The "Edit preferences" button opens another page | Guesswork (copy C10) |
| Turn on Quiet-day check-ins | Today, Notifications, Settings | Fourth section of Personal preferences, about 1,800px down on a phone | Likely missed |
| Find "saved messages" (More's Settings row promises them) | Settings | They don't exist; wording lives in Mixes | Fails (C07, desktop only) |
| Connect a calendar from Settings | "Calendar & time blocks" | Calendar agenda; connections are collapsed at the bottom | Detour (copy C27) |
| Get back after changing timezone from Settings | Back link | Says "My account" | Wrong parent (SHL-02) |

A clear model needs two words: **Settings** (everything configurable, grouped) and **My account** (who you are, sign-in, plan, your data). Recommended structure: §5 R1–R2.

### 2.1 Navigation frame: phone tab bar (≤900px)
- **Purpose:** reach daily work and Quick Add with one hand.
- **Works well:** five equal columns with the central Quick Add bubble (JITM-07 §2.6). The active tab has a tinted pill and a heavier label, a non-color cue (JITM-10 §2.7). Labels are 13px at 390px. It matches `shots/export/More.png` (`shots/sweep/phone-light/more.png`).
- **Gets in the way:** More carries an invitations count ("3") at all times, from a new owner's first minute (`shots/flow-onb-5-today-welcome.png`). A number badge reads as unread work, but this is an allowance. Known, not re-audited: Quick Add size (JITM-07 §6), tab type (JITM-06 §6).
- **Verdict: Good, fix details.**
- **Recommended structure:** keep it as is. Drop the More badge, or show it only after the owner has recorded a first outcome (Kevin decision, JITM-09 §2.9).

### 2.2 Navigation frame: tablet header (768–900px)
- **Purpose:** the frame for portrait tablets.
- **Works well:** nothing it offers is missing elsewhere.
- **Gets in the way:**
  - The sticky 64px header plus the bottom bar take about 130px of a 900px screen (`shots/breakpoints/contacts-900.png`).
  - Its initial button "D" opens More, duplicating the More tab, and its accessible name "More" doesn't contain the visible "D" (`src/components/AppShell.tsx:81`).
  - Its gift button repeats the invitation count that the More tab and the Today strip also show, so three prompts appear on one Today screen (`shots/sweep/tablet-light/today.png`).
  - Known open decision: JITM-07 §6, "Portrait tablets".
- **Verdict: Needs rework.**
- **Recommended structure:** drop the header at 768–900px, as the export's `TabletToday` has none. More already holds Invite people and My account.

### 2.3 Navigation frame: compact rail (901–1279px; `shots/sweep/tabletLand-light/*`)
- **Purpose:** the frame for landscape tablets and small laptops.
- **Works well:** an 80px rail with icon-plus-label destinations. Quick Add and the account links are named icons (JITM-07 §2.5). The invitations callout collapses to a gift icon with a count.
- **Gets in the way:**
  - There is no appearance switch: it is hidden (`src/styles/design-workspaces.css:205`), although JITM-06 §2.27 puts the compact switch in the rail.
  - The Profile button breaks mid-word as "Profil/e" (`overflow-wrap: anywhere`, `src/styles/design-workspaces.css:210`; `lanes/crops/SHL/compact-rail-footer.png`).
  - The My account link and the Profile button stack two identical person icons that do different things (`src/components/Nav.tsx:21`, `src/components/AppShell.tsx:60`).
  - The Today strip still shows beside the rail's gift badge.
- **Verdict: Good, fix details.**
- **Recommended structure:** put an icon-only appearance switch under Help. Replace the Profile button with one account control (an initial avatar with an accessible name, opening the account sheet in R1). Labels never wrap mid-word.

### 2.4 Navigation frame: full rail (1280px and up) and the Profile sheet (`shots/overlays/laptop-light/profile-sheet.png`)
- **Purpose:** steady desktop navigation and account access.
- **Works well:** the export's backbone (logo, Quick Add with its N hint, five destinations, then Settings, Help and My account). The current item is a raised pill. Everything fits in a 900px-tall window (`shots/sweep/laptop-light/more-full.png`).
- **Gets in the way:**
  - Four blocks the export lacks (`shots/export/DesktopToday.png`): the invitations callout, Appearance, "Signed in as …" and a Profile button.
  - The **Profile sheet** ("Profile and settings") repeats My account, Settings and Help, which sit just above it in the rail, and Invite people, which is the callout above. It adds Ready-made Mixes (known: B-19, with the import icon instead of the Mixes icon) and holds the **only desktop Sign out**. It shows no profile information.
  - The export shows a due count on Today ("Today 4"). The shipped rail shows none, so its only numbers are about invitations.
  - "Signed in as" is 12.8px and the callout line is 12px (SHL-23).
- **Verdict: rail, Good, fix details. Profile sheet, Needs rework.**
- **Recommended structure:** replace "Signed in as", the Profile button and the My account link with one account control showing the owner's name. It opens a short sheet: name and email, My account, Plan and billing, Sign out. Keep Settings and Help as links. A due count on Today follows the export, but it is new behavior, so Kevin decides (JITM-06 §2.4).

### 2.5 Invitation prompts (all widths; verifies O1 and O37)
How many show at once (VERIFIED-RUNTIME):

| Width | Today screen | Other |
|---|---|---|
| 390 | Today strip (its "Invite people" is the only filled button in the page content; above Overdue, about 108px) + More badge = **2** (`shots/sweep/phone-light/today.png`) | More page: row + badge = 2 |
| 834 | header gift with count + Today strip + More badge = **3** (`shots/sweep/tablet-light/today.png`) | More: 3 |
| 1194 | rail gift with count + Today strip = **2** (`shots/sweep/tabletLand-light/today.png`) | — |
| 1440/1920 | rail callout + Today strip = **2**, or 3 with the Profile sheet open (`shots/probe-today-laptop-light.png`) | Desktop More (if reached): callout + row |
| New owner's first Today | welcome notice, then the strip with its filled button **before** the first follow-up (`shots/flow-onb-5-today-welcome.png`) | More badge from minute one |

- **Verdict: Needs rework.** All six placements conform to JITM-09 §2.9, and §2.24 puts the strip above Overdue, so the change is Kevin's. They work against JITM-01 §2.11 (daily work runs from Today), JITM-01 §2.12 (the first-run promise) and JITM-04 §2.1 (calm, no pressure).
- **Recommended structure:** one lasting entry per frame: the desktop rail callout and the phone More row. Show the Today strip only after the owner has recorded a first outcome, below the due sections, with a dismiss option. Drop the More badge and the tablet header gift.

### 2.6 More (`shots/sweep/{phone,tablet,laptop,desktop}-light/more*.png`, `phone-dark/more.png`)
- **Purpose:** reach everything that is not in the tab bar.
- **Works well (phone):** 56px rows with surface bands between groups and chevrons. Appearance and Sign out sit above the tab bar, all on one 844px screen. The order matches JITM-09 §2.6 and the export.
- **Gets in the way:**
  - Four of its eight destination rows (Calendar, Lead connections, Personal preferences, Notifications) are also Settings rows, one tap away. My account repeats two more Settings rows. The same settings appear in two lists with different back paths (§2.0).
  - The Invite row has no chevron.
  - At 768–900px the bands and chevrons disappear (`.more-destination{display:contents}`, `src/styles/components.css:309-310`; `.mobile-only` only at ≤767px). The "desktop-only" Today and Ready-made Mixes rows appear because `.desktop-only` hides only at ≤767px (`src/styles/components.css:311-312`), so Today duplicates its tab (`shots/sweep/tablet-light/more.png`).
  - At 901px and up nothing links to More: the rail hides it (`src/styles/design-workspaces.css:12`) and back links are phone-only. Yet the page keeps desktop rows and copy, including a Settings description that promises "saved messages".
  - In dark mode the rows sit on a lighter `--raised` slab with dark gaps, inverting the export's rows on the page with `--surface` bands (`src/styles/mobile-ux.css:127`; compare `shots/export/DarkMore.png`).
- **Verdict: Good, fix details.** The duplication is part of the IA rework.
- **Recommended structure:** Invite people (while available) · Journey · Calendar | band | Settings · Help | band | Appearance · Sign out. Lead connections can stay as the one business shortcut if it shows the held-inquiry count. Fix the 768–900px bands and chevrons, and remove the desktop-only rows.

### 2.7 Settings hub (`shots/sweep/*/settings*.png`)
- **Purpose:** find any setup item fast.
- **Works well:** one list, and each row's description explains its abstract name. Contact stages wording follows D16.
- **Gets in the way:**
  - Eleven flat rows with no groups. The list opens with an optional, advanced feature (Contact stages) while My business, the most common task, is fifth.
  - Four rows leave Settings (the Calendar workspace, Personal preferences and two My account tabs), and none of them comes back to Settings.
  - On phones the descriptions run 2–3 lines, so the hub is 1,510px tall. The first screen shows about 4½ rows at 390px and 4 at 320px, with My business below the fold (`shots/sweep/phone-light/settings-full.png`, `shots/sweep/phone320-light/settings.png`).
  - Chevrons shrink with text length, to about 6px on Contact stages (`lanes/crops/SHL/settings-chevrons.png`).
  - Plan and billing is missing. "Date types" opens a page titled "Saved date types". "Password & sessions" opens a tab named "Security".
  - On phones every page-header description is hidden (`src/styles/mobile-ux.css:21`), so the hub row is the only place a phone owner learns what "Contact stages" or "New contacts" means. Keep the row descriptions, but shorten them.
- **Verdict: Needs rework.**
- **Recommended structure (R1):**
  - **Your business:** My business · Working hours and scheduling (new) · Sending to customers.
  - **People and leads:** New contacts · Lead connections (with held count) · Contact stages · Saved date types.
  - **You:** My account · Notifications · Appearance and shortcuts.
  - **Account:** Plan and billing · Data and privacy · Help.
  - Use 56px rows with one-line descriptions on phones (amend JITM-07 §2.22), and deep-link Calendar connections (`/calendar#calendar-connections`).

### 2.8 My business (`shots/sweep/phone-light/settings-business-full.png`)
- **Purpose:** the business identity that prepared messages use.
- **Works well:** a focused form with flat sections, and a signature preview with fictional Alex before the Save.
- **Gets in the way:**
  - The page opens with an info notice showing a raw "America/New_York" and two cross-links before any business field (`src/app/(app)/settings/business/page.tsx:43`).
  - Each Services row has two inputs with only "Name" and "Value" placeholders and no visible labels. **Only "Value" is ever used in messages** (`src/lib/jump-render.ts:75-78`), so "Name" (e.g. "Service 1") is a dead field. The add button says "Add record", and the move buttons are 38×38 at 834px (`src/components/RepeatableProfileRecords.tsx:11`; `shots/sweep/tablet-light/_results.json`).
  - The single Save sits at the end of a 2,601px page.
- **Verdict: Good, fix details.**
- **Recommended structure:** remove the top notice; timezone belongs on the new Working hours page. Services become one labeled field per service ("Service"), "Add a service" and 44px reorder controls.

### 2.9 Lead connections (`shots/sweep/*/settings-connections*.png`, `shots/overlays/*/settings-connections-open*`, `shots/flow-lead-1-created*.png`)
- **Purpose:** create a lead form or connect a source, and match held inquiries.
- **Works well:** a hosted form needs only a name. The link is copyable, each connection can choose its own New contacts behavior, technical details sit in disclosures, and Import is in the header.
- **Gets in the way:**
  - The H1 "Every inquiry, one place" doesn't match the label the owner tapped (O38).
  - Creating one form takes three cards: "A simple lead form" → "Create a form" jumps to "Create a hosted form". A technical "Add a lead connection" form defaults to the same Shareable lead form.
  - **After "Create shareable form" the page reloads at the top** with "Connection settings saved." and an empty create form. The new link is below the fold (`shots/flow-lead-1-created.png`; `src/lib/intake-actions.ts:41`).
  - **Held inquiries appear only here**, mid-page, under "Needs a person's eye" (SHL-01). Its search and "Search review queue" show even with nothing held, and the placeholder is clipped to "Name, email, phone, or cor".
  - "Find your source" jumps to a disclosure that stays collapsed at the bottom.
  - At 1920px the 1440px archetype makes the form-name input and its button about 1,390px wide (`shots/sweep/desktop-light/settings-connections.png`).
  - The two path cards are vertically offset by about 16px.
  - Known: "customer journey rules" (JITM-05 §6). The same wording also appears at `:50` and `:65`.
- **Verdict: Needs rework.**
- **Recommended structure:**
  - H1 "Lead connections" (page--form width).
  - First, "Your forms and connections": each with link, Copy, inquiry count and Pause.
  - "Create a form" (name + Create) lands on the new form with "Form created. Copy its link below."
  - "Inquiries to match (n)" only when n > 0, also counted on Today.
  - "Connect another tool" as a disclosure holding the technical connector and the source guide.
  - O38 correction: naming Zapier, Make and n8n in interface text is not covered by JITM-04 §2.36, which is about marketing copy. The names help an owner recognize their path, so keep them.

### 2.10 Contact stages (`shots/sweep/phone-light/settings-journey-full.png`, `shots/overlays/phone-light/settings-stages-open-full.png`)
- **Purpose:** optional stage labels and the rules that move people.
- **Works well:** boxed stage records (JITM-08 §2.20) with counts, a rule list, and confirmations before retiring or removing.
- **Gets in the way:**
  - **"Retire empty stage…" is offered on a stage with 36 people** and is refused only after the owner confirms (SHL-08).
  - Four action buttons wrap raggedly on phones.
  - Stage summaries say "No Mix assigned", which collides with the reserved "No Mix" contact label (JITM-05 §2.3).
  - A 90-word rule paragraph closes the page with no gap above it.
  - The hub shows the stages with the Journey route icon (SHL-18).
- **Verdict: Good, fix details.**
- **Recommended structure:** disable Retire, with its reason, while a stage has people. Use one primary button (Save stage) plus a "•••" menu (Move earlier, Move later, Retire). The summary reads "{n} people · Entry Mix: none". Move the long rule text into a "How stages and Mixes work" disclosure.

### 2.11 Saved date types (`shots/sweep/phone-light/settings-date-types-full.png`)
- **Purpose:** name the dates that can start a Mix.
- **Works well:** built-in types shown as chips, and inline create.
- **Gets in the way:** with no custom types, "Manage custom types" still shows a search and a filled "Save active selection" (`src/app/(app)/settings/jump-date-types/page.tsx:69-79`). The heading "+ New custom type" uses a text glyph (JITM-06 §2.21). An unexplained "Mixes" button sits in the header (`:60`). The examples are Title Case. The hub label is "Date types".
- **Verdict: Good, fix details.**
- **Recommended structure:** create first; show search and Save only when custom types exist; drop the header "Mixes" button, or name it "Mixes that use dates".

### 2.12 New contacts (`shots/sweep/phone-light/settings-new-contacts-full.png`)
- **Purpose:** decide where new people go (JITM-09 §2.78).
- **Works well:** a clear three-way choice with the default C. Picking a Mix also selects "Add them to a Mix" (`src/components/NewContactsMixSelect.tsx:8-10`). "Where this applies" explains the scope. Radios are native 13px inside cards of 44px or more, a local fix at `src/styles/product.css:419-422`, so the 13×13 metrics are not target failures.
- **Gets in the way:** the Mix select sits between options B and C and stays visible when "Leave them out" is chosen.
- **Verdict: Good, fix details (minor).**
- **Recommended structure:** nest the Mix select inside the "Add them to a Mix" card.

### 2.13 Notifications (`shots/sweep/phone-light/settings-notifications-full.png`)
- **Purpose:** reminders to the owner.
- **Works well:** three clear blocks, honest unavailable states, and an example email labeled fictional.
- **Gets in the way:**
  - The checkboxes are squeezed: "Morning digest" is 11×13 and "Monday owner report" 8×13. Label and hint run together: "Morning digestA short list…" (SHL-04).
  - "Send me a test reminder" is a second full-width filled button.
  - The footer links read as plain text (known: JITM-10 §6).
  - "Quiet hours come from Journey preferences." uses Journey for working hours (C13).
- **Verdict: Good, fix details.**

### 2.14 Sending to customers (`shots/sweep/phone-light/settings-sending-full.png`, `shots/sweep/laptop-dark/settings-sending.png`)
- **Purpose:** know who sends, and choose automatic sending once it exists.
- **Works well:** the status card says who sends, and "Off during the beta" is honest.
- **Gets in the way:**
  - The whole disabled automation form, about 1,000px on a phone, renders during the beta: master switch, Email and Text cards, review window, 24-hour preview, consent and a faded Save.
  - "Off during the beta" is said three times (`src/app/(app)/settings/sending/page.tsx:28,30,31`).
  - The master and consent checkboxes are squeezed into dots (6×13 and 5×13, down to 4×13 at 320px). Labels run into hints: "automaticallyOff by default", "TextNot available yet", "final tapI have reviewed…", in both themes (`lanes/crops/SHL/sending-checkcards.png`, `sending-consent.png`).
  - Known: JITM-04 §6 "Automatic sending on". It is not reproducible with this data, because the preference is off.
- **Verdict: Needs rework (during the beta).**
- **Recommended structure:** a status card only ("Automatic sending is off during the beta. You review and send every message from Today."), plus a "How automatic sending will work" disclosure holding the disabled form. Show the live form only when a channel is available.

### 2.15 My account: Profile, Security, Data & privacy (`shots/sweep/*/account*.png`, `shots/overlays/*/x-account-*.png`)
- **Purpose:** identity, sign-in security, your data and deleting the account.
- **Works well:**
  - Security lists sessions, with sign-out per session.
  - Export offers a spreadsheet or JSON.
  - Deletion requires the password plus a typed phrase, lists what is removed and uses danger styling. The empty-field attempt is stopped by the browser's own validation (`shots/overlays/phone-light/x-account-delete.png`).
- **Gets in the way:**
  - The Profile tab shows the name read-only, behind an "Edit preferences" button that opens another page.
  - The 4-line "Need to change this email?…" paragraph dominates the card on phones. Its link looks like plain text (known: JITM-10 §6).
  - The "Your data, your choice" card repeats the Data & privacy tab right above it.
  - Plan and billing is a card inside the Profile tab.
  - The NAME, EMAIL and EMAIL STATUS labels are uppercase at weight 800 (SHL-19).
  - The tabs are boxed cards, although the reading archetype should use flat sections (SHL-15).
  - The sticky tab bar sits 8px below the top, so the scrolled heading shows above it (SHL-20).
- **Verdict: Good, fix details.**
- **Recommended structure:** tabs Profile · Sign-in and security · Plan and billing · Data and privacy. On Profile, Name, Locale and Timezone are edited in place (moved from Personal preferences), with a short "Change email" link to Help. Drop "Your data, your choice". Put deletion behind a "Delete account…" button that reveals the existing form, keeping the password and phrase.

### 2.16 Plan and billing (`shots/sweep/phone-light/account-billing-full.png`)
- **Purpose:** what you pay and what you get. Billing is OFF.
- **Works well:** honest beta copy, the three prices and a link to the plans.
- **Gets in the way:** the only way in is the My account card. "See what each plan includes" leaves the app shell for the public `/pricing`.
- **Verdict: Good, fix details.**
- **Recommended structure:** add it to the Settings Account group and the desktop account sheet before billing is turned on.

### 2.17 Personal preferences (`shots/sweep/phone-light/account-preferences-full.png`, crops `lanes/crops/SHL/prefs-phone-*.png`)
- **Purpose (today):** a mix of personal display settings and business-wide scheduling.
- **Works well:** honest copy, a schedule preview, and the shared editor that onboarding and Mega-Mix setup also use. Weekday checkboxes (13×13) sit inside 44px chips, so they pass.
- **Gets in the way:**
  - The page is **4,433px at 390px (4,784px at 320px)** with **five separate filled Save buttons**. Its sections: Make yourself at home → Profile → Phone numbers → Starting Mixes → Quiet-day check-ins → Journey preferences, which is about 43% of the page.
  - It is called personal, yet its sections say "These settings apply to everyone in this workspace" (Quiet-day check-ins). Phone country is owner-only, and working hours and quiet time are workspace preferences.
  - **There are two timezone pickers for the same saved value**, each with its own Save (SHL-05).
  - Save notices render at the very top. The Quiet-day and phone-number saves jump to their section, so the confirmation is off-screen. The others reload at the top and lose the owner's place (SHL-06).
  - The first content is "Review message signatures · Review sending defaults", which looks like a sentence (known styling: JITM-10 §6). These are 20px-tall standalone links (SHL-26).
  - "Make yourself at home" hides "Appearance". On desktop, two appearance switches show on one screen. A keyboard-shortcut setting shows on phones.
  - The back link says "My account" whichever list the owner came from.
- **Verdict: Needs rework.**
- **Recommended structure (R2):**
  - (a) My account → Profile: display name, locale, one timezone.
  - (b) Settings → Working hours and scheduling: working days and hours, preferred follow-up time, quiet time, space around appointments, weekend rule, contact preferences (communication and spacing), phone country, Quiet-day check-ins.
  - (c) Settings → Mixes, or the Mix library: Starting Mixes.
  - (d) Appearance and shortcuts: the rail and More switch, plus the shortcut toggle (desktop only).
  - Each page gets one Save, with an inline "Saved" beside it.

### 2.18 Help (`shots/sweep/*/help*.png`, `shots/overlays/phone-light/help-open-full.png`)
- **Purpose:** a quick answer, or a private message to support.
- **Works well:** a searchable FAQ with a topic filter, a support form with privacy guidance and optional diagnostics, and recent conversations beside it.
- **Gets in the way:**
  - Four buttons come before any content ("Share feedback", "My conversations", "Getting started", "Review my Journey").
  - The primary is "Share feedback", although the More row promises "Get help, report a problem".
  - The FAQ starts with five advanced Journey and Mix questions, and the basics come seventh to twelfth (`src/lib/support-content.ts:37-48`).
  - There are no answers about lead forms, Contact stages, New contacts, invitations or billing.
  - Answers quote UI labels with no marks or links ("choose Customer asked me to get back to them"). Topic labels are uppercase "JOURNEY".
  - For a finished account, "Getting started" opens the onboarding "Setup is complete" page outside the app frame (`src/app/onboarding/page.tsx:20-31`).
  - Three links lead to the same conversation list.
- **Verdict: Good, fix details.**
- **Recommended structure:** header with one primary "Get help" and the "My conversations" link. FAQ basics first, with topic chips instead of a select, and each answer ending in a "Go there" link. Show "Getting started" only while setup is unfinished (JITM-09 §2.63). Drop "Review my Journey".

### 2.19 Support conversations (`shots/sweep/phone-light/account-tickets-full.png`, `shots/sweep/laptop-light/account-tickets.png`)
- **Purpose:** the owner's support threads.
- **Works well:** rows with status pills, the retention notice, and an empty state with an action.
- **Gets in the way:** no back link at the top, only "Back to help" at the bottom (JITM-07 §2.8). "New conversation" and "Ask for help" both open the same form. The policy paragraph comes before the list. The desktop rail highlights My account.
- **Verdict: Good, fix details.**

---

## 3. Findings table

| ID | Rule | Finding | Evidence | Label | Severity | Fix direction |
|---|---|---|---|---|---|---|
| SHL-01 | JITM-09 §2.25 (Needs your input holds owner decisions); none — gap for intake | A lead inquiry whose details match several contacts, or an archived one, is held (no contact, no follow-up). The only place it appears is Settings → Lead connections → "Needs a person's eye". Today, Contacts, More and Settings show no count, so a returning customer's inquiry can wait unseen. | `src/lib/intake.ts:84-87`; `src/app/(app)/settings/connections/page.tsx:65`; no intake reference in `src/app/(app)/jumps/page.tsx` (grep) | VERIFIED-CODE (runtime with a held inquiry NOT RUN) | HIGH | Add "Inquiries to match (n)" to Today's Needs your input, linking to `#needs-review`; badge the Lead connections rows (Kevin: §2.25 list) |
| SHL-02 | JITM-07 §2.8; JITM-10 §2.15; gap (several parents) | Back links and current markers point to parents the owner didn't come from. Personal preferences → "My account" from More, Settings or My account. Notifications and Lead connections → "Settings" when opened from More. Settings → Password & sessions lands in My account, whose back link is "More". `/account/preferences` and `/account/tickets` highlight My account in the rail. | `src/app/(app)/account/preferences/page.tsx:50`; `src/app/(app)/settings/notifications/page.tsx:31`; `src/app/(app)/settings/connections/page.tsx:41`; `src/components/Nav.tsx:28`; `shots/sweep/laptop-light/account-preferences.png`, `account-tickets.png` | VERIFIED-CODE, VERIFIED-RUNTIME | MEDIUM | Give each page one parent (R1). Until then, Personal preferences → Settings and tickets → Help, both in the back link and the rail marker |
| SHL-03 | JITM-04 §2.7 | After "Create shareable form" the page reloads at the top with "Connection settings saved." and an empty create form. The new form's link and Copy are below the fold, which invites a duplicate form. | `shots/flow-lead-1-created.png`; `src/lib/intake-actions.ts:41`; `src/app/(app)/settings/connections/page.tsx:42` | VERIFIED-RUNTIME | MEDIUM | Redirect to `#connection-<id>` with the card open; notice "Form created. Copy its link below." |
| SHL-04 | JITM-06 §2.31; JITM-10 §2.5 | The shared `.checkbox-card` lets native checkboxes shrink to 4–11px-wide dots: Sending master 6×13 and consent 5×13 (4×13 at 320px), Notifications 11×13 and 8×13, preferences "Keep follow-up reminders clear…" 7×13. `<strong>` and `<small>` run together ("automaticallyOff by default", "TextNot available yet", "Morning digestA short list…"). It was fixed locally twice instead of where it is defined. Targets still pass (labels are 44px or more); the defect is visual and hits the consent control. | `lanes/crops/SHL/sending-checkcards.png`, `sending-consent.png`; `shots/sweep/phone-light/settings-notifications-full.png`; `shots/sweep/laptop-dark/settings-sending.png`; `src/styles/base.css:170-171` vs `src/styles/product.css:419-422`, `src/styles/auth.css:79-82` | VERIFIED-RUNTIME, VERIFIED-CODE | MEDIUM | Fix the owner rule: `input{flex:none;width:20px;height:20px}`, strong and small as blocks; remove the per-page patches |
| SHL-05 | none — gap (JITM-08 §2.28 picker reference) | Personal preferences shows two timezone pickers ("Personal timezone" in Profile, "Timezone" in Journey preferences). Both write `userPreference.timezone`, and each has its own Save, so one save can silently undo the other. | `src/app/(app)/account/preferences/page.tsx:54,62`; `src/components/JourneyPreferenceFields.tsx:20`; `src/lib/account-preference-actions.ts:49`; `src/lib/journey-preference-service.ts:12`; `lanes/crops/SHL/prefs-weekdays.png` | VERIFIED-CODE, VERIFIED-RUNTIME | MEDIUM | One timezone control (My account → Profile); the scheduling page shows it read-only with a link |
| SHL-06 | JITM-04 §2.7; JITM-08 §2.23 | Save confirmations render at the top of a 4,433px page. The Quiet-day and phone-number saves redirect to `#quiet-days` and `#phone-region`, so the confirmation is off-screen. The scheduling, activation and Journey saves reload at the top and lose the owner's place. | `src/app/(app)/account/preferences/page.tsx:43-49`; `src/lib/account-preference-actions.ts:76,93,109,126,135`; `src/lib/mega-mix-actions.ts:70` | VERIFIED-CODE (post-save capture NOT RUN) | MEDIUM | Show "Saved" beside the section's button, or render the notice inside the saved section; one Save per page after R2 |
| SHL-07 | none — gap (JITM-09 §2.65 codifies the placement) | Business-wide settings live under "Personal preferences": phone country (owner-only), Quiet-day check-ins ("These settings apply to everyone in this workspace"), working days and hours, quiet time, appointment space. The page is 4,433px at 390px with five filled Save buttons. Owners look for hours in My business or Settings. | `src/app/(app)/account/preferences/page.tsx:56,60,62-64`; `shots/sweep/phone-light/account-preferences-full.png` | VERIFIED-CODE, VERIFIED-RUNTIME | MEDIUM | R2: a Settings page "Working hours and scheduling"; Kevin decision |
| SHL-08 | JITM-08 §2.6 | "Retire empty stage…" is enabled on stages with people (Inquiry · 36 people). The confirmation opens, then the server refuses: "Move the people in this stage before retiring it." | `shots/overlays/phone-light/settings-stages-open-full.png` (`lanes/crops/SHL/stages-open-1.png`); `src/app/(app)/settings/journey/page.tsx:29`; `src/lib/journey-actions.ts:59` | VERIFIED-RUNTIME, VERIFIED-CODE | MEDIUM | Disable it, with visible text "Move the 36 people in this stage first." |
| SHL-09 | JITM-07 §2.22; JITM-09 §2.6; JITM-06 §2.22 | **Settings** is ungrouped, with 2–3-line descriptions on phones (1,510px; 4 rows on the first screen at 320px), and its chevrons shrink to about 4–6px. The compact-list rules are scoped to `.more-page` only. **More at 768–900px** loses its bands and chevrons and shows the "desktop-only" Today and Ready-made Mixes rows. | `shots/sweep/phone-light/settings-full.png`; `lanes/crops/SHL/settings-chevrons.png`; `shots/sweep/phone320-light/settings.png`; `shots/sweep/tablet-light/more.png`; `src/styles/design-system.css:150-159`; `src/styles/components.css:309-313` | VERIFIED-RUNTIME, VERIFIED-CODE | MEDIUM | Group Settings (R1) with one-line descriptions (amend §2.22); `flex:none` on chevrons; apply More's ≤900 rules at 768–900 and hide `desktop-only` up to 900px |
| SHL-10 | JITM-10 §2.14; JITM-10 §2.1 | My business Services rows have two unlabeled inputs ("Name" and "Value" placeholders only). "Name" is never used in messages: only each value fills `{{My Product 1–5}}`. The button says "Add record". The move buttons are 38×38 at 834px. | `src/components/RepeatableProfileRecords.tsx:11`; `src/lib/workspace-profile-actions.ts:63-67`; `src/lib/jump-render.ts:75-78,106-110`; `shots/sweep/phone-light/settings-business-full.png`; `shots/sweep/tablet-light/_results.json` (`38x38:button:"Move Service 1 up"`) | VERIFIED-CODE, VERIFIED-RUNTIME | MEDIUM | One labeled "Service" field per row; "Add a service"; 44px reorder controls |
| SHL-11 | JITM-01 §2.11–§2.12, JITM-04 §2.1 (tension with JITM-09 §2.9, §2.24, which it conforms to) | Up to three invitation prompts show at once (834px: header gift + Today strip + More badge). The Today strip's filled "Invite people" outranks the overdue work above which it sits, and it appears on a brand-new owner's first Today. The More badge is a permanent allowance count that reads like unread work (O1, O37). | `shots/sweep/tablet-light/today.png`; `shots/sweep/phone-light/today.png`; `shots/probe-today-laptop-light.png`; `shots/flow-onb-5-today-welcome.png`; `src/app/(app)/jumps/page.tsx:495`; `src/components/AppShell.tsx:49,81,95` | VERIFIED-RUNTIME | MEDIUM | R5; Kevin decision |
| SHL-12 | none — gap (JITM-09 §2.65 says only that My account links to it) | Plan and billing is reachable only from a card on My account → Profile. It is not in Settings, More, the rail or the Profile sheet. | `src/app/(app)/account/page.tsx:61`; `src/app/(app)/settings/page.tsx:10-22`; `src/app/(app)/more/page.tsx:12-21`; `src/components/AppShell.tsx:65-71` | VERIFIED-CODE | LOW (MEDIUM once billing is on) | Add it to the Settings Account group and the desktop account sheet |
| SHL-13 | none — gap (JITM-07 §2.4 codifies the sheet) | On desktop, Sign out exists only inside the "Profile" modal. Five of the sheet's six rows repeat links already visible in the rail (My account, Settings, Help, Invite) or the retired Ready-made entry (B-19). The sheet shows no profile information. | `shots/overlays/laptop-light/profile-sheet.png`; `src/components/AppShell.tsx:59-73` | VERIFIED-RUNTIME | LOW | R1 account control: name, My account, Plan and billing, Sign out |
| SHL-14 | JITM-06 §2.27; JITM-06 §2.23 | Compact rail (901–1279px): no appearance switch (dark mode only via Settings → Personal preferences). "Profile" breaks as "Profil/e". The My account link and the Profile button use the same person icon. | `shots/sweep/tabletLand-light/today.png`; `lanes/crops/SHL/compact-rail-footer.png`; `src/styles/design-workspaces.css:205,210` | VERIFIED-RUNTIME, VERIFIED-CODE | LOW | Icon-only switch in the rail; no `overflow-wrap:anywhere` on one-word labels; one account control |
| SHL-15 | JITM-07 §2.10, §2.23, §4 | The settings-family pages use three looks. Contact stages, Lead connections and Saved date types use the 1440px workspace `.page` (a 1,390px-wide input and button at 1920px). My account, Help and Support keep boxed cards, although reading pages should use flat sections; only `page--form` is flattened. | `shots/sweep/desktop-light/settings-connections.png`; `src/app/(app)/settings/journey/page.tsx:24`; `src/app/(app)/settings/connections/page.tsx:41`; `src/app/(app)/settings/jump-date-types/page.tsx:51`; `src/styles/design-workspaces.css:27` | VERIFIED-RUNTIME, VERIFIED-CODE | LOW | `page--form` for settings pages; flatten `page--content` cards |
| SHL-16 | JITM-08 §2.6 (applied to a whole form); JITM-04 §2.1 | Sending to customers renders the full disabled automation form during the beta (about 1,000px on a phone) and says "off during the beta" three times. | `shots/sweep/phone-light/settings-sending-full.png`; `src/app/(app)/settings/sending/page.tsx:28-41` | VERIFIED-RUNTIME | LOW | Status card plus a "How automatic sending will work" disclosure |
| SHL-17 | none — gap | Lead connections takes three cards to create one form. "Find your source" jumps to a disclosure that stays collapsed. A technical form defaults to the same hosted form. The held-inquiry search shows with zero items and a clipped placeholder ("…or cor"). The two path cards are offset by about 16px. | `src/app/(app)/settings/connections/page.tsx:43-44,65,67`; `shots/sweep/phone-light/settings-connections-full.png`; `shots/sweep/laptop-light/settings-connections.png` | VERIFIED-RUNTIME | LOW | §2.9 structure |
| SHL-18 | JITM-06 §2.23; JITM-09 §2.7 | Reused icons mislabel rows: Contact stages uses the Journey route icon (D16 keeps stages apart from Journey), Date types reuses the Calendar destination icon, and the Profile sheet's Ready-made Mixes uses the import icon (More uses the Mixes icon). | `src/app/(app)/settings/page.tsx:11,14,19`; `src/components/AppShell.tsx:68`; `src/app/(app)/more/page.tsx:28` | VERIFIED-CODE | LOW | Distinct glyphs added to `AppIcon` (e.g. tag-like for stages, calendar-date for date types) |
| SHL-19 | JITM-06 §2.16, §2.14 | Capital, weight-800 labels: My account's "NAME / EMAIL / EMAIL STATUS" and Help's topic tag "JOURNEY". | `shots/sweep/phone-light/account-full.png`; `lanes/crops/SHL/help-open-1.png`; `src/styles/auth.css:43`; `src/styles/support.css:41` | VERIFIED-RUNTIME | LOW | Sentence case, weight 600 |
| SHL-20 | none — gap (polish) | My account's sticky section tabs sit at `top: 8px`, so scrolled content (the "Permanently delete account" heading) shows in the gap above them, in both themes. | `shots/overlays/phone-light/x-account-delete.png`; `shots/overlays/phone-dark/x-account-delete.png`; `src/styles/components.css:179` | VERIFIED-RUNTIME | LOW | `top: 0` with a page-colored background, or not sticky on phones |
| SHL-21 | JITM-07 §2.8 | Support conversations has no back link at the top, only a "Back to help" button at the bottom. The empty state has two buttons to the same form, and the policy paragraph comes first. | `src/app/(app)/account/tickets/page.tsx:27-34`; `shots/sweep/phone-light/account-tickets-full.png` | VERIFIED-RUNTIME | LOW | `BackLink` to Help; one CTA; policy below the list |
| SHL-22 | JITM-09 §2.63; JITM-04 §2.1 | Help's "Getting started" sends a finished account to onboarding's "Setup is complete" page, outside the app frame. The FAQ opens with five advanced questions, has no answers on lead forms, stages, New contacts, invitations or billing, and its answers quote UI labels with no marks or links. | `src/app/(app)/help/page.tsx:76`; `src/app/onboarding/page.tsx:20-31`; `src/lib/support-content.ts:37-56`; `shots/sweep/laptop-light/help-full.png` | VERIFIED-CODE, VERIFIED-RUNTIME | LOW | Show "Getting started" only while setup is unfinished; basics first; quoted labels plus "Go there" links; add the missing answers |
| SHL-23 | JITM-10 §2.2 | Meaningful rail text below 13px: "Signed in as {name}" at 12.8px and "Share free access with people you know" at 12px. | `shots/sweep/laptop-light/_results.json` (`12.8px span.user-label`, `12px small`); `src/styles/base.css:194`; `src/styles/design-workspaces.css:422` | VERIFIED-RUNTIME (metrics) | LOW | 13px, or fold into the account control |
| SHL-24 | JITM-10 §2.14 | The tablet header's initial button shows "D" but its name is "More", and it duplicates the More tab while looking like an account avatar. | `src/components/AppShell.tsx:81`; `shots/sweep/tablet-light/today.png` | VERIFIED-CODE, VERIFIED-RUNTIME | LOW | Remove with the header (R10), or name it "More, Demo Owner" |
| SHL-25 | JITM-08 §2.32; JITM-06 §2.21 | Saved date types with no custom types still shows a search and a filled "Save active selection". It uses a "+" text glyph in a heading and an unexplained header "Mixes" button. | `shots/sweep/phone-light/settings-date-types-full.png`; `src/app/(app)/settings/jump-date-types/page.tsx:60,64,69-79` | VERIFIED-RUNTIME | LOW | §2.11 structure |
| SHL-26 | JITM-10 §2.1 (link styling known: JITM-10 §6) | Standalone link rows (not inside a sentence) are 20px tall at 900px and below: "Review message signatures · Review sending defaults" (Personal preferences) and "Timezone and scheduling · Sending defaults" (My business). They also look like plain text. | `shots/sweep/phone-light/_results.json` (`206x20:a`, `191x20:a`); `lanes/crops/SHL/prefs-phone-0.png` | VERIFIED-RUNTIME | LOW | Remove them (R2 makes them unnecessary), or make them 44px link rows |
| SHL-27 | JITM-06 §2.33, §2.9 | Dark More: rows sit on a lighter `--raised` slab with dark gaps, inverting the export's rows on the page with `--surface` bands. | `shots/sweep/phone-dark/more.png` vs `shots/export/DarkMore.png`; `src/styles/mobile-ux.css:127` | VERIFIED-RUNTIME | LOW | Rows on `--page`, bands on `--surface` |
| SHL-28 | none — gap (H1 ≠ the label clicked); JITM-04 §2.3 | Page titles don't match the entry that opened them: "Lead connections" → "Every inquiry, one place"; "Date types" → "Saved date types"; "Password & sessions" → My account's "Security" tab; "Ready-made Mixes" → a page titled "Mixes"; Help "Getting started" → "Setup is complete". | `src/app/(app)/settings/connections/page.tsx:41`; `src/app/(app)/settings/page.tsx:19-20`; `shots/sweep/phone-light/_results.json` (`templates` h1 "Mixes") | VERIFIED-CODE, VERIFIED-RUNTIME | LOW | Make the label and the H1 identical (copy C01, C08, C09) |

Re-confirmed known items (not new): inline links with no underline (JITM-10 §6) on Personal preferences, My account, Notifications and Sending; "customer journey rules" (JITM-05 §6), plus two more "journey rules" strings at `src/app/(app)/settings/connections/page.tsx:50,65`; Ready-made Mixes entries in More and the Profile sheet (B-19); the portrait-tablet header (JITM-07 §6); the Quick Add bubble size (JITM-07 §6). The JITM-04 §6 "Automatic sending on" status was not reproducible here because the preference is off.

---

## 4. Copy findings

| ID | Current string (exact) | Where | What's wrong | Proposed |
|---|---|---|---|---|
| C01 | "Every inquiry, one place" | `src/app/(app)/settings/connections/page.tsx:41` | H1 differs from the nav and Settings label "Lead connections" (O38); a slogan where wayfinding needs the literal name (JITM-04 §2.3) | H1 "Lead connections"; supporting line "Bring every inquiry into one place." |
| C02 | "Search review queue" | `src/app/(app)/settings/connections/page.tsx:65` | "queue" is an implementation word (JITM-05 §2.11; JITM-04 §2.6) (O38) | "Search held inquiries" |
| C03 | "Needs a person’s eye" … "we hold the inquiry here." | `src/app/(app)/settings/connections/page.tsx:65` | Vague heading; the app speaks as "we" (JITM-04 §2.5, "you" for interface) | "Inquiries to match" · "When the details match more than one person or an archived contact, the inquiry waits here until you choose." |
| C04 | "Connection settings saved." (after creating a form) | `src/app/(app)/settings/connections/page.tsx:42` with `src/lib/intake-actions.ts:41` | Doesn't name what happened (JITM-04 §2.7) | "Form created. Copy its link below." |
| C05 | "Trusted sources can also record … to run your journey rules." / "Accepting this inquiry applies your matching journey rules." | `src/app/(app)/settings/connections/page.tsx:50,65` | Same D4/D16 deviation as the known "customer journey rules" (JITM-05 §6) | "…to apply your Contact stage rules." / "Accepting this inquiry applies your Contact stage rules." |
| C06 | "Your phone’s contact picker is in Contacts → More." | `src/app/(app)/settings/connections/page.tsx:67` | "More" here means the Contacts "•••" tools, not the More tab | "To add people from your phone: Contacts → ••• → Add from your phone." |
| C07 | "Business details, saved messages, dates, and personal preferences." | `src/app/(app)/more/page.tsx:16` | Settings has no saved messages, so the description promises a page that doesn't exist | "Your business, new contacts, lead forms, sending and dates." |
| C08 | "Date types" | `src/app/(app)/settings/page.tsx:19` | Opens "Saved date types"; the glossary term is "saved date" (JITM-05 §2.3) | "Saved date types" |
| C09 | "Password & sessions" | `src/app/(app)/settings/page.tsx:20` | Opens a tab named "Security" | Name both "Password and sessions" (or both "Sign-in and security") |
| C10 | "Edit preferences" | `src/app/(app)/account/page.tsx:61` | Shown beside Name and Email; the owner wants to edit their name | "Edit name and timezone" (until R2 makes them editable in place) |
| C11 | "Your data, your choice" / "Manage personal data" | `src/app/(app)/account/page.tsx:61` | Repeats the Data & privacy tab directly above | Remove the card |
| C12 | "Make yourself at home" | `src/app/(app)/account/preferences/page.tsx:53` | The heading hides its contents (Appearance, keyboard shortcut); the page already has other expressive headings (JITM-04 §2.2) | "Appearance and shortcuts" |
| C13 | "Journey preferences" (heading, the "Journey preferences saved. …" notice and "Add working hours and journey preferences") | `src/app/(app)/account/preferences/page.tsx:43,62,64` | Journey is the map of connected Mixes (JITM-05 §2.2; JITM-09 §2.7); these are working hours and contact preferences. JITM-09 §2.65 uses the term too (§6) | "Working hours and contact preferences" (Kevin: standard wording) |
| C14 | "Quiet hours come from Journey preferences." | `src/app/(app)/settings/notifications/page.tsx:39` | Same as C13; the link looks like plain text | "Quiet hours are set in Working hours and contact preferences." |
| C15 | "Automatic sending is off during the beta." ×3 (status card, header pill "Off during the beta", notice) | `src/app/(app)/settings/sending/page.tsx:28,30,31` | Says one fact three times on one screen | One status line: "Automatic sending is off during the beta. You review and send every message from Today." |
| C16 | "Only the previous stage’s managed Mix is stopped when someone moves on. … not one started by a tag, Everyone, a visit or Journey." (about 90 words) | `src/app/(app)/settings/journey/page.tsx:34` | A rule dump in one paragraph (JITM-04 §2.1 short sentences) | "Moving to a new stage stops only the previous stage’s own Mix. Other Mixes, manual stops and Do not contact stay as they are." The rest goes in a "How stages and Mixes work" disclosure |
| C17 | "No Mix assigned" | `src/app/(app)/settings/journey/page.tsx:28` | Collides with the reserved contact label "No Mix" (JITM-05 §2.3) | "Entry Mix: none" |
| C18 | "Retire empty stage…" (on a stage with people) | `src/app/(app)/settings/journey/page.tsx:29` | Offers an action that will be refused (JITM-04 §2.14) | Disabled, with "Move the 36 people in this stage first." |
| C19 | "…including contacts, notes, dates, plans, and follow-up history." | `src/components/AccountExport.tsx:18` | "plans" is retired for Mixes (JITM-05 §2.10) | "…contacts, notes, saved dates, Mixes and follow-up history." |
| C20 | "Share feedback" (primary) / "Share feedback or get help" / "Send feedback" | `src/app/(app)/help/page.tsx:70,81,84` | Someone stuck needs help; More promises "Get help, report a problem" | "Get help" / "Get help or share feedback" / "Send message" |
| C21 | "In that person’s work, choose Customer asked me to get back to them, enter the date, time and timezone, and review the update. …" | `src/lib/support-content.ts:38` | UI labels unquoted, so the sentence is hard to parse (JITM-04 §2.1) | "On the person’s page, open “Record an update or choose a callback date” and choose “Customer asked me to get back to them”. Enter the date and time, then review the update." |
| C22 | "Files are read in your browser, then reviewed rows are sent in small signed-in batches." | `src/lib/support-content.ts:54` | Explains implementation (JITM-04 §2.6) | "Your file is checked in your browser first. You review every row and possible duplicate before anything is saved, and the import keeps going if you close the page." |
| C23 | "Timezone: America/New_York · You review and send." | `src/app/(app)/settings/business/page.tsx:43` | Raw IANA id (JITM-04 §2.1); off-topic at the top of My business | Remove it here; on the scheduling page: "Times use New York time (Eastern)." |
| C24 | "Add record"; placeholders "Name" / "Value" | `src/components/RepeatableProfileRecords.tsx:11` | Developer wording; labels by placeholder only (JITM-10 §2.14) | Label "Service"; "Add a service" |
| C25 | "+ New custom type" / "Examples: Policy Renewal, Closing Anniversary, Program Start, or Warranty Expiration." | `src/app/(app)/settings/jump-date-types/page.tsx:64` | A glyph used as an icon (JITM-06 §2.21); Title Case (JITM-04 §2.4) | "New date type" / "For example: warranty ends, policy renewal, move-in day." |
| C26 | "Send us a question and keep the conversation here." + "Ask for help" + "New conversation" | `src/app/(app)/account/tickets/page.tsx:27,32` | Two buttons to the same form | Keep "New conversation" only; empty line "No conversations yet. Ask a question and the replies stay here." |
| C27 | "Meetings, availability, and calendar connections." (Settings row) | `src/app/(app)/settings/page.tsx:14` | Promises connections but lands on the agenda | Keep the text; link the row to `/calendar#calendar-connections` with the panel open |

---

## 5. Structural recommendations (ranked)

| # | Specific problem (D20) | Change | Expected benefit | Effort | Kevin? |
|---|---|---|---|---|---|
| R1 | The same settings appear in up to four lists; back links and rail markers send owners to parents they never visited (SHL-02); desktop Sign out is buried (SHL-13); billing has one way in (SHL-12) | **One grouped Settings hub** (Your business · People and leads · You · Account, §2.7). **More** = Invite (while available) · Journey · Calendar · Settings · Help · Appearance · Sign out. **Desktop rail footer** = Settings · Help · one account control with the owner's name (sheet: name and email, My account, Plan and billing, Sign out), replacing "Signed in as", the Profile button and the My account link. Each page has one parent for its back link and marker. | About 10 duplicate entries gone; every back link is right; Sign out and billing findable; a calmer rail | M–L | Yes: JITM-09 §2.4, §2.6, §2.7; JITM-07 §2.4 |
| R2 | Personal preferences is 4,433px, mixes personal and business settings, has two timezone pickers and five Saves, and its confirmations land off-screen (SHL-05/06/07) | Split it: My account → Profile (name, locale, one timezone, edited in place); Settings → **Working hours and scheduling** (working days and hours, preferred time, quiet time, appointment space, weekend rule, contact preferences, phone country, Quiet-day check-ins); Starting Mixes → Mixes settings; Appearance and shortcuts. One Save per page, with an inline "Saved". | Hours found where owners look; no conflicting saves; phone pages under about 1,500px | M | Yes: JITM-09 §2.65 |
| R3 | Held inquiries are invisible outside Settings (SHL-01) | Today → Needs your input: "{n} inquiries need a match" → `/settings/connections#needs-review`; the same count on the Lead connections row | No lead waits unseen | S–M | Yes: the JITM-09 §2.25 list |
| R4 | Creating a lead form is indirect and ends on an empty form (SHL-03, SHL-17); the H1 doesn't match (C01) | Lead connections: H1 "Lead connections"; the list of forms and connections first; Create → lands on the new form card ("Form created. Copy its link below."); "Inquiries to match" only when n > 0; one "Connect another tool" disclosure for technical connectors and the source guide; `page--form` width | Form link in hand in one step; shorter page | S–M | No (C01 is copy) |
| R5 | Invitation prompts crowd Today and first-run (SHL-11) | Keep the desktop rail callout and the phone More row. Show the Today strip only after the first recorded outcome, below the due sections, dismissible. Drop the More badge and the tablet header gift. | Today leads with work; first-run focuses on the first follow-up | S | Yes: JITM-09 §2.9, §2.24 (2026-09-27 owner decision) |
| R6 | The compact rail loses the appearance switch, breaks "Profile" and doubles the person icon (SHL-14) | An icon-only appearance switch under Help; the account control from R1 as an initial avatar; no mid-word wrapping | Dark mode reachable at 901–1279px; a clean footer | S | No |
| R7 | Squeezed checkboxes and run-together labels on three pages, including consent (SHL-04) | Fix `.checkbox-card` where it is defined (`src/styles/base.css:170-171`); remove the local patches | Checkboxes visible; labels readable | S | No |
| R8 | Settings is ungrouped and long on phones; More breaks at 768–900px (SHL-09) | Grouped Settings with one-line descriptions on phones (amend JITM-07 §2.22, since descriptions carry meaning there); More's ≤900 rules applied at 768–900; `desktop-only` hidden up to 900px | Hub on about 1½ phone screens, with My business in view | S | Yes, to amend JITM-07 §2.22 |
| R9 | The Sending page shows a disabled form during the beta (SHL-16) | Status card plus a "How automatic sending will work" disclosure; the form only when a channel exists | Clear and short; less "can I turn this on?" | S | Confirm the wording (it touches known JITM-04 §6) |
| R10 | The 768–900px header costs 64px and duplicates More and the invitations (SHL-24; JITM-07 §6 open) | Remove the header, as in the export's `TabletToday` | More content per screen; one fewer duplicate | S | Yes (open decision) |

---

## 6. Documents that disagree, and gaps

**Documents that disagree with the code or the export:**
1. JITM-09 §2.3 says "Desktop rails show all six". The code hides More in every rail (`src/styles/design-workspaces.css:12`), and the export's `DesktopToday` rail has no More either. Desktop has no link to `/more` at all.
2. JITM-09 §2.6 says Today and Ready-made mixes appear "on desktop only". `.desktop-only` hides only at ≤767px (`src/styles/components.css:311-312`), so these rows show on 768–900px tablets, where Today is already in the tab bar. Meanwhile desktop users never reach More.
3. JITM-07 §2.22 says Settings has 56px rows, grouping and hidden descriptions at ≤900px. Those rules are scoped to `.more-page` (`src/styles/design-system.css:150-159`), and Settings is ungrouped (`src/app/(app)/settings/page.tsx:10-22`). More also loses its bands and chevrons at 768–900px. Recommended: amend §2.22 for Settings, keeping one-line descriptions, because phone page headers hide their descriptions (`src/styles/mobile-ux.css:21`).
4. JITM-07 §2.23 says reading pages use flat sections. Only `page--form` is flattened (`src/styles/design-workspaces.css:27`), so My account, Help and Support stay boxed. JITM-07 §4 says settings pages use `page--form`, but Contact stages, Lead connections and Saved date types use `.page`.
5. JITM-06 §2.27 says the compact appearance switch sits in the rail. The 901–1279px rail hides it (`src/styles/design-workspaces.css:205`), and JITM-07 §2.5 is silent.
6. JITM-09 §2.65 names "Journey preferences" (working hours, contact preferences), while JITM-05 §2.2 and JITM-09 §2.7 reserve "Journey" for connected Mixes and Beats. §2.65 also puts a "profile" on both My account and Personal preferences, which writes the duplication into the standard.
7. JITM-09 §2.9 and §2.24 require six invitation placements, with the Today strip above Overdue. That pulls against JITM-01 §2.11 (daily work from Today), JITM-01 §2.12 (the first-run promise) and JITM-04 §2.1 (calm, no pressure). Kevin should weigh them (R5).
8. O38 needs a correction: JITM-04 §2.36 (describe products by category) covers marketing copy, not interface text, so the Zapier, Make and n8n mention on Lead connections does not violate it.

**Gaps where no rule exists:**
- Which back link and current marker a page shows when several hubs link to it (More, Settings, My account).
- Owner-action items outside Today, such as held inquiries, having to surface on Today.
- A page's H1 matching the label of the entry that opened it.
- Where Plan and billing and the desktop Sign out appear in navigation.
- Where a save confirmation goes on a long page with several forms (beside the saved section, not the top).
- What a navigation badge may count: work to do, versus an allowance such as invitations left.

---

## 7. Captures needed / NOT RUN

- **Held inquiry (SHL-01):** NOT RUN. The demo has none. Steps: submit the public lead form (`/lead/<id>`) with an email that matches two contacts, or an archived one, then capture `/settings/connections#needs-review` at 390 and 1440. Also check what "Ignore inquiry" does and whether it needs a confirmation.
- **After saving Personal preferences (SHL-06):** NOT RUN. Steps: at 390, tick "Suggest check-ins after quiet days" → "Save check-in preferences", then capture the landing viewport. Repeat with "Review change" → "Use …" for phone numbers, and with "Save journey preferences".
- **Account deletion with valid entries:** NOT RUN (destructive). Only the empty-field validation was captured.
- **A 600px-high laptop (1440×600)** for JITM-07 §2.7, and **480px-high** screens for the sticky account tabs: NOT RUN.
- **200% text** on More, Settings, My account and Personal preferences (JITM-10 §2.3): NOT RUN.
- **Keyboard order and focus return** through the rail, account links, Appearance and the Profile sheet: NOT RUN.
- **Help → "Getting started"** for the demo owner (the onboarding "Setup is complete" page outside the shell) at 390: NOT RUN (VERIFIED-CODE only).
- **Sending with the automation preference saved ON** and no channel (the known JITM-04 §6 status): NOT RUN, because the data has it off.
- **A support conversation detail page** (`/account/tickets/[id]`): not captured, because there are no tickets.
- **The Profile sheet at 901–1279px and in dark mode; the view-only support session frame:** not captured.
- **Physical devices and assistive technology:** NOT RUN (JITM-10 §6).
