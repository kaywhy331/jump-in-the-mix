# Homepage contact demo

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
