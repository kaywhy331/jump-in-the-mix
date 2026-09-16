# Admin UI, UX, and workflow audit — September 16, 2026

**Verdict: the admin has a solid foundation, but it is not yet optimized for minimal, predictable day-to-day work.** Overview and the ready-made mix list provide useful patterns. Several other pages combine a queue, instructions, configuration, diagnostics, and action forms into one long screen. More consequentially, some ordinary interactions discard work, some queues cannot be browsed completely, and related tasks lose context between pages.

This is an audit and proposed improvement plan. No application fixes or deployments were made. Recommendations below are design judgments; they are not measured improvements in staff productivity.

## Scope and evidence

- Reviewed all **25 admin page routes**, their relevant components/actions, navigation, permissions, and the associated administrator security page at source revision `e52eea3`.
- Loaded **28 route/state combinations**, including waitlist history and MFA verification, in Chromium against a separate local source copy and disposable PostgreSQL database. All ultimately returned HTTP 200. Used synthetic accounts, 103 support tickets, seven waitlist entries, 40 shipped library mixes, and invitation/recovery/report examples. No customer records or real email delivery were involved.
- Ran **84 automated accessibility/layout scans**: each state at 1440 px/light, 390 px/light, and 320 px/dark, with a 1000 px viewport height. No document-level horizontal overflow was found in these states. Two pages had dark-mode color-contrast violations; both were reproduced at desktop width. Passing these scans is not complete accessibility certification.
- Checked five queue/settings pages at 768 and 1080 px, and exercised draft loss, disclosure navigation, permission links, account-sheet keyboard dismissal, invitation filter continuity, and staff-only MFA navigation.
- Read and visually inspected the rendered pages. Screenshots and a compact machine-readable record accompany this report in [audit evidence](admin-ux-audit-2026-09-16/verification.json).
- This was a local current-source audit, not a claim about the deployed production build. The local development server restarted once under compilation memory pressure; the affected saved-report page was retested successfully. Development timings were not used as production performance measurements. Live provider recovery, real MFA enrollment/lost-device recovery, every mutation, every role override, and assistive-technology user testing remain outside the executed browser coverage.

**Priority:** High means possible lost work, misleading task state, inaccessible information, or a blocked workflow. Medium means meaningful friction or unnecessary complexity. Low means polish. A page's priority reflects its most significant finding, not that every suggestion has the same urgency.

## Page-by-page review

### 1. Overview — `/admin` — Medium

**Keep:** Three compact metrics, a permission-aware attention queue, direct links to failed jobs and support needing a reply, and a visible monitoring-freshness warning. This is one of the clearest pages.

**Gaps:** The attention queue covers monitoring, failed jobs, and support awaiting a reply. It does not directly include invitation delivery review, failed support notification emails, or access-capacity blockers. Some may contribute to operational alerts, but the dashboard does not enumerate them as actionable queues. “No outstanding items in your queues” therefore sounds more comprehensive than the implemented checks. The total-account metric includes staff-only accounts, while admission and growth reports use different account populations.

**Change:** Keep the layout; make attention coverage explicit and add permission-filtered delivery/access exceptions with a direct next step. Use “Registered accounts, including staff” or a deliberately shared customer-account definition. Link useful metrics to the corresponding filtered view. Avoid adding more passive tiles.

[Source](../src/app/(staff)/admin/page.tsx)

### 2. Reports — `/admin/reports` — Medium

**Keep:** Bounded date ranges, UTC labels, cohort definitions, aggregate privacy, and separate export preparation.

**Gaps:** Date controls, explanatory copy, navigation, and a full export card precede the first metric section. In the desktop fixture, “Waitlist” starts around y=824; the page is 4,722 px tall and reaches 7,860 px on the 390 px phone view. Growth, retention, content adoption, delivery, infrastructure usage, and daily trends all receive similar visual weight. Tables expose many columns, and the useful trend is near the bottom.

**Change:** Put a compact date toolbar and Export action above a short summary. Use Growth, Engagement, Content, and Operations sections/tabs with the relevant trend near the top. Move detailed definitions into accessible disclosures while keeping denominator, time window, and observation-time labels beside the metric. Preserve the underlying distinctions between cohort outcomes and current operational counts.

[Page](../src/app/(staff)/admin/reports/page.tsx) · [Report renderer](../src/components/AdminReportView.tsx) · [Screenshot](admin-ux-audit-2026-09-16/reports-1440.png)

