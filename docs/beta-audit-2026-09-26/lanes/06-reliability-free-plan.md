# Lane 6 — Reliability on the free plan

> Raw lane report from the read-only lane reviewer, kept as written. The reconciled severities, merged IDs and runtime labels are in [../FINDINGS_TABLE.md](../FINDINGS_TABLE.md), which takes precedence where the two differ.

**Lane verdict: GO WITH CONDITIONS. One BLOCKER, and it costs nothing to fix.** Nothing in production tells Kevin that a beta user is broken. No alert path is deployed, server errors are not captured anywhere except Render's log stream, and a worker that hangs rather than crashes is never restarted (REL-01). The brief defines "no way to learn that a beta user is broken" as a BLOCKER. Lane 7 rated the overlapping BOPS-01/02 HIGH, so the lead should reconcile the two. The engineering underneath holds up: job leases and retries, the SIGTERM stop flag, crash-safe imports, fail-safe automatic sends, an idempotent pre-deploy, and a service worker that cannot serve stale HTML. Nothing in the code needs an always-on web instance. The five MEDIUMs are stalls and error surfaces that a small plan makes more likely:
- one owner's import stalls background work for every other beta user;
- a stopped worker keeps promising sends and imports;
- the worker health check measures a timer, not progress;
- a database hiccup shows a bare text page;
- each release breaks saves in tabs that are already open.

Reviewed at production commit `4b5abd8` (checkout `/tmp/jitm-beta-audit-20260926`). No untracked owner files were read. I read the lane-5 and lane-7 reports only to avoid duplicating them. The only command I ran beyond reading was a tiny `node -e` heap-size probe under a 512 MB user cgroup (shown in the flows section).

## Summary table

| ID | Severity | Label | Title |
|---|---|---|---|
| REL-01 | BLOCKER | VERIFIED (code, docs) / NOT RUN (Render account notifications) | Nothing tells Kevin when a beta user is broken: no alert path is deployed, server errors go only to Render's log stream, and a hung worker is never restarted |
| REL-02 | MEDIUM | VERIFIED (code) / INFERRED (duration) | One owner's contact import stalls background work for every workspace. It is one long job plus one preparation job per row in a single oldest-first queue, and with a group-audience Mix the cost grows with the square of the import size |
| REL-03 | MEDIUM | VERIFIED (code) / INFERRED (UX) | While the worker is down, the app keeps promising work that is not happening: an import stays "running" at 0% forever, and a follow-up "Sends automatically any minute now" |
| REL-04 | MEDIUM | VERIFIED (code) / NOT RUN (Render supervision) | `/api/health/worker` reports the heartbeat timer, not job progress. A stalled or hung worker still answers "ready", and Render does not restart a hung worker |
| REL-05 | MEDIUM | VERIFIED (code) / INFERRED (UX) | Any database hiccup shows every signed-in user a bare plain-text 503 with no retry or navigation, which is a dead end in the installed iPhone app |
| REL-06 | MEDIUM | VERIFIED (code) / INFERRED (UX) | Every release breaks saves in open tabs: an unknown Server Action ID becomes "Check your connection" on every retry, and assets mismatch during the instance switchover |
| REL-07 | LOW | VERIFIED | Still open (prior OPS-F10): readiness is expensive, public and uncached, and doubles as Render's health check. It also fails when the web database pool is busy. `/api/health/recovery-boundary` is an unused public database read on Render |
| REL-08 | LOW | VERIFIED (code) / INFERRED (latency) | Sparse beta traffic reconnects to the database on most page views, because both pools drop idle connections after 10 seconds |

## Flows traced

**Worker loop.** `render.yaml:76` `node --import tsx src/worker/index.ts` →
- `main()` (`src/worker/index.ts:364-401`) waits up to 5 min for a ready database release (`database-release.ts:68-80`), then exits so Render restarts it.
- The heartbeat is its own 15 s timer (`:25`, `:373-376`), chained so that one hung write blocks the next (`:88-94`).
- The loop (`:385-396`) checks the release every 30 s (`:386`), runs due maintenance (`:327-362`), claims one job (`:103-138`), processes it (`:213-284`), and otherwise sleeps 2 s.
- Claims are an atomic compare-and-set on `attempts`: the oldest `runAt` first across all workspaces (`:106-118`), report jobs only when nothing else is due.
- Leases last 10 min and renew every 30 s, with lost-lease detection (`:26-27`, `:217-228`).
- Retries back off exponentially with jitter, from 5 s up to 6 h (`:142-145`). `PermanentJobError` fails at once (`:252-253`).
- SIGTERM sets `stopping` (`:432-438`). After it, no new job is claimed, the remaining maintenance passes are skipped (`:336,342,350,356`), an import pauses between 25-row chunks (`contact-import-jobs.ts:225-227`), and the paused job goes back to the queue with its attempt returned (`index.ts:203-211`). The worker then records `STOPPED` (`:397-400`).
- Any database error that escapes the loop (the release check, the claim, recording a failure) rejects `main()`, so the worker marks itself stopped and exits 1 (`:439-446`). An in-flight job keeps its lease for 10 minutes and is then reclaimed.
- An uncertain automatic send is marked FAILED and never resent (`automatic-delivery.ts:100-107`).

