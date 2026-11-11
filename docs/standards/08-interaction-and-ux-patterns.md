---
id: JITM-08
title: Interaction and UX patterns
status: active
version: 3.1.0
owner: Kevin
last_reviewed: 2026-11-11
applies_to: [ui, interaction, forms, dialogs, app, public-pages, staff]
supersedes: [docs/design/DESIGN_GUIDELINES.md]
sources:
  - docs/design/NATIVE-NAVIGATION.md
  - docs/design/UX_AUDIT_2026-11-08.md
  - docs/design/DESIGN_GUIDELINES.md
  - docs/design/DESIGN_CONSISTENCY_2026-09-23.md
  - docs/design/DESIGN_STRESS_REVIEW_2026-09-20.md
  - docs/design/DESIGN_PANE_POLISH_2026-09-20.md
  - docs/design/SAVE_RECOVERY_RELEASE_2026-09-20.md
  - docs/UI_UX_WORKFLOW_AND_ICON_IMPLEMENTATION_2026-09-22.md
  - docs/UI_UX_DEEP_GAP_AUDIT_2026-09-23.md
  - docs/FULL_AUDIT_2026-09-24.md
  - docs/standards-audit-2026-09-28/OWNER_DECISIONS.md
  - src/components/Sheet.tsx
  - src/components/ConfirmDialog.tsx
  - src/components/useConfirmDialog.tsx
  - src/components/FormGuard.tsx
  - src/components/JumpWorkflow.tsx
  - src/styles/popups.css
  - src/styles/disclosures.css
related_skills: [jitm-ui-change, jitm-feature, jitm-review]
related_workflows: [WF-02, WF-04, WF-05]
---

# JITM-08 — Interaction and UX patterns

> The shared behavior of the product: review and undo, disabled actions, confirmations, popups and sheets, disclosures, forms and saving, filters, drafts, screen states, keyboard shortcuts and touch gestures.

## 1. Purpose and scope

This standard governs how shared patterns behave wherever they appear. The owner should meet one way of doing each thing.

Neighboring topics have their own homes:
- The words in confirmations, errors, empty states and notices: JITM-04 §2.
- What each workflow does, step by step: JITM-09 §2.
- How the patterns look: JITM-06. Where they sit at each width: JITM-07.
- Focus visibility, names and target sizes: JITM-10.

## 2. Rules

### Review, handoff, outcome, undo

**2.1** Acting on a follow-up is one pattern everywhere: review the prepared wording, hand off to the owner's own app, record the outcome, then confirm with Undo. The review shows, in order: the person; the Mix and its timing; the wording; the channel choice with where it goes; the handoff with Copy beside it and the outcome controls; then save status and Discard edits. [SOURCE docs/design/DESIGN_GUIDELINES.md:24,45] [SHIPPED 9439fd6 src/components/EditableFollowUpAction.tsx:416-470] [SOURCE docs/design/jump-in-the-mix-designs/screens/Review.html:21 (review sheet)]

**2.2** Opening a messaging app is a handoff, not delivery. The product MUST NOT mark a follow-up sent when an app opens. When the owner returns, the return tray asks what happened, says that opening an app does not send, and lets them record it later. [SHIPPED 9439fd6 src/components/JumpWorkflow.tsx:468-478] [SOURCE docs/design/DESIGN_GUIDELINES.md:24]

**2.3** The review keeps the available channels, Copy, Mark sent, Snooze and Skip visible. On a phone, a short message shows the handoff and the outcomes together without scrolling. Errors, missing methods, automatic-delivery holds and draft conflicts stay visible. [SOURCE docs/design/DESIGN_GUIDELINES.md:24,45] [SHIPPED 9439fd6 e2e/design-correction.spec.ts:229]

**2.4** After an outcome, a status confirmation says what happened and when the next follow-up is due, and offers Undo for 10 seconds before it leaves. On Today it stays on screen while the next review opens (§2.36). It is placed per JITM-07 §2.9 and never covers the last row. Which outcomes a card offers, and Reopen from Done, are JITM-09 §2. [SHIPPED 9439fd6 src/components/JumpWorkflow.tsx:214,240-256] [SHIPPED 9439fd6 src/styles/design-workspaces.css:256-259] An Undo or a Reopen that finds the follow-up already reopened elsewhere counts as reopened, and the confirmation leaves. [SHIPPED 4d5c307 src/components/JumpWorkflow.tsx:192-208,248-249] Reopen then says "Already reopened." [OWNER 2026-10-13 D115] [SHIPPED 4d5c307 src/components/JumpWorkflow.tsx:121-123]

**2.5** Reversible actions act at once and offer Undo in their success notice, such as archiving a contact. Destructive or irreversible actions ask first (§2.7). [SOURCE docs/UI_UX_WORKFLOW_AND_ICON_IMPLEMENTATION_2026-09-22.md:38] [SHIPPED 9439fd6 src/styles/phone-icons.css:30-32]

