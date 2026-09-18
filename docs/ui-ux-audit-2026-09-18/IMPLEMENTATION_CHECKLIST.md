# UI/UX implementation checklist

**Definition of done:** Every finding has implementation and acceptance evidence, and the verified release is live on jumpinthemix.com. External qualification is not replaced by code review.

Original audit: [184 findings](../UI_UX_PRODUCT_READINESS_AUDIT_2026-09-18.md). Implementation and evidence are tracked separately; original observations remain unchanged.

Status counts: verified-local: 174 · awaiting-qualification: 10.

- 1. Correctness and retained work
- 2. Public acquisition, authentication and first use
- 3. Daily workflow, contacts and Mixes
- 4. Connections, settings, support and recovery
- 5. Admin workflows
- 6. Regression, cross-browser and hosted qualification
- 7. Test-site publish, production deployment and live verification

## HOME

- [ ] **HOME-01 — First useful demo action is below the first phone screen** · verified-local
  Implementation: src/components/ProductDemo.tsx; docs/HOMEPAGE_READINESS_RECONCILIATION_2026-09-18.md.
  Verification: Public/auth browser checks: initial demo focus, mobile navigation and context links; homepage roadmap reconciliation.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: A new visitor reaches a draft with one deliberate tap without hunting through contact fields.
- [ ] **HOME-02 — Two acquisition tasks compete for attention** · awaiting-qualification
  Implementation: src/app/page.tsx; docs/HOMEPAGE_READINESS_RECONCILIATION_2026-09-18.md.
  Verification: Public/auth browser checks: initial demo focus, mobile navigation and context links; homepage roadmap reconciliation.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: In a moderated task, visitors can explain what each action does before choosing it.
- [ ] **HOME-03 — Useful navigation disappears on phones** · verified-local
  Implementation: src/components/PublicHeader.tsx; docs/HOMEPAGE_READINESS_RECONCILIATION_2026-09-18.md.
  Verification: Public/auth browser checks: initial demo focus, mobile navigation and context links; homepage roadmap reconciliation.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: Templates and Questions remain reachable near the top at 320 and 390 pixels.
- [ ] **HOME-04 — Free access is explained late** · verified-local
  Implementation: src/app/page.tsx; docs/HOMEPAGE_READINESS_RECONCILIATION_2026-09-18.md.
  Verification: Public/auth browser checks: initial demo focus, mobile navigation and context links; homepage roadmap reconciliation.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: Users understand that a request joins a queue rather than opens an account immediately.
- [ ] **HOME-05 — The roadmap is not current launch evidence** · verified-local
  Implementation: docs/HOMEPAGE_READINESS_RECONCILIATION_2026-09-18.md.
  Verification: Public/auth browser checks: initial demo focus, mobile navigation and context links; homepage roadmap reconciliation.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: Every completed roadmap item links to current evidence; research results are separated from planning hypotheses.

## PRO

- [ ] **PRO-01 — Primary waitlist links drop profession context** · verified-local
  Implementation: src/components/WaitlistLink.tsx.
  Verification: Public/auth browser checks and marketing scenario tests; profession-route scan.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: Each page’s top, demo and bottom CTAs preserve the same intended onboarding context.
- [ ] **PRO-02 — Selected Mix is not carried into signup** · verified-local
  Implementation: src/lib/marketing-scenarios.ts; src/lib/vertical-plan-library.ts.
  Verification: Public/auth browser checks and marketing scenario tests; profession-route scan.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: Selecting a nondefault example survives invitation redemption in a fresh browser.
- [ ] **PRO-03 — The phone experience delays the professional example** · verified-local
  Implementation: src/components/ProductDemo.tsx.
  Verification: Public/auth browser checks and marketing scenario tests; profession-route scan.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: A visitor can identify the example’s person, reason and next step in the first short interaction.
- [ ] **PRO-04 — Tool-boundary clarification comes after the demo** · verified-local
  Implementation: src/app/for/[profession]/page.tsx.
  Verification: Public/auth browser checks and marketing scenario tests; profession-route scan.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: A recruiter, consultant, photographer, agent or contractor can correctly describe the supported workflow.
- [ ] **PRO-05 — Profession fit remains an untested hypothesis** · awaiting-qualification
  Implementation: src/app/for/[profession]/page.tsx; src/lib/persona-mixes.ts; src/components/PublicHeader.tsx.
  Verification: Public/auth browser checks and marketing scenario tests; profession-route scan.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: Each profession has task-completion and comprehension evidence before claims of validated fit.

## DEMO

- [ ] **DEMO-01 — Changing examples silently discards edited messages** · verified-local
  Implementation: src/components/ProductDemo.tsx.
  Verification: Public/auth browser checks: edits retained on scenario switch, reset and intercepted sandbox handoffs.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: Message, subject and planned date survive switching away and back.
- [ ] **DEMO-02 — A public practice session offers real communication-app handoffs** · verified-local
  Implementation: src/components/ProductDemo.tsx.
  Verification: Public/auth browser checks: edits retained on scenario switch, reset and intercepted sandbox handoffs.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: Demo completion never opens an external composer under a sandbox promise.
- [ ] **DEMO-03 — Icon-only completion is hard to distinguish from sending** · awaiting-qualification
  Implementation: src/components/ProductDemo.tsx.
  Verification: Public/auth browser checks: edits retained on scenario switch, reset and intercepted sandbox handoffs.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: Participants distinguish opening, sending, recording and skipping without assistance.
- [ ] **DEMO-04 — Attachment language exceeds what the demo prepares** · verified-local
  Implementation: src/lib/persona-mixes.ts.
  Verification: Public/auth browser checks: edits retained on scenario switch, reset and intercepted sandbox handoffs.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: No draft asserts an attachment is present unless the user has supplied it.
- [ ] **DEMO-05 — Planned timing sounds like automatic sending** · verified-local
  Implementation: src/components/ProductDemo.tsx.
  Verification: Public/auth browser checks: edits retained on scenario switch, reset and intercepted sandbox handoffs.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: Visitors correctly explain that selecting a date does not send a message.
- [ ] **DEMO-06 — Reset behavior is fragmented** · verified-local
  Implementation: src/components/ProductDemo.tsx.
  Verification: Public/auth browser checks: edits retained on scenario switch, reset and intercepted sandbox handoffs.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: A visitor can return the entire current example to its initial state in one action.

## PUBLIC

- [ ] **PUBLIC-01 — Public templates and saved Mixes have similar names** · verified-local
  Implementation: src/components/PublicCapabilities.tsx.
  Verification: Public route scan and source review of contents navigation, recovery and capability copy.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: Visitors know whether a CTA copies example text, previews a workflow, or requests account access.
- [ ] **PUBLIC-02 — Long reference pages need stronger navigation** · verified-local
  Implementation: src/components/PublicContents.tsx.
  Verification: Public route scan and source review of contents navigation, recovery and capability copy.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: A user reaches a named topic without scanning the whole document on a phone.
- [ ] **PUBLIC-03 — Recovery help is disconnected from failed actions** · verified-local
  Implementation: src/app/forgot-password/page.tsx; src/app/register/page.tsx.
  Verification: Public route scan and source review of contents navigation, recovery and capability copy.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: A signed-out user can reach working support directly from every account-recovery failure.
- [ ] **PUBLIC-04 — Educational claims lack a visible capability summary** · verified-local
  Implementation: src/components/PublicCapabilities.tsx.
  Verification: Public route scan and source review of contents navigation, recovery and capability copy.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: The template, reminder and FAQ pages describe the same current sending contract.
- [ ] **PUBLIC-05 — Trust content needs an owner-led factual review** · awaiting-qualification
  Implementation: src/components/PublicArticle.tsx; src/app/faq/page.tsx; src/app/contact/page.tsx; src/components/PublicDocument.tsx.
  Verification: Public route scan and source review of contents navigation, recovery and capability copy.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: Record a dated content review and resolve any mismatched product claims before broad release.

## WAIT

- [ ] **WAIT-01 — Joining and confirming are not explained before submission** · verified-local
  Implementation: src/app/waitlist/page.tsx.
  Verification: Waitlist/admission integration tests and source review of retained form errors and generic recovery receipts.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: A first-time visitor knows to look for and act on the confirmation email.
- [ ] **WAIT-02 — Submitted form retains the initial action label** · verified-local
  Implementation: src/components/WaitlistForm.tsx.
  Verification: Waitlist/admission integration tests and source review of retained form errors and generic recovery receipts.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: Repeat submissions clearly distinguish changing an address from requesting another confirmation.
- [ ] **WAIT-03 — Error text is not associated with the email control** · verified-local
  Implementation: src/components/WaitlistForm.tsx.
  Verification: Waitlist/admission integration tests and source review of retained form errors and generic recovery receipts.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: A screen-reader user hears the specific error when returning to the email field.
- [ ] **WAIT-04 — Unavailable invitations have a broad fallback** · verified-local
  Implementation: src/app/register/page.tsx.
  Verification: Waitlist/admission integration tests and source review of retained form errors and generic recovery receipts.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: A user with a previously used link can recover without mistakenly joining the queue again.
- [ ] **WAIT-05 — Temporary pauses have weak recovery expectations** · verified-local
  Implementation: src/app/register/page.tsx; src/app/waitlist/page.tsx.
  Verification: Waitlist/admission integration tests and source review of retained form errors and generic recovery receipts.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: The user knows the link remains usable and has a useful action during the pause.

## AUTH

- [ ] **AUTH-01 — Password fields have no visibility toggle** · verified-local
  Implementation: src/components/PasswordInput.tsx; src/components/ActionForm.tsx; src/lib/customer-return-path.ts; src/app/api/auth/magic/route.ts.
  Verification: Public/auth browser tests, verify-email redirect tests and seven magic-link return-target tests.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: Users can inspect and correct a long password on mobile and with a keyboard.