**Memory.**
- The worker transpiles its TypeScript at start through tsx. A static walk from `src/worker/index.ts` reaches **229 modules and about 12 MB of source**, 121 of them in the generated Prisma client. I computed that with a file-reading `node -e` script: output `modules 229 sourceKB 12011 generated 121`.
- The heap-size probe (Node v22.22.0 on TrixBot; production pins 22.23.2) printed:
  ```
  $ systemd-run --user --scope -p MemoryMax=512M -- node -e '...heap_size_limit...'
  512M cgroup heap_size_limit MB 259   constrainedMemory MB 512
  with --max-semi-space-size=8: 280
  ```
  So both 512 MB services get a V8 heap cap of about **259 MB (worker) and 280 MB (web)**, provided Render exposes its limit as a cgroup (NOT RUN). This matches the earlier local measurement in `docs/CUSTOMER_LOAD_QUALIFICATION.md:91-98`: web cgroup peak 244 MiB at 5 concurrent requests with semi-space 8.
- There is no worker memory measurement anywhere in the docs.
- The unbounded loads that could reach the heap cap are REL-02's group reloads and prior OPS-F1 (Today loads each active instance's full definition).

**When the worker is down or asleep.** As far as I know, Render does not offer its sleeping free instance type for background workers (NOT RUN). "Down" therefore means crashed, restarting, deploying, hung or suspended.

| Feature | Worker path | What the user sees while it is down | Does Kevin hear? |
|---|---|---|---|
| New follow-ups after adding or editing a contact, assigning a Mix, marking one done, Journey edits | `generate-jumps` job (for example `contact-actions.ts:255`, `jumps/[jumpId]/outcome/route.ts:267`) → `worker/index.ts:174-177` | "Preparing your follow-ups…", then "Follow-ups are taking longer to prepare. Your changes are saved…" (`PreparationNotice.tsx:113-120`). Today reads "Your follow-up list is awaiting preparation." (`jumps/page.tsx:425`) | No |
| Onboarding's first follow-up | generated inside the request (`onboarding-actions.ts:129`) | works | — |
| Contact import (the wizard always queues, `ContactImportWizardV2.tsx:333`) | `contact-import` job | "Import is running · 0 of N · 0%" forever (REL-03) | No |
| Automatic email and text | `runAutomaticDeliveries` every minute (`index.ts:332`) | "Sends automatically any minute now…" forever (REL-03) | No |
| Push reminders, daily digest, weekly report | `runScheduledNotifications` (`:347`) | nothing arrives; the digest catches up later the same local day (`notification-delivery.ts:51-53`) | No |
| Mix decisions and timeouts | `mix-workflow` jobs + maintenance (`:330`) | "Needs your input" items do not advance | No |
| Journey stage moves, calendar feed refresh, date-based follow-ups entering the horizon | maintenance (`:331,338,339`) | stale; Calendar says "may be out of date" after 24 h and offers "Refresh now" (`calendar/page.tsx:76,94`) | No |
| Beta, staff and referral invitations | encrypted outbox (`access-invitation-mail.ts:18`, `staff-invitations.ts:66`) → `deliverWaitlistInvitations` (`:345`) | the invitee gets nothing | only on Admin → Waitlist / Access |
| Waitlist waves, support-reply emails, report exports, retention, Marketplace refresh, phone-key sweep | `:344`, `:346`, report jobs, `:353`, `:357-361`, phone-keys job | delayed or stale | only on admin pages |
| Verification, magic-link and password-reset emails; waitlist confirmation | **inside the request**, one attempt (`auth-actions.ts:121,264,428`); `waitlist-actions.ts:41` | unaffected | — |

**Cold start and sleep.**
- Every page is dynamic because the root layout awaits `connection()` (`src/app/layout.tsx:42`).
- After a restart, Render's health check (`render.yaml:45`) hits `/api/health/ready`. That runs the configuration check and the first Prisma use (`prisma.ts:11`), which creates the pool lazily, and it warms the route runtime.
- The first signed-in request then pays for the proxy's own recovery pool (`recovery-hold.ts:19`, a separate module instance in the proxy bundle), the session lookup (`auth.ts:168-186`) and route module loading.
- Seeds run only in pre-deploy (`render.yaml:43`), never on a request. Nothing is cached in memory across requests beyond configuration parsing (`client-ip.ts:80`).
- **Nothing in the design assumes an always-on web instance.**
  - Rate limits live in PostgreSQL (`rate-limit.ts:45-51`).
  - `after()` is used only for the Netlify dispatch, which is a no-op on Render (`worker-dispatch.ts:9`, `worker-dispatch-after.ts:7-10`).
  - The web has no server timers.
  - Resend webhooks are retried by the provider.
  - The worker is a separate service.
