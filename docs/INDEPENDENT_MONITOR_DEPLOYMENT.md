# Independent production monitoring

This is the reviewable activation package for the remaining production monitoring requirement. It does not indicate that the additional service or email alerts have been activated.

## Services and cost

The [Render monitor Blueprint](../infra/operations/render-monitor.yaml) runs `ops:watch` every five minutes in its own Oregon container, separate from the web and customer worker. It uses the 0.5 CPU / 512 MiB service ($7/month) and a 1 GiB persistent disk ($0.25/month) for durable outage deduplication state. The [monitor image](../infra/operations/monitor.Dockerfile) prepares the root-owned disk directory and drops to the `node` user before running the process. It has no migration/predeploy command and no application environment group.

An [AWS availability stack](../infra/operations/uptime-stack.json) adds a Python Lambda, five-minute EventBridge schedule, two standard CloudWatch alarms and an SNS email topic. It reads the four public health statuses concurrently, refuses redirects and records only paths/status codes. Failed checks and a missing checker each have alarm/recovery transitions. Lambda has no database, backup or SNS-publish credentials; its execution role can write only its own seven-day status logs. CloudWatch publishes alerts to the topic under an account/ARN-scoped policy.

Allow **$7.25/month additional fixed Render cost and up to $1/month expected AWS usage** at this schedule, excluding tax. The AWS estimate includes two standard alarms, at most 8,928 regular invocations in a 31-day month, 128 MiB functions bounded to 15 seconds, small logs and infrequent email alerts. It does not assume free-tier credits or constitute a provider-enforced spending cap. Confirm actual billing after activation. Sources: [Render pricing](https://render.com/pricing), [Lambda pricing](https://aws.amazon.com/lambda/pricing/), [CloudWatch pricing](https://aws.amazon.com/cloudwatch/pricing/), [SNS pricing](https://aws.amazon.com/sns/pricing/).

The prior web/worker/database and backup budget does not cover this additional monitor. Activation also sends an SNS subscription confirmation and operational/test alerts to the approved email recipient. Obtain those approvals after preparation and validation. No email is sent by template generation or local tests.

## Credentials and evidence

Create a dedicated PostgreSQL login with no superuser, database/role creation or privileged memberships. Apply [the existing column grants](../infra/operations/monitor-grants.sql) as the schema owner and grant database CONNECT. The monitor can read operational columns, maintain the three Operations tables and insert transition audits without forging a staff actor. Verify denied access to customer email, job payloads, support bodies, invitation ciphertext and rate-limit keys against the deployed schema.

Use a separate AWS IAM user with only [the monitor policy](../infra/operations/monitor-aws-policy.json). It can list the `production/` backup prefix, read backup/evidence objects and publish to the one operator SNS topic. It cannot write/delete backups, change the bucket or retrieve SSM recovery keys. Do not reuse the scheduled writer credential.

With `BACKUP_S3_BUCKET` configured, each observation checks S3 evidence directly. The newest complete manifest must identify the canonical database endpoint and match the stored size/SHA-256 of both encrypted objects. The monitor downloads only bounded JSON metadata. It checks the stored manifest checksum and authenticated-manifest format, but it cannot verify the HMAC or decrypt the bundle because it has no recovery key. A missing/corrupt/latest mismatched bundle is unknown; the check does not silently fall back to an older backup. Storage listing beyond 1,000 objects also fails visibly. A thirty-second total deadline bounds storage work within the existing monitor lease.

After a real independent restore, upload the unedited `db:qualify-backup` success receipt to `operations/restore-receipt.json`, with SSE-S3 and an explicit SHA-256 checksum. Preserve the original completion time and canonical source identity. Only the recovery operator can replace that object; use conditional writes when replacing previous evidence. Configure metadata-only retention for that prefix, separate from the seven-day customer backup lifecycle. The monitor accepts only matching source identity, content/foreign-key verification and a valid completion time. It never manufactures a new restore receipt.

Without `BACKUP_S3_BUCKET`, existing local artifact/receipt monitoring remains supported. The durable monitor outage-state file is required in either mode.

## Activation sequence

1. Complete unit, database-role, process and container qualification. Generate the reviewable AWS template:

   ```bash
   node scripts/prepare-operations-stack.mjs --output /private/uptime-stack.json
   aws cloudformation validate-template --template-body file:///private/uptime-stack.json
   ```

2. Obtain approval for the additional cost and the exact email recipient. Deploy the generated stack with `CAPABILITY_IAM` and the `AlertEmail` parameter. Inspect stack events and SNS subscription status. The recipient must follow the confirmation link before delivery can be qualified.
3. Install the reviewed monitor image with restricted credentials, current email/worker/storage limits, the canonical internal database endpoint, the S3 receipt key, the SNS topic ARN and the private durable state path. Set `OPS_ALERT_SNS_TOPIC_ARN` or `OPS_ALERT_WEBHOOK_URL`, never both. A malformed, region-mismatched or ambiguous destination stays unconfigured.
4. Verify an actual complete monitor observation and its eleven operational checks. SNS acceptance is a provider receipt, not proof of inbox receipt. Verify a labelled test, restart persistence and alert/recovery receipt before claiming production notification readiness. SNS standard topics can duplicate deliveries; the existing event IDs, five-attempt limit and daily reminder policy still apply.
5. Verify `/api/health/monitor` freshness and actual five-minute recurrence. Invoke the external function with `{"qualification":"simulate-unavailable"}` to exercise its real CloudWatch alarm path without stopping the product. Verify the next ordinary check recovers. Separately qualify the missing-checker alarm and restore its schedule immediately afterward.
6. Record deployed commits, service/stack IDs, restricted-role proof, successful observations, restart/schedule proof and the operator's confirmed email receipt. Keep unresolved health checks visible in Admin → Operations → Alerts.

This package does not replace physical-device tests, provider inbox qualification, admission-capacity decisions or the remaining full-product completion audit.