- [ ] **AUTH-02 — Authentication submits lack pending feedback** · verified-local
  Implementation: src/components/FormSubmitButton.tsx; src/components/ActionForm.tsx; src/components/PasswordInput.tsx; src/lib/customer-return-path.ts; src/app/api/auth/magic/route.ts.
  Verification: Public/auth browser tests, verify-email redirect tests and seven magic-link return-target tests.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: Slow requests visibly enter a pending state and cannot be accidentally resubmitted.
- [ ] **AUTH-03 — Validation returns page-level errors** · verified-local
  Implementation: src/components/ActionForm.tsx; src/lib/form-errors.ts; src/components/PasswordInput.tsx; src/lib/customer-return-path.ts; src/app/api/auth/magic/route.ts.
  Verification: Public/auth browser tests, verify-email redirect tests and seven magic-link return-target tests.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: A failed signup or reset can be corrected without re-entering unrelated nonsecret information.
- [ ] **AUTH-04 — Recovery copy exposes implementation language** · verified-local
  Implementation: src/app/forgot-password/page.tsx; src/components/ActionForm.tsx; src/components/PasswordInput.tsx; src/lib/customer-return-path.ts; src/app/api/auth/magic/route.ts.
  Verification: Public/auth browser tests, verify-email redirect tests and seven magic-link return-target tests.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: A customer can understand the next step without knowing how the site is hosted.
- [ ] **AUTH-05 — Protected destination is lost after sign-in** · verified-local
  Implementation: src/lib/customer-return-path.ts; src/lib/auth.ts; src/lib/auth-actions.ts; src/components/ActionForm.tsx; src/components/PasswordInput.tsx; src/app/api/auth/magic/route.ts.
  Verification: Public/auth browser tests, verify-email redirect tests and seven magic-link return-target tests.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: Following a contact or support-ticket link while signed out returns to that item after authentication.

## ONB

- [ ] **ONB-01 — Success is announced for a person who cannot be reached** · verified-local
  Implementation: src/app/(app)/jumps/page.tsx; src/components/StarterPreview.tsx; src/lib/date-input.ts.
  Verification: Onboarding/invitation and UI/UX workflow browser tests; timezone/date unit cases.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: A ready-to-send success state has a usable recipient; incomplete records receive an honest next step.
- [ ] **ONB-02 — Default date uses UTC instead of the account timezone** · verified-local
  Implementation: src/lib/date-input.ts; src/components/LocalDateInput.tsx; src/components/StarterPreview.tsx.
  Verification: Onboarding/invitation and UI/UX workflow browser tests; timezone/date unit cases.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: At 01:00 UTC, a Los Angeles user receives the preceding local date; test both sides of midnight.
- [ ] **ONB-03 — The one-person start is a long setup form** · verified-local
  Implementation: src/components/OnboardingForm.tsx; src/components/StarterPreview.tsx; src/lib/date-input.ts.
  Verification: Onboarding/invitation and UI/UX workflow browser tests; timezone/date unit cases.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: A novice completes the first useful follow-up with minimal scrolling and can skip optional setup visibly.
- [ ] **ONB-04 — Business name remains required on the default path** · verified-local
  Implementation: src/components/OnboardingForm.tsx; src/lib/onboarding-actions.ts; src/components/StarterPreview.tsx; src/lib/date-input.ts.
  Verification: Onboarding/invitation and UI/UX workflow browser tests; timezone/date unit cases.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: A business user can prepare a personal follow-up before completing the business profile.
- [ ] **ONB-05 — Starter assignment is not reviewable before creation** · verified-local
  Implementation: src/components/StarterPreview.tsx; src/app/api/onboarding/preview/route.ts; src/lib/date-input.ts.
  Verification: Onboarding/invitation and UI/UX workflow browser tests; timezone/date unit cases.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: Users see the complete first plan and explicitly accept its timing before it is created.
- [ ] **ONB-06 — Referrals interrupt the first-success screen** · verified-local
  Implementation: src/app/(app)/jumps/page.tsx; src/components/StarterPreview.tsx; src/lib/date-input.ts.
  Verification: Onboarding/invitation and UI/UX workflow browser tests; timezone/date unit cases.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: The first screen after setup makes the chosen person’s next action visually primary.
- [ ] **ONB-07 — Import requires cross-tab coordination** · verified-local
  Implementation: src/components/OnboardingForm.tsx; src/components/StarterPreview.tsx; src/lib/date-input.ts.
  Verification: Onboarding/invitation and UI/UX workflow browser tests; timezone/date unit cases.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: A successful import yields a selectable person without guessing which tab or refresh control to use.

## NAV

- [ ] **NAV-01 — Calendar and journey are several steps from daily work** · verified-local
  Implementation: src/components/AppShell.tsx; src/components/Nav.tsx; src/components/QuickAdd.tsx; src/components/NewContactForm.tsx; src/components/VoiceNoteButton.tsx.
  Verification: Browser navigation scan; retained Quick Add capture source and boundary tests.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: Regular users reach their frequent scheduling and relationship tasks predictably from any page.
- [ ] **NAV-02 — Journey highlights a different parent than its entry point** · verified-local
  Implementation: src/components/AppShell.tsx; src/components/Nav.tsx; src/components/QuickAdd.tsx; src/components/NewContactForm.tsx; src/components/VoiceNoteButton.tsx.
  Verification: Browser navigation scan; retained Quick Add capture source and boundary tests.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: Entering journey from More does not unexpectedly change the perceived navigation section.
- [ ] **NAV-03 — Several More labels describe unrelated tasks together** · verified-local
  Implementation: src/components/AppShell.tsx; src/components/Nav.tsx; src/components/QuickAdd.tsx; src/components/NewContactForm.tsx; src/components/VoiceNoteButton.tsx.
  Verification: Browser navigation scan; retained Quick Add capture source and boundary tests.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: Users find timezone, notifications and sign-out without opening multiple menus.
- [ ] **NAV-04 — Quick Add transfer is temporary and lost on reload** · verified-local
  Implementation: src/components/AppShell.tsx; src/components/Nav.tsx; src/components/QuickAdd.tsx; src/components/NewContactForm.tsx; src/components/VoiceNoteButton.tsx.
  Verification: Browser navigation scan; retained Quick Add capture source and boundary tests.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: A routine refresh during review does not erase a captured note unexpectedly.
- [ ] **NAV-05 — Voice and native contact capture need device qualification** · awaiting-qualification
  Implementation: src/components/AppShell.tsx; src/components/Nav.tsx; src/components/QuickAdd.tsx; src/components/NewContactForm.tsx; src/components/VoiceNoteButton.tsx.
  Verification: Browser navigation scan; retained Quick Add capture source and boundary tests.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: Record actual iPhone/Android outcomes, including recovery without losing typed text.

## TODAY

- [ ] **TODAY-01 — Today has no person or message search** · verified-local
  Implementation: src/app/(app)/jumps/page.tsx; src/components/TodayNavigation.tsx; src/components/TodayBriefing.tsx.
  Verification: Today route scan; today-list/unit and handoff state tests; search/layout source review.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: A user can find a named person’s due beat without paging through unrelated follow-ups.
- [ ] **TODAY-02 — Repeated plan and reason text adds noise** · verified-local
  Implementation: src/app/(app)/jumps/page.tsx; src/components/TodayNavigation.tsx; src/components/TodayBriefing.tsx.
  Verification: Today route scan; today-list/unit and handoff state tests; search/layout source review.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: A card’s secondary text adds new information instead of repeating its title.
- [ ] **TODAY-03 — One expanded card consumes most of a phone screen** · verified-local
  Implementation: src/app/(app)/jumps/page.tsx; src/components/TodayNavigation.tsx; src/components/TodayBriefing.tsx.
  Verification: Today route scan; today-list/unit and handoff state tests; search/layout source review.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: Users can review several upcoming people quickly and deliberately expand one draft.
- [ ] **TODAY-04 — Overdue work has weak prioritization controls** · verified-local
  Implementation: src/app/(app)/jumps/page.tsx; src/components/TodayNavigation.tsx; src/components/TodayBriefing.tsx.
  Verification: Today route scan; today-list/unit and handoff state tests; search/layout source review.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: Users with a backlog can identify urgent commitments without opening every contact.
- [ ] **TODAY-05 — Caught-up state favors adding people** · verified-local
  Implementation: src/app/(app)/jumps/page.tsx; src/components/TodayNavigation.tsx; src/components/TodayBriefing.tsx.
  Verification: Today route scan; today-list/unit and handoff state tests; search/layout source review.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: Both an empty account and a caught-up account receive an appropriate next step.

## SEND

- [ ] **SEND-01 — Open, send and complete remain separate mental steps** · verified-local
  Implementation: src/components/EditableFollowUpAction.tsx; src/components/JumpWorkflow.tsx; src/components/JumpActionControls.tsx.
  Verification: Handoff/outcome tests and state/source review; physical devices remain separately open.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: Users do not interpret opening the composer as proof a message was sent.
- [ ] **SEND-02 — Collapsed cards still expose Done and Skip** · verified-local
  Implementation: src/components/EditableFollowUpAction.tsx; src/components/JumpWorkflow.tsx; src/components/JumpActionControls.tsx.
  Verification: Handoff/outcome tests and state/source review; physical devices remain separately open.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: Users can tell which beat and recipient they are completing without opening unrelated menus.
- [ ] **SEND-03 — Delivery mode is not a persistent visual anchor** · verified-local
  Implementation: src/components/EditableFollowUpAction.tsx; src/components/JumpWorkflow.tsx; src/components/JumpActionControls.tsx.
  Verification: Handoff/outcome tests and state/source review; physical devices remain separately open.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: A user can identify what will happen without opening settings.
- [ ] **SEND-04 — The outcome step can add repeated work** · verified-local
  Implementation: src/components/EditableFollowUpAction.tsx; src/components/JumpWorkflow.tsx; src/components/JumpActionControls.tsx.
  Verification: Handoff/outcome tests and state/source review; physical devices remain separately open.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: An interrupted user can find and resolve an unrecorded handoff on returning.