- If the web were ever on a sleeping instance type (render.yaml says `0.5c-512mb`), only timeouts would bite:
  - the service worker's 8 s check before showing a push (`public/sw.js:68`), so the push is dropped;
  - the 10 s preparation poll (`PreparationNotice.tsx:46,70`);
  - the 10 s import poll, which stops polling after one failure (`ContactImportWizardV2.tsx:235,245`).
- The Cloudflare scheduler targets only the Netlify test site (`infra/cloudflare-scheduler/wrangler.jsonc:9-10`; `docs/CLOUDFLARE_SCHEDULER.md:3` "Prepared, not activated"). Production does not use it.

**Health endpoints** (all public; the proxy lets GET `/live`, `/ready` and `/recovery-boundary` through without its database read, `proxy.ts:15`):

| Path | Checks | Leaks | Notes |
|---|---|---|---|
| `/api/health/live` | nothing (`live/route.ts:1-3`) | timestamp | not used by Render |
| `/api/health/ready` | production configuration plus the full database release check (`ready/route.ts:4-31` → `database-release.ts:12-53`) | `deployment: standard/private-test`; database state category | Render's health check. REL-07, prior OPS-F10 |
| `/api/health/monitor` | independent monitor freshness (`monitor/route.ts:4-11`) | that no monitor runs (503) | expected 503 in production (REL-01) |
| `/api/health/worker` | newest RUNNING heartbeat within 90 s (`worker/route.ts:3-25`) | nothing | timer, not progress (REL-04) |
| `/api/health/recovery-boundary` | direct, uncached hold read (`recovery-boundary/route.ts:4-7`) | clear/held/unavailable | unused on Render (REL-07) |

**Error surfaces.**
- Only the root has `src/app/error.tsx` ("We couldn't open this page." with Try again and Get help, `:5-10`; `retry` is the correct Next 16.3 prop per `node_modules/next/dist/docs/.../error.md:117-121`) and `src/app/not-found.tsx`.
- There is no `global-error.tsx`. The root layout touches the database only for an impersonation cookie (`SupportViewRecovery.tsx:6-7`), so that is low risk.
- There is no `(app)` or `(staff)` error boundary, so a page error replaces the navigation shell.
- In production Next sends a generic message plus a digest (`error.md` "error.message"). The page never shows the digest.
- Server Action failures become "We couldn't confirm this save… Check your connection…" in `ActionForm.tsx:11-13` (32 forms), `ContactForm.tsx:93`, `CalendarEntryForm` and `MixEditor`.
- The proxy's fail-closed response is plain text (REL-05).

**Service worker.**
- Navigations are network-only with an inline offline page (`sw.js:39-41`).
- Only content-hashed `/_next/static/*` and four icons are cached, cache-first (`:44-55`).
- `skipWaiting` and `clients.claim` purge older `jitm-` caches (`:18-25`). Registration uses `updateViaCache: "none"` plus `update()` on every load (`PwaRegistration.tsx:9-10`), and `sw.js` is served no-store (`next.config.ts:26-29`).
- **A stale service worker cannot keep serving old code after a release.** Old hashed chunks accumulate in `jitm-public-v4` until the next cache-version bump; that is minor (about 2.2 MB of static assets per build).

**Monitoring: how Kevin would find out.**

| Event | What exists | When Kevin learns |
|---|---|---|
| A beta user gets a 500 on Today at 7 am | Next logs the error and digest to stdout (Render logs). The user sees the root error page with no reference code. | Only if the user emails `support@`, which is forwarded (`help/page.tsx:35`). An in-app ticket notifies nobody (BOPS-01). |
| The worker dies at midnight | Render restarts a process that exits (NOT RUN). `/api/health/worker` turns 503, but nothing polls it. Users see REL-03's promises. | When he next opens Admin → Operations (`operations/page.tsx:107,137`) or Waitlist (`waitlist/page.tsx:77`). The Overview does not show worker health (`admin/page.tsx:22-35,65-66`). |
| The worker hangs (process alive) | The heartbeat goes stale only if its own write hangs; Render has no health check for workers (NOT RUN) | Same as above, and nothing restarts it |
| Backups stop | `backup-to-s3.mjs:38-39` logs and exits non-zero. The only freshness check lives in the undeployed monitor (`operations-signals.ts:40`). | Only from the Render dashboard, or Render email if enabled (NOT RUN). If the cron is not scheduled at all: never. |

**Database limits.**
- The web keeps up to 10 Prisma connections plus 2 in the proxy's pool; the worker keeps up to 10. These are pg-pool defaults: `max` 10 and idle timeout 10 s (`node_modules/pg-pool/index.js:89,98-100`, via `prisma.ts:11`) plus `recovery-hold.ts:19`.
- Add one backup connection and transient pre-deploy or migration jobs. That is about 25 steady and about 50 during a deploy overlap. Render's `max_connections` for `0.1c-256mb` is NOT RUN.
- Today runs 7 and then 6 queries in parallel per render (`jumps/page.tsx:163-174,182-189`).
- The release check covers **1,108 expected columns, 179 enum labels and 71 migrations** (`node -e` over `src/generated/schema-release.ts`: `{ cols: 1108, enums: 179, migs: 71 }`).
- Prior scale findings at a few dozen workspaces:

