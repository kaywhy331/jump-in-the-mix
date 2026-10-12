> Lane report STF (Staff console) of the [UX, design and layout audit](../../UX_DESIGN_AUDIT_2026-10-08.md), 2026-10-08, commit `f23db11`. Written read-only by a review lane and consolidated by the lead auditor. Paths under `<captures>/` refer to the private local capture set (not committed; see [README](../README.md)); a selection is in [`../captures/`](../captures/). Severity adjustments made at consolidation are listed in [FINDINGS.md](../FINDINGS.md).

# STF — Staff console (`/admin/…`) UX / design / layout audit

Audited commit `f23db11` (worktree the repository). Screenshot paths are relative to `<captures>` (`<captures>`). Evidence crops: `lanes/crops/STF/*.png`. Code cited as repo-relative `src/...:line`.

**Capture-size caveat.** The desktop sweep is 1440×900. JITM-07 §2.14 sets its acceptance at **1366×768**, so "fits on the first screen" claims below hold at 1440×900. Where the extra 132px of height matters, the finding says so and is labelled INFERRED. The data is a synthetic local database: 1 staff owner, 2 customer accounts, 40 library Mixes, no tickets, no waitlist entries, no reports, no failed jobs. Most queues were captured empty, so queue-with-data layouts are listed under §7.

---

## 1. Lane summary

**Verdict: on desktop the staff console is close to optimal but not yet there. On phone it falls below the standards' floors.** The structure is right for a one-person operator: 8 sidebar groups, area tabs, compact queues, drafts preserved through MFA, and reason or password gates on risky changes. The 2026-09-16 audit's big items are fixed (support pagination and views, the roster-first Team page, Library options and Admission moved into their areas, "Invitation wording"). What still costs Kevin time and trust is narrower:

1. **The Overview is not the weekly cockpit.** It never shows Marketplace community reports. It spends its first third on two timestamps, a definitions sentence and tile footnotes. Quick actions and two bottom cards repeat the sidebar. It says "Next wave: Oct 15" two rows below "New customer invitations are blocked" (STF-01, STF-09, STF-18).
2. **Pages have two or three names, and in-group shortcuts duplicate the tabs.** Examples: "Customers" opens "Users", "Settings" opens "Team", "Alerts" opens "Operational alerts" plus a "Background operations" button (STF-04, STF-05).
3. **Several states mislead.** Empty queues blame filters that aren't set. Every clean library Mix opens with "1 item(s) need review". The invitation-wording editor shows a stored "five personal invitations" that a hidden render-time replacement turns into "three" for members (STF-02, STF-03, STF-13).
4. **The phone staff shell breaks JITM-10 §2.1 and §2.2.** Header links are 72×17 and text drops to 9–12px. Two stale CSS overrides squeeze the Overview tiles into 3 columns and trap Library options in a 300px scroll box. About 165–250px of chrome sits above each H1 (STF-06, STF-07, STF-08, STF-27).

**Most valuable changes:**
- (a) Rebuild Overview as one ordered "This week" queue covering every weekly job, zero states included.
- (b) One name per page, and delete in-group duplicate shortcuts.
- (c) Bring the phone shell up to the 44px and 13px floors and remove the conflicting CSS.
- (d) Fix the misleading states and publish corrected invitation wording.
- (e) Put the next-wave time and worker freshness in the Waitlist status line.

---

## 2. Page and overlay verdicts

### 2.0 Console navigation and Kevin's weekly jobs (cross-page)

**Purpose.** One operator moves between six recurring jobs with as few hops as possible and never misses waiting work.

**Click paths, inferred from `src/lib/admin-navigation.ts:5-14` and the captures:**

| Weekly job | Signal on Overview today | Path | Assessment |
|---|---|---|---|
| Admit waitlist waves | "Confirmed waiting" tile, a "blocked" attention row, and a "Customer invitations · Next wave" card at the bottom | Access lands on Waitlist; select → reason → Review → Confirm | Workable. The wave time, worker check-in and pause control sit in the collapsed "Wave schedule" disclosure (STF-17). |
| Review Marketplace reports | **None** (STF-01) | Content lands on Ready-made Mixes → "Community reports" tab | Two clicks just to learn whether anything waits. Moderation needs `mixes.publish`, as JITM-09 §2.70 requires. |
| Answer support | "Support is waiting on a reply" row (only when >0) | Support lands on Needs reply | Good. Empty state wrong (STF-03). For a solo operator, assigning to self needs a 10-character reason (INFERRED, §5 R8). |
| Check operations and alerts | Monitor-stale, alerts and failed-jobs rows | Operations has 6 tabs (Operations / Alerts / Email / Email recovery / Suppression / Audit) | Coverage good. Email configuration gaps are never surfaced (STF-24). Header buttons duplicate the tabs (STF-05). |
| Edit the ready-made library | "Content library · Manage ready-made Mixes" card | Content → Ready-made Mixes → Edit → reason → Save draft → Preview & publish → Publish… → reason + password + recent MFA | Sound safeguards but heavy: two reasons per change, and a false "needs review" strip (STF-13). Ready-made **Mega-Mixes** are hard-coded (`src/lib/mega-mixes.ts:148`) and cannot be edited here (§5 R9). |
| Edit invitation wording | none | Content → "Invitation wording" tab | Simple page. The stored v1 wording contradicts the three-invitation rule (STF-02). |

**What works.** The 8 groups match the jobs. Area tabs keep sub-pages one click apart. The sidebar is permission-filtered. Queue pages keep filters, and drafts survive MFA.

**What gets in the way.**
- Naming mismatches (STF-04) and duplicated shortcuts (STF-05).
- The sidebar eyebrow "Administration · {page}" repeats the highlighted item and H1. It falls back to "Overview" where there is no match (STF-16).
- The header logo leaves the console for the marketing homepage, and "Your account" opens Today (STF-20).
- "More filters" summaries span the full toolbar, so at 1440 the chevron sits about 1,100px from its label (`shots/sweep/laptop-light-staff/admin-access.png`, `admin-support.png`, `admin-templates.png`).

**Verdict: Good, fix details.**

**Recommended structure.** Keep the 8 groups. Make sidebar group, tab label, H1 and runbook name identical. Show count badges on the groups and tabs that hold waiting work: Support (needs reply), Content → Community reports (to review), Access → Waitlist → Delivery (problems), Operations → Alerts (open). Drop the desktop eyebrow. Logo → `/admin`.

### 2.1 Overview — `/admin`

**Purpose.** Answer "what needs me this week?" and get there in one click.

**Does well.** A permission-aware "Needs attention" list with direct links and oldest-age lines. It covers invitation and staff-invitation delivery reviews, failed support notifications, blocked admission, monitor staleness and alerts, failed jobs and support waiting. The calm state is honest. It fits one 1440×900 screen (`shots/sweep/laptop-light-staff/admin.png`).

**What gets in the way.**
- The top third is meta: "Page loaded Oct 8, 11:41 PM" and "Checked 2026-10-08 23:41:49 UTC · 0 minutes ago" for the same moment, plus "Refresh status" and the sentence "Counts are a live read of retained records at page load…". Each tile has a definitional footnote (STF-18).
- No Community-reports row (STF-01). No email-configuration row (STF-24). Library drafts appear only as a bottom-card subtitle, and only for UNPUBLISHED records, not published Mixes with unpublished changes (`src/app/(staff)/admin/page.tsx:30,90`).
- "Customer invitations · Next wave: Oct 15, 11:00 PM" reads as scheduled while admission is blocked (STF-09). It also shows personal-timezone time without a zone label, beside a UTC line (STF-10).
- Quick actions repeat four sidebar destinations, and "Explore reports" carries a calendar icon (`page.tsx:72`). "Content library" and "Customer invitations" cards repeat the sidebar. "Customer invitations" opens Waitlist, not Invitations.
- Phone: three tiles squeezed into 3 columns at 11px (STF-08). "Needs attention" starts about 590px down the 844px screen (`shots/sweep/phone-light-staff/admin.png`).

