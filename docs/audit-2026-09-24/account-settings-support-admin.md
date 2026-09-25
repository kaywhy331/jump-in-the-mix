# Account, settings, support and admin audit — 2026-09-24 (d70ec54)

## Scope and method

Read-only review of the worktree at `the repository` (d70ec54). Nothing was built or run; the only execution was one pure `node -e` check of `Intl.DateTimeFormat` locale handling.

What I read end to end:

- Account: `src/app/(app)/account/page.tsx`, `account/preferences/page.tsx`, `account/tickets/**`, `src/app/account/deleted/page.tsx`, `src/components/AccountDeletionForm.tsx`, `AccountExport.tsx`, `src/lib/account-deletion*.ts`, `account-preference-actions.ts`, `auth-actions.ts`, `auth.ts`, `display-preferences.ts`, `format.ts`, `rate-limit.ts`, `src/app/api/account/export/route.ts`, `docs/ACCOUNT_EXPORT_INVENTORY_2026-09-22.md`, `src/app/privacy/page.tsx` (deletion sentences).
- Schema: all 26 `prisma/*.prisma` files (per-model foreign-key map) plus a grep of every migration for hand-written `FOREIGN KEY` constraints, and the retention sweepers (`data-retention.ts`, `operational-retention.ts`, `import-receipt-retention.ts`).
- Settings: all `src/app/(app)/settings/**` pages, `workspace-profile-actions.ts`, `date-type-actions.ts`, `journey-actions.ts`, `intake-actions.ts`, `notification-actions.ts`, `notification-delivery.ts`, `follow-up-push.ts`, `automatic-delivery.ts`, `api/settings/sending-preview/route.ts`, `api/notifications/{subscribe,test}`, `PushNotificationControl.tsx`, `AutomaticSendPreview.tsx`, `SignaturePreview.tsx`, `TimezonePicker.tsx`, `SchedulePreview.tsx`, `JourneyPreferencesEditor.tsx`, `JourneyPreferenceFields.tsx`, `journey-preferences.ts`, `journey-preference-service.ts`, `personal-scheduling.ts`, `quiet-days.ts`, `placeholders.ts`, `jump-render.ts` (placeholder section), and a grep of where every stored setting field is read at runtime.
- Support: `support-actions.ts`, `support-service.ts`, `support-admin-actions.ts`, `support-case-access.ts`, `support-email-delivery.ts` (queue), `support-email-recovery.ts`, `email-suppression-admin.ts` (`assertEmailReviewer`), `support-content.ts`, `SupportContext.tsx`, `SupportReplyComposer.tsx`, `SupportEmailRecovery.tsx`, `SupportViewRecovery.tsx`, `AdminSupportConversation.tsx`, both `admin/support` pages.
- Help/More: `help/page.tsx`, `more/page.tsx`, `SupportFaq.tsx`, `BrandTermsHelp.tsx`, `Appearance.tsx`, `appearance.ts`, cross-checked FAQ claims against `jump-render.ts`, onboarding and Today components.
- Staff control plane: `src/app/(staff)/**` (all 30 pages), every `src/components/Admin*.tsx`, `StaffAccessForm.tsx`/`LibraryOptionsForm.tsx` (gating lines), `admin-navigation.ts`, `admin-permissions.ts`, `impersonation.ts`, `staff-access.ts`, `staff-invitations.ts` (acceptance), `user-admin.ts`, `user-admin-actions.ts`, `admission-admin-actions.ts`, `access-admin-actions.ts`, `admin-operations-actions.ts`, `operations-actions.ts`, `report-actions.ts`, `system-mix-admin-actions.ts`, `shared-mix-admin-actions.ts`, `waitlist-admin-actions.ts`, `email-suppression-actions.ts`, `admin-settings-actions.ts`, `admin-mfa-actions.ts`, `staff-actions.ts`, `marketplace-actions.ts` (admin part), `api/admin/impersonation/{start,end}`, `api/admin/reports/exports/[exportId]`, `src/proxy.ts`, `AppShell.tsx` (banner), `(app)/layout.tsx`, `env.ts` flags.
- Prior audits (`docs/UI_UX_DEEP_GAP_AUDIT_2026-09-23.md`, `docs/UI_UX_WORKFLOW_AND_ICON_AUDIT_2026-09-22.md`, `docs/design/DESIGN_CONSISTENCY_2026-09-23.md`) were checked so their items (More/Settings/Account overlap, Appearance in three places, personal-vs-workspace preference split, missing phone back links) are not repeated here.

