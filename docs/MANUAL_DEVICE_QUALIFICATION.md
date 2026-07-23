# Manual device qualification

Automated browser tests are necessary but do not certify native handoffs, physical-device layouts, assistive technology, or high zoom. Every row below starts as **NOT RUN**. A tester must replace that status only after performing the scenario on the named device/browser.

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