| Prior | Status at 4b5abd8 | Bites in this beta? |
|---|---|---|
| OPS-F1 | Open: `workflow-attention.ts:36-40` still selects `definition` for every ACTIVE instance on each Today render | Only in a workspace with Journey connections over hundreds of contacts. Instances exist only when rules or gated Beats do (`jump-engine.ts:474`), and only `saveWorkflowConfiguration` writes rules (`mix-workflow.ts:46`). |
| OPS-F2 | Fixed (C-1, C2) | No |
| OPS-F3 | Race fixed (Release A, G3b). Cost remains: every workspace has a `WorkspacePreference` (`account-provisioning.ts:46`), so up to 25 full reconciles run every 5 min (`index.ts:299-325`) | Fits up to 25 workspaces; with 40 the cadence slides to about 8 min (INFERRED) |
| OPS-F4 | Open (C-3 parked) | Only with ACTIVE instances; capped at 50/min |
| OPS-F5 | Start command and stop flag fixed. The 300 s delay is not applied (parked); Render's default is 30 s (NOT RUN) | Rare: a slow automatic-send pass can be killed, and the send is then marked failed, never duplicated |
| OPS-F6 | Partial index `Job_claim_ready_idx` exists (`prisma/migrations/20260722010000_integrity_constraints/migration.sql:149-151`) | No |
| OPS-F7 | Session and preferences cached (C-1, C9); the per-request hold read stays by owner decision | See REL-05, REL-08 |
| OPS-F8, F9, F11, F13 | Fixed (C-1 C5, C-1 C6, A2 `import/route.ts:119-131`, C-1 C8) | No |
| OPS-F10 | Open | REL-07 |
| OPS-F12 | Parked (C-4) | Only under bursts |
| OPS-F14 | Fixed for sign-in, verification and reset; other senders still retry (MSG-11) | Minor |

**Deploy and rollback.**
- The pre-deploy step only checks the runtime role (`configure-runtime-database.mjs:18-21`) and the release (`verify-database-release.ts:7-9`). Its seed only inserts what is missing (`install-application-catalog.ts:17-26`, `publish-plan-library.ts:15`).
- Code checks only the migrations it knows (`database-release.ts:28-32`), so the previous commit keeps running after an additive migration. That is what makes rollback a redeploy.
- The recovery hold is enforced by the proxy (fail closed) and by the worker's 30 s release check.
- The web server finishes in-flight requests on SIGTERM (`node_modules/next/dist/server/lib/start-server.js:321-376`).

## Findings

### REL-01 — Nothing tells Kevin when a beta user is broken
- Severity: BLOCKER · Label: VERIFIED (code, docs) / NOT RUN (Render and AWS account settings) · Prior: none. Overlaps BOPS-01 and BOPS-02 (lane 7, HIGH); this finding adds the error-capture and hung-worker gaps.
- What the user experiences: nothing different. That is the problem. A tester whose Today throws at 7 am sees "We couldn't open this page." with no reference. A tester whose imports and sends stall sees REL-03's promises. Neither event reaches Kevin, and the target user (a plumber between jobs) quits rather than filing a report.
- Reproduction:
  1. `GET https://jumpinthemix.com/api/health/monitor` returns 503: no monitor observation in 15 minutes.
  2. Sign in as the owner and open `/admin`. "Monitoring needs a check" is always present, and no item reflects worker health.
  3. Locally, stop the worker. `/api/health/worker` turns 503 after 90 s, and nothing is sent anywhere.
- Evidence:
  - **Only the monitor sends alerts.** The only code that delivers an alert is the independent monitor: `scripts/check-operations.ts:24-44` → `src/lib/operations-notifications.ts:4-36` (`OPS_ALERT_WEBHOOK_URL` or SNS). The web and the worker never import the delivery path (`git grep operations-notifications` → only `scripts/` and `operations-alerts.ts`, which is used by the monitor and the acknowledge action).
  - **The monitor is not deployed.** `render.yaml` defines only web and worker. `infra/operations/render-monitor.yaml:1` says "Deploy only after approving the additional service/disk and alert recipient" and costs $7.25/month (`docs/INDEPENDENT_MONITOR_DEPLOYMENT.md:7,11`). `docs/PRODUCTION_LAUNCH_PLAN.md:25`: "The prepared continuous monitor and alert channel await the existing spending and outgoing-message approval." `docs/PRODUCT_COMPLETION.md:18`: "The continuous monitor, actual channel delivery and outer uptime checks remain to activate and qualify." No release record from A to D mentions activation. `jitm-monitor.service` is a template: `docs/OPERATIONAL_ALERTS.md:46`, "No service is installed or started".
  - **No server-error capture.** There is no `instrumentation.ts` (`git ls-files | grep instrumentation` is empty), so Next's `onRequestError` hook (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/instrumentation.md:36-38`) is unused. There is no error-reporting SDK and no `window.onerror`/`unhandledrejection` handler (grep). `src/app/error.tsx:5` ignores `error`, so the digest that matches Render's log line is never shown.
  - **Admin is pull-only.** The Overview's attention list (`src/app/(staff)/admin/page.tsx:65-66`) has a monitor item that is always on and a failed-jobs item. A dead worker creates no failed jobs.
  - **Backups.** `scripts/backup-to-s3.mjs:38-39` only logs and sets `process.exitCode`.
  - **Hung worker.** Render restarts a process that exits, but the worker's pool has no query timeout or TCP keepalive (`prisma.ts:11`, pg defaults), so a query on a silently dead connection can wait indefinitely (REL-04).