### 3. Saved daily reports — `/admin/reports/history` — Medium

**Keep:** Observation times, clear treatment of missing days, and separation of storage measurements from activity recalculations.

**Gaps:** Database-size history comes before daily activity even when there are no storage observations. One page number controls two independently populated series. A reader must understand substantial storage/cohort implementation detail before reaching the results. Links back to live reports do not carry the selected range.

**Change:** Make activity history the default and give storage its own tab or explicitly separate pagination. Keep the date range when switching live/history views. Place retention and recalculation rules in “About saved reports,” with a concise “Missing means not recorded” note near the table.

[Source](../src/app/(staff)/admin/reports/history/page.tsx)

### 4. Saved report detail — `/admin/reports/history/[snapshotId]` — Medium

**Keep:** Saved observation time and a direct “Recalculate this day live” link.

**Gaps:** A one-day observation renders almost the whole long live-report layout. Saved usage is displayed against current email limits; the explanation is present, but comparing a historical numerator with a current limit still takes care. “Back to saved reports” loses the original history range/page. Saved daily records can later be recalculated, so users should not infer an immutable archive.

**Change:** Use a prominent “Saved observation” label, compact daily highlights, and domain sections matching live reports. Label current limits at the value, not only in introductory prose. Preserve the history return location. Offer live comparison without implying the two calculations must agree.

[Source](../src/app/(staff)/admin/reports/history/[snapshotId]/page.tsx)

### 5. Report exports — `/admin/reports/exports` — Medium

**Keep:** Clear sign-in ownership, expiry, aggregate-only contents, and queued/ready/failure distinctions.

**Gaps:** The admin must manually refresh to discover completion. Failed exports suggest asking an operator but do not provide an authorized, job-specific handoff. Returning to Reports loses the requested range. The query takes 20 records without a visible “latest 20” qualifier or pagination.

**Change:** Show a compact request list with bounded polling while visible, a last-checked time, and a completion announcement. Provide “Try a shorter range” with the original dates preserved, and a filtered operator link where permission allows. Keep the existing session-bound download protection and show expiry as both remaining time and an exact timestamp.

[Source](../src/app/(staff)/admin/reports/exports/page.tsx)

### 6. Users — `/admin/users` — Medium

**Keep:** Name/email/workspace search, access filtering, pagination, visible account status, and sensitive actions inside a sheet. The sheet passed the keyboard check: Escape closes it and focus returns to its trigger.

**Gaps:** A large impersonation explanation precedes the user list even though support views start from a ticket. Each user receives a large card containing multiple statuses, session information, workspace details, and repeated support links. Fifty such cards will be difficult to scan. There is no focused account detail destination bringing together account state, invitations, support, and relevant activity. The search field is visually squeezed by the full-width status select on desktop.

**Change:** Use compact account rows with name, email, access, workspace, and one contextual action. Open a detail drawer/page for sessions and account changes. Keep the existing customer-specific support search. Move support-view explanations to the action that starts the view, and remove unrelated content-library shortcuts from this task.

[Source](../src/app/(staff)/admin/users/page.tsx)

### 7. Waitlist, including Access history — `/admin/waitlist` — High

**Keep:** Search, pagination, confirmation state, capacity checks, separate waiting/history views, and explicit warnings about queued mail continuing after a wave pause.

**Gaps:** Automatic-wave configuration comes before the waiting queue. In the fixture, the queue heading starts around y=911 on desktop; pending deliveries are around y=2,971. With only seven entries, the page is 4,001 px tall at 390 px. Waiting and unconfirmed people share a view; there is no confirmation filter, selected-count summary, or select-all-eligible control. Selection is confined to the current page. Delivery problems, recent waves, and recent activity are appended after the entire list. Links to worker health can lead a Growth-role admin to a denied page.

**Change:** Start with a small readiness strip: next wave, available spaces, and current blocker. Put the waiting queue next, with confirmed/unconfirmed filtering and a sticky selection summary. Open manual invitation review after selection, showing recipients and capacity before submission. Give Delivery problems and Wave history their own tabs; make schedule controls a contextual “Manage schedule” action. Clearly state whether selection is page-local.

[Source](../src/app/(staff)/admin/waitlist/page.tsx) · [Screenshot](admin-ux-audit-2026-09-16/waitlist-1440.png)