**2.36** After an outcome on Today, the next due follow-up's review opens by itself, on phones and desktop, so working through the list takes the handoff and one outcome per person. The confirmation with its Undo (§2.4) stays on screen while the next review opens, and the list's counts and Done update at once; Undo puts the counts back. Opening the next review never sends, records or skips anything. [OWNER 2026-10-08 D70] The next review opens after an outcome recorded in a review or in the return tray. It doesn't open after a quick action from the list; while another review, sheet or dialog is open or focus is in a field; while the return tray still asks about another follow-up or shows a notice, or Today says updates wait for message edits; after an outcome in Upcoming or Done; after an outcome that finished a Mix, where Today asks what's next for the person; after an "Already marked done" retry; or when the next due follow-up is past the loaded page. [OWNER 2026-10-09 D111] [SHIPPED 4e78545 src/components/TodayMomentum.tsx:121] Confirmations and their Undo sit outside the list, so a refresh never takes them away and an Undo never holds the refresh. A refresh never closes an open review: a card whose review is open keeps its place, also when a refresh brings another of the person's follow-ups onto the page. [OWNER 2026-10-12 D99] For LIV-01's case, a person contacted today stays under Today, so recording their later follow-up first leaves a review open on the earlier one in place (JITM-09 §2.82). [OWNER 2026-10-13 D112] [SHIPPED 4d5c307 src/lib/today-view.ts:83-89] A notice that appears in a review scrolls into view, clear of the stuck action bar. [OWNER 2026-10-12 D100]

### Disabled with a reason

**2.6** An unavailable action stays visible but disabled. Its reason is visible text next to it, linked with `aria-describedby`, not only a hover title, and it offers the fix when there is one, such as adding a phone number. [SHIPPED 9439fd6 src/components/FollowUpChannelChoice.tsx:59-64] [SHIPPED 9439fd6 src/components/ContactProfile.tsx:201] [SOURCE docs/UI_UX_WORKFLOW_AND_ICON_IMPLEMENTATION_2026-09-22.md:40]

### Confirmations

**2.7** Confirm only consequential or destructive actions, with `ConfirmDialog` (a trigger button) or `useConfirmDialog` (an awaitable prompt). Each confirmation has:
- one heading that asks about the action, and text naming its effect;
- Cancel first, with initial focus, then the action (`danger` when destructive);
- equal 44px buttons, with explanations and errors above them;
- a 44px close control.

[SHIPPED 9439fd6 src/components/ConfirmDialog.tsx:31] [SHIPPED 9439fd6 src/components/useConfirmDialog.tsx:8-10,22-35] [SHIPPED 9439fd6 src/styles/popups.css:13-15] [OWNER 2026-09-23 O2]

**2.8** Code MUST NOT call `window.confirm`, `alert` or `prompt`. The only exceptions are `FormGuard`'s two synchronous guards: leaving a form with unsaved changes, and submitting another form that reloads the page. [SHIPPED 9439fd6 src/components/FormGuard.tsx:24,45] [SOURCE docs/design/DESIGN_CONSISTENCY_2026-09-23.md:36-46]

**2.9** A review step before a consequential save uses `ReviewDialog`. It focuses the non-consequential choice ("Keep editing"), keeps Tab inside, and returns focus to where it started. [SHIPPED 9439fd6 src/components/ReviewDialog.tsx:17-45] [SOURCE docs/design/DESIGN_CONSISTENCY_2026-09-23.md:47-48]

### Popups and sheets

**2.10** Every popup, sheet and dialog follows one concept. It is a native `<dialog>` with one heading and optional supporting text (type: JITM-06 §3), a 44px close control, the shared `--scrim` backdrop, and a height bounded to the viewport with its own scrolling. Tools and profile sheets list their actions as flat, single-column rows with a leading icon. [OWNER 2026-09-23 O2] [SHIPPED 9439fd6 src/styles/popups.css:1-20] [SOURCE docs/design/DESIGN_PANE_POLISH_2026-09-20.md:13] [SHIPPED 9439fd6 src/components/Sheet.tsx:118-127] [SHIPPED 9439fd6 src/styles/design-details.css:11,54]

**2.11** Below 768px every sheet is a bottom sheet: a grabber, a borderless header, 20px padding that respects the safe area, an upward shadow and square bottom corners. Quick Add fills the screen there. [SHIPPED 9439fd6 src/styles/popups.css:22-32] [SHIPPED 9439fd6 src/styles/design-system.css:113-115] [SOURCE docs/design/DESIGN_GUIDELINES.md:52]

**2.12** Opening a sheet focuses its heading, not Close. The Today review does not focus the message field, so a phone keyboard does not cover the message and the send buttons. Quick Add focuses its capture field, because capture is its task. Closing returns focus to the trigger. [SHIPPED 9439fd6 src/components/Sheet.tsx:39-48,93-96] [SHIPPED 9439fd6 src/components/QuickAdd.tsx:96]

**2.13** Quick Add uses the shared sheet header, title on the left and close on the right, not the export's centered phone title or title-less desktop card. [OWNER 2026-09-28 D9] [SHIPPED 9439fd6 src/components/QuickAdd.tsx:142]

**2.14** Layers stack predictably. Escape closes only the top layer. A nested picker or confirmation stays above its parent, even when a resize turns the docked review into a modal; focus and drafts survive. A confirmation's close and cancel events never close its parent. [SHIPPED 9439fd6 src/components/Sheet.tsx:50-70,111-116] [SHIPPED 9439fd6 src/components/useConfirmDialog.tsx:29-31] [SOURCE docs/design/DESIGN_GUIDELINES.md:56]

