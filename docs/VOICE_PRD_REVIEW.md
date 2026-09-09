# Assistant and voice: review and selected implementation

Reviewed September 8, 2026 against [the example PRD](../assets/PRD%20Voice.md) and the current repository. This records the critical product decision and its scoped implementation checklist. The selected software is now implemented locally; behavior and verification limits are in [Voice workflows](VOICE_WORKFLOWS.md). The user requested a critical assessment and added the selected implementation to the product definition of done.

## Recommendation

Start with **voice-assisted capture and follow-up review inside the current web app**. Help someone record what they just discussed, check what needs attention, and review their next message. Preserve the existing contact, mix, Today, and sending flows. Keep typed input fully functional. No new paid AI service, subscription tier, always-listening session, or native app is needed for this first release.

The PRD's strongest idea is adapting follow-up to the relationship. Its largest risk is promising knowledge the application does not have: opening a message composer does not establish that a message was sent, received, replied to, or consented to. A conversational interface must describe recorded facts accurately. It cannot fix missing inbox data.

The $49.99 price and 600-minute allowance are hypotheses. They conflict with the current free, invitation-based launch and should not become release requirements. Even using the PRD's unverified assumptions, $21–$30 in voice usage would leave $19.99–$28.99 before all other costs. Validate willingness to pay and measured usage before choosing a paid tier.

## Fit with the existing application

| PRD concept | Existing foundation | Decision |
| --- | --- | --- |
| Speak a contact or follow-up note | `VoiceNoteButton`, `QuickAdd`, deterministic `quick-add-capture`, contact forms | Improve this real workflow first: clear microphone controls, editable draft, explicit save and reliable fallback. |
| “What needs my attention?” | Today already queries pending, overdue and completed follow-ups in the workspace timezone | Add a concise factual briefing and optional read-aloud. Reuse the existing queries and review actions. |
| Action engine and approval queue | Server Actions, workspace authorization, Today review, scheduled delivery and audit | Reuse these boundaries. Do not build a second system that can bypass them. Future AI may propose typed actions; the server independently validates and authorizes them. |
| Smart Mix behavior | Journey events, contact relationship state, do-not-contact, mix stops, snoozing and delivery checks | Reuse recorded outcomes now. Reliable automatic reply awareness requires a separately qualified incoming-message integration. |
| QR networking | Hosted lead forms, intake connections/receipts, duplicate review and source metadata | A useful later extension of the existing form. Measure whether people use and complete it before building five QR product types or an attribution platform. |
| Inbox intelligence | Intake webhooks are available; there is no general verified personal-inbox reply stream | Defer background inbox analysis. An event received through a configured integration and an inferred interpretation must remain distinct. |
| Realtime voice assistant | Browser dictation exists; there is no paid voice session, model gateway or cost ledger | Defer realtime conversation. First test whether short voice capture and spoken summaries solve the actual need. |
| Native iOS/Android | Installable web app, mobile handoffs and notification foundation | Keep the web app as the first product. Consider native clients when measured demand justifies device integrations and maintenance. |

## Critical changes to the example

**Voice is optional input, not automatic authority.** Dictating a name, date or instruction should produce a reviewable draft. Never silently create a contact, change a calendar appointment, enroll a Mix, send a message, or spend a referral invitation because speech recognition produced those words. Ambiguous names, dates and recipients need explicit selection in the existing UI. Preserve original notes without inventing certainty.

**Do not equate inbox access with an inexpensive integration.** Gmail reading scopes are restricted; accessing that data through a server can require restricted-scope verification and an annual third-party security assessment, subject to Google's exceptions. Avoid requesting inbox scopes for a feature that only needs a user-provided note. [Google restricted-scope requirements](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification).

