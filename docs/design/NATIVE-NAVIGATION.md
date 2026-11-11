# Native-feel navigation on phones and tablets

Status: **approved concept, not built.** Kevin approved it on 2026-11-08 (D130 in [OWNER_DECISIONS](../standards-audit-2026-09-28/OWNER_DECISIONS.md)). The slices JITM-NAV-01 to JITM-NAV-06 build it (§12). Nothing in this document is shipped behavior until its slice lands; it is planned work under JITM-15 §2.15.

Base: `origin/main` b9bfd1d64674f4a70a017b058fe7ceb1ba42ba39. File and line references below are to that commit. Written 2026-11-11 UTC by JITM-NAV-00 (Hub job_4e4e542a5b4c, re-filed from job_24403bb7c4ce).

The rules this spec feeds live in the standards: the gesture map and exclusions in JITM-08 §2.46–§2.49, the motion tokens in JITM-06 §2.39, the gesture-equivalent rule in JITM-10 §2.26 and the section ring in JITM-07 §2.33. If this document and a standard disagree, the standard wins (JITM-00 §2). This document adds the detail an implementer needs: thresholds, the state machine, arbitration between gestures, and the test plan.

## 0. Owner words

- **Request, 2026-11-08:** "I also would like to incorporate swipe to slide functionality to the next page for easy phone/tablet navigation. Please conceptualize the best method of implementation for these so that the webapp feels like an authetic native app."
- **Approval, 2026-11-08:** "Approve the swipe spec, go with section swipe"

Kevin chose section swipe (A) over swipe actions on Today's rows (F). Both are horizontal and can't share a screen. Today's rows get a long-press menu instead (§3 F).

This answers the question the interaction standard carried since 2026-09-28: the design export shows phone rows that swipe to Snooze and Done, and the product had no swipe gestures (JITM-08 §6, version 1.0.0).

## 1. Principles

1. **Platform first.** Paging uses real browser scrolling (CSS scroll-snap). Back uses browser history. Momentum, rubber-banding, accessibility and the system back gestures then stay native. Script handles only what the platform lacks.
2. **Gestures are shortcuts.** Every swipe has a visible control that does the same thing (WCAG 2.2 success criteria 2.5.1 Pointer Gestures and 2.5.7 Dragging Movements). No task requires a gesture.
3. **One horizontal meaning per surface.** A surface never has two competing horizontal swipes. §5 says which gesture owns which surface.
4. **Follow the finger, then settle.** While the finger is down, the surface moves 1:1 with it. On release it settles to the committed state or springs back. A settle can be interrupted by a new touch.
5. **Reduced motion keeps every gesture.** With reduced motion on, every gesture still works. The settle, the spring-back and the page slide become an instant swap (§7).

## 2. Terms used in this spec

These are implementation terms. None is customer-facing copy, and the glossary (JITM-05) is unchanged.

| Term | Meaning |
|---|---|
| Section ring | The ordered stops for section swipe: Today, Contacts, Mixes, More (JITM-07 §2.33). |
| Ring stop | One of those four top-level screens: `/jumps`, `/contacts`, `/mixes`, `/more`. |
| Peek | The neighbour's title and loading skeleton sliding in beside the current page during a drag. |
| Commit | Release past the distance or velocity threshold: the gesture's action happens. |
| Cancel | Release before a threshold, or an interruption: the surface springs back and nothing happens. |
| Axis lock | The decision, after 10 px of movement, whether a touch is horizontal or vertical. |
| Fling velocity | Pointer speed over the last 100 ms before release, in px/ms. |

## 3. Gesture map

| | Gesture | Where | Visible equivalent | Slice |
|---|---|---|---|---|
| A | Section swipe | Ring stops, coarse pointer | Bottom navigation (rail from 901 px) | JITM-NAV-03 |
| B | Pane paging | Journey; Mixes on phones; Ready-made and Marketplace sub-tabs | The pane tabs or segmented control | JITM-NAV-02 |
| C | Back | Every drill-in; edge swipe only in the installed iOS app | `BackLink` and the browser's Back | JITM-NAV-04 |
| D | Sheet dismiss | Every bottom sheet (below 768 px) | Close | JITM-NAV-01 |
| E | Next follow-up | Review sheet header | Next and Previous buttons | JITM-NAV-05 |
| F | No row swipe actions | Today's rows | The row's actions control; long-press opens the same menu | (see F) |

### A. Section swipe

Kevin's "swipe to the next page".

