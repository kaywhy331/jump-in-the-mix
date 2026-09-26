# Hand-written database objects

Production's database is built by `prisma migrate deploy` from [the migrations](../prisma/migrations). Some objects in those migrations are written by hand and are not described by the Prisma schema. Prisma cannot describe partial indexes, operator-class indexes, CHECK constraints or triggers, so they live only in the migrations. This page lists every such object, as of Release B (2026-09-25), so that nobody drops one by accident. The Prisma schema files carry no comments about them.

Foreign keys are no longer on this list: since Release B every foreign key that a migration creates has a relation in the schema. [`tests/prisma-relation-guard.test.ts`](../tests/prisma-relation-guard.test.ts) checks this.

## What this means in practice

| How the database is built | Hand-written objects |
|---|---|
| `prisma migrate deploy`: production, CI (`npm run db:deploy`), `npm run db:setup:docker` and the `jitm_design_*` test databases | All present |
| `prisma db push`: `npm run db:setup` | None. The database has no trigram search indexes, does not enforce one primary email, phone or address per contact, has no CHECK constraints, and does not protect the library history |

- **Never accept a generated `DROP INDEX` for these objects.** `prisma migrate dev` and `prisma migrate diff` propose dropping the eight indexes Prisma can see (the seven trigram indexes and `JumpDate_contact_active_idx`). The partial indexes, CHECK constraints and triggers are invisible to the diff, so a generated migration neither drops nor recreates them.
- The diff between the migrations and the schema is pinned by [`tests/prisma-migration-residue.integration.test.ts`](../tests/prisma-migration-residue.integration.test.ts). The expected difference is exactly the eight `DROP INDEX` statements and one column default:
  - `DataRetentionState.id`: the schema declares `@default("primary")`, but the migration created the column without a default. This is harmless, because the code always writes the id `primary` itself (`src/lib/data-retention.ts`).
- To add a hand-written object: write it in a migration, add it to this page, and, if `prisma migrate diff` reports it, add the statement to the test's reviewed list with its reason.
- To see the current objects in a database, run `SELECT tablename, indexname, indexdef FROM pg_indexes WHERE schemaname = 'public'` and `SELECT conrelid::regclass, conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE contype = 'c'`.

## Indexes

Fifteen indexes, created by the migrations named below. The column "In `migrate diff`" says whether Prisma reports the index as drift.

| Index | Table | Definition | Created by | Serves | In `migrate diff` |
|---|---|---|---|---|---|
| `Contact_displayName_trgm_idx` | Contact | `USING gin ("displayName" gin_trgm_ops)` | 20260722013000_contact_search_and_import_batches (again, idempotently, in 20260904170000_product_platform) | Contact search (case-insensitive "contains" on the Contacts list) and recipient search | `DROP INDEX` |
| `Contact_company_trgm_idx` | Contact | `USING gin (company gin_trgm_ops)` | same | Contact search | `DROP INDEX` |
| `Contact_publicNotes_trgm_idx` | Contact | `USING gin ("publicNotes" gin_trgm_ops)` | same | Contact search | `DROP INDEX` |
| `Contact_privateNotes_trgm_idx` | Contact | `USING gin ("privateNotes" gin_trgm_ops)` | same | Contact search | `DROP INDEX` |
| `ContactEmail_email_trgm_idx` | ContactEmail | `USING gin (email gin_trgm_ops)` | same | Contact and recipient search | `DROP INDEX` |
| `ContactPhone_phone_trgm_idx` | ContactPhone | `USING gin (phone gin_trgm_ops)` | same | Contact and recipient search | `DROP INDEX` |
| `ContactCustomFieldValue_value_trgm_idx` | ContactCustomFieldValue | `USING gin (value gin_trgm_ops)` | same | Contact search | `DROP INDEX` |
| `ContactEmail_one_primary_per_contact` | ContactEmail | `UNIQUE ("contactId") WHERE "isPrimary" = true` | 20260722010000_integrity_constraints | At most one primary email per contact | Not visible |
| `ContactPhone_one_primary_per_contact` | ContactPhone | `UNIQUE ("contactId") WHERE "isPrimary" = true` | 20260722010000_integrity_constraints | At most one primary phone per contact | Not visible |
| `ContactAddress_one_primary_per_contact` | ContactAddress | `UNIQUE ("contactId") WHERE "isPrimary" = true` | 20260722010000_integrity_constraints | At most one primary address per contact | Not visible |
| `ContactSavedView_one_default_per_workspace_user` | ContactSavedView | `UNIQUE ("userId", "workspaceId") WHERE "isDefault" = true` | 20260722040000_contact_lifecycle_management | At most one default saved view per person and workspace | Not visible |
| `MixStep_active_sort_order_unique` | MixStep | `UNIQUE ("mixId", "sortOrder") WHERE "isActive" = true` | 20260722010000_integrity_constraints | Active Beats of a Mix keep distinct positions | Not visible |
| `Job_claim_ready_idx` | Job | `("runAt", "createdAt") WHERE "completedAt" IS NULL AND "failedAt" IS NULL` | 20260722010000_integrity_constraints | The worker's claim of due, unfinished jobs, in `runAt, createdAt` order. [`tests/job-claim-index.integration.test.ts`](../tests/job-claim-index.integration.test.ts) checks its definition and that the claim query can use it | Not visible |
| `ReferralAccessInvite_outstanding` | ReferralAccessInvite | `(id) WHERE "acceptedAt" IS NULL AND "revokedAt" IS NULL` | 20260909020000_admission_controls | Finding and counting outstanding invitations | Not visible |
| `JumpDate_contact_active_idx` | JumpDate | `("contactId", "isActive")` | 20260722010000_integrity_constraints | A contact's active important dates | `DROP INDEX` |

