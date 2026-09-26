# Jump in the Mix — UI/UX product-readiness audit

**Audit date:** September 18, 2026. **Status:** audit complete; readiness signoff withheld pending repairs and qualification. No product repairs or deployments were made.

[Open the filterable findings board](ui-ux-audit-2026-09-18/index.html) · [CSV backlog](ui-ux-audit-2026-09-18/findings.csv) · [Structured findings](ui-ux-audit-2026-09-18/findings.json) · [Coverage totals](ui-ux-audit-2026-09-18/coverage.json)

## Decision

The core daily workflow still has correctness and recovery problems that should be fixed before broad release. Contact drafts can be lost, one duplicate-merge choice is broken, a template audience preview overcounts people, and onboarding can claim a follow-up is ready without a usable recipient. Source review also found a timezone-date defect, missing Mix draft protection and silent import-status failure paths.

There are **184 findings across 36 major areas, with 5–7 findings per area**. These are not 184 proven bugs: **10 are browser-reproduced defects or conditions, 65 are source-confirmed findings, 94 are design recommendations, and 15 are validation gaps**. Similar pages are grouped where they share implementation. The five profession pages each inherit their group’s five findings; minor route variants are mapped rather than padded with invented unique defects.

**13 P1 items:** eight reproduced/source-supported blockers and five uncompleted release-qualification gates. **169 P2 items:** ordinary usability, accessibility, recovery and evaluation work. **Two P3 items:** lower-impact polish. Priorities are proposed product risk judgments, not measured customer incidence. A heuristic marked P2 is a candidate to validate, not automatically a release blocker.

## Evidence and limits

- **Production:** anonymous public pages at https://jumpinthemix.com/; 24 route variants inspected at 1440 and 390 pixels, producing 48 scan records. Public forms were not submitted to the real service.
- **Authenticated app:** isolated local database and synthetic member/admin data, using the working tree based on commit `e1c7b5b`, including pre-existing uncommitted changes. Thirty member route variants and 21 admin variants at two widths produced 102 retained scan records. These observations are not a claim about the deployed authenticated build.
- **Additional states:** 22 scans cover onboarding, template audience review, populated journey, support details, hosted lead/review pages and selected 320-pixel dark-mode screens. Six separately recorded interaction traces supplement the main scans. There are 178 retained screenshots in total.
- **Accessibility/layout:** all 172 retained main/supplement scan states returned zero axe violations for the configured WCAG 2 A/AA, 2.1 AA and 2.2 AA rule tags, and no page-level horizontal overflow. This does not prove WCAG conformance, correct focus behavior, accessible dynamic states or absence of clipped content within a scrollable region.
- **Runtime:** the main sweep recorded no uncaught page errors. The intentionally missing public route returned the expected 404. Error-free page loading did not prevent the interaction defects below.
- **Regression verification:** eight selected Vitest files / 45 tests passed. See [exact command and result](ui-ux-audit-2026-09-18/test-results.txt). This was not a full suite or production-build qualification. No code was changed to make tests pass.
- **Safety of the fixture:** mail/SMS dispatch and push delivery were disabled, and synthetic admin screen review used MFA-disabled local access. No customer records, messages or production configuration were changed. MFA secrets and recovery screens were excluded from retained evidence.
- **Not established:** physical iPhone/Android behavior, Safari/Firefox, actual notification/message receipt, staff authenticator completion, real OAuth/invitation mailboxes, full screen-reader/keyboard/zoom qualification, large-account performance, customer comprehension or conversion. Empty local provider queues do not demonstrate production health. The local development server is not a valid production performance benchmark.

Browser observations and source-supported implementation statements apply to this snapshot. Some visible behaviors are intentional product choices; the recommended alternatives need product judgment. A screenshot is representative context, and does not by itself prove every source or heuristic finding attached to that area.

## Evidence labels

| Label | Meaning | How to use it |
| --- | --- | --- |
| R | Reproduced in browser | Recreate the stated condition; compare against the acceptance check. Includes observed behavior that needs a product decision. |
| C | Confirmed in source | The implementation statement was inspected; run the specified edge case before and after repairing it. Customer impact has not necessarily been measured. |
| H | Heuristic recommendation | Expert design judgment to test or prioritize; not a proven customer failure. |
| V | Validation gap | Missing qualification evidence, not evidence that a feature is broken. |

## Repair sequence

1. **Correctness and recoverable work:** repair CLEAN-01, EDIT-01/02, LIB-01, ONB-01/02, IMPORT-01 and MIX-01. Add narrow regressions around the real failure conditions. Confirm recipient counts against the actual distinct eligible audience; do not assume preview errors imply duplicate delivery.
2. **Complete release qualification:** close SEND-05, NOTIFY-05, EMAIL-05, STAFF-05 and RECOVER-05 using controlled staging recipients and physical devices. If a staging deployment is needed, project policy requires explicit test site ID `8fd20ccd-5c35-47e5-99ce-98e5670d52fe` published at https://jump-in-the-mix-test.netlify.app/. No staging deployment was performed for this audit.
3. **One coherent first-use journey:** reconcile demo behavior and checked roadmap criteria, preserve profession/example context, shorten onboarding, preview the assigned starter and defer referrals until the first useful follow-up. Use the existing homepage roadmap’s sequence and acceptance criteria; record discrepancies instead of rewriting history.
4. **Shared interaction patterns:** pending/error/saved/dirty states; field-error associations; empty/filter/loading states; reliable local date formatting; clearer manual-versus-automatic action language. Fix shared components once, then verify affected routes.
5. **Operational and task research:** triage the remaining page-specific P2 items with the responsible owners. Test the highest-risk tasks with real users from the intended professions. Record measured results separately from the fictional ICP planning hypotheses.

### P1 triage