**2.15** Sheets mount on first use and stay mounted, so closing never discards an unsaved draft. Only one docked review is open at a time. It is non-modal from 768px and modal below, and opening another review or resizing keeps its editor and draft. [SHIPPED 9439fd6 src/components/Sheet.tsx:101-103] [SHIPPED 9439fd6 src/lib/sheet-layout.ts:7-22] [SOURCE docs/design/DESIGN_GUIDELINES.md:24]

**2.16** Styles for a docked pane apply to its direct children only, so a nested dialog keeps its own size, surface and controls. [SOURCE docs/design/DESIGN_GUIDELINES.md:50] [SOURCE docs/design/DESIGN_PANE_POLISH_2026-09-20.md:12] [SHIPPED 9439fd6 src/styles/design-workspaces.css:107-111]

**2.17** Menus, such as the public Explore menu and the staff phone menu, close on Escape, on an outside tap and on choosing a link, and return focus to their toggle. [SHIPPED 9439fd6 src/components/PublicHeader.tsx:32] [SOURCE docs/design/DESIGN_CONSISTENCY_2026-09-23.md:32]

**2.18** The export's pop-up bubble anchored to a thing is for previews and menus that point at a person, Beat or event. Confirmations stay modal dialogs under §2.7. [PROPOSED]

### Disclosures

**2.19** Every `<details>` uses the shared pattern: no native marker; a trailing chevron that turns when open, unless the summary draws its own chevron or overflow icon; a 44px target; a label with secondary hints (sizes: JITM-06 §3); an inset focus ring. Per-item actions use the 44px round "•••" menu. [SHIPPED 9439fd6 src/styles/disclosures.css:5-45] [OWNER 2026-09-23 O2]

**2.20** Boxed disclosures stay boxed: the Today briefing, Calendar connections, settings records and onboarding. Flatten one only for a workflow reason Kevin accepts. [OWNER 2026-09-28 D9]

**2.21** Use a disclosure for optional or long-form content (answers, advanced fields, extra event details). On phones, secondary sections and a long table of contents SHOULD start collapsed with a clear summary or Show more control; keep the current work and deep-linked target visible (§2.40). [PROPOSED] [SOURCE docs/design/UX_AUDIT_2026-11-08.md:96] [PROPOSED] [SOURCE docs/design/UX_AUDIT_2026-11-08.md:45] Menus and phone tasks use the shared sheet. [SOURCE docs/CANONICAL_PRODUCT_DECISIONS.md:119]

**2.22** Fields inside a collapsed disclosure stay mounted, so saving keeps their values. A form MUST open the disclosure around an invalid field before browser validation moves focus there. [SHIPPED 9439fd6 src/components/MixEditor.tsx:181] [SHIPPED 9439fd6 src/components/CalendarEntryForm.tsx:77] [SOURCE docs/design/DESIGN_GUIDELINES.md:46,57]

### Forms and saving

**2.23** Editors for Mixes, contacts and events MUST save explicitly. A page uses one shared SaveBar after the fields it saves, or per-section saves with a visible unsaved marker for each changed section. Reuse the shared component where a bar fits; it stays sticky only where §2.26 and JITM-07 §2.26 allow. Cancel and Save SHOULD sit side by side on phones. Automatic saving remains for drafts and single preferences, with a visible Saving/Saved state and no invisible submit button in the keyboard path. [PROPOSED] [SOURCE docs/design/UX_AUDIT_2026-11-08.md:67] [PROPOSED] [SOURCE docs/design/UX_AUDIT_2026-11-08.md:57] [SHIPPED 338ae42 src/components/SaveBar.tsx]

**2.24** A failed or unconfirmed save keeps every entered value, even after repeated failures. Focus moves to a visible error that says the entries are kept; password fields are cleared. An expired session stops retrying and keeps the wording. [SHIPPED 9439fd6 src/components/ActionForm.tsx:9-27] [SHIPPED 9439fd6 src/lib/unconfirmed-save.ts:2] [SOURCE docs/UI_UX_DEEP_GAP_AUDIT_2026-09-23.md:128,145]

**2.25** While a save is in flight, the submitted fields are locked. A retry reuses the same request identity, so it never duplicates. A conflicting save keeps the local draft on screen and offers a choice, never a silent replacement. [SOURCE docs/design/SAVE_RECOVERY_RELEASE_2026-09-20.md:6-8] [SHIPPED 9439fd6 src/components/QuickAdd.tsx:105-135]

**2.26** Form grids shrink around their contents and action rows wrap. Sticky save bars MUST NOT cover fields: at 900px and below, Calendar and Mix save areas scroll with the form. [SHIPPED 9439fd6 src/styles/design-details.css:162,279-281,294] [SOURCE docs/design/DESIGN_GUIDELINES.md:58] [SOURCE docs/ADMIN_DENSITY_2026-09-17.md:45]

**2.27** A form MUST state its actual required/optional convention once and mark optional fields consistently beside their labels. An either-or group MUST name its minimum requirement instead of claiming every field is required; enforce the same constraint before submit and on the server (§2.37). Add-another controls MUST sit beside the collection they extend. [PROPOSED] [SOURCE docs/design/UX_AUDIT_2026-11-08.md:62]