### 8. Invitations — `/admin/access` — High

**Keep:** Separate grant and email-delivery information, reasoned revocation, and restricted safe retries.

**Gaps:** Up to 50 large records expose identifiers and change forms inline. An advanced System Mix version filter is more prominent than common source/status/date filters, which are absent. When retry is unavailable, the page tells the operator to inspect the provider without a recipient-specific recovery link. **Verified:** revoking an invitation from `?q=morgan&review=1` returns to `?done=revoke`, discarding both filters. Grant status and transport status are combined into dense prose and raw uppercase values.

**Change:** Use a compact invitation ledger with separate Access and Email columns. Add common status/source filters and move version filtering under Advanced. Open a selected invitation's timeline and only its eligible actions. Link directly to recovery/suppression for that recipient, retain the return query, and surface the result on the affected record.

[Page](../src/app/(staff)/admin/access/page.tsx) · [Action](../src/lib/access-admin-actions.ts)

### 9. Support queue — `/admin/support` — High

**Keep:** Search across useful customer identifiers, priority/status/category filters, assignment display, and a dedicated “Needs a reply” filter used by Overview.

**Gaps:** **Verified:** 103 synthetic tickets produce 100 rendered rows and no next-page control or truncation notice. The omitted tickets remain searchable, but cannot be reached by browsing the default queue. There are no “Mine” or “Unassigned” views. The default shows all statuses rather than actionable work. **Verified:** customer-waiting tickets display **“Waiting on you”** to the administrator because customer-facing labels are reused. The Support-role header also offers “Ready-made mixes”; following it reaches Access denied. The large cards produced a 27,396 px page at 390 px in this volume fixture.

**Change:** Add real pagination and a matching total. Default to Needs a reply, with Mine, Unassigned, Waiting on customer, and All views. Use administrator-specific status labels. Present one compact row per ticket, prioritizing response age, urgency, and assignment. Permission-filter every shortcut, not only the sidebar.

[Page](../src/app/(staff)/admin/support/page.tsx) · [Shared status labels](../src/lib/support-content.ts)

### 10. Support ticket — `/admin/support/[ticketId]` — High

**Keep:** Conversation and reply together, customer context, auditable assignment, explicit notification status, and ticket-bound view-only customer access.

**Gaps:** **Verified:** writing a reply and clicking Save triage clears the unsent reply. The reply composer is keyed by a new request UUID on each render. Selecting a response template also replaces existing text without a replacement warning. Assignment, triage, status, and reply are separate forms; a routine resolution requires multiple actions and can interrupt drafting. On mobile, assignment/status/customer context follow the conversation and composer, delaying essential context. “Users” opens the whole list rather than this customer. Dark-mode timestamps fail contrast at both phone and desktop widths.

**Change:** Preserve the draft across metadata saves and errors. Keep status, assignee, priority, and a compact customer summary near the title. Offer an explicit “Reply and resolve” option while retaining independent status changes. Confirm template replacement when a draft exists. Use contextual account links and preserve the originating queue filters. Keep assignment, reasons, and permission checks required for opening customer content.

[Page](../src/app/(staff)/admin/support/[ticketId]/page.tsx) · [Composer](../src/components/SupportReplyComposer.tsx) · [Mobile screenshot](admin-ux-audit-2026-09-16/support-detail-390.png)

### 11. Ready-made mixes — `/admin/templates` — Medium

**Keep:** The strongest list pattern in the admin: compact rows, search, sort, visibility counts, explicit page totals, and one Create action. Existing tests and source show filter-preserving pagination.

**Gaps:** “Drafts & hidden” combines unpublished first drafts with deliberately hidden releases. Published records also display “Draft 1,” and published items with unpublished changes stay in Published rather than forming a dedicated review queue. Category and industry filters are absent. Returning from editing resets the previous list search/page.

**Change:** Distinguish Never published, Published, Unpublished changes, and Hidden. Provide a Needs review view and optional category/industry filters. Reuse this page's row and pagination conventions elsewhere. Preserve the list return location in the editor.

[Source](../src/app/(staff)/admin/templates/page.tsx)

### 12. Create library draft — `/admin/templates/new` — High

**Keep:** Draft creation is separate from publication; the editor supports beat ordering and saved preview review.

