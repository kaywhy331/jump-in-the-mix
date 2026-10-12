> Lane report TDY (Today, review, Quick Add) of the [UX, design and layout audit](../../UX_DESIGN_AUDIT_2026-10-08.md), 2026-10-08, commit `f23db11`. Written read-only by a review lane and consolidated by the lead auditor. Paths under `<captures>/` refer to the private local capture set (not committed; see [README](../README.md)); a selection is in [`../captures/`](../captures/). Severity adjustments made at consolidation are listed in [FINDINGS.md](../FINDINGS.md).

# TDY — Today queue, review, handoff, outcomes, invitations on Today, first Today, Quick Add

Lane audit of `f23db11` (production `dae3fab` plus docs), local production build with synthetic data. Screenshot paths are relative to `<captures>`. Code paths are repo-relative in the repository. Evidence labels follow JITM-12 §2.1. Severity follows JITM-17 §2.14. I use MEDIUM for a rule violation that costs time or clarity in the daily loop, and LOW for polish, or for a deviation with almost no workflow cost.

---

## 1. Lane summary

**Verdict: not yet optimal for an owner clearing 20+ follow-ups on a phone.** The core is sound:
- a short text's review fits one phone screen, with the handoff, Copy and all outcomes visible (JITM-08 §2.3);
- opening an app is never treated as sending, and the return tray asks what happened (JITM-08 §2.2);
- every outcome has a 10-second Undo;
- unavailable channels stay visible with a reason and a fix.