**Native does not automatically unlock personal messaging automation.** Apple's supported message composer presents content for the person's approval and delegates sending to Messages; it does not establish delivery. Google Play restricts SMS permissions to qualifying default handlers or documented exceptions. Do not make a personal-number messaging bridge a prerequisite for launching Jump. [Apple message composer](https://developer.apple.com/documentation/messageui/mfmessagecomposeviewcontroller), [Google Play SMS policy](https://support.google.com/googleplay/android-developer/answer/16558241).

**Browser dictation needs honest privacy and compatibility copy.** SpeechRecognition has limited browser availability; some implementations send audio to a recognition service. It is not safe to advertise the current implementation as universally offline or on-device. Provide notice before microphone use, explicit start/stop, cancellation on leaving the form, and typing/keyboard dictation as fallback. Jump should neither upload nor retain recordings in this implementation. [SpeechRecognition documentation](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition).

**Keep QR contact collection separate from account access.** A visitor submitting a contact request is not joining Jump. A public QR must never distribute a member's secret registration URL, bypass System Mix, or turn five personal invitations into unlimited signup access. Suggested follow-up and permission evidence belong to the contact-intake flow; account invitations remain recipient-bound and issued only through the authorized flow.

**Do not invent an Outreach Health score.** A number such as 92/100 implies validated predictive accuracy. Show observed facts and specific actions instead: an unknown contact preference, a bounced address, a paused Mix, or a message requiring review. An inbound request is evidence for that request, not blanket permission for promotion. A QR click, composer opening, or prefilled consent sentence is not proof that a message was sent or that consent was given.

**Defer autonomous AI classification and bulk approval.** Contact content and incoming messages are untrusted data. A future model must not derive authorization from instructions inside an email. Distinguish evidence, suggestions, user edits, and committed actions. Require exact recipient/content previews for sending, stale-state checks, audit records, and idempotent server-side execution. Never implement “approve everything” against a changing set of queued messages.

**Do not copy the four overlapping voice quotas or five-second cutoff prematurely.** First measure whether voice is used. A future paid voice service needs atomic budget reservations across devices, provider-cost accounting, bounded sessions and a platform cutoff. An idle timeout alone is not proof that provider billing stopped; reconnection can also add latency and cost. Usage limits should match measured economics and an understandable user allowance.

## Selected work added to DoD

1. **Finish short voice capture in the existing forms.** A visible start/stop control, recognition-error recovery, bounded listening, cancellation when the page/dialog is left, and no late result into a closed or changed target. Preserve typed text. Explain browser speech processing before use. Unsupported browsers retain typing and keyboard dictation. Names, dates and contact information remain editable before saving.
2. **Keep capture details out of navigation URLs.** Quick Add currently puts the original note and extracted personal details in a URL. Replace this transfer with an appropriately scoped temporary draft mechanism, with explicit review and removal after use. Do not introduce durable audio or conversation-history storage.
3. **Add an optional spoken Today briefing.** Build the visible summary from recorded workspace data using the current timezone, with an accurate distinction between due, overdue, completed and reviewed activity. Offer read-aloud only on explicit request with stop controls and a text fallback. Prefer available local speech synthesis; do not add a paid synthesis service. Do not claim to know who replied or what was sent from an external composer.
4. **Verify the selected journeys.** Test typed and dictated capture, incorrect recognition correction, denial/unavailable/start failure, cancellation and page changes, draft isolation/cleanup, timezone boundaries, workspace scoping, keyboard use and mobile/theme layout. Browser API simulation proves application behavior; real microphone quality, device speech availability and handoffs require separate device qualification.

These items constitute the selected voice implementation for the current launch. The software is implemented and the six simulated-speech browser journeys pass locally. Physical-device speech qualification remains open in the [completion ledger](PRODUCT_COMPLETION.md). The rest of the example PRD is a future product direction, not an additional hidden launch requirement.

## Evidence that would justify the next investment

Use early invitation waves to observe whether people complete follow-ups, whether capture saves effort, which recognition errors require corrections, and whether they return to the briefing. Collect voluntary feedback; do not log dictated content or infer conversion from button clicks. Prototype one QR contact-intake flow if networking users request it. Pilot one authorized reply source before claiming adaptive inbox intelligence.

A native client becomes reasonable when the web app has retained users who need specific device functions that the web cannot deliver reliably. App Intents can expose native app actions through system experiences, but a wrapper alone is not a Siri integration. Keep the same backend authorization and audit contracts if native apps are built. [Apple App Intents](https://developer.apple.com/documentation/appintents).

Only evaluate premium realtime speech and a paid plan after there is evidence of sustained demand and measured provider cost. Keep current free accounts and the five-invitation System Mix experience intact while that decision is tested.