**Gaps:** Every beat exposes email subject, message, call/voicemail notes, and SMS controls regardless of channel. Date-type fields remain visible for manually started mixes, and the date key asks the admin to handle an internal identifier. The first beat starts below the initial desktop viewport. Some checkbox controls are visually separated from their labels. **Verified:** submitting a date-triggered draft without its date type shows the validation error but clears the entered title and description. Errors redirect to a fresh form rather than preserving the submission.

**Change:** Display fields according to the selected trigger/channel; generate internal keys. Show beats as compact summaries with one expanded editor. Keep a visible Save draft action and unsaved-state indicator. Preserve all non-secret entered values on validation failure and place errors beside the responsible field. Add a placeholder picker and an explicitly unsaved preview if useful; publication must still use the saved version.

[Form](../src/components/LibraryDraftForm.tsx) · [Action](../src/lib/shared-mix-admin-actions.ts) · [Screenshot](admin-ux-audit-2026-09-16/library-new-1440.png)

### 13. Review/edit library mix — `/admin/templates/[sharedMixId]/edit` — High

**Keep:** Saved-version previews, distinct publication permission, impact on future copies, version history, and rollback.

**Gaps:** **Verified:** clicking “2. Preview & publish” scrolls to the closed disclosure but does not open it; the preview remains invisible. The editor inherits the draft form's excessive fields and error recovery limitations. Reviewing a release requires comparing separate full previews rather than an explicit change summary. Reasons/passwords repeat within publication/history forms, and history displays author IDs rather than recognizable staff identity.

**Change:** Make the workflow controls open the target step and move focus to it. Use Edit, Preview & publish, and History with unmistakable saved/draft/published state. Present “Changes since published version” and the customer impact beside the release action. Open authentication and reason fields only after choosing Publish, Hide, or Roll back; keep each operation's existing authorization requirements.

[Source](../src/app/(staff)/admin/templates/[sharedMixId]/edit/page.tsx)

### 14. System Mix — `/admin/system-mix` — Medium

**Keep:** Versioned wording, saved previews with example data, explicit preservation of queued content, and links from versions to prepared invitations.

**Gaps:** The order is release explanation, draft preview, published preview, then editing. In the fixture, **Edit the next draft starts around y=1,954** on desktop. Identical published/draft previews are both expanded. Its workflow differs from the library editor despite sharing draft/preview/publish/history concepts. The navigation label “System Mix” does not make its administrative purpose obvious.

**Change:** Label it “Invitation wording,” retaining System Mix as supporting terminology. Reuse the content editor workflow. Show one working preview, disclose the current published version, and provide a diff when wording changes. Put detailed release mechanics beside publication rather than ahead of editing.

[Source](../src/app/(staff)/admin/system-mix/page.tsx) · [Screenshot](admin-ux-audit-2026-09-16/system-mix-1440.png)

### 15. Operations — `/admin/operations` — High

**Keep:** Failure-focused default filter, clickable job counts, real heartbeat evidence, cleanup freshness, and guarded retry eligibility.

**Gaps:** Retention information and heartbeat records come before the background-job queue; the queue starts around y=1,065 in the small desktop fixture. Jobs are capped at 100 without pagination or a truncation notice. Raw task names and worker identifiers dominate the diagnostic rows. Most content is a static observation without a refresh affordance. **Verified:** dark-mode labels on the hardcoded pale success/failure cards fail contrast; six text nodes failed in the tested operations state.

**Change:** Give System health, Failed work, and Maintenance clear subviews. Show actionable failures first, with customer impact and an authorized next step. Keep raw job/lease/worker identifiers in expandable diagnostics. Add paging, consistent observed-at/refresh controls, and theme-aware semantic colors.

[Source](../src/app/(staff)/admin/operations/page.tsx) · [Dark screenshot](admin-ux-audit-2026-09-16/operations-dark-1440.png)

### 16. Operational alerts — `/admin/operations/alerts` — Medium

**Keep:** Missing/stale monitoring is explicit. Acknowledgment is correctly distinct from recovery and recorded with a reason.

**Gaps:** The page explains the alert system before displaying incidents. Checks are ordered by code, not severity or current actionability. Healthy, unknown, acknowledged, and active problem states have no dedicated filters. Evidence and notification receipts are large text blocks; a newcomer must infer what the operational consequence is and where to act.

**Change:** Sort active critical/warning incidents first; provide Open, Acknowledged, and All views. Lead each row with impact, freshness, and next step. Expand evidence and notification history on demand. Keep the warning when monitoring is stale even if saved checks say OK.

