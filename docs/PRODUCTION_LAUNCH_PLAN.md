# Production structure and launch preparation

**Updated:** September 9, 2026

**Status:** Deployment is now the active user-requested objective. The earlier preparation-only deferral is superseded. Render account access, sender/support and public operator details, and the remaining hosted qualification are outstanding; no production deployment or DNS cutover has occurred.

Launch decision: a public waitlist released automatically every 7 days in waves of up to 10 (5 FIFO + 5 random), with additional manual administrator invitations, plus five personal referral invitations per member through the System Mix. Both paths grant free accounts without payment details. Keep operating costs low and increase capacity as usage demonstrates a need. Stripe is deferred until there is a decision to charge.

The complete waitlist, wave-release, permissions, reporting, and operating design is in [Waitlist, referrals, and live administration](ADMIN_OPERATIONS_INFRASTRUCTURE_PLAN.md). The waitlist, weekly waves, and manual invitations are now implemented locally; named staff roles and individual permissions are implemented locally as well; staff invitation onboarding, reports, retention, mix publication/rollback and email recovery are implemented locally. Nothing has been deployed or activated in production. See [Waitlist operation](WAITLIST_OPERATIONS.md) for setup and operator steps.

The owner plans to use Stripe for future payments. This updates the earlier roadmap that excluded Stripe. The current application remains a free beta without an active billing integration; pricing and the date payments begin are undecided.

## Anticipated structure

| Component | Intended setup | Current state |
| --- | --- | --- |
| Domain and DNS | Keep registration and authoritative DNS in AWS Route 53. | `jumpinthemix.com` currently serves the existing Base44 site through Render. |
| Public website and app | One Next.js deployment on Render at `https://jumpinthemix.com`, including the homepage, registration, and signed-in app. Redirect `www.jumpinthemix.com` to the canonical domain. | Proposed; this repository's production app is not deployed. |
| Background processing | One continuously running Render worker, released from the same revision as the web app. Use the existing PostgreSQL job queue. | Worker implementation and `render.yaml` exist; unattended production behavior still needs qualification. |
| Production database | Separate managed Render PostgreSQL database, private to production services, with point-in-time recovery and a tested backup/restore procedure. | Not provisioned. Choose region, sizing, retention, and recovery objectives before activation. |
| Testing | Keep the password-protected `jump-in-the-mix-test.netlify.app` site and its Neon database separate from production. | Running. Test and production must have separate secrets and payment environments. Also qualify releases on the intended Render runtime before production promotion. |
| Transactional email | Resend for account verification, password recovery, and enabled application email. | Integration exists; production credentials, sender DNS, and actual inbox delivery need setup and verification. |
| Payments | Stripe; prefer hosted Checkout and the customer portal. Use Stripe Billing if recurring subscriptions are selected. | Planned integration, not implemented or activated. |
| Support email | A monitored address such as `support@jumpinthemix.com`, connected to an actual mailbox or help desk. | Provider, address, and response ownership are undecided. Sending application emails does not establish a support inbox. |
| Operations | Error reporting, web/worker/database monitoring, alert delivery, independent backup storage, and usage alerts. | Application health endpoints and backup tools exist; production services and operational ownership need setup. |

The unused Netlify production project is not the intended production destination under this plan. The existing Base44 deployment and DNS remain in place until a replacement is verified and the cutover is scheduled. Domain ownership does not require moving the web application into AWS.


## Waitlist waves, personal referrals, and starter budget

The homepage offers **Join the waitlist**. A verified waitlist entry records interest without creating an account. The worker releases up to 10 every 7 days: 5 earliest confirmed signups by original request date, then 5 randomly selected from the remaining verified queue. Administrators can additionally select up to 50 confirmed entries and send manual invitations. Members continue inviting contacts through the **Jump in the Mix System Mix**; each member receives five lifetime invitations, sent inside the application to the contact's saved email.

Both paths issue a unique, single-use URL bound to an email address. When access is granted, that email is removed automatically from the active administrator Waiting queue and moved to Access granted history. Once the account is created, it is recorded as Joined. Retain delivery failures in Needs attention rather than inviting the same email again in a later wave. A shared access decision must prevent duplicate grants or double attribution when a referral and wave overlap.