- **Where:** phones and tablets with a coarse pointer (`(pointer: coarse)`), on the four ring stops only. Never on a drill-in page or sub-page, such as a contact, a Mix editor, Journey, Calendar, Settings, Ready-made or Marketplace. It is off for fine pointers at every width, desktop included. It applies at every width where the device has a coarse pointer: under the bottom navigation up to 900 px and beside the rail from 901 px on a landscape tablet.
- **Order:** Today ↔ Contacts ↔ Mixes ↔ More, the bottom navigation's order (JITM-09 §2.3). Quick Add is an action, not a stop. Journey and Calendar are not stops, even where the rail shows them. The ends don't wrap: Today has no previous section and More has no next. A drag past an end moves with resistance and springs back.
- **Direction:** swiping left (finger moves right to left) goes to the next section. Swiping right goes to the previous one. This is the direction of native pagers.
- **Feel: peek and commit.**
  - The page follows the finger 1:1. The neighbour's title and its loading skeleton slide in from the side it lives on.
  - Commit when the release is past **35% of the viewport width**, or the fling velocity is at least **0.5 px/ms** in the drag's direction. Otherwise spring back.
  - The highlight in the bottom navigation (or rail) moves with the drag, in proportion to its progress. It snaps to the new section on commit and back on cancel.
- **On commit:** router navigation to the neighbour, inside a View Transition that continues the slide from where the finger left it. The ring neighbours of the current stop are prefetched when the browser is idle, so the real page replaces the skeleton within about 300 ms on the test fixture. Until it does, the neighbour's own loading state shows, never a blank or frozen screen (JITM-08 §2.38).
- **Leaving work:** a commit leaves the page exactly as tapping the navigation would. The unsaved-change guards of JITM-08 §2.30 run first, so a swipe never discards a draft. If the owner keeps editing, the swipe cancels.
- **Loading states at the base:** Today, Contacts and Mixes have a `loading.tsx` (`src/app/(app)/{jumps,contacts,mixes}/loading.tsx`). More has none (`src/app/(app)/more/`). JITM-NAV-03 supplies its peek, using its title or a loading state.
- **Platform note:** native bottom tab bars on iOS and Android rarely swipe. Section swipe mirrors the top-tab pagers common on Android, so it must stay predictable: the same order as the bottom navigation, no start from the screen edges (§4), no wrap at the ends, off on desktop, and a setting to turn it off (§9).

### B. Pane paging inside a screen

- **Where:**
  - Journey's People / Mixes / Details switcher below 1200 px (JITM-07 §2.19);
  - the Mix library's phone switcher, Mixes / Beats / Details (JITM-07 §2.18; `src/components/MixLibraryShell.tsx:10-12`);
  - the in-page sub-tabs (segmented sections) of Ready-made and Marketplace.
- **Build:** a CSS scroll-snap pager (`scroll-snap-type: x mandatory`, one pane per snap point) with native momentum. The tab indicator is synced to the scroll position. The tabs are ARIA tabs (`tablist`, `tab`, `tabpanel`, `aria-selected`) with Left and Right arrow keys. At the base the Mix library switcher uses buttons with `aria-pressed`; JITM-NAV-02 changes it to tabs.
- **Panes stay mounted** (JITM-07 §2.2), so drafts survive paging.
- **Disabled panes:** a pane that is disabled, such as Beats and Details before a Mix is chosen, is not a snap point. The pager never pages into it.
- **Nested-pager hand-off:** on a ring stop that has a pager (Mixes on phones), panes page first. A continued swipe from the first pane's leading edge or the last pane's trailing edge starts section swipe (A). On screens that are not ring stops (Journey, Ready-made, Marketplace), the pager's ends rubber-band natively and nothing else happens.

### C. Back

- **Every drill-in is a real history entry.** Opening a contact, a Mix, Settings or any other sub-page pushes history, so the browser's Back, Android's system back and `BackLink` all return to the parent with its scroll position restored.
- **Slide-back:** on `popstate`, the return runs inside a View Transition that slides the parent in from the left, with scroll restoration. Forward navigation to a drill-in slides the child in from the right.
- **Never handle the same back twice.**
  - The browser's and Android's own back gestures stay untouched. The app never intercepts them or adds its own handler on top.
  - If the browser has already animated the back itself (for example, an iOS Safari edge swipe in a browser tab), the slide-back is skipped. Where the Navigation API reports this (`NavigateEvent.hasUAVisualTransition`), use it. Where the browser cannot tell, skip the slide-back in that browser rather than animate twice. JITM-NAV-04 verifies support on each target browser and records the source and date (JITM-15 §2.18).