[Source](../src/app/(staff)/admin/operations/alerts/page.tsx)

### 17. Email overview — `/admin/email` — Medium

**Keep:** Separation of sending allowance, delivery evidence, recipient blocks, and provider acceptance versus inbox delivery.

**Gaps:** Capacity is described in long paragraphs instead of an immediately readable used/remaining/reserved display. Delivery follow-up branches to Invitations, Team, Suppression, and Recovery. Support notification failures have their own queue elsewhere. Provider events expose record IDs with no recipient/task handoff, search, or older-event browsing. Configuration variable names occupy routine operating space.

**Change:** Use a compact capacity summary and a permission-scoped “Email needing attention” queue spanning customer invitations, staff invitations, and support notifications. Reuse contextual recovery within the original record. Keep raw provider events and deployment configuration in a Diagnostics section. Label truncated recent-event lists explicitly.

[Source](../src/app/(staff)/admin/email/page.tsx)

### 18. Email recovery — `/admin/email/recovery` — High

**Keep:** The distinction between recording an existing acceptance, checking the provider, and deliberately sending another copy. Review requirements and duplicate-delivery consequences are explicit.

**Gaps:** The list mixes record discovery with per-record action forms and procedural explanation. Eligibility information is incomplete in the listing: it selects delivery state and purge state but does not display every grant/cooldown blocker checked by the action. An admin may expand and fill a review only to learn it cannot proceed. Success/error redirects lose search/status/page context. The originating ticket or invitation is not carried through.

**Change:** Open a single delivery detail from the owning record. Show a three-step decision path: inspect delivery evidence, identify the eligible action, then review and confirm. Display cooldown and invalid-grant blockers before asking for a password or investigation references. Preserve recipient, filters, and return location. Do not collapse receipt recovery and resend into an ambiguous “Retry” button.

[Page](../src/app/(staff)/admin/email/recovery/page.tsx) · [Actions](../src/lib/email-suppression-actions.ts)

### 19. Recipient suppression list — `/admin/email/suppressions` — Medium

**Keep:** Recipient grouping, pagination, search, and distinction between provider blocks and recipient opt-out.

**Gaps:** A whole card shows only an address and number of blocks. The admin must open each record to learn the reason, age, or whether an operator-clearable block exists. There are no reason/status filters, result total, or explicit parent breadcrumb. Returning from review drops the recipient search/page.

**Change:** Use rows with recipient, block reasons, last event, and review eligibility. Add reason filtering and preserve list context. Keep recipient opt-out visibly distinct from provider suppression throughout the workflow.

[Source](../src/app/(staff)/admin/email/suppressions/page.tsx)

### 20. Suppression review — `/admin/email/suppressions/[suppressionId]` — Medium

**Keep:** This page is correctly record-specific. It explains local versus provider clearance, preserves recipient opt-out, and does not restore revoked grants or send email automatically.

**Gaps:** Long explanatory paragraphs precede a dense confirmation form. Request references must be entered manually even when the admin arrived from a support investigation. The recent clearance history exposes staff IDs, and the declared full audit history has no contextual link. MFA interruption redirects back without preserving the review inputs.

**Change:** Organize the page as Current blocks → Evidence and requested change → Confirm. Carry an existing case reference when authorized, preserving the requirement for actual review. Show a concise post-clearance checklist with the next permissible action for this recipient. Preserve non-secret draft inputs through verification, and provide a filtered audit link.

[Source](../src/app/(staff)/admin/email/suppressions/[suppressionId]/page.tsx)

### 21. Audit — `/admin/audit` — High

**Keep:** Read-only records, redaction, structured before/after details, and separation of platform events from workspace events at the data level.

**Gaps:** A shared-looking toolbar controls two lists differently: platform search covers action/entity ID; workspace search also covers names, email, workspace, and source. Actor/source filters affect only workspace events, although they sit above both lists. Platform events show raw actor IDs. The queries cap results at 100 platform and 200 workspace events with no date filter or pagination. “No audit records matched” can appear for the workspace list below matching platform events.

**Change:** Provide one coherent event explorer with normalized filter semantics, or explicit Platform/Workspace tabs with their own clearly scoped filters. Add date range, pagination, human-readable actor identity where allowed, and entity links. Show a short change summary first and redacted structured data on expansion. Retain the existing privacy boundaries.