**Verdict: Needs rework (content, not shell).**

**Recommended structure (answers "what should be first").**
1. **Title row:** "Overview" plus a single "Updated 7:41 PM EDT · Refresh".
2. **"This week" queue:** one row per weekly job, each with a count, the oldest age and one action. A zero row stays visible with a check mark so Kevin sees coverage, not silence. Suggested order:
   1. Support needs a reply (N, oldest wait).
   2. Community reports to review (N; private-information hides first; review requests).
   3. Waitlist wave: "Next wave Thu Oct 15, 7:00 PM EDT · N eligible · N spaces", or "On hold: invitation limits aren't set → Set limits".
   4. System health: open alerts or monitor stale, failed jobs, email delivery reviews, email setup gaps.
   5. Library: N Mixes with unpublished changes.
3. **Compact metrics line** (second): customer accounts, follow-ups completed in 7 days, confirmed waiting. Definitions go in a "How these numbers work" disclosure.
4. **Remove** Quick actions and the two bottom cards; their jobs live in the queue.

**Noise:** the second timestamp, the definitions sentence, the tile footnotes ("Operational total · not customer capacity", "retained records", "eligibility checked on invite"), "Policy last updated: 7h ago", the "Check now · …" prefix, the "2 areas" badge, Quick actions and the bottom cards.

### 2.2 Waitlist — `/admin/waitlist`

**Purpose.** See whether this week's wave will go out, admit extra people, and fix delivery problems.

**Does well.**
- Selection controls come before the queue: "Select eligible on this page", the reason, "Review N invitations", then "Confirm and queue invitations" (`src/components/WaitlistSelectionForm.tsx:17-19`).
- The status line states eligible people, spaces and the blocker.
- The empty state explains the admission blocker (`shots/sweep/laptop-light-staff/admin-waitlist.png`).

**What gets in the way.**
- The next wave time, last worker check-in and pause/resume control are inside the collapsed "Wave schedule" disclosure at the page bottom (`src/app/(staff)/admin/waitlist/page.tsx:73-84`) (STF-17).
- The "Delivery" tab shows no problem count.
- The empty-state links run together: "Open public waitlistReview admission readiness" (STF-12).
- "waitlist email-grant spaces" is jargon.
- At 1366×768 the desktop queue box is about 238px tall, roughly 3 rows (`src/styles/admin-density.css:249`, `calc(100svh - 530px)`; INFERRED).

**Verdict: Good, fix details.**

**Recommended structure.** Status line: "Next wave Thu Oct 15, 7:00 PM EDT · 0 can be invited · 0 spaces · Worker checked in 1 min ago · Blocked: limits not set → Admission". Tabs: Waiting / Delivery (N) / Access history / Waves and activity. Keep pause/resume in the disclosure.

### 2.3 Invitations — `/admin/access`

**Purpose.** Look up an access grant or invitation and review its delivery.

**Does well.** The common filters come first (recipient, access state, source), with advanced filters in "More filters". Rows show separate "Grant: …" and delivery pills plus one "Review" action (`shots/sweep/laptop-light-staff/admin-access.png`).

**What gets in the way.**
- "1 matching invitations" plus "1–1 of 1 results" repeat the count (STF-14).
- "All grants / Reserved access" is internal wording.
- On phone, the pills stretch to half-width grid cells and look like fields (STF-08c).
- The name "Invitations" also labels Team's staff-invitation tab (STF-04).

**Verdict: Good, fix details.**

**Recommended structure.** Keep as is. Rename the page "Customer invitations" (so Team keeps "Staff invitations"). Show one count line. Keep the pills inline on phone.

### 2.4 Admission — `/admin/admission`

**Purpose.** Set the two limits and the pauses so waves and invitations can go out.

**Does well.** It leads with capacity tiles and a readiness line. Save is visible on the first screen at 1440×900. Saving needs a password, recent MFA and a reason. The draft survives verification (`shots/sweep/laptop-light-staff/admin-admission.png`).

**What gets in the way.**
- Jargon: "Available waitlist email-grant capacity", "Effective readiness", "Email grants:", "Reserved invitations / Unused email grants reserve places".
- The left "Effective readiness" list repeats the four pause states that the right-hand checkboxes already show.
- On phone the 3 tiles are squeezed to 11px (STF-08), and the form starts below about 1,000px.
- At 1366×768 the Save button ends near the fold. ADMIN_DENSITY measured 753px (INFERRED for the current copy).

**Verdict: Good, fix details.**

**Recommended structure.** One readiness sentence in plain words ("Invitations can't go out: set both limits above 0."), then the limits form. Replace the pause list with a single "No pauses on" or "Paused: …" line. Keep the emergency control in its own disclosure.

### 2.5 Users ("Customers") — `/admin/users`

**Purpose.** Find an account and see whether it is set up and active.

**Does well.** Search plus an access filter, and one "View account" action per row (`shots/sweep/laptop-light-staff/admin-users.png`).

**What gets in the way.**
- Each row is 4 text lines, about 130px. The query fetches each workspace's contact, Mix and follow-up counts but never shows them (`src/app/(staff)/admin/users/page.tsx:58,99`). For activation checks those counts are the useful part (STF-19).
- "1 sessions" (STF-14).
- The sidebar says "Customers" but the H1 says "Users" (STF-04).

**Verdict: Good, fix details.**

**Recommended structure.** A one-line row: name · email · workspace · setup ✓ · last active · N contacts / N Mixes · status · View. Pick one name for the page.

### 2.6 Support — `/admin/support`

**Purpose.** Reply to whoever is waiting, oldest and urgent first.

**Does well.**
- It opens on "Needs reply" with Mine / Unassigned / Waiting on customer / All views.
- Count strip, priority-then-oldest sort, live search, pagination (`shots/sweep/laptop-light-staff/admin-support.png`).

**What gets in the way.**
- The empty default view says "No tickets match these filters / Try fewer filters." under a "?" icon, though no filter is set (STF-03).
- One state has four names: "Waiting on support" (tile), "Needs reply" (tab), "Needs a reply" (filter), "Support is waiting on a reply" (Overview).
- Only one of the four tiles is a link.
- On phone the view tabs clip ("Waiting on custon…") with no scroll hint, unlike the area tabs.
- The ticket detail page was not captured (§7). From code, assigning a case to oneself needs a 10+ character reason (`src/app/(staff)/admin/support/[ticketId]/page.tsx:186-195`).

**Verdict: Good, fix details.**

**Recommended structure.** Calm empty state: "No one is waiting for a reply ✓". Make all tiles links to their filtered views. Use "Needs a reply" everywhere. Add an "Assign to me" shortcut (see §5 R8).

### 2.7 Community reports (Marketplace moderation) — `/admin/marketplace`

**Purpose.** Decide every reported community share promptly.

**Does well.**
- Needs review (N) / Hidden (N) / Reviewed tabs.
- Decisions happen inline per share: a note plus two outcome buttons, with copy that varies by state.
- Read-only without `mixes.publish` (`src/app/(staff)/admin/marketplace/page.tsx:28,44-49`).
- Clean empty state (`shots/sweep/laptop-light-staff/admin-marketplace.png`).

**What gets in the way.**
- A 3-line policy paragraph sits above the queue on every visit.
- It still says "from a verified account" without saying that means a verified email (known: JITM-09 §6 / B-09; STF-21).
- Nothing on Overview or the Content group shows waiting reports (STF-01).

**Verdict: Good, fix details.**

**Recommended structure.** Move the policy into a "How reports work" disclosure. Badge Content and the tab. Add the Overview row.