**2.28** Pickers show the current value first and mark the selection with text and state, not color alone. `TimezonePicker` is the reference: the current zone first, a "Selected" label, and "Use device timezone" for detection. [SOURCE docs/design/DESIGN_PANE_POLISH_2026-09-20.md:18] [SOURCE docs/design/DESIGN_GUIDELINES.md:50]

### Filters

**2.29** Today and Contacts search and filters apply at once. The Mixes, Ready-made and Marketplace filter sheets keep an explicit "Apply filters" button, and each sheet says so. Presets MUST explain what they include and filters MUST offer Reset; Today/Contacts search SHOULD be inline. Saved contact views live inside Filter for every result size, keep the chosen sort, and ask before deletion. [PROPOSED] [SOURCE docs/design/UX_AUDIT_2026-11-08.md:56] [OWNER 2026-09-28 D9] [SHIPPED 9439fd6 src/app/(app)/mixes/page.tsx:64-67] [SOURCE docs/design/DESIGN_GUIDELINES.md:49] [SOURCE docs/UI_UX_WORKFLOW_AND_ICON_IMPLEMENTATION_2026-09-22.md:39]

### Drafts and recovery

**2.30** A draft is never discarded silently:
- leaving a form with changes asks first, and so does navigation that replaces an editor;
- closing Quick Add with a capture asks first;
- the browser warns before a reload.

Private drafts stay in memory; they are never copied into browser storage. [SHIPPED 9439fd6 src/components/FormGuard.tsx:7-58] [SHIPPED 9439fd6 src/components/QuickAdd.tsx:78-92] [SOURCE docs/design/SAVE_RECOVERY_RELEASE_2026-09-20.md:5,9]

An untouched form never warns. A form counts as changed only once the person acts on the page; values the page fills in before then, such as a detected timezone or today's date in that timezone, are part of its starting point. A field that only reports the page's own state, such as whether a preview loaded, carries `data-form-guard-ignore`. [OWNER 2026-09-29 docs/FORM_GUARD_UNTOUCHED_FORM_FIX_2026-09-29.md:12]

**2.31** A stalled request offers Stop waiting and times out; Quick Add waits 30 seconds. Both keep the draft and its retry identity and explain that a save the server already received cannot be cancelled. [SHIPPED 9439fd6 src/components/QuickAdd.tsx:121,163] [SOURCE docs/design/SAVE_RECOVERY_RELEASE_2026-09-20.md:10]

### Screen states

**2.32** Every list and page MUST handle empty, loading and failed states, with these distinctions:
- empty: use EmptyState with one next useful business action; hide search when no items exist to search;
- filtered-empty: name the query/filter and offer Clear; keep a deliberate selection/empty prompt in the detail pane rather than a blank region;
- loading: retain the layout and a headed status region while navigation remains usable; skeleton rows MAY preserve space;
- failed: identify the failure and offer retry and help, with state-aware recovery under §2.39.

Words follow JITM-04; the complete states verification pass is JITM-12 §2.26. [PROPOSED] [SOURCE docs/design/UX_AUDIT_2026-11-08.md:74] [PROPOSED] [SOURCE docs/design/UX_AUDIT_2026-11-08.md:75] [PROPOSED] [SOURCE docs/design/UX_AUDIT_2026-11-08.md:73]

**2.33** Live updates never disturb work in progress. Incoming changes wait while the owner is working: Journey pauses its refresh while the owner edits, selects a path or has focus in a form, and Today keeps its list and says updates are waiting while a message is being edited or a draft is open. An open Undo doesn't hold Today's list, since confirmations and their Undo sit outside it (§2.36). An update never moves, closes or overwrites what the owner is working on. The owner's own outcome is not an incoming change: it updates Today's counts at once (§2.36). Journey's silent refresh is specified in JITM-09 §2. [SHIPPED 9439fd6 src/components/useTodayUpdates.ts:9-11] [SHIPPED 9439fd6 src/components/TodayNavigation.tsx:102-108] [SHIPPED 9439fd6 src/components/WorkflowJourney.tsx:116] [OWNER 2026-09-28 D4] [OWNER 2026-10-12 D99] Today says "Updating your follow-up list…" only for a read that takes longer than a second, so the list doesn't move after each outcome. [OWNER 2026-10-13 D114] [SHIPPED 4d5c307 src/components/TodayNavigation.tsx:32-41]

### Keyboard shortcuts

**2.34** A single-key shortcut MUST be switchable. N opens Quick Add only outside text fields, with no modifier, not on a held key or during composition, and not while a modal is open. A switch turns it off for the browser, and its hint disappears when it is off. A new single-key shortcut needs Kevin's decision and the same safeguards. [SHIPPED 9439fd6 src/lib/quick-add-shortcut.ts:29-35] [SHIPPED 9439fd6 src/components/Appearance.tsx:92-93] [SHIPPED 9439fd6 src/components/QuickAdd.tsx:24-27,97-103] [SOURCE docs/FULL_AUDIT_2026-09-24.md:46]

### Assistant actions