[Source](../src/app/(staff)/admin/audit/page.tsx)

### 22. Team — `/admin/team` — Medium

**Keep:** Staff roles, effective access, per-person overrides, MFA status, invitation expiry, and session-revocation consequences are all available.

**Gaps:** Invite a new account, invitation history, and Add staff access appear before the current staff roster. The admin must first decide whether the person already has an account. Permission editing offers independent Grant and Deny checkboxes for the same permission, allowing a confusing combination even though denial correctly wins. Role choices are technical uppercase names; default capabilities are not previewed while choosing a role. Staff listing stops at 100 and asks the operator for help rather than providing search/pagination.

**Change:** Start with a searchable roster and one “Add team member” action that checks account state and presents the appropriate path. Put invitations in a separate tab. Use role descriptions and a capability preview. For each exception use one control: Role default / Allow / Deny, showing the effective outcome. Summarize changes and who will be signed out before saving.

[Source](../src/app/(staff)/admin/team/page.tsx) · [Screenshot](admin-ux-audit-2026-09-16/team-1440.png)

### 23. Admission — `/admin/admission` — Medium

**Keep:** Accurate reservation accounting, separate pause controls, explicit impact, concurrency conflict handling, and restoration of a draft after MFA verification. **This is the best existing pattern for preserving work across reauthentication.**

**Gaps:** Capacity and saved states are primarily prose. Four pause controls must be understood alongside the separate waitlist-wave pause. An emergency account-creation pause is mixed with ordinary limits. Changing these controls means leaving the access workflow for a Settings destination. The page can show “open” pauses while zero capacity still prevents new invitations, requiring the admin to combine several facts mentally.

**Change:** Place this under Access → Capacity & pauses. Lead with effective readiness and its cause, then show used/reserved/available capacity. Use a state table for waitlist collection, weekly waves, new invitations, referrals, and redemption, including what continues during a pause. Separate emergency controls visually and preview the impact of a proposed change.

[Source](../src/app/(staff)/admin/admission/page.tsx)

### 24. System Settings — `/admin/settings` — High

**Keep:** Narrow scope, validated reviewed options, default/customized state, and a reset path.

**Gaps:** This page only controls mix categories/industries, so “System Settings” overstates its scope. The free-text editor invites new values, but only an existing reviewed subset is accepted. **Verified:** an unsupported category causes a server-action HTTP 500 and reaches generic page-error handling instead of a field-level correction. The introductory text says duplicates are rejected; the helper and implementation remove them. Saving has no explicit success/pending confirmation. The library admin draft form still uses the full hardcoded option lists rather than the configured subset, so the settings' consumer scope is unclear.

**Change:** Move it to Content → Library options. Use selectable/reorderable reviewed options, or clearly constrain and validate the text editor inline. Explain which customer/editor surfaces each option list affects. Preserve invalid edits for correction, show saved state, and explain reset impact. Remove internal configuration keys from the main view.

[Page](../src/app/(staff)/admin/settings/page.tsx) · [Validation/actions](../src/lib/admin-settings-actions.ts) · [Option definitions](../src/lib/platform-settings.ts)

### 25. Access denied — `/admin/access-denied` — Medium

**Keep:** A short explanation with a recovery link.

**Gaps:** It does not identify the requested capability or provide a contextual way back. “Back to administration” always targets Overview, even though individual permission overrides can remove dashboard access. Several page-level links send users here despite a correctly filtered sidebar.

**Change:** Prevent avoidable denied links. For direct URL access, name the capability in plain language, retain a safe return route, and link to the first area the user can access. An owner-contact reference can help; an automated access-request workflow is optional and should not be added unless the team needs one.

[Source](../src/app/(staff)/admin/access-denied/page.tsx)

### 26. Administrator security — `/account/admin-mfa` — High

**Keep:** Separate setup, verification, and verified states; recovery-code count; pending feedback; and support for authenticator or recovery codes.

**Gaps:** **Verified:** a staff-only account clicking “Return to Today” from verification is sent to `/register`, headed “An invitation from someone you know.” That is an inappropriate escape path for an existing staff member. The verified screen describes session access lasting up to 720 minutes, while sensitive actions require verification within ten minutes; it does not make that second lifetime or a proactive verify action clear. Most sensitive forms lose their non-secret inputs during a verification detour; Admission already solves this. The verified state reports remaining recovery codes without a visible next step if codes/device access need attention.