- Root cause: alerting was built around a paid always-on monitor that the free plan of record does not run, and nothing cheaper replaced it.
- Fix direction: schedule the existing credential-free `scripts/production-smoke.mjs` (it checks live, ready and worker) as an hourly GitHub Actions cron in the public repo, which emails on failure at no cost. Alternatively, deploy the prepared `infra/operations/uptime-stack.json` (Lambda every 5 min, 2 alarms, SNS email), which is probably within AWS's always-free allowances but should be confirmed, after removing `/api/health/monitor` from `uptime.py:9`, where it would alarm forever. Also turn on Render's failure notifications, add an `onRequestError` that records path, digest and time (no bodies) and shows a count on a public health path the checker polls, and show `error.digest` on the error page.
- Runtime check for the lead: `curl -s -o /dev/null -w '%{http_code}\n' https://jumpinthemix.com/api/health/monitor` should print 503. Also ask Kevin whether Render's failure notifications reach an inbox he reads.

### REL-02 — One owner's contact import stalls background work for every workspace
- Severity: MEDIUM (HIGH if the runtime check shows more than about 10 min for 1–2k rows) · Label: VERIFIED (code) / INFERRED (duration) · Prior: related to OPS-F3. New: the per-row fan-out and the per-contact group reload.
- What the user experiences:
  - The importing owner's Today reads "Preparing your follow-ups…", then "Follow-ups are taking longer to prepare", until every per-row job has drained.
  - Every other tester's new follow-ups wait behind that queue.
  - While the import job itself runs, nobody's automatic sends, push reminders, digests or invitation emails go out.
- Reproduction:
  1. Locally, with the worker running, create a group and give a Mix that group as its audience.
  2. Import 1,000–2,000 rows into the group at `/contacts/import`.
  3. From a second account, add a contact with a Mix at `/contacts/new` and time its preparation notice.
- Evidence:
  - **The whole import is one job.** `contact-import-jobs.ts:225` (`for (let index = 0; index < pendingItems.length; index += PROCESSING_BATCH_SIZE)`), up to 5,000 rows (`ContactImportWizardV2.tsx:403`). Maintenance runs only between jobs (`worker/index.ts:385-396`).
  - **Each row queues its own preparation job.** `contact-import-service.ts:396-398` (`tx.job.create({ data: { workspaceId, task: "generate-jumps", payload: { contactId } } })`), called per created or merged row at `:464` and `:645`.
  - **Claims are oldest-first across all workspaces**: `worker/index.ts:114` (`orderBy: [{ runAt: "asc" }, { createdAt: "asc" }]`).
  - **Group-audience Mixes are reloaded per contact.** A per-contact reconcile matches assignments by group membership (`jump-engine.ts:196`), loads every member of the group with emails, phones, addresses, custom fields and dates (`:210-226`, no `where` on `memberships`), and then filters in JavaScript (`:405` `if (filters.contactId && contact.id !== filters.contactId) continue;`). N imported rows therefore load about N²/2 member records.
  - Today's notice covers the whole workspace (`jumps/page.tsx:161`, `preparation.ts:11-33`, `PreparationNotice.tsx:113-120`).
- Root cause: per-row job fan-out in a shared first-in-first-out queue, and per-contact reconciles that reload whole groups.
- Fix direction: filter `group.memberships` to `filters.contactId` in per-contact reconciles, queue one workspace preparation job per import chunk instead of per row, and optionally run one chunk per job so maintenance interleaves.
- Runtime check for the lead: in the reproduction above, time how long `SELECT count(*) FROM "Job" WHERE task='generate-jumps' AND "completedAt" IS NULL` takes to reach 0, watch PostgreSQL CPU, and time the second account's preparation. Use a disposable local database only.

### REL-03 — While the worker is down, the app keeps promising work that is not happening
- Severity: MEDIUM · Label: VERIFIED (code) / INFERRED (UX) · Prior: none. A symptom of REL-01; the email wording is MSG-02.
- What the user experiences:
  - A queued import shows "Import is running", "0 of N rows processed · 0%" and "You may close this page; the import will continue." indefinitely.
  - An automatic follow-up whose send window has opened says "Sends automatically any minute now unless you send, snooze or skip it first." for hours.
  - Follow-up preparation, by contrast, honestly says "taking longer".