**2.35** An action an owner's assistant takes through the connector (JITM-01 §2.25) follows the review, outcome and Undo pattern of §2.1–§2.5 as far as the connector can carry it. The assistant's own conversation and permission settings, which Jump in the Mix does not control, do the rest.
- **Messages:** the connector returns the person, the channel and the exact prepared wording, and marks sending as needing the owner's approval. After the assistant sends from the owner's own number or email account, it logs the outcome. Jump in the Mix records that as sent by the assistant, as reported (§2.2).
- **Calls:** the connector returns the person, the number and the call's notes. The assistant connects the owner after the owner says yes, and the owner speaks (JITM-01 §2.26).
- **Changes:** each covers one person. The response says what changed and when the next follow-up is due, and offers Undo, as §2.4 does.
- **Skipping and completing** are marked as needing the owner's approval (§2.5, §2.7).
- **Bulk:** the connector offers nothing that approves or changes many people at once.
- **In the app:** the person's history names the assistant that made each change, and the change can be undone there.

[OWNER 2026-10-06 D38] [OWNER 2026-10-06 D39] [OWNER 2026-10-06 D42] [OWNER 2026-10-06 D43] [PROPOSED]

### Field validation, feedback and recovery

**2.37** Forms MUST use one shared inline field-error pattern: an error beside the field, `aria-invalid` on the invalid control and `aria-describedby` linking the error without dropping existing help. Show the form's own required/either-or constraints before sending; server validation remains authoritative. Do not rely on native browser tooltips. Open any containing disclosure before focusing an error. Labels MUST sit above fields, never only in placeholders. Failure banners follow JITM-04 §2.13 and preserve entered values (§2.24). [PROPOSED] [SOURCE docs/design/UX_AUDIT_2026-11-08.md:33] [PROPOSED] [SOURCE docs/design/UX_AUDIT_2026-11-08.md:60]

**2.38** Every tap action MUST show an immediate pressed response. An action that loads a surface MUST open it immediately in a loading state, rather than leave a silent wait before opening. Copy MUST confirm on the same button and expose its result to assistive technology; failure keeps the text available. This does not replace the delayed background-refresh notice in §2.33. [PROPOSED] [SOURCE docs/design/UX_AUDIT_2026-11-08.md:89] [PROPOSED] [SOURCE docs/design/UX_AUDIT_2026-11-08.md:45]

**2.39** Error/recovery headings MUST name the current state rather than retain a happy-path title. Not-found MUST offer Today to signed-in owners and a useful public destination to visitors, with a main landmark. Expired or incomplete links MUST offer a next step without an unusable confirm action. Signed-in members visiting registration or pending-verification entry pages MUST be directed to Today after a server-verified session check. A deletion receipt MUST describe a real completed deletion, never appear merely because a signed-in member visits its URL. [PROPOSED] [SOURCE docs/design/UX_AUDIT_2026-11-08.md:35] [PROPOSED] [SOURCE docs/design/UX_AUDIT_2026-11-08.md:48] [PROPOSED] [SOURCE docs/design/UX_AUDIT_2026-11-08.md:50]

**2.40** A deep link MUST reveal its target, opening a containing disclosure and placing the target in view. A missing target MUST provide a clear recovery path; a highlighted but closed answer is insufficient. [PROPOSED] [SOURCE docs/design/UX_AUDIT_2026-11-08.md:44]

**2.41** Phone numbers SHOULD be formatted for the contact's known region/locale, preserving the stored value. On phones a callable number MUST offer an intentional tap-to-call action with an accessible name; formatting must never infer or change an unknown country code. [PROPOSED] [SOURCE docs/design/UX_AUDIT_2026-11-08.md:25]

**2.42** Message textareas SHOULD grow with their content so the complete wording and signature remain visible, within the viewport's scrolling surface. Do not hide the end inside an avoidable fixed-height inner scroller. [PROPOSED] [SOURCE docs/design/UX_AUDIT_2026-11-08.md:49]

**2.43** Consecutive identical history events SHOULD be presented as one expandable group with a count and reachable individual details/actions. Group presentation only: append-only history, timestamps and individual event identity MUST remain intact. [PROPOSED] [SOURCE docs/design/UX_AUDIT_2026-11-08.md:64]

**2.44** On network loss in an already visible authenticated page, loaded content MUST remain readable behind an offline banner, with changes paused and nothing queued. Account change, sign-out or expiry MUST mask private content. A tab backgrounded while offline MUST remain locked on return until its session is freshly confirmed; an offline reload is not permission to cache private pages. The owner decision does not waive tenant isolation (JITM-00 §2.5). The independent-review disagreement and implementation evidence still needed are recorded in §6. [OWNER 2026-11-08 docs/design/UX_AUDIT_2026-11-08.md:236]

**2.45** Controls MUST carry out the intent they name, with one add action per intent in a task region and the same behavior on sibling surfaces. A generic create entry MUST offer an unselected starting choice rather than silently select someone else's template. Multi-view pages SHOULD open on their clearest task view or the last view the owner used. Explicit route/default-view decisions remain exceptions until amended: the creation route in JITM-09 §2.36 and Journey's default in JITM-07 §2.20 (§6). Labels follow JITM-04 §2.3; visual priority follows JITM-06 §2.37. [PROPOSED] [SOURCE docs/design/UX_AUDIT_2026-11-08.md:61] [PROPOSED] [SOURCE docs/design/UX_AUDIT_2026-11-08.md:69] [PROPOSED] [SOURCE docs/design/UX_AUDIT_2026-11-08.md:59]