**Change:** Return to the permitted staff destination or original task. Explain “Admin session verified” separately from “Recent verification required for this change.” Offer contextual verification before a long form is submitted, preserve a scoped draft, and require a deliberate final save on return. Clarify the recovery-support path without weakening MFA or displaying secrets in diagnostic records.

[Page](../src/app/(staff)/account/admin-mfa/page.tsx) · [Panel](../src/components/AdminMfaPanel.tsx)

## Assessment of the admin as a whole

### A. Consolidate navigation around tasks

An Owner currently receives 15 sidebar destinations across five groups. The issue is less the number alone than the split between related responsibilities. Waitlist, Invitations, Admission, Email recovery, and recipient suppression describe different parts of one access/delivery journey. Library editing and library options are separated. System health is divided among Overview, Operations, Alerts, Email, Reports, and Audit.

Use eight primary destinations, with permission-aware child tabs and contextual detail pages:

| Primary destination | Content and existing pages | Main question answered |
| --- | --- | --- |
| Overview | Action queue, essential signals, recent work | What needs me now? |
| Customers | Users, a focused customer/account detail | Who is this person and what is their current state? |
| Access | Waitlist, invitations, waves, capacity & pauses | Who can join, and what is blocking them? |
| Support | Needs reply, Mine, Unassigned, ticket detail | Which conversation needs an action? |
| Content | Ready-made mixes, invitation wording, library options | What is drafted, published, or awaiting review? |
| Reports | Growth, engagement, content, saved observations, exports | What is changing over time? |
| Operations | Health, alerts, jobs, email, suppression, audit | What is failing and what can recover it? |
| Settings | Team and administrator/account preferences | Who can operate the system? |

Email recovery should have one canonical implementation reachable directly from an invitation, staff invitation, or support notification. A specialist can also reach the appropriate queue through Operations. Moving a page under a shared parent must not grant access to all its children; retain current per-capability authorization and hide unavailable tabs.

### B. Keep the person or record in context

**Current access investigation:** find the person in Waitlist or Invitations → read an ambiguous delivery state → navigate to Email/Recovery → search the recipient again → possibly open Suppression → return and reconstruct the prior filters.

**Proposed:** open the invitation → see grant state, latest delivery evidence, blocks, and eligible actions together → enter the required review → return to the same filtered queue with the changed row visible.

**Current support resolution:** search queue → open ticket → type a reply → save classification/assignment separately → risk losing reply → follow an unfiltered Users link → return without queue context.

**Proposed:** open from Needs reply/Mine → see account and delivery context beside the thread → change metadata without losing the draft → explicitly Reply or Reply and resolve → return to the same queue or next ticket.

**Current content publication:** search mix → edit many fields → lose edits on server validation failure → use a shortcut that leaves preview closed → compare full versions manually → reauthenticate and re-enter review inputs.

**Proposed:** find Needs review → edit only relevant fields → keep draft through errors → review saved changes and customer impact → verify if needed → confirm publication → return to the original list.

A customer overview can unify metadata without becoming unrestricted customer impersonation. Continue requiring the assigned active support case and separate grant before reading customer workspace content.

### C. Adopt a small set of shared screen patterns

| Pattern | Recommended structure | Apply to |
| --- | --- | --- |
| Work queue | Title/count → one primary action → search and common filters → compact rows → pagination | Users, invitations, waitlist, support, jobs, suppression, audit |
| Record detail | Identity and state → relevant history/context → one next action → diagnostics on demand | Account, invitation/delivery, support ticket, suppression |
| Content editor | Draft state → relevant fields → saved preview/change summary → publication → history | Library and System Mix |
| Sensitive change | Selected operation and impact → reason/evidence → reauthentication → explicit confirmation → contextual result | Access, staff, publication, suppression, resends |
| Report | Date range → highlights/trend → domain details → definitions/export tools | Live and saved reports |

Use compact rows on desktop and short stacked records on phones. Open detailed forms only after a record/action is selected. Avoid rendering fifty password/reason forms in a discovery list. Keep important consequences visible at confirmation; move repeated education and raw diagnostics out of the default reading path.

### D. Make state, feedback, and terminology consistent