### 2.8 Ready-made Mixes (library list) — `/admin/templates`

**Purpose.** Find a library Mix to fix or publish, and create new ones.

**Does well.** The strongest list in the console. Visibility tabs with counts (All 40 / Needs review / Published / Unpublished), search plus sort, advanced filters in a disclosure, and filter-preserving pagination (`shots/sweep/laptop-light-staff/admin-templates.png`).

**What gets in the way.**
- Rows are 3 lines.
- "Customers see version 1" wraps to two lines in the 112px column (STF-19).
- The list scrolls inside a box (5 rows at 900px; `src/styles/admin-density.css:248`). This is a deliberate density trade-off, acceptable on desktop.
- "Start from your own Mix" is hidden in "Library guidance & copying an existing Mix" below the list (`src/app/(staff)/admin/templates/page.tsx:74-75`). That is Kevin's natural way to publish a Mix he built and tested (STF-26).
- Ready-made Mega-Mixes are absent (code-defined).

**Verdict: Good, fix details.**

**Recommended structure.** One-line rows: title · category · industry · "Published v1" / "Changes in v2" · copies · Edit. Turn "Create library draft" into a menu with "Blank draft" and "Copy one of my Mixes".

### 2.9 Create a library draft / Library review (editor) — `/admin/templates/new`, `/admin/templates/[id]/edit`

**Purpose.** Edit Beats safely, preview the saved version, publish.

**Does well.**
- Two columns (details | Beats), with one Beat expanded at a time.
- A sticky desktop save bar, an incomplete-fields jump list, "Remove Beat" through the shared confirm (`src/components/LibraryDraftForm.tsx:73`), and draft retention.
- Version history and a diff (`shots/sweep/laptop-light-staff/admin-template-edit.png`, `-full.png`; `admin-templates-new-full.png`).

**What gets in the way.**
- "1 item(s) need review · 4 Beats" on a clean published Mix. The only "item" is the empty change-reason field (`LibraryDraftForm.tsx:34,43`).
- Two adjacent lines say the same thing: "Saving creates a private draft…" and "Draft · publishing is a separate step." (STF-13).
- The H1 reads "Review A conversation goes quiet: reopen gently".
- "Preview & publish · draft 1" here versus "2. Preview and publish" in the jump links.
- Channel shown as "SMS" / "Phone Call" in the Beat summary but "Text" / "Phone call" in the select (STF-15).
- "Days from the start date (negative = before)".
- At 1366×768 the sticky bar (about 92px) would cover the first Beat's timing row on load (INFERRED).
- On phone the save area scrolls with the form, as JITM-08 §2.26 intends, so Save sits about 2,900px down.

**Verdict: Good, fix details.**

**Recommended structure.**
- H1 = Mix title, with "Published v1 · Draft v1" under it.
- Readiness strip only after an edit, and only for content problems.
- One explanation line.
- One channel vocabulary.
- Day input as "Before / On / After the start + N days".
- Reason optional for drafts, required for publish (§5 R8).

### 2.10 Invitation wording (System Mix) — `/admin/system-mix`

**Purpose.** Edit and publish the member invitation text.

**Does well.**
- A short page: the draft editor opens first; preview, diff and release impact sit in "Preview and publish".
- Newsreader font for the wording, per JITM-06 §2.13 (`shots/sweep/laptop-light-staff/admin-system-mix.png`).

**What gets in the way.**
- The stored and published v1 text reads "…one of my five personal invitations with you." (crop `lanes/crops/STF/systemmix-five-invitations.png`). Members see "three" only because `renderSystemMix` swaps the exact phrase (`src/lib/system-mix.ts:26`). The editor and the "Saved placeholders" preview say five, while the example preview and the page's own "three lifetime invitations" line say three (STF-02).
- The introduction textarea shows about 4 lines, so the signature is cut off (`rows={5}`, `system-mix/page.tsx:48`).
- The three jump buttons duplicate the disclosure headings right below them on a short page.
- "Recent publications" is a smaller heading than its sibling disclosures (`:61`).
- The wording still uses personal-circle framing ("stay in touch with the people in my circle"; cross-ref observation O35).

**Verdict: Good, fix details (one MEDIUM content defect).**

**Recommended structure.** An auto-growing textarea. Drop the jump links on this page. Publish v2 with "three" (and SMB wording if Kevin wants it), then remove the replacement.

### 2.11 Library options — `/admin/settings`

**Purpose.** Choose and order the category and industry options owners see.

**Does well.** Checkbox plus up/down rows, a preview of customer choices, Save and Reset per list; both lists fit at 1440×900 (`shots/sweep/laptop-light-staff/admin-settings.png`).

**What gets in the way.**
- On phone each option is about 93px (checkbox row plus a full-width pair of arrows), inside a 300px internal scroll box (`shots/sweep/phone-light-staff/admin-settings.png`; crop `phone-options-nested-scroll.png`) (STF-08b).
- "Mixes · 2 settings" counter.
- The "MIXES" section label is uppercased on phone (STF-22).
- "Reset to defaults…" confirms with an inline notice (STF-25).
- The route is called `/admin/settings` but sits under Content, while the "Settings" group means Team (STF-04).
- Content note: the default order leads with "Relationships", "Personal connections", "Networking", which is personal-tool framing for a trades and realtor product (Kevin decision; customer impact belongs to other lanes).

**Verdict: Good, fix details.**

**Recommended structure.** On phone, arrows inline beside the label (44×44 each) and no nested scroll. Reset through `useConfirmDialog`.

### 2.12 Team — `/admin/team`

**Purpose.** Manage who can operate the console.

**Does well.** Roster first, then Staff / Invitations / Add a person tabs, and per-person access in a disclosure (`shots/sweep/laptop-light-staff/admin-team.png`).

**What gets in the way.**
- An "Add a person" primary button sits beside an "Add a person" tab.
- A "Your security" tab leaves the page and duplicates the header "Security" link.
- "Manage access · 21" has an unexplained number.
- Raw lowercase enums: "owner · active · MFA enabled".
- On phone the chevron floats away from "Manage access".

**Verdict: Good, fix details.**

**Recommended structure.** Drop the duplicate button and the "Your security" tab. "Manage access (21 permissions)". Role shown as "Owner".

### 2.13 Operations — `/admin/operations`

**Purpose.** See failed or stuck background work and worker health; retry safely.

**Does well.** Failure-first default filter, clickable job counts, worker evidence in its own tab, retry only where safe (`shots/sweep/laptop-light-staff/admin-operations.png`).

**What gets in the way.**
- The header button "Operational alerts" duplicates the "Alerts" tab (STF-05).
- "1 worker(s) reported…" (STF-14).
- The empty Failed view reads "No jobs matched / Try a different status or task filter." (STF-03).
- The green tile fills are misaligned: "Failed jobs" fills from the card edge while the worker tiles fill lower (crop `operations-metric-tiles.png`; polish, no row).

**Verdict: Good, fix details.**

**Recommended structure.** Remove the header button. "No failed jobs ✓". Align the tiles.

### 2.14 Operational alerts — `/admin/operations/alerts`

**Purpose.** Act on open checks; acknowledge with a reason.

**Does well.** Stale-monitor banner, severity sort, "How alerts work" disclosure, acknowledgement kept distinct from recovery (`shots/sweep/laptop-light-staff/admin-operations-alerts.png`).

**What gets in the way.**
- The "Background operations" button duplicates the tab.
- The default tab label "Unresolved, including acknowledged".
- The stale banner and the "No independent observations…" card say the same thing twice.
- Notification pager label "Older page back" (`alerts/page.tsx:49`).

**Verdict: Good, fix details.**

**Recommended structure.** Tabs "Open / Acknowledged / All". One stale message carrying the configure action.

### 2.15 Email — `/admin/email`

**Purpose.** Check sending allowance, delivery health and suppression at a glance.

