# Mobile clarity follow-up — September 18, 2026

This release responds to the owner's corrected nine-item review. The preceding response list was explicitly withdrawn and is not the scope of this follow-up. The owner's observations are qualitative feedback, not a recorded participant study or physical-device qualification session.

## Implemented behavior

- The public demo shows one short fictional message at a time. Editing, previewing and choosing a next step are separate screens. Personal, client and networking alternatives sit under “Change example”; each profession page shows one concise relevant example. Practice never sends or schedules anything, and edits survive switching examples and going back.
- Today shows compact, separated cards with aligned Review and More buttons. Review opens the saved message; the next action opens the user's messaging app; the return tray asks what happened. Opening the app does not mark the follow-up sent. Search, filters, weekly totals and secondary actions are available on request.
- Quick Add separates capture from checking the interpretation, retains text when going back, and moves keyboard focus to the current step. Voice capture remains available. Ready-made plans use three steps: name, people, review. Saving a draft schedules nothing; starting still requires the existing confirmation.
- Mixes has a clear path to ready-made plans. The plan library includes a visible profession selector and a single brief example. Its link filters by supported business type and includes adaptable plans.
- Private feedback uses shorter instructions and a clear completion state. The optional public-review route remains available at every rating; recommendations and corrections are expandable secondary paths.
- The optional home-screen prompt uses a distinct surface, stronger border and readable dark-mode controls. iPhone instructions are three explicit steps. The prompt is offered on a later visit after the first completed follow-up.
- Removed the mobile CSS that added an extra checkmark to action buttons. Compact header navigation, consistent touch targets and clearer card boundaries reduce wrapping and clutter.

No database migration, dependency change, invitation-policy change or delivery-backend change is included.

## Verification

Production build and TypeScript check passed. Thirty-nine focused unit tests passed for draft handling, handoff attempts, capture boundaries, demo utilities and PWA boundaries. The production-build browser suite passed 35 cases; five duplicate viewport cases were intentionally skipped because those tests already contain an explicit viewport matrix. Coverage includes 320–1920px layout, light/dark themes, all demo stages, saved edits, real database outcomes for intercepted handoffs, Quick Add focus/retention, profession-plan navigation, draft-only plan setup, sign-in and analytics privacy.

Local workflow tests use a disposable loopback database with synthetic people and messages. Native messaging links are intercepted; the tests verify handoff state and explicit outcomes without sending messages. Automated accessibility checks cover the demo states, public pages and install prompt; these checks do not establish physical-device or assistive-technology acceptance.

## Owner observations and remaining qualification

1. **Homepage clarity:** too many Mixes and beats. Replaced with one short guided example; owner/participant retest remains open (HOME-02).
2. **Demo actions:** clutter obscured the next action. One primary action per stage, honest completion copy; comprehension retest remains open (DEMO-03).
3. **Profession examples:** hard to find inside the app and too long. Added the library selector and brief examples; profession-specific participant sessions remain open (PRO-05).
4. **Capture:** understandable but cluttered. Separated capture and review; physical voice/contact permission, cancellation and retained-text checks remain open (NAV-05).
5. **Today and sending:** difficult to follow on phones; too many controls, duplicate checks and poor alignment. Added guided review/handoff/outcome and compact cards. Real iPhone/Android messaging-app return and cancellation checks remain open (SEND-05).
6. **Recipient review:** next steps were too complex. Shortened feedback and completion screens; recipient comprehension remains open (REVIEW-05).
7. **Reminders/install:** reminder behavior appeared correct; the install prompt blended into dark mode. Contrast/instructions corrected. Receipt timing, quiet hours and opt-out evidence remain open (NOTIFY-05).
8. **Recovery:** owner observed password recovery working. EMAIL-05 concerns the staff email-delivery screen: compare its delivered/failed status with a controlled inbox and recover an eligible failed email through that screen. This staff session remains open.
9. **Accessibility:** owner reported no current concern. Recorded keyboard, screen-reader, zoom/reflow and physical-device interruption sessions remain open (RECOVER-05).

The audit remains 175/184 checked off, with nine manual gates. See [remaining qualification](ui-ux-audit-2026-09-18/REMAINING_QUALIFICATION.md) for evidence requirements. The existing staging Neon quota outage is separate from the production database.

## Release evidence

Pending publication and hosted verification. Evidence artifacts are under `.artifacts/mobile-clarity-20260918/`; private environment files are not documentation or release assets.

The private-feedback browser matrix also passed on desktop and mobile at all five ratings (two cases).