### Touch gestures

Kevin, 2026-11-08: "I also would like to incorporate swipe to slide functionality to the next page for easy phone/tablet navigation." Then: "Approve the swipe spec, go with section swipe". The detail (thresholds, state machine, arbitration, tests) is in the [native navigation spec](../design/NATIVE-NAVIGATION.md).

**2.46** Touch gestures follow one map, and each surface has one horizontal meaning:
- **Section swipe:** on a coarse pointer, on the four ring stops only (JITM-07 §2.33), a horizontal swipe moves to the neighbouring section. The page follows the finger and the neighbour's title and loading state peek in. Release past 35% of the width or at 0.5 px/ms or faster commits a navigation that continues the slide; anything less springs back. The navigation highlight tracks the drag. Leaving runs the §2.30 guards first.
- **Pane paging:** Journey's People / Mixes / Details, the Mix library's phone Mixes / Beats / Details, and the Ready-made and Marketplace sub-tabs page with native scroll snapping and ARIA tabs. On a ring stop, a swipe that continues past the first or last pane becomes section swipe.
- **Back:** every drill-in is a history entry, and returning slides the parent back in with its scroll restored. Browser and system back gestures are never intercepted, and one back is never animated twice. Only the installed iOS app, which has no system back swipe, adds a back swipe from within 20 px of the left edge.
- **Sheet dismiss:** below 768px, dragging a sheet's handle or header down past 30% of its height, or at 0.5 px/ms or faster, closes it. The body scrolls first and dismissal starts only at its top. Closing this way runs the same unsaved guard as Close (§2.30). The review sheet opens at its full height and may rest at a half height when the owner drags it there.
- **Next follow-up:** a horizontal swipe on the review header moves to the next or previous follow-up in Today's order, as its Next and Previous buttons do, with the same unsaved guard.
- **Today's rows have no swipe actions.** A long-press opens the row's actions menu, the same menu its visible control opens.

[OWNER 2026-11-08 D130] [PROPOSED]

**2.47** A gesture never starts on a field (`input`, `textarea`, `select`, contenteditable), a slider, a horizontal scroller (date strips, chip rows, the Journey map), an element marked `data-swipe-ignore`, or within 24px of the left or right screen edge, which belong to the system; the installed iOS app's back edge is the one exception. Section swipe never starts while a sheet or dialog is open, or inside the docked review. Nothing moves until 10px of travel locks the axis; a vertical lock leaves the touch to native scrolling. A second finger or a cancelled pointer cancels the gesture, and nothing commits before release. [OWNER 2026-11-08 D130] [PROPOSED]

**2.48** A gesture follows the finger 1:1 and settles or springs back with the motion tokens (JITM-06 §2.39); a new touch can catch a settling surface. A gesture is a shortcut: its visible control always stays (JITM-10 §2.26). [OWNER 2026-11-08 D130]

**2.49** Section swipe can be turned off. Personal preferences, in the Appearance group, has a switch, "Swipe between sections", next to the Quick Add shortcut switch. It is on by default on touch devices, is remembered for the browser like §2.34's switch, and removes only section swipe. [OWNER 2026-11-08 D130] [PROPOSED]

## 3. Canonical implementations

| Pattern | Reuse |
|---|---|
| Review and outcome | `src/components/EditableFollowUpAction.tsx`, `FollowUpChannelChoice.tsx`, `JumpActionControls.tsx`, `JumpWorkflow.tsx` (confirmation with Undo, return tray) |
| Sheets and docked review | `src/components/Sheet.tsx`, `src/lib/sheet-layout.ts`, `src/styles/popups.css` |
| Confirmations | `src/components/ConfirmDialog.tsx`, `src/components/useConfirmDialog.tsx`, `src/components/ReviewDialog.tsx` |
| Quick Add | `src/components/QuickAdd.tsx`, `src/lib/quick-add-shortcut.ts` |
| Disclosures | `src/styles/disclosures.css` (`disclosure-menu` for "•••") |
| Forms and drafts | `src/components/ActionForm.tsx`, `FormGuard.tsx`, `FormSubmitButton.tsx`, `RequiredFieldsNote.tsx`, `src/lib/unconfirmed-save.ts` |
| Pickers | `src/components/TimezonePicker.tsx`, `src/components/WhenPicker.tsx` |
| States and notices | `src/components/EmptyState.tsx`, `Notice.tsx`, `UrlErrorNotice.tsx`, `src/app/(app)/*/loading.tsx`, `src/app/error.tsx` |

## 4. Do / Don't

- **Do** ask "Remove this note from the timeline?" with `useConfirmDialog`, Cancel focused, and a `danger` action.
- **Do** show "Text: needs a phone number" under a disabled Text choice, with a link to add one, as Today does.
- **Do** keep an editor mounted inside a closed sheet or hidden pane.
- **Don't** mark a follow-up sent because the texting app opened.
- **Don't** use `window.confirm` for a new destructive action.
- **Don't** flatten the Today briefing into a plain row, or drop the Apply button from the Mixes filter.
- **Don't** replace a list the owner is editing when fresh data arrives; hold it and say so.
- **Don't** reset a form after a failed save.

## 5. Verification