**Does well.** Two aligned panels with meters, provider-event history with search, and honest delivery definitions (`shots/sweep/laptop-light-staff/admin-email-full.png`).

**What gets in the way.**
- "Delivery health" mixes statuses and links in identical text styling (crop `email-delivery-health.png`; known JITM-10 §6 inline links) (STF-11).
- "Signed provider events: Missing signing secret" appears as plain text with no warning, and is absent from Overview (STF-24).
- Zero-count links ("0 staff invitations need review").
- The empty event list says "Clear the search…" with no search entered (STF-03).

**Verdict: Good, fix details.**

**Recommended structure.** Delivery health as rows of "Label · count · Review →", shown only when the count is above 0, otherwise "✓ nothing to review". Configuration gaps as warning notices that also feed the Overview.

### 2.16 Email recovery — `/admin/email/recovery`

**Purpose.** Find invitation emails whose delivery needs review.

**Does well.** One search, a status filter and a clear row action (`shots/sweep/laptop-light-staff/admin-email-recovery.png`).

**What gets in the way.**
- "0 deliveries · expired payloads excluded" (implementation word).
- "No matching deliveries within your permissions." when nothing exists at all.
- The "Recipient suppression" button duplicates the tab (STF-05).

**Verdict: Good, fix details.**

**Recommended structure.** "No invitation emails need review ✓". Remove the header button.

### 2.17 Recipient suppression — `/admin/email/suppressions`

**Purpose.** Review blocked recipients.

**Does well.** Reason filter, grouped recipients, "Provider review available" versus "Recipient confirmation required" (`shots/sweep/laptop-light-staff/admin-email-suppressions.png`).

**What gets in the way.**
- The count is said three times: "0 matching blocked recipients", "No active blocks match these filters.", "0 results".
- The "Email overview" button duplicates the tab.
- The tab is "Suppression" but the H1 is "Recipient suppression".

**Verdict: Good, fix details.**

**Recommended structure.** One count line, the tab named after the H1, no header button.

### 2.18 Audit — `/admin/audit`

**Purpose.** Look up who did what.

**Does well.** Platform and workspace tabs with their own filters, UTC date filters, redacted details on demand (`shots/sweep/laptop-light-staff/admin-audit.png`).

**What gets in the way.**
- Event names are mechanically humanized ("Admin mfa enable"), with the raw outcome ("ALLOWED") and entity class ("AdminMfaCredential").
- Time is printed twice when the zone is UTC ("Oct 8, 11:41 PM (UTC) · 2026-10-08 23:41:37 UTC").
- "1 platform events".

**Verdict: Good, fix details.**

**Recommended structure.** A readable label map for common actions. Print the time once when the local zone is UTC.

### 2.19 Live reports — `/admin/reports`

**Purpose.** See growth, engagement, content and operations trends; export them.

**Does well.** Date toolbar, presets, domain tabs, headline metrics and trend on the first screen, definitions in disclosures (`shots/sweep/laptop-light-staff/admin-reports.png`).

**What gets in the way.**
- The header links "Saved daily reports / Your exports" duplicate the "Report history / Exports" tabs. They exist to carry the date range (`reports/page.tsx:30`) (STF-05).
- The presets never show which one is active (STF-23).
- On phone the presets fall into a 2+1 text grid with 20px targets (crop `phone-report-presets.png`; STF-06, STF-08c).

**Verdict: Good, fix details.**

**Recommended structure.** Make the area tabs carry `from` and `through`, then drop the header links. Presets as a 44px segmented control with a selected state.

### 2.20 Saved daily reports — `/admin/reports/history`

**Purpose.** Read saved daily observations.

**Does well.** Activity by default, storage in its own tab, a horizontally scrollable table region on phone (`shots/sweep/laptop-light-staff/admin-reports-history.png`).

**What gets in the way.**
- Duplicate "Live reports / Your exports" links.
- Raw "READY" status (`history/page.tsx:41`).
- Tab "Report history" versus H1 "Saved daily reports".

**Verdict: Good, fix details.**

**Recommended structure.** Status "Saved". Rename the tab to match the H1.

### 2.21 Report exports — `/admin/reports/exports`

**Purpose.** Download prepared CSVs.

**Does well.** Session-bound downloads, bounded polling, export limits in a disclosure (`shots/sweep/laptop-light-staff/admin-reports-exports.png`).

**What gets in the way.**
- "Back to report range / Saved daily reports" links duplicate the tabs.
- "No unexpired exports for this sign-in." is stiff.
- Raw statuses (READY / QUEUED / FAILED) appear in the code path (`exports/page.tsx:23`).

**Verdict: Good, fix details.**

**Recommended structure.** "No exports yet. Prepare one from Reports → Export CSV." Use human-readable statuses.

### 2.22 Access denied — `/admin/access-denied`

**Purpose.** Explain a missing permission and return safely.

**Does well.** Short, with a safe return link that is never itself a denied page (`src/app/(staff)/admin/access-denied/page.tsx:9-12`).

**What gets in the way.**
- The sidebar eyebrow says "Administration · Overview" and no item is highlighted (STF-16).
- Without a capability parameter it says "Required capability: Access to this area." That happens on the admission action redirect (`src/lib/admission-admin-actions.ts:19`).
- "Return to your workspace" actually returns to a staff page (`shots/sweep/laptop-light-staff/admin-access-denied.png`).

**Verdict: Good, fix details.**

**Recommended structure.** "You don't have permission for this page. Ask an owner to change your staff access." plus "Back to {area}".

### 2.23 Staff shell on phone (≤760px) and the staff phone menu (overlay)

**Purpose.** Quick checks and replies from a phone.

**Does well.**
- One responsive DOM. The area tabs scroll sideways and keep the current tab centered (`src/components/AdminNav.tsx:37`).
- 44px rows, buttons and disclosure summaries at ≤760 (`src/styles/admin-density.css:157-161`; `src/styles/disclosures.css:48-50`).
- The Menu closes on Escape (focus returns to its toggle), on an outside tap and on choosing a link. That meets JITM-08 §2.17 by code (`AdminNav.tsx:28-35,51`); the open state was not captured.

**What gets in the way.**
- The header wraps: "Your account / Security" sit above "Sign out", the identity sits in the middle, and the environment is 9.17px (STF-07).
- The links are 72×17 (STF-06).
- The "Administration · X / Menu" bar and the "Operations: scroll for more pages →" hint push the H1 to about 165–250px, 20–30% of an 844px screen (STF-27).
- The 3-column tiles at 11px (STF-08a).
- `.page-actions` becomes a 2-column grid that stretches pills and links (STF-08c).
- Report presets and inline links fall under 44px (STF-06).

**Verdict: Good, fix details** (the structure is right; the floors are not met).

**Recommended structure.** One 56px top bar: logo (→ `/admin`), current area name, and a Menu holding the 8 groups plus Open the app, Security and Sign out. Area tabs below it with an edge fade instead of the hint sentence. Floors: 13px text and 44px targets.

---

## 3. Findings table

