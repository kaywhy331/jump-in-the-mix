-- Run as the migration/schema owner for an existing dedicated LOGIN role.
-- psql -v backup_role=jitm_backup -v app_schema=public -f infra/operations/backup-grants.sql
GRANT USAGE ON SCHEMA :"app_schema" TO :"backup_role";
GRANT SELECT ON ALL TABLES IN SCHEMA :"app_schema" TO :"backup_role";
GRANT SELECT ON ALL SEQUENCES IN SCHEMA :"app_schema" TO :"backup_role";
ALTER DEFAULT PRIVILEGES IN SCHEMA :"app_schema" GRANT SELECT ON TABLES TO :"backup_role";
ALTER DEFAULT PRIVILEGES IN SCHEMA :"app_schema" GRANT SELECT ON SEQUENCES TO :"backup_role";
ALTER ROLE :"backup_role" SET default_transaction_read_only = on;