Wave grants use a platform admission allowance, not an administrator's personal five invitations. Every new verified member gets their own five personal invitations. Capacity controls reserve room for outstanding grants and pace growth against email and hosting limits. Staff permissions separately control waitlist access, wave release, customer data, mix publication, operations, logs, and team management.

Current code contains the homepage waitlist, email confirmation, durable weekly schedule, atomic 5 FIFO + 5 random selection, manual selection, delivery outbox, referral exclusion, history, pause/resume, and waitlist audit records. These require explicit staff permissions and MFA. The staff console works without a customer workspace and supports individual overrides, immediate session revocation, and last-Owner protection; see [Staff access](STAFF_ACCESS.md). New staff invitation onboarding is implemented locally. Admission limits and independent pause controls are implemented locally; see [Admission controls](ADMISSION_CONTROLS.md). Limits start at zero and require an explicit administrator configuration before new grants. Retention automation, suppression clearance, live/saved reports and support-email recovery are implemented locally; see [the completion ledger](PRODUCT_COMPLETION.md) for current local evidence. Signed provider delivery events, permanent-bounce/complaint suppression, sending budgets with an account reserve, and email diagnostics are implemented locally; see [Email operations](EMAIL_OPERATIONS.md). Recipient withdrawal, confirmed rejoining, a shared member/platform invitation outbox, and an Invitations admin page are implemented locally. See the waitlist runbook for cancellation and safe retry boundaries.

Build sequence: shared access/outbox and permission foundations → waitlist and waves → expanded admin console → operational rehearsal → small first release. The detailed design, role matrix, data model, race handling, cost controls, and acceptance tests are in [the infrastructure plan](ADMIN_OPERATIONS_INFRASTRUCTURE_PLAN.md).

Start with email delivery and password signup plus email verification. Google and Apple remain optional for existing-account sign-in. Native apps and payments are deferred. Public production provisioning, DNS cutover, wave sends, and staff additions are later actions, after implementation and qualification.

Estimated starter costs in USD, checked September 8, 2026:

| Component | Rehearsal | Small invited launch |
| --- | --- | --- |
| Render workspace | Hobby: $0 | Hobby: $0 |
| Web app | Free: $0, sleeps when idle | Smallest paid: $7/month |
| Continuous worker | $7/month if qualifying background work | $7/month |
| Render Postgres | Disposable free DB for at most 30 days | Smallest paid: $6/month plus storage |
| Database storage | Free DB fixed at 1 GB | Example: 5 GB at $0.30/GB = $1.50/month |
| Resend | Free within limits | Free: 3,000/month, 100/day |
| Existing Route 53 zone | Existing bill | About $0.50/month plus queries |

The small paid setup totals roughly **$22/month before backup storage, mailbox, taxes, bandwidth/build overages, domain renewal, and separate test-site costs**. Reserve a few dollars for independent encrypted backup storage; choose a mailbox based on existing subscriptions. Sizes must pass the private rehearsal before inviting users.

A free web service with the paid database and worker saves $7/month (about $15/month base), but is suitable only for an explicitly limited rehearsal: it sleeps after 15 idle minutes and can take about a minute to start. Render recommends against free instances for production. Free Postgres expires after 30 days and has no backups; do not put lasting customer data there. Background workers have no free plan. Do not use keep-alive pings or browser-triggered jobs to pretend a free web service is a reliable worker. Free web services also lack pre-deploy commands: run migrations from a trusted local/release environment for a rehearsal; the paid `render.yaml` remains the customer launch configuration.

Paid Postgres on Hobby includes a three-day point-in-time recovery window; independently test encrypted exports and restores. Keep the existing Base44/DNS setup until cutover is verified.

Upgrade based on measured need: web memory pressure or slow requests → larger web instance; database memory/connection/storage pressure → larger DB; overdue queue jobs → worker capacity. The application defaults to 90 attempts per rolling 24 hours and 2,700 per rolling 31 days, including reserves of 20/300 for account email; non-account sends wait or report a temporary failure when their allowance is used. Optional summaries start off for new accounts. Review Admin Email and the provider account together; increase the provider allowance and app limits before essential mail is constrained. Upgrade workspace only for required features or recovery retention. Set usage alerts and a build spend limit; admit users in small batches and pause rollout when performance deteriorates. A $100/month stack is a later capacity decision, not the launch requirement. Use [Customer load qualification](CUSTOMER_LOAD_QUALIFICATION.md) for the new authenticated rehearsal and measured local workload. Repeat qualification under the intended host’s actual limits and background activity before treating those local results as capacity evidence.