- **Installed iOS app:** in the installed app (`display-mode: standalone` with `navigator.standalone`, as `src/components/PwaInstallPrompt.tsx:24` detects it) iOS offers no back swipe and no back button. There, a swipe that starts within **20 px of the left edge** goes back. The page follows the finger, and the gesture commits by the same distance and velocity thresholds as A, then calls `history.back()`. This is the one exception to the 24 px edge exclusion (§4). The visible equivalent is `BackLink` (JITM-07 §2.8). Installed Android apps keep the system back and get no edge swipe.
- **Ring stops:** the edge swipe never runs on a ring stop's own screen, where a horizontal swipe is A. A section swipe adds history like tapping the navigation, so Back after one returns to the previous section. A history move between two ring stops slides in ring order (Contacts enters from the left of Mixes, never from the right), not as a drill-in's slide-back.

### D. Sheet dismiss

- **Where:** every sheet rendered as a bottom sheet, that is below 768 px (JITM-08 §2.11): the Today review sheet, Quick Add, the follow-up actions sheet and the filter sheets. Fine pointers and the docked review from 768 px are unchanged.
- **Grip:** the drag starts on the handle or the sheet header. At the base the handle is decorative, a `.sheet-header::before` bar (`src/styles/popups.css:25`); this is audit finding P-06, a handle with no swipe.
- **Inner scroll goes first.** A downward drag on the sheet body scrolls the body. Dismissal starts only once the body is at `scrollTop` 0 and the drag continues downward. A drag on the header always moves the sheet.
- **Commit** when the release is past **30% of the sheet's height**, or the fling velocity downward is at least **0.5 px/ms**. Otherwise spring back.
- **The unsaved guard runs exactly as on Close.** A swipe that would close a sheet with unsaved edits asks first, as Close does: "Keep your message edits?" for the review (`src/components/TodayNavigation.tsx:131`) and the capture guard for Quick Add (JITM-08 §2.30). If the owner keeps editing, the sheet springs back open.
- **Detents for the review sheet:** the review sheet has a full detent and a half detent on phones. It opens at full, its current height bounded to the viewport, so the channels and outcomes of JITM-08 §2.3 stay visible. A drag down from full settles at half, which keeps at least the person's heading and the start of the message in view. A drag down from half, or a fling from full, dismisses. A drag up from half returns to full. Moving between detents never runs the unsaved guard; only a dismissal does. JITM-NAV-01's brief makes detents optional; if it defers them, it records that as its default decision.
- **Short screens:** at 480 px high or less, sheet headers scroll with their content (JITM-07 §2.26). The header grip still works whenever the header is in view. Dismissal still waits for `scrollTop` 0.
- **The visible Close stays.** Closing, focus return and Escape are unchanged (JITM-08 §2.12, §2.14).

### E. Next follow-up in the review sheet

- **Where:** the header of the Today review, in the bottom sheet and in the docked review.
- **Gesture:** a horizontal swipe on the header moves to the next follow-up (swipe left) or the previous one (swipe right), in the order Today shows them. Thresholds are A's. The header follows the finger, and the neighbouring person's name peeks in.
- **Visible equivalent:** Next and Previous buttons in the review header do the same. At the first and last follow-up the matching button is disabled with its reason (JITM-08 §2.6), and the swipe springs back.
- **The unsaved guard applies** as for any review change ("Keep your message edits?").
- **Arbitration with D:** on the header, axis lock decides. A vertical drag is D, a horizontal one is E.
- **Relation to JITM-08 §2.36:** the review still opens the next due follow-up by itself after an outcome. E moves without recording an outcome; it skips nothing and changes no follow-up.

### F. Not doing: swipe actions on Today's rows

- Rows on Today don't swipe to Snooze or Done. A row swipe would compete with section swipe (A) on the same screen, against principle 3. Kevin chose A.
- **Long-press opens the row's actions menu,** the same menu the row's visible actions control opens. Long-press is a shortcut; the visible control stays (JITM-10 §2.26).
  - Use the platform's long-press where it fires as `contextmenu` on touch. Otherwise open after 500 ms of a still touch, and cancel if the finger moves more than 10 px first.
  - Suppress the browser's link callout on the row (`-webkit-touch-callout: none`) so the menu, not the link preview, opens.
  - Long-press has no slice of its own at the base. It belongs with the Today row work (JITM-UXA-02, job_0b1956750ccb) or a follow-up task; JITM-NAV-00 reports it as follow-up work.

