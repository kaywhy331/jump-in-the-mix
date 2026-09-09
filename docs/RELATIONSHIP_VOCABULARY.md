# Relationship vocabulary

The brand idea is **Good relationships have a rhythm.** Use **Jump in the mix** as a welcome, and keep actions short and literal.

| Term | Meaning and placement |
| --- | --- |
| Mix | A follow-up campaign. Used in navigation, the library, contact enrollment, settings, and help. |
| Beat | One message or reminder within a mix. Used in the builder, sample, and sequence previews. |
| Tempo | When beats happen. Keep concrete units such as days after start or a specific time beside the label. |
| Remix | Make an editable copy of a ready-made mix. Original templates and other people's copies stay unchanged. |
| Cue | What starts a mix: a saved date, a manual start, or one fixed date. |
| Up next | Upcoming follow-ups within Today. |
| Loop | Repeat a saved date monthly or yearly. A finite mix does not automatically repeat. |
| Fine-tune | Edit a message before opening the sending app. |
| Reconnect | Pick up a relationship after time apart. |
| Your circle | Descriptive copy for the people you know. The navigation label remains Contacts. |

Keep **Contacts**, **Today**, **Inbox**, and **Reports** recognizable wherever those surfaces exist. Text, Email, Call, Save, Pause, Stop, and Archive remain plain actions. Follow-up is still useful for a scheduled item in Today, including one-time reminders outside a mix. Setup steps are not beats.

First-use copy explains Mix, Beat, and Tempo on the Mixes page, in the builder, on the homepage workflow, and in Help. Routes, database identifiers, exports, customer names, and scheduling semantics retain their existing contracts.

## Relationship starting points

The First Note (introductions), The Afterparty (events), Stay in the Mix (ongoing contact), Back in Rhythm (reconnecting), The Hand-Off (introductions and follow-through), Something Worth Sharing (useful resources), and The Next Verse (milestones) are curated editable mixes. They use one person's voice, compact texts, and short bullet reminders for calls. Something Worth Sharing explicitly asks the sender to add their resource before sending.

All seven are finite, manually started sequences. They join the existing library through its normal publishing and seed mechanism. Publishing these originals does not enroll contacts or modify customer-created mixes. The homepage retains its Lead, Quote, and Completion samples and obvious fake contact details.

## Verification and test release · September 7, 2026

Published to `https://jump-in-the-mix-test.netlify.app` as deploy `6a9f0dfcb3782acb394d9717`. All seven relationship library originals were added through the targeted publisher (seven created, zero existing records updated).

- Production Netlify build and TypeScript check passed. All 386 tests across 82 files passed using an isolated database provisioned with the actual migrations.
- App browser checks covered inline mix creation, template copying, beat editing and addition, tempo changes, activation review, and contact enrollment on desktop and mobile. Editing preserves the Relationships category even when it is absent from an account’s configured choices.
- App layout checks passed at 320, 390, 768, and 1440 pixels. The five mobile navigation controls have evenly spaced centers. Mixes, the builder, and the relationship library passed WCAG A/AA automated checks at 390 and 1440 pixels.
- Public preview checks covered all 13 demo beats and native-app URL encoding, clipboard fallback, keyboard controls, signup links, privacy-respecting conversion events, light/dark accessibility, and responsive layout. The 390px sample remains 777px tall, with signup ending at 448px from the top; no horizontal overflow was found in the measured 320–1440px range.
- Eleven deployed CSS/JavaScript assets matched the build by hash. Initial preview qualification encountered two Netlify edge invocation failures; the two affected tests passed on repetition, and twelve additional homepage/registration requests returned 200. Netlify’s historical edge log query returned no entries for these failures. The initial failures and clean rechecks are retained in the release artifacts.

The temporary database was removed afterward, and the original local database and repository’s Netlify site link were preserved. Use migrations for future integration qualification: `db:push` omits SQL-only constraints required by the suite. No schema migration was needed for this release. Browser screenshots, video, and tracing stayed off.

Local release receipts and logs are under `.artifacts/relationship-vocabulary-2026-09-07/` (private environment files are not committed).

Post-publish verification: all eleven live assets matched the build; five live browser checks passed (one deliberate viewport-project skip), covering the headline/metadata, signup placement, and all thirteen native-app demo handoffs. The live deployment pointer was confirmed at 19:25 UTC.