- [ ] **SEND-05 — Real external-app handoffs remain a release gate** · awaiting-qualification
  Implementation: src/components/EditableFollowUpAction.tsx; src/components/JumpWorkflow.tsx; src/components/JumpActionControls.tsx.
  Verification: Handoff/outcome tests and state/source review; physical devices remain separately open.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: Record successful and canceled handoffs on supported iPhone/Android combinations before public readiness signoff.

## LIST

- [ ] **LIST-01 — Select all means only the loaded page** · verified-local
  Implementation: src/app/(app)/contacts/page.tsx; src/components/ContactsBulkWorkspace.tsx; src/components/ContactSavedViewsBar.tsx.
  Verification: Contact lifecycle/follow-up summary tests; route scan and paging/selection source review.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: With more than 50 results, the selected scope and count are unmistakable before a bulk action.
- [ ] **LIST-02 — Out-of-range contact pages are not clamped to the result count** · verified-local
  Implementation: src/app/(app)/contacts/page.tsx; src/components/ContactsBulkWorkspace.tsx; src/components/ContactSavedViewsBar.tsx.
  Verification: Contact lifecycle/follow-up summary tests; route scan and paging/selection source review.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: A stale page URL does not present a misleading empty contact list when matching people exist.
- [ ] **LIST-03 — Sorting cannot reflect the user’s current task** · verified-local
  Implementation: src/app/(app)/contacts/page.tsx; src/components/ContactsBulkWorkspace.tsx; src/components/ContactSavedViewsBar.tsx.
  Verification: Contact lifecycle/follow-up summary tests; route scan and paging/selection source review.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: Users can review the most urgent or recently active relationships without scanning alphabetically.
- [ ] **LIST-04 — Important contact tools are difficult to discover** · verified-local
  Implementation: src/app/(app)/contacts/page.tsx; src/components/ContactsBulkWorkspace.tsx; src/components/ContactSavedViewsBar.tsx.
  Verification: Contact lifecycle/follow-up summary tests; route scan and paging/selection source review.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: A novice finds import and duplicate review without opening unrelated settings.
- [ ] **LIST-05 — Contact rows emphasize methods more than next commitments** · verified-local
  Implementation: src/app/(app)/contacts/page.tsx; src/components/ContactsBulkWorkspace.tsx; src/components/ContactSavedViewsBar.tsx.
  Verification: Contact lifecycle/follow-up summary tests; route scan and paging/selection source review.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: Users can identify contacts needing a next step from the list itself.

## EDIT

- [ ] **EDIT-01 — A recoverable validation error clears the draft** · verified-local
  Implementation: src/lib/contact-actions.ts; src/components/ContactForm.tsx; src/components/FormGuard.tsx; src/lib/form-errors.ts.
  Verification: UI/UX readiness browser tests: invalid phone retains fields, navigation guard, duplicate second-survivor case; method-undo source review.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: An invalid phone can be corrected with every other entered value intact.
- [ ] **EDIT-02 — Leaving an edited contact loses unsaved work without warning** · verified-local
  Implementation: src/components/FormGuard.tsx; src/lib/form-errors.ts.
  Verification: UI/UX readiness browser tests: invalid phone retains fields, navigation guard, duplicate second-survivor case; method-undo source review.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: Accidental navigation does not silently discard contact edits.
- [ ] **EDIT-03 — Required identity is not explained beside the fields** · verified-local
  Implementation: src/components/ContactForm.tsx; src/components/FormGuard.tsx; src/lib/form-errors.ts.
  Verification: UI/UX readiness browser tests: invalid phone retains fields, navigation guard, duplicate second-survivor case; method-undo source review.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: A user understands which combinations of name/company are accepted before submitting.
- [ ] **EDIT-04 — Saving has no visible pending state** · verified-local
  Implementation: src/components/ContactForm.tsx; src/components/FormGuard.tsx; src/lib/form-errors.ts.
  Verification: UI/UX readiness browser tests: invalid phone retains fields, navigation guard, duplicate second-survivor case; method-undo source review.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: A throttled save provides immediate feedback and produces one intended contact change.
- [ ] **EDIT-05 — The privacy meaning of Note changes across forms** · verified-local
  Implementation: src/components/ContactForm.tsx; src/components/FormGuard.tsx; src/lib/form-errors.ts.
  Verification: UI/UX readiness browser tests: invalid phone retains fields, navigation guard, duplicate second-survivor case; method-undo source review.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: Users can distinguish reusable message context from private notes before saving.
- [ ] **EDIT-06 — Removing a populated contact method is immediate** · verified-local
  Implementation: src/components/ContactForm.tsx; src/components/FormGuard.tsx; src/lib/form-errors.ts.
  Verification: UI/UX readiness browser tests: invalid phone retains fields, navigation guard, duplicate second-survivor case; method-undo source review.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: Accidentally removing a populated method can be reversed without retyping it.

## DETAIL

- [ ] **DETAIL-01 — Older history disappears behind an undocumented cap** · verified-local
  Implementation: src/app/(app)/contacts/[contactId]/page.tsx; src/components/ContactTimeline.tsx; src/app/api/contacts/[contactId]/activity/route.ts; src/components/ContactRelationshipStatePanel.tsx.
  Verification: UI/UX workflow browser test: 163 same-time events, filters, correction persistence, stale 409 and foreign-contact 404.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: A contact with more than 150 events can reach its oldest retained history.
- [ ] **DETAIL-02 — Timeline filter state is visual only** · verified-local
  Implementation: src/app/(app)/contacts/[contactId]/page.tsx; src/components/ContactTimeline.tsx; src/app/api/contacts/[contactId]/activity/route.ts; src/components/ContactRelationshipStatePanel.tsx.
  Verification: UI/UX workflow browser test: 163 same-time events, filters, correction persistence, stale 409 and foreign-contact 404.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: Keyboard and screen-reader users can identify the active timeline view.
- [ ] **DETAIL-03 — An empty filtered timeline gives the wrong explanation** · verified-local
  Implementation: src/app/(app)/contacts/[contactId]/page.tsx; src/components/ContactTimeline.tsx; src/app/api/contacts/[contactId]/activity/route.ts; src/components/ContactRelationshipStatePanel.tsx.
  Verification: UI/UX workflow browser test: 163 same-time events, filters, correction persistence, stale 409 and foreign-contact 404.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: Switching to Notes on a communications-only contact explains the filter result accurately.
- [ ] **DETAIL-04 — Saved notes have no correction interface** · verified-local
  Implementation: src/app/(app)/contacts/[contactId]/page.tsx; src/components/ContactTimeline.tsx; src/app/api/contacts/[contactId]/activity/route.ts; src/components/ContactRelationshipStatePanel.tsx.
  Verification: UI/UX workflow browser test: 163 same-time events, filters, correction persistence, stale 409 and foreign-contact 404.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: A typo or accidentally entered private detail can be corrected through a clear user-facing process.
- [ ] **DETAIL-05 — Do not contact needs a clearer impact explanation** · verified-local
  Implementation: src/app/(app)/contacts/[contactId]/page.tsx; src/components/ContactTimeline.tsx; src/app/api/contacts/[contactId]/activity/route.ts; src/components/ContactRelationshipStatePanel.tsx.
  Verification: UI/UX workflow browser test: 163 same-time events, filters, correction persistence, stale 409 and foreign-contact 404.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: Users understand whether existing drafts, reminders and manual contact buttons remain available.

## IMPORT

- [ ] **IMPORT-01 — Import polling can fail silently** · verified-local
  Implementation: src/components/ContactImportWizardV2.tsx.
  Verification: Import job, boundary, route and recovery integration tests; source review of polling/cancellation failure UI and route scan.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: Offline and 401/500 polling failures visibly change state without losing the batch identity.
- [ ] **IMPORT-02 — Cancel failures have no user feedback** · verified-local
  Implementation: src/components/ContactImportWizardV2.tsx.
  Verification: Import job, boundary, route and recovery integration tests; source review of polling/cancellation failure UI and route scan.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: A failed cancellation is visibly reported and can be retried safely.
- [ ] **IMPORT-03 — Retry failed rows depends on the original tab state** · verified-local
  Implementation: src/components/ContactImportWizardV2.tsx.
  Verification: Import job, boundary, route and recovery integration tests; source review of polling/cancellation failure UI and route scan.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: After reload, a failed batch still has an understandable recovery route.
- [ ] **IMPORT-04 — Clean rows are summarized without enough spot-checking** · verified-local
  Implementation: src/components/ContactImportWizardV2.tsx.
  Verification: Import job, boundary, route and recovery integration tests; source review of polling/cancellation failure UI and route scan.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: Users can catch incorrect but technically valid column mappings before records are written.
- [ ] **IMPORT-05 — Progress has no accessible name** · verified-local
  Implementation: src/components/ContactImportWizardV2.tsx.
  Verification: Import job, boundary, route and recovery integration tests; source review of polling/cancellation failure UI and route scan.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: Assistive technology identifies what is progressing and its current completion level.

## CLEAN

- [ ] **CLEAN-01 — Keeping the second duplicate always fails** · verified-local
  Implementation: src/components/DuplicateMergeForm.tsx; src/app/(app)/contacts/duplicates/page.tsx.
  Verification: UI/UX readiness browser tests; contact lifecycle/custom-field tests and restore/dependency source review.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: Both survivor choices merge successfully and retain the intended record.
- [ ] **CLEAN-02 — Duplicate coverage silently stops at 10,000 contacts** · verified-local
  Implementation: src/app/(app)/contacts/duplicates/page.tsx.
  Verification: UI/UX readiness browser tests; contact lifecycle/custom-field tests and restore/dependency source review.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: A larger address book never receives an all-clear based on a partial scan.
- [ ] **CLEAN-03 — Merge does not preview conflicting values** · verified-local
  Implementation: src/app/(app)/contacts/duplicates/page.tsx; src/components/DuplicateMergeForm.tsx; src/lib/contact-merge-actions.ts; src/app/(app)/contacts/archived/page.tsx; src/app/(app)/contacts/custom-fields/page.tsx.
  Verification: UI/UX readiness browser tests; contact lifecycle/custom-field tests and restore/dependency source review.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: Users can predict which conflicting company, custom field and primary contact method will survive.
