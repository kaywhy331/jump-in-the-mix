-- Run as the schema owner after migrations, for an existing dedicated login role.
-- psql -v monitor_role=jitm_monitor -v app_schema=public -f infra/operations/monitor-grants.sql
-- The connection secret belongs in the independent host's private environment file.
GRANT USAGE ON SCHEMA :"app_schema" TO :"monitor_role";
GRANT SELECT ("id", "status", "lastSeenAt") ON :"app_schema"."WorkerHeartbeat" TO :"monitor_role";
GRANT SELECT ("id", "failedAt", "completedAt", "runAt", "lockedAt") ON :"app_schema"."Job" TO :"monitor_role";
GRANT SELECT ("id", "status", "nextAttemptAt", "lockedAt") ON :"app_schema"."WaitlistDelivery" TO :"monitor_role";
GRANT SELECT ("id", "authorType", "emailStatus") ON :"app_schema"."SupportTicketMessage" TO :"monitor_role";
GRANT SELECT ("id", "status", "availableAt", "leaseUntil") ON :"app_schema"."SupportEmailDelivery" TO :"monitor_role";
GRANT SELECT ("category", "createdAt") ON :"app_schema"."EmailSendAttempt" TO :"monitor_role";
GRANT SELECT ("id", "scope", "blockedUntil") ON :"app_schema"."AuthRateLimit" TO :"monitor_role";
GRANT SELECT ("id", "action", "createdAt") ON :"app_schema"."PlatformAuditEvent" TO :"monitor_role";
GRANT INSERT ("id", "action", "outcome", "entityType", "entityId", "beforeData", "afterData", "createdAt") ON :"app_schema"."PlatformAuditEvent" TO :"monitor_role";
GRANT SELECT, INSERT, UPDATE, DELETE ON :"app_schema"."OperationsMonitor", :"app_schema"."OperationsCheck", :"app_schema"."OperationsNotice" TO :"monitor_role";