The trigram indexes need the `pg_trgm` extension, which 20260722013000_contact_search_and_import_batches creates in the `public` schema.

`JumpDate_contact_active_idx` is an ordinary index that Prisma could describe as `@@index([contactId, isActive], map: "JumpDate_contact_active_idx")`. Adding that line to the schema would remove it from the diff. It is listed here because the schema does not declare it today.

`Job_runAt_completedAt_failedAt_idx`, which the schema declares, serves no current query. It stays, because dropping an index is a destructive migration.

## Triggers

| Trigger | Table | Created by | Effect |
|---|---|---|---|
| `immutable_library_revision` | SharedMixRevision | 20260909030000_library_revisions | Rejects `UPDATE` and direct `DELETE`. A delete cascading from the parent `SharedMix` is allowed |
| `immutable_library_release` | SharedMixRelease | 20260909030000_library_revisions | Same |
| `immutable_system_mix_revision` | SystemMixRevision | 20260909040000_system_mix_releases | Same, for the System Mix history |
| `immutable_system_mix_release` | SystemMixRelease | 20260909040000_system_mix_releases | Same |

All four call the function `reject_library_history_rewrite()`, which 20260909030000_library_revisions creates. Because these rows cannot be updated, their `actorUserId` columns cannot have a `SET NULL` foreign key. The ids stay as opaque references.

## CHECK constraints

Sixty-six CHECK constraints. The rules below are PostgreSQL's own definitions, with type casts removed. Some were written inline in `CREATE TABLE`; PostgreSQL named those `<table>_<column>_check`, and "Created by" names the migration that created the table.