## 4. Exclusions

A gesture never starts:

- on an `input`, `textarea`, `select`, `[contenteditable]` or slider (`input[type=range]`, `[role=slider]`);
- on a horizontal scroller: the date strips, chip rows and the Journey map, or any element that can scroll sideways;
- on anything marked `data-swipe-ignore`, the opt-out for any other surface that needs its own horizontal touch;
- for A, while any sheet or dialog is open, and inside the docked review on Today, whose header belongs to E;
- in the **24 px at the left and right screen edges**, which belong to the system's own gestures. C's 20 px left edge in the installed iOS app is the one exception, because iOS has no system back there.

Also:

- **Axis lock after 10 px.** Until the touch has moved 10 px, nothing moves. Then the larger axis wins. A vertical lock hands the touch to native scrolling for the rest of the touch. A horizontal lock owns it.
- **One finger only.** A second touch cancels the gesture and springs back, so pinch zoom stays the browser's.
- **`pointercancel` cancels.** When the browser takes the touch (for example, for scrolling or a system gesture), the gesture springs back and does nothing.
- **Commit on release.** Nothing happens on touch-down. Dragging back before release cancels (WCAG 2.2 success criterion 2.5.2 Pointer Cancellation).
- **`touch-action`.** A surface that owns horizontal swipes declares `touch-action: pan-y` (vertical scrolling stays native); a sheet grip declares `touch-action: none` on the handle and header only. Never set `touch-action: none` on a page.

## 5. Arbitration: one horizontal meaning per surface

From the most specific to the least, the first match owns a horizontal touch:

1. An excluded target (§4): no gesture; native behavior.
2. A horizontal scroller inside the page: it scrolls natively.
3. An open bottom sheet: D (vertical) and, on the review header, E (horizontal). Nothing underneath the sheet reacts.
4. The docked review on Today: E on its header; nothing elsewhere in the pane.
5. A pane pager (B): it pages; at its first or last pane it hands off to A where A runs (§3 B).
6. A ring stop's page: A.
7. In the installed iOS app, a touch starting within 20 px of the left edge on a drill-in page: C.

## 6. Gesture engine (JITM-NAV-01)

One engine serves every gesture, for example a `src/lib/gestures/` module with a `useSwipe` hook. It is built on Pointer Events, so touch, pen and mouse share one path, and it is enabled for coarse pointers only.

State machine:

| State | Enter when | Leave when |
|---|---|---|
| Idle | — | `pointerdown` on an eligible target (§4, §5) → Pending |
| Pending | Pointer down | Moved ≥ 10 px: horizontal → Dragging; vertical → Idle (native scroll); second pointer, `pointercancel` or release → Idle |
| Dragging | Axis locked to the gesture's axis | Release → Settling (commit or cancel by threshold); second pointer or `pointercancel` → Settling (cancel) |
| Settling | Release | Animation ends → Idle. A new `pointerdown` on the same surface interrupts and returns to Dragging from the current position. |

Thresholds, one place in the engine:

| Value | Default | Used by |
|---|---|---|
| Axis lock | 10 px | All |
| Commit distance, horizontal | 35% of the viewport width | A, C, E |
| Commit distance, vertical | 30% of the sheet's height | D |
| Fling velocity | 0.5 px/ms, measured over the last 100 ms | A, C, D, E |
| Edge exclusion | 24 px left and right | All starts |
| Standalone iOS back edge | 20 px from the left | C |
| Long-press | Platform `contextmenu`, else 500 ms and 10 px tolerance | F |
| Resistance past a ring end | Movement scaled to about one third | A |

During a drag the engine writes only `transform` (and, for the peek, `opacity`) on a composited layer, with no transition, inside `requestAnimationFrame`. No task over 50 ms runs during a drag (a performance trace checks it, §11).

## 7. Motion

The tokens are a WF-08 addition to the design system (JITM-06 §2.39). At the base the design layer had no motion scale (JITM-06 §2.32); only legacy `base.css` has `--motion-fast: 160ms` (`src/styles/base.css:42`).