Sources: [Render pricing](https://render.com/pricing), [free-tier limits](https://render.com/docs/free), [database recovery](https://render.com/docs/postgresql-backups), [Resend pricing](https://resend.com/pricing).

## Mobile direction

Keep the installable web app for the invitation launch. Validate repeat usage and real iPhone/Android flows first. iOS/iPadOS supports Web Push for home-screen web apps from 16.4; test installation and permissions on real devices. Native apps remain a later product decision, driven by observed need for contact integration, offline workflows, or other device capabilities. Reuse the backend when adding mobile clients; do not fund two additional clients before traction. [WebKit platform guidance](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)

## Decisions to settle first

| Decision | What needs to be agreed |
| --- | --- |
| Launch audience and timing | Decided: free access through administrator waitlist waves and five personal invitations per member via the System Mix. Wave size is 10 (5 FIFO + 5 random) every 7 days; set capacity ceiling and launch date; payments are deferred. |
| What Stripe charges for | Working assumption: account owners pay Jump in the Mix for access to the software. Collecting payments from their customers would be a separate product and payment-flow decision. |
| Pricing and access | One-time or recurring charges; prices, currency, monthly/annual options if relevant, trials, free access, existing beta-account treatment, and any feature limits. The initial release is free; any future paid model remains undecided. |
| Billing policies | Failed-payment grace period, cancellation timing, refunds, plan changes, and how account deletion interacts with active charges, retained records, and data export. |
| Sign-in options | Select launch providers. Start with personal invitation emails, password signup, and email verification. Google and Apple are optional; readiness checks reject partial credentials if either provider is configured. Email verification and recovery remain launch requirements. |
| Operating budget | Budget and alert thresholds for web, worker, database, storage, email, monitoring, and payment fees. Confirm actual plans before activating paid resources. |
| Business and customer policies | Business identity, target markets, tax/accounting setup, public terms and privacy notice, retention/deletion policy, and customer support/refund commitments. |

## Major work before public launch

### 1. Account access and email

Configure the chosen production sign-in providers and callback URLs using the final domain. Verify sender DNS and deliver real verification and recovery emails to different mailbox providers. Exercise expired links, existing accounts, session revocation, and administrator MFA/recovery. Establish a working reply address and support owner.

### 2. Payments, before charging customers

Start with Stripe-hosted Checkout and the customer portal for payment details, invoices, and supported subscription changes. Keep the application responsible for authenticated workspace ownership and access decisions. See [Checkout](https://docs.stripe.com/payments/checkout) and [customer portal](https://docs.stripe.com/customer-management).

Create a new, reviewed billing integration and migrations. The previous dormant billing schema was removed; adding API keys will not enable payments. Resolve pricing and access rules before implementing restrictions on the current unlimited free beta.

Keep Stripe sandbox and live keys, product/price identifiers, customers, and webhook secrets separate. Activate the merchant account and configure business, payout, receipt, and support information before taking live payments. See Stripe's [go-live checklist](https://docs.stripe.com/get-started/checklist/go-live).

Verify webhook signatures against the raw request body. Handle duplicate events and events arriving out of order, durably record processing, and reconcile application access with Stripe. Checkout redirects alone must not grant paid access. Scope Checkout and portal sessions to the signed-in business. Follow [Stripe's webhook guidance](https://docs.stripe.com/webhooks) and [subscription lifecycle guidance](https://docs.stripe.com/billing/subscriptions/webhooks).

Test successful and failed payments, required authentication, abandoned Checkout, retries, refunds, disputes, and duplicate webhook delivery. If subscriptions are selected, also test renewals, cancellations, trial expiry, payment recovery, and plan changes using [Stripe's billing test tools](https://docs.stripe.com/billing/testing). Provide a way to recover from missed events and alert on processing failures. Preserve private testing access controls; choose a webhook test arrangement that does not expose the rest of the test application.

### 3. Reliable follow-ups without user traffic

Deploy and observe the continuous worker on the intended production runtime. Verify due work and notifications while nobody browses the app, recovery after a worker restart, and prevention of duplicate actions. Alert when the heartbeat becomes stale or jobs repeatedly fail. The test site's recorded scheduler gaps exceeding 90 minutes remain unresolved evidence; activity-triggered processing does not close this gate.

The local [worker recovery qualification](WORKER_RECOVERY_QUALIFICATION.md) supplies repeatable process-crash, database-outage and real five-minute maintenance checks. The import recovery migration requires stopping and draining old workers before migration; apply that release exception before restarting the matching application and worker.

### 4. Data recovery and release operations

Use a separate production database and independent production secrets. Decide whether any existing owner data should be migrated; do not copy private test contacts automatically. Enable managed recovery and encrypted backups outside the application host, protect the encryption keys, and restore into a separate database to prove archive recovery. The restore target remains under an application hold; post-backup privacy/access/send reconciliation and a guarded reopening procedure remain required before production cutover. See [Restore recovery](RESTORE_RECOVERY.md).

Deploy web and worker from the same reviewed revision with a coordinated migration step, automated checks, and an application rollback procedure. The packaged [database release checks](DATABASE_RELEASE_CHECKS.md) now hold web readiness and worker startup until required migration history and schema are present. Run `npm run db:verify-release` after applying the reviewed migrations. Validate the Render deployment path in addition to Netlify previews. Record acceptable data loss and recovery time. Render documents continuous backups and recovery for paid PostgreSQL in its [backup guide](https://render.com/docs/postgresql-backups).

### 5. Monitoring, costs, and support

Select error tracking and uptime monitoring; connect readiness, worker heartbeat, job failures, email failures, and future billing webhook failures to a monitored alert destination. Configure spending/usage alerts. Use synthetic accounts for operational checks, keep customer content and secrets out of telemetry, and confirm an operator can investigate and recover a failure.

The application already has private support conversations and admin MFA. Complete the operating side: monitored inbox, responsible responder, recovery instructions for locked-out customers, and a process for payment questions, refunds, and incidents.

### 6. Public policies and customer trust

Prepare public privacy, terms, pricing, and cancellation/refund information that reflects the actual product. Confirm data retention, export and deletion behavior, business contact details, and the tax/accounting approach for the intended markets. Public privacy/terms routes were not found in the current application during this review. Resolve these decisions before accepting customer data or payments as applicable.

### 7. Real customer and phone qualification

Complete the physical iPhone and Android checks for sign-in, onboarding, contact import, message/call handoffs, installation, and enabled push notifications. Test keyboard and screen-reader use. Observe a few representative owners reaching their first useful follow-up. Configure minimal activation and failure analytics without collecting contact details or message bodies. Existing automated checks do not replace these tests; use the [manual device matrix](MANUAL_DEVICE_QUALIFICATION.md).

## Work that can follow the initial release

Automatic SMS delivery and additional external integrations can follow later if excluded from the launch offering. If SMS is enabled, provider registration, consent/opt-out behavior, real delivery checks, and cost controls become prerequisites for that feature. Multiple paid tiers, elaborate discounts, and advanced analytics can also wait until the initial pricing and customer flow are proven. Stripe payment readiness is required before the first real charge, even if public access begins with a free period.

## Planned sequence

1. Launch scope is free access through waitlist waves and five personal referrals per member. Use the agreed seven-day, ten-person waves; finalize staff permissions, capacity limits, customer policies, and the starter budget.
2. Implement and validate the waitlist/access/admin infrastructure plan. Stripe remains deferred for the free launch.
3. When deployment work resumes, provision the production services and validate email, backups, worker behavior, migrations, and monitoring on the intended runtime.
4. Complete the private launch rehearsal and relevant [product quality gates](PRODUCT_QUALITY_GATES.md).
5. Schedule the replacement of the existing Base44 site, update Route 53, verify HTTPS and the `www` redirect, and recheck canonical-origin sign-in, provider callbacks, payments, and health endpoints.
6. Open the agreed launch audience and monitor actual usage and failures.

Detailed deployment mechanics remain in [Hosted deployment](HOSTED_DEPLOYMENT.md). This note records the future structure and open work; it is not a deployment receipt or a claim that launch requirements have passed.
