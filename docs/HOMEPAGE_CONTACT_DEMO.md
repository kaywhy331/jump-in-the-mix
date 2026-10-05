# Homepage contact demo

## Future option: verified demo replies (deferred)

Kevin confirmed on October 3, 2026: "okay let's do that and add the auto reply demo as an option in the future." Continue the native-handler correction with the existing fictional sample contacts. As a future optional demo, consider a verified JITM-owned inbox and phone/SMS number providing one clearly labeled demo reply or greeting. Keep demo replies separate from marketing opt-in; a demo action or inbound message must not enroll anyone. Require actual destination ownership/receipt verification and approval for any service before activation. No working demo destination or autoresponder is currently established by this record; do not build, provision or enable one now, or repurpose the support address. This is a backlog item, not an activated capability or a deliverability claim.

## Current instructions: direct native handoff (October 4, 2026)

Owner direction: "The 'Preview SMS', 'Preview email', 'Preview call' is supposed to open the messaging app, or email app, or initiate the phone ready to press dial. It is not supposed to change the UI with more buttons. It is supposed to flow as if it was the app itself."

- The Beat action is the native link itself, labelled as in the app: **Open text**, **Open email**, **Call**. There is no in-page preview card, "Open in your app" button, Copy draft or manual-copy field.
- About 900 ms after the tap, the Beat shows the same outcome question as the app's return tray: Sent / Not sent for text and email; Connected / Left voicemail / No answer / Did not call for a call. "Not sent" and "Did not call" return to the draft; the others record the Beat as done in the demo.
- Unchanged from October 3: links carry the demo marker, recipients are fictional, a click proves only that a handoff was requested, state is memory-only, and tests intercept native links.

## Superseded: three-Beat native sample (October 3, 2026)

Owner decision D31: "They are actually supposed to trigger the text message, email, and phone functions when clicking the button." Implementation: `src/components/ProductDemo.tsx`, `src/lib/product-demo.ts`, `src/lib/demo-workspace.ts`; tests: `e2e/product-demo.spec.ts`, `tests/product-demo.test.ts`.

- Each situation has one fictional contact and exactly three Beats: text today, email tomorrow, call in one week. The only destinations are `(202) 555-0142` and a per-situation `example.invalid` email.
- In a preview, ordinary `sms:`, `mailto:` and `tel:` anchors, only when the visitor activates them, ask the visitor's device to open its own apps; the device may have no handler. The text and email carry the edited message and the `[DEMO — preview]` marker, and the email subject starts with `[DEMO]`. The call link carries the number only; call notes stay on the page.
- A click means a handoff was requested. Focus, visibility or a click never prove that anything opened, sent or was delivered, and never mark a Beat done. If no app handles the link, or an app ignores the body, the page says so honestly and offers copy.
- Copy and the manual-select field keep the same marker (and email subject marker). If the clipboard is denied, the manual field takes focus.
- Mark sent or called, Not yet and Undo are simulated demo records; Undo cannot recall an actual message or call.
- State is memory-only in the mounted tab: drafts, subjects, Beat and progress are kept per situation; a refresh clears them; Reset clears only the selected situation. No cookies, storage, URL drafts or account APIs.
- Tests intercept native link defaults and never send or call.

The descriptions and dated release evidence below are historical releases. Where they conflict with the current instructions above, the current instructions win; they are not proof that this candidate is released.


The public homepage contains a self-contained contact demo. Visitors first see a fictional contact, the plan choices, and a ready-to-try message or call reminders. Message editing is an optional disclosure; the step selector, Previous/Next controls, and full sequence are inside “Explore the full …-step plan.” Selecting a step from the full plan returns focus to its draft. A signup invitation follows the sample, and the hero links directly to it.

By default, all 13 follow-ups use the voice of **Jamie**, one self-employed service professional speaking directly to Alex. Texts introduce Jamie by name; emails use a first-name sign-off. Calls show four short reminder bullets for that same individual, with editing available in a disclosure below the list. Keep the language personal and singular (I, me, my), with no company or team persona.

| Plan | Sample sequence |
| --- | --- |
| Lead / inquiry | Immediate text: confirmation and expectations; day 2 text: discovery |
| Quote / follow-up | Immediate email: quote; immediate text: quote reminder; day 2 text: objections; day 3 text: scheduling; scheduled-date phone call: inspection |
| Completion / retention | Immediate completion call; day 1 invoice email; day 3 check-in, thanks, and review text; day 30 helpful text; 3-month maintenance email; annual/seasonal retention and referral email |

All steps are available immediately for demonstration. Choosing a timing does not schedule anything. Draft edits are temporary and reset when changing steps or plans. The sample invoice has no payment due, and no attachments are generated.

The default recipient is **Alex Example**, **1 (555) 555-5555**, **alex@example.invalid**, with **Jamie** as the sender. “Edit contact” allows a visitor to enter a name, phone, email, reference notes, and their own name. All five fields are prefilled, and each blank or whitespace-only field falls back independently to its default. The values live only in React state and reset on refresh; no contact records, browser storage, or form submissions are created.