- [ ] **CLEAN-04 — Archive restore lacks a scheduling-impact preview** · verified-local
  Implementation: src/app/(app)/contacts/duplicates/page.tsx; src/components/DuplicateMergeForm.tsx; src/lib/contact-merge-actions.ts; src/app/(app)/contacts/archived/page.tsx; src/app/(app)/contacts/custom-fields/page.tsx.
  Verification: UI/UX readiness browser tests; contact lifecycle/custom-field tests and restore/dependency source review.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: A restored contact’s next actions match the expectations shown before or immediately after restoring.
- [ ] **CLEAN-05 — Custom field deletion does not show dependent Mixes** · verified-local
  Implementation: src/app/(app)/contacts/duplicates/page.tsx; src/components/DuplicateMergeForm.tsx; src/lib/contact-merge-actions.ts; src/app/(app)/contacts/archived/page.tsx; src/app/(app)/contacts/custom-fields/page.tsx.
  Verification: UI/UX readiness browser tests; contact lifecycle/custom-field tests and restore/dependency source review.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: A user can repair affected drafts/Mixes without discovering blank fields during a later send.

## LIB

- [ ] **LIB-01 — Audience preview double-counts overlapping tags** · verified-local
  Implementation: src/app/api/contacts/audience/route.ts; src/components/useAudiencePreview.ts.
  Verification: UI/UX readiness browser tests: true audience union, missing methods and draft without an audience; library publication browser checks.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: One person in two selected tags counts once in both preview and activation.
- [ ] **LIB-02 — A template draft cannot be created without an audience** · verified-local
  Implementation: src/lib/shared-mix-use-service.ts; src/components/TemplateUseForm.tsx.
  Verification: UI/UX readiness browser tests: true audience union, missing methods and draft without an audience; library publication browser checks.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: A new account can create and edit a template draft before selecting recipients.
- [ ] **LIB-03 — New users face an undifferentiated library** · verified-local
  Implementation: src/app/(app)/mixes/page.tsx; src/app/(app)/templates/page.tsx; src/components/TemplateUseForm.tsx.
  Verification: UI/UX readiness browser tests: true audience union, missing methods and draft without an audience; library publication browser checks.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: A novice finds a suitable first plan without understanding sales-framework terminology.
- [ ] **LIB-04 — Using a template is hidden inside its preview** · verified-local
  Implementation: src/app/(app)/mixes/page.tsx; src/app/(app)/templates/page.tsx; src/components/TemplateUseForm.tsx.
  Verification: UI/UX readiness browser tests: true audience union, missing methods and draft without an audience; library publication browser checks.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: Users who have already chosen a plan can start setup without an unnecessary modal step.
- [ ] **LIB-05 — Count and duration wording lacks edge-case polish** · verified-local
  Implementation: src/app/(app)/mixes/page.tsx; src/app/(app)/templates/page.tsx; src/components/TemplateUseForm.tsx.
  Verification: UI/UX readiness browser tests: true audience union, missing methods and draft without an audience; library publication browser checks.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: One-step plans read as one beat or a single follow-up, with an intelligible timing summary.

## MIX

- [ ] **MIX-01 — A long custom plan has no unsaved-draft protection** · verified-local
  Implementation: src/components/FormGuard.tsx; src/components/SchedulePreview.tsx; src/lib/schedule-preview.ts; src/components/useAudiencePreview.ts.
  Verification: Schedule-preview and audience browser tests; editor undo, unsaved-work and timing source review.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: Leaving or reloading a modified multi-beat plan cannot silently discard all work.
- [ ] **MIX-02 — Editor activation repeats the overlapping-tag count error** · verified-local
  Implementation: src/components/useAudiencePreview.ts; src/components/MixEditor.tsx; src/components/SchedulePreview.tsx; src/lib/schedule-preview.ts.
  Verification: Schedule-preview and audience browser tests; editor undo, unsaved-work and timing source review.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: The review describes the selected audience rather than unrelated contacts or repeated tag memberships.
- [ ] **MIX-03 — Removing a beat loses its contents immediately** · verified-local
  Implementation: src/components/MixEditor.tsx; src/app/(app)/mixes/new/page.tsx; src/app/(app)/mixes/[mixId]/edit/page.tsx; src/components/SchedulePreview.tsx; src/lib/schedule-preview.ts; src/components/useAudiencePreview.ts.
  Verification: Schedule-preview and audience browser tests; editor undo, unsaved-work and timing source review.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: A mistaken removal restores the full message, variants and timing.
- [ ] **MIX-04 — Relative timing is hard to verify as actual dates** · verified-local
  Implementation: src/components/MixEditor.tsx; src/app/(app)/mixes/new/page.tsx; src/app/(app)/mixes/[mixId]/edit/page.tsx; src/components/SchedulePreview.tsx; src/lib/schedule-preview.ts; src/components/useAudiencePreview.ts.
  Verification: Schedule-preview and audience browser tests; editor undo, unsaved-work and timing source review.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: Users can verify the exact sequence dates before activation, including weekend and quiet-hour effects.
- [ ] **MIX-05 — Advanced timing language increases the learning burden** · verified-local
  Implementation: src/components/MixEditor.tsx; src/app/(app)/mixes/new/page.tsx; src/app/(app)/mixes/[mixId]/edit/page.tsx; src/components/SchedulePreview.tsx; src/lib/schedule-preview.ts; src/components/useAudiencePreview.ts.
  Verification: Schedule-preview and audience browser tests; editor undo, unsaved-work and timing source review.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: A first-time user can create a two-step plan without decoding brand terminology.

## INV

- [ ] **INV-01 — Revocation is immediate despite a permanent allowance cost** · verified-local
  Implementation: src/app/(app)/mixes/system/page.tsx; src/components/SystemMixInviteForm.tsx; src/lib/system-mix-actions.ts.
  Verification: Onboarding/invitation and System Mix publication browser tests: selected recipients, allowance confirmation, reminder creation and revocation.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: Users cannot accidentally revoke a still-needed invitation with one tap.
- [ ] **INV-02 — Preparing an invitation consumes a scarce slot before sending** · verified-local
  Implementation: src/app/(app)/mixes/system/page.tsx; src/components/SystemMixInviteForm.tsx; src/lib/system-mix-actions.ts.
  Verification: Onboarding/invitation and System Mix publication browser tests: selected recipients, allowance confirmation, reminder creation and revocation.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: Users correctly predict the remaining allowance before confirming preparation.
- [ ] **INV-03 — The combined address input offers no channel-specific keyboard** · verified-local
  Implementation: src/app/(app)/mixes/system/page.tsx; src/components/SystemMixInviteForm.tsx; src/lib/system-mix-actions.ts.
  Verification: Onboarding/invitation and System Mix publication browser tests: selected recipients, allowance confirmation, reminder creation and revocation.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: Phones expose a suitable keyboard and validation matches the selected invitation channel.
- [ ] **INV-04 — Saved-contact choice is capped and requires a separate search submit** · verified-local
  Implementation: src/app/(app)/mixes/system/page.tsx; src/components/SystemMixInviteForm.tsx; src/lib/system-mix-actions.ts.
  Verification: Onboarding/invitation and System Mix publication browser tests: selected recipients, allowance confirmation, reminder creation and revocation.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: Finding another recipient does not discard an invitation draft or hide matching people without explanation.
- [ ] **INV-05 — Status has no direct link to the exact prepared reminder** · verified-local
  Implementation: src/app/(app)/mixes/system/page.tsx; src/components/SystemMixInviteForm.tsx; src/lib/system-mix-actions.ts.
  Verification: Onboarding/invitation and System Mix publication browser tests: selected recipients, allowance confirmation, reminder creation and revocation.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: An owner reaches the correct prepared invitation without searching unrelated beats.

## JOURNEY

- [ ] **JOURNEY-01 — Selecting a stage drops an existing person search** · verified-local
  Implementation: src/app/(app)/journey/page.tsx; src/app/(app)/settings/journey/page.tsx; src/components/JourneyRuleForm.tsx; src/components/ContactJourneyPanel.tsx.
  Verification: Journey rule-editing browser suite and customer-journey/configuration integration tests, including stale draft and paused automation.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: Searching then changing stage retains the query and shows clear active-filter state.
- [ ] **JOURNEY-02 — Automatic and Paused are ambiguous at the person level** · verified-local
  Implementation: src/app/(app)/journey/page.tsx; src/app/(app)/settings/journey/page.tsx; src/components/JourneyRuleForm.tsx; src/components/ContactJourneyPanel.tsx.
  Verification: Journey rule-editing browser suite and customer-journey/configuration integration tests, including stale draft and paused automation.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: A user can explain why one contact is paused and how to resume the intended behavior.
- [ ] **JOURNEY-03 — Time in stage is not connected to a next action** · verified-local
  Implementation: src/app/(app)/journey/page.tsx; src/app/(app)/settings/journey/page.tsx; src/components/JourneyRuleForm.tsx; src/components/ContactJourneyPanel.tsx.
  Verification: Journey rule-editing browser suite and customer-journey/configuration integration tests, including stale draft and paused automation.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: The board helps decide who needs attention, not only where they are categorized.
- [ ] **JOURNEY-04 — Rules need a worked customer example** · verified-local
  Implementation: src/app/(app)/journey/page.tsx; src/app/(app)/settings/journey/page.tsx; src/components/JourneyRuleForm.tsx; src/components/ContactJourneyPanel.tsx.
  Verification: Journey rule-editing browser suite and customer-journey/configuration integration tests, including stale draft and paused automation.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: An owner can preview the consequence of a rule without changing a live customer.