- Use an admin-specific vocabulary: **Waiting on customer**, **Needs review**, **Accepted by provider**, **Published**, **Unpublished changes**, and **Hidden**. Keep access state separate from email state. Do not claim delivery/read confirmation that the system cannot establish.
- Standardize search behavior. Users, Operations, and Audit currently gain automatic search/filter submission through `GlobalLiveSearch`; Support, the library, and several other admin lists require an explicit button. Choose a documented pattern, announce result changes, and show pending state. An empty live-region element is not itself a result announcement.
- Preserve search, filters, sorting, pagination, selected record, and return location through detail and action flows. Preserve non-secret drafts across validation, concurrent changes, and MFA; clear passwords on completion/interruption as appropriate.
- Make all write actions show pending and success/error feedback. Do not use a whole-page error boundary for expected validation errors. Provide a focused correction path and restore the relevant control.
- Use one staff identity/role display and a clear environment label. The current header has Security/Sign out but no visible signed-in operator name or test/production marker. A compact environment marker would help distinguish this project's separate test/customer sites.
- Use consistent operator date preferences with visible timezone where relevant; keep UTC explicitly attached to report cohort boundaries. Resolve staff IDs to readable names where permission and retention allow.
- Use shared checkbox/radio rows so controls sit beside their labels; remove the current detached centered-checkbox treatment. Fix semantic colors in both themes rather than styling pale cards independently of their text tokens.

### E. Prioritize without flattening necessary controls

| Order | Work | Completion criteria |
| --- | --- | --- |
| 1 — Prevent mistakes and lost work | Support/library draft preservation; admin status labels; settings validation; library step navigation; permission-aware links; staff MFA return path; dark contrast | Each reproduced issue has a browser regression check and an understandable user outcome. |
| 2 — Make queues complete | Support/job/audit pagination and totals; useful actionable defaults; assignment filters; honest truncation labels for intentionally recent lists | Older matching records remain reachable; every list states what is being shown and retains filters. |
| 3 — Connect access and customer workflows | Account detail; invitation/delivery detail; contextual suppression/recovery; shared return-state handling; Access capacity tab | A missing-invitation investigation does not require repeatedly searching the same recipient across pages. |
| 4 — Reduce routine screen complexity | Shared queue rows; roster-first Team; contextual action forms; channel/trigger-aware content editor; unified publish flow | Routine work begins near the top, optional diagnostics are disclosed on demand, and meaningful actions remain clear. |
| 5 — Simplify reporting and navigation | Report domain views; useful trends first; export status updates; proposed primary navigation | Administrators can distinguish “work to do now” from analysis and configuration without memorizing implementation areas. |

Preserve existing permissions, MFA, audit reasons for consequential actions, consent/opt-out boundaries, immutable published content versions, and safeguards against duplicate sends. Simplification should reduce rediscovery and repeated entry around those controls. It should not turn distinct operations into one unsafe bulk action.

## Validation and follow-up measurement

The executed checks confirm these specific behaviors:

| Check | Observed result |
| --- | --- |
| Support browse completeness | 103 stored tickets; 100 displayed; no next-page link |
| Support status wording | `WAITING_ON_USER` displayed as “Waiting on you” in the admin |
| Reply draft + Save triage | Draft became empty |
| Library invalid date-triggered save | Error shown; title and description became empty |
| Library Preview & publish shortcut | Disclosure stayed closed; preview remained invisible |
| Unsupported settings value | Action returned 500; generic error handling reached |
| Support-role content shortcut | Visible link led to Access denied |
| Staff-only MFA Return to Today | Landed on invitation registration |
| Invitation revoke from filtered list | Recipient/review filters removed from return URL |
| Account sheet keyboard behavior | Opened, closed with Escape, restored trigger focus |
| Dark support conversation | Timestamp contrast approximately 1.65:1 in tested state |
| Dark Operations cards | Six text nodes failed; sampled contrast approximately 1.71:1 |

After implementation, run task-based reviews with the actual operator(s): find an account, invite a selected group, investigate a missing invitation, resolve a support case, publish a content correction, recover a failed job, and download a report. Measure completion time, wrong turns, repeated searches, lost drafts, and whether the operator can explain the effect before confirming. Establish those baselines first; this audit does not invent an efficiency percentage.

Test long queues, empty/no-match states, stale records, removed permissions, expired verification, failed saves, and keyboard navigation in both themes. Automated scans should be supplemented by manual screen-reader and real-device checks. The principal design goal is that every page makes three things apparent: **what matters now, what record is in context, and what the next valid action is.**