- Run JITM-12 §2.26 across validation, empty/filtered-empty, loading, error/recovery, offline and signed-in/out states. Check field error associations and either-or constraints, retained failed-save entries, dirty-section markers, one scoped save, immediate press/loading feedback and copy-button confirmation. Recheck disabled reasons, deep-link opening and sheet heading focus with its documented Quick Add exception.

- Browser suites: `e2e/design-consistency.spec.ts` (disclosures, app confirmations), `e2e/sheet-interactions.spec.ts` (drafts, nested Snooze, focus, failed saves, collapsed invalid fields), `e2e/design-correction.spec.ts` (confirmation and Undo, phone review), `e2e/design-refresh.spec.ts` (review dialogs contain and restore focus), `e2e/save-recovery.spec.ts`, `e2e/follow-up-drafts.spec.ts`, `e2e/mobile-clarity.spec.ts` (review, handoff and outcome).
- `tests/design-system-accessibility.test.ts` checks the `ConfirmDialog` contract.
- By hand: open a sheet and confirm the heading has focus; press Escape with a nested picker open; resize from desktop to phone with a draft open; break the network during a save and check that values stay and focus lands on the error.
- `grep -rn "window.confirm" src` finds only the two `FormGuard` guards.
- Gestures (§2.46–§2.49), once built: the gesture engine's unit tests, and Playwright with `hasTouch` and `isMobile` for each gesture, its cancel, each exclusion, the unsaved guard and the setting. Fine-pointer runs confirm desktop is unchanged. Real devices under JITM-10 §2.19. The full plan is §11 of the [native navigation spec](../design/NATIVE-NAVIGATION.md).

## 6. Open decisions and known deviations

### Design audit 2026-11-08

Recommend keeping §2.12's review-heading focus and testing any Quick Add capture-field exception change through UXA-03 (P-02); the current exception remains. Keep D9's explicit Apply on library filters (A-03), with instant Today/Contacts behavior. P-06 and the gesture, dismissal and motion-token rules are now §2.46–§2.49 and JITM-06 §2.39 (D130, written by JITM-NAV-00 job_4e4e542a5b4c, re-filed from job_24403bb7c4ce); JITM-NAV-01 job_626a96e3d44e builds the dismissal. A rule is not a landed implementation. A-18: implement the owner's readable-content decision through UXA-18B job_c81437336251, but reconcile the actual dissent in note_3572a39d7df3860d before shipping; the digest's claim of concurrence is incorrect. Source and owner quote are in the dated record. SaveBar and section markers (A-14) landed at 338ae42 / ef7a02c; other editors still require their own adoption.