- [ ] **JOURNEY-05 — Combined automation needs scenario-based usability checks** · verified-local
  Implementation: src/app/(app)/journey/page.tsx; src/app/(app)/settings/journey/page.tsx; src/components/JourneyRuleForm.tsx; src/components/ContactJourneyPanel.tsx.
  Verification: Journey rule-editing browser suite and customer-journey/configuration integration tests, including stale draft and paused automation.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: Conflicting or paused automation produces a clear, recoverable user-facing state.

## CAL

- [ ] **CAL-01 — Empty calendar days create a long mobile detour** · verified-local
  Implementation: src/app/(app)/calendar/page.tsx; src/components/CalendarEntryForm.tsx.
  Verification: Calendar/time/scheduling tests and three-engine calendar route scan; pagination, locale and invite-copy source review.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: Users can scan availability and start an event without traversing repeated empty panels.
- [ ] **CAL-02 — Timezone entry differs from the rest of the product** · verified-local
  Implementation: src/app/(app)/calendar/page.tsx; src/components/CalendarEntryForm.tsx.
  Verification: Calendar/time/scheduling tests and three-engine calendar route scan; pagination, locale and invite-copy source review.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: Users can select any supported zone without memorizing an IANA identifier.
- [ ] **CAL-03 — Calendar display ignores saved locale preferences** · verified-local
  Implementation: src/app/(app)/calendar/page.tsx; src/components/CalendarEntryForm.tsx.
  Verification: Calendar/time/scheduling tests and three-engine calendar route scan; pagination, locale and invite-copy source review.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: Changing locale affects calendar formatting consistently with Today and account screens.
- [ ] **CAL-04 — Sharing the event is explained only near Save** · verified-local
  Implementation: src/app/(app)/calendar/page.tsx; src/components/CalendarEntryForm.tsx.
  Verification: Calendar/time/scheduling tests and three-engine calendar route scan; pagination, locale and invite-copy source review.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: Users do not believe the attendee was notified merely because the event was saved.
- [ ] **CAL-05 — The event limit offers the wrong recovery direction** · verified-local
  Implementation: src/app/(app)/calendar/page.tsx; src/components/CalendarEntryForm.tsx.
  Verification: Calendar/time/scheduling tests and three-engine calendar route scan; pagination, locale and invite-copy source review.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: A busy account can inspect all relevant events without dismantling a calendar connection.

## LEAD

- [ ] **LEAD-01 — Connection setup becomes technical abruptly** · verified-local
  Implementation: src/app/(app)/settings/connections/page.tsx; src/components/PublicLeadForm.tsx; src/app/lead/[connectionId]/page.tsx.
  Verification: Intake/connection tests and source review of held search, timestamp and public-form validation; connection route scan.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: A nontechnical owner can publish a usable lead form without encountering API setup.
- [ ] **LEAD-02 — Recent inquiry timestamps ignore account locale** · verified-local
  Implementation: src/app/(app)/settings/connections/page.tsx; src/components/PublicLeadForm.tsx; src/app/lead/[connectionId]/page.tsx.
  Verification: Intake/connection tests and source review of held search, timestamp and public-form validation; connection route scan.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: An owner can match a recent inquiry to their local working day without converting UTC.
- [ ] **LEAD-03 — Needs-review work is a sequential ten-item queue** · verified-local
  Implementation: src/app/(app)/settings/connections/page.tsx; src/components/PublicLeadForm.tsx; src/app/lead/[connectionId]/page.tsx.
  Verification: Intake/connection tests and source review of held search, timestamp and public-form validation; connection route scan.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: An owner can find an urgent held inquiry without first resolving unrelated entries.
- [ ] **LEAD-04 — Hosted-form receipt ends without a useful next action** · verified-local
  Implementation: src/app/(app)/settings/connections/page.tsx; src/components/PublicLeadForm.tsx; src/app/lead/[connectionId]/page.tsx.
  Verification: Intake/connection tests and source review of held search, timestamp and public-form validation; connection route scan.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: Someone who entered a wrong phone number can understand how to correct the request.
- [ ] **LEAD-05 — Required contact-method validation is indirect** · verified-local
  Implementation: src/app/(app)/settings/connections/page.tsx; src/components/PublicLeadForm.tsx; src/app/lead/[connectionId]/page.tsx.
  Verification: Intake/connection tests and source review of held search, timestamp and public-form validation; connection route scan.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: Submitting neither method moves the user directly to the relevant fields with a clear instruction.

## REVIEW

- [ ] **REVIEW-01 — Low-score users receive fewer follow-on choices** · verified-local
  Implementation: src/components/ReviewFeedbackForm.tsx; src/app/review/[token]/page.tsx; src/app/(app)/settings/business/page.tsx.
  Verification: UI/UX workflow browser test: rating selection, private receipt, same public-review route at low rating and correction link.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: High- and low-rating users can access the same optional public-review route.
- [ ] **REVIEW-02 — Star values have no visible meaning anchors** · verified-local
  Implementation: src/components/ReviewFeedbackForm.tsx; src/app/review/[token]/page.tsx; src/app/(app)/settings/business/page.tsx.
  Verification: UI/UX workflow browser test: rating selection, private receipt, same public-review route at low rating and correction link.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: Users consistently understand which end represents a poor or excellent experience.
- [ ] **REVIEW-03 — Feedback cannot be corrected after submission** · verified-local
  Implementation: src/components/ReviewFeedbackForm.tsx; src/app/review/[token]/page.tsx; src/app/(app)/settings/business/page.tsx.
  Verification: UI/UX workflow browser test: rating selection, private receipt, same public-review route at low rating and correction link.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: An accidental rating or text error has a discoverable remedy.
- [ ] **REVIEW-04 — Private acknowledgement implies a response without setting expectations** · verified-local
  Implementation: src/components/ReviewFeedbackForm.tsx; src/app/review/[token]/page.tsx; src/app/(app)/settings/business/page.tsx.
  Verification: UI/UX workflow browser test: rating selection, private receipt, same public-review route at low rating and correction link.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: A dissatisfied customer has a useful next step without an invented response-time promise.
- [ ] **REVIEW-05 — Real recipient comprehension is unverified** · awaiting-qualification
  Implementation: src/components/ReviewFeedbackForm.tsx; src/app/review/[token]/page.tsx; src/app/(app)/settings/business/page.tsx.
  Verification: UI/UX workflow browser test: rating selection, private receipt, same public-review route at low rating and correction link.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: Customers understand where their feedback goes before submitting it.

## PREF

- [ ] **PREF-01 — Timezone and schedule are separated from business setup** · verified-local
  Implementation: src/app/(app)/settings/business/page.tsx; src/app/(app)/account/preferences/page.tsx; src/app/(app)/settings/jump-date-types/page.tsx.
  Verification: Worked schedule browser test; preferences route scan and guarded-save/signature/date-type source review.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: Users can see the active signature, timezone and sending defaults before starting a plan.
- [ ] **PREF-02 — Signature editing has no rendered message example** · verified-local
  Implementation: src/app/(app)/settings/business/page.tsx; src/app/(app)/account/preferences/page.tsx; src/app/(app)/settings/jump-date-types/page.tsx.
  Verification: Worked schedule browser test; preferences route scan and guarded-save/signature/date-type source review.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: A user can spot duplicate names, awkward spacing and overly long signoffs before saving.
- [ ] **PREF-03 — Scheduling changes have no concrete impact preview** · verified-local
  Implementation: src/app/(app)/settings/business/page.tsx; src/app/(app)/account/preferences/page.tsx; src/app/(app)/settings/jump-date-types/page.tsx.
  Verification: Worked schedule browser test; preferences route scan and guarded-save/signature/date-type source review.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: The user can predict the time/date of an affected beat before confirming new defaults.
- [ ] **PREF-04 — Customer settings forms lack consistent pending/dirty states** · verified-local
  Implementation: src/app/(app)/settings/business/page.tsx; src/app/(app)/account/preferences/page.tsx; src/app/(app)/settings/jump-date-types/page.tsx.
  Verification: Worked schedule browser test; preferences route scan and guarded-save/signature/date-type source review.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: Slow saves and accidental navigation do not leave users unsure whether edits were kept.
- [ ] **PREF-05 — Date types expose taxonomy before explaining consequences** · verified-local
  Implementation: src/app/(app)/settings/business/page.tsx; src/app/(app)/account/preferences/page.tsx; src/app/(app)/settings/jump-date-types/page.tsx.
  Verification: Worked schedule browser test; preferences route scan and guarded-save/signature/date-type source review.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: Users know what disabling a type changes and which existing plans depend on it.

## NOTIFY

- [ ] **NOTIFY-01 — Unavailable-email fallback can recommend unavailable push** · verified-local
  Implementation: src/app/(app)/settings/notifications/page.tsx; src/components/PushNotificationControl.tsx; src/app/(app)/settings/sending/page.tsx; src/components/AutomaticSendPreview.tsx; src/app/api/settings/sending-preview/route.ts.
  Verification: Automatic-sending preview browser test: candidate exclusions, earliest time and prior attempts; notification delivery unit tests and source review.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: When both channels are unavailable, the page gives one accurate explanation and useful support action.
- [ ] **NOTIFY-02 — Device reminder failure language is technical** · verified-local
  Implementation: src/app/(app)/settings/notifications/page.tsx; src/components/PushNotificationControl.tsx; src/app/(app)/settings/sending/page.tsx; src/components/AutomaticSendPreview.tsx; src/app/api/settings/sending-preview/route.ts.
  Verification: Automatic-sending preview browser test: candidate exclusions, earliest time and prior attempts; notification delivery unit tests and source review.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: The message describes a product capability and next step without server jargon.
- [ ] **NOTIFY-03 — Email reminder preferences do not show a sample or test action** · verified-local
  Implementation: src/app/(app)/settings/notifications/page.tsx; src/components/PushNotificationControl.tsx; src/app/(app)/settings/sending/page.tsx; src/components/AutomaticSendPreview.tsx; src/app/api/settings/sending-preview/route.ts.
  Verification: Automatic-sending preview browser test: candidate exclusions, earliest time and prior attempts; notification delivery unit tests and source review.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: Members can verify the reminder’s contents and destination before relying on it.