What could not be checked statically: actual rendering of a proxy 403 inside a submitted Server Action form (F6), memory behaviour of the export on the Render instance (F10), any behaviour that depends on production env flags (`AUTH_REQUIRE_ADMIN_MFA`, `WEB_PUSH_*`, Twilio, Resend), and whether dual-role (staff + own workspace) accounts exist on jumpinthemix.com (precondition of F2). Findings are marked VERIFIED only where the code path was read from control to database write.

Context that shapes several findings: `WorkspaceRole` has a single value (`OWNER`, `prisma/schema.prisma:10-12`) and every customer account owns exactly one workspace (`account-provisioning.ts:23-29`). "Staff" means `StaffMembership` (platform staff), and staff-only accounts are created without a workspace (`staff-invitations.ts:109-112`).

## Findings (ranked, most severe first)

### F1. Account deletion leaves imported contact rows, customer review feedback, push keys and delivery/preference records behind

- Severity: P0 (privacy guarantee broken: personal data retained indefinitely after a promised deletion)
- Status: VERIFIED
- Evidence:
  - `src/lib/account-deletion.ts:34-85` deletes explicit admin/support rows, then relies on `tx.workspace.deleteMany` (line 70) and `tx.user.delete` (line 73) cascading through foreign keys.
  - The per-model relation map across all `prisma/*.prisma` files plus a grep of every migration for `FOREIGN KEY` shows these tables have **no** foreign key to `Workspace`, `Contact` or `User`, so nothing cascades: `ContactImportBatch` (`prisma/contact-import-batches.prisma:10-36`, `payload Json` holds the imported rows: names, emails, phones, notes; `results Json`), `ReviewRequest` (`prisma/product-platform.prisma:119-138`, `rating`, `feedback` free text, `contactId`), `PushSubscription` (`product-platform.prisma:44-61`, `endpoint`, `p256dh`, `auth`, `userAgent`; only `sessionId` is a nullable FK), `NotificationDelivery` (87-106), `AutomatedDelivery` (140-159), `NotificationPreference` (30-42), `AutomationPreference` (108-117).
  - No sweeper ever removes them: `operational-retention.ts:11-25` and `data-retention.ts` never touch these tables; `ContactImportBatch.payload` is never cleared after completion (`contact-import-jobs.ts:115,173` only update `results`).
  - The product's own inventory classifies these as owner data: `docs/ACCOUNT_EXPORT_INVENTORY_2026-09-22.md` rows "contact import batches" (`imports`), "Review responses" (`reviewRequests`), "Reminder receipts and device metadata" (`reminderDeliveries`, `reminderDevices`).
  - Copy promising removal: `src/app/(app)/account/page.tsx:62` ("Deletion removes: your profile, sessions, contacts and private notes, saved dates, tags, mixes, follow-ups, and support history"), `src/app/privacy/page.tsx` ("permanently delete your account"). The e2e deletion test (`e2e/core-flows.spec.ts:190-231`) only checks the UI flow, not what remains in the database.
- Failure scenario: an owner imports a 300-row customer CSV, sends a few review requests (customers leave star ratings and free-text feedback), enables push reminders, then deletes the account. After `deleteAccountData` succeeds, `ContactImportBatch.payload` still holds all 300 customer rows, `ReviewRequest.feedback` still holds the customers' text, and `PushSubscription` still holds a live endpoint plus encryption keys, all orphaned under a workspace id that no longer exists, forever.
- Fix: in the same transaction in `account-deletion.ts` (before `workspace.deleteMany`), add explicit `deleteMany` for `contactImportBatch`, `reviewRequest`, `pushSubscription`, `notificationDelivery`, `automatedDelivery`, `notificationPreference`, `automationPreference` by `workspaceId in workspaceIds` (and `userId` for the two user-scoped ones). Longer term, add the missing foreign keys (`workspaceId` → `Workspace` ON DELETE CASCADE) so cascades match the schema; consider clearing `ContactImportBatch.payload` once a batch completes (it is only needed while the job runs).
- Effort: M; Risk: medium (adds work to an already 30 s-bounded transaction, `account-deletion.ts:85`); Needs migration: no for the explicit deletes, yes for the FK route; Needs owner decision: yes (whether review feedback from third parties should be retained in any form)
- Tests: an integration test that seeds one row in each of the seven tables, runs `deleteAccountData`, and asserts zero rows remain for that workspace/user; a schema guard test that fails when a model with `workspaceId`/`userId` has no relation and is not in an allowlist.