- Reproduction:
  1. Stop the local worker.
  2. Queue a 50-row import at `/contacts/import`.
  3. With automatic email on and a follow-up whose window is open, open `/jumps`.
  4. Wait 10 min and reload both.
- Evidence:
  - The import screen polls every 1.5 s with no deadline or progress-staleness check (`ContactImportWizardV2.tsx:228-250`) and shows the running copy at `:457`.
  - Automatic-send copy: `EditableFollowUpAction.tsx:74`, driven by `sendWindow.open` (`jumps/page.tsx:301,352`) without any worker check.
  - No user-facing code reads worker health: `git grep workerHeartbeat` finds only admin pages, health routes, the Netlify dispatch and the worker.
- Root cause: the worker's liveness is visible only to staff.
- Fix direction: expose one "background work delayed" signal (heartbeat age plus the oldest due job's age, the same query as `/api/health/worker` and `operations-signals.ts:14`). Show it on Today, the import screen and the automatic-sending settings, and have the import screen say so after N minutes without progress.
- Runtime check for the lead: the reproduction above. Record the exact on-screen text after 10 minutes.

### REL-04 — `/api/health/worker` reports the heartbeat timer, not job progress, and nothing restarts a hung worker
- Severity: MEDIUM · Label: VERIFIED (code) / NOT RUN (Render supervision semantics) · Prior: none. `docs/WORKER_RECOVERY_QUALIFICATION.md:3` already states the limitation.
- What the user experiences: REL-03's promises. Once Kevin adds the free external check from REL-01, it would still read "ready" during REL-02's stalls or a blocked loop.
- Reproduction:
  1. Start a 2,000-row import locally.
  2. Poll `/api/health/worker` every 10 s while a second workspace's job waits. It stays 200.
- Evidence:
  - The heartbeat runs on its own timer (`worker/index.ts:373-376`), and the route checks only `lastSeenAt` (`health/worker/route.ts:11-19`).
  - The monitor's overdue-job check (`operations-signals.ts:14`) runs only in the undeployed monitor.
  - The Prisma pool has no `query_timeout` or `keepAlive` (`prisma.ts:11`). A hang stops the chained heartbeat (`index.ts:88-94`) but never makes the process exit, and Render background workers have no health check (NOT RUN).
- Root cause: liveness is measured on a side timer rather than on loop or job progress.
- Fix direction: make `/api/health/worker` also return 503 when the oldest due, unlocked job is older than about 15 min. Add a watchdog that exits when neither a loop iteration nor a lease renewal succeeds for about 15 min, and set `keepAlive` and `query_timeout` on the worker pool.
- Runtime check for the lead: the reproduction above.

### REL-05 — Any database hiccup shows every signed-in user a bare plain-text page with no way back
- Severity: MEDIUM · Label: VERIFIED (code) / INFERRED (UX) · Prior: OPS-F7 described the per-request read; this is the screen it produces.
- What the user experiences: during a brief database restart, slowness (a 1.5 s statement limit on the 0.1-CPU database) or a pool wait, every signed-in navigation and every save shows only "Jump in the Mix is temporarily unavailable. Please try again later." There is no styling, no Try again and no link. In the installed iPhone app (`manifest.ts:10` `display: "standalone"`) there is no back or reload control, so the tester must force-quit. A save instead shows ActionForm's "…Check your connection…".
- Reproduction:
  1. On a disposable local database, run `ALTER DATABASE <db> SET jitm.recovery_hold='audit'` ("held" and "unavailable" produce the same page).
  2. Sign in first, then open `/jumps` at 390 px.
  3. Reset the setting afterwards.
- Evidence:
  - `proxy.ts:132-141`: `new NextResponse(message, { status: 503, headers })`, which is text/plain.
  - Any failure is "unavailable": `recovery-boundary-client.ts:52-54`, and `recovery-hold.ts:19,23-28` with budgets `recovery-hold-budget.mjs:11-14` (5 s connect, 1.5 s statement, 2 s query, 7 s deadline, pool of 2).
  - The service worker passes 5xx responses through (`sw.js:40` only catches network errors).
  - Public pages are exempt (`proxy.ts:12-20,131`).
- Root cause: failing closed is deliberate and right for recovery, but the response was designed as a machine signal, not a page for a person.
- Fix direction: return a small self-contained HTML 503, in the style of `sw.js`'s `OFFLINE` page, with "Try again" pointing at the same URL and a timed retry, keeping fail-closed behaviour and `Retry-After`.
- Runtime check for the lead: the reproduction above, plus one save attempt.

### REL-06 — Every release breaks saves in open tabs
- Severity: MEDIUM · Label: VERIFIED (code) / INFERRED (UX) · Prior: none.
- What the user experiences: a tester with a contact, calendar, Mix or any ActionForm open across a deploy presses Save and reads "We couldn't confirm this save… Check your connection…". Every retry fails the same way until the page reloads, and the reload can discard the typed text. During the instance switchover a page can also load without its CSS.
- Reproduction:
  1. Build two standalone packages, A and B.
  2. Serve A on :3101 and fill `/contacts/new`.
  3. Stop A and start B on :3101.
  4. Press Save twice.
- Evidence:
  - Next answers an unknown action ID with 404 and a not-found header (`node_modules/next/dist/server/app-render/action-handler.js:378-392`), and the client throws `UnrecognizedActionError` (`client/components/router-reducer/reducers/server-action-reducer.js:102-108`).
  - That error is caught generically by `ActionForm.tsx:11-13` (32 uses) and `ContactForm.tsx:93`.
  - `next.config.ts:20-40` has no `deploymentId`. Navigations do reload on a build mismatch (`fetch-server-response.js:175-177`), so only open forms are affected.
  - The CSS chunk 404 during rollover is recorded in `docs/FULL_AUDIT_2026-09-24.md:125`.
- Root cause: no version-skew handling for Server Actions on a single-instance host.
- Fix direction: in those catch blocks, detect `unstable_isUnrecognizedActionError` (exported by `next/navigation`) and say "Jump in the Mix was just updated — your text is kept; reload to save", ideally keeping the draft. Also set `deploymentId` per commit and release in quiet hours.
- Runtime check for the lead: the reproduction above.

### REL-07 — Still open (prior OPS-F10): readiness is expensive, public and uncached, and doubles as Render's health check
- Severity: LOW · Label: VERIFIED · Prior: OPS-F10 (P2).
- What the user experiences: nothing, normally. When the database blips, or the web's 10-connection pool is saturated (for example while REL-02 loads the database), `/ready` returns 503 and Render may stop routing to the instance or restart it (NOT RUN), adding a cold start on top of the blip.
- Reproduction: none safe on production. Locally, block the database and watch `/api/health/ready`.
- Evidence:
  - `render.yaml:45` is `healthCheckPath: /api/health/ready`, and `ready/route.ts:15-17` returns 503 on any non-ready state.
  - `database-release.ts:18-51` is a RepeatableRead transaction with `maxWait: 5_000`, so a pool wait also counts as "unavailable". It includes the shape check over 1,108 columns.
  - `recovery-boundary/route.ts:4-7` is an unauthenticated, uncached database read that Render does not need (`recovery-boundary-client.ts:29-31`).
- Fix direction: cache a "ready" result for about 10 s in-process, and after first success report transient database errors without 503; the pre-deploy `db:verify-release` already gates deploys (`render.yaml:43`). Return 404 from `recovery-boundary` unless `RECOVERY_BOUNDARY_PATH` is set. Both are owner decisions per OPS-F10.
- Runtime check for the lead: five timings each of `/api/health/ready` and `/api/health/live` on production. The difference approximates what each Render probe costs the 0.1-CPU database.

### REL-08 — Sparse beta traffic reconnects to the database on most page views
- Severity: LOW · Label: VERIFIED (code) / INFERRED (latency) · Prior: related to OPS-F7.
- What the user experiences: a tester who reads Today for more than 10 seconds before tapping pays for new PostgreSQL connections on the next view: up to 7 in parallel for Today, plus the proxy's own. The 0.1-CPU database has to start a new backend process and authenticate for each one.
- Reproduction:
  1. Signed in, time `GET /jumps` five times back to back.
  2. Time it five more times with 20 s between requests.
- Evidence: `prisma.ts:11` `new PrismaPg({ connectionString })` → pg-pool defaults `max` 10 and `idleTimeoutMillis` 10000 (`node_modules/pg-pool/index.js:89,98-100`); `recovery-hold.ts:19` `idleTimeoutMillis: 10_000, allowExitOnIdle: true`; parallel queries at `jumps/page.tsx:163-174,182-189`.
- Fix direction: set `idleTimeoutMillis: 300_000` on both pools, and optionally `max: 5` on the web pool to cap backends on the 256 MB database.
- Runtime check for the lead: the reproduction above. Report the median difference.

## What holds up
- **Job claims, leases and retries.** Compare-and-set on `attempts` (`worker/index.ts:123-137`), 30 s lease renewal with lost-lease detection (`:217-228`), exhausted jobs fail visibly (`:231`), permanent errors never retry (`:252`), backoff 5 s–6 h (`:142-145`).
- **Graceful stop.** SIGTERM reaches Node directly (`render.yaml:76`). Imports pause between chunks and resume without spending an attempt (`contact-import-jobs.ts:227`, `index.ts:203-211`), covered by real-process tests (`tests/worker-runtime.integration.test.ts:116,138,184`).
- **Crash safety.**
  - Each import row, with its job and receipt, is one transaction (`contact-import-service.ts:681-720`).
  - Uncertain automatic sends fail and are never resent (`automatic-delivery.ts:100-107`).
  - Today outcome and contact creation are idempotent per attempt (Release A G3a, A2).
- **Auth email does not depend on the worker** (`auth-actions.ts:121,264,428`). Onboarding's first follow-up is generated in the request (`onboarding-actions.ts:129`).
- **External calls have timeouts.** Resend 15 s (`transactional-email.ts:103`), Twilio 15 s (`automatic-delivery.ts:61`), push 10 s (`follow-up-push.ts:54`), OAuth 15 s (`social-auth.ts:176`).
- **Unhandled errors do not kill the web.** The web server logs uncaught exceptions and unhandled rejections instead of exiting (`node_modules/next/dist/server/lib/router-server.js:642-655`) and drains requests on SIGTERM (`start-server.js:321-376`).
- **No always-on assumption.** Database-backed rate limits, no web timers, no in-memory caches (see the cold-start flow).
- **Service worker.** Never caches HTML or API responses, updates on every load, and cleans legacy caches (`sw.js:18-55`; `tests/service-worker.test.ts`).
- **Deploy safety.** Read-only pre-deploy checks and an insert-missing seed. Old code tolerates newer additive migrations (`database-release.ts:28-32`).
- **Prior fixes confirmed.** Job claims use the partial index (`20260722010000_integrity_constraints/migration.sql:149-151`), and the import body is bounded (`import/route.ts:119-131`).
- **Memory.** The web's 512 MB profile was measured locally at a 244 MiB cgroup peak with semi-space 8 (`docs/CUSTOMER_LOAD_QUALIFICATION.md:91-98`), consistent with the 280 MB heap cap measured here.

## Test coverage for this lane
- **Worker leases, pause, SIGKILL, outage and restart:** `tests/worker-runtime.integration.test.ts`, `tests/worker-shutdown.test.ts`, `tests/contact-import-pause.integration.test.ts`, `tests/contact-import-recovery.integration.test.ts`.
- **Readiness and recovery hold:** `tests/database-readiness.test.ts`, `tests/recovery-hold-proxy.test.ts` (asserts only that the 503 text contains "temporarily unavailable"), `tests/recovery-hold-runtime.integration.test.mjs`, `tests/recovery-boundary-client.test.ts`.
- **Heartbeat:** `tests/operations-readiness.test.ts:34-43` (source-string check only).
- **Monitor and alerts:** `tests/operations-monitor(.integration).test.ts`, `tests/operations-sns*.test.ts`, `e2e/operational-alerts.spec.ts`.
- **Service worker:** `tests/service-worker.test.ts`, `tests/pwa-boundary.test.ts`.
- **Preparation state:** `tests/preparation.integration.test.ts`, `tests/preparation-routes.test.ts`, `e2e/preparation.spec.ts`.
- **Error messages:** `tests/*error-signing*.test.ts`, `tests/*error-pages*.test.tsx`, `tests/user-facing-error-boundary.test.ts`.
- **Production smoke:** `scripts/production-smoke.mjs` (manual).
- **No test for:**
  - `/api/health/worker` behaviour, including overdue work;
  - the root `error.tsx` and any digest shown to the user;
  - import fan-out cost, fairness or group-audience reload (REL-02);
  - UI copy while the worker is stale (REL-03);
  - Server Action skew after a deploy (REL-06);
  - the human-facing 503 (REL-05);
  - any end-to-end alert delivery in production.

## NOT RUN
- **Render account state** (needs dashboard or API access): actual instance types (whether the web is ever a sleeping Free instance), failure-notification settings, health-probe interval and restart threshold, crash-restart backoff for workers, the effective worker shutdown delay (the Release B record says the 300 s delay is not applied), log retention, and Postgres `max_connections`.
  - The database is very unlikely to be Render's expiring free tier: 5 GB disk (`render-database.yaml:7-8`) and "Render also reports point-in-time recovery available" (`PRODUCT_COMPLETION.md:5`).
- **Whether AWS or any external uptime check exists outside the repo.** Docs through 2026-09-26 say none. The lead's `/api/health/monitor` GET is the cheap proof.
- **Real RSS** of the standalone web under Today load and of the tsx worker, including tsx's loader thread and esbuild child. I did not run app processes (brief rule 2).
- **Physical iPhone standalone behaviour** on the plain-text 503 (REL-05), and web-push behaviour if the web ever slept.
- **REL-02 magnitudes and REL-08 latency** (database needed).

## Questions for Kevin
1. Which inbox should receive outage alerts? Will you accept a free hourly GitHub Actions check (or the prepared AWS uptime stack at $0, without the `/monitor` path) that emails you, and will you turn on Render's failure notifications?
2. Please confirm the web service's Render instance type is not the sleeping Free type. render.yaml says `0.5c-512mb`, and the code assumes the web never sleeps.
3. Until REL-02 is fixed, will you pace invitations (a few testers per day) and ask testers to import in batches of at most about 1,000 rows?
4. Will you release only in quiet hours (for example before 6 am US Eastern) during the beta, given REL-06?