Prepared messages, email subjects, and call reminders use the contact’s first name and the visitor’s sender name as they type. Manually edited wording stays intact; “Use prepared message/reminders” restores the current personalized template. Phone and email actions use the edited recipient, with malformed destinations disabled and recipient/subject/body values encoded separately. Notes stay out of messages and copy payloads and can be expanded beside call reminders. “Use sample contact” restores all five fields.

The hero’s “Try the demo” link focuses the “Try a demo mix” window and applies a three-second glow. Repeated clicks extend the highlight without remounting or clearing the editor. Reduced-motion preferences suppress the fade; the glow itself remains visible. The former “Interactive sample” badge is removed.

Actions use `sms:`, `mailto:`, and `tel:` links directly from a visitor's click. Message drafts and email subjects include a demo marker. The demo makes no sending API calls, records no completed actions, and writes no contact, plan, or follow-up records. The device handles native app selection and any subsequent send/call confirmation. Call notes remain on the webpage.

SMS body handling differs between apps; the implementation uses the Apple mobile separator on iPhone/iPad and the [RFC 5724](https://www.rfc-editor.org/rfc/rfc5724.html) syntax elsewhere. Copy is available when a handler ignores the body or an app is unavailable. Clipboard denial selects the draft for manual copying.

`e2e/product-demo.spec.ts` covers all 13 channel/timing pairs, default and edited recipients, blank-field fallbacks, draft encoding, copy success and denial, keyboard navigation, focus restoration, step boundaries, and 320/390/768/1024/1440px layouts in light/dark mode. Protocol clicks are intercepted in automation so tests cannot place calls or send messages. iPhone/iPad user-agent checks verify generated links, not physical OS app launches. Physical Safari/Android handoffs remain a manual device check.

Implementation: `src/components/ProductDemo.tsx`, `src/lib/product-demo.ts`, and the demo rules in `src/styles/product.css` and `src/styles/homepage.css`. Release evidence is stored privately under `.artifacts/contact-demo-2026-09-07/`.

Release verification, September 7, 2026: published to the dedicated test site as deploy `6a9ec6c4ea9d197dee364ed6`. The Netlify production build and TypeScript checks passed. The demo suite passed locally, on the preview, and on the published site: 8 tests passed and 2 duplicate matrix tests were skipped per run, including 30 responsive/accessibility states per run. All 11 rendered JavaScript/CSS assets matched the build. The 13 existing contacts, 5 plans, and plan fingerprint were preserved. The temporary local test database was removed, and the original Netlify site link was restored.

The app and database health checks returned 200. The separate worker health endpoint returned 503 on both the new and previous deployment: its newest heartbeat was at 12:24 UTC, before the 14:21 UTC publication. This existing stale-heartbeat condition remains unresolved; this UI release does not change worker scheduling or health thresholds. Physical native-app launches were not tested.

Solo voice revision, September 7, 2026: published as deploy `6a9ecdb9ddee45b89f7d82e1`. All 13 drafts now come from Jamie, with personal language and first-name sign-offs. The production build passed; preview coverage passed all 8 applicable cases, including the responsive matrix. The handoff assertion was corrected to allow browsers to percent-encode apostrophes in contractions, and both affected cases passed on rerun. All 13 steps then passed on the live site in desktop/mobile browser tests, and all 11 served JavaScript/CSS assets matched the build. No worker or delivery behavior changed.

Call reminder revision, September 7, 2026: published as deploy `6a9ed1fdc82dd5e81e1cecaf`. Both calls now display four short reminder bullets; the editor is collapsed by default and opens automatically if clipboard access fails. The visible number is `1 (555) 555-5555`, with matching `+15555555555` text and phone links. The production build passed, all 8 applicable preview cases passed (including the 30 responsive/accessibility states), and 4 live desktop/mobile cases verified every campaign handoff plus editing/copy behavior. All 11 served JavaScript/CSS assets matched the build, and the original Netlify site link was preserved. Evidence: `.artifacts/call-reminders-2026-09-07/`.

Editable contact revision, September 7, 2026: published to the dedicated test site as `6a9f42adb73f33518b521bf7`. Visitors can edit all five contact/sender fields, preview personalized drafts immediately, expand reference notes beside calls, and restore the sample. The hero label is “Try the demo,” the window title is “Try a demo mix,” and a repeatable three-second glow highlights the window without clearing edits. The Interactive sample badge is removed.

Type checking, the production build, and 11 unit checks passed. The final preview passed 19 browser checks with five duplicate matrix cases skipped, including the expanded editor in both themes, personal/default recipients, blank fallbacks, manual-draft preservation, native-link encoding, copy behavior, note/analytics privacy, and repeatable glow. The Notes field uses a distinct label and description following an initial browser-check finding. All 12 rendered CSS/JavaScript assets matched the build. Receipts: `.artifacts/personalized-demo-2026-09-07/`.

After publication, five live checks passed (one duplicate matrix skipped), verifying homepage geometry plus editing, fallbacks, personalized actions, and repeatable glow on desktop/mobile. All 12 live CSS/JavaScript assets matched the verified build, and the original local Netlify site link was restored.