Open or partially resolved finding IDs and owners (details and landed evidence: [DRIFT_BASELINE](../standards-audit-2026-09-28/DRIFT_BASELINE.md#design-audit-2026-11-08)):

- E-09, A-20 — UXB-03 (job_a2a12aba8e5a).
- A-08 — UXA-07 (job_26e9425c8e09); verify one add action and consistent sibling intent under §2.45.
- A-16 — UXB-05 (job_c4544b060350); recommend an unselected chooser, preserving JITM-09 §2.36 until amended.
- A-06 — UXA-10 (job_41d265c99e41); retain Journey's owner-decided default, with any last-used-view proposal in JITM-07 §6.
- E-18 — UXA-16 (job_30ad2b5af772).
- E-20, M-07, M-12, M-13 — UXB-02 (job_56ed53bc1495).
- M-08 — UXB-01 (job_fe7761baec35).
- M-11 — UXA-15 (job_2650d19a1f23).
- A-03, A-21, A-22 — UXB-05 (job_c4544b060350).
- A-04 — UXA-08 (job_738b06153234).
- A-09 — UXB-06 (job_9ca5b9672d9a).
- A-11, A-25, A-26 — UXB-04 (job_a5a8516f1138).
- A-18 — UXA-18B (job_c81437336251).
- P-01 — UXA-02 (job_0b1956750ccb).
- P-02 — UXA-03 (job_44db7c9b8cd7).
- P-06 — JITM-NAV-01 (job_626a96e3d44e); rule §2.46 (D130).
- P-08 — UXB-07 (job_ca566cea09be).
- P-10 — UXA-17 (job_36fb00a64b10).

- **§2.18** is a proposal. The export's bubble kit says confirmations use the anchored pop-up (`screens/BubbleKit.html:21`), but the product uses modal dialogs for focus and Cancel-first behavior.
- **Swipe actions (decided, D130):** the export's phone rows that swipe to Snooze and Done (`screens/Main.html:21`) are not built. Kevin chose section swipe, and Today's rows get a long-press menu (§2.46). No slice builds the long-press yet; it belongs with the Today row work (JITM-UXA-02 job_0b1956750ccb) or a new task.
- **Gestures are decided, not built (D130):** at b9bfd1d6 the product has no gesture code; the sheet handle is drawn by `src/styles/popups.css:25` and does nothing (P-06). JITM-NAV-01 to JITM-NAV-06 build §2.46–§2.49; until each lands, its part of those rules is a known deviation.
- **Confirmation look:** the completion confirmation does not use the export's dark toast bubble (JITM-06 §6).
- An older record says filters apply without an Apply button (`docs/UX_WORKFLOW_OPTIMIZATION.md:13`); D9 supersedes it for the Mixes, Ready-made and Marketplace sheets.
- `FormGuard`'s second native prompt (`src/components/FormGuard.tsx:45`) guards another form's submit, not navigation. It stays native because the decision is synchronous.
- **D70 is built** (PR #141): the next review opens by itself and the counts update at once.
- **D99 is built** (PR #151, `prod-2026-10-13-4d5c307`): Today no longer holds its reads for an Undo, and LIV-01's case keeps its card (D112). A read can still move a card from under an open review, against §2.33 and §2.36, in PLC-01's cases: (a) a person whose only follow-up here is overdue, contacted elsewhere, moves to Today; (b) that contact undone moves back; (c) the later follow-up skipped, snoozed, or recorded as No answer or Wrong number moves the earlier card to Overdue. D112's next step, a card keeping its section while its review is open, covers them and B-20's older case below.
- **Decided, not built (D99, D112; backlog B-20 in `docs/STANDARDS_AUDIT_2026-09-28.md` §8):** a refresh that brings another of a person's follow-ups onto the page places their card by it (`src/lib/today-view.ts:76-96` at 4d5c307), so the card can move out from under a review open on it and the review closes. This predates D99. Against §2.33 and §2.36.
- **D88, D91 and D100 are built** (PR #150, `prod-2026-10-13-4d5c307`): the profile's Archive acts at once with Undo, the strip's Mark No Mix needed opens its sheet on the heading, and a notice that appears in a phone review comes into view above the stuck bar.
- **Known gaps in what PRs #150 and #151 built:**
  - INT-01 (#150): at 390×480, Mark No Mix needed's sheet opens scrolled to its No Mix part, so its focused heading and close button are above the view (D91, against §2.12).
  - LAY-01 (#150): at 320×568, the draft conflict comes into view with the message box under the sheet's sticky header (D100, against §2.36).
  - UND-01's other half (#151): a read already in flight with a newer revision brings a finished card back as pending beside its confirmation, until the outcome's own read removes it (against §2.33).
  - TRN-01 (#151): the draft hold is checked when a read is applied, not when its transition commits, so an edit started in that moment is overtaken and the notice clears while the old list shows (against §2.33).
  - Backlog B-22: two older confirmation problems that #151's screenshots showed (against §2.4).

## 7. Changelog

- 1.0.0 — 2026-09-28 — Initial version.
- 1.0.1 — 2026-09-29 — Base 9f967bc. §2.30: an untouched form never warns; changes count from the person's first action, and status-only fields carry `data-form-guard-ignore` (Kevin's go-ahead, 2026-09-29).
- 1.1.0 — 2026-10-06 — Base 8bee3b1. §2.35 applies review, outcome and Undo to actions an owner's assistant takes through the connector, with calls in the owner's own voice and permission held in the assistant (D38, D39, D42, D43).
- 1.2.0 — 2026-10-08 — Base f23db11. New §2.36: Today opens the next due follow-up after each outcome, with the Undo still on screen and counts updated at once (D70, the UX audit's answers); §2.4 and §2.33 point to it; §6 notes that it is not built yet.
- 2.0.0 — 2026-10-12 — Base 4e78545. §2.33 changes meaning: Today's list waits for a message edit or an open draft, and an open Undo no longer holds it, since confirmations and their Undo sit outside the list (D99); Journey still pauses for edits, a path being chosen and focus in a form. §2.36: when the next review opens and when it doesn't (D70's scope, confirmed 2026-10-09); a refresh never takes away a confirmation or closes an open review (D99); notices clear of the stuck bar (D100). §6: D70 is built; D88, D91, D99 and D100 are decided and not yet built, and so is a card's place when a refresh brings another of the person's follow-ups (backlog B-20). LIV-01's fix, keeping a contacted person under Today, is proposed.
- 2.1.0 — 2026-10-13 — Base 4d5c307. §2.4: Reopen says "Already reopened." when the follow-up was reopened elsewhere (D115), and an Undo or a Reopen that finds it so counts as reopened (UND-01, built). §2.33: Today names a read only past a second (D114), which answers §6's question about refresh notices. §2.36: LIV-01's fix is Kevin's (D112). §6: D88, D91, D99 and D100 are built (PRs #150, #151), with their known gaps, and PLC-01's cases join B-20 (D112).

- 3.0.0 — 2026-11-09 — Base ef7a02c7b86d29d9c3ed5cab4928758166e24740. Add §2.37–§2.45; refine states, disclosures, filters and control intent. Major because §2.23 scopes saves and §2.27 replaces the blanket required-fields convention with the actual form constraint. §2.44 records the offline owner decision without claiming second-opinion concurrence. Preserve Quick Add focus, library Apply and named route/default-view exceptions.
- 3.1.0 — 2026-11-11 — Base b9bfd1d64674f4a70a017b058fe7ceb1ba42ba39. New §2.46–§2.49: the touch gesture map, exclusions, feel and the section-swipe setting, from Kevin's 2026-11-08 request and approval ("Approve the swipe spec, go with section swipe", D130), with the detail in `docs/design/NATIVE-NAVIGATION.md`. §6: the export's row-swipe question is answered (no row swipes; long-press menu), and the gesture rules are recorded as decided, not built.