- [ ] **NOTIFY-04 — Enabling automation lacks an exact near-term sending preview** · verified-local
  Implementation: src/app/(app)/settings/notifications/page.tsx; src/components/PushNotificationControl.tsx; src/app/(app)/settings/sending/page.tsx; src/components/AutomaticSendPreview.tsx; src/app/api/settings/sending-preview/route.ts.
  Verification: Automatic-sending preview browser test: candidate exclusions, earliest time and prior attempts; notification delivery unit tests and source review.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: Before enabling automation, the owner can identify recipients and earliest send times.
- [ ] **NOTIFY-05 — Reminder delivery and timing need real-channel evidence** · awaiting-qualification
  Implementation: src/components/AutomaticSendPreview.tsx; src/app/api/settings/sending-preview/route.ts.
  Verification: Automatic-sending preview browser test: candidate exclusions, earliest time and prior attempts; notification delivery unit tests and source review.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: Document actual delivered reminders and accurate failure feedback before declaring these functions ready.

## ACCOUNT

- [ ] **ACCOUNT-01 — Account email is displayed without a change/recovery path** · verified-local
  Implementation: src/app/(app)/account/page.tsx; src/components/AccountDeletionForm.tsx; src/app/account/deleted/page.tsx; src/components/AccountExport.tsx.
  Verification: Passwordless deletion browser checks, export/deletion integration tests, session-source review and three-engine account route scan.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: A member who is losing access to an email address can find the approved way to update it.
- [ ] **ACCOUNT-02 — Social-only account deletion requires creating a password** · verified-local
  Implementation: src/app/(app)/account/page.tsx; src/components/AccountDeletionForm.tsx; src/app/account/deleted/page.tsx; src/components/AccountExport.tsx.
  Verification: Passwordless deletion browser checks, export/deletion integration tests, session-source review and three-engine account route scan.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: A social-only member can delete after secure reauthentication without inventing a new credential.
- [ ] **ACCOUNT-03 — Deletion warning reference points to no matching element** · verified-local
  Implementation: src/app/(app)/account/page.tsx; src/components/AccountDeletionForm.tsx; src/app/account/deleted/page.tsx; src/components/AccountExport.tsx.
  Verification: Passwordless deletion browser checks, export/deletion integration tests, session-source review and three-engine account route scan.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: The form’s accessible description includes the deletion consequences.
- [ ] **ACCOUNT-04 — Data export begins as a bare download action** · verified-local
  Implementation: src/app/(app)/account/page.tsx; src/components/AccountDeletionForm.tsx; src/app/account/deleted/page.tsx; src/components/AccountExport.tsx.
  Verification: Passwordless deletion browser checks, export/deletion integration tests, session-source review and three-engine account route scan.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: A user can distinguish a started download, an export failure and a complete export.
- [ ] **ACCOUNT-05 — Session rows emphasize technical identifiers** · verified-local
  Implementation: src/app/(app)/account/page.tsx; src/components/AccountDeletionForm.tsx; src/app/account/deleted/page.tsx; src/components/AccountExport.tsx.
  Verification: Passwordless deletion browser checks, export/deletion integration tests, session-source review and three-engine account route scan.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: A member can identify the session they intend to revoke without interpreting an IP address.

## HELP

- [ ] **HELP-01 — Customer support drafts lack the admin reply protections** · verified-local
  Implementation: src/app/(app)/help/page.tsx; src/components/SupportFaq.tsx; src/app/(app)/account/tickets/[ticketId]/page.tsx.
  Verification: Support tests, help/ticket route scans and source review of FAQ status, retained forms and optional coarse context.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: A network error or navigation interruption does not erase a long explanation.
- [ ] **HELP-02 — Reply expectations are unclear** · verified-local
  Implementation: src/app/(app)/help/page.tsx; src/components/SupportFaq.tsx; src/app/(app)/account/tickets/[ticketId]/page.tsx.
  Verification: Support tests, help/ticket route scans and source review of FAQ status, retained forms and optional coarse context.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: A customer knows whether to wait, check the ticket or use another channel.
- [ ] **HELP-03 — Successful FAQ filtering is not announced** · verified-local
  Implementation: src/app/(app)/help/page.tsx; src/components/SupportFaq.tsx; src/app/(app)/account/tickets/[ticketId]/page.tsx.
  Verification: Support tests, help/ticket route scans and source review of FAQ status, retained forms and optional coarse context.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: Screen-reader users hear how many answers match after changing the query.
- [ ] **HELP-04 — Tickets rely on a user’s manual description of context** · verified-local
  Implementation: src/app/(app)/help/page.tsx; src/components/SupportFaq.tsx; src/app/(app)/account/tickets/[ticketId]/page.tsx.
  Verification: Support tests, help/ticket route scans and source review of FAQ status, retained forms and optional coarse context.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: Support receives useful reproduction context without collecting private contact data.
- [ ] **HELP-05 — No-match help sends users to a vague location** · verified-local
  Implementation: src/app/(app)/help/page.tsx; src/components/SupportFaq.tsx; src/app/(app)/account/tickets/[ticketId]/page.tsx.
  Verification: Support tests, help/ticket route scans and source review of FAQ status, retained forms and optional coarse context.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: A failed help search has one obvious continuation without scrolling through the rest of the page.

## ADMINHOME

- [ ] **ADMINHOME-01 — Mobile administration uses two navigation layers** · verified-local
  Implementation: src/app/(staff)/admin/page.tsx; src/components/AdminNav.tsx; src/lib/admin-navigation.ts.
  Verification: Admin workspace browser tests, 320-pixel navigation checks and overview urgency/refresh source review.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: An operator identifies the current area and reaches an adjacent task quickly on a phone.
- [ ] **ADMINHOME-02 — Overflowing tab strips give little continuation cue** · verified-local
  Implementation: src/app/(staff)/admin/page.tsx; src/components/AdminNav.tsx; src/lib/admin-navigation.ts.
  Verification: Admin workspace browser tests, 320-pixel navigation checks and overview urgency/refresh source review.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: All sibling destinations are discoverable and the active one is fully visible at 320 pixels.
- [ ] **ADMINHOME-03 — Attention cards lack a common urgency scale** · verified-local
  Implementation: src/app/(staff)/admin/page.tsx; src/components/AdminNav.tsx; src/lib/admin-navigation.ts.
  Verification: Admin workspace browser tests, 320-pixel navigation checks and overview urgency/refresh source review.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: Operators can decide the first action without opening each attention item.
- [ ] **ADMINHOME-04 — Overview freshness is a render timestamp** · verified-local
  Implementation: src/app/(staff)/admin/page.tsx; src/components/AdminNav.tsx; src/lib/admin-navigation.ts.
  Verification: Admin workspace browser tests, 320-pixel navigation checks and overview urgency/refresh source review.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: A long-open overview makes stale metrics apparent rather than implying they are current.
- [ ] **ADMINHOME-05 — Staff and customer context can be easy to confuse** · verified-local
  Implementation: src/app/(staff)/admin/page.tsx; src/components/AdminNav.tsx; src/lib/admin-navigation.ts.
  Verification: Admin workspace browser tests, 320-pixel navigation checks and overview urgency/refresh source review.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: An operator does not use the overview total as the number of remaining customer places.

## ADMINUSER

- [ ] **ADMINUSER-01 — Search results provide limited triage context** · verified-local
  Implementation: src/app/(staff)/admin/users/page.tsx; src/app/(staff)/admin/users/[userId]/page.tsx.
  Verification: User administration and workflow browser tests: suspension/restoration, retained reason, live permissions and renewed MFA.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: A support operator can identify the likely target without repeatedly opening similar accounts.
- [ ] **ADMINUSER-02 — Access changes need a task-specific review summary** · verified-local
  Implementation: src/app/(staff)/admin/users/page.tsx; src/app/(staff)/admin/users/[userId]/page.tsx.
  Verification: User administration and workflow browser tests: suspension/restoration, retained reason, live permissions and renewed MFA.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: The operator can name the exact account and consequence immediately before submitting.
- [ ] **ADMINUSER-03 — Suspension consequences are a dense paragraph** · verified-local
  Implementation: src/app/(staff)/admin/users/page.tsx; src/app/(staff)/admin/users/[userId]/page.tsx.
  Verification: User administration and workflow browser tests: suspension/restoration, retained reason, live permissions and renewed MFA.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: Operators can explain what restoring access will and will not automatically restore.
- [ ] **ADMINUSER-04 — Session dates are not a recognizable device inventory** · verified-local
  Implementation: src/app/(staff)/admin/users/page.tsx; src/app/(staff)/admin/users/[userId]/page.tsx.
  Verification: User administration and workflow browser tests: suspension/restoration, retained reason, live permissions and renewed MFA.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: An operator can discuss the relevant session accurately with the account owner.
- [ ] **ADMINUSER-05 — Denied and changing-access states need operator task checks** · verified-local
  Implementation: src/app/(staff)/admin/users/page.tsx; src/app/(staff)/admin/users/[userId]/page.tsx.
  Verification: User administration and workflow browser tests: suspension/restoration, retained reason, live permissions and renewed MFA.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: A denied action explains the supported next step and preserves appropriate nonsecret draft work.

## ADMINSUP

- [ ] **ADMINSUP-01 — Queue age is time since any activity** · verified-local
  Implementation: src/app/(staff)/admin/support/page.tsx; src/app/(staff)/admin/support/[ticketId]/page.tsx; src/components/SupportReplyComposer.tsx; src/components/FormGuard.tsx.
  Verification: Support case/email/workflow browser suites: assignment conflicts, ended views, reply retention and separate delivery receipt; beforeunload clears after save.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: An internal update cannot make an overdue customer reply appear newly received.