| Token | Value | Use |
|---|---|---|
| (none) | 1:1 | The drag itself follows the finger, with no duration or easing. |
| `--motion-settle` | `220ms` | Commit and settle: a section, pane, sheet or review settling into place, and the View Transition that continues a committed swipe. |
| `--motion-cancel` | `180ms` | Spring-back after a cancel. |
| `--ease-settle` | `cubic-bezier(0.32, 0.72, 0, 1)` | Easing for both. A script-driven settle MAY use a critically damped spring of equivalent duration instead. |

The settle stays within 200–250 ms. 220 ms sits inside both this spec's range and the 150–240 ms the design audit recorded as the product's current motion (`docs/design/UX_AUDIT_2026-11-08.md:123`). Animate `transform` and `opacity` only, never `transition: all`.

The tokens live in `src/styles/design-tokens.css`, once, because motion has no theme. Script reads them from CSS rather than repeating the numbers.

**Reduced motion** (`prefers-reduced-motion: reduce`):

- Every gesture still works, with the same thresholds and the same visible equivalents.
- Every movement the finger does not drive is instant: the settle, the spring-back, the page and slide-back View Transitions, the sheet settle and the detent change.
- While the finger is down, the surface still tracks it, as native scrolling does under reduced motion. The motion is the owner's own. JITM-NAV-03 checks this choice on a real device under JITM-10 §2.19; if it proves uncomfortable, the drag can show only the bottom-navigation highlight and a still peek.
- The existing rule stays: `transition-duration` and `animation-duration` of `.01ms` on `*, *::before, *::after` (`src/styles/base.css:73-76`, JITM-10 §2.13). That selector doesn't reach View Transition pseudo-elements, so the reduced-motion block MUST also cover `::view-transition-group(*)`, `::view-transition-old(*)` and `::view-transition-new(*)`. Script-driven settles check the media query and jump.

## 8. Accessibility

- **Every gesture has a visible control** (table in §3). Keyboard and screen-reader paths are unchanged, and no task needs a gesture (JITM-10 §2.17, §2.26).
- **Section change:** after A commits, the route announcer speaks the new page and focus moves to the new H1 without adding a tab stop (JITM-10 §2.23). JITM-UXB-03 (job_a2a12aba8e5a) provides the H1 focus for every route; JITM-NAV-01, NAV-03, NAV-04 and NAV-06 depend on it. At the base the announcer reads the title and focus stays on the body (audit finding A-20).
- **Pane paging:** ARIA tabs with arrow keys. The selected tab follows the scroll position, and choosing a tab scrolls its pane into view (instantly under reduced motion).
- **Next and Previous** are real buttons with accessible names that name the direction; they are disabled with a reason at the ends.
- **Targets:** new visible controls meet 44 px (JITM-10 §2.1).
- **Screen readers:** when a screen reader is on, the touch is the reader's. The app never relies on detecting one; visible controls carry every path.

## 9. Setting

- Personal preferences → the Appearance group gets a switch, **"Swipe between sections"**, beside the Quick Add shortcut switch (`src/components/Appearance.tsx:92-93`).
- On by default on touch devices. Turning it off removes section swipe (A) only. B, C, D, E and the long-press stay, because each has its own visible control and none competes with scrolling.
- Like the Quick Add shortcut, it is remembered for the browser (JITM-08 §2.34). Its helper text follows JITM-04.

## 10. Platform polish (JITM-NAV-06)

What the base already has, so NAV-06 does only the gaps (VERIFIED-CODE at b9bfd1d6):

| Item | At the base | NAV-06 |
|---|---|---|
| Manifest, standalone display, icons | `src/app/manifest.ts` (standalone, 192/512 and maskable icons, shortcuts); `appleWebApp.capable` and the apple-touch icon in `src/app/layout.tsx:38-40` | Check; keep |
| Theme colour | One `themeColor` (`#5d4cf2`) for both themes (`src/app/layout.tsx:43`) | Colours for light and dark, from the tokens' values |
| iOS splash | None found | Add launch images or record why not |
| Safe-area insets | `viewportFit: "cover"` and `env(safe-area-inset-*)` on the bottom navigation, sheets and fixed bars | Audit each fixed surface, both orientations |
| Overscroll | `overscroll-behavior: contain` on sheets and dialogs only (`src/styles/design-details.css:10`, `src/styles/mobile-ux.css:132`) | Contain inside the app shell, so the page never rubber-bands the browser chrome or reloads by accident |
| Tap highlight | `-webkit-tap-highlight-color: transparent` on buttons, links and fields (`src/styles/design-system.css:8`) | Keep; pair with press states |
| Touch press states | Not consistent (JITM-08 §2.38) | Immediate pressed response on every tap target |
| Pull-to-refresh on Today | None | Optional. If built: only at the top of Today, with a visible Refresh equivalent, never during a draft (JITM-08 §2.33) |

