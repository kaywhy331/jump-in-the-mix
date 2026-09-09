# Voice-assisted capture and Today

This is the selected launch implementation from [the critical Voice PRD review](VOICE_PRD_REVIEW.md). It extends the existing web app without a paid AI API, audio storage, a new queue, or database migration. The free invitation model and System Mix referral limit are unchanged.

## Capture and review

Open **Quick Add**, type or choose **Speak**, then review the recognized details. Names, emails, phone numbers, notes and dates stay editable. Dates are interpreted in the account's configured timezone, and the resolved date/timezone appears in the preview. Continue with Contact opens the existing contact form. Nothing is saved or sent until the user submits that form.

The same dictation control works in contact notes. It preserves existing typed text, adds recognized speech within the field limit, and allows **Stop dictation**. Listening is limited to 45 seconds and stops on form submission, dialog closure, navigation, a hidden page, or a locked/changed browser account. A late recognition callback cannot write to a closed, replaced, read-only or inaccessible field. Multiple dictation controls cannot listen simultaneously. Microphone denial, start failure and unsupported speech recognition retain ordinary typing; the device keyboard may offer its own dictation.

The notice next to the microphone explains that the browser's speech service may process audio. Jump does not record or upload audio to its own backend. This is not a promise that browser recognition is offline: some browsers use a remote recognition engine. Microphone accuracy, service availability and device permission behavior still require physical-device qualification. [SpeechRecognition documentation](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition).

## Temporary drafts

Quick Add no longer places names, phone numbers, email addresses, notes or inferred dates in navigation URLs. Explicit continuation writes one temporary draft to `sessionStorage` under the existing browser account/workspace scope. The URL contains only a random draft ID.

- Each tab/scope holds at most one transferable draft, valid for ten minutes.
- The destination checks the exact scope and ID, validates the draft, and removes it from storage as it loads the form.
- Data then lives in the open form. Refreshing or returning to the consumed URL gives an empty form and a clear message.
- Existing account-boundary cleanup removes other-account drafts and clears private storage after confirmed sign-out/account changes. A storage namespace never grants server authorization.
- Storage failure leaves the original capture visible; it does not fall back to personal details in a URL. No new draft table, transcript history or audio retention is introduced.

As with other form content, same-origin application code can access browser storage while the draft exists. This mechanism reduces URL/history/log exposure; it is not encrypted browser storage or an authorization boundary. Final contact creation still uses the existing authenticated, validated Server Action.

## Today at a glance

The default Today view has a collapsible summary of follow-ups due today, overdue follow-ups and work explicitly marked done today. It uses current workspace queries and the configured timezone. Filtered views omit the general summary rather than labeling filtered totals as the whole day. Incomplete preparation displays a readiness message instead of a reassuring empty count.

Skipped work is excluded from the marked-done total. Today's completed view uses completion time, so it includes a follow-up scheduled earlier but finished today. The summary does not claim that a composer handoff delivered a message or that a recipient replied.

**Listen to summary** appears only when the browser reports a local English synthesis voice. Remote voices are excluded. Listening requires a click and offers **Stop reading**. Closing the summary, navigation, page hiding, account locking, completion or the 60-second playback bound cancels speech. Without a suitable voice or if playback fails, the visible summary remains usable. Browser/device voices are reported through `localService`; no paid synthesis endpoint is configured. [SpeechSynthesisVoice localService](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesisVoice/localService).

## Verification and remaining scope

`tests/voice-drafts.test.ts` covers one-use draft loading, scope separation, expiration, replacement, account cleanup, disabled storage, malformed/oversized input, timezone/daylight-saving interpretation and factual summary wording. Existing quick-capture parsing coverage is retained.

`e2e/voice-capture.spec.ts` uses synthetic local accounts and simulated speech APIs. It exercises recognition correction and text preservation, private transfer and explicit contact saving, stop/error/late-result behavior, bounded listening, account locking, unsupported speech, blocked storage, local-voice selection, playback cancellation, summary scope/counts and phone/desktop accessibility in both themes. Simulated APIs validate application behavior, not physical microphone or voice quality. CI enables it with `VOICE_E2E=1` in the process that keeps administrator MFA enabled; test capture is disabled.

Realtime AI conversation, general inbox reading, automated personal-phone messaging, QR intake expansion and native App Intents remain later product decisions as explained in the review. Physical-device speech checks and the broader launch qualification remain open in the [completion ledger](PRODUCT_COMPLETION.md).

Local September 8 verification: 527 tests across 96 files passed; production build/TypeScript and static checks passed. All six voice browser journeys, both staff onboarding journeys and eight account-privacy journeys passed against the packaged standalone app. The separate legacy-worker HTTPS upgrade case was skipped. Exact phase receipts and remaining launch gates are recorded in the completion ledger.