- [ ] **ADMINSUP-02 — Reply action and email delivery need clearer separation** · verified-local
  Implementation: src/app/(staff)/admin/support/page.tsx; src/app/(staff)/admin/support/[ticketId]/page.tsx; src/components/SupportReplyComposer.tsx; src/components/FormGuard.tsx.
  Verification: Support case/email/workflow browser suites: assignment conflicts, ended views, reply retention and separate delivery receipt; beforeunload clears after save.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: An operator can confirm the customer-visible reply without assuming inbox delivery.
- [ ] **ADMINSUP-03 — Reply drafts are lost on refresh** · verified-local
  Implementation: src/app/(staff)/admin/support/page.tsx; src/app/(staff)/admin/support/[ticketId]/page.tsx; src/components/SupportReplyComposer.tsx; src/components/FormGuard.tsx.
  Verification: Support case/email/workflow browser suites: assignment conflicts, ended views, reply retention and separate delivery receipt; beforeunload clears after save.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: Routine refresh during case investigation cannot silently remove a lengthy reply.
- [ ] **ADMINSUP-04 — View-only support entry requires careful discovery** · verified-local
  Implementation: src/app/(staff)/admin/support/page.tsx; src/app/(staff)/admin/support/[ticketId]/page.tsx; src/components/SupportReplyComposer.tsx; src/components/FormGuard.tsx.
  Verification: Support case/email/workflow browser suites: assignment conflicts, ended views, reply retention and separate delivery receipt; beforeunload clears after save.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: A support operator can determine why view-only access is unavailable without trial and error.
- [ ] **ADMINSUP-05 — Concurrent case handling was not qualified in this audit** · verified-local
  Implementation: src/components/FormGuard.tsx; src/components/SupportReplyComposer.tsx.
  Verification: Support case/email/workflow browser suites: assignment conflicts, ended views, reply retention and separate delivery receipt; beforeunload clears after save.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: Conflicts, ended support views and failed email remain understandable and recoverable.

## ACCESS

- [ ] **ACCESS-01 — Access status is distributed across three pages** · verified-local
  Implementation: src/app/(staff)/admin/waitlist/page.tsx; src/app/(staff)/admin/access/page.tsx; src/app/(staff)/admin/access/[inviteId]/page.tsx; src/app/(staff)/admin/admission/page.tsx; src/components/WaitlistSelectionForm.tsx.
  Verification: Admission/referral/waitlist integration tests and staff access browser checks; impact-preview and selection source review.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: An operator can diagnose one blocked signup without losing recipient context.
- [ ] **ACCESS-02 — Capacity terminology is easy to overgeneralize** · verified-local
  Implementation: src/app/(staff)/admin/waitlist/page.tsx; src/app/(staff)/admin/access/page.tsx; src/app/(staff)/admin/access/[inviteId]/page.tsx; src/app/(staff)/admin/admission/page.tsx; src/components/WaitlistSelectionForm.tsx.
  Verification: Admission/referral/waitlist integration tests and staff access browser checks; impact-preview and selection source review.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: Operators do not assume zero displayed capacity blocks every form of account admission.
- [ ] **ACCESS-03 — Pause controls have materially different effects** · verified-local
  Implementation: src/app/(staff)/admin/waitlist/page.tsx; src/app/(staff)/admin/access/page.tsx; src/app/(staff)/admin/access/[inviteId]/page.tsx; src/app/(staff)/admin/admission/page.tsx; src/components/WaitlistSelectionForm.tsx.
  Verification: Admission/referral/waitlist integration tests and staff access browser checks; impact-preview and selection source review.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: The operator can predict what happens to a new request, queued email and existing invitation under each change.
- [ ] **ACCESS-04 — Empty waitlist still presents selection work** · verified-local
  Implementation: src/app/(staff)/admin/waitlist/page.tsx; src/app/(staff)/admin/access/page.tsx; src/app/(staff)/admin/access/[inviteId]/page.tsx; src/app/(staff)/admin/admission/page.tsx; src/components/WaitlistSelectionForm.tsx.
  Verification: Admission/referral/waitlist integration tests and staff access browser checks; impact-preview and selection source review.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: No-recipient views direct the operator to the blocker or next setup task rather than a zero-item workflow.
- [ ] **ACCESS-05 — Invitation search hides its supported phone search** · verified-local
  Implementation: src/app/(staff)/admin/waitlist/page.tsx; src/app/(staff)/admin/access/page.tsx; src/app/(staff)/admin/access/[inviteId]/page.tsx; src/app/(staff)/admin/admission/page.tsx; src/components/WaitlistSelectionForm.tsx.
  Verification: Admission/referral/waitlist integration tests and staff access browser checks; impact-preview and selection source review.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: An operator knows a text invitation can be found by its recipient phone number.

## ADMINLIB

- [ ] **ADMINLIB-01 — Published and draft labels require interpretation** · verified-local
  Implementation: src/components/LibraryDraftForm.tsx; src/app/(staff)/admin/templates/page.tsx; src/app/(staff)/admin/system-mix/page.tsx; src/components/LibraryOptionsForm.tsx.
  Verification: Library administration and System Mix browser suites: draft, preview, publication, rollback, hidden item and stale/permission denial.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: A reviewer identifies what customers currently see and whether an edit awaits publication.
- [ ] **ADMINLIB-02 — Customer and staff vocabulary differs** · verified-local
  Implementation: src/components/LibraryDraftForm.tsx; src/app/(staff)/admin/templates/page.tsx; src/app/(staff)/admin/system-mix/page.tsx; src/components/LibraryOptionsForm.tsx.
  Verification: Library administration and System Mix browser suites: draft, preview, publication, rollback, hidden item and stale/permission denial.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: Editors can predict exactly how authored content is presented to members.
- [ ] **ADMINLIB-03 — Long authoring forms put review context far from editing** · verified-local
  Implementation: src/components/LibraryDraftForm.tsx; src/app/(staff)/admin/templates/page.tsx; src/app/(staff)/admin/system-mix/page.tsx; src/components/LibraryOptionsForm.tsx.
  Verification: Library administration and System Mix browser suites: draft, preview, publication, rollback, hidden item and stale/permission denial.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: A reviewer can locate missing fields or timing problems without rescanning the entire form.
- [ ] **ADMINLIB-04 — Library option changes lack a customer-filter preview** · verified-local
  Implementation: src/components/LibraryDraftForm.tsx; src/app/(staff)/admin/templates/page.tsx; src/app/(staff)/admin/system-mix/page.tsx; src/components/LibraryOptionsForm.tsx.
  Verification: Library administration and System Mix browser suites: draft, preview, publication, rollback, hidden item and stale/permission denial.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: An editor understands which new choices disappear and how existing content remains discoverable.
- [ ] **ADMINLIB-05 — Full publish/rollback usability needs a populated edit scenario** · verified-local
  Implementation: src/components/LibraryDraftForm.tsx; src/app/(staff)/admin/templates/page.tsx; src/app/(staff)/admin/system-mix/page.tsx; src/components/LibraryOptionsForm.tsx.
  Verification: Library administration and System Mix browser suites: draft, preview, publication, rollback, hidden item and stale/permission denial.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: Editors can verify the live version and recover from a conflict without losing their intended changes.

## EMAIL

- [ ] **EMAIL-01 — Provider-event history stops at the latest 30** · verified-local
  Implementation: src/app/(staff)/admin/email/page.tsx; src/app/(staff)/admin/email/recovery/[deliveryId]/page.tsx; src/app/(staff)/admin/email/suppressions/page.tsx.
  Verification: Email operations/recovery browser suites and 65-event paging/search browser test; synthetic transport receipt and opt-out handling.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: An older delivery incident can be investigated without relying on being in the latest 30 events.
- [ ] **EMAIL-02 — Operational terms obscure the customer consequence** · verified-local
  Implementation: src/app/(staff)/admin/email/page.tsx; src/app/(staff)/admin/email/recovery/[deliveryId]/page.tsx; src/app/(staff)/admin/email/suppressions/page.tsx.
  Verification: Email operations/recovery browser suites and 65-event paging/search browser test; synthetic transport receipt and opt-out handling.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: An operator can explain whether the person should wait, use an existing link or receive a reviewed resend.
- [ ] **EMAIL-03 — Recovery navigation repeats similar destinations** · verified-local
  Implementation: src/app/(staff)/admin/email/page.tsx; src/app/(staff)/admin/email/recovery/[deliveryId]/page.tsx; src/app/(staff)/admin/email/suppressions/page.tsx.
  Verification: Email operations/recovery browser suites and 65-event paging/search browser test; synthetic transport receipt and opt-out handling.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: A failed invitation has one obvious investigation entry rather than competing similar links.
- [ ] **EMAIL-04 — Mixed suppression reasons need a simple action summary** · verified-local
  Implementation: src/app/(staff)/admin/email/page.tsx; src/app/(staff)/admin/email/recovery/[deliveryId]/page.tsx; src/app/(staff)/admin/email/suppressions/page.tsx.
  Verification: Email operations/recovery browser suites and 65-event paging/search browser test; synthetic transport receipt and opt-out handling.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: Operators do not mistake clearing one provider issue for permission to contact a opted-out recipient.
- [ ] **EMAIL-05 — Real delivery recovery remains unverified here** · awaiting-qualification
  Implementation: src/app/(staff)/admin/email/page.tsx; src/app/(staff)/admin/email/recovery/[deliveryId]/page.tsx; src/app/(staff)/admin/email/suppressions/page.tsx.
  Verification: Email operations/recovery browser suites and 65-event paging/search browser test; synthetic transport receipt and opt-out handling.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: The UI’s delivery statements match provider records and safe retry outcomes.

## REPORT

- [ ] **REPORT-01 — Metric interpretation is hidden behind disclosures** · verified-local
  Implementation: src/app/(staff)/admin/reports/page.tsx; src/components/AdminReportView.tsx; src/app/(staff)/admin/reports/exports/page.tsx; src/app/(staff)/admin/reports/history/page.tsx; src/components/AdminRefresh.tsx.
  Verification: Report browser suite: export lifetime, authorized session, saved history, permission removal, dates and trends; desktop fold and route/theme checks.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: A reader can interpret a conversion percentage without confusing account counts, eligible cohorts or missing data.
