# Manual device qualification

Automated browser tests are necessary but do not certify native handoffs, physical-device layouts, or assistive technology. Actual browser zoom can be automated for a specific engine; it does not qualify the manual desktop rows below. Every row below starts as **NOT RUN**. A tester must replace that status only after performing the scenario on the named device/browser.

For failures, record sanitized reproduction steps and classify the result as blocking or nonblocking. Record the exact OS and browser version in Notes. Under the current no-image instruction, use text, DOM and keyboard observations; do not capture screenshots, video or traces. If captures are authorized in a future session, keep them private and remove contact information.

| Scenario | Device / browser | Date | Tester | Result | Notes | Screenshot / trace reference | Classification |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Core Today, Contacts, Plans, More navigation | Physical iPhone / Safari | — | — | NOT RUN | Record model, iOS, Safari | — | Unclassified |
| Core Today, Contacts, Plans, More navigation | Physical Android / Chrome | — | — | NOT RUN | Record model, Android, Chrome | — | Unclassified |
| Desktop primary workflows | macOS or Windows / Chrome | — | — | NOT RUN | Include viewport | — | Unclassified |
| Desktop primary workflows | macOS or Windows / Firefox | — | — | NOT RUN | Include viewport | — | Unclassified |
| Desktop primary workflows | macOS / Safari | — | — | NOT RUN | Run where hardware is available | — | Unclassified |
| Native SMS composer and return outcome tray | Physical iPhone / Safari | — | — | NOT RUN | Verify recipient and return state | — | Unclassified |
| Native SMS composer and return outcome tray | Physical Android / Chrome | — | — | NOT RUN | Verify recipient and return state | — | Unclassified |
| Native email composer and return outcome tray | Physical iPhone / Safari | — | — | NOT RUN | Verify subject/body and private-note exclusion | — | Unclassified |
| Native email composer and return outcome tray | Physical Android / Chrome | — | — | NOT RUN | Verify subject/body and private-note exclusion | — | Unclassified |
| Native phone call and return outcome tray | Physical iPhone / Safari | — | — | NOT RUN | Verify No answer / voicemail / Done | — | Unclassified |
| Native phone call and return outcome tray | Physical Android / Chrome | — | — | NOT RUN | Verify No answer / voicemail / Done | — | Unclassified |
| WhatsApp handoff and return outcome tray | Physical iPhone / Safari | — | — | NOT RUN | Verify installed/not-installed behavior | — | Unclassified |
| WhatsApp handoff and return outcome tray | Physical Android / Chrome | — | — | NOT RUN | Verify installed/not-installed behavior | — | Unclassified |
| Contact detail fixed layout and More disclosure | Physical iPhone / Safari | — | — | NOT RUN | Verify Text/Call/Email, next follow-up, notes, timeline, and More | — | Unclassified |
| Contact detail fixed layout and More disclosure | Physical Android / Chrome | — | — | NOT RUN | Verify Text/Call/Email, next follow-up, notes, timeline, and More | — | Unclassified |
| Mobile keyboard overlap in Quick Add and forms | Physical iPhone / Safari | — | — | NOT RUN | Test longest form and outcome tray | — | Unclassified |
| Mobile keyboard overlap in Quick Add and forms | Physical Android / Chrome | — | — | NOT RUN | Test longest form and outcome tray | — | Unclassified |
| Safe-area spacing in portrait and landscape | Physical iPhone / Safari | — | — | NOT RUN | Include notched device | — | Unclassified |
| Safe-area spacing in portrait and landscape | Physical Android / Chrome | — | — | NOT RUN | Include gesture navigation | — | Unclassified |
| VoiceOver primary workflows | Physical iPhone / Safari | — | — | NOT RUN | Include rotor, sheets, prepared messages, and outcomes | — | Unclassified |
| TalkBack primary workflows | Physical Android / Chrome | — | — | NOT RUN | Include sheets, prepared messages, and outcomes | — | Unclassified |
| Keyboard-only primary workflows | Desktop Chrome | — | — | NOT RUN | Verify focus, dialogs, Escape, reordering | — | Unclassified |
| Keyboard-only primary workflows | Desktop Firefox | — | — | NOT RUN | Verify focus, dialogs, Escape, reordering | — | Unclassified |
| Browser zoom at 200% | Desktop Chrome and Firefox | — | — | NOT RUN | Check horizontal scroll and sticky controls | — | Unclassified |
| Browser zoom at 400% | Desktop Chrome and Firefox | — | — | NOT RUN | Check reflow, dialogs, forms, navigation | — | Unclassified |
| Account change, sign-out and browser history restoration | Physical iPhone / Safari and installed app | — | — | NOT RUN | With isolated synthetic accounts, switch or sign out in another tab, then return through tabs, app resume and Back/Forward; the previous account must stay hidden and be cleared after confirmation | — | Unclassified |
| Account change, sign-out and browser history restoration | Physical Android / Chrome and installed app | — | — | NOT RUN | Repeat with isolated synthetic accounts, including background app eviction and browser restoration | — | Unclassified |
| Offline navigation, reconnection and same-account draft recovery | Physical iPhone / Safari and installed app | — | — | NOT RUN | Use actual transport loss; new navigation shows only generic offline copy, while an existing tab preserves its draft after same-account reauthentication | — | Unclassified |
| Offline navigation, reconnection and same-account draft recovery | Physical Android / Chrome and installed app | — | — | NOT RUN | Use actual transport loss; check old-worker upgrade online before testing offline navigation and draft recovery | — | Unclassified |
| Push-subscription ownership after account changes | Physical iPhone and Android / installed app | — | — | NOT RUN | Automated session/ownership tests pass. Physical tests need authorized isolated pushes: cover queued delivery, closed apps, expiry, browser-generated fallback notifications, sign-out and the current account after a click | — | Unclassified |

## Automated native zoom evidence

On September 6, 2026, desktop Chromium passed an actual browser-zoom regression at 100%, 200%, and 400%, using an isolated extension's `chrome.tabs.setZoom` API. The viewport changed from 1280 to 640 to 320 CSS pixels and device pixel ratio from 1 to 2 to 4. No CSS zoom or viewport-resize substitution was used.

The compiled local application passed pending/completed Today in both themes, axe, horizontal reflow, message draft recovery, navigation draft protection, Discard edits, Filter, keyboard pagination, heading focus, and unobscured pagination targets of at least 44 CSS pixels. It reproduced and then verified fixes for sticky sheet titles covering actions and the bottom navigation covering pagination at 400%. Private text evidence: `native-zoom-scroll.log` and `native-zoom-scroll-results/` under `.artifacts/design-refresh-2026-09-05/`.

The same build also passed twelve hosted Today/message states at those zoom levels in both themes, using an existing editable follow-up. Discard edits restored the original text, with no business mutation or page error. Evidence: `zoom-native-live.json`. The subsequent runtime-context correction reused this build and rechecked 24 hosted journey/contact/Today states; see the implementation report for the deployment IDs.

This evidence covers the Linux Chromium engine. Firefox native zoom, physical Safari, mobile keyboards, operating-system text scaling, and assistive technology remain separate qualifications. The manual rows above remain **NOT RUN**.

## Result definitions

- **PASS:** scenario completed without loss of data, context, or access.
- **FAIL:** expected behavior did not complete or the interface became unusable.
- **BLOCKED:** test could not run because required hardware, software, or setup was unavailable.
- **NOT RUN:** no manual qualification has been performed.

Blocking means the result prevents a core pilot task, risks data/security, or makes the intended device inaccessible. Nonblocking observations may be scheduled after pilot entry, but must remain recorded.