The friction is in the list around the review:
- **Low density.** The first phone screen shows about 3.5 follow-ups at 390×844 and about 1.5 at 320×700. Rows are 117px tall (the export's are about 96px), and a non-dismissible invitation strip takes about 108px above the queue.
- **No momentum.** Each item costs three taps plus a scroll, and nothing opens the next follow-up. Counts and Done stay frozen while an Undo is showing, so a fast owner never sees progress.
- **Unclear rows.** The Mix name and the reason run together ("Estimate follow-up Referral follow-up"). The same person appears twice with nothing linking the rows. The first card's "Review" label is clipped.
- **Untrue or opaque details.** "Later today" lands tomorrow morning in the evening. The snooze confirmation names no time. Filter shows raw codes ("sms", "whatsapp") and filters on a channel the card no longer shows. "Compact scan" changes nothing visible on a phone. Quick Add shows "2026-10-09 14:00".

**Core question: how many taps, and what would make it faster?**
- **Phone today:** Review → Open text → (send in Messages, switch back) → Sent in the return tray → scroll to the next row. That is 3 taps, a round trip to the native app and a scroll per item: about 66 taps for 22 follow-ups. Switching channel adds a tap and a full-screen "Loading follow-ups…" flash.
- **Desktop today:** 2–3 clicks per item. The first item opens in the docked pane on its own. Code reading says that after an outcome the next one only docks once the 10-second Undo window has closed and the list has refreshed (INFERRED).
- **Faster without breaking any non-negotiable:**
  - after each outcome, open the next due follow-up's review at once, keep the Undo reachable, and show a progress count. That makes 2 taps per item on a phone with no scrolling.
  - denser rows that open the review when tapped anywhere.
  - one compact, dismissible invitation prompt.
  - group a person's same-day follow-ups.
  - truthful snooze times and plain dates.

  The owner still reviews every message and sends it from their own app.

**Top 5 changes:**
1. "Work through Today" auto-advance with live counts (rec 1).
2. Real compact phone rows of about 84–96px (rec 2).
3. One compact, dismissible invitation prompt shown after the first recorded outcome (rec 3, Kevin decision under JITM-09 §2.9).
4. Same-person grouping, with "also due" and "skip the earlier one" (rec 4, Kevin decision).
5. Trust fixes:
   - snooze times and confirmation (TDY-08);
   - plain filter by the version the card shows (TDY-05);
   - message field sized to the message (TDY-11);
   - review context: last note and history (TDY-10);
   - Quick Add summary in plain dates with the method (TDY-17).

**Lead observations checked:**

| Obs | Result |
|---|---|
| O1 | **True.** The 1440 screen shows the Today strip plus the rail's "3 invitations left". Phone and tablet add the More badge, and tablet adds the header gift badge. JITM-09 §2.9 requires all of these, so the problem is rule-conformant cost: rec 3 is a Kevin decision. |
| O2 | **True, corrected.** It is the Mix name ("Estimate follow-up") plus the follow-up's reason: Sarah's saved-date label "Referral follow-up" (`prisma/seed.ts:114`). It is not two Mix names. Root cause in TDY-02. |
| O3 | **True.** Marcus Reed's overdue Beat 1 text (Oct 6) and today's Beat 2 call (Oct 8) come from the same Mix run. See TDY-13. |
| O4 | **True,** and it gets worse for email, where the body is cut off. See TDY-11. |
| O5 | **True, but deliberate.** `src/styles/phone-icons.css:15-16` adds the "Review" caption so the icon reads as "open", not "call". It is a main reason rows are tall (TDY-01), not a defect by itself. |
| O28 | **True,** plus two more issues: the filter keys on the Beat's original channel, and "Compact scan" does nothing visible. See TDY-05 and TDY-06. |
| O29 | **True.** Root cause is CSS (TDY-03). It also happens at 320px and on a new account's first card. |
| O30 | **True in code** (`src/components/WorkflowAttention.tsx:10`, shown under a "Needs your input" heading). I did not re-capture it at runtime. |
| O31 | **True.** Still open from the beta audit's UX-05. See TDY-15. |
| O32 | **True for ≤600px only;** 601–767px is full screen. See TDY-16. |
| O33 | **True.** The event summary has the same problem, and the reason defaults to "Follow up". See TDY-17. |
| O34 | **Not a defect.** One-line previews are meant to flatten line breaks, as in the export. Optional: show an email's subject instead of "Hi Sarah,". |
| O37 | **True.** `range=all` comes from `src/lib/onboarding-actions.ts:35`. The strip is shown by rule. "Tap Review" is valid, but that Review label is the clipped one. See TDY-18. |

---

## 2. Page and overlay verdicts

### 2.1 Today queue — phone (390×844, 320×700; light and dark)
- **Purpose:** see who to contact next, open the next review in one tap, and clear 20+ quickly.
- **What works:**
  - Overdue and Today sections with right-aligned counts and sentence-case headings;
  - 40px avatars; name and time on one line; one-line Newsreader preview;
  - "2 days overdue" in words (JITM-10 §2.7);
  - the No Mix line at the end (JITM-09 §2.77);
  - the central Quick Add bubble;
  - clean dark theme and no sideways scroll at 320 (`shots/sweep/phone-dark/today.png`, `shots/sweep/phone320-light/today.png`).
- **What gets in the way:**
  - density (TDY-01): the 117px row height comes from stacking the 52×44 "Review" caption over a 44px "•••";
  - the invitation strip (about 108px, no dismiss);
  - the subtitle wraps "· 1 / overdue.";
  - run-together reason and Mix (TDY-02);
  - clipped first card (TDY-03);
  - the same person twice with nothing linking the rows (TDY-13);
  - frozen counts while working (TDY-12);
  - no date in the header (the export shows "Friday, Sep 18").
- **Verdict: Needs rework.**
- **Recommended structure:**
  - **Header:** "Today" plus one line, e.g. "Thu, Oct 8 · 23 to do · 1 overdue", beside icon-only Search and Filter.
  - **Invitations:** no strip until the owner's first recorded outcome, then a one-line dismissible chip (rec 3).
  - **Rows of about 84–96px:** avatar · name + time · "reason · Mix" on one line · one-line preview.
  - **Tapping:** tapping anywhere on the row opens the review. The right column keeps only the channel glyph, or the caption if Kevin keeps the 09-22 decision. "•••" moves into the review header, or behind long-press/swipe (known open decision: JITM-08 §6 swipe).
  - **Grouping:** a person with two due follow-ups gets one row (rec 4).
  - **Progress:** after the first outcome, a slim "4 of 23 done" line under the header.
  - **Next 7 days:** becomes a row link ("Next 7 days · 34 ›").

### 2.2 Today — tablet (834×1194 portrait; 1194×834 landscape)
- **Purpose:** same as desktop, with queue and review side by side.
- **What works:** the queue and docked review from 768px (JITM-07 §2.15). The review fits without scrolling, with outcomes below the wording (JITM-07 §2.16). The editor is kept on resize (`shots/sweep/tablet-light/today.png`, `shots/sweep/tabletLand-light/today.png`).
- **What gets in the way:**
  - in the 300px queue, the reason wraps under the Mix name, making 4-line rows;
  - Search and Filter wrap under the subtitle;
  - three invitation prompts on one screen (strip, header gift badge "3", More badge "3");
  - no last note (the export's TabletToday shows "Last note, Sep 15");
  - at 1194, "•••" is 44×36 on a touch screen (allowed above 900px; gap noted in §6), and the rail's "Profile" breaks as "Profil / e" (shell lane).
- **Verdict: Good, fix details.**
- **Recommended structure:** single-line "reason · Mix", tools inline with the title, the header badge as the only tablet invitation prompt, and "Last note" under Reach.

### 2.3 Today — desktop (1440×900, 1920×1080; light and dark)
- **Purpose:** clear the queue with a mouse, with the person's context at a glance.
- **What works:**
  - the first follow-up opens docked automatically;
  - from 1200px, Snooze and Skip Beat sit by the heading and Mark sent beside the send controls (JITM-07 §2.16);
  - Copy sits beside the handoff;
  - the queue stays visible;
  - dark mode is clean (`shots/sweep/laptop-dark/today.png`).
- **What gets in the way:**
  - two rows are highlighted when a review is open (TDY-09);
  - the context column holds only phone and email (TDY-10);
  - the composer has no maximum width: about 90-character lines at 1440 and a 190px bubble for a 2-line text. This is known (JITM-07 §6) and re-confirmed here.
  - after an outcome, the pane shows "One conversation at a time." until the Undo window closes and the list refreshes (INFERRED);
  - the strip and the rail say the same thing ("You have 3 invitations to share." / "3 invitations left");
  - Mark sent sits about 500px from Open text at 1440.
- **Verdict: Good, fix details.**
- **Recommended structure:**
  - cap the composer at 680px, as in the export;
  - a 340px context column with Reach, Last note and the 3 latest History items, as in the export;
  - open the next follow-up as soon as an outcome is recorded;
  - a distinct "open" row state;
  - optional J/K next/previous keys (a new single-key shortcut needs Kevin, JITM-08 §2.34).

### 2.4 Review sheet — phone (text, email, call, no method)
- **Purpose:** check the wording, choose the channel, hand off to the owner's app, record the outcome.
- **What works:**
  - one screen for a short text, from 390 down to 320 (`shots/ov-rev-1-tap-phone-light.png`, `shots/sweep/phone320-light/today-review.png`);
  - opens on the Recommended version (JITM-09 §2.26), with all three chips visible;
  - disabled with reasons (`shots/overlays/phone-light/x-review-nomethod.png`);
  - "Open text" is primary, with Copy beside it;
  - the outcomes stay visible;
  - the heading, not the textarea, is focused, so the keyboard stays down (JITM-08 §2.12);
  - the draft autosaves.
- **What gets in the way:**
  - the message field ignores content length (TDY-11);
  - choosing Email flashed the route loading page (TDY-07);
  - no last note and no way to the contact (TDY-10);
  - the reason is never shown (TDY-02);
  - the subtitle says "Follow-up" when there is no stage;
  - call copy and "Mark done" (TDY-24);
  - Beat dates are hidden navigation links (TDY-14);
  - the no-method state offers two different fixes (TDY-19).
- **Verdict: Good, fix details.**
- **Recommended structure:** header (name; stage, or else the reason) → "Estimate follow-up · Beat 1 of 3 · 2 days overdue", as in the export's "Beat 1 of 2" → an auto-sized bubble → chips → "To +1 555 010 1002" → [Open text] [Copy] → Mark sent · Snooze · Skip. Add a collapsed "About Marcus" row (last note, Open contact) under the header.

### 2.5 Docked review across breakpoints (767 → 1700)
- **What works:** clean switches at 767/768 (modal ↔ docked), 900/901 (bottom nav ↔ rail), 1199/1200 (outcomes move to the header) and 1599/1600 (context column), as in JITM-07 §2.15–§2.16 (`shots/breakpoints/today-review-*.png`).
- **What gets in the way:**
  - on direct links, the focused heading draws a full-width box that overlaps Snooze at 1200 and looks like an editable field (TDY-23);
  - the context column appears only from 1600px, at 280px (known: JITM-07 §6, 340px in the export);
  - between 768 and 900, the app header, bottom nav and a 300px queue leave the review narrow (known JITM-07 §6 header).
- **Verdict: Good, fix details.**

### 2.6 Handoff → return tray → outcome → Undo
- **Purpose:** record what really happened, see the next date, undo a mistake.
- **What works:**
  - "Open …" closes the sheet so the return tray is reachable;
  - the tray says opening an app is not sending and offers Sent / Not sent, or Connected / Left voicemail / No answer / Did not call for calls, plus "Later" (`src/components/JumpWorkflow.tsx:403-413,477-485`). This is VERIFIED-CODE only; the tray was NOT RUN.
  - the confirmation names the next date and offers Undo for 10 seconds (JITM-08 §2.4; `shots/ov-rev-4-marksent-phone-light.png`);
  - Undo restores the row in place (`shots/ov-rev-6-after-undo-phone-light.png`).
- **What gets in the way:**
  - stale counts, and the Undo is likely hidden behind the next modal (TDY-12);
  - nothing opens the next follow-up;
  - "Step 3 · …" refers to steps 1 and 2 that appear nowhere;
  - the confirmation says "Follow-up completed" although the owner pressed "Mark sent";
  - "for a moment" instead of a clear limit;
  - no weekday (TDY-22);
  - a light card instead of the export's dark toast (known: JITM-06 §6);
  - the refresh notice when returning from the app (known: JITM-08 §6, which asks whether Today should refresh silently: I recommend yes).
- **Verdict: Good, fix details.**

### 2.7 Row menu (•••) and Stop Mix confirmation
- **Purpose:** snooze, skip or stop without opening the review.
- **What works:** clear sections ("Already finished?", Snooze, Choose a day), a separated danger zone, Stop Mix behind a confirmation that keeps history (JITM-09 §2.30), and Recent activity (`shots/overlays/phone-light/today-rowmenu.png`, `today-stopmix.png`).
- **What gets in the way:**
  - it duplicates the review's outcomes, while costing 44px of height on every row (TDY-01);
  - "Mark done" where the review says "Mark sent" (TDY-25);
  - the snooze problems (TDY-08);
  - the title reads "Stop New project inquiry for Ava Alvarez?".
- **Verdict: Good, fix details.**
- **Recommended structure:** keep the content, but reach it from the review header (phone) and long-press/swipe on the row, so rows can lose the second control.

### 2.8 Snooze sheet (from the review and from the menu)
- **Purpose:** move a follow-up to a better time.
- **What works:** quick presets, a day picker that cannot go earlier than allowed, and the sheet stacks predictably over the review (JITM-08 §2.14).
- **What gets in the way:** TDY-08: no times on the chips, an untrue "Later today", a time-less confirmation and a raw time zone.
- **Verdict: Good, fix details.**
- **Recommended structure:**
  - chips with times: "Later today · 9:30 PM" (only when it stays today), "Tomorrow · 10:00 AM", "Mon, Oct 12 · 10:00 AM", "Next week · Thu, Oct 15";
  - "Pick a day" with the time shown;
  - confirm "Snoozed to Fri, Oct 9 at 10:00 AM."

### 2.9 Filter sheet, layout modes and the week view
- **Purpose:** focus on one kind of work, such as overdue only, texts only or the week ahead.
- **What works:** changes apply immediately, as the sheet says (JITM-08 §2.29), and the sheet layout is clean (`shots/overlays/phone-light/today-filter.png`, `laptop-light/today-filter.png`).
- **What gets in the way:**
  - raw codes, and a filter key that disagrees with the row icon (TDY-05);
  - "Compact scan" is inert;
  - the unlabeled layout links read like dialog buttons;
  - "Review overdue" repeats "Priority: Overdue commitments";
  - "Next 7 days" drops overdue items (TDY-06);
  - four selects for what is usually one choice.
- **Verdict: Needs rework.**
- **Recommended structure:** three controls:
  - **Show:** Due now · Next 7 days · All;
  - **How:** Any · Text · Email · Call, matched to the version each card shows;
  - an **"Overdue only"** switch.

  Move Status to the Done group. Remove the layout links, or make Compact real and put it in the header.

### 2.10 Search sheet
- **What works:** searches name, Mix and reason; keeps the other filters; Clear search.
- **What gets in the way:** a Search button press and a route change, against "apply at once"; a clipped placeholder; the label repeats the description (TDY-21).
- **Verdict: Good, fix details.**

### 2.11 Invitation prompts on Today (strip, "ready to send" card, invitation review)
- **Purpose:** remind the owner to share invitations, and send the ones already prepared.
- **What works:**
  - honest wording: "Not sent yet. Open each one and send it from your own email or text app." (JITM-04 §2.8–§2.9);
  - "Review and send" opens that invitation;
  - an email-only invitee gets Text and Call disabled with reasons (`shots/flow-inv-6-review.png`).
- **What gets in the way:**
  - **The strip:** never dismissible (`src/app/(app)/jumps/page.tsx:495`). It is about 108px on phones (15% of an 844px screen) and is shown to a brand-new account on day one, alongside rail, More and tablet header prompts. JITM-09 §2.9 requires these, so this is rule-conformant cost.
  - **Copy:** the strip and rail word the same thing differently ("You have 3 invitations to share." / "3 invitations left"; noted in `docs/STANDARDS_AUDIT_2026-09-28.md:170`, still open).
  - **Duplication:** the prepared invitation appears twice, and the address shows twice, truncated (TDY-04). The success notice repeats "It hasn't been sent yet."
  - **Invitation review:** the title breaks the address mid-word; a one-dot Beat track; "Skip Beat" for a non-Beat (TDY-25); an irrelevant Call chip; the greeting addresses an email address (O35, invitation lane).
  - **Combined height:** with a prepared invitation, the success notice, card and strip push the queue to y≈555px.
- **Verdict: Needs rework (strip: Kevin decision).**
- **Recommended structure:**
  - the More/rail badge always;
  - on Today, a one-line chip only after the first recorded outcome, with "Not now" hiding it for a set period;
  - prepared invitations as one compact group at the top, not repeated in the Today list.

### 2.12 First Today after onboarding (phone; brand-new account at 1440)
- **Purpose:** prove value; the owner reviews and sends their first follow-up (JITM-01 §2.12, §2.14).
- **What works:**
  - the welcome names the person and promises a Review that really exists (JITM-09 §2.25);
  - the Mega-Mix is offered as an optional next step (JITM-09 §2.20);
  - on desktop the first review is already docked (`shots/riley-today-laptop.png`).
- **What gets in the way (TDY-18):**
  - "Filter 1" on arrival;
  - an open "Upcoming" group that shows the same person again;
  - the strip between the welcome and the follow-up;
  - the "Review" label the welcome tells them to tap is clipped (TDY-03);
  - "Tap" is phone wording on desktop;
  - the starter text says "from my business" (known: JITM-09 §6).
- **Verdict: Good, fix details.**

### 2.13 Quick Add (open, typed, review, other ways; phone light and dark, tablet, laptop)
- **Purpose:** capture a person, a note and a follow-up from anywhere in seconds.
- **What works:**
  - one tap from every page (JITM-09 §2.8);
  - the capture field is focused (JITM-08 §2.12);
  - Speak, with the required speech note (JITM-04 §2.17);
  - explicit person choice;
  - "Save all 3" with sticky actions;
  - asks before discarding a draft (JITM-08 §2.30);
  - a well-sized modal on tablet and laptop (`shots/ov-qa-*`).
- **What gets in the way:**
  - not full screen on phones (TDY-16);
  - raw "Saving as" values, a hidden method and a generic reason (TDY-17);
  - the always-visible speech note pushes Continue down;
  - the review is a long form of checkboxes and disclosures, where the export uses three compact "Saving as" rows;
  - on phones, "Edit capture" is full width with the same weight as "Save all 3".
- **Verdict: Good, fix details.**
- **Recommended structure:**
  - a full-screen phone sheet;
  - "Saving as" as compact rows (New person · Note · Follow-up "Call · Fri, Oct 9 at 2:00 PM"), each opening its editor inline, as in the export;
  - ask "How do you reach Jordan?" only when no method was found;
  - the mic beside the primary button (export QuickAdd.png);
  - "Edit capture" as a text button.

---

## 3. Findings table

| ID | Rule | Finding | Evidence | Label | Severity | Fix direction |
|---|---|---|---|---|---|---|
| TDY-01 | JITM-01 §2.16 (know who to contact next); JITM-06 §2.33 (export row anatomy) | The phone's first screen shows about 3.5 follow-ups at 390×844 and about 1.5 at 320×700. Rows are 117 CSS px; the export's are about 96. The right column stacks a 52×44 "Review" (icon over caption) and a 44px "•••". The 108px invitation strip and a 2-line subtitle start the first card at y≈282 (export ≈172). | `shots/sweep/phone-light/today.png`; `shots/sweep/phone320-light/today.png`; `shots/export/Main.png`; `src/styles/phone-icons.css:17-21,58-72`; `src/app/(app)/jumps/page.tsx:469,495` | VERIFIED-RUNTIME (pixel measurement) + VERIFIED-CODE | MEDIUM | Dense row; tap anywhere on the row opens the review; one right-column control (rec 2). Compact or dismissible strip (rec 3). One-line subtitle. |
| TDY-02 | JITM-04 §2.1 (plain); none — gap (no rule for the row's reason line) | Rows print the Mix name and the follow-up's reason as two unlabeled spans. `mobile-clarity.css:22` removes the " · " separator that `mobile-ux.css:79` adds, so rows read "Estimate follow-up Referral follow-up" (Mix + Sarah's saved-date label). On tablet and at 320 they wrap into two look-alike lines. The review never shows the reason, except as a hover `title` on the Beat dates. INFERRED: Quick Add follow-ups would lead with the hidden Mix name "One-time follow-ups". | `lanes/crops/TDY/row-meta-runtogether.png`; `shots/sweep/tablet-light/today.png`; `src/app/(app)/jumps/page.tsx:400,405`; `src/styles/mobile-clarity.css:22`; `src/styles/mobile-ux.css:79`; `src/lib/one-time-follow-up.ts:34` | VERIFIED-RUNTIME + VERIFIED-CODE (one-time row: INFERRED) | MEDIUM | Lead with the reason, then "· Mix" on one line. Show the reason under the Mix name in the review. Never show "One-time follow-ups". |
| TDY-03 | JITM-06 §2.31 (fix the owning rule); JITM-10 §2.3 (nothing clips) | At ≤767px the first ("next") card's "Review" label is cut at the right edge and its avatar touches the left edge. A legacy −8px side margin (`product.css:148`) survives the newer 10px/8px padding (`design-workspaces.css:229`), and `.page { overflow-x: clip }` (`mobile-ux.css:5`) clips the bleed. It is the same card a new owner is told to "Tap Review" on. | `lanes/crops/TDY/overdue-review-clip.png`; `shots/sweep/phone320-light/today.png`; `shots/flow-onb-5-today-welcome.png` | VERIFIED-RUNTIME + VERIFIED-CODE | LOW | Remove the margin at `src/styles/product.css:148`, or restore 16px padding with an unclipped bleed. |
| TDY-04 | JITM-09 §2.24 (Today order; duplicates not addressed) | A prepared invitation shows twice: in "1 invitation ready to send", where the address appears twice, both truncated ("riley.newowner@exam…" / "riley.newowner@examplet…"), and again as the last row of the Today list. The review title breaks the address mid-word ("example.t / est"). | `shots/flow-inv-5-today.png`; `lanes/crops/TDY/inv-today-full-2.png`; `shots/flow-inv-6-review.png`; `src/app/(app)/jumps/page.tsx:143,488-494` | VERIFIED-RUNTIME | LOW | Keep invitations in their card only (leave access-invite rows out of the list). Show the address once. Break long addresses at "@". |
| TDY-05 | JITM-05 §2.11 (code names); JITM-04 §2.3 (Text, Email, Call stay plain) | Filter "How" lists the raw channel codes "sms", "email", "call", "voicemail", "whatsapp": all five, though the review offers only Text, Email and Call. It also filters on the Beat's original channel, not the version the card opens on. After Sarah's card switched to Email (envelope icon), "How: email" would not find her. The same helper writes "the plan's sms" into the automatic-hold note. | `shots/overlays/phone-light/today-filter.png`; `shots/ov-rev-6-after-undo-phone-light.png`; `src/app/(app)/jumps/page.tsx:109,111-115,152,341-342,479` | VERIFIED-CODE (+ lead's O28 dump) | MEDIUM | Offer "Text / Email / Call" matched to the version each card shows (the owner's choice, otherwise the recommended one). Reuse `choiceOption` labels in the hold note. |
| TDY-06 | JITM-04 §2.1 (honest) | "Compact scan" leaves phone rows unchanged (117px). It only drops the next-card highlight, and on desktop it stops the auto-opened review. The three layout links sit unlabeled at the bottom of Filter, where they look like dialog buttons. "Review overdue" repeats "Priority: Overdue commitments". "Next 7 days" hides overdue items. | `shots/overlays/phone-light/today-compact.png` vs `shots/sweep/phone-light/today.png`; `shots/overlays/laptop-light/today-compact.png`; `shots/overlays/laptop-light/today-filter.png`; `shots/overlays/phone-light/today-week.png`; `src/app/(app)/jumps/page.tsx:136,169,352,476,482` | VERIFIED-RUNTIME + VERIFIED-CODE | MEDIUM | Make Compact real (rec 2) or remove it. One "Overdue only" control. Keep overdue items visible in "Next 7 days". |
| TDY-07 | JITM-08 §2.33 (never close what the owner is working on), §2.3 | Choosing Email in the phone review replaced the whole screen with the route loading page ("Loading follow-ups… Your saved work is being loaded…"). The choice is saved, then `router.refresh()` re-renders Today. Another capture shows the sheet back with Email selected, so the effect is transient. | `shots/ov-rev-2-email-phone-light.png`; `shots/overlays/phone-light/today-review-email.png`; `src/components/FollowUpChannelChoice.tsx:41-46`; `src/app/(app)/jumps/loading.tsx:1` | VERIFIED-RUNTIME (one capture; duration NOT RUN) | MEDIUM | Swap the version in place, or refresh without showing the route fallback while a review is open. |
| TDY-08 | JITM-04 §2.7 (confirmation names the day and time), §2.1 (honest) | Snooze chips show no time. "Later today" means now + 4 hours; from about 4 PM that falls in quiet hours and lands the next morning at the quiet-hours end (8:00 AM default), yet it is still labelled "Later today" (captured at 7–8 PM). The confirmation says only "Follow-up snoozed." "Choose a day" says "Uses your default follow-up time in America/New_York." with no time. | `shots/overlays/phone-light/today-review-snooze.png`; `shots/overlays/phone-light/today-rowmenu.png`; `src/lib/snooze-schedule.ts:79-89,145-155,173-178`; `src/lib/snooze-actions.ts:74`; `src/app/(app)/jumps/page.tsx:360,459` | VERIFIED-CODE + VERIFIED-RUNTIME (chips offered at 7–8 PM; resulting time NOT RUN) | MEDIUM | Chips with resolved times; hide or rename "Later today" when it rolls over to tomorrow; "Snoozed to Fri, Oct 9 at 8:00 AM." |
| TDY-09 | JITM-10 §2.7 (selection never by color alone) | From 768px the open row and the "next" row share the same violet wash and radius, so two rows are highlighted. With Marcus Reed listed twice, both highlighted rows read "Marcus Reed". The open row has no `aria-current` or `aria-expanded`. | `lanes/crops/TDY/laptop-two-highlights.png`; `shots/overlays/laptop-light/today-review-email.png`; `src/styles/design-workspaces.css:41-42,111` | VERIFIED-RUNTIME + VERIFIED-CODE | MEDIUM | A distinct open state (left bar, bold name, `aria-current="true"`). Drop the "next" highlight while any review is open. |
| TDY-10 | JITM-06 §2.33 (export DesktopToday, TabletToday) | Review context is thin. From 1600px the context column holds "Reach" + phone + email (+ contact notes when set) + Open contact; the export shows "Last note" and "History". Tablet and laptop show the same block below the actions. On phones the block is hidden, so the review offers no way to the profile or the last note. | `shots/sweep/desktop-light/today.png`; `shots/breakpoints/today-review-1600.png`; `shots/export/DesktopToday.png`; `shots/export/TabletToday.png`; `src/app/(app)/jumps/page.tsx:405`; `src/styles/design-workspaces.css:260` | VERIFIED-RUNTIME + VERIFIED-CODE | MEDIUM | Add the last note and the 3 latest history items (export). On phones, a collapsed "About {name}" row (last note, Open contact). |
| TDY-11 | JITM-08 §2.3; JITM-10 §2.3 | The message field ignores content length: minimum 115px on phones and 190px on desktop, with no auto-grow. Short texts float in an oversized bubble with a native resize grip (`resize: vertical`). Email bodies are cut off ("Alex Morgan" clipped) and scroll inside the field, so the owner cannot see the whole email before sending. | `shots/sweep/laptop-light/today.png`; `lanes/crops/TDY/review-email-cut.png`; `shots/overlays/phone-light/today-review-email.png`; `src/components/EditableFollowUpAction.tsx:416`; `src/styles/mobile-clarity.css:29`; `src/styles/design-workspaces.css:119`; `src/styles/product.css:20` | VERIFIED-RUNTIME + VERIFIED-CODE | MEDIUM | Size the field to its content, with a cap. No resize grip inside the bubble. Keep the outcome row visible. |
| TDY-12 | JITM-08 §2.4, §2.33 (Undo window; no disturbance); none — gap (progress feedback) | After Mark sent, the header still read "23 follow-ups need your attention", "Today 22" and "Done 0". The list and its counts refresh only after the 10-second Undo marker clears. INFERRED: an owner finishing items faster than one every 10 seconds never sees counts move. On phones the Undo card is fixed outside the top layer, so opening the next review within 10 seconds puts it behind the modal backdrop. INFERRED: after Undo, an empty "Needs your input" heading with "Your recorded updates are being prepared. This list will refresh." can appear. | `shots/ov-rev-4-marksent-phone-light.png`; `shots/ov-rev-5-undo-visible-phone-light.png`; `src/lib/today-update-state.ts:5`; `src/components/useTodayUpdates.ts:48-49,61`; `src/components/TodayNavigation.tsx:101`; `src/components/WorkflowAttention.tsx:6-10` | VERIFIED-RUNTIME (stale counts) + VERIFIED-CODE; continuous staleness and hidden Undo: INFERRED | MEDIUM | Update counts and Done immediately without reordering. Show Undo inside the next sheet. Hide the empty heading while updates are being prepared. |
| TDY-13 | none — gap (JITM-01 §2.16; JITM-04 §2.1 calm) | Marcus Reed has an overdue Beat 1 text (Oct 6) and today's Beat 2 call (Oct 8). They appear as unrelated rows in two sections. The review never mentions the other one, and nothing suggests skipping the stale text before calling. The risk is texting and calling one customer with the same question on the same day. | `shots/sweep/phone-light/today.png`; `shots/overlays/phone-light/today-review-call.png`; `src/app/(app)/jumps/page.tsx:293-294` | VERIFIED-RUNTIME | MEDIUM | One row per person per day ("Marcus Reed · 2 due"). In the review: "Also due: Call today — skip the earlier text?" (rec 4, Kevin decision). |
| TDY-14 | JITM-09 §2.13 (exact link); JITM-10 §2.1, §2.2 | The dates on the Beat track are links that switch Today to the single-follow-up view (`?jump=…&range=all`): the queue shrinks to one item with "Filter 2", and the only ways back are Filter → Clear filters or the Today tab. Invitation "Review and send" and Quick Add "View follow-up" land in the same view. The dates are 12px with no weekday (Oct 10 and 11 are a Saturday and Sunday), and the last link is 32px wide. | `shots/breakpoints/today-review-768.png` ("Showing 1 of 1"); `shots/overlays/laptop-light/_aria.txt` (track links); sweep `_results.json` (12px times, "32x44 Oct 11"); `src/app/(app)/jumps/page.tsx:172,283,405,492`; `src/styles/design-workspaces.css:244-246` | VERIFIED-CODE + VERIFIED-RUNTIME | MEDIUM | Dates that open that Beat inside the current sheet, or plain text. A "Show all of Today" link in the single view. 13px dates with weekdays; 44px targets. |
| TDY-15 | JITM-05 §2.11 | Still open from beta audit UX-05. A link to a stopped or cancelled follow-up prints the stored internal code. After Stop Mix from a single-follow-up view it reads "This follow-up is no longer pending: mix stopped for contact"; other values include "reconciled", "workflow held" and "journey.stage.exit". The review's date list is announced as "Pending Beats in this Mix occurrence". | `src/app/(app)/jumps/page.tsx:405,418,513`; `src/lib/mix-stop-actions.ts:51`; `src/lib/jump-engine.ts:39,43-50`; `docs/beta-audit-2026-09-26/lanes/08-design-a11y-copy.md:171-176` | VERIFIED-CODE (runtime NOT RUN) | MEDIUM | Map each code to a sentence, with a generic fallback. aria-label "Follow-up dates in this Mix". |
| TDY-16 | JITM-08 §2.11 | At ≤600px Quick Add opens as a bottom sheet at least 640px tall: the top 204px of an 844px phone still shows dimmed Today, and the lower third of the sheet is blank. Full screen applies only at 601–767px, because `design-system.css:116` overrides `components.css:381`. | `shots/ov-qa-1-open-phone-light.png`; `shots/ov-qa-1-open-phone-dark.png`; `src/styles/design-system.css:116`; `src/styles/components.css:311,381`; `src/styles/popups.css:29-32` | VERIFIED-RUNTIME + VERIFIED-CODE | LOW | Drop the ≤600px override (height: 100dvh) and keep the actions pinned. |
| TDY-17 | JITM-09 §2.22; none — gap (date and time format) | "Saving as" shows raw values. The follow-up reads "Follow up / 2026-10-09 14:00 · Edit": ISO date, 24-hour time, and no method, although "Call him" set Call. The event reads "{date} {time} · 60 min", and the note says "Dates and times use America/New_York." The reason defaults to "Follow up", which also becomes the call notes, so "wants a quote for a new fence" stays only in the private note and Friday's row will just say "Follow up". | `lanes/crops/TDY/qa-followup-summary.png`; `shots/ov-qa-3-review-phone-light.png`; `src/components/QuickAdd.tsx:166,179,180`; `src/lib/quick-add-capture.ts:108,139-141,150` | VERIFIED-RUNTIME + VERIFIED-CODE | MEDIUM | "Call · Fri, Oct 9 at 2:00 PM". Mention the time zone in plain words, and only when the device's zone differs. Seed the reason from the capture's "wants…/about…" clause. |
| TDY-18 | JITM-09 §2.25; JITM-01 §2.12 | The first Today after onboarding is a filtered view (`range=all`): "Filter 1" the owner never set, an open "Upcoming" group showing the same person's second Beat (it looks like a duplicate), the strip between the welcome and the follow-up, and a clipped "Review" right under "Tap Review to begin". | `shots/flow-onb-5-today-welcome.png`; `shots/flow-onb-5-today-welcome-full.png`; `src/lib/onboarding-actions.ts:32-37`; `src/app/(app)/jumps/page.tsx:283,435` | VERIFIED-RUNTIME + VERIFIED-CODE | LOW | Land on the default view and have the welcome link straight to the first follow-up. Don't count the welcome's date range as a filter. Hide the strip until the first outcome (rec 3). |
| TDY-19 | JITM-08 §2.6; JITM-04 §2.14 | With no phone or email, all channels are disabled with reasons, but two different fixes are offered: "Add an email address" under the chips and an "Add phone" primary button. The hint still says "Open your app to send, then record what happened." Desktop shows an empty "Reach Hana Hayes" heading and wraps Copy under Add phone. | `shots/overlays/phone-light/x-review-nomethod.png`; `shots/overlays/laptop-light/x-review-nomethod.png`; `src/components/FollowUpChannelChoice.tsx:64`; `src/components/EditableFollowUpAction.tsx:443,458` | VERIFIED-RUNTIME + VERIFIED-CODE | LOW | One action: "Add a phone number or email". Hint: "Add a way to reach Hana to send this." Hide the empty heading. |
| TDY-20 | JITM-10 §2.1 | "Next 7 days 34 ⌄" is a disclosure that, in the default view, opens to one unstyled link, "View upcoming follow-ups" (a 161×16 target), instead of the 34 items. Done's link has the 44px style. | `shots/sweep/phone-light/today-full-bottom.png`; sweep `_results.json` ("161x16 View upcoming follow-ups"); `src/app/(app)/jumps/page.tsx:504-505`; `src/styles/design-workspaces.css:240` | VERIFIED-CODE + VERIFIED-RUNTIME (metric) | LOW | Make the summary row the link ("Next 7 days · 34 ›", as the export's "Later this week 4 ›"), or load the items. |
| TDY-21 | JITM-08 §2.29 (search applies at once) | Today search needs a Search button press, then changes route (`router.push`). The phone placeholder is clipped ("Search this follow-up viev"), and the field label repeats the sheet description. | `shots/overlays/phone-light/today-search.png`; `src/app/(app)/jumps/page.tsx:470-473` | VERIFIED-RUNTIME + VERIFIED-CODE | LOW | Filter as the owner types (debounced), or change the doc. Placeholder "Name, Mix or reason". |
| TDY-22 | JITM-06 §2.33 (the export shows weekdays) | Dates on Today have no weekday: the track ("Oct 6 · Oct 8 · Oct 11"), "Next scheduled: Oct 10, 10:00 AM" and upcoming rows ("Oct 10, 10:00 AM"). Oct 10 and 11 are a Saturday and Sunday; the export writes "Next beat Mon" and "Mon, Sep 21". When an outcome schedules a new follow-up, the confirmation's "Next follow-up:" time uses the browser's locale and time zone, not the owner's display settings. | `shots/ov-rev-4-marksent-phone-light.png`; `shots/overlays/phone-light/x-today-week-full.png`; `shots/export/TodaySent.png`; `src/components/JumpWorkflow.tsx:139-141,252` | VERIFIED-RUNTIME + VERIFIED-CODE | LOW | Short dates with weekdays ("Sat, Oct 10"), formatted with the owner's display preferences. |
| TDY-23 | JITM-07 §2.16 (space kept for long names) | On direct links at 901–1279px and on a new account's first docked review, the focused heading draws a full-width box that runs under Snooze at 1200px and makes the name look like an editable field. | `lanes/crops/TDY/header-focus-snooze-overlap-1200.png`; `shots/riley-today-laptop.png`; `src/components/Sheet.tsx:47`; `src/styles/design-details.css:45-50` | VERIFIED-RUNTIME | LOW | Fit the heading to its text, and give script-moved focus a quieter ring; keyboard focus stays clearly visible. |
| TDY-24 | JITM-04 §2.8 (say what the button opens), §2.3 | For calls, the hint still says "To +1 555 010 1002. Open your app to send, then record what happened." "Copy" copies the call notes but doesn't say so. "Mark done" records a call without the result the tray would ask for (Connected / No answer / Left voicemail). | `shots/overlays/phone-light/today-review-call.png`; `src/components/EditableFollowUpAction.tsx:443,461`; `src/app/(app)/jumps/page.tsx:361` | VERIFIED-RUNTIME + VERIFIED-CODE | LOW | Calls: "Calls +1 555 010 1002. Record how it went." and "Copy notes". Call results in the review (rec 10). |
| TDY-25 | JITM-05 §2.3–§2.4 (a Beat belongs to a Mix; one-time follow-ups and invitations are not Beats) | "Skip Beat" appears for invitations (captured) and one-time follow-ups (by code). For the same text follow-up the row menu says "Mark done" and the review says "Mark sent". | `shots/flow-inv-6-review.png`; `shots/overlays/phone-light/today-rowmenu.png`; `src/app/(app)/jumps/page.tsx:361,415,418` | VERIFIED-RUNTIME + VERIFIED-CODE | LOW | "Skip this follow-up" for one-time follow-ups and invitations. "Mark sent" for message follow-ups in the menu. |

Known items re-confirmed with fresh evidence. These are not new findings:
- **Composer has no maximum width** (JITM-07 §6): about 90-character lines and an empty 190px bubble at 1440 (`shots/sweep/laptop-light/today.png`). Cap it at 680px.
- **Context column is 280px instead of 340px** (JITM-07 §6).
- **Light confirmation card instead of the dark toast** (JITM-06 §6).
- **11px "Recommended" tag** (JITM-10 §6).
- **No swipe actions** (JITM-08 §6). Swipe would let rows lose "•••".
- **"Updating your follow-up list…" on focus** (JITM-08 §6). It fires on every return from the Messages or Mail app, so I recommend refreshing silently.
- **"my business" in the starter message** (JITM-09 §6; `shots/riley-today-laptop.png`).
- **Portrait-tablet app header** (JITM-07 §6).

---

## 4. Copy findings

| Current string (exact) | Where | What's wrong | Proposed |
|---|---|---|---|
| "sms", "email", "call", "voicemail", "whatsapp" (How options) | `src/app/(app)/jumps/page.tsx:111-115,479` | Raw codes (JITM-05 §2.11). Product words are Text, Email and Call (JITM-04 §2.3). | "Any method", "Text", "Email", "Call" |
| "Because you chose {x} instead of the plan’s sms, this one waits for you and won’t send automatically." | `src/app/(app)/jumps/page.tsx:341` | Raw code inside a sentence. | "Because you chose email instead of the Mix’s text, this one waits for you and won’t send automatically." |
| "Overdue commitments" | `src/app/(app)/jumps/page.tsx:476` | Vague; repeats "Review overdue". | "Overdue only" |
| "Focused work" · "Compact scan" · "Review overdue" | `src/app/(app)/jumps/page.tsx:482` | Unlabeled. "Compact scan" changes nothing on phones (TDY-06). | Remove these, or one labelled switch: "Layout: Standard / Compact" |
| "Uses your default follow-up time in America/New_York." | `src/app/(app)/jumps/page.tsx:360` | Raw zone ID; the time itself isn't shown. | "Snoozes to that day at 10:00 AM (New York time)." |
| "Later today" | `src/lib/snooze-schedule.ts:174` | Untrue after about 4 PM (lands tomorrow). | "Later today · 6:15 PM" when it stays today; otherwise leave it out |
| "Follow-up snoozed." | `src/app/(app)/jumps/page.tsx:459` | Names no time (JITM-04 §2.7). | "Snoozed to Fri, Oct 9 at 10:00 AM." |
| "Follow-up completed" / "{name} · you can undo this for a moment" / "Next scheduled: Oct 10, 10:00 AM" | `src/components/JumpWorkflow.tsx:249-252` | Doesn't echo the owner's action; "a moment" is vague; no weekday. | "Marked sent · Sarah Chen" / "Next follow-up: Sat, Oct 10 at 10:00 AM" + "Undo". Calls: "Marked done". |
| "Step 3 · Record what happened. Opening an app does not send it." | `src/components/JumpWorkflow.tsx:482` | Mentions a step 3; steps 1 and 2 appear nowhere. | "Opening your app doesn’t send it. Record what happened." |
| "To +1 555 010 1002. Open your app to send, then record what happened." (calls; and with no method: "Open your app to send, then record what happened.") | `src/components/EditableFollowUpAction.tsx:443` | "Send" is wrong for a call. With no method there is no app to open. | Calls: "Calls +1 555 010 1002. Record how it went." No method: "Add a way to reach Hana to send this." |
| "Copy" (call review) | `src/components/EditableFollowUpAction.tsx:461` | It copies the call notes, which the label doesn't say. | "Copy notes" (calls); "Copy text" (messages, as in the export) |
| "Add an email address" link + "Add phone" button | `src/components/FollowUpChannelChoice.tsx:64`; `src/components/EditableFollowUpAction.tsx:458` | Two different fixes for one gap (JITM-04 §2.14). | One: "Add a phone number or email" |
| aria-label "Pending Beats in this Mix occurrence" | `src/app/(app)/jumps/page.tsx:405` | "occurrence" is an internal word (JITM-05 §2.11). | "Follow-up dates in this Mix" |
| "This follow-up is no longer pending: {completionMethod}" (e.g. "mix stopped for contact", "reconciled") | `src/app/(app)/jumps/page.tsx:513` | Internal codes (JITM-05 §2.11). | "This follow-up was cancelled when you stopped the Mix." / "This follow-up isn’t open anymore." + "See {name}" |
| "Your recorded updates are being prepared. This list will refresh." (under "Needs your input 0") | `src/components/WorkflowAttention.tsx:7-10` | Vague, and shown under a heading that says 0. | "Updating your list after your last change…" with no heading |
| "You have 3 invitations to share." (Today) vs "3 invitations left" / "Share free access with people you know" (rail) | `src/app/(app)/jumps/page.tsx:495`; `src/components/AppShell.tsx:50` | The same fact worded two ways. | "3 invitations left · Invite people" everywhere |
| "Your invitation is ready to send. It hasn’t been sent yet." + card "Not sent yet. Open each one and send it from your own email or text app." | `src/app/(app)/jumps/page.tsx:453,489` | Says the same thing twice on one screen. | Keep only the card line: "Not sent yet. Send it from your own email or text app." |
| " Tap Review to begin." | `src/app/(app)/jumps/page.tsx:435,438` | Phone-only verb; on desktop the review is already open. | " Review it to begin." |
| "Stop New project inquiry for Ava Alvarez?" (`Stop ${mix.name} for ${name}?`) | `src/app/(app)/jumps/page.tsx:418` | The Mix name reads as part of the sentence. | "Stop the “New project inquiry” Mix for Ava Alvarez?" |
| "Skip Beat" (invitation; one-time follow-up) | `src/app/(app)/jumps/page.tsx:361,418` | Not a Beat (JITM-05 §2.3–§2.4). | "Skip this follow-up" |
| "Mark done" (menu, text follow-up) | `src/app/(app)/jumps/page.tsx:415` | The review calls the same action "Mark sent". | "Mark sent" (messages) / "Mark done" (calls) |
| "Follow-up" (review subtitle when there is no stage) | `src/app/(app)/jumps/page.tsx:405` | Filler. | Leave the subtitle out, or show the reason |
| "23 follow-ups need your attention · 1 overdue." | `src/app/(app)/jumps/page.tsx:469` | Wraps as "· 1 / overdue." on phones; no date, where the export has one. | "Thu, Oct 8 · 23 to do · 1 overdue" |
| "Search this follow-up view" (placeholder) + label "Find a person, Mix, or reason" + description "Find a person, Mix, or reason." | `src/app/(app)/jumps/page.tsx:470-471` | Clipped at 390px; says the same thing twice. | Placeholder "Name, Mix or reason"; drop the description |
| "Check each item. Dates and times use America/New_York." | `src/components/QuickAdd.tsx:166` | Raw zone ID. | "Check each item." (add "Times are New York time." only when the device zone differs) |
| "Follow up" + "2026-10-09 14:00 · Edit" | `src/components/QuickAdd.tsx:180`; `src/lib/quick-add-capture.ts:108` | ISO date, 24-hour time, no method; generic reason. | "Call about the fence quote" + "Fri, Oct 9 at 2:00 PM · Edit" |

---

## 5. Structural recommendations (ranked)

1. **"Work through Today": auto-advance with live progress.**
   - **Problem:** after every outcome the owner lands back on the list, scrolls and re-aims at a 52×44 target. Desktop shows an empty pane until the Undo window closes (INFERRED). Counts don't move while working (TDY-12).
   - **Change:** after Sent, Mark sent, Snooze or Skip, open the next due follow-up's review immediately: replace the sheet's content on phones, dock the next one on desktop. Keep that outcome's Undo inside the new sheet. Update the counts in place and show "4 of 23 done". Stop at the end with "All caught up for today" plus Upcoming.
   - **Benefit:** a phone item takes 2 taps (Open text, Sent) plus the native send, with no scrolling: about 22 fewer taps and 22 fewer scrolls for 22 items. The owner still reviews and sends every message.
   - **Effort:** M. **Kevin decision:** yes (the flow changes, although JITM-08 §2.1's pattern holds).
2. **Dense phone rows, and a real Compact.**
   - **Problem:** 117px rows show 3.5 items per screen (TDY-01), and "Compact scan" is inert (TDY-06).
   - **Change:** tapping anywhere on the row opens the review; the right column keeps one control; "reason · Mix" on one line; the "•••" actions move to the review header plus long-press (or swipe: JITM-08 §6). Aim for 84–96px rows, then retire the Compact link.
   - **Benefit:** about 5.5 items on the first screen instead of 3.5, and roughly 20% less scrolling.
   - **Effort:** M. **Kevin decision:** yes (row anatomy, and the 2026-09-22 "Review" caption decision).
3. **One quiet invitation prompt.**
   - **Problem:** about 108px of the first phone screen every day, no dismiss, three or four simultaneous prompts, and competition with the first follow-up on day one (TDY-18).
   - **Change:** badges in More and the rail always. On Today, a one-line chip only after the first recorded outcome, with "Not now" hiding it for 14 days. Ready invitations as one compact group, not repeated in the list (TDY-04).
   - **Benefit:** the queue starts about 110px higher, and the activation path stays clean.
   - **Effort:** S. **Kevin decision:** yes (JITM-09 §2.9 lists the strip).
4. **Same-person grouping.**
   - **Problem:** risk of a double contact on one day (TDY-13).
   - **Change:** one row per person per day ("Marcus Reed · 2 due · Call today"), and a review that shows both, with "Skip the earlier text".
   - **Benefit:** fewer redundant touches and a calmer cadence.
   - **Effort:** M–L. **Kevin decision:** yes (new behavior).
5. **Context where the decision is made.**
   - **Problem:** no last note or history in the review; no way to the contact on phones (TDY-10).
   - **Change:** desktop and tablet get Reach + Last note + 3 History items (export); phones get a collapsed "About {name}" row.
   - **Benefit:** the owner checks "what did we last say?" without leaving Today.
   - **Effort:** M. **Kevin decision:** desktop no (export); phone yes (beyond the export).
6. **Truthful snooze** (TDY-08).
   - **Change:** chips with resolved times, honest "Later today", and a confirmation with the date and time.
   - **Effort:** S. **Kevin decision:** no.
7. **Filter that matches the cards** (TDY-05, TDY-06).
   - **Change:** Show / How / Overdue only, with plain labels and the shown version as the key. Remove the layout links.
   - **Effort:** S. **Kevin decision:** no (removing Compact: yes, if it isn't replaced by rec 2).
8. **Quick Add in plain words** (TDY-16, TDY-17).
   - **Change:** full screen on phones; compact "Saving as" rows with the method and a friendly time; keep the capture's context in the reason.
   - **Effort:** S–M. **Kevin decision:** no.
9. **Channel switch without a reload** (TDY-07).
   - **Change:** render the chosen version from props already on the page, and save it in the background.
   - **Effort:** M. **Kevin decision:** no.
10. **Call results in the review** (TDY-24).
    - **Change:** for calls, replace "Mark done" with Connected · No answer · Left voicemail, as in the tray (JITM-09 §2.27).
    - **Effort:** S. **Kevin decision:** probably not (the outcomes already exist).

---

## 6. Documents that disagree, and gaps

**Documents that disagree:**
- **"Next up" label.** JITM-09 §2.24 and JITM-05 §2.3 say the first open card carries "Next up". The code hides it (`src/styles/design-workspaces.css:45`, `.jump-task-card .eyebrow { display: none; }`), and the export has no label. The standard is stale, or the code should show it. Today the only cue is a violet wash, which is also the "open" state (TDY-09).
- **Quick Add on phones.** JITM-08 §2.11 says it fills the screen below 768px. The code does this only at 601–767px (`src/styles/design-system.css:116`), and `src/styles/popups.css:29` describes that narrower range. The export shows a tall sheet with an 84px top gap.
- **Today search.** JITM-08 §2.29 says search applies at once; it uses a Search button and a reload (TDY-21).
- **Snooze confirmation.** JITM-04 §2.7 asks confirmations to name the day and time; the snooze confirmation does not (TDY-08).
- **Invitation wording.** JITM-09 §2.9 says the prompts read "N invitations left". The Today strip says "You have N invitations to share." (noted in `docs/STANDARDS_AUDIT_2026-09-28.md:170`, still different).
- **One-time follow-ups.** JITM-05 §2.3 says a one-time follow-up "belongs to none of your Mixes". The review and rows show its hidden Mix name, "One-time follow-ups", and offer "Skip Beat" (INFERRED from `src/lib/one-time-follow-up.ts:34` and `src/app/(app)/jumps/page.tsx:361,400,405`).
- **Context column content.** JITM-07 §2.15 doesn't say what the context column holds; the export shows Last note + History, the code shows Reach only (TDY-10).

**Gaps where no rule exists:**
- **Date and time display.** Nothing says ISO vs friendly dates, 12- vs 24-hour time, when to show weekdays, or how to name a time zone. Today, Quick Add and snooze disagree.
- **Queue row content.** Nothing says whether the reason line is shown or how it is separated from the Mix name.
- **Same-person follow-ups.** No rule for one person with several follow-ups due on the same day.
- **Auto-advance.** No rule or budget for moving to the next item after an outcome. JITM-09 §2.10's budget leaves out the Review tap and scrolling.
- **Touch tablets in landscape.** The 44px rule is width-based (JITM-10 §2.1). A 1194×834 touch tablet gets 36px "•••" buttons (`shots/sweep/tabletLand-light/_results.json`).

**Seen in this lane but owned elsewhere:**
- the rail's "Profile" button breaks as "Profil / e" at 901–1279px (`shots/breakpoints/today-review-901.png`; shell lane);
- the invitation greeting "Hi riley.newowner@example.test," (O35; invitation lane).

---

## 7. Captures needed / NOT RUN

| Item | Why it matters | Route and steps |
|---|---|---|
| Return tray | The tray behavior is VERIFIED-CODE only. | Phone: `/jumps` → Review (Sarah) → Open text → return focus → screenshot the tray (copy, position above the nav) → Sent → confirmation. Repeat for a call (Connected / No answer). |
| Desktop after an outcome | Confirms what the pane shows during the Undo window, whether the next follow-up docks after the refresh, and whether that steals the pane from a review opened during the window. | 1440: `/jumps` → Mark sent → screenshots at 1s, 5s, 11s. Then: Mark sent → open Aaron within 5 seconds → screenshot at 11s. |
| Phone Undo vs the next review | Is the Undo hidden behind the next modal (INFERRED)? | `/jumps` → Review → Mark sent → tap the next Review within 3 seconds → screenshot. |
| Counts during fast completion | TDY-12, INFERRED part. | Complete 3 follow-ups about 5 seconds apart; screenshot the header, section counts and Done after each. |
| Channel switch timing | TDY-07: how long the loading page shows, and how often. | Video or trace of Review → Email → Call → Text on phone. |
| "Later today" in the evening | TDY-08: the resulting time. | After 4 PM local: `/jumps` → ••• → Later today → screenshot the notice and the row's new time. |
| A Quick Add follow-up on Today | TDY-02, TDY-17, TDY-25: row and review text for a one-time follow-up. | Quick Add "Call Jordan Lee Friday at 2pm about the fence quote" → Save → `/jumps?range=week` → row + review. |
| Stopped follow-up via a single-follow-up link | TDY-15 runtime text. | `/jumps?jump=<id>&range=all` → ••• → Stop Mix… → confirm → screenshot the notice. |
| Filter by How after switching | TDY-05 functional mismatch. | Switch Sarah to Email → Filter → How: email → is Sarah listed? |
| Needs your input while updating | O30 / TDY-12 runtime. | Mark sent → Undo → screenshot the section below Today. |
| Today at 200% text and on real devices | JITM-10 §2.3 (NOT RUN, known §6). Covers the native SMS/mail handoff, the iOS keyboard with the Quick Add sheet, and VoiceOver on the review. | OS text size 200% and physical devices. |
| Empty and caught-up Today | JITM-09 §2.25 states with real data. | An account with nothing due. |