- [ ] **REPORT-02 — Automatic export checking stops after eight polls** · verified-local
  Implementation: src/app/(staff)/admin/reports/page.tsx; src/components/AdminReportView.tsx; src/app/(staff)/admin/reports/exports/page.tsx; src/app/(staff)/admin/reports/history/page.tsx; src/components/AdminRefresh.tsx.
  Verification: Report browser suite: export lifetime, authorized session, saved history, permission removal, dates and trends; desktop fold and route/theme checks.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: A slow export remains easy to follow after two minutes without an apparently stalled status.
- [ ] **REPORT-03 — Export expiry is described mostly as an absolute time** · verified-local
  Implementation: src/app/(staff)/admin/reports/page.tsx; src/components/AdminReportView.tsx; src/app/(staff)/admin/reports/exports/page.tsx; src/app/(staff)/admin/reports/history/page.tsx; src/components/AdminRefresh.tsx.
  Verification: Report browser suite: export lifetime, authorized session, saved history, permission removal, dates and trends; desktop fold and route/theme checks.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: An operator understands whether the current download will still work after signing in elsewhere.
- [ ] **REPORT-04 — Live and saved reporting need a stronger visual distinction** · verified-local
  Implementation: src/app/(staff)/admin/reports/page.tsx; src/components/AdminReportView.tsx; src/app/(staff)/admin/reports/exports/page.tsx; src/app/(staff)/admin/reports/history/page.tsx; src/components/AdminRefresh.tsx.
  Verification: Report browser suite: export lifetime, authorized session, saved history, permission removal, dates and trends; desktop fold and route/theme checks.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: Screenshots and exported reports retain enough context to avoid treating live totals as immutable history.
- [ ] **REPORT-05 — Dense real-world report states were not fully exercised** · verified-local
  Implementation: src/app/(staff)/admin/reports/page.tsx; src/components/AdminReportView.tsx; src/app/(staff)/admin/reports/exports/page.tsx; src/app/(staff)/admin/reports/history/page.tsx; src/components/AdminRefresh.tsx.
  Verification: Report browser suite: export lifetime, authorized session, saved history, permission removal, dates and trends; desktop fold and route/theme checks.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: All observations and failure recovery remain usable without horizontal page overflow or ambiguous missing values.

## OPS

- [ ] **OPS-01 — No jobs is not the same as a healthy system** · verified-local
  Implementation: src/app/(staff)/admin/operations/page.tsx; src/app/(staff)/admin/operations/alerts/page.tsx; src/app/(staff)/admin/audit/page.tsx; src/components/AdminRefresh.tsx.
  Verification: Operational-alert browser suite; worker/monitor integration tests and heartbeat/notice/audit source review.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: Operators can distinguish idle healthy processing from no worker evidence.
- [ ] **OPS-02 — Acknowledgment is easy to confuse with resolution** · verified-local
  Implementation: src/app/(staff)/admin/operations/page.tsx; src/app/(staff)/admin/operations/alerts/page.tsx; src/app/(staff)/admin/audit/page.tsx; src/components/AdminRefresh.tsx.
  Verification: Operational-alert browser suite; worker/monitor integration tests and heartbeat/notice/audit source review.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: Acknowledgment never looks like successful recovery or disappears from the operator’s unresolved-work view.
- [ ] **OPS-03 — Alert notification history is capped without paging** · verified-local
  Implementation: src/app/(staff)/admin/operations/page.tsx; src/app/(staff)/admin/operations/alerts/page.tsx; src/app/(staff)/admin/audit/page.tsx; src/components/AdminRefresh.tsx.
  Verification: Operational-alert browser suite; worker/monitor integration tests and heartbeat/notice/audit source review.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: An operator can review older attempts for a still-relevant incident.
- [ ] **OPS-04 — Audit action names are machine-oriented** · verified-local
  Implementation: src/app/(staff)/admin/operations/page.tsx; src/app/(staff)/admin/operations/alerts/page.tsx; src/app/(staff)/admin/audit/page.tsx; src/components/AdminRefresh.tsx.
  Verification: Operational-alert browser suite; worker/monitor integration tests and heartbeat/notice/audit source review.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: Operators can describe what changed without interpreting dotted action names or raw JSON.
- [ ] **OPS-05 — Audit date filters and event times use different frames** · verified-local
  Implementation: src/app/(staff)/admin/operations/page.tsx; src/app/(staff)/admin/operations/alerts/page.tsx; src/app/(staff)/admin/audit/page.tsx; src/components/AdminRefresh.tsx.
  Verification: Operational-alert browser suite; worker/monitor integration tests and heartbeat/notice/audit source review.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: Events near midnight are understandable within the selected date range.

## STAFF

- [ ] **STAFF-01 — Permission review is a long capability inventory** · verified-local
  Implementation: src/app/(staff)/admin/team/page.tsx; src/components/StaffAccessForm.tsx; src/components/AdminMfaPanel.tsx; src/app/(staff)/account/admin-mfa/page.tsx; src/app/staff/accept/page.tsx.
  Verification: Staff onboarding/permissions browser suites; MFA clipboard failure, storage acknowledgment, enrollment and one-time recovery browser tests.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: An owner can explain a proposed staff member’s effective responsibilities before saving.
- [ ] **STAFF-02 — Owner promotion can disappear without an adjacent explanation** · verified-local
  Implementation: src/app/(staff)/admin/team/page.tsx; src/components/StaffAccessForm.tsx; src/components/AdminMfaPanel.tsx; src/app/(staff)/account/admin-mfa/page.tsx; src/app/staff/accept/page.tsx.
  Verification: Staff onboarding/permissions browser suites; MFA clipboard failure, storage acknowledgment, enrollment and one-time recovery browser tests.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: The owner can discover the required next step without assuming the role does not exist.
- [ ] **STAFF-03 — Copy recovery codes has no failure handling** · verified-local
  Implementation: src/app/(staff)/admin/team/page.tsx; src/components/StaffAccessForm.tsx; src/components/AdminMfaPanel.tsx; src/app/(staff)/account/admin-mfa/page.tsx; src/app/staff/accept/page.tsx.
  Verification: Staff onboarding/permissions browser suites; MFA clipboard failure, storage acknowledgment, enrollment and one-time recovery browser tests.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: Clipboard denial leaves the recovery codes visible with clear instructions rather than an unhandled failure.
- [ ] **STAFF-04 — Continuing after enrollment does not confirm code storage** · verified-local
  Implementation: src/app/(staff)/admin/team/page.tsx; src/components/StaffAccessForm.tsx; src/components/AdminMfaPanel.tsx; src/app/(staff)/account/admin-mfa/page.tsx; src/app/staff/accept/page.tsx.
  Verification: Staff onboarding/permissions browser suites; MFA clipboard failure, storage acknowledgment, enrollment and one-time recovery browser tests.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: A new staff member understands codes are one-time recovery material before leaving the screen.
- [ ] **STAFF-05 — MFA and staff invitation completion need dedicated qualification** · verified-local
  Implementation: src/app/(staff)/admin/team/page.tsx; src/components/StaffAccessForm.tsx; src/components/AdminMfaPanel.tsx; src/app/(staff)/account/admin-mfa/page.tsx; src/app/staff/accept/page.tsx.
  Verification: Staff onboarding/permissions browser suites; MFA clipboard failure, storage acknowledgment, enrollment and one-time recovery browser tests.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: Enrollment, recovery, expiry and permission removal are verified before administrative readiness signoff.

## RECOVER

- [ ] **RECOVER-01 — Public error recovery points to authenticated destinations** · verified-local
  Implementation: src/app/error.tsx; src/app/not-found.tsx; src/app/offline/page.tsx; src/components/AppShell.tsx; docs/MANUAL_DEVICE_QUALIFICATION.md.
  Verification: Three-engine route/a11y scan, public 404 and error recovery/source review; manual qualification remains open.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: A public broken link does not require signing in just to recover or ask for help.
- [ ] **RECOVER-02 — Customer routes have no loading.tsx boundaries** · verified-local
  Implementation: src/app/error.tsx; src/app/not-found.tsx; src/app/offline/page.tsx; src/components/AppShell.tsx; docs/MANUAL_DEVICE_QUALIFICATION.md.
  Verification: Three-engine route/a11y scan, public 404 and error recovery/source review; manual qualification remains open.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: A throttled navigation communicates its destination and loading state without appearing inert.
- [ ] **RECOVER-03 — Authenticated shell lacks the public skip link** · verified-local
  Implementation: src/app/error.tsx; src/app/not-found.tsx; src/app/offline/page.tsx; src/components/AppShell.tsx; docs/MANUAL_DEVICE_QUALIFICATION.md.
  Verification: Three-engine route/a11y scan, public 404 and error recovery/source review; manual qualification remains open.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: Keyboard users can bypass repeated workspace navigation in one step.
- [ ] **RECOVER-04 — Offline copy does not distinguish saved from unsaved work** · verified-local
  Implementation: src/app/error.tsx; src/app/not-found.tsx; src/app/offline/page.tsx; src/components/AppShell.tsx; docs/MANUAL_DEVICE_QUALIFICATION.md.
  Verification: Three-engine route/a11y scan, public 404 and error recovery/source review; manual qualification remains open.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: Losing connectivity does not cause users to infer that an unsaved form has been stored.
- [ ] **RECOVER-05 — Automated accessibility success is not full product qualification** · awaiting-qualification
  Implementation: src/app/error.tsx; src/app/not-found.tsx; src/app/offline/page.tsx; src/components/AppShell.tsx; docs/MANUAL_DEVICE_QUALIFICATION.md.
  Verification: Three-engine route/a11y scan, public 404 and error recovery/source review; manual qualification remains open.; Current evidence and limits: docs/UI_UX_IMPLEMENTATION_2026-09-18.md.
  Acceptance: Record keyboard, screen-reader, zoom, interruption and physical-device results; resolve blockers before unrestricted launch.
