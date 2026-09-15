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
| Fine-tuned draft persists across reload and renders with current contact details | Physical iPhone / Safari | — | — | NOT RUN | Edit a Today message, reload, rename the contact; expect the edit kept and the name updated | — | Unclassified |
| Fine-tuned draft persists across reload and renders with current contact details | Physical Android / Chrome | — | — | NOT RUN | Same as above | — | Unclassified |
| Native SMS handoff records an attempt and the return tray ties the outcome to it | Physical iPhone / Safari | — | — | NOT RUN | Open text, return, tap Sent; expect one JumpAttempt with the opened text and the activity linked | — | Unclassified |
| Native SMS handoff records an attempt and the return tray ties the outcome to it | Physical Android / Chrome | — | — | NOT RUN | Same as above | — | Unclassified |
| Draft revision conflict keeps local wording and offers one choice | Physical iPhone / Safari | — | — | NOT RUN | Edit on two devices; expect the inline choice, no silent replacement | — | Unclassified |
| Draft revision conflict keeps local wording and offers one choice | Physical Android / Chrome | — | — | NOT RUN | Same as above | — | Unclassified |
| One-save visit with plan, then hold and no-show from the agenda | Physical iPhone / Safari | — | — | NOT RUN | Schedule a meeting with a plan and a new person; expect the anchored reminder on Today; hold and mark no-show | — | Unclassified |
| One-save visit with plan, then hold and no-show from the agenda | Physical Android / Chrome | — | — | NOT RUN | Same as above | — | Unclassified |
| Keyboard-only primary workflows | Desktop Chrome | — | — | NOT RUN | Verify focus, dialogs, Escape, reordering | — | Unclassified |
| Keyboard-only primary workflows | Desktop Firefox | — | — | NOT RUN | Verify focus, dialogs, Escape, reordering | — | Unclassified |
| Browser zoom at 200% | Desktop Chrome and Firefox | — | — | NOT RUN | Check horizontal scroll and sticky controls | — | Unclassified |
| Browser zoom at 400% | Desktop Chrome and Firefox | — | — | NOT RUN | Check reflow, dialogs, forms, navigation | — | Unclassified |
| Account change, sign-out and browser history restoration | Physical iPhone / Safari and installed app | — | — | NOT RUN | With isolated synthetic accounts, switch or sign out in another tab, then return through tabs, app resume and Back/Forward; the previous account must stay hidden and be cleared after confirmation | — | Unclassified |
| Account change, sign-out and browser history restoration | Physical Android / Chrome and installed app | — | — | NOT RUN | Repeat with isolated synthetic accounts, including background app eviction and browser restoration | — | Unclassified |
| Offline navigation, reconnection and same-account draft recovery | Physical iPhone / Safari and installed app | — | — | NOT RUN | Use actual transport loss; new navigation shows only generic offline copy, while an existing tab preserves its draft after same-account reauthentication | — | Unclassified |
| Offline navigation, reconnection and same-account draft recovery | Physical Android / Chrome and installed app | — | — | NOT RUN | Use actual transport loss; check old-worker upgrade online before testing offline navigation and draft recovery | — | Unclassified |
| Push-subscription ownership after account changes | Physical iPhone and Android / installed app | — | — | NOT RUN | Automated session/ownership tests pass. Physical tests need authorized isolated pushes: cover queued delivery, closed apps, expiry, browser-generated fallback notifications, sign-out and the current account after a click | — | Unclassified |

## Tester steps for the native handoff, return and editing rows

These steps complete the rows above for **Native SMS/email/phone/WhatsApp composer and return outcome tray**, **Fine-tuned draft persists across reload**, **Native SMS handoff records an attempt and the return tray ties the outcome to it**, **Draft revision conflict keeps local wording** and **One-save visit with plan**. Run them on a physical iPhone with Safari and a physical Android phone with Chrome against the private test site, signed in as an isolated synthetic account that has one contact with a real phone number and email address you control. Automated Chromium emulation of these flows exists and is not a substitute: only a device can open the composer, return, and show what the phone did. Record the device model, OS and browser version in Notes, and the result per row; leave NOT RUN where a step could not be performed.

1. **Prepare.** On the phone, open Today. The first pending follow-up for the synthetic contact shows its prepared message. If the plan offers more than one version (Slice 3), a compact Text / Email / Call choice appears above the message; note which is pressed.
2. **Edit and reload (draft rows).** Change one word in the message. Wait for “Saved”. Reload the page. Expected: the edited wording is back, rendered with the contact's current name; the plan's original text is not shown. Then rename the contact from Contacts and return to Today: the edited sentence keeps your word and shows the new name. Result goes on the “Fine-tuned draft persists” row.
3. **Native text (SMS row).** Tap “Open text”. Expected: the phone's Messages composer opens with the contact's number as the recipient and the exact wording from the card as the body, including your edit. Send it or cancel, then return to the browser. Expected: within a second the return tray asks how it went for that contact; tap “Sent” (or “Not sent”). Expected: the card completes with an Undo moment, and the contact's timeline shows the outcome. On the recorded row, Contacts → the person → timeline: the outcome entry links the exact text that was opened, not a later version. Result goes on the SMS composer row and the “records an attempt” row.
4. **Native email (email row).** On a follow-up whose plan or chosen version is email, check the Subject field, then tap “Open email”. Expected: the mail app opens with the recipient, subject and body from the card; the body contains no private notes even if the contact has some. Return; the tray appears; record the outcome. Result goes on the email composer row.
5. **Native call (call row).** On a call follow-up, read the call notes (private notes appear here only), then tap “Call”. Expected: the dialer opens with the number. End or cancel the call, return; the tray offers Connected / Left voicemail / No answer / Did not call; record one. Result goes on the phone call row.
6. **WhatsApp (WhatsApp rows).** With WhatsApp installed and the contact's saved preference set to WhatsApp, the text version opens WhatsApp with the message prefilled; without the preference the same follow-up opens Messages. With WhatsApp not installed, note what the phone does with the link. Result goes on the WhatsApp rows.
7. **Return recovery.** Open a text, then switch to another app for a minute and come back: the tray must still be waiting for that follow-up. Open two different contacts' texts before recording either: the tray resolves each on its own, in turn. Force-quit the browser after opening a text, reopen it within a few minutes: the tray returns for the same follow-up. If the phone lost the stored handoff, the outcome still records with a note that the opened message could not be attached. Record observations on the SMS composer row's Notes.
8. **Conflict (conflict rows).** Edit the same follow-up on the phone and on a desktop browser signed into the same account. Save on the desktop first, then type on the phone. Expected: the phone keeps its wording on screen and shows one inline choice between it and the desktop's version; nothing is replaced until you choose. Result goes on the conflict rows.
9. **Version switching (Slice 3, when the plan offers versions).** Tap Email, then Call, then Text: each shows its own wording and its own edits; the private notes appear only under Call; the handoff button changes to match; choosing never sends anything and never adds a second follow-up. Reload after choosing Email: Email is still chosen. Record the observation on the composer rows' Notes until this scenario gets its own row.
10. **One-save visit (visit rows).** From Calendar, schedule a meeting with a plan and a new person in one save; on Today the anchored reminder appears; hold the visit's follow-ups from the agenda and mark it a no-show; the reminder leaves Today and returns when the outcome is cleared. Result goes on the visit rows.

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
