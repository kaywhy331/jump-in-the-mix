# Conversation shapes

The supplied logo's speech outline carries into selected website and app surfaces through `src/styles/conversation.css`.

- `speech-bubble` frames a message with a two-pixel outline, uneven corner radii, a short decorative tail, and a small solid shadow. The tail's left edge drops almost vertically, with a longer diagonal on the right. The soft variant uses the brand tint.
- `conversation-panel` pairs with `speech-bubble` on the homepage's interactive demo and illustrative daily list. Both complete windows have the shared speech tail, a larger outline, and an offset shadow.
- `conversation-note` gives call reminders a matching outline without a speech tail.
- The compose variant keeps textareas editable and resizable. Keyboard focus outlines the containing bubble, and all tails ignore pointer events.

The treatment appears in homepage example messages and the closing invitation, registration guidance, onboarding guidance, template messages, daily message editors, and empty-state descriptions. Navigation, data rows, and ordinary form fields retain their existing layout.

The palette follows light, dark, and forced-color preferences. Tails have reserved space below their content and do not add motion or scripts. Browser validation uses geometry, interaction, and accessibility checks without screenshots, video, or traces.

September 7, 2026 verification and deployment receipts are in `.artifacts/conversation-style-2026-09-07/`.

Test-site release: `6a9f305f512a42ddd3ae0d98`, published to https://jump-in-the-mix-test.netlify.app. Type checking and the Netlify production build passed. The app passed 24 layout/theme checks with message editing, focus, overflow, and accessibility validation. Existing draft-preservation checks passed on desktop and mobile against an isolated local database, which was removed afterward.

The deployed preview passed seven public interaction/layout/accessibility tests (three duplicate matrix runs skipped), including all 13 demo actions and clipboard success/denial. It also passed 24 public/auth branding layout checks. All 12 rendered CSS/JavaScript assets matched the build.

After publication, the live test site passed the homepage geometry check and all 13 demo actions on desktop and mobile (three tests passed, one duplicate matrix run skipped). Its 12 rendered CSS/JavaScript assets matched the verified build.

Tail refinement: release `6a9f33f69bec4ef29efa1b82` makes the left edge nearly vertical and the right edge more diagonal through the shared tail transform. Tail height and layout spacing remain unchanged. The production build and two existing homepage checks passed across mobile/desktop widths and both themes; all 12 live CSS/JavaScript assets matched the verified build. Receipts are in `.artifacts/bubble-tail-2026-09-07/`.

Preview windows: release `6a9f37abb80aa91b3ef1cff7` adds the shared tail to the complete “Try a sample mix” and “Your daily list / Today” windows. Their original responsive padding is preserved, with space below for the tails. The production build and both homepage layout/accessibility checks passed. Browser inspection confirmed both tails, matching fills, preserved padding, and no horizontal overflow at 320, 390, 768, and 1440px in light and dark themes. Receipts are in `.artifacts/chat-preview-panels-2026-09-07/`.