### F2. Deleting a staff member's own account erases their replies from other customers' support tickets

- Severity: P1
- Status: VERIFIED code path; precondition (a staff member who also owns a customer workspace) not verifiable statically
- Evidence: `src/lib/account-deletion.ts:59` runs `tx.supportTicketMessage.deleteMany({ where: { authorUserId: userId } })` with no `authorType` filter. Admin replies are stored with `authorUserId: adminUserId, authorType: "ADMIN"` (`support-service.ts:218-226`); `SupportEmailDelivery` rows cascade from the message (`prisma/support.prisma:102`). `/account` is only reachable through `requireWorkspace()` (`account/page.tsx:34`), so this applies to staff who also own a workspace (the `(staff)` layout explicitly supports that: `src/app/(staff)/layout.tsx:18`).
- Failure scenario: a support agent with their own workspace resolves 40 customer tickets, then deletes their account from My Account. Every one of their 40 replies, and the email-delivery evidence attached to them, disappears from customers' conversations; the requester's ticket now shows only their own messages and a "Resolved" status.
- Fix: restrict the delete to `authorType: "USER"` (the requester's own messages; their tickets are deleted on line 60 anyway) and leave `ADMIN` messages in place. The admin page already labels them "Support" without dereferencing the author (`admin/support/[ticketId]/page.tsx:113`); audit views already handle "Former staff member".
- Effort: S; Risk: low; Needs migration: no; Needs owner decision: yes (whether staff authorship should be pseudonymised or retained)
- Tests: unit/integration test: an admin reply by user A on ticket T survives `deleteAccountData(A)`; the requester's own messages and tickets are removed.

### F3. Staff-only accounts have no reachable account page (sessions, password, sign out everywhere)

- Severity: P1
- Status: VERIFIED
- Evidence: staff invitation acceptance creates a user with no workspace membership (`src/lib/staff-invitations.ts:109-112`). `/account`, `/account/preferences` and `/account/tickets` all call `requireWorkspace()` (`account/page.tsx:34`, `preferences/page.tsx:23`, `tickets/page.tsx:17`), which redirects users without a membership to `/register` (`src/lib/auth.ts:218-219`). The staff shell only links "Your account" when `user.memberships.length > 0` (`(staff)/layout.tsx:18`), and the MFA page sends password-less staff to `/forgot-password` to set a password (`(staff)/account/admin-mfa/page.tsx:55-61`).
- Failure scenario: a SUPPORT-role staff member wants to review which devices are signed in, sign out a lost laptop, or rotate their password. There is no page for it: typing `/account` bounces to `/register`; the only self-service is the MFA page and the public forgot-password flow.
- Fix: add a staff-scoped security page under `src/app/(staff)/account/security/page.tsx` that uses `requireSession()` and reuses the sessions/password cards from `account/page.tsx` (the underlying actions `changePasswordAction`, `revokeSessionAction`, `signOutOtherSessionsAction`, `signOutEverywhereAction` in `auth-actions.ts:289-337` also call `requireWorkspace()` and would need `requireSession()` instead). Link it from `AdminSecurityLink`.
- Effort: M; Risk: low; Needs migration: no; Needs owner decision: yes (whether staff-only accounts are a supported configuration or every staff member should also be provisioned a workspace)
- Tests: e2e: a staff-only user can open the security page, see sessions, change password; `requireWorkspace` redirect for `/account` remains for staff-only users only if that is the chosen design.

### F4. Ticket page offers "Check acceptance receipt" to support staff who are not allowed to run it

- Severity: P1
- Status: VERIFIED
- Evidence: `src/components/SupportEmailRecovery.tsx:23` renders "Check acceptance receipt" and "Queue same email again" whenever `delivery.hasFrozenContent`, ignoring `canManageEmail` (only the optional provider-id field on line 21 and the replacement flow on line 28 are gated). The receipt check calls `recoverSupportEmailReceipt` → `review(tx, input, undefined, true)` (`src/lib/support-email-recovery.ts:63-67`) → `assertEmailReviewer` (`src/lib/email-suppression-admin.ts:20-24`), which throws "Your current staff session cannot review email recovery." unless the actor holds `email.manage`. The SUPPORT role has only `dashboard.read`, `users.read`, `support.manage` (`src/lib/admin-permissions.ts:36`).
- Failure scenario: a SUPPORT agent opens a ticket whose reply email is in review, types a 10-character reason, clicks "Check acceptance receipt", and is redirected back with a permission error; the button was never usable for them. "Queue same email again" on the same row works, which makes the failure look random.
- Fix: gate the receipt-check button (and its helper text) on `canManageEmail` in `SupportEmailRecovery.tsx`, or if the local-ledger check is meant to be available to support staff, drop the `receiptOnly` step-up in `support-email-recovery.ts:67` and keep `assertEmailReviewer` only for the provider lookup path (line 77) and repeats. Product decision on which.
- Effort: S; Risk: low; Needs migration: no; Needs owner decision: yes (which permission owns the local receipt check)
- Tests: extend `e2e/support-email.spec.ts` (currently clicks the button at line 72 as a privileged user) with a SUPPORT-role case asserting the button is absent (or works, per the decision).

### F5. Automatic-sending preview lists messages the worker would never send

- Severity: P2
- Status: VERIFIED
- Evidence: the preview query in `src/app/api/settings/sending-preview/route.ts:19` filters on status, drafts, recipient, appointment binding, DNC and channel family, but not on `mix: { status: "ACTIVE" }`, `manualOnly: false` (Quick Add captures), workflow-instance state or person-specific `MixStop`. The worker applies all of those before sending (`src/lib/automatic-delivery.ts:145-146`, `183-184`, `219-221`). The card's own footnote only promises a recheck of "recipient eligibility and delivery limits" (`AutomaticSendPreview.tsx:13`).
- Failure scenario: an owner with a paused mix and three Quick Add captures previews the queue before opting in. The list shows those follow-ups as "Eligible from 09:30", the owner reviews wording they think is about to go out, confirms, and nothing sends; conversely the count overstates the blast radius when deciding whether to opt in.
- Fix: add the same filters to the preview `where` (or list those rows with `blockedReason`s such as "Mix paused", "Quick Add capture waits for you", "Stopped for this person") so the preview and worker agree.
- Effort: S; Risk: low; Needs migration: no; Needs owner decision: no
- Tests: unit test on the preview route with a paused mix, a `manualOnly` jump and a `MixStop`, asserting they are either absent or blocked with the expected reason; a shared eligibility helper would let one test cover both call sites.

### F6. Settings and More forms stay live during a view-only support session and fail with a bare 403

- Severity: P2 (staff UX; no data risk)
- Status: VERIFIED at the code level; the exact client rendering of the failure is SUSPECTED (cannot run)
- Evidence: `src/proxy.ts:68-72,150-155` rejects every non-safe request except `/api/admin/impersonation/end` with a plain-text 403 while the impersonation cookie is present, which includes Server Action posts from these pages. None of `settings/business`, `settings/notifications`, `settings/sending`, `settings/journey`, `settings/jump-date-types` or `/more` read `impersonation` (grep), so they render their forms and the `/more` "Sign out" form (`more/page.tsx:23`) as normal. `ActionForm.tsx:13` would turn the 403 into "We couldn't confirm this save… Check your connection", and plain `<form action>` submissions have no handler at all. By contrast `/account`, `/account/preferences`, `/help` and the connections token already show a view-only state.
- Failure scenario: a support agent in a customer view opens Sending to customers, toggles a checkbox to see the preview, and presses Save; they get a misleading "check your connection" error (or a raw 403 page from `/more` → Sign out) instead of "This support session is view-only".
- Fix: in those pages, when `impersonation` is set, render the `Notice type="info"` used on `/account` and either disable the fieldsets or hide the submit buttons; on `/more`, replace the sign-out form with the end-view form the AppShell already renders.
- Effort: M; Risk: low; Needs migration: no; Needs owner decision: no
- Tests: e2e under an impersonation session: each settings page shows the view-only notice and no enabled submit; `/more` shows "End support view" instead of "Sign out".

### F7. `{{My Address}}` and `{{My Custom 1–3}}` placeholders can never be filled

- Severity: P2
- Status: VERIFIED
- Evidence: the placeholders are offered to authors (`src/lib/placeholders.ts:30,37-39,55-57`) and rendered from `profile.street/city/state/postalCode/mailingAddress` and `profile.myCustom1-3` (`src/lib/jump-render.ts:74,112-114,130-132`). The only writer is the `section === "profile" || "all"` branch of `updateWorkspaceProfileAction` (`src/lib/workspace-profile-actions.ts:48,57-61,67-69`), and the only form that posts to it sends `settingsSection=business` (`settings/business/page.tsx:41`), which skips those fields. A repo-wide grep finds no other writer of `senderDetails`, `myCustom1` or `street`. The action's `/settings?section=…` redirects (line 82) also land on a hub that ignores `section`.
- Failure scenario: an owner inserts `{{My Address}}` in an email beat; every prepared message renders it as an empty string with no setting anywhere to fix it.
- Fix: either remove the six placeholders from `placeholders.ts` (and the dead `profile`/`messaging`/`all` branches in `workspace-profile-actions.ts`), or add a "Sender details" card (address + three custom fields) to My business and post `settingsSection=business` values for them.
- Effort: S (remove) / M (add UI); Risk: low; Needs migration: no; Needs owner decision: yes
- Tests: unit test that every placeholder in `placeholders.ts` has a settable source; e2e for the new card if kept.

### F8. Locale is stored without validation; an invalid tag breaks date formatting everywhere for that user

- Severity: P2 (self-inflicted, needs a crafted request; but the failure is total for the account and also fails their digest)
- Status: VERIFIED
- Evidence: `src/lib/account-preference-actions.ts:39` accepts any 40-character `locale` string; `display-preferences.ts:8` returns it; `format.ts:11,21` passes it straight to `new Intl.DateTimeFormat(locale, …)` with no try/catch. Confirmed with `node -e`: `"xx-INVALID!!"` and `"en_US"` throw `RangeError: Incorrect locale information provided`. Today (`jumps/page.tsx:317`), Account, Calendar, Journey and the digest (`notification-delivery.ts:162`) all format with it.
- Failure scenario: a user (or a browser extension autofilling `en_US`) posts `locale=en_US`; from then on `/jumps`, `/account`, `/calendar` and the admin's support view of that account throw, and the daily digest fails with a `FAILED` delivery. `/account/preferences` still renders, so recovery is possible but not obvious.
- Fix: validate against the offered list (`en-US`, `en-CA`, `en-GB`, `en-AU`) or `Intl.DateTimeFormat.supportedLocalesOf`, and make `displayPreferencesForUser` fall back to `en-US` when the stored value fails a try/catch, mirroring what it already does for timezone (`display-preferences.ts:9-11`).
- Effort: S; Risk: low; Needs migration: no; Needs owner decision: no
- Tests: unit tests for the action (rejects `en_US`) and for `displayPreferencesForUser` (falls back on an invalid stored locale).

### F9. Copy that no longer matches the preferences page after journey setup, and a deletion promise with no mechanism

- Severity: P2
- Status: VERIFIED
- Evidence:
  - Once `journeyPreferences` exist, `account/preferences/page.tsx:49-51` replaces the "Scheduling defaults" card (which holds Weekend scheduling) with the Journey preferences editor, and `journey-preference-service.ts:9` forces `weekendScheduling` to `KEEP`. Most accounts reach that state through onboarding (`mega-mix-actions.ts:71-86` calls the same `saveJourneySetup`). Yet the Settings hub (`settings/page.tsx:14`) and More (`more/page.tsx:14`) still promise "…quiet hours, and weekends", and Notifications says "Quiet hours come from Scheduling defaults" (`settings/notifications/page.tsx:29`) linking to a card those accounts do not have.
  - `src/app/account/deleted/page.tsx:11` says "Any provider revocation that could not finish immediately will be retried without restoring your account data." Nothing in `src/` implements a revocation retry (the only match for "provider revocation" is that sentence); `deleteAccountData` performs no provider calls at all.
- Failure scenario: an owner who finished onboarding follows "Quiet hours come from Scheduling defaults", lands on Personal preferences, and finds "Journey preferences" with "Quiet time starts/ends" instead; the "weekends" control they were promised is nowhere. A deleted user believes a provider-side revocation is pending when none is attempted.
- Fix: word the hub/More rows as "…quiet hours, working days" and point the Notifications link at `#journey-preferences`/the scheduling card as appropriate; delete the revocation sentence (or state plainly what is retained, per F1).
- Effort: S; Risk: low; Needs migration: no; Needs owner decision: yes (whether weekend scheduling should remain a first-class control after journey setup)
- Tests: update `e2e/core-flows.spec.ts` deletion-page assertion; snapshot the hub/More row copy.

### F10. Personal-data export is unthrottled and fully buffered

- Severity: P2
- Status: VERIFIED (code); memory impact on the Render instance SUSPECTED
- Evidence: `src/app/api/account/export/route.ts:10-94` loads every workspace table with unbounded `findMany` calls in one `Promise.all`, then `JSON.stringify(document, null, 2)` (line 155) or an in-memory `zipSync` (line 107). There is no `consumeRateLimit` call, unlike deletion (5/hour, `account-deletion-actions.ts:23-30`) and the admin CSV download (`api/admin/reports/exports/[exportId]/route.ts:9`). The client disables its two buttons while busy (`AccountExport.tsx:17`) but nothing stops repeated requests from another tab or a script.
- Failure scenario: an owner with thousands of contacts and activities clicks Complete JSON several times; each request materialises the whole workspace twice (objects + pretty-printed string) on the shared web instance, competing with every other user's requests.
- Fix: add `consumeRateLimit({ scope: "account.export", identifiers: [user.id], limit: 6, windowMs: 3600_000 })` returning 429 with `Retry-After`; drop the two-space pretty print (or stream with `JSON.stringify` per top-level key into a `ReadableStream`).
- Effort: S; Risk: low; Needs migration: no; Needs owner decision: no
- Tests: route test asserting 429 after the limit and that the JSON is still valid without indentation.

### F11. Staff-owner deletion guard surfaces as a generic error and leaves the audit row `STARTED`

- Severity: P2
- Status: VERIFIED
- Evidence: `src/lib/account-deletion.ts:42-44` throws "Add another active owner before deleting your account." inside the transaction; `account-deletion-actions.ts:42` awaits `deleteAccountData` outside any try/catch, so the message never reaches the `useActionState` error slot in `AccountDeletionForm.tsx:21` and the `AccountDeletionAudit` row created on line 28 stays `STARTED`.
- Failure scenario: the last active platform OWNER (who also owns a workspace) tries to delete their account and gets the framework's generic error page instead of the instruction to add another owner.
- Fix: wrap the call in the action, return `{ error: error.message }` for that known error, and mark the audit row `FAILED` (or create it inside the transaction).
- Effort: S; Risk: low; Needs migration: no; Needs owner decision: no
- Tests: unit test for `deleteAccountAction` with a sole active OWNER asserting the returned error and audit status.

## Settings effectiveness table

| Setting (where set) | Stored | Where read at runtime | Effective? | Note |
| --- | --- | --- | --- | --- |
| Display name (Preferences → Profile) | `User.name` | AppShell, digests (`notification-delivery.ts:343`), signatures default | Yes | |
| Locale (Preferences → Profile) | `UserPreference.locale` | `display-preferences.ts:8` → `format.ts`, Today/Calendar/Journey formatting, digest | Yes | Unvalidated (F8) |
| Timezone (Preferences → Profile; also Journey preferences editor) | `UserPreference.timezone` | Display (`display-preferences.ts:9-11`); worker uses the owner's value as the workspace timezone: jumps (`jump-engine.ts:333-359`), digests (`notification-delivery.ts:335-336`), automatic delivery (`automatic-delivery.ts:124-127`), quiet days, sending preview (`timezoneForWorkspace`) | Yes | Precedence: user pref → fallback → UTC; workspace tz = owner's pref (`display-preferences.ts:19-22`). Single-member workspaces make the two identical. Two cards on the same page write the same field. |
| Mix activation (Preferences) | `UserPreference.reviewMixActivation` | `MixWorkspace.tsx`, `mix-editor-actions.ts`, `mix-lifecycle-actions.ts`, `shared-mix-use-actions.ts`, `/mixes/new`, template use page | Yes | |
| Quiet-day check-ins (Preferences) | `WorkspacePreference.quietDaysEnabled/quietDays` | `quiet-days.ts:13-16` | Yes | Workspace-wide (copy says so) |
| Default follow-up time (Preferences → Scheduling defaults / Journey preferences) | `WorkspacePreference.defaultFollowUpMinutes` | `jump-engine.ts`, `workflow-scheduling.ts`, `snooze-actions.ts`, `bulk-contact-actions.ts`, schedule preview | Yes | Saving enqueues `generate-jumps` (`account-preference-actions.ts:69`) |
| Weekend scheduling (Preferences → Scheduling defaults) | `WorkspacePreference.weekendScheduling` | `personal-scheduling.ts:33-39` via `jump-engine.ts`, schedule preview | Only until journey preferences exist | Forced to `KEEP` and control removed after journey setup (`journey-preference-service.ts:9`, `preferences/page.tsx:49`); working days take over (`journey-availability.ts`). Copy drift (F9) |
| Quiet hours (Preferences) | `WorkspacePreference.quietHoursStart/End` | `snooze-schedule.ts`, push (`notification-delivery.ts:351-356`), automatic delivery (`automatic-delivery.ts:128-129`), sending preview, Today | Yes | |
| Appointment buffer (Preferences) | `WorkspacePreference.appointmentBufferMinutes` | `calendar.ts`, `api/calendar/availability`, `journey-availability.ts` | Yes | |
| Journey preferences: communication, pace, working days/hours, avoid appointments | `WorkspacePreference.journeyPreferences` | `tailorMegaMix` (`journey-preferences.ts:46-59`), `journey-availability.ts`, `jump-engine.ts`, `mix-workflow.ts`, `automatic-delivery.ts:131-134`, Today | Yes | Communication/pace apply to new mega-mixes only (copy says so) |
| Business name, type, phone, website, review page, services (My business) | `WorkspaceProfile.company/industry/phone/website/reviewUrl/products` | `jump-render.ts` placeholders, automatic email subject (`automatic-delivery.ts:228`), digests, marketplace/template suggestions (`industry`), review page and lead form (`website`, `phone`), review request flow (`reviewUrl`) | Yes | https enforced for URLs |
| Text/email signature (My business) | `WorkspaceProfile.smsSignature/emailSignature` | `jump-render.ts`, mega-mix setup, review-request route | Yes | Required; defaults to display name |
| Business address, mailing address, "My Custom 1–3" | `WorkspaceProfile.street/city/state/postalCode/mailingAddress/myCustom1-3` | `jump-render.ts:74,112-114` (`{{My Address}}`, `{{My Custom n}}`) | No UI can set them | Dead placeholders (F7) |
| Morning digest, Monday report, send hour (Notifications) | `NotificationPreference.emailDigestEnabled/weeklyReportEnabled/digestHour` | `notification-delivery.ts:345-350` (owner tz, skipped when nothing due, re-checked before send) | Yes, when transactional email is configured | Form hidden otherwise |
| Push reminders (Notifications → device opt-in) | `NotificationPreference.pushEnabled` + `PushSubscription` | `notification-delivery.ts:354-356`, `follow-up-push.ts:69-129` | Yes, when VAPID keys are configured | Subscriptions are session-bound; quiet hours respected |
| Automatic sending on/off, email, text, review window (Sending) | `AutomationPreference.*` | `automatic-delivery.ts:104-106,140,214-221`; Today badges (`jumps/page.tsx:171-176`) | Yes | Consent checkbox enforced server-side; preview over-reports (F5) |
| Automatic transitions on/off (Journey settings) | `JourneyPreference.enabled` | `journey.ts:74,111,116` | Yes | |
| Stage name, mix on entry, order, retire (Journey settings) | `JourneyStage.*` | `journey.ts:95` (`changeManagedPlan`), journey views | Yes | Retire/remove-rule confirmed via ConfirmDialog |
| Date type active/inactive, rename, delete (Date types) | `DateType.isActive/name` | `jump-engine.ts:193-230` filters `isActive: true` | Yes | Delete blocked while in use; save enqueues `generate-jumps` |
| Lead connection pause/resume, key rotate (Connections) | `IntakeConnection.enabled/token` | `api/webhooks/intake/[connectionId]/route.ts:12`, `lead/[connectionId]/page.tsx:9` | Yes | Rotate confirmed; token hidden during support views |
| Appearance (More / Preferences) | browser `localStorage` only | `appearance.ts`, `Appearance.tsx` | Yes (per browser) | Graceful message when storage is unavailable |

## Checked and fine

- Password change verifies the current password, rejects reuse, closes every other session, rotates the current one and emails the user (`auth-actions.ts:289-312`); push subscriptions follow the rotated session (`auth.ts:54-57`).
- Session list, per-device sign-out, "Sign out other devices" (only shown with more than one session) and "Sign out everywhere" behind a confirm dialog (`account/page.tsx:60`, `auth-actions.ts:315-337`).
- Deletion requires the exact phrase plus the current password, or a session younger than five minutes for password-less accounts with a proper re-authentication path; rate-limited 5/hour; blocked during support views (`account-deletion-actions.ts:16-51`).
- Export is owner-scoped, blocked during support views, excludes password hashes, session tokens, provider credentials, calendar URLs, push endpoints/keys and invitation tokens, and its sections match `docs/ACCOUNT_EXPORT_INVENTORY_2026-09-22.md`; marketplace reports received omit the reporter (`export/route.ts:73-74`).
- Email change is honestly described as a support request with identity verification (`account/page.tsx:58`); there is no self-service email change to audit.
- Personal preferences forms reject invalid timezones, times and buffers with recoverable errors and audit each change (`account-preference-actions.ts`).
- Digest and weekly report only go to the workspace owner, in the owner's timezone, skip when nothing is due, and re-check the preference before sending; test reminder is limited to 2/hour and only to the verified address (`notification-actions.ts:97-113`).
- Push subscribe/test/unsubscribe routes are bound to the current session and workspace; expired endpoints (404/410) are forgotten and `pushEnabled` is cleared when the last device goes (`follow-up-push.ts:32-38`).
- Automatic delivery re-validates preference, channel, drafts, family switch, DNC, mix status, workflow state and person stops immediately before sending, and never retries an uncertain send (`automatic-delivery.ts:94-102,214-224`).
- Journey settings: stage retire and rule removal use confirm dialogs with truthful descriptions; moving stages, 20-stage cap and duplicate-name checks are server-enforced (`journey-actions.ts:25-60`).
- Connections page: webhook contract (201/200/202/409/429/503) is documented in the UI and pause is honoured by both the webhook and the hosted form.
- Help copy checked against behaviour: private notes reach only call scripts (`jump-render.ts:73`); "Remix it", "Other uses", "Save answers and finish later" and "Needs your input" all exist in the UI; My Account does offer export, sessions, password and deletion as the FAQ says.
- Glossary sheet (`BrandTermsHelp.tsx`) and Appearance picker work without a server round-trip; Appearance reports when the browser refuses storage.
- Requester support flows: ticket creation and replies are rate-limited, closed tickets block replies with a clear inline state, replying to a resolved ticket reopens it, and the retention notice matches `data-retention.ts` (180 inactive days).
- Admin support: replies are idempotent by `requestKey`, drafts survive MFA step-up because verification does not rotate the session (`admin-mfa-actions.ts:92-119`) and the draft store lives in the shared `(staff)` layout; assignment uses a revision check; resolve/close end customer views; view-only sessions require assignment to self, an open ticket and the separate `support.view_customer` grant (`impersonation.ts:12-41`).
- Impersonation UX: persistent banner with case reference, reason and expiry, an end form in place of Sign out, Quick Add and the PWA prompt hidden, all mutations blocked at the proxy, and a stale-cookie recovery notice (`AppShell.tsx:33-87`, `SupportViewRecovery.tsx`). Note: the shell formats with the acting admin's locale/timezone while pages use the customer's (`(app)/layout.tsx:10`), a small inconsistency by design.
- Permission gating in the UI matches the actions for user suspend/restore/revoke sessions, invitation revoke/retry, waitlist invite/pause/retry, job retry, alert acknowledgement, system-mix and library publish/rollback, marketplace decisions, library options and team changes (each action re-checks under `requirePlatformAdmin` and, for sensitive ones, password plus 10-minute MFA freshness).
- Admin lists have pagination, filters, result summaries and empty states (support, users, access, waitlist, audit, operations, templates, marketplace); the audit page redacts keys that look private (`audit-redaction.ts`).
- Report exports are bound to the requesting session, rate-limited and expire in 24 hours (`api/admin/reports/exports/[exportId]/route.ts`).
- Staff self-deletion is blocked when they are the last active platform owner, and pending staff invitations they issued are revoked (`account-deletion.ts:37-44`).

## Open questions for the owner

1. Deletion scope (F1): should `ContactImportBatch`, `ReviewRequest`, `PushSubscription` and the delivery/preference rows be deleted with the account (recommended), and should import payloads be purged as soon as a batch completes regardless of deletion?
2. Staff authorship (F2): when a staff member deletes their account, keep their support replies as "Support" (recommended) or pseudonymise them further?
3. Staff-only accounts (F3): are they a supported configuration? If yes, they need a security page (sessions, password, sign out everywhere); if no, staff should always be provisioned a workspace.
4. Receipt check permission (F4): should the local-ledger acceptance check be a `support.manage` capability (then relax the step-up) or stay `email.manage` (then hide the button)?
5. Sending preview (F5): should paused-mix, Quick Add and stopped-person follow-ups be hidden from the preview or shown with explicit "will not send" reasons?
6. Sender details (F7): remove `{{My Address}}` and `{{My Custom 1–3}}` from the placeholder list, or add a Sender details card to My business?
7. Weekend scheduling (F9): after journey setup, is "working days" the only intended control, in which case the hub/More/Notifications copy should stop promising weekends and a scheduling-defaults card?
8. Export limits (F10): acceptable rate (suggested 6 per hour) and whether a streamed export is worth the effort at current workspace sizes.
