# Manual device qualification

Automated browser tests are necessary but do not certify native handoffs, physical-device layouts, assistive technology, or high zoom. Every row below starts as **NOT RUN**. A tester must replace that status only after performing the scenario on the named device/browser.

## Current RC.2 qualification gate

Release: `v0.1.0-rc.2` (`e08e1d35a197f9c13d12e44f492c30637457c098`)

The device inventory in the pilot request was left as an unfilled placeholder. No physical iPhone or Android device was available to this workstation, and no device model, OS version, or browser version was supplied. The required physical-device gate is therefore **BLOCKED**, not passed. The screen-reader and other manual accessibility checks are **NOT RUN**.

Create one copy of the record below for each actual device before changing any matrix result:

| Field | Value |
| --- | --- |
| Device model | — |
| OS version | — |
| Browser and version | — |
| Screen size | — |
| Test date | — |
| Tester | — |
| Release tag | `v0.1.0-rc.2` |
| Overall result | NOT RUN |
| Notes | — |
| Sanitized screenshot/video reference | — |
| Highest defect severity | Unclassified |

## Minimum physical iPhone Safari sequence

- [ ] Complete initial owner setup on a clean profile where practical and sign in.
- [ ] Open Today and Contacts; type into live Contact search and open a Contact.
- [ ] Add and edit an Important Date.
- [ ] Launch native SMS; return; verify the outcome tray; mark Done; Undo.
- [ ] Launch native email and a phone call.
- [ ] Reorder Contact cards by touch and verify persistence.
- [ ] Verify Expand and Minimize controls.
- [ ] Verify the mobile keyboard does not cover required actions.
- [ ] Verify safe-area spacing and portrait layout.
- [ ] Verify landscape layout where practical.
- [ ] Close and reopen Safari and verify persisted data.

## Minimum physical Android Chrome sequence

- [ ] Complete owner setup or sign in.
- [ ] Open Today and Contacts; test live Contact search.
- [ ] Test Contact Picker when supported by the device and browser.
- [ ] Add and edit an Important Date.
- [ ] Launch native SMS; return; verify the outcome tray; mark Done; Undo.
- [ ] Launch native email, a phone call, and WhatsApp when installed.
- [ ] Reorder Contact cards by touch and verify persistence.
- [ ] Verify mobile-keyboard behavior and portrait layout.
- [ ] Verify landscape layout where practical.
- [ ] Close and reopen Chrome and verify persisted data.

## Minimum accessibility sequence

- [ ] Navigate every primary destination with the keyboard only.
- [ ] Verify visible focus, logical order, modal focus, and Escape/Cancel.
- [ ] Verify live-search result and Expand/Minimize announcements.
- [ ] Verify keyboard card reordering and field-associated errors.
- [ ] Verify 200% and 400% zoom without critical horizontal overflow.
- [ ] Verify reduced-motion and forced-colors/high-contrast behavior.
- [ ] Complete one basic VoiceOver or TalkBack pass covering navigation, Today Jump card, Contact search, Contact headings, Important Date controls, outcome tray, and form errors.

This is a basic qualification, not a claim of full WCAG or screen-reader certification.

For failures, save a sanitized screenshot or trace outside public issues, remove Contact information, and classify the result as blocking or nonblocking. Record the exact OS and browser version in Notes.

| Scenario | Device / browser | Date | Tester | Result | Notes | Screenshot / trace reference | Classification |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Core Today, Contacts, Mixes, Templates navigation | Physical iPhone / Safari | — | — | NOT RUN | Record model, iOS, Safari | — | Unclassified |
| Core Today, Contacts, Mixes, Templates navigation | Physical Android / Chrome | — | — | NOT RUN | Record model, Android, Chrome | — | Unclassified |
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
| Touch Contact-card drag ordering and persistence | Physical iPhone / Safari | — | — | NOT RUN | Test expanded and collapsed cards | — | Unclassified |
| Touch Contact-card drag ordering and persistence | Physical Android / Chrome | — | — | NOT RUN | Test expanded and collapsed cards | — | Unclassified |
| Mobile keyboard overlap in Quick Add and forms | Physical iPhone / Safari | — | — | NOT RUN | Test longest form and outcome tray | — | Unclassified |
| Mobile keyboard overlap in Quick Add and forms | Physical Android / Chrome | — | — | NOT RUN | Test longest form and outcome tray | — | Unclassified |
| Safe-area spacing in portrait and landscape | Physical iPhone / Safari | — | — | NOT RUN | Include notched device | — | Unclassified |
| Safe-area spacing in portrait and landscape | Physical Android / Chrome | — | — | NOT RUN | Include gesture navigation | — | Unclassified |
| VoiceOver primary workflows | Physical iPhone / Safari | — | — | NOT RUN | Include rotor, dialogs, outcomes, reordering | — | Unclassified |
| TalkBack primary workflows | Physical Android / Chrome | — | — | NOT RUN | Include dialogs, outcomes, reordering | — | Unclassified |
| Keyboard-only primary workflows | Desktop Chrome | — | — | NOT RUN | Verify focus, dialogs, Escape, reordering | — | Unclassified |
| Keyboard-only primary workflows | Desktop Firefox | — | — | NOT RUN | Verify focus, dialogs, Escape, reordering | — | Unclassified |
| Browser zoom at 200% | Desktop Chrome and Firefox | — | — | NOT RUN | Check horizontal scroll and sticky controls | — | Unclassified |
| Browser zoom at 400% | Desktop Chrome and Firefox | — | — | NOT RUN | Check reflow, dialogs, forms, navigation | — | Unclassified |

## Result definitions

- **PASS:** scenario completed without loss of data, context, or access.
- **FAIL:** expected behavior did not complete or the interface became unusable.
- **BLOCKED:** test could not run because required hardware, software, or setup was unavailable.
- **NOT RUN:** no manual qualification has been performed.

Blocking means the result prevents a core pilot task, risks data/security, or makes the intended device inaccessible. Nonblocking observations may be scheduled after pilot entry, but must remain recorded.

Use P0 for security, data loss, corruption, or an unusable application; P1 when a core pilot task is blocked; P2 for material friction with a practical workaround; and P3 for cosmetic, wording, or minor spacing issues. Any unresolved P0 or P1 blocks the pilot. Every P2 must be fixed or explicitly accepted with its workaround.