| Table | Constraint | Created by | Rule |
|---|---|---|---|
| AdmissionPolicy | `AdmissionPolicy_limits` | 20260909020000_admission_controls | `(("accountCeiling" >= 0) AND ("accountCeiling" <= 1000000)) AND (("outstandingCeiling" >= 0) AND ("outstandingCeiling" <= "accountCeiling")) AND (revision >= 0)` |
| AdmissionPolicy | `AdmissionPolicy_singleton` | 20260909020000_admission_controls | `id = 'default'` |
| AutomatedDelivery | `AutomatedDelivery_attempts_check` | 20260904190000_automatic_delivery_and_reviews | `attempts >= 1` |
| AutomationPreference | `AutomationPreference_reviewWindow_check` | 20260904170000_product_platform | `("reviewWindowMinutes" >= 5) AND ("reviewWindowMinutes" <= 1440)` |
| ContactActivity | `ContactActivity_summary_length_check` | 20260722020000_contact_activity_timeline | `(summary IS NULL) OR (char_length(summary) <= 4000)` |
| ContactImportBatch | `ContactImportBatch_completion_check` | 20260722013000_contact_search_and_import_batches | `((status = ANY (ARRAY['COMPLETED', 'PARTIAL', 'FAILED', 'CANCELED'])) AND ("completedAt" IS NOT NULL)) OR ((status = ANY (ARRAY['QUEUED', 'RUNNING'])) AND ("completedAt" IS NULL))` |
| ContactImportBatch | `ContactImportBatch_counts_check` | 20260722013000_contact_search_and_import_batches | `("totalRows" >= 0) AND ("processedRows" >= 0) AND ("processedRows" <= "totalRows") AND ("createdCount" >= 0) AND ("mergedCount" >= 0) AND ("replacedCount" >= 0) AND ("skippedCount" >= 0) AND ("failedCount" >= 0)` |
| ContactRelationshipState | `ContactRelationshipState_version_check` | 20260722040000_contact_lifecycle_management | `version > 0` |
| EmailMessage | `EmailMessage_retired_details_check` | 20260909100000_private_data_retention | `(("detailsRetiredAt" IS NULL) AND ("recipientHash" IS NOT NULL)) OR (("detailsRetiredAt" IS NOT NULL) AND ("recipientHash" IS NULL) AND ("providerId" IS NULL))` |
| EmailProviderEvent | `EmailProviderEvent_retired_details_check` | 20260909100000_private_data_retention | `("detailsRetiredAt" IS NULL) OR (("providerId" IS NULL) AND (cardinality("recipientHashes") = 0))` |
| EmailSuppression | `EmailSuppression_optout_check` | 20260909070000_email_suppression_review | `("clearedAt" IS NULL) OR (reason <> 'INVITATION_OPTOUT')` |
| EmailSuppression | `EmailSuppression_revision_check` | 20260909070000_email_suppression_review | `revision >= 1` |
| InvitationDeliveryHistory | `InvitationDeliveryHistory_attempts_check` | 20260909080000_invitation_delivery_generations | `attempts >= 0` |
| InvitationDeliveryHistory | `InvitationDeliveryHistory_generation_check` | 20260909080000_invitation_delivery_generations | `generation >= 1` |
| InvitationDeliveryHistory | `InvitationDeliveryHistory_status_check` | 20260909080000_invitation_delivery_generations | `status = ANY (ARRAY['REVIEW', 'SENT'])` |
| Job | `Job_attempt_bounds` | 20260722010000_integrity_constraints | `(attempts >= 0) AND ("maxAttempts" > 0)` |
| Job | `Job_lock_fields_paired` | 20260722010000_integrity_constraints | `("lockedAt" IS NULL) = ("lockedBy" IS NULL)` |
| JumpDate | `JumpDate_active_calendar_shape` | 20260722010000_integrity_constraints | `("isActive" = false) OR (((month >= 1) AND (month <= 12)) AND ((day >= 1) AND (day <= CASE WHEN (month = 2) THEN 29 WHEN (month = ANY (ARRAY[4, 6, 9, 11])) THEN 30 ELSE 31 END)) AND ((recurrence <> 'NONE') OR ("dateValue" IS NOT NULL)))` |
| JumpDate | `JumpDate_time_range` | 20260722010000_integrity_constraints | `("timeMinutes" IS NULL) OR (("timeMinutes" >= 0) AND ("timeMinutes" <= 1439))` |
| MixAssignment | `MixAssignment_exactly_one_target` | 20260722010000_integrity_constraints | `((("contactId" IS NOT NULL))+ (("groupId" IS NOT NULL))) = 1` |
| MixFavorite | `MixFavorite_one_target_check` | 20260921210000_mix_favorites | `("mixId" IS NOT NULL) <> ("sharedMixId" IS NOT NULL)` |
| MixStep | `MixStep_day_offset_range` | 20260722010000_integrity_constraints | `("dayOffset" >= -365) AND ("dayOffset" <= 365)` |
| MixStep | `MixStep_send_time_range` | 20260722010000_integrity_constraints | `("sendTimeMinutes" IS NULL) OR (("sendTimeMinutes" >= 0) AND ("sendTimeMinutes" <= 1439))` |
| NotificationPreference | `NotificationPreference_digestHour_check` | 20260904170000_product_platform | `("digestHour" >= 0) AND ("digestHour" <= 23)` |
| OperationsCheck | `OperationsCheck_episode_check` | 20260909090000_operational_alerts | `episode >= 0` |
| OperationsCheck | `OperationsCheck_revision_check` | 20260909090000_operational_alerts | `revision >= 1` |
| OperationsCheck | `OperationsCheck_state_check` | 20260909090000_operational_alerts | `state = ANY (ARRAY['OK', 'WARNING', 'CRITICAL', 'UNKNOWN'])` |
| OperationsNotice | `OperationsNotice_attempts_check` | 20260909090000_operational_alerts | `attempts >= 0` |
| OperationsNotice | `OperationsNotice_episode_check` | 20260909090000_operational_alerts | `episode >= 1` |
| OperationsNotice | `OperationsNotice_kind_check` | 20260909090000_operational_alerts | `kind = ANY (ARRAY['OPENED', 'CHANGED', 'REMINDER', 'RESOLVED'])` |
| OperationsNotice | `OperationsNotice_state_check` | 20260909090000_operational_alerts | `state = ANY (ARRAY['OK', 'WARNING', 'CRITICAL', 'UNKNOWN'])` |
| OperationsNotice | `OperationsNotice_status_check` | 20260909090000_operational_alerts | `status = ANY (ARRAY['QUEUED', 'SENDING', 'SENT', 'FAILED', 'CANCELED'])` |
| ReferralAccessInvite | `ReferralAccessInvite_marketing_scenario_check` | 20260910120000_marketing_scenario_continuity | `(("marketingScenario" IS NULL) AND ("marketingScenarioVersion" IS NULL)) OR (("marketingScenario" = ANY (ARRAY['real-estate', 'consulting', 'photography', 'painting', 'recruiting'])) AND ("marketingScenarioVersion" = 1))` |
| ReferralAccessInvite | `ReferralAccessInvite_purged_token_check` | 20260909100000_private_data_retention | `("tokenPurgedAt" IS NULL) OR (("tokenCiphertext" = '') AND (("acceptedAt" IS NOT NULL) OR ("revokedAt" IS NOT NULL)))` |
| ReferralAccessInvite | `ReferralAccessInvite_recipient_check` | 20260917160000_personal_invitation_reminders | `("recipientEmail" IS NOT NULL) OR ("manualDelivery" AND ("recipientPhone" IS NOT NULL))` |
| ReferralAccessInvite | `ReferralAccessInvite_systemMixVersion_check` | 20260908000000_referral_access_invites | `("systemMixVersion" IS NULL) OR ("systemMixVersion" > 0)` |
| ReportDailySnapshot | `ReportDailySnapshot_state_check` | 20260909050000_report_storage | `(status = ANY (ARRAY['QUEUED', 'RUNNING', 'READY', 'FAILED'])) AND ("definitionKey" ~ '^[a-f0-9]{64}$') AND ((payload IS NULL) OR (octet_length((payload)) <= 1048576)) AND ((status <> 'READY') OR ((payload IS NOT NULL) AND ("observedAt" IS NOT NULL)))` |
| ReportExport | `ReportExport_state_check` | 20260909050000_report_storage | `(status = ANY (ARRAY['QUEUED', 'RUNNING', 'READY', 'FAILED', 'CANCELLED'])) AND ("throughDay" >= "fromDay") AND (("throughDay" - "fromDay") < 366) AND (("byteCount" IS NULL) OR (("byteCount" >= 0) AND ("byteCount" <= 524288))) AND (("contentCiphertext" IS NULL) OR (octet_length("contentCiphertext") <= 1048576)) AND ((status <> 'READY') OR (("contentCiphertext" IS NOT NULL) AND ("generatedAt" IS NOT NULL) AND ("byteCount" IS NOT NULL)))` |
| ReportStorageObservation | `ReportStorageObservation_valid` | 20260909051000_report_storage_observations | `("databaseBytes" >= 0) AND (("observedAt")= day)` |
| ReviewRequest | `ReviewRequest_rating_check` | 20260904170000_product_platform | `(rating IS NULL) OR ((rating >= 1) AND (rating <= 5))` |
| SharedMixRelease | `SharedMixRelease_action_check` | 20260909030000_library_revisions | `action = ANY (ARRAY['PUBLISH', 'ROLLBACK', 'UNPUBLISH'])` |
| SharedMixRelease | `SharedMixRelease_version_check` | 20260909030000_library_revisions | `version > 0` |
| SharedMixRevision | `SharedMixRevision_version_check` | 20260909030000_library_revisions | `version > 0` |
| StaffInvitation | `StaffInvitation_initial_role_check` | 20260909010000_staff_invitations | `role <> 'OWNER'` |
| SupportEmailDelivery | `SupportEmailDelivery_frozen_send` | 20260909110000_support_email_outbox | `(status <> ALL (ARRAY['QUEUED', 'SENDING'])) OR (length("messageCiphertext") > 0)` |
| SupportEmailDelivery | `SupportEmailDelivery_valid_generation` | 20260909110000_support_email_outbox | `(generation >= 1) AND (attempts >= 0)` |
| SupportEmailDelivery | `SupportEmailDelivery_valid_lease` | 20260909110000_support_email_outbox | `((status = 'SENDING') AND ("leaseId" IS NOT NULL) AND ("leaseUntil" IS NOT NULL)) OR ((status <> 'SENDING') AND ("leaseId" IS NULL) AND ("leaseUntil" IS NULL))` |
| SupportTicket | `SupportTicket_assignmentRevision_check` | 20260909060000_support_case_scope | `"assignmentRevision" >= 0` |
| SystemMixConfig | `SystemMixConfig_controlRevision_check` | 20260909040000_system_mix_releases | `"controlRevision" >= 0` |
| SystemMixConfig | `SystemMixConfig_draftVersion_check` | 20260909040000_system_mix_releases | `"draftVersion" > 0` |
| SystemMixConfig | `SystemMixConfig_id_check` | 20260909040000_system_mix_releases | `id = 'referral'` |
| SystemMixConfig | `SystemMixConfig_publishedVersion_check` | 20260909040000_system_mix_releases | `"publishedVersion" > 0` |
| SystemMixRelease | `SystemMixRelease_action_check` | 20260909040000_system_mix_releases | `action = ANY (ARRAY['PUBLISH', 'ROLLBACK'])` |
| SystemMixRelease | `SystemMixRelease_controlRevision_check` | 20260909040000_system_mix_releases | `"controlRevision" >= 0` |
| SystemMixRelease | `SystemMixRelease_version_check` | 20260909040000_system_mix_releases | `version > 0` |
| SystemMixRevision | `SystemMixRevision_version_check` | 20260909040000_system_mix_releases | `version > 0` |
| User | `User_referralInvitesIssued_check` | 20260908000000_referral_access_invites | `("referralInvitesIssued" >= 0) AND ("referralInvitesIssued" <= 5)` |
| WaitlistDelivery | `WaitlistDelivery_generation_check` | 20260909080000_invitation_delivery_generations | `generation >= 1` |
| WaitlistDelivery | `WaitlistDelivery_one_invitation_check` | 20260909010000_staff_invitations | `("inviteId" IS NOT NULL) <> ("staffInvitationId" IS NOT NULL)` |
| WaitlistDelivery | `WaitlistDelivery_purged_payload_check` | 20260909100000_private_data_retention | `("payloadPurgedAt" IS NULL) OR (("messageCiphertext" = '') AND (status = ANY (ARRAY['SENT', 'CANCELED'])) AND ("leaseId" IS NULL) AND ("lockedAt" IS NULL))` |
| WaitlistEntry | `WaitlistEntry_marketing_scenario_check` | 20260910120000_marketing_scenario_continuity | `(("marketingScenario" IS NULL) AND ("marketingScenarioVersion" IS NULL)) OR (("marketingScenario" = ANY (ARRAY['real-estate', 'consulting', 'photography', 'painting', 'recruiting'])) AND ("marketingScenarioVersion" = 1))` |
| WorkspaceMarketingPreference | `WorkspaceMarketingPreference_scenario_check` | 20260910120000_marketing_scenario_continuity | `(scenario = ANY (ARRAY['real-estate', 'consulting', 'photography', 'painting', 'recruiting'])) AND (version = 1)` |
| WorkspacePreference | `WorkspacePreference_appointment_buffer_check` | 20260911090000_appointment_buffer | `("appointmentBufferMinutes" >= 0) AND ("appointmentBufferMinutes" <= 240)` |
| WorkspacePreference | `WorkspacePreference_minutes_check` | 20260722030000_personal_preferences | `(("defaultFollowUpMinutes" >= 0) AND ("defaultFollowUpMinutes" <= 1439)) AND (("quietHoursStart" >= 0) AND ("quietHoursStart" <= 1439)) AND (("quietHoursEnd" >= 0) AND ("quietHoursEnd" <= 1439))` |
| WorkspacePreference | `WorkspacePreference_phoneRegion_check` | 20260925150000_release_b_phone_region_invites_review | `"phoneRegion" ~ '^[A-Z]{2}$'` |
| WorkspacePreference | `WorkspacePreference_quietDays_check` | 20260920120000_quiet_day_suggestions | `("quietDays" >= 1) AND ("quietDays" <= 365)` |