| ID | Evidence | Item | Acceptance |
| --- | --- | --- | --- |
| [ONB-01](#onb-01) | R | Success is announced for a person who cannot be reached | A ready-to-send success state has a usable recipient; incomplete records receive an honest next step. |
| [ONB-02](#onb-02) | C | Default date uses UTC instead of the account timezone | At 01:00 UTC, a Los Angeles user receives the preceding local date; test both sides of midnight. |
| [SEND-05](#send-05) | V | Real external-app handoffs remain a release gate | Record successful and canceled handoffs on supported iPhone/Android combinations before public readiness signoff. |
| [EDIT-01](#edit-01) | R | A recoverable validation error clears the draft | An invalid phone can be corrected with every other entered value intact. |
| [EDIT-02](#edit-02) | R | Leaving an edited contact loses unsaved work without warning | Accidental navigation does not silently discard contact edits. |
| [IMPORT-01](#import-01) | C | Import polling can fail silently | Offline and 401/500 polling failures visibly change state without losing the batch identity. |
| [CLEAN-01](#clean-01) | R | Keeping the second duplicate always fails | Both survivor choices merge successfully and retain the intended record. |
| [LIB-01](#lib-01) | R | Audience preview double-counts overlapping tags | One person in two selected tags counts once in both preview and activation. |
| [MIX-01](#mix-01) | C | A long custom plan has no unsaved-draft protection | Leaving or reloading a modified multi-beat plan cannot silently discard all work. |
| [NOTIFY-05](#notify-05) | V | Reminder delivery and timing need real-channel evidence | Document actual delivered reminders and accurate failure feedback before declaring these functions ready. |
| [EMAIL-05](#email-05) | V | Real delivery recovery remains unverified here | The UI’s delivery statements match provider records and safe retry outcomes. |
| [STAFF-05](#staff-05) | V | MFA and staff invitation completion need dedicated qualification | Enrollment, recovery, expiry and permission removal are verified before administrative readiness signoff. |
| [RECOVER-05](#recover-05) | V | Automated accessibility success is not full product qualification | Record keyboard, screen-reader, zoom, interruption and physical-device results; resolve blockers before unrestricted launch. |

## Reproduction notes

These steps use disposable fixtures for authenticated mutations. They should not be run against customer records.

### CLEAN-01: Keep the second duplicate

**Steps:** Create two local contacts with one shared email. Open Contacts → More tools → Duplicates. Choose the second record as survivor and confirm the merge.

**Observed:** The request is rejected with “Choose two different Contacts and select the survivor.” The submitted hidden source ID equals the selected survivor ID. [Screenshot](ui-ux-audit-2026-09-18/duplicate-second-survivor-fails.png).

### EDIT-01: Correct a new contact’s invalid phone

**Steps:** Open /contacts/new. Enter a name and not-a-phone in the phone field. Save.

**Observed:** “Invalid phone number” appears, but the entered name and phone are cleared. [Screenshot](ui-ux-audit-2026-09-18/contact-error-draft-loss.png).

### EDIT-02: Navigate away from an unsaved contact edit

**Steps:** Open an existing contact’s Edit page. Change the first name. Click Back to Contact, then reopen Edit.

**Observed:** No discard confirmation appeared; the unsaved change was lost. [Screenshot](ui-ux-audit-2026-09-18/contact-navigation-draft-loss.png).

### LIB-01: Preview overlapping audiences

**Steps:** Create one contact with both Estimates and Referrals tags. Open the two-beat relationship template. Select both tags and inspect the audience summary.

**Observed:** Summary shows 2 people and 4 scheduled follow-ups although there is only one distinct person. This establishes a preview/count defect; duplicate actual sending was not established. [Screenshot](ui-ux-audit-2026-09-18/template-double-audience.png).

### ONB-01: Finish onboarding with no usable contact method

**Steps:** Using a new local account, enter a first contact’s name but neither phone nor email. Complete the remaining required setup.

**Observed:** Welcome says the first follow-up is ready, while that follow-up requires Add phone before it can be used. [Screenshot](ui-ux-audit-2026-09-18/onboarding-no-method-result.png).

### DEMO-01: Switch demo examples after editing

**Steps:** On the public demo, replace the Lead message with distinct text. Select Quote, then Lead again.

**Observed:** The prepared original message returns; the edit is lost. [Screenshot](ui-ux-audit-2026-09-18/demo-switch-loses-edit.png).

### LIB-02: Save a template without choosing people

**Steps:** Open a template’s use screen. Choose Keep as a draft and leave the audience empty.

**Observed:** Create my remix remains disabled. [Screenshot](ui-ux-audit-2026-09-18/template-draft-requires-audience.png).

### REVIEW-01: Compare low-score review follow-on choices

**Steps:** Open a synthetic public review request. Submit 2/5. Compare the receipt with the component’s happy-outcome branch.

**Observed:** Low-score receipt offers private acknowledgement only; public review/referral links are only rendered for the happy outcome. This is a UX finding, not a platform-policy ruling. [Screenshot](ui-ux-audit-2026-09-18/review-low-score-receipt.png).

### NOTIFY-01: Inspect the combined unavailable-channel state

**Steps:** In a local fixture with email and push deliberately disabled, open Settings → Notifications.

**Observed:** Email fallback says push can be used; the push section says Web Push is not configured. This does not establish a production delivery outage. [Screenshot](ui-ux-audit-2026-09-18/app-settings-notifications-390.png).

### DEMO-02: Inspect the public demo’s handoff contract

**Steps:** Inspect the demo action links and the corresponding ProductDemo handoff implementation.

**Observed:** Real sms:, mailto: and tel: targets are available, contrary to the checked sandbox criterion. No communication was sent and physical native-app launch was not exercised. [Screenshot](ui-ux-audit-2026-09-18/public-1440.png).

## Area index

| Area | Findings | Routes/functions |
| --- | ---: | --- |
| [HOME — Homepage and public navigation](#home) | 5 | `/` |
| [PRO — Profession pages — shared findings apply to all five](#pro) | 5 | `/for/real-estate-agents` · `/for/consultants` · `/for/photographers` · `/for/contractors` · `/for/independent-recruiters` |
| [DEMO — Interactive public demo](#demo) | 6 | `/#sample` · `/for/[profession]#sample` |
| [PUBLIC — Public templates, reminders, FAQ and trust pages](#public) | 5 | `/follow-up-templates` · `/follow-up-templates/estimate-follow-up` · `/follow-up-templates/proposal-follow-up` · `/features/follow-up-reminders` · `/faq` · `/contact` · `/privacy` · `/terms` |
| [WAIT — Waitlist, invitation entry and confirmation recovery](#wait) | 5 | `/waitlist` · `/waitlist/confirm` · `/waitlist/leave` · `/register` |
| [AUTH — Sign-in, password recovery and verification](#auth) | 5 | `/login` · `/forgot-password` · `/reset-password` · `/verify-email/pending` |
| [ONB — Onboarding and first useful action](#onb) | 7 | `/onboarding` · `/jumps?welcome=1` |
| [NAV — Workspace navigation, Quick Add and voice capture](#nav) | 5 | `/more` · `/settings` · `global navigation` · `Quick Add` |
| [TODAY — Today list and follow-up discovery](#today) | 5 | `/jumps` |
| [SEND — Message editing, handoff, completion and outcomes](#send) | 5 | `/jumps` · `contact communication actions` |
| [LIST — Contacts list, tags, filters and bulk actions](#list) | 5 | `/contacts` |
| [EDIT — Create and edit a contact](#edit) | 6 | `/contacts/new` · `/contacts/[contactId]/edit` |
| [DETAIL — Contact detail, relationship controls and timeline](#detail) | 5 | `/contacts/[contactId]` |
| [IMPORT — Contact import and recovery](#import) | 5 | `/contacts/import` |
| [CLEAN — Duplicates, archive and custom contact fields](#clean) | 5 | `/contacts/duplicates` · `/contacts/archived` · `/contacts/custom-fields` |
| [LIB — My Mixes, ready-made library and use-template setup](#lib) | 5 | `/mixes` · `/templates` · `/templates/[sharedMixId]/use` |
| [MIX — Mix editor, timing, sequence and activation](#mix) | 5 | `/mixes/new?custom=1` · `/mixes/[mixId]/edit` |
| [INV — Member invitations and System Mix](#inv) | 5 | `/mixes/system` |
| [JOURNEY — Customer journey and stage/rule configuration](#journey) | 5 | `/journey` · `/settings/journey` · `contact stage controls` |
| [CAL — Calendar, event editor and connected availability](#cal) | 5 | `/calendar` |
| [LEAD — Lead connections and hosted inquiry form](#lead) | 5 | `/settings/connections` · `/lead/[connectionId]` |
| [REVIEW — Private feedback, public reviews and referrals](#review) | 5 | `/review/[token]` |
| [PREF — Business profile, personal preferences and date types](#pref) | 5 | `/settings/business` · `/account/preferences` · `/settings/jump-date-types` |
| [NOTIFY — Notification preferences and automatic sending](#notify) | 5 | `/settings/notifications` · `/settings/sending` |
| [ACCOUNT — Account profile, security, export and deletion](#account) | 5 | `/account` · `/account?section=security` · `/account?section=privacy` · `/account/deleted` |
| [HELP — Help, support requests and customer conversations](#help) | 5 | `/help` · `/account/tickets` · `/account/tickets/[ticketId]` |
| [ADMINHOME — Admin overview and navigation](#adminhome) | 5 | `/admin` · `admin navigation` |
| [ADMINUSER — Admin account search and account controls](#adminuser) | 5 | `/admin/users` · `/admin/users/[userId]` |
| [ADMINSUP — Admin support queue and case work](#adminsup) | 5 | `/admin/support` · `/admin/support/[ticketId]` |
| [ACCESS — Admin waitlist, invitations and admission](#access) | 5 | `/admin/waitlist` · `/admin/access` · `/admin/access/[inviteId]` · `/admin/admission` |
| [ADMINLIB — Admin library drafts, invitation wording and library options](#adminlib) | 5 | `/admin/templates` · `/admin/templates/new` · `/admin/templates/[sharedMixId]/edit` · `/admin/system-mix` · `/admin/settings` |
| [EMAIL — Admin email, delivery recovery and recipient suppression](#email) | 5 | `/admin/email` · `/admin/email/recovery` · `/admin/email/recovery/[deliveryId]` · `/admin/email/suppressions` · `/admin/email/suppressions/[suppressionId]` |
| [REPORT — Admin reports, export jobs and saved observations](#report) | 5 | `/admin/reports` · `/admin/reports/exports` · `/admin/reports/history` · `/admin/reports/history/[snapshotId]` |
| [OPS — Admin operations, alerts and audit investigation](#ops) | 5 | `/admin/operations` · `/admin/operations/alerts` · `/admin/audit` |
| [STAFF — Admin team permissions, staff onboarding and MFA](#staff) | 5 | `/admin/team` · `/staff/accept` · `/account/admin-mfa` |
| [RECOVER — Cross-app recovery, accessibility and browser behavior](#recover) | 5 | `/offline` · `not-found` · `error boundary` · `all customer forms and navigation` |

## Detailed findings

Each finding includes a proposed correction and a concrete acceptance check. All remain open at the end of this audit.

<a id="home"></a>

### HOME — Homepage and public navigation

**Routes/functions:** `/`

**Reviewed source:** [page.tsx](<../src/app/page.tsx>), [PublicHeader.tsx](<../src/components/PublicHeader.tsx>), [ProfessionMarks.tsx](<../src/components/ProfessionMarks.tsx>)

[Representative screenshot](ui-ux-audit-2026-09-18/public-390.png)

<a id="home-01"></a>

#### HOME-01 · P2 · Heuristic recommendation — First useful demo action is below the first phone screen

**Finding:** At 390×844 the initial viewport ends in the demo contact header; the draft and its actions are further down.

**Recommended change:** Shorten the mobile introduction or make Try the demo land on the first editable action.

**Acceptance:** A new visitor reaches a draft with one deliberate tap without hunting through contact fields.

<a id="home-02"></a>

#### HOME-02 · P2 · Heuristic recommendation — Two acquisition tasks compete for attention

**Finding:** The header, hero and demo repeat waitlist actions while the product asks the visitor to try an example.

**Recommended change:** Choose a primary action for each stage and use a clear progression from example to access request.

**Acceptance:** In a moderated task, visitors can explain what each action does before choosing it.

<a id="home-03"></a>

#### HOME-03 · P2 · Confirmed in source — Useful navigation disappears on phones

**Finding:** PublicHeader hides Templates/Questions section links on narrow screens and relies on the footer.

**Recommended change:** Provide a compact public menu or a visible secondary navigation row.

**Acceptance:** Templates and Questions remain reachable near the top at 320 and 390 pixels.

<a id="home-04"></a>

#### HOME-04 · P2 · Heuristic recommendation — Free access is explained late

**Finding:** The free-account/no-card explanation is in the closing waitlist section, away from the first signup actions.

**Recommended change:** Place concise, verified access and price expectations next to the initial waitlist CTA.

**Acceptance:** Users understand that a request joins a queue rather than opens an account immediately.

<a id="home-05"></a>

#### HOME-05 · P2 · Validation gap — The roadmap is not current launch evidence

**Finding:** The roadmap contains checked sandbox and continuity criteria that conflict with current source and live behavior. No customer-comprehension study was run in this audit.

**Recommended change:** Reconcile checked items against this build and run the supplied research protocol with actual target users.

**Acceptance:** Every completed roadmap item links to current evidence; research results are separated from planning hypotheses.

<a id="pro"></a>

### PRO — Profession pages — shared findings apply to all five

**Routes/functions:** `/for/real-estate-agents`, `/for/consultants`, `/for/photographers`, `/for/contractors`, `/for/independent-recruiters`

**Reviewed source:** [page.tsx](<../src/app/for/[profession]/page.tsx>), [persona-mixes.ts](<../src/lib/persona-mixes.ts>), [PublicHeader.tsx](<../src/components/PublicHeader.tsx>)

[Representative screenshot](ui-ux-audit-2026-09-18/public-for-consultants-1440.png)

<a id="pro-01"></a>

#### PRO-01 · P2 · Confirmed in source — Primary waitlist links drop profession context

**Finding:** Hero, header and demo links go to /waitlist without a scenario. Only the embedded bottom form supplies persona.id.

**Recommended change:** Carry an allowlisted profession through every waitlist entry point.

**Acceptance:** Each page’s top, demo and bottom CTAs preserve the same intended onboarding context.

<a id="pro-02"></a>

#### PRO-02 · P2 · Confirmed in source — Selected Mix is not carried into signup

**Finding:** ProductDemo changes its own scenario state, but its waitlist link is generic and it does not dispatch the scenario event consumed by WaitlistForm.

**Recommended change:** Define a supported mapping from the chosen example to the starter and persist it at request time.

**Acceptance:** Selecting a nondefault example survives invitation redemption in a fresh browser.

<a id="pro-03"></a>

#### PRO-03 · P2 · Heuristic recommendation — The phone experience delays the professional example

**Finding:** All five reuse the long hero-before-demo stack; visitors first read positioning and selectors.

**Recommended change:** Bring the profession-specific draft or a compact preview closer to the opening claim.

**Acceptance:** A visitor can identify the example’s person, reason and next step in the first short interaction.

<a id="pro-04"></a>

#### PRO-04 · P2 · Heuristic recommendation — Tool-boundary clarification comes after the demo

**Finding:** What the app does not replace is in a lower section; visitors may assume a CRM, ATS, quoting or booking integration.

**Recommended change:** Place the most relevant limitation beside the first example, with the fuller explanation below.

**Acceptance:** A recruiter, consultant, photographer, agent or contractor can correctly describe the supported workflow.

<a id="pro-05"></a>

#### PRO-05 · P2 · Validation gap — Profession fit remains an untested hypothesis

**Finding:** The five ICPs explicitly describe fictional composites. Working pages and tailored text do not establish usefulness or conversion.

**Recommended change:** Test one real follow-up task per profession; retain observed errors and language rather than fictional quotations.

**Acceptance:** Each profession has task-completion and comprehension evidence before claims of validated fit.

<a id="demo"></a>

### DEMO — Interactive public demo

**Routes/functions:** `/#sample`, `/for/[profession]#sample`

**Reviewed source:** [ProductDemo.tsx](<../src/components/ProductDemo.tsx>), [product-demo.ts](<../src/lib/product-demo.ts>), [HOMEPAGE_EXPERIENCE_ROADMAP_2026-09-10.md](<../docs/HOMEPAGE_EXPERIENCE_ROADMAP_2026-09-10.md>)

[Representative screenshot](ui-ux-audit-2026-09-18/demo-switch-loses-edit.png)

<a id="demo-01"></a>

#### DEMO-01 · P2 · Reproduced in browser — Changing examples silently discards edited messages

**Finding:** Edited Lead to a sentinel, switched to Quote and back; the original message returned. Completion state survives, creating inconsistent persistence.

**Recommended change:** Keep each scenario’s draft in memory, or ask before discarding it.

**Acceptance:** Message, subject and planned date survive switching away and back.

<a id="demo-02"></a>

#### DEMO-02 · P2 · Reproduced in browser — A public practice session offers real communication-app handoffs

**Finding:** The live demo exposes sms/mailto/tel actions and editable recipient details; this differs from the roadmap’s sandbox contract.

**Recommended change:** Choose and document the intended contract. Prefer a fictional preview and explicit simulated result.

**Acceptance:** Demo completion never opens an external composer under a sandbox promise.

<a id="demo-03"></a>

#### DEMO-03 · P2 · Heuristic recommendation — Icon-only completion is hard to distinguish from sending

**Finding:** A checkmark sits beside the native-app action and Skip, without a persistent visible explanation of simulated completion.

**Recommended change:** Label the completion control and show a short result that explains what was recorded.

**Acceptance:** Participants distinguish opening, sending, recording and skipping without assistance.

<a id="demo-04"></a>

#### DEMO-04 · P2 · Confirmed in source — Attachment language exceeds what the demo prepares

**Finding:** The consultant proposal example says the proposal is attached, while the mailto handoff supplies subject and body only.

**Recommended change:** Remove the attachment assertion or display an explicit reminder to attach the document in the mail app.

**Acceptance:** No draft asserts an attachment is present unless the user has supplied it.

<a id="demo-05"></a>

#### DEMO-05 · P2 · Heuristic recommendation — Planned timing sounds like automatic sending

**Finding:** The date hint says the date this beat goes out, although the primary demo handoff is manual.

**Recommended change:** Use scheduled-to-appear/review wording and separate it from the user’s actual sending time.

**Acceptance:** Visitors correctly explain that selecting a date does not send a message.

<a id="demo-06"></a>

#### DEMO-06 · P3 · Confirmed in source — Reset behavior is fragmented

**Finding:** Use sample contact resets contact values; Use prepared message resets one draft; completed/skipped state has separate controls.

**Recommended change:** Provide an explicit reset-example action with a clear scope.

**Acceptance:** A visitor can return the entire current example to its initial state in one action.

<a id="public"></a>

### PUBLIC — Public templates, reminders, FAQ and trust pages

**Routes/functions:** `/follow-up-templates`, `/follow-up-templates/estimate-follow-up`, `/follow-up-templates/proposal-follow-up`, `/features/follow-up-reminders`, `/faq`, `/contact`, `/privacy`, `/terms`

**Reviewed source:** [PublicArticle.tsx](<../src/components/PublicArticle.tsx>), [page.tsx](<../src/app/faq/page.tsx>), [page.tsx](<../src/app/contact/page.tsx>), [PublicDocument.tsx](<../src/components/PublicDocument.tsx>)

[Representative screenshot](ui-ux-audit-2026-09-18/public-faq-390.png)

<a id="public-01"></a>

#### PUBLIC-01 · P2 · Heuristic recommendation — Public templates and saved Mixes have similar names

**Finding:** Public navigation says Templates, while the account library is Ready-made mixes; one is editorial content and one creates plans.

**Recommended change:** Explain the difference at the public library entry and use consistent transition labels.

**Acceptance:** Visitors know whether a CTA copies example text, previews a workflow, or requests account access.

<a id="public-02"></a>

#### PUBLIC-02 · P2 · Heuristic recommendation — Long reference pages need stronger navigation

**Finding:** FAQ and policy pages are lengthy reading tasks; the main acquisition/navigation actions do not help locate a specific topic.

**Recommended change:** Add a concise contents list and stable anchors for account access, data, sending and support.

**Acceptance:** A user reaches a named topic without scanning the whole document on a phone.

<a id="public-03"></a>

#### PUBLIC-03 · P2 · Heuristic recommendation — Recovery help is disconnected from failed actions

**Finding:** The public contact page exists, but several auth errors refer to the site operator without linking to it.

**Recommended change:** Reuse a public support link and a concise recovery explanation in error states.

**Acceptance:** A signed-out user can reach working support directly from every account-recovery failure.

<a id="public-04"></a>

#### PUBLIC-04 · P2 · Heuristic recommendation — Educational claims lack a visible capability summary

**Finding:** Manual sending, optional automatic delivery, reminders and external apps are explained in separate places.

**Recommended change:** Add a short shared capability summary with links to deeper explanations.

**Acceptance:** The template, reminder and FAQ pages describe the same current sending contract.

<a id="public-05"></a>

#### PUBLIC-05 · P2 · Validation gap — Trust content needs an owner-led factual review

**Finding:** This audit inspected presentation and current copy, not the legal adequacy or completeness of policies.

**Recommended change:** Have the responsible owner reconcile policies with actual retention, support and provider behavior.

**Acceptance:** Record a dated content review and resolve any mismatched product claims before broad release.

<a id="wait"></a>

### WAIT — Waitlist, invitation entry and confirmation recovery

**Routes/functions:** `/waitlist`, `/waitlist/confirm`, `/waitlist/leave`, `/register`

**Reviewed source:** [WaitlistForm.tsx](<../src/components/WaitlistForm.tsx>), [page.tsx](<../src/app/waitlist/page.tsx>), [page.tsx](<../src/app/register/page.tsx>)

[Representative screenshot](ui-ux-audit-2026-09-18/public-waitlist-390.png)

<a id="wait-01"></a>

#### WAIT-01 · P2 · Heuristic recommendation — Joining and confirming are not explained before submission

**Finding:** The opening promise emphasizes being emailed when it is the user’s turn; confirmation is chiefly explained in the receipt.

**Recommended change:** Show a brief request → confirm email → await invitation sequence.

**Acceptance:** A first-time visitor knows to look for and act on the confirmation email.

<a id="wait-02"></a>

#### WAIT-02 · P2 · Confirmed in source — Submitted form retains the initial action label

**Finding:** WaitlistForm shows a submitted message but continues to render Join the waitlist rather than an explicit resend/change-address state.

**Recommended change:** Make next actions explicit while preserving the generic, non-enumerating receipt.

**Acceptance:** Repeat submissions clearly distinguish changing an address from requesting another confirmation.

<a id="wait-03"></a>

#### WAIT-03 · P2 · Confirmed in source — Error text is not associated with the email control

**Finding:** The input gets aria-invalid, but the error paragraph has no ID referenced by aria-describedby or aria-errormessage.

**Recommended change:** Associate validation text with its field and focus an actionable error summary when needed.

**Acceptance:** A screen-reader user hears the specific error when returning to the email field.

<a id="wait-04"></a>

#### WAIT-04 · P2 · Heuristic recommendation — Unavailable invitations have a broad fallback

**Finding:** Invalid, revoked and used links share a message and waitlist CTA. A legitimate invited person can mistake this for a need to restart access.

**Recommended change:** Keep the privacy-safe response but add clear sign-in and request-help choices.

**Acceptance:** A user with a previously used link can recover without mistakenly joining the queue again.

<a id="wait-05"></a>

#### WAIT-05 · P2 · Heuristic recommendation — Temporary pauses have weak recovery expectations

**Finding:** Paused signup asks users to reopen the same link later, without a support route or a specific way to check availability.

**Recommended change:** Explain which step is paused and link to public help; avoid invented reopening dates.

**Acceptance:** The user knows the link remains usable and has a useful action during the pause.

<a id="auth"></a>

### AUTH — Sign-in, password recovery and verification

**Routes/functions:** `/login`, `/forgot-password`, `/reset-password`, `/verify-email/pending`

**Reviewed source:** [page.tsx](<../src/app/login/page.tsx>), [page.tsx](<../src/app/forgot-password/page.tsx>), [page.tsx](<../src/app/reset-password/page.tsx>), [page.tsx](<../src/app/verify-email/pending/page.tsx>), [auth-actions.ts](<../src/lib/auth-actions.ts>)

[Representative screenshot](ui-ux-audit-2026-09-18/public-login-390.png)

<a id="auth-01"></a>

#### AUTH-01 · P2 · Confirmed in source — Password fields have no visibility toggle

**Finding:** Sign-in, registration and reset render password inputs without a reveal control.

**Recommended change:** Add accessible show/hide controls without changing password-manager support.

**Acceptance:** Users can inspect and correct a long password on mobile and with a keyboard.

<a id="auth-02"></a>

#### AUTH-02 · P2 · Confirmed in source — Authentication submits lack pending feedback

**Finding:** These server-action forms use ordinary submit buttons without a pending label or disabled state.

**Recommended change:** Use the existing FormSubmitButton pattern on authentication actions.

**Acceptance:** Slow requests visibly enter a pending state and cannot be accidentally resubmitted.

<a id="auth-03"></a>

#### AUTH-03 · P2 · Confirmed in source — Validation returns page-level errors

**Finding:** Errors are passed in redirects and displayed above the form; fields lack error associations and nonsecret values are not consistently restored.

**Recommended change:** Preserve name/email and associate specific errors, while clearing sensitive passwords deliberately.

**Acceptance:** A failed signup or reset can be corrected without re-entering unrelated nonsecret information.

<a id="auth-04"></a>

#### AUTH-04 · P2 · Heuristic recommendation — Recovery copy exposes implementation language

**Finding:** Forgot password explains account-enumeration behavior and refers to an installation/site operator.

**Recommended change:** Use simple recovery instructions with a public contact link; retain the security behavior in code.

**Acceptance:** A customer can understand the next step without knowing how the site is hosted.

<a id="auth-05"></a>

#### AUTH-05 · P2 · Confirmed in source — Protected destination is lost after sign-in

**Finding:** loginAction chooses Today or onboarding through accountHome rather than retaining the originally requested customer route.

**Recommended change:** Carry a validated same-origin return path through sign-in.

**Acceptance:** Following a contact or support-ticket link while signed out returns to that item after authentication.

<a id="onb"></a>

### ONB — Onboarding and first useful action

**Routes/functions:** `/onboarding`, `/jumps?welcome=1`

**Reviewed source:** [OnboardingForm.tsx](<../src/components/OnboardingForm.tsx>), [page.tsx](<../src/app/onboarding/page.tsx>), [onboarding-actions.ts](<../src/lib/onboarding-actions.ts>), [page.tsx](<../src/app/(app)/jumps/page.tsx>)

[Representative screenshot](ui-ux-audit-2026-09-18/onboarding-390.png)

<a id="onb-01"></a>

#### ONB-01 · P1 · Reproduced in browser — Success is announced for a person who cannot be reached

**Finding:** Submitted a name without phone/email. The next screen said the first follow-up was ready, but its primary action was Add phone.

**Recommended change:** Require a method appropriate to the selected first beat, or explicitly offer a notes-only setup with accurate success copy.

**Acceptance:** A ready-to-send success state has a usable recipient; incomplete records receive an honest next step.

<a id="onb-02"></a>

#### ONB-02 · P1 · Confirmed in source — Default date uses UTC instead of the account timezone

**Finding:** onboarding/page.tsx sets today with toISOString().slice(0,10), while follow-ups use the selected local timezone. Near UTC midnight these are different dates.

**Recommended change:** Derive the initial logical date in the user’s selected timezone.

**Acceptance:** At 01:00 UTC, a Los Angeles user receives the preceding local date; test both sides of midnight.

<a id="onb-03"></a>

#### ONB-03 · P2 · Heuristic recommendation — The one-person start is a long setup form

**Finding:** The 390-pixel page measured 2,768 pixels high and contains four sections before the first result.

**Recommended change:** Reduce the initial path to person, relevant context and timing; defer optional business configuration.

**Acceptance:** A novice completes the first useful follow-up with minimal scrolling and can skip optional setup visibly.

<a id="onb-04"></a>

#### ONB-04 · P2 · Confirmed in source — Business name remains required on the default path

**Finding:** Business is preselected, and businessName is required before a first follow-up can be prepared.

**Recommended change:** Support a minimal first action with a personal signature and allow business details later.

**Acceptance:** A business user can prepare a personal follow-up before completing the business profile.

<a id="onb-05"></a>

#### ONB-05 · P2 · Confirmed in source — Starter assignment is not reviewable before creation

**Finding:** The form selects a reason but gives only a generic what-happens-next paragraph, rather than the actual messages, channels and dates.

**Recommended change:** Preview the chosen starter and permit change/skip before assignment.

**Acceptance:** Users see the complete first plan and explicitly accept its timing before it is created.

<a id="onb-06"></a>

#### ONB-06 · P2 · Heuristic recommendation — Referrals interrupt the first-success screen

**Finding:** The welcome screen places Prepare invitations above Today and the first customer follow-up.

**Recommended change:** Prioritize completing the requested follow-up; offer invitations after that useful action.

**Acceptance:** The first screen after setup makes the chosen person’s next action visually primary.

<a id="onb-07"></a>

#### ONB-07 · P2 · Confirmed in source — Import requires cross-tab coordination

**Finding:** Onboarding opens import in a new tab and asks the user to return and press Refresh imported contacts.

**Recommended change:** Use a clear return-to-setup link and refresh the saved-contact choices on return.

**Acceptance:** A successful import yields a selectable person without guessing which tab or refresh control to use.

<a id="nav"></a>

### NAV — Workspace navigation, Quick Add and voice capture

**Routes/functions:** `/more`, `/settings`, `global navigation`, `Quick Add`

**Reviewed source:** [AppShell.tsx](<../src/components/AppShell.tsx>), [Nav.tsx](<../src/components/Nav.tsx>), [QuickAdd.tsx](<../src/components/QuickAdd.tsx>), [NewContactForm.tsx](<../src/components/NewContactForm.tsx>), [VoiceNoteButton.tsx](<../src/components/VoiceNoteButton.tsx>)

[Representative screenshot](ui-ux-audit-2026-09-18/app-more-390.png)

<a id="nav-01"></a>

#### NAV-01 · P2 · Heuristic recommendation — Calendar and journey are several steps from daily work

**Finding:** Primary navigation is Today, Contacts, Mixes and More; calendar/journey are secondary destinations.

**Recommended change:** Test a task-based shortcut or configurable frequent destinations.

**Acceptance:** Regular users reach their frequent scheduling and relationship tasks predictably from any page.

<a id="nav-02"></a>

#### NAV-02 · P2 · Confirmed in source — Journey highlights a different parent than its entry point

**Finding:** More links to Customer journey, but Nav marks Contacts active on /journey.

**Recommended change:** Use consistent navigation ancestry or show an explicit relationship between the destinations.

**Acceptance:** Entering journey from More does not unexpectedly change the perceived navigation section.

<a id="nav-03"></a>

#### NAV-03 · P2 · Heuristic recommendation — Several More labels describe unrelated tasks together

**Finding:** More, Settings, Profile and My Account overlap in where people expect to find preferences and security.

**Recommended change:** Use a single task taxonomy and consistent labels across desktop and mobile.

**Acceptance:** Users find timezone, notifications and sign-out without opening multiple menus.

<a id="nav-04"></a>

#### NAV-04 · P2 · Confirmed in source — Quick Add transfer is temporary and lost on reload

**Finding:** NewContactForm consumes a capture draft once and explicitly warns that reload clears it.

**Recommended change:** Offer a recoverable account-scoped draft or an explicit save-draft step, subject to existing privacy boundaries.

**Acceptance:** A routine refresh during review does not erase a captured note unexpectedly.

<a id="nav-05"></a>

#### NAV-05 · P2 · Validation gap — Voice and native contact capture need device qualification

**Finding:** The audit used Chromium and synthetic fixtures; it did not exercise real microphones or the physical contact picker.

**Recommended change:** Run the existing physical-device protocol for permission denial, interruption, language and unsupported-browser fallback.

**Acceptance:** Record actual iPhone/Android outcomes, including recovery without losing typed text.

<a id="today"></a>

### TODAY — Today list and follow-up discovery

**Routes/functions:** `/jumps`

**Reviewed source:** [page.tsx](<../src/app/(app)/jumps/page.tsx>), [TodayNavigation.tsx](<../src/components/TodayNavigation.tsx>), [TodayBriefing.tsx](<../src/components/TodayBriefing.tsx>)

[Representative screenshot](ui-ux-audit-2026-09-18/app-jumps-390.png)

<a id="today-01"></a>

#### TODAY-01 · P2 · Confirmed in source — Today has no person or message search

**Finding:** Filters cover dates, status and method, but the list has no search field.

**Recommended change:** Add scoped person/Mix search that preserves filter and pagination context.

**Acceptance:** A user can find a named person’s due beat without paging through unrelated follow-ups.

<a id="today-02"></a>

#### TODAY-02 · P2 · Heuristic recommendation — Repeated plan and reason text adds noise

**Finding:** Seeded cards display combinations such as Estimate follow-up · Estimate follow-up.

**Recommended change:** Deduplicate repeated labels and prioritize the reason that adds context.

**Acceptance:** A card’s secondary text adds new information instead of repeating its title.

<a id="today-03"></a>

#### TODAY-03 · P2 · Heuristic recommendation — One expanded card consumes most of a phone screen

**Finding:** At 390×844, the first draft and its controls dominate the viewport and the next person is mostly below the bottom navigation.

**Recommended change:** Provide a compact scan mode while retaining a clear focused-work mode.

**Acceptance:** Users can review several upcoming people quickly and deliberately expand one draft.

<a id="today-04"></a>

#### TODAY-04 · P2 · Heuristic recommendation — Overdue work has weak prioritization controls

**Finding:** The list identifies overdue items but filters do not expose relationship priority or an agreed-next-step view.

**Recommended change:** Offer a clear overdue/priority view based on existing contact state.

**Acceptance:** Users with a backlog can identify urgent commitments without opening every contact.

<a id="today-05"></a>

#### TODAY-05 · P2 · Heuristic recommendation — Caught-up state favors adding people

**Finding:** The unfiltered empty state links to Add a person even if the account already has contacts and future work.

**Recommended change:** Offer review-upcoming and schedule-existing-contact actions alongside adding someone new.

**Acceptance:** Both an empty account and a caught-up account receive an appropriate next step.

<a id="send"></a>

### SEND — Message editing, handoff, completion and outcomes

**Routes/functions:** `/jumps`, `contact communication actions`

**Reviewed source:** [EditableFollowUpAction.tsx](<../src/components/EditableFollowUpAction.tsx>), [JumpWorkflow.tsx](<../src/components/JumpWorkflow.tsx>), [JumpActionControls.tsx](<../src/components/JumpActionControls.tsx>)

[Representative screenshot](ui-ux-audit-2026-09-18/app-jumps-390.png)

<a id="send-01"></a>

#### SEND-01 · P2 · Heuristic recommendation — Open, send and complete remain separate mental steps

**Finding:** The app opens a native composer, while Done records user-reported completion. The small control cluster can obscure that difference.

**Recommended change:** Use clear visible labels and a concise return prompt that describes the recorded action.

**Acceptance:** Users do not interpret opening the composer as proof a message was sent.

<a id="send-02"></a>

#### SEND-02 · P2 · Heuristic recommendation — Collapsed cards still expose Done and Skip

**Finding:** A person can record completion from a collapsed card before inspecting the message or recipient.

**Recommended change:** Test a deliberate quick-complete pattern with an explicit summary and easy correction.

**Acceptance:** Users can tell which beat and recipient they are completing without opening unrelated menus.

<a id="send-03"></a>

#### SEND-03 · P2 · Heuristic recommendation — Delivery mode is not a persistent visual anchor

**Finding:** Manual review and optional automation affect behavior across the app, while daily action cards emphasize the channel.

**Recommended change:** Show a concise, state-derived manual/automatic/held indicator where the distinction affects an action.

**Acceptance:** A user can identify what will happen without opening settings.

<a id="send-04"></a>

#### SEND-04 · P2 · Heuristic recommendation — The outcome step can add repeated work

**Finding:** After a native handoff, users must return and record what happened; this is necessary but interruption-prone.

**Recommended change:** Keep the return action compact, preserve the pending attempt and make later completion discoverable.

**Acceptance:** An interrupted user can find and resolve an unrecorded handoff on returning.

<a id="send-05"></a>

#### SEND-05 · P1 · Validation gap — Real external-app handoffs remain a release gate

**Finding:** No real SMS, WhatsApp, phone or email app was opened in this audit. Emulated browser behavior cannot establish recipient/body fidelity.

**Recommended change:** Run physical-device checks with controlled recipients, including cancel, return, emoji, line breaks and long messages.

**Acceptance:** Record successful and canceled handoffs on supported iPhone/Android combinations before public readiness signoff.

<a id="list"></a>

### LIST — Contacts list, tags, filters and bulk actions

**Routes/functions:** `/contacts`

**Reviewed source:** [page.tsx](<../src/app/(app)/contacts/page.tsx>), [ContactsBulkWorkspace.tsx](<../src/components/ContactsBulkWorkspace.tsx>), [ContactSavedViewsBar.tsx](<../src/components/ContactSavedViewsBar.tsx>)

[Representative screenshot](ui-ux-audit-2026-09-18/app-contacts-390.png)

<a id="list-01"></a>

#### LIST-01 · P2 · Confirmed in source — Select all means only the loaded page

**Finding:** The server loads 50 contacts; toggleAll operates on that page’s contacts, while the action says Select all.

**Recommended change:** Label it Select this page and provide a separate explicit all-results action if needed.

**Acceptance:** With more than 50 results, the selected scope and count are unmistakable before a bulk action.

<a id="list-02"></a>

#### LIST-02 · P2 · Confirmed in source — Out-of-range contact pages are not clamped to the result count

**Finding:** Contacts caps the page at 10,000 but queries before reconciling it with the number of matching results.

**Recommended change:** Clamp or redirect stale pagination when filters or deletions reduce the result set.

**Acceptance:** A stale page URL does not present a misleading empty contact list when matching people exist.

<a id="list-03"></a>

#### LIST-03 · P2 · Heuristic recommendation — Sorting cannot reflect the user’s current task

**Finding:** The list is ordered by displayName/id; users can filter priority but cannot choose recent activity or next follow-up ordering.

**Recommended change:** Offer a small set of useful sorts, preserving the choice with saved views.

**Acceptance:** Users can review the most urgent or recently active relationships without scanning alphabetically.

<a id="list-04"></a>

#### LIST-04 · P2 · Heuristic recommendation — Important contact tools are difficult to discover

**Finding:** Import, duplicate review, archive and tag management sit under the generic More tools sheet.

**Recommended change:** Label the tool entry clearly and surface the most common acquisition action in an empty or new account.

**Acceptance:** A novice finds import and duplicate review without opening unrelated settings.

<a id="list-05"></a>

#### LIST-05 · P2 · Heuristic recommendation — Contact rows emphasize methods more than next commitments

**Finding:** The phone view prioritizes name, phone, email and More, with little visible next-action context.

**Recommended change:** Show a concise next commitment or no-follow-up state in the scan row.

**Acceptance:** Users can identify contacts needing a next step from the list itself.

<a id="edit"></a>

### EDIT — Create and edit a contact

**Routes/functions:** `/contacts/new`, `/contacts/[contactId]/edit`

**Reviewed source:** [ContactForm.tsx](<../src/components/ContactForm.tsx>), [NewContactForm.tsx](<../src/components/NewContactForm.tsx>), [contact-actions.ts](<../src/lib/contact-actions.ts>)

[Representative screenshot](ui-ux-audit-2026-09-18/contact-error-draft-loss.png)

<a id="edit-01"></a>

#### EDIT-01 · P1 · Reproduced in browser — A recoverable validation error clears the draft

**Finding:** Entering a name and invalid phone then saving returned Invalid phone number and blanked both fields.

**Recommended change:** Return field errors and preserve the user’s draft instead of redirecting to an empty create form.

**Acceptance:** An invalid phone can be corrected with every other entered value intact.

<a id="edit-02"></a>

#### EDIT-02 · P1 · Reproduced in browser — Leaving an edited contact loses unsaved work without warning

**Finding:** Changed Sarah’s first name, followed Back to Contact, and returned. No discard prompt appeared and the edit was gone.

**Recommended change:** Track dirty fields and provide discard protection for navigation and reload, or a safe recoverable draft.

**Acceptance:** Accidental navigation does not silently discard contact edits.

<a id="edit-03"></a>

#### EDIT-03 · P2 · Confirmed in source — Required identity is not explained beside the fields

**Finding:** First name and last name have neither required markers nor a visible either-name rule, leaving server validation to explain an empty identity.

**Recommended change:** State the minimum identity requirement and validate it where the user enters it.

**Acceptance:** A user understands which combinations of name/company are accepted before submitting.

<a id="edit-04"></a>

#### EDIT-04 · P2 · Confirmed in source — Saving has no visible pending state

**Finding:** ContactForm’s create/update buttons do not use the pending component.

**Recommended change:** Disable repeat submit and show Saving with stable layout.

**Acceptance:** A throttled save provides immediate feedback and produces one intended contact change.

<a id="edit-05"></a>

#### EDIT-05 · P2 · Heuristic recommendation — The privacy meaning of Note changes across forms

**Finding:** Quick create labels publicNotes as Note; edit explains that it can appear in messages if a placeholder is used and offers a separate Private note.

**Recommended change:** Make privacy visible at first capture and default sensitive relationship context appropriately.

**Acceptance:** Users can distinguish reusable message context from private notes before saving.

<a id="edit-06"></a>

#### EDIT-06 · P2 · Confirmed in source — Removing a populated contact method is immediate

**Finding:** Remove changes the in-memory email/phone/address array without an undo affordance.

**Recommended change:** Provide undo for row removal or preserve removed values until a deliberate save review.

**Acceptance:** Accidentally removing a populated method can be reversed without retyping it.

<a id="detail"></a>

### DETAIL — Contact detail, relationship controls and timeline

**Routes/functions:** `/contacts/[contactId]`

**Reviewed source:** [page.tsx](<../src/app/(app)/contacts/[contactId]/page.tsx>), [ContactTimeline.tsx](<../src/components/ContactTimeline.tsx>), [route.ts](<../src/app/api/contacts/[contactId]/activity/route.ts>), [ContactRelationshipStatePanel.tsx](<../src/components/ContactRelationshipStatePanel.tsx>)

[Representative screenshot](ui-ux-audit-2026-09-18/app-contacts-demo-contact-sarah-1440.png)

<a id="detail-01"></a>

#### DETAIL-01 · P2 · Confirmed in source — Older history disappears behind an undocumented cap

**Finding:** The activity endpoint returns at most 150 combined items; the timeline has no older-items cursor or load-more control.

**Recommended change:** Add pagination and show the range currently displayed.

**Acceptance:** A contact with more than 150 events can reach its oldest retained history.

<a id="detail-02"></a>

#### DETAIL-02 · P2 · Confirmed in source — Timeline filter state is visual only

**Finding:** All, Communications and Notes change class names without aria-pressed or an equivalent selected-state semantic.

**Recommended change:** Expose the selected filter programmatically.

**Acceptance:** Keyboard and screen-reader users can identify the active timeline view.

<a id="detail-03"></a>

#### DETAIL-03 · P2 · Confirmed in source — An empty filtered timeline gives the wrong explanation

**Finding:** Every empty result uses No history yet, including when another filter contains events.

**Recommended change:** Distinguish no history from no events matching this filter.

**Acceptance:** Switching to Notes on a communications-only contact explains the filter result accurately.

<a id="detail-04"></a>

#### DETAIL-04 · P2 · Confirmed in source — Saved notes have no correction interface

**Finding:** The visible timeline provides add and filter controls but no edit/remove action for a mistaken note.

**Recommended change:** Provide a permission-appropriate correction or amendment workflow with preserved provenance.

**Acceptance:** A typo or accidentally entered private detail can be corrected through a clear user-facing process.

<a id="detail-05"></a>

#### DETAIL-05 · P2 · Heuristic recommendation — Do not contact needs a clearer impact explanation

**Finding:** The relationship panel says it stops future follow-ups; it does not preview the affected work beside the change.

**Recommended change:** Show affected pending steps and explain what remains in history before saving.

**Acceptance:** Users understand whether existing drafts, reminders and manual contact buttons remain available.

<a id="import"></a>

### IMPORT — Contact import and recovery

**Routes/functions:** `/contacts/import`

**Reviewed source:** [ContactImportWizardV2.tsx](<../src/components/ContactImportWizardV2.tsx>), [page.tsx](<../src/app/(app)/contacts/import/page.tsx>)

[Representative screenshot](ui-ux-audit-2026-09-18/app-contacts-import-390.png)

<a id="import-01"></a>

#### IMPORT-01 · P1 · Confirmed in source — Import polling can fail silently

**Finding:** The 1.5-second poll has no network exception handler; non-OK responses simply return. The screen can continue claiming the import is running with stale progress.

**Recommended change:** Show disconnected/stale status, last successful check and a retry path; stop treating stale data as live.

**Acceptance:** Offline and 401/500 polling failures visibly change state without losing the batch identity.

<a id="import-02"></a>

#### IMPORT-02 · P2 · Confirmed in source — Cancel failures have no user feedback

**Finding:** cancelBatch only handles response.ok and leaves failures or rejected fetches unexplained.

**Recommended change:** Track cancellation pending/success/failure and preserve accurate server status.

**Acceptance:** A failed cancellation is visibly reported and can be retried safely.

<a id="import-03"></a>

#### IMPORT-03 · P2 · Confirmed in source — Retry failed rows depends on the original tab state

**Finding:** The retry button requires table, which is only in React state. Reopening an old batch can show errors without offering the same retry workflow.

**Recommended change:** Support a server-held retry source or explicitly guide users to reselect the matching file.

**Acceptance:** After reload, a failed batch still has an understandable recovery route.

<a id="import-04"></a>

#### IMPORT-04 · P2 · Heuristic recommendation — Clean rows are summarized without enough spot-checking

**Finding:** The review primarily renders issue rows and aggregate counts; clean imports can proceed without a visible sample of the final records.

**Recommended change:** Show representative mapped records and key destination fields before queueing.

**Acceptance:** Users can catch incorrect but technically valid column mappings before records are written.

<a id="import-05"></a>

#### IMPORT-05 · P2 · Confirmed in source — Progress has no accessible name

**Finding:** The results section renders a bare progress element followed by text, without an associated label.

**Recommended change:** Name the progress control and announce material progress changes without reading the entire result panel repeatedly.

**Acceptance:** Assistive technology identifies what is progressing and its current completion level.

<a id="clean"></a>

### CLEAN — Duplicates, archive and custom contact fields

**Routes/functions:** `/contacts/duplicates`, `/contacts/archived`, `/contacts/custom-fields`

**Reviewed source:** [page.tsx](<../src/app/(app)/contacts/duplicates/page.tsx>), [DuplicateMergeForm.tsx](<../src/components/DuplicateMergeForm.tsx>), [contact-merge-actions.ts](<../src/lib/contact-merge-actions.ts>), [page.tsx](<../src/app/(app)/contacts/archived/page.tsx>), [page.tsx](<../src/app/(app)/contacts/custom-fields/page.tsx>)

[Representative screenshot](ui-ux-audit-2026-09-18/duplicate-second-survivor-fails.png)

<a id="clean-01"></a>

#### CLEAN-01 · P1 · Reproduced in browser — Keeping the second duplicate always fails

**Finding:** The rendered page’s hidden sourceContactId stays fixed. Selecting the second survivor submits the same ID twice; the server rejects it. The reactive DuplicateMergeForm component exists but is not used here.

**Recommended change:** Use the reactive merge form or submit both candidate IDs and derive the source from the chosen survivor.

**Acceptance:** Both survivor choices merge successfully and retain the intended record.

<a id="clean-02"></a>

#### CLEAN-02 · P2 · Confirmed in source — Duplicate coverage silently stops at 10,000 contacts

**Finding:** The query takes the first 10,000 contacts, yet the empty-state copy broadly says no active contacts share details.

**Recommended change:** Paginate candidate generation or disclose the reviewed range and remaining work.

**Acceptance:** A larger address book never receives an all-clear based on a partial scan.

<a id="clean-03"></a>

#### CLEAN-03 · P2 · Heuristic recommendation — Merge does not preview conflicting values

**Finding:** The comparison shows a short contact summary and counts, while actual field precedence is implemented server-side.

**Recommended change:** Display the resulting primary details and conflicts before confirmation.

**Acceptance:** Users can predict which conflicting company, custom field and primary contact method will survive.

<a id="clean-04"></a>

#### CLEAN-04 · P2 · Heuristic recommendation — Archive restore lacks a scheduling-impact preview

**Finding:** Restore contact is an immediate action; the page emphasizes retained history rather than the pending-work consequences.

**Recommended change:** Explain and summarize the resulting active assignments and future follow-ups.

**Acceptance:** A restored contact’s next actions match the expectations shown before or immediately after restoring.

<a id="clean-05"></a>

#### CLEAN-05 · P2 · Confirmed in source — Custom field deletion does not show dependent Mixes

**Finding:** Deletion warns about saved values and future blanks, but shows no list of templates or Mixes using that placeholder.

**Recommended change:** Preview dependent messages and provide a replacement path before irreversible removal.

**Acceptance:** A user can repair affected drafts/Mixes without discovering blank fields during a later send.

<a id="lib"></a>

### LIB — My Mixes, ready-made library and use-template setup

**Routes/functions:** `/mixes`, `/templates`, `/templates/[sharedMixId]/use`

**Reviewed source:** [page.tsx](<../src/app/(app)/mixes/page.tsx>), [page.tsx](<../src/app/(app)/templates/page.tsx>), [TemplateUseForm.tsx](<../src/components/TemplateUseForm.tsx>)

[Representative screenshot](ui-ux-audit-2026-09-18/template-draft-requires-audience.png)

<a id="lib-01"></a>

#### LIB-01 · P1 · Reproduced in browser — Audience preview double-counts overlapping tags

**Finding:** Selecting Estimates and Referrals for one person showed 2 people and 4 follow-ups for a two-beat template.

**Recommended change:** Count the distinct recipient union and derive the projection from actual eligible steps.

**Acceptance:** One person in two selected tags counts once in both preview and activation.

<a id="lib-02"></a>

#### LIB-02 · P2 · Reproduced in browser — A template draft cannot be created without an audience

**Finding:** Create my remix is disabled when no audience is selected, including Keep as a draft. This blocks trying a template before importing people.

**Recommended change:** Allow a draft with no audience; require a valid audience only when the relevant activation mode needs one.

**Acceptance:** A new account can create and edit a template draft before selecting recipients.

<a id="lib-03"></a>

#### LIB-03 · P2 · Heuristic recommendation — New users face an undifferentiated library

**Finding:** The seeded library contains 40 choices and initially presents relationship-themed names and framework labels.

**Recommended change:** Offer a small set of task-based starting points using the user’s stated purpose, with the full library available.

**Acceptance:** A novice finds a suitable first plan without understanding sales-framework terminology.

<a id="lib-04"></a>

#### LIB-04 · P2 · Heuristic recommendation — Using a template is hidden inside its preview

**Finding:** Cards offer Preview the rhythm; Remix it appears inside the sheet.

**Recommended change:** Test a direct use/create-draft action alongside preview.

**Acceptance:** Users who have already chosen a plan can start setup without an unnecessary modal step.

<a id="lib-05"></a>

#### LIB-05 · P3 · Confirmed in source — Count and duration wording lacks edge-case polish

**Finding:** The library visibly renders 1 beats and 0 days on a single immediate message.

**Recommended change:** Pluralize counts and describe immediate/single-step plans naturally.

**Acceptance:** One-step plans read as one beat or a single follow-up, with an intelligible timing summary.

<a id="mix"></a>

### MIX — Mix editor, timing, sequence and activation

**Routes/functions:** `/mixes/new?custom=1`, `/mixes/[mixId]/edit`

**Reviewed source:** [MixEditor.tsx](<../src/components/MixEditor.tsx>), [page.tsx](<../src/app/(app)/mixes/new/page.tsx>), [page.tsx](<../src/app/(app)/mixes/[mixId]/edit/page.tsx>)

[Representative screenshot](ui-ux-audit-2026-09-18/app-mixes-new-custom-1-390.png)

<a id="mix-01"></a>

#### MIX-01 · P1 · Confirmed in source — A long custom plan has no unsaved-draft protection

**Finding:** MixEditor keeps messages and sequence in component state, with a normal Cancel link and no leave/reload protection.

**Recommended change:** Provide a recoverable draft or dirty-navigation protection consistent with the admin editor.

**Acceptance:** Leaving or reloading a modified multi-beat plan cannot silently discard all work.

<a id="mix-02"></a>

#### MIX-02 · P2 · Confirmed in source — Editor activation repeats the overlapping-tag count error

**Finding:** audienceEstimate sums group.contactCount and can overstate the number of unique people; missing-method warnings use whole-workspace counts.

**Recommended change:** Use recipient-scoped deduplicated counts and eligibility warnings.

**Acceptance:** The review describes the selected audience rather than unrelated contacts or repeated tag memberships.

<a id="mix-03"></a>

#### MIX-03 · P2 · Confirmed in source — Removing a beat loses its contents immediately

**Finding:** removeStep filters the sequence in memory, with no undo or confirmation for a populated beat.

**Recommended change:** Add undo or confirm removal of nonempty beats.

**Acceptance:** A mistaken removal restores the full message, variants and timing.

<a id="mix-04"></a>

#### MIX-04 · P2 · Heuristic recommendation — Relative timing is hard to verify as actual dates

**Finding:** The editor combines days after start, appointment anchors, offsets and advanced settings without one concrete recipient timeline.

**Recommended change:** Add a worked schedule preview using a selected start/appointment and timezone.

**Acceptance:** Users can verify the exact sequence dates before activation, including weekend and quiet-hour effects.

<a id="mix-05"></a>

#### MIX-05 · P2 · Heuristic recommendation — Advanced timing language increases the learning burden

**Finding:** Cue, Tempo, Timing and several appointment anchors are presented in the authoring flow.

**Recommended change:** Start with plain When and Message controls; reveal appointment-specific choices as needed.

**Acceptance:** A first-time user can create a two-step plan without decoding brand terminology.

<a id="inv"></a>

### INV — Member invitations and System Mix

**Routes/functions:** `/mixes/system`

**Reviewed source:** [page.tsx](<../src/app/(app)/mixes/system/page.tsx>), [SystemMixInviteForm.tsx](<../src/components/SystemMixInviteForm.tsx>), [system-mix-actions.ts](<../src/lib/system-mix-actions.ts>)

[Representative screenshot](ui-ux-audit-2026-09-18/app-mixes-system-390.png)

<a id="inv-01"></a>

#### INV-01 · P2 · Confirmed in source — Revocation is immediate despite a permanent allowance cost

**Finding:** Revoke invitation is a direct form submit. The page says revoking does not restore an invitation slot.

**Recommended change:** Confirm the specific recipient, link invalidation and nonrefundable slot before revoking.

**Acceptance:** Users cannot accidentally revoke a still-needed invitation with one tap.

<a id="inv-02"></a>

#### INV-02 · P2 · Heuristic recommendation — Preparing an invitation consumes a scarce slot before sending

**Finding:** The form explains this in a paragraph, but preparation can feel like a reversible draft step.

**Recommended change:** Add a review summary that makes the slot cost and recipient explicit.

**Acceptance:** Users correctly predict the remaining allowance before confirming preparation.

<a id="inv-03"></a>

#### INV-03 · P2 · Confirmed in source — The combined address input offers no channel-specific keyboard

**Finding:** Email address or text number is one text input with no email/tel inputMode.

**Recommended change:** Offer a lightweight channel choice or explicit email/phone entry modes.

**Acceptance:** Phones expose a suitable keyboard and validation matches the selected invitation channel.

<a id="inv-04"></a>

#### INV-04 · P2 · Confirmed in source — Saved-contact choice is capped and requires a separate search submit

**Finding:** Only 50 matching contacts are loaded; search refreshes the page separately from the invitation form.

**Recommended change:** Use a searchable recipient selector that preserves in-progress invitees.

**Acceptance:** Finding another recipient does not discard an invitation draft or hide matching people without explanation.

<a id="inv-05"></a>

#### INV-05 · P2 · Heuristic recommendation — Status has no direct link to the exact prepared reminder

**Finding:** The invitation list says Ready in Today or Reminder skipped, while navigation goes to the overall Today list.

**Recommended change:** Link each invitation to its specific reminder and provide a clear way to resume an unsent introduction.

**Acceptance:** An owner reaches the correct prepared invitation without searching unrelated beats.

<a id="journey"></a>

### JOURNEY — Customer journey and stage/rule configuration

**Routes/functions:** `/journey`, `/settings/journey`, `contact stage controls`

**Reviewed source:** [page.tsx](<../src/app/(app)/journey/page.tsx>), [page.tsx](<../src/app/(app)/settings/journey/page.tsx>), [JourneyRuleForm.tsx](<../src/components/JourneyRuleForm.tsx>), [ContactJourneyPanel.tsx](<../src/components/ContactJourneyPanel.tsx>)

[Representative screenshot](ui-ux-audit-2026-09-18/journey-configuration-populated.png)

<a id="journey-01"></a>

#### JOURNEY-01 · P2 · Confirmed in source — Selecting a stage drops an existing person search

**Finding:** Stage links on /journey rebuild the URL with only stage, while the separate search form carries q.

**Recommended change:** Preserve compatible search criteria when changing stage filters.

**Acceptance:** Searching then changing stage retains the query and shows clear active-filter state.

<a id="journey-02"></a>

#### JOURNEY-02 · P2 · Heuristic recommendation — Automatic and Paused are ambiguous at the person level

**Finding:** Journey cards use a single status based on global and per-person automation, without saying which rule or pause caused it.

**Recommended change:** Show a concise reason and a direct link to the controlling setting.

**Acceptance:** A user can explain why one contact is paused and how to resume the intended behavior.

<a id="journey-03"></a>

#### JOURNEY-03 · P2 · Heuristic recommendation — Time in stage is not connected to a next action

**Finding:** Cards show days in stage but offer no useful interpretation or due next commitment.

**Recommended change:** Add an actionable next-step summary where reliable data exists.

**Acceptance:** The board helps decide who needs attention, not only where they are categorized.

<a id="journey-04"></a>

#### JOURNEY-04 · P2 · Heuristic recommendation — Rules need a worked customer example

**Finding:** Settings expose stages and triggers, but a nontechnical owner must mentally simulate what a milestone will do.

**Recommended change:** Provide a dry-run example explaining stage changes and Mix activation for a selected event.

**Acceptance:** An owner can preview the consequence of a rule without changing a live customer.

<a id="journey-05"></a>

#### JOURNEY-05 · P2 · Validation gap — Combined automation needs scenario-based usability checks

**Finding:** The populated configuration and board were viewed, but every combination of manual holds, stage rules, appointments and Mix stops was not exercised.

**Recommended change:** Run controlled multi-rule journeys with explicit expected behavior and explainability checks.

**Acceptance:** Conflicting or paused automation produces a clear, recoverable user-facing state.

<a id="cal"></a>

### CAL — Calendar, event editor and connected availability

**Routes/functions:** `/calendar`

**Reviewed source:** [page.tsx](<../src/app/(app)/calendar/page.tsx>), [CalendarEntryForm.tsx](<../src/components/CalendarEntryForm.tsx>)

[Representative screenshot](ui-ux-audit-2026-09-18/app-calendar-390.png)

<a id="cal-01"></a>

#### CAL-01 · P2 · Heuristic recommendation — Empty calendar days create a long mobile detour

**Finding:** Seven No time reserved sections precede the event editor. The top Schedule an event anchor helps, but the default view is still long.

**Recommended change:** Compact empty days and provide a clear focused event-entry view.

**Acceptance:** Users can scan availability and start an event without traversing repeated empty panels.

<a id="cal-02"></a>

#### CAL-02 · P2 · Confirmed in source — Timezone entry differs from the rest of the product

**Finding:** The event form uses a free-text timezone with a short datalist rather than the shared searchable TimezonePicker.

**Recommended change:** Reuse the same timezone control and show the event’s actual timezone explicitly.

**Acceptance:** Users can select any supported zone without memorizing an IANA identifier.

<a id="cal-03"></a>

#### CAL-03 · P2 · Confirmed in source — Calendar display ignores saved locale preferences

**Finding:** The page formats dates with Intl.DateTimeFormat("en", ...) rather than the account’s display preferences.

**Recommended change:** Use the shared display-format helpers for calendar dates and times.

**Acceptance:** Changing locale affects calendar formatting consistently with Today and account screens.

<a id="cal-04"></a>

#### CAL-04 · P2 · Heuristic recommendation — Sharing the event is explained only near Save

**Finding:** The form eventually says saving sends no invitation and requires a calendar download to share.

**Recommended change:** State the sharing contract near the action and provide a clear post-save handoff.

**Acceptance:** Users do not believe the attendee was notified merely because the event was saved.

<a id="cal-05"></a>

#### CAL-05 · P2 · Confirmed in source — The event limit offers the wrong recovery direction

**Finding:** At 500 events the page asks users to disconnect unused calendars instead of offering paging or a narrower range.

**Recommended change:** Provide explicit truncation, filtering and range controls before suggesting disconnection.

**Acceptance:** A busy account can inspect all relevant events without dismantling a calendar connection.

<a id="lead"></a>

### LEAD — Lead connections and hosted inquiry form

**Routes/functions:** `/settings/connections`, `/lead/[connectionId]`

**Reviewed source:** [page.tsx](<../src/app/(app)/settings/connections/page.tsx>), [PublicLeadForm.tsx](<../src/components/PublicLeadForm.tsx>), [page.tsx](<../src/app/lead/[connectionId]/page.tsx>)

[Representative screenshot](ui-ux-audit-2026-09-18/hosted-lead-390.png)

<a id="lead-01"></a>

#### LEAD-01 · P2 · Heuristic recommendation — Connection setup becomes technical abruptly

**Finding:** The existing-source path asks owners to configure HTTP POST, headers, keys and JSON in another tool.

**Recommended change:** Separate a simple hosted-form path from a clearly labeled technical connector path with worked provider instructions.

**Acceptance:** A nontechnical owner can publish a usable lead form without encountering API setup.

<a id="lead-02"></a>

#### LEAD-02 · P2 · Confirmed in source — Recent inquiry timestamps ignore account locale

**Finding:** Receipts are printed with toISOString and UTC, unlike customer-facing local dates elsewhere.

**Recommended change:** Use account display preferences and preserve explicit timezone information.

**Acceptance:** An owner can match a recent inquiry to their local working day without converting UTC.

<a id="lead-03"></a>

#### LEAD-03 · P2 · Heuristic recommendation — Needs-review work is a sequential ten-item queue

**Finding:** Only the ten oldest held receipts are shown, requiring users to process them to reveal later entries.

**Recommended change:** Add search/filter/pagination while preserving deliberate duplicate decisions.

**Acceptance:** An owner can find an urgent held inquiry without first resolving unrelated entries.

<a id="lead-04"></a>

#### LEAD-04 · P2 · Heuristic recommendation — Hosted-form receipt ends without a useful next action

**Finding:** Success says the request was received and the business can follow up, without a correction route or business return link.

**Recommended change:** Provide a business return/contact path and clarify how to correct supplied details.

**Acceptance:** Someone who entered a wrong phone number can understand how to correct the request.

<a id="lead-05"></a>

#### LEAD-05 · P2 · Heuristic recommendation — Required contact-method validation is indirect

**Finding:** Email and phone are individually optional; the paragraph explains that one is needed, but there is no immediate combined field state.

**Recommended change:** Validate the either-email-or-phone requirement inline and preserve all other values on failure.

**Acceptance:** Submitting neither method moves the user directly to the relevant fields with a clear instruction.

<a id="review"></a>

### REVIEW — Private feedback, public reviews and referrals

**Routes/functions:** `/review/[token]`

**Reviewed source:** [ReviewFeedbackForm.tsx](<../src/components/ReviewFeedbackForm.tsx>), [page.tsx](<../src/app/review/[token]/page.tsx>), [page.tsx](<../src/app/(app)/settings/business/page.tsx>)

[Representative screenshot](ui-ux-audit-2026-09-18/review-low-score-receipt.png)

<a id="review-01"></a>

#### REVIEW-01 · P2 · Reproduced in browser — Low-score users receive fewer follow-on choices

**Finding:** Submitting 2/5 produced a private thank-you only. The component offers public review/referral links only for the happy outcome.

**Recommended change:** Offer a consistent, voluntary public-feedback opportunity independent of score.

**Acceptance:** High- and low-rating users can access the same optional public-review route.

<a id="review-02"></a>

#### REVIEW-02 · P2 · Heuristic recommendation — Star values have no visible meaning anchors

**Finding:** The form shows five stars and accessible numeric labels but little visible explanation of the scale endpoints.

**Recommended change:** Label the endpoints and the selected rating in plain language.

**Acceptance:** Users consistently understand which end represents a poor or excellent experience.

<a id="review-03"></a>

#### REVIEW-03 · P2 · Confirmed in source — Feedback cannot be corrected after submission

**Finding:** Successful submission replaces the form with a thank-you state; there is no visible correction path.

**Recommended change:** Provide an appropriate edit window or a clear way to contact the business about a mistake.

**Acceptance:** An accidental rating or text error has a discoverable remedy.

<a id="review-04"></a>

#### REVIEW-04 · P2 · Heuristic recommendation — Private acknowledgement implies a response without setting expectations

**Finding:** The low-score receipt says the business can make things right, but gives no contact route or next-step explanation.

**Recommended change:** State what was recorded and provide a direct business contact option when available.

**Acceptance:** A dissatisfied customer has a useful next step without an invented response-time promise.

<a id="review-05"></a>

#### REVIEW-05 · P2 · Validation gap — Real recipient comprehension is unverified

**Finding:** The form was exercised with synthetic tokens and a low score; no customer feedback study or real follow-up was conducted.

**Recommended change:** Test neutral invitation wording, mobile completion and understanding of private versus public feedback.

**Acceptance:** Customers understand where their feedback goes before submitting it.

<a id="pref"></a>

### PREF — Business profile, personal preferences and date types

**Routes/functions:** `/settings/business`, `/account/preferences`, `/settings/jump-date-types`

**Reviewed source:** [page.tsx](<../src/app/(app)/settings/business/page.tsx>), [page.tsx](<../src/app/(app)/account/preferences/page.tsx>), [page.tsx](<../src/app/(app)/settings/jump-date-types/page.tsx>)

[Representative screenshot](ui-ux-audit-2026-09-18/app-account-preferences-390.png)

<a id="pref-01"></a>

#### PREF-01 · P2 · Heuristic recommendation — Timezone and schedule are separated from business setup

**Finding:** The business page edits signatures; timezone and quiet hours live in personal preferences; automatic sending is elsewhere.

**Recommended change:** Connect these pages with a coherent setup summary and direct links to related controls.

**Acceptance:** Users can see the active signature, timezone and sending defaults before starting a plan.

<a id="pref-02"></a>

#### PREF-02 · P2 · Heuristic recommendation — Signature editing has no rendered message example

**Finding:** Text and email signatures are edited as fields without an adjacent realistic message preview.

**Recommended change:** Show a compact example using the current signature and a fictional recipient.

**Acceptance:** A user can spot duplicate names, awkward spacing and overly long signoffs before saving.

<a id="pref-03"></a>

#### PREF-03 · P2 · Heuristic recommendation — Scheduling changes have no concrete impact preview

**Finding:** Default time, weekend policy and quiet hours are configurable, but their combined effect is left to the user to infer.

**Recommended change:** Show one worked next-follow-up example and explain whether existing scheduled work changes.

**Acceptance:** The user can predict the time/date of an affected beat before confirming new defaults.

<a id="pref-04"></a>

#### PREF-04 · P2 · Confirmed in source — Customer settings forms lack consistent pending/dirty states

**Finding:** These ordinary server-action forms do not share the admin editor’s retained-draft and submit feedback.

**Recommended change:** Apply a consistent pending, saved, error and unsaved-changes pattern to settings.

**Acceptance:** Slow saves and accidental navigation do not leave users unsure whether edits were kept.

<a id="pref-05"></a>

#### PREF-05 · P2 · Heuristic recommendation — Date types expose taxonomy before explaining consequences

**Finding:** New custom type and active-selection controls do not show which Mixes depend on each type.

**Recommended change:** Show usage and a simple example of adding a date to a person.

**Acceptance:** Users know what disabling a type changes and which existing plans depend on it.

<a id="notify"></a>

### NOTIFY — Notification preferences and automatic sending

**Routes/functions:** `/settings/notifications`, `/settings/sending`

**Reviewed source:** [page.tsx](<../src/app/(app)/settings/notifications/page.tsx>), [PushNotificationControl.tsx](<../src/components/PushNotificationControl.tsx>), [page.tsx](<../src/app/(app)/settings/sending/page.tsx>)

[Representative screenshot](ui-ux-audit-2026-09-18/app-settings-notifications-390.png)

<a id="notify-01"></a>

#### NOTIFY-01 · P2 · Reproduced in browser — Unavailable-email fallback can recommend unavailable push

**Finding:** With both intentionally disabled in the audit fixture, the page said You can use push reminders instead and then Web Push is not configured.

**Recommended change:** Compose the fallback from actual available capabilities.

**Acceptance:** When both channels are unavailable, the page gives one accurate explanation and useful support action.

<a id="notify-02"></a>

#### NOTIFY-02 · P2 · Confirmed in source — Device reminder failure language is technical

**Finding:** The unconfigured push state refers to Web Push and this server, rather than what the member can do.

**Recommended change:** Use customer-facing availability wording and a relevant support route.

**Acceptance:** The message describes a product capability and next step without server jargon.

<a id="notify-03"></a>

#### NOTIFY-03 · P2 · Heuristic recommendation — Email reminder preferences do not show a sample or test action

**Finding:** The form configures morning/weekly mail and hour but has no visible preview/test counterpart to push’s test notification.

**Recommended change:** Offer a privacy-safe preview and controlled test where delivery is configured.

**Acceptance:** Members can verify the reminder’s contents and destination before relying on it.

<a id="notify-04"></a>

#### NOTIFY-04 · P2 · Heuristic recommendation — Enabling automation lacks an exact near-term sending preview

**Finding:** The page explains the review window and requires acknowledgement, but does not list the eligible messages that will send next.

**Recommended change:** Preview the immediate affected queue and provide a clear stop/hold path.

**Acceptance:** Before enabling automation, the owner can identify recipients and earliest send times.

<a id="notify-05"></a>

#### NOTIFY-05 · P1 · Validation gap — Reminder delivery and timing need real-channel evidence

**Finding:** Mail, SMS workers and push delivery were disabled deliberately. This audit cannot establish actual receipt or device notification behavior.

**Recommended change:** Verify configured staging channels, quiet hours, expired sessions and permission denial using controlled recipients/devices.

**Acceptance:** Document actual delivered reminders and accurate failure feedback before declaring these functions ready.

<a id="account"></a>

### ACCOUNT — Account profile, security, export and deletion

**Routes/functions:** `/account`, `/account?section=security`, `/account?section=privacy`, `/account/deleted`

**Reviewed source:** [page.tsx](<../src/app/(app)/account/page.tsx>), [AccountDeletionForm.tsx](<../src/components/AccountDeletionForm.tsx>), [page.tsx](<../src/app/account/deleted/page.tsx>)

[Representative screenshot](ui-ux-audit-2026-09-18/app-account-section-privacy-390.png)

<a id="account-01"></a>

#### ACCOUNT-01 · P2 · Confirmed in source — Account email is displayed without a change/recovery path

**Finding:** Profile lists email and verification status, while preferences edit name/locale/timezone only.

**Recommended change:** Provide a verified email-change process or an explicit supported assistance route.

**Acceptance:** A member who is losing access to an email address can find the approved way to update it.

<a id="account-02"></a>

#### ACCOUNT-02 · P2 · Confirmed in source — Social-only account deletion requires creating a password

**Finding:** AccountDeletionForm directs users without a password to set one before deleting.

**Recommended change:** Support equivalent recent reauthentication through the account’s available sign-in method.

**Acceptance:** A social-only member can delete after secure reauthentication without inventing a new credential.

<a id="account-03"></a>

#### ACCOUNT-03 · P2 · Confirmed in source — Deletion warning reference points to no matching element

**Finding:** The deletion form has aria-describedby="account-deletion-warning", but the rendered account page does not define that ID.

**Recommended change:** Give the actual warning that ID or reference the existing warning correctly.

**Acceptance:** The form’s accessible description includes the deletion consequences.

<a id="account-04"></a>

#### ACCOUNT-04 · P2 · Heuristic recommendation — Data export begins as a bare download action

**Finding:** Spreadsheet bundle and Complete JSON links do not show size, preparation state or a customer-friendly failure recovery.

**Recommended change:** Explain bundle contents and provide visible progress/error feedback for larger exports.

**Acceptance:** A user can distinguish a started download, an export failure and a complete export.

<a id="account-05"></a>

#### ACCOUNT-05 · P2 · Heuristic recommendation — Session rows emphasize technical identifiers

**Finding:** Rows include browser description, IP and dates but no friendly device label or obvious current-device explanation beyond the badge.

**Recommended change:** Prioritize recognizable device/time/location context only where reliable, with technical details secondary.

**Acceptance:** A member can identify the session they intend to revoke without interpreting an IP address.

<a id="help"></a>

### HELP — Help, support requests and customer conversations

**Routes/functions:** `/help`, `/account/tickets`, `/account/tickets/[ticketId]`

**Reviewed source:** [page.tsx](<../src/app/(app)/help/page.tsx>), [SupportFaq.tsx](<../src/components/SupportFaq.tsx>), [page.tsx](<../src/app/(app)/account/tickets/[ticketId]/page.tsx>)

[Representative screenshot](ui-ux-audit-2026-09-18/support-detail-390.png)

<a id="help-01"></a>

#### HELP-01 · P2 · Confirmed in source — Customer support drafts lack the admin reply protections

**Finding:** New-ticket and customer-reply forms are ordinary server-action forms; the admin composer retains in-tab drafts and shows pending state.

**Recommended change:** Give customers comparable draft preservation and submit feedback.

**Acceptance:** A network error or navigation interruption does not erase a long explanation.

<a id="help-02"></a>

#### HELP-02 · P2 · Heuristic recommendation — Reply expectations are unclear

**Finding:** The support form describes what to include, but does not state an expected service window or availability.

**Recommended change:** Publish an honest support-hours/response expectation, even if it is explicitly best effort.

**Acceptance:** A customer knows whether to wait, check the ticket or use another channel.

<a id="help-03"></a>

#### HELP-03 · P2 · Confirmed in source — Successful FAQ filtering is not announced

**Finding:** The FAQ result count is a visual span; only the zero-result state uses role=status.

**Recommended change:** Announce updated result counts without moving focus from search.

**Acceptance:** Screen-reader users hear how many answers match after changing the query.

<a id="help-04"></a>

#### HELP-04 · P2 · Heuristic recommendation — Tickets rely on a user’s manual description of context

**Finding:** The form asks which page they were on but does not provide a reviewable, privacy-safe page/browser context summary.

**Recommended change:** Offer explicit opt-in inclusion of current route and coarse technical context.

**Acceptance:** Support receives useful reproduction context without collecting private contact data.

<a id="help-05"></a>

#### HELP-05 · P2 · Heuristic recommendation — No-match help sends users to a vague location

**Finding:** The empty FAQ state says to use the help option below rather than linking directly to support.

**Recommended change:** Offer a clear Message support link that carries the search topic only when appropriate.

**Acceptance:** A failed help search has one obvious continuation without scrolling through the rest of the page.

<a id="adminhome"></a>

### ADMINHOME — Admin overview and navigation

**Routes/functions:** `/admin`, `admin navigation`

**Reviewed source:** [page.tsx](<../src/app/(staff)/admin/page.tsx>), [AdminNav.tsx](<../src/components/AdminNav.tsx>), [admin-navigation.ts](<../src/lib/admin-navigation.ts>)

[Representative screenshot](ui-ux-audit-2026-09-18/admin-admin-390.png)

<a id="adminhome-01"></a>

#### ADMINHOME-01 · P2 · Heuristic recommendation — Mobile administration uses two navigation layers

**Finding:** A collapsed Administration menu sits above area tabs; the hierarchy and current area take substantial space before work begins.

**Recommended change:** Keep the current location explicit and reduce repeated labels while retaining all destinations.

**Acceptance:** An operator identifies the current area and reaches an adjacent task quickly on a phone.

<a id="adminhome-02"></a>

#### ADMINHOME-02 · P2 · Heuristic recommendation — Overflowing tab strips give little continuation cue

**Finding:** On the mobile library screen, the Library options label is cut at the edge of the horizontally scrolling area tabs.

**Recommended change:** Add a visible overflow cue and scroll the selected tab into view.

**Acceptance:** All sibling destinations are discoverable and the active one is fully visible at 320 pixels.

<a id="adminhome-03"></a>

#### ADMINHOME-03 · P2 · Heuristic recommendation — Attention cards lack a common urgency scale

**Finding:** Invitation blockers, stale monitoring and support replies share the attention list without a consistent severity/age display.

**Recommended change:** Present consequence, urgency and age consistently while preserving direct workflow links.

**Acceptance:** Operators can decide the first action without opening each attention item.

<a id="adminhome-04"></a>

#### ADMINHOME-04 · P2 · Confirmed in source — Overview freshness is a render timestamp

**Finding:** The overview displays Updated from new Date() but has no shared refresh control or observed-data freshness explanation.

**Recommended change:** Separate page-load time from source observation time and provide deliberate refresh.

**Acceptance:** A long-open overview makes stale metrics apparent rather than implying they are current.

<a id="adminhome-05"></a>

#### ADMINHOME-05 · P2 · Heuristic recommendation — Staff and customer context can be easy to confuse

**Finding:** The overview Accounts total explicitly includes staff, while admission uses a different customer-oriented capacity definition.

**Recommended change:** Make metric naming and links clearly distinguish operational account totals from customer capacity.

**Acceptance:** An operator does not use the overview total as the number of remaining customer places.

<a id="adminuser"></a>

### ADMINUSER — Admin account search and account controls

**Routes/functions:** `/admin/users`, `/admin/users/[userId]`

**Reviewed source:** [page.tsx](<../src/app/(staff)/admin/users/page.tsx>), [page.tsx](<../src/app/(staff)/admin/users/[userId]/page.tsx>)

[Representative screenshot](ui-ux-audit-2026-09-18/admin-admin-users-demo-user-390.png)

<a id="adminuser-01"></a>

#### ADMINUSER-01 · P2 · Heuristic recommendation — Search results provide limited triage context

**Finding:** Rows emphasize account identity, status and session count; the operator must open an account to understand many support circumstances.

**Recommended change:** Surface the most useful verified triage indicators, with a compact reason/status summary.

**Acceptance:** A support operator can identify the likely target without repeatedly opening similar accounts.

<a id="adminuser-02"></a>

#### ADMINUSER-02 · P2 · Heuristic recommendation — Access changes need a task-specific review summary

**Finding:** Suspend account and End all sessions share an operation form and generic Apply account change action.

**Recommended change:** Show the selected operation in the submit label and a concise affected-state review.

**Acceptance:** The operator can name the exact account and consequence immediately before submitting.

<a id="adminuser-03"></a>

#### ADMINUSER-03 · P2 · Heuristic recommendation — Suspension consequences are a dense paragraph

**Finding:** Sessions, reminders, sending and unused referrals have different recovery behavior after suspension.

**Recommended change:** Present an easy-to-scan consequence summary beside the selected operation.

**Acceptance:** Operators can explain what restoring access will and will not automatically restore.

<a id="adminuser-04"></a>

#### ADMINUSER-04 · P2 · Heuristic recommendation — Session dates are not a recognizable device inventory

**Finding:** Admin account details expose session counts/dates; identifying a particular device still requires interpretation.

**Recommended change:** Provide a concise, privacy-appropriate device/session summary and clear current-session context.

**Acceptance:** An operator can discuss the relevant session accurately with the account owner.

<a id="adminuser-05"></a>

#### ADMINUSER-05 · P2 · Validation gap — Denied and changing-access states need operator task checks

**Finding:** The audit used a local Owner fixture; it did not repeat every screen under all staff roles or a live permission change.

**Recommended change:** Run the existing role-boundary journeys alongside moderated denied-state tasks.

**Acceptance:** A denied action explains the supported next step and preserves appropriate nonsecret draft work.

<a id="adminsup"></a>

### ADMINSUP — Admin support queue and case work

**Routes/functions:** `/admin/support`, `/admin/support/[ticketId]`

**Reviewed source:** [page.tsx](<../src/app/(staff)/admin/support/page.tsx>), [page.tsx](<../src/app/(staff)/admin/support/[ticketId]/page.tsx>), [SupportReplyComposer.tsx](<../src/components/SupportReplyComposer.tsx>)

[Representative screenshot](ui-ux-audit-2026-09-18/admin-support-detail-390.png)

<a id="adminsup-01"></a>

#### ADMINSUP-01 · P2 · Heuristic recommendation — Queue age is time since any activity

**Finding:** The queue displays hours since activity, which is not necessarily the time the customer has been waiting for a staff reply.

**Recommended change:** Distinguish customer wait time from last activity and use the relevant measure for triage.

**Acceptance:** An internal update cannot make an overdue customer reply appear newly received.

<a id="adminsup-02"></a>

#### ADMINSUP-02 · P2 · Heuristic recommendation — Reply action and email delivery need clearer separation

**Finding:** The composer says Send reply, while helper text says the ticket is saved and email queues separately.

**Recommended change:** Use a post-submit receipt that explicitly states saved-to-ticket and email status.

**Acceptance:** An operator can confirm the customer-visible reply without assuming inbox delivery.

<a id="adminsup-03"></a>

#### ADMINSUP-03 · P2 · Confirmed in source — Reply drafts are lost on refresh

**Finding:** The admin composer explicitly keeps the draft only in the current tab and warns that reloading discards it.

**Recommended change:** Provide a protected save-draft mechanism or a strong reload guard consistent with the privacy model.

**Acceptance:** Routine refresh during case investigation cannot silently remove a lengthy reply.

<a id="adminsup-04"></a>

#### ADMINSUP-04 · P2 · Heuristic recommendation — View-only support entry requires careful discovery

**Finding:** The case page groups assignment and support-view controls in separate disclosures.

**Recommended change:** Show a clear next permitted action when a case is unassigned or a support view is unavailable.

**Acceptance:** A support operator can determine why view-only access is unavailable without trial and error.

<a id="adminsup-05"></a>

#### ADMINSUP-05 · P2 · Validation gap — Concurrent case handling was not qualified in this audit

**Finding:** A synthetic case was viewed from customer and admin sides; full concurrent assignment, session expiry and real notification flows were not rerun.

**Recommended change:** Exercise the existing support-case suite with two operators and a customer, plus controlled delivery.

**Acceptance:** Conflicts, ended support views and failed email remain understandable and recoverable.

<a id="access"></a>

### ACCESS — Admin waitlist, invitations and admission

**Routes/functions:** `/admin/waitlist`, `/admin/access`, `/admin/access/[inviteId]`, `/admin/admission`

**Reviewed source:** [page.tsx](<../src/app/(staff)/admin/waitlist/page.tsx>), [page.tsx](<../src/app/(staff)/admin/access/page.tsx>), [page.tsx](<../src/app/(staff)/admin/access/[inviteId]/page.tsx>), [page.tsx](<../src/app/(staff)/admin/admission/page.tsx>), [WaitlistSelectionForm.tsx](<../src/components/WaitlistSelectionForm.tsx>)

[Representative screenshot](ui-ux-audit-2026-09-18/admin-admin-admission-390.png)

<a id="access-01"></a>

#### ACCESS-01 · P2 · Heuristic recommendation — Access status is distributed across three pages

**Finding:** Waitlist eligibility, invitation state and admission policy must be combined mentally to understand why a person cannot join.

**Recommended change:** Provide a linked explanation chain from a recipient to eligibility, reservation, delivery and redemption state.

**Acceptance:** An operator can diagnose one blocked signup without losing recipient context.

<a id="access-02"></a>

#### ACCESS-02 · P2 · Heuristic recommendation — Capacity terminology is easy to overgeneralize

**Finding:** The admission page explains that ceilings govern waitlist email grants while personal invitations use separate allowances. The large capacity number does not communicate that distinction alone.

**Recommended change:** Label the number with its scope and show separate referral readiness beside it.

**Acceptance:** Operators do not assume zero displayed capacity blocks every form of account admission.

<a id="access-03"></a>

#### ACCESS-03 · P2 · Heuristic recommendation — Pause controls have materially different effects

**Finding:** Collection, new grants, referrals and redemption can be paused separately; queued messages and issued links behave differently.

**Recommended change:** Use a plain-language state matrix preview before saving changes.

**Acceptance:** The operator can predict what happens to a new request, queued email and existing invitation under each change.

<a id="access-04"></a>

#### ACCESS-04 · P2 · Heuristic recommendation — Empty waitlist still presents selection work

**Finding:** With no eligible entries, the fixture showed Select eligible on this page, Clear selection and Review 0 invitations.

**Recommended change:** Collapse unavailable bulk actions into a helpful empty/readiness state.

**Acceptance:** No-recipient views direct the operator to the blocker or next setup task rather than a zero-item workflow.

<a id="access-05"></a>

#### ACCESS-05 · P2 · Confirmed in source — Invitation search hides its supported phone search

**Finding:** The input is labeled Recipient email, although the query searches both recipientEmail and recipientPhone.

**Recommended change:** Label the field Email or phone and include a short example where useful.

**Acceptance:** An operator knows a text invitation can be found by its recipient phone number.

<a id="adminlib"></a>

### ADMINLIB — Admin library drafts, invitation wording and library options

**Routes/functions:** `/admin/templates`, `/admin/templates/new`, `/admin/templates/[sharedMixId]/edit`, `/admin/system-mix`, `/admin/settings`

**Reviewed source:** [LibraryDraftForm.tsx](<../src/components/LibraryDraftForm.tsx>), [page.tsx](<../src/app/(staff)/admin/templates/page.tsx>), [page.tsx](<../src/app/(staff)/admin/system-mix/page.tsx>), [LibraryOptionsForm.tsx](<../src/components/LibraryOptionsForm.tsx>)

[Representative screenshot](ui-ux-audit-2026-09-18/admin-admin-templates-new-390.png)

<a id="adminlib-01"></a>

#### ADMINLIB-01 · P2 · Heuristic recommendation — Published and draft labels require interpretation

**Finding:** Library rows can simultaneously display Draft 1, Published and Version 1 without saying whether the draft differs from the live version.

**Recommended change:** Label current publication and unpublished changes distinctly.

**Acceptance:** A reviewer identifies what customers currently see and whether an edit awaits publication.

<a id="adminlib-02"></a>

#### ADMINLIB-02 · P2 · Confirmed in source — Customer and staff vocabulary differs

**Finding:** The library authoring screen uses SMS and Days after start; customer screens use Text and Tempo/Beats.

**Recommended change:** Show a customer-language preview and standardize equivalent labels where practical.

**Acceptance:** Editors can predict exactly how authored content is presented to members.

<a id="adminlib-03"></a>

#### ADMINLIB-03 · P2 · Heuristic recommendation — Long authoring forms put review context far from editing

**Finding:** Draft metadata, messages, placeholders and change reason form a long page on mobile; publishing is a later step.

**Recommended change:** Provide a persistent concise validity/review summary with links to incomplete sections.

**Acceptance:** A reviewer can locate missing fields or timing problems without rescanning the entire form.

<a id="adminlib-04"></a>

#### ADMINLIB-04 · P2 · Heuristic recommendation — Library option changes lack a customer-filter preview

**Finding:** Options can be enabled/reordered with existing values preserved, but no preview shows how hidden legacy values will appear in customer filters.

**Recommended change:** Show representative affected library/editor states before saving.

**Acceptance:** An editor understands which new choices disappear and how existing content remains discoverable.

<a id="adminlib-05"></a>

#### ADMINLIB-05 · P2 · Validation gap — Full publish/rollback usability needs a populated edit scenario

**Finding:** The audit inspected the list, new draft, options and wording screens; it did not publish or roll back content or capture every revision conflict.

**Recommended change:** Use isolated versioned fixtures to test edit, compare, publish, conflict and rollback with a second editor.

**Acceptance:** Editors can verify the live version and recover from a conflict without losing their intended changes.

<a id="email"></a>

### EMAIL — Admin email, delivery recovery and recipient suppression

**Routes/functions:** `/admin/email`, `/admin/email/recovery`, `/admin/email/recovery/[deliveryId]`, `/admin/email/suppressions`, `/admin/email/suppressions/[suppressionId]`

**Reviewed source:** [page.tsx](<../src/app/(staff)/admin/email/page.tsx>), [page.tsx](<../src/app/(staff)/admin/email/recovery/[deliveryId]/page.tsx>), [page.tsx](<../src/app/(staff)/admin/email/suppressions/page.tsx>)

[Representative screenshot](ui-ux-audit-2026-09-18/admin-admin-email-390.png)

<a id="email-01"></a>

#### EMAIL-01 · P2 · Confirmed in source — Provider-event history stops at the latest 30

**Finding:** The Email page takes 30 provider events and exposes no event search/pagination there.

**Recommended change:** Add a searchable diagnostic history or a clear deep link to the appropriate complete record.

**Acceptance:** An older delivery incident can be investigated without relying on being in the latest 30 events.

<a id="email-02"></a>

#### EMAIL-02 · P2 · Heuristic recommendation — Operational terms obscure the customer consequence

**Finding:** Generation, worker attempts, provider acceptance and suppression are useful diagnostics but need interpretation.

**Recommended change:** Lead each case with recipient impact and the next permitted action; keep technical evidence below.

**Acceptance:** An operator can explain whether the person should wait, use an existing link or receive a reviewed resend.

<a id="email-03"></a>

#### EMAIL-03 · P2 · Heuristic recommendation — Recovery navigation repeats similar destinations

**Finding:** The Email page offers multiple invitation recovery links plus staff/support and suppression paths.

**Recommended change:** Organize by problem and recipient, with one clear destination per task.

**Acceptance:** A failed invitation has one obvious investigation entry rather than competing similar links.

<a id="email-04"></a>

#### EMAIL-04 · P2 · Heuristic recommendation — Mixed suppression reasons need a simple action summary

**Finding:** The queue groups blocks by recipient and distinguishes provider review from recipient confirmation, while detailed rules are elsewhere.

**Recommended change:** Summarize which active reason controls the next action and why.

**Acceptance:** Operators do not mistake clearing one provider issue for permission to contact a opted-out recipient.

<a id="email-05"></a>

#### EMAIL-05 · P1 · Validation gap — Real delivery recovery remains unverified here

**Finding:** Outbound delivery and provider webhooks were not used. Empty local queues do not establish production recovery readiness.

**Recommended change:** Run controlled accepted/failed/uncertain/blocked email cases against staging with real provider evidence.

**Acceptance:** The UI’s delivery statements match provider records and safe retry outcomes.

<a id="report"></a>

### REPORT — Admin reports, export jobs and saved observations

**Routes/functions:** `/admin/reports`, `/admin/reports/exports`, `/admin/reports/history`, `/admin/reports/history/[snapshotId]`

**Reviewed source:** [page.tsx](<../src/app/(staff)/admin/reports/page.tsx>), [AdminReportView.tsx](<../src/components/AdminReportView.tsx>), [page.tsx](<../src/app/(staff)/admin/reports/exports/page.tsx>), [page.tsx](<../src/app/(staff)/admin/reports/history/page.tsx>), [AdminRefresh.tsx](<../src/components/AdminRefresh.tsx>)

[Representative screenshot](ui-ux-audit-2026-09-18/admin-admin-reports-1440.png)

<a id="report-01"></a>

#### REPORT-01 · P2 · Heuristic recommendation — Metric interpretation is hidden behind disclosures

**Finding:** Activation, retention and live-versus-saved caveats are correct but require opening Definitions and scope to interpret headline counts.

**Recommended change:** Place a short denominator/time-window explanation beside each decision-critical metric.

**Acceptance:** A reader can interpret a conversion percentage without confusing account counts, eligible cohorts or missing data.

<a id="report-02"></a>

#### REPORT-02 · P2 · Confirmed in source — Automatic export checking stops after eight polls

**Finding:** AdminRefresh checks every 15 seconds up to eight times; manual refresh remains, but the automatic cycle is not restarted by that button.

**Recommended change:** Make the stopped state actionable with explicit resume/retry behavior.

**Acceptance:** A slow export remains easy to follow after two minutes without an apparently stalled status.

<a id="report-03"></a>

#### REPORT-03 · P2 · Heuristic recommendation — Export expiry is described mostly as an absolute time

**Finding:** Exports are session-bound and expire after 24 hours; sign-out can remove access earlier.

**Recommended change:** Show the relevant remaining time and session restriction beside each download.

**Acceptance:** An operator understands whether the current download will still work after signing in elsewhere.

<a id="report-04"></a>

#### REPORT-04 · P2 · Heuristic recommendation — Live and saved reporting need a stronger visual distinction

**Finding:** Similar reports can represent recalculated current records or saved observations with different freshness semantics.

**Recommended change:** Keep a persistent live/saved label, observation time and definition context in the report header.

**Acceptance:** Screenshots and exported reports retain enough context to avoid treating live totals as immutable history.

<a id="report-05"></a>

#### REPORT-05 · P2 · Validation gap — Dense real-world report states were not fully exercised

**Finding:** The audit fixture has sparse synthetic history; long labels, missing days and hundreds of retained observations need dedicated coverage.

**Recommended change:** Run populated reporting fixtures with empty, partial, dense and failed-export states at phone widths.

**Acceptance:** All observations and failure recovery remain usable without horizontal page overflow or ambiguous missing values.

<a id="ops"></a>

### OPS — Admin operations, alerts and audit investigation

**Routes/functions:** `/admin/operations`, `/admin/operations/alerts`, `/admin/audit`

**Reviewed source:** [page.tsx](<../src/app/(staff)/admin/operations/page.tsx>), [page.tsx](<../src/app/(staff)/admin/operations/alerts/page.tsx>), [page.tsx](<../src/app/(staff)/admin/audit/page.tsx>), [AdminRefresh.tsx](<../src/components/AdminRefresh.tsx>)

[Representative screenshot](ui-ux-audit-2026-09-18/admin-admin-operations-390.png)

<a id="ops-01"></a>

#### OPS-01 · P2 · Heuristic recommendation — No jobs is not the same as a healthy system

**Finding:** The local fixture showed zero jobs and zero healthy/stale workers; the Jobs view’s empty state simply suggests another filter.

**Recommended change:** Tie empty operational views to an explicit health/observation summary.

**Acceptance:** Operators can distinguish idle healthy processing from no worker evidence.

<a id="ops-02"></a>

#### OPS-02 · P2 · Heuristic recommendation — Acknowledgment is easy to confuse with resolution

**Finding:** Acknowledging stops incident reminders while the check remains open; this distinction is mainly explanatory copy.

**Recommended change:** Persist an acknowledged-but-unresolved state with recovery criteria beside the incident.

**Acceptance:** Acknowledgment never looks like successful recovery or disappears from the operator’s unresolved-work view.

<a id="ops-03"></a>

#### OPS-03 · P2 · Confirmed in source — Alert notification history is capped without paging

**Finding:** Operational alert notices are loaded with take:30. Older notification evidence has no list continuation on that page.

**Recommended change:** Expose an appropriate paged history or a linked full incident record.

**Acceptance:** An operator can review older attempts for a still-relevant incident.

<a id="ops-04"></a>

#### OPS-04 · P2 · Heuristic recommendation — Audit action names are machine-oriented

**Finding:** Audit cards lead with stored action identifiers and provide structured before/after details in a disclosure.

**Recommended change:** Add a human-readable action summary while preserving exact identifiers for investigation.

**Acceptance:** Operators can describe what changed without interpreting dotted action names or raw JSON.

<a id="ops-05"></a>

#### OPS-05 · P2 · Heuristic recommendation — Audit date filters and event times use different frames

**Finding:** Filter labels use UTC while rendered event times use account display preferences.

**Recommended change:** Show both frames clearly or provide a consistent selectable frame for investigation.

**Acceptance:** Events near midnight are understandable within the selected date range.

<a id="staff"></a>

### STAFF — Admin team permissions, staff onboarding and MFA

**Routes/functions:** `/admin/team`, `/staff/accept`, `/account/admin-mfa`

**Reviewed source:** [page.tsx](<../src/app/(staff)/admin/team/page.tsx>), [StaffAccessForm.tsx](<../src/components/StaffAccessForm.tsx>), [AdminMfaPanel.tsx](<../src/components/AdminMfaPanel.tsx>), [page.tsx](<../src/app/(staff)/account/admin-mfa/page.tsx>), [page.tsx](<../src/app/staff/accept/page.tsx>)

[Representative screenshot](ui-ux-audit-2026-09-18/dark320-admin-team-view-add.png)

<a id="staff-01"></a>

#### STAFF-01 · P2 · Heuristic recommendation — Permission review is a long capability inventory

**Finding:** The override UI shows many individual capabilities and a numeric total; understanding practical role differences takes careful reading.

**Recommended change:** Group permissions by operator task and retain a clear added/removed summary.

**Acceptance:** An owner can explain a proposed staff member’s effective responsibilities before saving.

<a id="staff-02"></a>

#### STAFF-02 · P2 · Confirmed in source — Owner promotion can disappear without an adjacent explanation

**Finding:** The Owner role option is filtered out when the target has no enabled MFA.

**Recommended change:** Explain why Owner is unavailable and link the target’s supported enrollment process.

**Acceptance:** The owner can discover the required next step without assuming the role does not exist.

<a id="staff-03"></a>

#### STAFF-03 · P2 · Confirmed in source — Copy recovery codes has no failure handling

**Finding:** copyRecoveryCodes awaits clipboard.writeText without catch or a manual-copy recovery message.

**Recommended change:** Handle denied/unavailable clipboard and provide an accessible manual fallback.

**Acceptance:** Clipboard denial leaves the recovery codes visible with clear instructions rather than an unhandled failure.

<a id="staff-04"></a>

#### STAFF-04 · P2 · Heuristic recommendation — Continuing after enrollment does not confirm code storage

**Finding:** The recovery screen offers Copy recovery codes and Continue to Admin with no explicit saved-codes acknowledgment.

**Recommended change:** Ask for a simple acknowledgement or provide an equally clear save-and-continue sequence.

**Acceptance:** A new staff member understands codes are one-time recovery material before leaving the screen.

<a id="staff-05"></a>

#### STAFF-05 · P1 · Validation gap — MFA and staff invitation completion need dedicated qualification

**Finding:** This audit used local MFA-disabled admin access for broad screen review. Enrollment code was inspected; real authenticator/recovery and staff mailbox flows were not completed.

**Recommended change:** Run the existing MFA-enabled isolated staff suite and a controlled physical authenticator exercise.

**Acceptance:** Enrollment, recovery, expiry and permission removal are verified before administrative readiness signoff.

<a id="recover"></a>

### RECOVER — Cross-app recovery, accessibility and browser behavior

**Routes/functions:** `/offline`, `not-found`, `error boundary`, `all customer forms and navigation`

**Reviewed source:** [error.tsx](<../src/app/error.tsx>), [not-found.tsx](<../src/app/not-found.tsx>), [page.tsx](<../src/app/offline/page.tsx>), [AppShell.tsx](<../src/components/AppShell.tsx>), [MANUAL_DEVICE_QUALIFICATION.md](<../docs/MANUAL_DEVICE_QUALIFICATION.md>)

[Representative screenshot](ui-ux-audit-2026-09-18/public-not-a-real-route-390.png)

<a id="recover-01"></a>

#### RECOVER-01 · P2 · Confirmed in source — Public error recovery points to authenticated destinations

**Finding:** The global not-found page offers Go to Today and Get help, both protected routes for a signed-out visitor.

**Recommended change:** Offer public Home/Contact recovery when no account session exists.

**Acceptance:** A public broken link does not require signing in just to recover or ask for help.

<a id="recover-02"></a>

#### RECOVER-02 · P2 · Confirmed in source — Customer routes have no loading.tsx boundaries

**Finding:** Only the global error file exists among loading/error conventions. Server-rendered navigation has limited route-specific progress UI.

**Recommended change:** Add purposeful loading states for slow data-heavy routes, preserving layout and focus.

**Acceptance:** A throttled navigation communicates its destination and loading state without appearing inert.

<a id="recover-03"></a>

#### RECOVER-03 · P2 · Confirmed in source — Authenticated shell lacks the public skip link

**Finding:** Public marketing includes Skip to content; AppShell does not provide an equivalent visible-on-focus keyboard shortcut.

**Recommended change:** Add a consistent skip-to-main mechanism and reliable focus destination.

**Acceptance:** Keyboard users can bypass repeated workspace navigation in one step.

<a id="recover-04"></a>

#### RECOVER-04 · P2 · Heuristic recommendation — Offline copy does not distinguish saved from unsaved work

**Finding:** The offline page reassures users that saved work will be there, but offers no guidance about in-progress local drafts.

**Recommended change:** Explain which changes are saved and give an appropriate reconnect/draft recovery path.

**Acceptance:** Losing connectivity does not cause users to infer that an unsaved form has been stored.

<a id="recover-05"></a>

#### RECOVER-05 · P1 · Validation gap — Automated accessibility success is not full product qualification

**Finding:** Desktop/mobile Chromium scans and selected 320-pixel dark states passed. Screen readers, zoom, actual soft keyboards, Safari/Firefox and performance under load were not fully qualified.

**Recommended change:** Complete the cross-browser/device and assistive-technology matrix, using current WCAG criteria and real tasks.

**Acceptance:** Record keyboard, screen-reader, zoom, interruption and physical-device results; resolve blockers before unrestricted launch.

## Browser coverage and retained evidence

The [main JSON](ui-ux-audit-2026-09-18/browser-evidence.json) includes viewport, route, title, control dimensions, page width, visible copy, axe results and runtime errors. The [supplement JSON](ui-ux-audit-2026-09-18/supplement-evidence.json) and [interaction JSON](ui-ux-audit-2026-09-18/interaction-evidence.json) record additional states. The interactive board includes all screenshots. Snapshot pages show only their captured states; source review covered additional dynamic, unavailable and recovery paths.

| Environment | Route variant | Viewports | Example evidence |
| --- | --- | --- | --- |
| public | `/` | 1440, 390 | [Capture](ui-ux-audit-2026-09-18/public-1440.png) |
| public | `/for/real-estate-agents` | 1440, 390 | [Capture](ui-ux-audit-2026-09-18/public-for-real-estate-agents-1440.png) |
| public | `/for/consultants` | 1440, 390 | [Capture](ui-ux-audit-2026-09-18/public-for-consultants-1440.png) |
| public | `/for/photographers` | 1440, 390 | [Capture](ui-ux-audit-2026-09-18/public-for-photographers-1440.png) |
| public | `/for/contractors` | 1440, 390 | [Capture](ui-ux-audit-2026-09-18/public-for-contractors-1440.png) |
| public | `/for/independent-recruiters` | 1440, 390 | [Capture](ui-ux-audit-2026-09-18/public-for-independent-recruiters-1440.png) |
| public | `/follow-up-templates` | 1440, 390 | [Capture](ui-ux-audit-2026-09-18/public-follow-up-templates-1440.png) |
| public | `/follow-up-templates/estimate-follow-up` | 1440, 390 | [Capture](ui-ux-audit-2026-09-18/public-follow-up-templates-estimate-follow-up-1440.png) |
| public | `/follow-up-templates/proposal-follow-up` | 1440, 390 | [Capture](ui-ux-audit-2026-09-18/public-follow-up-templates-proposal-follow-up-1440.png) |
| public | `/features/follow-up-reminders` | 1440, 390 | [Capture](ui-ux-audit-2026-09-18/public-features-follow-up-reminders-1440.png) |
| public | `/faq` | 1440, 390 | [Capture](ui-ux-audit-2026-09-18/public-faq-1440.png) |
| public | `/waitlist` | 1440, 390 | [Capture](ui-ux-audit-2026-09-18/public-waitlist-1440.png) |
| public | `/register` | 1440, 390 | [Capture](ui-ux-audit-2026-09-18/public-register-1440.png) |
| public | `/login` | 1440, 390 | [Capture](ui-ux-audit-2026-09-18/public-login-1440.png) |
| public | `/forgot-password` | 1440, 390 | [Capture](ui-ux-audit-2026-09-18/public-forgot-password-1440.png) |
| public | `/reset-password` | 1440, 390 | [Capture](ui-ux-audit-2026-09-18/public-reset-password-1440.png) |
| public | `/verify-email/pending` | 1440, 390 | [Capture](ui-ux-audit-2026-09-18/public-verify-email-pending-1440.png) |
| public | `/waitlist/confirm` | 1440, 390 | [Capture](ui-ux-audit-2026-09-18/public-waitlist-confirm-1440.png) |
| public | `/waitlist/leave` | 1440, 390 | [Capture](ui-ux-audit-2026-09-18/public-waitlist-leave-1440.png) |
| public | `/contact` | 1440, 390 | [Capture](ui-ux-audit-2026-09-18/public-contact-1440.png) |
| public | `/privacy` | 1440, 390 | [Capture](ui-ux-audit-2026-09-18/public-privacy-1440.png) |
| public | `/terms` | 1440, 390 | [Capture](ui-ux-audit-2026-09-18/public-terms-1440.png) |
| public | `/offline` | 1440, 390 | [Capture](ui-ux-audit-2026-09-18/public-offline-1440.png) |
| public | `/not-a-real-route` | 1440, 390 | [Capture](ui-ux-audit-2026-09-18/public-not-a-real-route-1440.png) |
| app | `/jumps` | 1440, 390 | [Capture](ui-ux-audit-2026-09-18/app-jumps-1440.png) |
| app | `/contacts` | 1440, 390 | [Capture](ui-ux-audit-2026-09-18/app-contacts-1440.png) |
| app | `/contacts/new` | 1440, 390 | [Capture](ui-ux-audit-2026-09-18/app-contacts-new-1440.png) |
| app | `/contacts/demo_contact_sarah` | 1440, 390 | [Capture](ui-ux-audit-2026-09-18/app-contacts-demo-contact-sarah-1440.png) |
| app | `/contacts/demo_contact_sarah/edit` | 1440, 390 | [Capture](ui-ux-audit-2026-09-18/app-contacts-demo-contact-sarah-edit-1440.png) |
| app | `/contacts/import` | 1440, 390 | [Capture](ui-ux-audit-2026-09-18/app-contacts-import-1440.png) |
| app | `/contacts/duplicates` | 1440, 390 | [Capture](ui-ux-audit-2026-09-18/app-contacts-duplicates-1440.png) |
| app | `/contacts/archived` | 1440, 390 | [Capture](ui-ux-audit-2026-09-18/app-contacts-archived-1440.png) |
| app | `/contacts/custom-fields` | 1440, 390 | [Capture](ui-ux-audit-2026-09-18/app-contacts-custom-fields-1440.png) |
| app | `/mixes` | 1440, 390 | [Capture](ui-ux-audit-2026-09-18/app-mixes-1440.png) |
| app | `/mixes/new?custom=1` | 1440, 390 | [Capture](ui-ux-audit-2026-09-18/app-mixes-new-custom-1-1440.png) |
| app | `/mixes/demo_mix_relationship/edit` | 1440, 390 | [Capture](ui-ux-audit-2026-09-18/app-mixes-demo-mix-relationship-edit-1440.png) |
| app | `/mixes/system` | 1440, 390 | [Capture](ui-ux-audit-2026-09-18/app-mixes-system-1440.png) |
| app | `/templates` | 1440, 390 | [Capture](ui-ux-audit-2026-09-18/app-templates-1440.png) |
| app | `/journey` | 1440, 390 | [Capture](ui-ux-audit-2026-09-18/app-journey-1440.png) |
| app | `/calendar` | 1440, 390 | [Capture](ui-ux-audit-2026-09-18/app-calendar-1440.png) |
| app | `/more` | 1440, 390 | [Capture](ui-ux-audit-2026-09-18/app-more-1440.png) |
| app | `/settings` | 1440, 390 | [Capture](ui-ux-audit-2026-09-18/app-settings-1440.png) |
| app | `/settings/business` | 1440, 390 | [Capture](ui-ux-audit-2026-09-18/app-settings-business-1440.png) |
| app | `/settings/connections` | 1440, 390 | [Capture](ui-ux-audit-2026-09-18/app-settings-connections-1440.png) |
| app | `/settings/journey` | 1440, 390 | [Capture](ui-ux-audit-2026-09-18/app-settings-journey-1440.png) |
| app | `/settings/jump-date-types` | 1440, 390 | [Capture](ui-ux-audit-2026-09-18/app-settings-jump-date-types-1440.png) |
| app | `/settings/notifications` | 1440, 390 | [Capture](ui-ux-audit-2026-09-18/app-settings-notifications-1440.png) |
| app | `/settings/sending` | 1440, 390 | [Capture](ui-ux-audit-2026-09-18/app-settings-sending-1440.png) |
| app | `/account` | 1440, 390 | [Capture](ui-ux-audit-2026-09-18/app-account-1440.png) |
| app | `/account?section=security` | 1440, 390 | [Capture](ui-ux-audit-2026-09-18/app-account-section-security-1440.png) |
| app | `/account?section=privacy` | 1440, 390 | [Capture](ui-ux-audit-2026-09-18/app-account-section-privacy-1440.png) |
| app | `/account/preferences` | 1440, 390 | [Capture](ui-ux-audit-2026-09-18/app-account-preferences-1440.png) |
| app | `/help` | 1440, 390 | [Capture](ui-ux-audit-2026-09-18/app-help-1440.png) |
| app | `/account/tickets` | 1440, 390 | [Capture](ui-ux-audit-2026-09-18/app-account-tickets-1440.png) |
| admin | `/admin` | 1440, 390 | [Capture](ui-ux-audit-2026-09-18/admin-admin-1440.png) |
| admin | `/admin/users` | 1440, 390 | [Capture](ui-ux-audit-2026-09-18/admin-admin-users-1440.png) |
| admin | `/admin/users/demo_user` | 1440, 390 | [Capture](ui-ux-audit-2026-09-18/admin-admin-users-demo-user-1440.png) |
| admin | `/admin/support` | 1440, 390 | [Capture](ui-ux-audit-2026-09-18/admin-admin-support-1440.png) |
| admin | `/admin/waitlist` | 1440, 390 | [Capture](ui-ux-audit-2026-09-18/admin-admin-waitlist-1440.png) |
| admin | `/admin/access` | 1440, 390 | [Capture](ui-ux-audit-2026-09-18/admin-admin-access-1440.png) |
| admin | `/admin/admission` | 1440, 390 | [Capture](ui-ux-audit-2026-09-18/admin-admin-admission-1440.png) |
| admin | `/admin/templates` | 1440, 390 | [Capture](ui-ux-audit-2026-09-18/admin-admin-templates-1440.png) |
| admin | `/admin/templates/new` | 1440, 390 | [Capture](ui-ux-audit-2026-09-18/admin-admin-templates-new-1440.png) |
| admin | `/admin/system-mix` | 1440, 390 | [Capture](ui-ux-audit-2026-09-18/admin-admin-system-mix-1440.png) |
| admin | `/admin/team` | 1440, 390 | [Capture](ui-ux-audit-2026-09-18/admin-admin-team-1440.png) |
| admin | `/admin/email` | 1440, 390 | [Capture](ui-ux-audit-2026-09-18/admin-admin-email-1440.png) |
| admin | `/admin/email/recovery` | 1440, 390 | [Capture](ui-ux-audit-2026-09-18/admin-admin-email-recovery-1440.png) |
| admin | `/admin/email/suppressions` | 1440, 390 | [Capture](ui-ux-audit-2026-09-18/admin-admin-email-suppressions-1440.png) |
| admin | `/admin/reports` | 1440, 390 | [Capture](ui-ux-audit-2026-09-18/admin-admin-reports-1440.png) |
| admin | `/admin/reports/exports` | 1440, 390 | [Capture](ui-ux-audit-2026-09-18/admin-admin-reports-exports-1440.png) |
| admin | `/admin/reports/history` | 1440, 390 | [Capture](ui-ux-audit-2026-09-18/admin-admin-reports-history-1440.png) |
| admin | `/admin/operations` | 1440, 390 | [Capture](ui-ux-audit-2026-09-18/admin-admin-operations-1440.png) |
| admin | `/admin/operations/alerts` | 1440, 390 | [Capture](ui-ux-audit-2026-09-18/admin-admin-operations-alerts-1440.png) |
| admin | `/admin/audit` | 1440, 390 | [Capture](ui-ux-audit-2026-09-18/admin-admin-audit-1440.png) |
| admin | `/admin/settings` | 1440, 390 | [Capture](ui-ux-audit-2026-09-18/admin-admin-settings-1440.png) |

Additional retained states: [onboarding-390](ui-ux-audit-2026-09-18/onboarding-390.png), [onboarding-no-method-result](ui-ux-audit-2026-09-18/onboarding-no-method-result.png), [template-double-audience](ui-ux-audit-2026-09-18/template-double-audience.png), [support-detail-390](ui-ux-audit-2026-09-18/support-detail-390.png), [journey-configuration-populated](ui-ux-audit-2026-09-18/journey-configuration-populated.png), [journey-populated](ui-ux-audit-2026-09-18/journey-populated.png), [dark320-jumps](ui-ux-audit-2026-09-18/dark320-jumps.png), [dark320-contacts](ui-ux-audit-2026-09-18/dark320-contacts.png), [dark320-contacts-new](ui-ux-audit-2026-09-18/dark320-contacts-new.png), [dark320-mixes-new-custom-1](ui-ux-audit-2026-09-18/dark320-mixes-new-custom-1.png), [dark320-calendar](ui-ux-audit-2026-09-18/dark320-calendar.png), [dark320-settings-connections](ui-ux-audit-2026-09-18/dark320-settings-connections.png), [dark320-account-preferences](ui-ux-audit-2026-09-18/dark320-account-preferences.png), [dark320-help](ui-ux-audit-2026-09-18/dark320-help.png), [hosted-lead-390](ui-ux-audit-2026-09-18/hosted-lead-390.png), [review-390](ui-ux-audit-2026-09-18/review-390.png), [review-low-score-receipt](ui-ux-audit-2026-09-18/review-low-score-receipt.png), [admin-support-detail-390](ui-ux-audit-2026-09-18/admin-support-detail-390.png), [dark320-admin-admission](ui-ux-audit-2026-09-18/dark320-admin-admission.png), [dark320-admin-reports](ui-ux-audit-2026-09-18/dark320-admin-reports.png), [dark320-admin-team-view-add](ui-ux-audit-2026-09-18/dark320-admin-team-view-add.png), [dark320-admin-templates-new](ui-ux-audit-2026-09-18/dark320-admin-templates-new.png).

## References and interpretation

The audit consulted the [asset reference index](../assets/README.md), the five linked ICP profiles, both supplied [conversion-copywriting guidance](<../assets/Joanna Wiebe - Conversion copywriting.md>) and [marketing guidance](<../assets/Joanna Wiebe - Marketing Principles.md>), and the [homepage experience roadmap](HOMEPAGE_EXPERIENCE_ROADMAP_2026-09-10.md). These support task, clarity and claim-review decisions; they do not supply measured product outcomes. The original documents were preserved. Installed Next.js accessibility and error-handling guidance was checked; the installed error-boundary `retry` API was not treated as a defect based on older framework conventions.

For follow-up accessibility qualification, apply the current [W3C target-size minimum guidance](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) and [input-purpose guidance](https://www.w3.org/WAI/WCAG22/Understanding/identify-input-purpose.html). Small controls are not automatically failures without checking spacing and exceptions. No blanket target-size violation is asserted from screenshots alone.

Readiness requires repair evidence, real-channel/device qualification and clear ownership of accepted design tradeoffs. This report records gaps and proposed checks; it does not certify that all possible defects have been discovered or that any finding has already been repaired.