| ID | Rule | Finding | Evidence | Label | Severity | Fix direction |
|---|---|---|---|---|---|---|
| STF-01 | JITM-09 §2.49 ("SHOULD reach a moderator promptly") | Overview never counts open community reports or review requests. The only in-console signal is "(N)" inside Content → Community reports. Email alerts go only to OWNER-role staff and are silently skipped when email isn't configured. | `src/app/(staff)/admin/page.tsx:22-67` (no Marketplace query); `src/lib/marketplace-service.ts:340-357`; `shots/sweep/laptop-light-staff/admin.png` | VERIFIED-CODE, VERIFIED-RUNTIME | MEDIUM | Add a "Community reports to review (N, oldest)" attention row for `mixes.edit` holders. Badge the Content group and tab. |
| STF-02 | JITM-09 §2.17 (three lifetime invitations) | The published v1 invitation wording shown in the staff editor says "one of my five personal invitations". Members and recipients get "three" only through a render-time `replaceAll` of that exact phrase. The editor and the "Saved placeholders" preview disagree with the example preview. A small edit to the sentence would send "five". | `lanes/crops/STF/systemmix-five-invitations.png`; `prisma/migrations/20260909040000_system_mix_releases/migration.sql:30`; `src/lib/system-mix.ts:26`; `src/components/SystemMixPreview.tsx:9` | VERIFIED-RUNTIME, VERIFIED-CODE (production data NOT RUN) | MEDIUM | Publish v2 with "three" (Kevin, password plus MFA), then delete the replacement. Until then, show an editor notice. |
| STF-03 | JITM-08 §2.32; JITM-04 §2.11 | Empty queues blame filters that aren't set. Support's default view shows "No tickets match these filters / Try fewer filters." with a "?" icon. Operations' default Failed view shows "No jobs matched / Try a different status or task filter." Email with an empty search shows "No events match this view. Clear the search…". | `shots/sweep/laptop-light-staff/admin-support.png`, `admin-operations.png`, `admin-email-full.png`; `src/app/(staff)/admin/support/page.tsx:163-168`; `operations/page.tsx:153`; `email/page.tsx:54` | VERIFIED-RUNTIME | LOW | Separate "nothing waiting ✓" (default view) from "no results for these filters, Clear filters". |
| STF-04 | none — gap (closest JITM-05 §2.16) | Pages carry two or three names. "Customers" opens "Users". "Settings" opens "Team" while `/admin/settings` is "Library options" under Content. "Reports" opens "Live reports". "Report history" opens "Saved daily reports". "Exports" opens "Report exports" / "Your exports". "Alerts" opens "Operational alerts". "Suppression" opens "Recipient suppression". "Invitations" names both customer grants and staff invitations. Overview's "Customer invitations" opens Waitlist. | `src/lib/admin-navigation.ts:5-14`; `src/lib/admin-permissions.ts:54-75`; `src/app/(staff)/admin/page.tsx:91`; the laptop staff captures | VERIFIED-RUNTIME, VERIFIED-CODE | LOW | Tab label = H1 = runbook name. Settings group → "Team". Rename the Team tab "Staff invitations" and the Access page "Customer invitations". |
| STF-05 | none — gap (duplicate navigation) | Header shortcuts duplicate area tabs on 8 pages: "Operational alerts", "Background operations", "Recipient suppression", "Email overview", "Saved daily reports"/"Your exports", "Back to report range", "Live reports". Team has an "Add a person" button plus tab, and a "Your security" tab plus the header "Security". | `operations/page.tsx:96`; `operations/alerts/page.tsx:32`; `email/recovery/page.tsx:19`; `email/suppressions/page.tsx:21`; `reports/page.tsx:30`; `reports/exports/page.tsx:18`; `reports/history/page.tsx:31`; `team/page.tsx:36,38`; crops `operations-dup-nav.png`, `reports-dup-nav.png` | VERIFIED-RUNTIME | LOW | Delete them. Carry the report date range in the Reports area tabs. |
| STF-06 | JITM-10 §2.1; JITM-07 §2.14 (44px at ≤760) | Phone staff controls under 44px. Header "Your account"/"Security" are 72×17 on every page. Overview tile links are 77×30, 59×30 and 98×14. Report presets are 175×20 and "Saved daily reports"/"Your exports" 119×20 and 81×20. Waitlist empty-state links are 122×18 and 177×18. Email delivery links are 336×20. Invitation-wording links are 242×18 and 260×18. | `shots/sweep/phone-light-staff/_results.json` (smallTargets); `src/styles/admin-density.css:259` | VERIFIED-RUNTIME | MEDIUM | 44px minimum height for links that act as controls at ≤760. Presets as a segmented control. Header actions into the Menu. |
| STF-07 | JITM-10 §2.2 (13px floor; no staff exception) | Staff text under 13px at every width. Environment label 10.4px desktop, 9.17px phone. Operator name 12.48px / 11px. Sidebar location 12px. "Page loaded" and result summaries 12px. Overview tile notes and attention details 12px (11px on phone). Admission tile labels 11px on phone. Team "Effective:" 10.83px. Library meta and status pills 12px. Ticket reference 11px. Tab hint 12.8px. | laptop and phone `_results.json` "small" entries; `src/styles/admin-density.css:10,40,63,67,75,108,123,146,167,183,236,259` | VERIFIED-RUNTIME, VERIFIED-CODE | MEDIUM | Raise staff secondary text to 13px and keep compact spacing. Make the environment a ≥13px badge (amber "Test environment"; plain for production). |
| STF-08 | JITM-06 §2.31 (one style owner, no stacked overrides) | Stale overrides break phone layouts. (a) `admin-density.css:164,167` force the Overview and Admission tiles into 3 columns with 11px labels, overriding the ≤430px single column in `admin-layout.css:131-134`; the numbers end up centered between left-aligned labels. (b) `admin-density.css:267` restores a 300px internal scroll box on Library options after `:177` removed it. (c) Legacy `base.css:293-294` (≤900px) turns every staff `.page-actions` into a 2-column stretched grid: presets in a 2+1 grid, pills stretched like fields. | `shots/sweep/phone-light-staff/admin.png`, `admin-admission.png`, `admin-settings.png`, `admin-reports.png`, `admin-users.png`; crops `phone-overview-pulse.png`, `phone-options-nested-scroll.png`, `phone-report-presets.png` | VERIFIED-RUNTIME, VERIFIED-CODE | LOW | Delete the stale rules. Single-column tiles on phones. No nested scroll on touch. Staff `.page-actions` keeps flex wrap. |
| STF-09 | none — gap (state accuracy) | Overview shows "Customer invitations · Next wave: Oct 15, 11:00 PM" two rows below "New customer invitations are blocked". The card checks only `schedule.paused`, not admission. | `shots/sweep/laptop-light-staff/admin.png`; `src/app/(staff)/admin/page.tsx:64,91` | VERIFIED-RUNTIME, VERIFIED-CODE | LOW | "Next wave Oct 15, on hold until limits are set". |
| STF-10 | JITM-11 §2.15 (dates use the account's timezone); gap for staff | Mixed time conventions. Overview's "Page loaded …" and "Next wave …" use the staff member's saved timezone with no zone label, next to "Checked 2026-10-08 23:41:49 UTC". Waitlist, Marketplace and Operations print ISO UTC ("2026-10-15 23:00 UTC"). Audit prints both. With a saved timezone, the same wave shows two different clock times on two pages. | `src/app/(staff)/admin/page.tsx:76,91`; `src/components/AdminRefresh.tsx:22`; `waitlist/page.tsx:17,76`; `audit/page.tsx:46` | VERIFIED-RUNTIME (format), INFERRED (two clock times, once a timezone is saved) | LOW | One staff convention: local time plus zone abbreviation, UTC only in report and audit definitions. |
| STF-11 | JITM-10 §2.8 (known: JITM-10 §6 inline links) | Fresh evidence: staff action links look like body text. Email "Delivery health" alternates status lines and links in the same style. Waitlist empty-state links and report presets look the same. | `lanes/crops/STF/email-delivery-health.png`; `email/page.tsx:45-49` | VERIFIED-RUNTIME | LOW (known) | Link styling. Delivery-health rows each get one explicit "Review →". |
| STF-12 | none — gap (markup) | Waitlist empty state renders "Open public waitlistReview admission readiness": two adjacent links with no separator. | `lanes/crops/STF/waitlist-links-runtogether.png`; `src/app/(staff)/admin/waitlist/page.tsx:70` | VERIFIED-RUNTIME, VERIFIED-CODE | LOW | Action row or list. |
| STF-13 | JITM-04 §2.7 (don't confirm what didn't happen); gap | The library editor counts the empty change-reason field as a problem, so a clean published Mix opens with "1 item(s) need review · 4 Beats". The library's "Needs review" tab means something different (unpublished changes). Two adjacent lines repeat each other. | `lanes/crops/STF/library-edit-readiness.png`; `src/components/LibraryDraftForm.tsx:34,43,44` | VERIFIED-RUNTIME, VERIFIED-CODE | LOW | Count content problems only. Show "Ready to save" until edited. Keep one explanation line. |
| STF-14 | JITM-05 §2.15 (singular/plural) | Machine plurals: "1 sessions", "1 matching invitations", "1 matching staff members", "1 platform events", "1 worker(s) reported…", "4 item(s) need review". | `users/page.tsx:100`; `access/page.tsx:30`; `team/page.tsx:43`; `audit/page.tsx:45`; `operations/page.tsx:137`; `LibraryDraftForm.tsx:43` | VERIFIED-RUNTIME | LOW | Pluralize. |
| STF-15 | JITM-04 §2.4 (sentence case); gap (one name per channel) | The library editor names one channel two ways: the select says "Text" / "Phone call" / "Voicemail script", the Beat summary says "SMS" / "Phone Call" / "Voicemail Script" (`sharedMixChannelLabel`, also used on customer ready-made previews). | `shots/sweep/laptop-light-staff/admin-template-edit-full.png`; `LibraryDraftForm.tsx:63,65`; `src/lib/shared-mix.ts:121-126` | VERIFIED-RUNTIME, VERIFIED-CODE | LOW | One label set: Text, Email, Call, Voicemail, WhatsApp. |
| STF-16 | none — gap (location accuracy) | The sidebar eyebrow repeats the active item and H1 on every page. Where no area matches (Access denied) it falls back to "Administration · Overview" with nothing highlighted. | `shots/sweep/laptop-light-staff/admin-access-denied.png`; `src/components/AdminNav.tsx:45` | VERIFIED-RUNTIME, VERIFIED-CODE | LOW | Drop it on desktop. On phone show the current group name only. |
| STF-17 | JITM-08 §2.21 (disclosures for optional content) | Waitlist hides the weekly essentials (next wave time, last worker check-in, pause/resume) in the collapsed "Wave schedule" disclosure at the bottom. The status line omits the wave date. The Delivery tab has no problem count. | `shots/sweep/laptop-light-staff/admin-waitlist.png`; `waitlist/page.tsx:64-65,73-84` | VERIFIED-RUNTIME, VERIFIED-CODE | LOW | Status line with next wave and worker freshness. "Delivery (N)". |
| STF-18 | none — gap (noise) | Overview's first third is meta: two timestamps for one moment, "Refresh status", and "Counts are a live read of retained records at page load…". Definitional notes sit under each tile. Quick actions repeat 4 sidebar destinations (with a calendar icon on "Explore reports"). The bottom cards repeat the sidebar. | `lanes/crops/STF/overview-laptop.png`; `src/app/(staff)/admin/page.tsx:68-92` | VERIFIED-RUNTIME | LOW | One "Updated … · Refresh" line. Definitions in a disclosure. Remove Quick actions and the bottom cards (see R1). |
| STF-19 | JITM-07 §2.14 (compact desktop rows), recommendation | Users rows are 4 text lines (about 130px). The fetched contact, Mix and follow-up counts are never shown. Library status "Customers see version 1" wraps to 2 lines in a 112px column. | `shots/sweep/laptop-light-staff/admin-users.png`, `admin-templates.png`; `users/page.tsx:58,99-100`; `src/styles/admin-layout.css:71` | VERIFIED-RUNTIME, VERIFIED-CODE | LOW | One-line rows with the counts. Status "Published v1". |
| STF-20 | none — gap | The staff header logo links to the public marketing homepage (`/`). "Your account" opens Today (`/jumps`), not My account. | `src/app/(staff)/layout.tsx:17-18`; `src/components/Logo.tsx:7` | VERIFIED-CODE | LOW | Logo → `/admin`. Label "Open the app". |
| STF-21 | JITM-09 §2.49 (known: JITM-09 §6, backlog B-09) | Fresh evidence: the Community reports intro still says "from a verified account" without saying that means the reporter's email. | `shots/sweep/laptop-light-staff/admin-marketplace.png`; `marketplace/page.tsx:33` | VERIFIED-RUNTIME | LOW (known) | Wording in §4. |
| STF-22 | JITM-06 §2.16 (section labels sentence case) | The Library options section label renders "MIXES" on phone through a legacy shared rule. | `shots/sweep/phone-light-staff/admin-settings.png`; `src/styles/components.css:340` | VERIFIED-RUNTIME, VERIFIED-CODE | LOW | Remove the uppercase transform. |
| STF-23 | JITM-08 §2.28 (show the current value) | Report presets "7 days / 30 days / 90 days" never show which is active; the default 30-day range is unmarked. | `shots/sweep/laptop-light-staff/admin-reports.png`; `reports/page.tsx:37` | VERIFIED-RUNTIME | LOW | Segmented control with a selected state. |
| STF-24 | none — gap | Email shows "Signed provider events: Missing signing secret" as plain text with no warning state. Overview never lists email configuration gaps. | `shots/sweep/laptop-light-staff/admin-email.png`; `email/page.tsx:44`; `admin/page.tsx:60-67` | VERIFIED-RUNTIME (local config), INFERRED (production) | LOW | Warning notice plus an Overview row when the sender or signing secret is missing. |
| STF-25 | JITM-08 §2.7 (shared confirmation) | "Reset to defaults…" confirms with an inline notice instead of `ConfirmDialog` / `useConfirmDialog`. | `src/components/LibraryOptionsForm.tsx:24-25` | VERIFIED-CODE | LOW | `useConfirmDialog`, Cancel first. |
| STF-26 | none — gap (workflow placement) | "Start from your own Mix" (copy a tested Mix into a library draft) is hidden in "Library guidance & copying an existing Mix" below the list. | `shots/sweep/laptop-light-staff/admin-templates-full.png`; `templates/page.tsx:74-75` | VERIFIED-RUNTIME, VERIFIED-CODE | LOW | Offer it beside "Create library draft". |
| STF-27 | none — gap (phone staff frame) | On phone, the wrapped header, the "Administration · X / Menu" bar and the "…: scroll for more pages →" hint put the H1 at about 165–250px, 20–30% of the 844px screen. | `lanes/crops/STF/phone-chrome-before-h1.png`; `shots/sweep/phone-light-staff/admin-audit.png`, `admin-access.png`, `admin.png` | VERIFIED-RUNTIME | LOW | A single 56px bar (logo, area, Menu with the account links), tabs with an edge fade. |

---

## 4. Copy findings

| # | Current (exact) | Where | Problem | Proposed |
|---|---|---|---|---|
| C1 | "Counts are a live read of retained records at page load. Operational health uses the separate monitoring observation below." | `src/app/(staff)/admin/page.tsx:77` | Explains implementation (JITM-04 §2.6 spirit); it is the first line Kevin reads | Remove. Put in a "How these numbers work" disclosure: "Counts were read when this page loaded. System health comes from the separate monitor." |
| C2 | "Page loaded Oct 8, 11:41 PM" + "Checked 2026-10-08 23:41:49 UTC · 0 minutes ago" | `page.tsx:76`; `src/components/AdminRefresh.tsx:22` | Two stamps, two formats, one without a zone (STF-10, STF-18) | "Updated 7:41 PM EDT · Refresh" |
| C3 | "All accounts, including staff" / "Operational total · not customer capacity" | `page.tsx:79` | Hedged label plus footnote; Kevin wants customers | "Customer accounts" (footnote "3 including staff") |
| C4 | "Check now · Invitation limits are not configured" / "Policy last updated: 7h ago" | `page.tsx:58,64,84` | Verb fused into a status; irrelevant age line | "Invitation limits aren't set, so no one can be invited. Set limits →" |
| C5 | "2 areas" | `page.tsx:83` | Odd unit | "2 to check" |
| C6 | "Customer invitations" / "Next wave: Oct 15, 11:00 PM" | `page.tsx:91` | Opens Waitlist; reads as scheduled while blocked (STF-09) | "Waitlist · Next wave Thu Oct 15, 7:00 PM EDT, on hold until limits are set" |
| C7 | "0 eligible · 0 waitlist email-grant spaces available · Invitation limits are not configured" | `waitlist/page.tsx:65` | Jargon; no wave date | "0 people can be invited · 0 spaces left · Next wave Oct 15 · Invitation limits aren't set (Admission)" |
| C8 | "Open public waitlist" + "Review admission readiness" (renders "Open public waitlistReview admission readiness") | `waitlist/page.tsx:70` | Run-together links (STF-12) | Separate actions: "Open the public waitlist page" · "Set admission limits" |
| C9 | "Available waitlist email-grant capacity" / "Personal invitation allowance is separate" | `admission/page.tsx:39` | Jargon even for staff | "Spaces left for waitlist invitations" / "Members' own 3 invitations don't use these" |
| C10 | "Effective readiness" / "Email grants: Set both limits above zero to allow invitations." | `admission/page.tsx:23,40` | Jargon | "Can invitations go out?" / "Not yet: set both limits above 0." |
| C11 | "Reserved invitations" / "Unused email grants reserve places" | `admission/page.tsx:39` | Jargon | "Invitations not used yet" / "Each holds a space until it's used or revoked" |
| C12 | "No tickets match these filters" / "Try fewer filters." | `support/page.tsx:166-167` | Wrong state (STF-03) | Default view: "No one is waiting for a reply." With filters: "No tickets match these filters. Clear filters" |
| C13 | "Waiting on support" / "Needs reply" / "Needs a reply" / "Support is waiting on a reply" | `support/page.tsx:132,138,145`; `admin/page.tsx:67` | Four names for one state | "Needs a reply" everywhere |
| C14 | "No jobs matched" / "Try a different status or task filter." | `operations/page.tsx:153` | Wrong state on the default Failed view | "No failed jobs." |
| C15 | "1 worker(s) reported within 90 seconds. 0 pending and 0 running jobs. Review worker evidence" | `operations/page.tsx:137` | "(s)"; clunky | "1 worker checked in within 90 seconds. Nothing waiting or running. See worker health" |
| C16 | "No events match this view. Clear the search to review other verified events." | `email/page.tsx:54` | Shown with no search | No search: "No provider events recorded yet." With search: "No events match "{q}". Clear search" |
| C17 | "Signed provider events: Missing signing secret" | `email/page.tsx:44` | A real problem in plain text | Warning notice: "Delivery events can't be verified: the provider signing secret isn't set." |
| C18 | "0 deliveries · expired payloads excluded" / "No matching deliveries within your permissions." | `email/recovery/page.tsx:20-21` | "payloads"; reads like an error when nothing exists | "No invitation emails need review." |
| C19 | "Unresolved, including acknowledged" | `operations/alerts/page.tsx:36` | Wordy tab | "Open" |
| C20 | "Older page back" | `operations/alerts/page.tsx:49` | Wrong direction word | "Newer notifications" |
| C21 | "Manage access · 21" | `team/page.tsx:43` | Unexplained number | "Manage access (21 permissions)" |
| C22 | "{n} sessions" → "1 sessions" | `users/page.tsx:100` | Plural (STF-14) | "1 active session" |
| C23 | "1 item(s) need review · 4 Beats" / "Draft · publishing is a separate step." | `LibraryDraftForm.tsx:43-44` | False alarm plus duplicate (STF-13) | "Ready to save · 4 Beats"; on invalid input "2 fields to fix"; drop the second line |
| C24 | "Days from the start date (negative = before)" | `LibraryDraftForm.tsx:66` | Sign convention exposed | "When" = [Before / On / After] the start + "days" |
| C25 | "Review A conversation goes quiet: reopen gently" (H1 "Review {title}") | `templates/[sharedMixId]/edit/page.tsx:60` | Verb collides with the title | H1 = the title; subline "Ready-made Mix · Published v1 · Draft v1" |
| C26 | "Preview & publish · draft 1" vs "2. Preview and publish" vs "Preview and publish · version 1" | `edit/page.tsx:66`; `AdminEditorNavigation.tsx:16`; `system-mix/page.tsx:53` | Three forms of one step | "Preview and publish version 1" |
| C27 | "Customers see version 1" | `templates/page.tsx:66` | Wraps in its column | "Published v1" |
| C28 | "SMS" / "Phone Call" / "Voicemail Script" | `src/lib/shared-mix.ts:122-125` | Title case; differs from the select (STF-15) | "Text" / "Call" / "Voicemail" |
| C29 | "Required capability: Access to this area." / "Return to your workspace" | `access-denied/page.tsx:8,13` | Tautology; "workspace" means the customer app | "You don't have permission for this page. Ask an owner to change your staff access." / "Back to {area}" |
| C30 | "Your account" | `src/app/(staff)/layout.tsx:18` | Opens Today, not My account | "Open the app" |
| C31 | "Admin mfa enable" · "ALLOWED" · "AdminMfaCredential" · "Oct 8, 11:41 PM (UTC) · 2026-10-08 23:41:37 UTC" | `audit/page.tsx:46` | Mechanical label, raw enums, double time | "Administrator MFA turned on" · "Allowed" · "Admin MFA" · one time |
| C32 | "A private-information report from a verified account hides a share at once; every other report keeps it visible until you decide." | `marketplace/page.tsx:33` | known: JITM-09 §6 / B-09 ("verified" = email) | "A private-information report hides a share at once when the reporter's email address is verified. That doesn't mean the report is true. Other reports keep the share visible until you decide." |
| C33 | "…I'd like to share one of my five personal invitations with you." (stored v1) | `prisma/migrations/20260909040000_system_mix_releases/migration.sql:30` | Contradicts JITM-09 §2.17 (STF-02) | "…I'd like to share one of my three personal invitations with you." Optional SMB tone (Kevin): "I use Jump in the Mix to keep up with my customers. It's free while it's invitation-only, and I'd like to share one of my three invitations with you." |
| C34 | "Mixes" + "2 settings" | `settings/page.tsx:29` | Counter noise | Drop the count |
| C35 | "Operations: scroll for more pages →" | `src/components/AdminNav.tsx:40` | Instruction text; 12.8px | Edge fade on the tab strip; no sentence |

---

## 5. Structural recommendations (ranked)

| # | Specific problem (D20) | Change | Workflow benefit | Effort | Kevin decision? |
|---|---|---|---|---|---|
| R1 | Overview misses Marketplace reports, email setup and library changes; spends its top third on meta; shows a "scheduled" wave that is blocked (STF-01, STF-09, STF-18, STF-24) | Replace Pulse + Needs attention + Quick actions + bottom cards with one ordered "This week" queue (Support → Community reports → Waitlist wave → System health → Library changes). Each row carries count, oldest age and one action, and stays visible at zero with a ✓. One "Updated … · Refresh" line; a metrics line second; definitions in a disclosure. | One page answers "what needs me this week?" for all six jobs. No two-click detours to learn that a queue is empty. | M | Yes: which jobs appear, and their order |
| R2 | Pages carry 2–3 names; 8 pages duplicate their tabs (STF-04, STF-05) | Group, tab label, H1 and runbook name identical. Settings group → "Team". "Customer invitations" / "Staff invitations". Delete in-group header shortcuts. Make Reports tabs carry `from`/`through`. | Kevin learns one name per page; fewer competing buttons; runbooks match the screen. | S | Yes: "Customers" or "Users" |
| R3 | Phone staff shell fails JITM-10 §2.1 and §2.2; stale CSS breaks tiles and lists; chrome takes 20–30% of the screen (STF-06, STF-07, STF-08, STF-27) | A single 56px top bar with a Menu holding Open the app, Security and Sign out. 13px text floor (environment as a badge). Delete the conflicting rules (`admin-density.css:164,167,267`; staff opt-out of `base.css:293-294`). 44px segmented presets. Inline option arrows. | Quick phone checks (a support reply, a moderation decision) become usable; fewer mis-taps. | M | Only if Kevin wants a staff exception to the 13px floor (WF-08) |
| R4 | States mislead (STF-03, STF-12, STF-13; STF-09 lands with R1) | Calm empty states per queue; readiness strip counts content problems only; separated waitlist actions. | Fewer false alarms; empty means done. | S | No |
| R5 | Stored invitation wording says "five" and is masked at render time (STF-02) | Kevin publishes v2 ("three"; optional SMB tone) from the console, then the replacement in `system-mix.ts:26` is removed in a code change. | What staff edit is what members send; no latent "five". | S, plus Kevin's publish | Yes: final wording |
| R6 | Wave essentials hidden in a disclosure; Delivery problems uncounted (STF-17) | Waitlist status line: next wave (local time), can-invite count, spaces, worker freshness, blocker link. "Delivery (N)" tab. | The weekly wave check takes one glance. | S | No |
| R7 | Low-density rows; activation counts fetched but hidden (STF-19) | One-line Users rows with contacts/Mixes counts; one-line library rows with "Published v1" / "Changes in v2". | Scan 15–20 accounts or Mixes per screen instead of 3–5. | M | No |
| R8 | Solo-operator friction (INFERRED from code; not captured): a 10+ character reason on every draft save (`LibraryDraftForm.tsx:78`, `system-mix/page.tsx:49`) and to assign a ticket to oneself (`support/[ticketId]/page.tsx:186-195`) | Reason optional for drafts (required for publish, rollback and hide). One-click "Assign to me" with a recorded default reason. | Fewer keystrokes per routine edit or reply; audit kept for consequential steps. | S–M | Yes (audit policy; runbooks require reasons) |
| R9 | Ready-made Mega-Mixes (the trades-first onboarding content) are hard-coded in `src/lib/mega-mixes.ts:148`, so the console cannot edit them | Decide whether Mega-Mixes join the library draft → publish workflow, or stay code-released. | Kevin could fix Mega-Mix wording without a release. | L | Yes (scope) |
| R10 | The copy-from-my-Mix path is buried (STF-26) | "Create library draft ▾": Blank draft / Copy one of my Mixes. | Shortest path from a tested personal Mix to a published ready-made one. | S | No |

---

## 6. Documents that disagree, and gaps where no rule exists

**Documents versus code**
- `docs/LIBRARY_ADMINISTRATION.md:9` lists the tabs **All mixes / Published / Drafts & hidden**. The code ships **All Mixes / Needs review / Published / Unpublished** (`src/app/(staff)/admin/templates/page.tsx:46`).
- `docs/SYSTEM_MIX_ADMINISTRATION.md:7` says "Open **Admin → System Mix**". The UI is **Content → Invitation wording** (`src/lib/admin-permissions.ts:66`). Its "five lifetime invitations" (`:11,25,29`) is known: JITM-09 §6.
- `docs/USER_ADMINISTRATION.md:7` says "Open **Admin → Users**". The sidebar says **Customers** (`src/lib/admin-navigation.ts:7`).
- `docs/WAITLIST_OPERATIONS.md:10` and `docs/ADMISSION_CONTROLS.md:10` tell the operator to confirm the next wave date and worker health on Admin → Waitlist. Both live inside the collapsed "Wave schedule" disclosure (`waitlist/page.tsx:73-77`).
- `docs/ADMIN_DENSITY_2026-09-17.md` says "Mobile layouts … retain usable touch controls". The current phone metrics show 17–20px link targets on every staff page (STF-06).
- Data versus code: published System Mix v1 (`migration.sql:30`, "five") versus `DEFAULT_SYSTEM_MIX` and JITM-09 §2.17 ("three"; `src/lib/system-mix.ts:1,6`). They are reconciled only by `system-mix.ts:26`.
- `docs/ADMIN_UX_AUDIT_2026-09-16.md` §16 recommended alert views "Open, Acknowledged, All". The code ships "Unresolved, including acknowledged" (`alerts/page.tsx:36`).

**Standards in tension**
- JITM-07 §2.14 allows compact staff density on desktop. JITM-10 §2.2 sets a 13px floor with no staff exception. The density pass set staff secondary text to 12px (`.75rem`) and phone labels to 11px. Kevin should either confirm that the floor applies (fix STF-07) or record an exception.

**Gaps where no rule exists**
- No rule that a navigation label, tab label, page H1 and runbook name must match (STF-04).
- No staff timestamp convention (local or UTC, zone labels). JITM-11 §2.15 covers customer dates (STF-10).
- No rule for how staff sensitive changes (reason + password + recent MFA) confirm. The console uses inline disclosures ("Publish version N…", "Review before queueing"), while JITM-08 §2.7 and §2.9 describe `ConfirmDialog` / `ReviewDialog` for owner flows.
- No staff phone frame rule beyond 44px rows (STF-27). No rule against nested scroll regions on touch widths (STF-08b).
- No coverage contract for the staff Overview (which queues it must show; STF-01, R1).
- Staff corners: known JITM-06 §6. Fresh evidence shows a 6–10px mix: buttons 6px (`admin-density.css:17`), status pills 7px (`admin-layout.css:81`), cards and sidebar 8px (`admin-density.css:9,27`), `--radius` 10px (`:3`). Recommendation: adopt one staff scale, or the app tokens (12px controls / 16px cards).

---

## 7. Captures needed / NOT RUN

All are NOT RUN because this lane is read-only. No server, browser or database writes.

- **Queues with data at 1440×900 and 390×844:**
  - Waitlist Waiting with confirmed entries (selection, then "Review before queueing"); Delivery with REVIEW items; Waves and activity.
  - Community reports with an open LIVE report, an auto-hidden private-information report and an author review request.
  - Support queue with tickets, plus ticket detail (conversation, triage, status, assignment, customer view).
  - Operations with failed jobs; Alerts with WARNING/CRITICAL checks.
  - Email recovery with a REVIEW delivery and its detail page; Suppression with entries and its detail page.
- **Expanded states:**
  - Library editor "Preview & publish" and "Version history".
  - Invitation wording "Preview and publish" with the preview set to "Saved placeholders", to show five versus three.
  - Team roster record expanded (StaffAccessForm) and the Add a person flow.
- **Detail routes:** `/admin/users/[id]`, `/admin/access/[inviteId]`, `/admin/reports/history/[snapshotId]`.
- **Staff phone Menu open** (JITM-08 §2.17): tap Menu, check the two-column group links, press Escape and confirm focus returns to Menu, tap outside.
- **1366×768** (JITM-07 §2.14 acceptance size), especially:
  - the library editor (does the sticky save bar cover Beat 1's timing row?);
  - Admission (Save above the fold?);
  - Waitlist with entries (queue box about 238px?).
- **Other configurations:** dark theme (laptop-dark and phone-dark staff); 320px; 200% text; tablet 834 (the 156–208px sidebar band from 761 to 1100px).
- **Administrator MFA** enrollment and verification screens: deliberately not captured (JITM-12 §2.19).
- **Production data:** whether production's published invitation wording is still v1 ("five"). Not checked; no production access in this lane.