## 11. Test plan

- **Unit tests** for the gesture engine: axis lock at 10 px; commit by distance and by velocity, both directions; cancel; spring-back; interruption; a second pointer; `pointercancel`; each exclusion in §4, including `data-swipe-ignore`; the 24 px edge and the standalone 20 px exception; ring ends; the nested hand-off; the reduced-motion branch.
- **Playwright with touch emulation** (`hasTouch: true`, `isMobile: true`) in each slice: per sheet, drag-to-dismiss, inner-scroll priority and the unsaved guard (NAV-01); paging, tabs and arrow keys (NAV-02); the full ring both ways, cancel, each exclusion, the setting off, reduced motion and the H1 focus (NAV-03); slide-back and the standalone edge (NAV-04); Next, Previous and the guard (NAV-05). Fine-pointer runs confirm nothing changed on desktop at every JITM-07 §5 width.
- **Widths:** the JITM-07 §5 matrix on both sides of each touched boundary, a phone turned sideways (844×390, coarse pointer) and a fractional width (JITM-12 §2.18).
- **Performance:** a trace during a section drag shows no task over 50 ms. The real page replaces the peek within about 300 ms on the test fixture.
- **Real devices** under JITM-10 §2.19, recorded in `docs/MANUAL_DEVICE_QUALIFICATION.md`: iPhone Safari, the installed iOS app, Android Chrome, iPad, with VoiceOver and TalkBack. Automated touch emulation is necessary but not sufficient.

## 12. Slices

| Slice | Hub job | Builds | Waits on |
|---|---|---|---|
| JITM-NAV-01 | job_626a96e3d44e | Gesture engine (§6), motion tokens (§7), sheet dismiss (D), P-06 | JITM-NAV-00, JITM-UXB-03 |
| JITM-NAV-02 | job_65e8ffa9203c | Pane paging (B) | JITM-NAV-00, JITM-UXB-05 |
| JITM-NAV-03 | job_c2f027c489dc | Section swipe (A), the setting (§9) | NAV-01, NAV-02, UXB-03 |
| JITM-NAV-04 | job_924d292cc36b | Slide-back and the standalone iOS edge (C) | NAV-01, UXB-03 |
| JITM-NAV-05 | job_a7ee242f70c8 | Next follow-up (E) | NAV-01, UXA-02, UXA-03 |
| JITM-NAV-06 | job_a946d28d6fd9 | Platform polish (§10) | NAV-01, UXB-03 |

Each slice follows WF-02 and its brief. Values come from this spec and the tokens, never literals.

## 13. Readings taken while writing

These fill gaps in the approved concept. None changes a gesture, moves a threshold outside its approved range, or changes the section ring.

1. **The ring ends don't wrap.** The approved summary shows "Today ↔ Contacts ↔ Mixes ↔ More" and asks for predictability like a top-tab pager, which stops at its ends.
2. **The nested hand-off happens only where A runs.** Journey, Ready-made and Marketplace are not ring stops, so their pagers rubber-band at the ends.
3. **"An open sheet" blocks A,** and so does the inside of the docked review on Today, whose header is E's.
4. **One fling velocity, 0.5 px/ms,** for A, C, D and E. The concept gives it for A and says "velocity" for D.
5. **Settle is 220 ms,** inside the approved 200–250 ms and the audit's 150–240 ms.
6. **Reduced motion keeps finger tracking** and makes everything else instant (§7), as native scrolling and native pagers do under reduced motion. It is tagged as a proposal in JITM-10 §2.26, so Kevin can choose the stricter variant.
7. **The review sheet opens at full,** so JITM-08 §2.3's visible outcomes hold; half is reached only by dragging.
8. **The long-press timing** (platform `contextmenu`, else 500 ms) is a proposal. The concept names long-press without a value.
9. **Device qualification** is cited as JITM-10 §2.19, the rule that holds it. The brief named JITM-06.
10. **The file name** is the one the task brief and the held slices use, `docs/design/NATIVE-NAVIGATION.md`, rather than JITM-15 §2.1's upper-snake living-reference pattern.

## 14. Changelog

- 2026-11-11 — Initial version (JITM-NAV-00, base b9bfd1d6). Kevin's approval of 2026-11-08 is D130.
