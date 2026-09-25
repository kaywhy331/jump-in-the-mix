# Ops, reliability and performance audit — 2026-09-24 (d70ec54)

## Scope and method

Read-only static review of the worktree at `the repository` (commit d70ec54). No build, server, test or network activity. All line numbers refer to that tree.

Read end to end: `src/worker/index.ts`; `src/proxy.ts`; `src/lib/{recovery-boundary-client.ts,recovery-hold.ts,recovery-hold-query.mjs,recovery-hold-budget.mjs,database-release.ts,prisma.ts,env.ts,auth.ts,access-lock.ts,rate-limit.ts,request-context.ts,worker-dispatch.ts,worker-dispatch-after.ts}`; all five `src/app/api/health/*` routes; `src/lib/{jump-engine.ts,journey.ts,mix-workflow.ts,mix-workflow-engine.ts,mix-workflow-view.ts,mix-workflow-analytics.ts (queries),workflow-attention.ts,journey-numbering.ts,journey-view.ts,journey-roster.ts,today-list.ts,quiet-days.ts (query),preparation.ts (query)}`; `src/lib/{automatic-delivery.ts,notification-delivery.ts,follow-up-push.ts,calendar.ts,calendar-feed-fetch.ts,calendar-ical.ts,transactional-email.ts,email-budget.ts,email-events.ts,email-provider-recovery.ts,waitlist.ts,waitlist-delivery.ts,support-email-delivery.ts,contact-import-jobs.ts,contact-import-lease.ts,report-exports.ts,report-snapshots.ts,operational-retention.ts,data-retention.ts,admin-report-data.ts,marketplace-service.ts,marketplace.ts,shared-mix-service.ts,mega-mix-pipeline-service.ts,contact-export.ts}`; `src/app/api/webhooks/{resend,intake/[connectionId]}/route.ts`; `src/app/api/{account/export,calendar/feed/[token],calendar/export}/route.ts`; `src/app/(app)/{jumps,journey,marketplace,calendar,contacts}/page.tsx` (loaders); `src/app/layout.tsx`, `src/app/(app)/layout.tsx`, `src/app/page.tsx`; `render.yaml`, `Dockerfile`, `infra/operations/*.yaml`, `infra/operations/backup.Dockerfile`, `infra/cloudflare-scheduler/index.ts`; `scripts/{verify-database-release.ts,configure-runtime-database.mjs,migrate-with-owner.mjs,backup-database.mjs,backup-to-s3.mjs}`; every `prisma/*.prisma` model/index declaration and the hand-written indexes in `prisma/migrations`; `node_modules/@prisma/adapter-pg/dist/index.js` (pool error handling), `node_modules/pg-pool/index.js` (defaults); the bundled Next 16 docs for `proxy`, `serverActions`, caching and the v16 upgrade guide. Repo-wide scans: `findMany` calls without `take` (308 hits, reviewed by site), `for…of` loops awaiting Prisma calls (44 hits), sync `cookies()/headers()`, non-Promise `params`, deprecated Next APIs, client components importing server-only libraries, `console.*` calls that could carry PII.

Could not check statically: production row counts and JSON column sizes (`MixWorkflowInstance.definition`), actual query plans, Render's health-probe interval, restart semantics and default shutdown grace, Render Postgres `max_connections` for plan `0.1c-256mb`, Cloudflare cache rules, whether the Cloudflare scheduler is deployed against the Render origin, and end-to-end signal delivery through `npm run worker` → `sh` → `tsx` → `node`.

## Findings (ranked, most severe first)

### F1. Every workflow instance stores the whole workspace Mix content as JSON, and Today, the digest, the Journey page and the account export load all of it per view
- Severity: P1 (becomes an out-of-memory outage of the 512 MB web service at the stated scale)
- Status: VERIFIED code path; SUSPECTED magnitude (definition sizes not measurable offline)
- Evidence:
  - `src/lib/mix-workflow.ts:24-35` — `readWorkflowDefinition` returns every Mix with every step's `subject`, `body`, `script` and all channel `variants`.
  - `src/lib/mix-workflow.ts:58` and `:99` — that full definition is written into `MixWorkflowInstance.definition` for every admission (legacy admissions are created per contact × mix × occurrence from `src/lib/jump-engine.ts:472-477` whenever the Journey has rules or gated Beats).
  - `src/lib/workflow-attention.ts:35-58` — `readWorkflowAttention` pages through **all** ACTIVE instances of the workspace (250 per page, no total bound) selecting `state` **and `definition`**, and parses both for every row. It only needs `definition.rules`.
  - `src/app/(app)/jumps/page.tsx` (Today) calls `readWorkflowAttention(workspace.id, 30, …)` on every render; `src/lib/notification-delivery.ts:218` calls it for the daily digest in the worker.
  - `src/lib/mix-workflow-view.ts:35` — the Journey page `include`s 50 full instance rows (definition + state); `:56-80` and `src/lib/mix-workflow-analytics.ts:12-31` page through every instance's `state` plus all jumps and contacts of the workspace per view.
  - `src/app/api/account/export/route.ts:63` — `mixWorkflowInstance.findMany({ where: { workspaceId } })` with no `select`, so the export embeds every instance's full definition.
- Failure scenario: a Journey of a few dozen Mixes with authored variants gives a definition of roughly 100–600 KB per instance (5–20 KB per Mix). With 1k contacts and rules configured, hundreds to 1k+ ACTIVE instances exist. One Today view then transfers and JSON-parses tens to hundreds of MB; two concurrent phone refreshes on the 0.5 CPU / 512 MB service exhaust memory (Node heap plus Prisma result buffers), Render restarts the instance, and every signed-in user sees the outage. The daily digest does the same work inside the worker for every workspace with digests on.
- Fix (minimal, staged): (1) in `readWorkflowAttention` select `state` only and load rules once via a raw projection (`SELECT id, state, definition->'rules' AS rules …`) or group instances by `definition->>'revision'` and fetch each distinct definition once; (2) in `readWorkflowGraph` select the fields the view uses instead of `include` on full rows, and load the current definition once (it already has it); (3) exclude `definition` from the account export (export the distinct definitions once); (4) structurally, move definitions to a `MixWorkflowDefinition` table keyed by `(workspaceId, revision)` referenced from instances, so the snapshot guarantee survives without per-row copies.
- Effort: M for (1)–(3), L for (4); Risk: low for (1)–(3) (read paths only), medium for (4); Needs migration: no for (1)–(3), yes for (4); Needs owner decision: no
- Tests: an integration test that seeds N instances with a large definition and asserts the Today loader's bytes returned / query count stays bounded; unit test that `workflowAttentionReasons` output is unchanged when fed `rules` only; an export test asserting `definition` is not repeated per instance.

### F2. Marketplace list and detail views re-export every listed author's live Mix content on each page view, and write on GET
- Severity: P1 (degrades at the stated scale; the Marketplace lists shares across all accounts)
- Status: VERIFIED
- Evidence:
  - `src/lib/marketplace-service.ts:137` — `readMarketplace` runs `refreshListing` for each of the 20 listings on the page in parallel.
  - `src/lib/marketplace-service.ts:21-36` — `refreshListing` → `livePackage` → `exportSingleMix` / `exportMegaMixPipeline`; on any change it `update`s the listing row during a GET.
  - `src/lib/mega-mix-pipeline-service.ts:105-113` — a Mega-Mix export loads the pipeline, its member Mixes with steps/versions/variants (`sourceMixes`, `:90-102`) **and** `readWorkflowDefinition(db, workspaceId)`, i.e. every Mix of the author's workspace with all bodies and variants.
  - `src/lib/marketplace-service.ts:166` (detail) and `:211` (`marketplaceUpdates`, up to 50 listings) repeat the same per call.
- Failure scenario: a Community page with 20 Mega-Mix listings from 20 authors issues roughly 60–80 queries and pulls the full Mix content of 20 workspaces (each "a few dozen Mixes") for every view; the parallel fan-out saturates the 10-connection Prisma pool and the 0.1 CPU database, so the Marketplace and, through pool contention, every other signed-in page slow down while it is browsed. Fingerprint churn (e.g. an author editing) causes concurrent viewers to issue duplicate `UPDATE`s.
- Fix: render list rows from the cached facts (`title`, `beatCount`, `mixCount`, `channels`, `fingerprint`) and refresh a listing only (a) when its author saves a Mix or Mega-Mix (call `refreshListing` from the mix-editor and mega-mix actions), (b) on the detail view for the one selected listing, and (c) in a low-frequency worker pass as a safety net. Keep the fingerprint check in `addFromMarketplace` (already live-reads one listing).
- Effort: M; Risk: low; Needs migration: no; Needs owner decision: yes (acceptable staleness of directory facts between author save and worker refresh)
- Tests: unit test that `readMarketplace` performs no export/`update` calls; action test that saving a shared Mix updates its listing facts; keep the existing "latest version" test for `addFromMarketplace`.

### F3. Whole-workspace follow-up reconciliation every 5 minutes: a race that cancels freshly created follow-ups, and sequential admission lookups per contact
- Severity: P1 (visible follow-up disappearance for up to 5 minutes; worker loop time grows linearly with contacts)
- Status: VERIFIED (code path); the race needs concurrency to manifest (SUSPECTED frequency)
- Evidence:
  - `src/worker/index.ts:232-258` — `runDueWorkspaceReconciliations` runs `generateJumps({ workspaceId })` for up to 25 workspaces every `maintenanceIntervalMs` (5 min); `generate-jumps` jobs created by 34 user-action sites (e.g. `src/lib/calendar.ts:55`, `src/lib/journey.ts:53`, `src/lib/mix-workflow.ts:47`) run the same `reconcileJumps` concurrently for a contact or Mix.
  - `src/lib/jump-engine.ts:189-265` — the pass reads assignments first; `:729-748` — at the end it cancels every PENDING row in the horizon whose key is not in this pass's `desired` set (`completionMethod: "reconciled"`), guarded only by `status`, not by row age.
  - `src/lib/jump-engine.ts:472-477` — inside the per-contact/per-trigger loop, `await readWorkflowDefinition` (once per workspace, fine) and `await ensureLegacyWorkflow(...)` per contact × Mix × occurrence whenever the Journey has rules or gated Beats: `src/lib/mix-workflow.ts:56-61` issues a `findFirst` with a JSON-path `OR` (and an `upsert` on first sight) each time.
- Failure scenario: (a) the owner assigns a Mix while the 5-minute workspace pass is between its assignment read and its stale pass; the job-triggered contact pass creates the new rows, the workspace pass then cancels them as stale, and Today loses the follow-ups until the next workspace pass restores them (`canReconcile` accepts `"reconciled"`), i.e. a 5-minute "my follow-up vanished" glitch after a save. (b) With 1k contacts and rules configured, each workspace pass issues 1–2k sequential round-trips (~2–5 s at 1–3 ms each) plus the full assignment/contact/mix graph load with deep includes and 5k snapshot renders every 5 minutes; with several such workspaces the loop spends most of each 5-minute window here, delaying job processing (imports, decisions, report exports) and the automatic-delivery pass.
- Fix: (a) record `passStartedAt` before the assignment read and add `createdAt: { lt: passStartedAt }, updatedAt: { lt: passStartedAt }` to the stale-candidate query (`jump-engine.ts:729-739`) — rows touched by a concurrent pass are then left for the next pass; alternatively take a per-workspace `pg_advisory_xact_lock` around the pass. (b) Batch the admission lookups: one `mixWorkflowInstance.findMany` per workspace keyed by the computed `admissionKey`s (plus the alias branch), then only `upsert` misses; and make the periodic pass conditional on change (a `workspacePreference.reconcileRequestedAt` set by the action sites, with a slower unconditional cadence such as 30–60 min for date-triggered occurrences).
- Effort: M; Risk: medium (scheduling core; existing tests are extensive); Needs migration: no (a column for change-tracking would be optional); Needs owner decision: no
- Tests: an interleaving test that inserts a PENDING row between the assignment read and the stale pass and asserts it survives; a query-count test for a workspace with rules and N contacts asserting O(1) admission lookups per pass.

### F4. Every ACTIVE workflow instance is re-evaluated every minute regardless of whether anything is due, capped at 50 per pass
- Severity: P1 (at hundreds of instances the maintenance falls behind and consumes the worker and database continuously)
- Status: VERIFIED
- Evidence:
  - `src/lib/mix-workflow.ts:277` — every `processWorkflowInstance` ends with `nextCheckAt: new Date(now.getTime() + 60_000)` even when the instance changed nothing (the `changed` flag only controls the revision bump).
  - `src/lib/mix-workflow.ts:283-287` — `runMixWorkflowMaintenance` takes the 50 oldest due instances per minute; `src/worker/index.ts:263` — runs once per minute.
  - `src/lib/mix-workflow.ts:108-280` — each evaluation is a 30 s transaction with two `FOR UPDATE` row locks (contact, instance), ~15 queries including `mix.findMany` for the whole workspace and a JSON-path `job.findMany`, and a full state rewrite.
- Failure scenario: with 500 ACTIVE instances (1k contacts, rules on), 500 evaluations are due every minute but only 50 run, so each instance is actually visited every ~10 minutes: timeout routes (`delayMinutes`), commitments and "held → pending" releases fire up to 10 minutes late, while the worker and the 0.1 CPU database carry a permanent ~750 queries/minute background load (about 12 q/s before any user traffic) and the `Contact` row locks contend with owner actions on the same contacts.
- Fix: derive `nextCheckAt` from the state: the minimum of pending transition `dueAt`, open commitment `dueAt`, `readyAt`-based Beat times, appointment times, and a coarse floor (for example 15 minutes) as a safety net; when nothing is time-driven set it far in the future — commands, Beat completions and the automatic-delivery pass already re-queue the instance through jobs (`queueWorkflowForJump`, `src/lib/mix-workflow.ts:77-83`).
- Effort: M; Risk: medium (must not miss a due transition; the safety floor limits blast radius); Needs migration: no; Needs owner decision: no
- Tests: unit tests for the `nextCheckAt` derivation across transition/commitment/appointment cases; an integration test that a TIMEOUT route still fires within one maintenance interval of its due time.

### F5. Worker redeploys: no shutdown grace configured, signal path through `npm run` + `tsx` unverified, and long jobs are not interruptible
- Severity: P2 (release hazard: a redeploy during an import or report stalls that job for the 10-minute lease)
- Status: SUSPECTED (signal delivery), VERIFIED (lease and job structure)
- Evidence:
  - `render.yaml:60-64` — `startCommand: npm run worker`, no `maxShutdownDelaySeconds`.
  - `src/worker/index.ts:350-352` — SIGTERM only sets `stopping`; `:308-317` — the loop finishes the current `processJob` before exiting; `:23` — lease 10 min; `src/lib/contact-import-jobs.ts:207-219` — a 5,000-row import runs up to 200 chunk transactions without consulting `stopping`.
  - `package.json` — `"worker": "tsx src/worker/index.ts"`; the process tree is `npm` → `sh -c` → `tsx` → `node`; whether Render's SIGTERM reaches the innermost process depends on npm/sh/tsx relaying (the repo elsewhere uses `node --import tsx …`, `scripts/migrate-with-owner.mjs:29`).
- Failure scenario: a deploy lands while a 5,000-row import or a report export is running; after Render's grace period the old worker is killed, the job keeps `lockedAt`/`lockedBy`, and the new worker cannot claim it until `staleBefore` (10 min). The owner sees the import stuck at N% for ten minutes; a report export the admin is waiting on does the same. If SIGTERM never reaches `node`, this happens on every deploy, and the old heartbeat row is left `RUNNING` (harmless for `/api/health/worker`, which takes the most recent).
- Fix: `startCommand: node --import tsx src/worker/index.ts` (no shell/npm hop), `maxShutdownDelaySeconds: 300` in `render.yaml`, check `stopping` between import chunks and between maintenance sub-passes (throw `ImportInterruptedError`; progress is already persisted per chunk), and on shutdown release the in-flight job's lease (`lockedAt: null, lockedBy: null` where `lockedBy = leaseId`) so the successor claims it immediately.
- Effort: S–M; Risk: low; Needs migration: no; Needs owner decision: no
- Tests: worker unit test that a job interrupted by `stopping` between chunks is released with its progress intact; a `qualify-worker`-style script step that sends SIGTERM to the started command and asserts a `STOPPED` heartbeat within the grace period.

### F6. Job claim polling scans the whole job history because the index leads on `runAt`
- Severity: P2 (hygiene now; grows with retained history)
- Status: VERIFIED
- Evidence: `src/worker/index.ts:85-100` — two `findFirst` claims every 2 s with `completedAt: null, failedAt: null, runAt: { lte: now }, OR: [lockedAt null | stale]`, ordered by `runAt, createdAt`; `prisma/schema.prisma:662` — `@@index([runAt, completedAt, failedAt])`. `runAt <= now` matches every historical row (completed jobs are kept 30 days, `generate-jumps` and failed jobs 90 days, `src/lib/operational-retention.ts:17-21`), so each poll walks the whole index range and heap-checks visibility until it finds an open job.
- Failure scenario: tens of thousands of retained `generate-jumps` and `mix-workflow` jobs (34 creation sites, one per user action) turn every idle poll into a multi-thousand-entry index walk twice per 2 s — a steady tax on the 0.1 CPU database that grows with retention.
- Fix: hand-written migration (precedent: GIN and partial unique indexes in `prisma/migrations/20260904170000_product_platform/migration.sql:145-151` and `20260722040000_contact_lifecycle_management/migration.sql:53`): `CREATE INDEX "Job_open_runAt_idx" ON "Job" ("runAt", "createdAt") WHERE "completedAt" IS NULL AND "failedAt" IS NULL;` and drop the three-column index if no other query needs it.
- Effort: S; Risk: low; Needs migration: yes (index only, online with `CONCURRENTLY` outside a transaction if the migration runner allows; otherwise brief lock on a small table); Needs owner decision: no
- Tests: `EXPLAIN` assertion in the database integration suite (`tests/database-release.integration.test.ts` style) that the claim query uses the partial index.

### F7. Every signed-in request pays a recovery-hold catalog read through a 2-connection pool, plus duplicated session and preference lookups
- Severity: P2 (latency and amplification under database slowness)
- Status: VERIFIED
- Evidence:
  - `src/proxy.ts:131-142` — every non-public GET and every mutation awaits `recoveryBoundaryStatus`; `src/lib/recovery-boundary-client.ts:29-31` — on Render this is the direct read; `src/lib/recovery-hold.ts:19-27` — dedicated `pg` pool `max: 2`, `connectionTimeoutMillis: 5000`, per-request deadline 7 s, explicitly uncached.
  - `src/app/(app)/layout.tsx:9-10` and every page (e.g. `src/app/(app)/jumps/page.tsx`) call `requireWorkspace()` and `displayPreferencesForUser()`; `src/lib/auth.ts:141-176` is not wrapped in React `cache`, so each navigation runs the session `findUnique` (with membership/workspace/profile includes) and the preference read twice.
- Failure scenario: an RSC navigation with link prefetches issues several proxy checks that queue on two connections; when the database is merely slow (a heavy reconcile, a Marketplace burst, backup I/O), each check waits up to 7 s and then fails closed, so a slowdown becomes a wall of 503s for all signed-in routes while public pages stay up. Baseline per page: 1 catalog read + 2 session reads + 2 preference reads (+1 session touch write every 5 min) before any page data.
- Fix: memoize a `"clear"` result in-process for 5–10 s (a hold set by an operator still takes effect within seconds; `"held"`/`"unavailable"` never cached); wrap `getCurrentSession` and `displayPreferencesForUser` in `cache()` from React so layout and page share one lookup per request.
- Effort: S; Risk: low; Needs migration: no; Needs owner decision: yes (the recovery runbook currently promises immediate effect of a hold; a 10 s window must be acceptable)
- Tests: update `tests/recovery-hold-proxy.test.ts` for the cache window (hold observed within the window's upper bound); a request-scoped test asserting one session query per render.

### F8. Personal data export builds the whole workspace in memory with unbounded queries
- Severity: P2 (memory hazard on the 512 MB web service; P1 once F1's definitions are included)
- Status: VERIFIED
- Evidence: `src/app/api/account/export/route.ts:38-94` — ~50 parallel `findMany` calls without `take` (`jump` with both JSON snapshots, `contactActivity`, `jumpActionEvent`, `journeyEvent`, `mixWorkflowInstance` with definitions, `calendarEntry`, …); `:158` — `JSON.stringify(document, null, 2)` materializes a second, larger copy; the CSV branch (`:96-122`) zips in memory.
- Failure scenario: at 5k follow-ups (two 1–2 KB snapshots each), a year of activity and hundreds of instances, the JSON document is tens of MB before pretty-printing and hundreds with instance definitions; one export request can push the process past its cgroup limit, and two concurrent exports (or an export during a Today burst) will.
- Fix: stream the JSON (`ReadableStream`, section by section with keyset pagination), drop the two-space indentation, exclude `MixWorkflowInstance.definition` (emit distinct definitions once), and cap `contactActivity`/`jumpActionEvent` to the documented retention or move the export to the worker as a stored, expiring artifact the way report exports already work (`src/lib/report-exports.ts`).
- Effort: M–L; Risk: low; Needs migration: no (yes if moved to a stored artifact); Needs owner decision: yes (export format/inventory is documented in `docs/ACCOUNT_EXPORT_INVENTORY_2026-09-22.md`)
- Tests: export test with a seeded large workspace asserting peak heap stays below a budget (or that the response is streamed and starts within N ms); schema test that all export sections remain present.

### F9. Push reminder pass reads every overdue follow-up each minute and notifies backlogs 100 at a time
- Severity: P2
- Status: VERIFIED
- Evidence: `src/lib/follow-up-push.ts:75-79` — per subscription per minute, `jump.findMany` of all PENDING jumps with `scheduledAt <= now` (no `take`) with a nested `pushDeliveries` relation; `:80` — the eligible set is filtered in JavaScript and sliced to 100; `:110-111` — one push per pass for the claimed batch.
- Failure scenario: an owner with 2k overdue follow-ups turns push on: the pass loads 2k rows (plus a 2k-id `IN` list for receipts) every minute per device and sends "100 follow-ups are ready" once a minute for 20 minutes; the receipts table then grows by one row per (device, jump, scheduledAt) for the whole backlog.
- Fix: express "needs a reminder" in SQL (raw query joining `FollowUpPushDelivery` on `(subscriptionId, jumpId, scheduledAt)`) with `LIMIT 100`, and collapse a first-time backlog into one summary push by writing receipts for all due rows in the same claim.
- Effort: S–M; Risk: low; Needs migration: no; Needs owner decision: no (product copy for the summary is unchanged: "N follow-ups are ready")
- Tests: unit test with 250 due rows asserting one push and 250 receipts; query-count test per pass.

### F10. The readiness endpoint doubles as the runtime health check, so a transient database error can restart a healthy web instance
- Severity: P2
- Status: SUSPECTED (depends on Render's health-check semantics)
- Evidence: `render.yaml:29` — `healthCheckPath: /api/health/ready`; `src/app/api/health/ready/route.ts:15-17` — returns 503 whenever `checkDatabaseRelease()` reports `unavailable`; `src/lib/database-release.ts:18-51` — each probe runs a `RepeatableRead` transaction with five catalog queries including the `jsonb_to_recordset` shape check over every expected column.
- Failure scenario: the database restarts or stalls for 30–60 s (maintenance, failover, the 0.1 CPU plan saturating); readiness flips to 503 for the duration; if Render treats repeated failures as unhealthy it restarts the web service, adding a cold start and dropping in-flight requests on top of the database blip. Each probe also costs tens of ms of database CPU; at a short probe interval that is a measurable share of a 0.1 CPU database.
- Fix: keep the full check for deploy gating (it is what makes "migration-required" block a rollout), but once the process has passed readiness at least once, answer 200 with `checks.database: "unavailable"` for transient connection failures, reserving 503 for configuration and migration state; alternatively cache the catalog check for ~10 s.
- Effort: S; Risk: low; Needs migration: no; Needs owner decision: yes (health semantics are part of the documented release gate in `docs/HOSTED_DEPLOYMENT.md`)
- Tests: route test for the post-boot degraded response; keep the existing readiness tests for migration and recovery-held states.

### F11. The contact import route's 12 MB body cap only checks `Content-Length`, so chunked uploads bypass it
- Severity: P2 (signed-in users only; memory hazard)
- Status: VERIFIED
- Evidence: `src/app/api/contacts/import/route.ts:19,162-166` — `MAX_BODY_BYTES` is enforced against the header, then `request.json()` reads whatever arrives; the webhooks use `boundedRequestText` (`src/lib/bounded-request.ts`) correctly.
- Failure scenario: a browser extension or script posting a chunked body (no `Content-Length`) makes the web process buffer an arbitrarily large JSON document before Zod rejects it.
- Fix: `JSON.parse(await boundedRequestText(request, MAX_BODY_BYTES))`.
- Effort: S; Risk: low; Needs migration: no; Needs owner decision: no
- Tests: route test posting a chunked body over the limit and asserting 413.

### F12. Public pages cannot be cached by Cloudflare, so every marketing hit is a server render on 0.5 CPU
- Severity: P2 (capacity under crawler or campaign bursts)
- Status: VERIFIED
- Evidence: `src/app/layout.tsx:42-43` — the root layout awaits `connection()` and reads `headers()` for the per-response CSP nonce, making every route dynamic (Next sets `Cache-Control: private, no-cache, no-store…` on dynamic HTML); `src/proxy.ts:12-20,131` — the public path set is known but the proxy sets no public cache headers for it; public components read no database (verified: no `@/lib/prisma` imports under `src/app/page.tsx`, `src/components/PublicLanding.tsx`, `/for`, `/faq`, `/follow-up-templates`, `/features`).
- Failure scenario: a crawler or a launch post drives 30–50 requests/s to `/` and `/for/*`; each is a full RSC render on the same process that serves signed-in users, so Today and Contacts slow down for customers while nothing in the HTML changes between requests.
- Fix: in the proxy, for GETs on `RECOVERY_PUBLIC_PATHS`/`/for/*` add `Cache-Control: public, s-maxage=60, stale-while-revalidate=300` (Cloudflare caches the HTML together with its CSP header, so the nonce pairing stays consistent per cached copy), or give public routes their own root layout without the nonce script so they can be prerendered.
- Effort: S; Risk: low; Needs migration: no; Needs owner decision: yes (CSP/nonce policy and any per-visitor content on public pages)
- Tests: e2e assertion on cache headers for `/` and `/for/contractors`; security test that signed-in routes keep `private, no-store`.

### F13. One global advisory lock serializes sign-in, import commits, waitlist and webhook processing across all workspaces
- Severity: P2 (hygiene at current volume)
- Status: VERIFIED
- Evidence: `src/lib/access-lock.ts:5-7` — `pg_advisory_xact_lock(814733, 1)`; taken in `src/lib/auth.ts:36` (every session creation), `src/lib/contact-import-jobs.ts:210-212` (every 25-row import chunk, including merges), `src/lib/email-events.ts:52` (every provider webhook), `src/lib/waitlist.ts:28,47,119`, `src/lib/email-events.ts:35` (every email acceptance write).
- Failure scenario: a long import chunk (25 rows with duplicate matching) holds the lock for hundreds of ms; sign-ins, magic-link completions and bounce webhooks queue behind it; two workspaces importing at once serialize each other completely. Not a correctness problem, a throughput ceiling.
- Fix: keep the lock for admission/eligibility paths (its stated purpose), and give import commits their own per-workspace key (`pg_advisory_xact_lock(814733, hashtext(workspaceId))`) — the import code already serializes on the job and batch rows.
- Effort: S; Risk: low (review the deadlock-ordering comments in `email-events.ts` and `waitlist-delivery.ts` before changing acquisition order); Needs migration: no; Needs owner decision: no
- Tests: existing import and admission suites; add a two-workspace concurrent import test asserting overlap.

### F14. Interactive email sends retry three times with 15 s timeouts inside request handlers
- Severity: P2
- Status: VERIFIED
- Evidence: `src/lib/transactional-email.ts:70-98` — up to 3 attempts × `AbortSignal.timeout(15_000)` plus backoff; called synchronously from sign-up/verify/reset actions (`src/lib/auth-actions.ts:58,175,241`).
- Failure scenario: a Resend outage makes registration and password-reset submissions hang for ~50 s per user before failing, holding a web worker slot each.
- Fix: pass an `attempts: 1` option from interactive callers (the idempotency ledger already makes a later retry safe) or hand off to the worker queue like waitlist and support mail already do.
- Effort: S; Risk: low; Needs migration: no; Needs owner decision: no
- Tests: unit test that interactive sends attempt once and surface a retryable error message.

## Query and index review

| Query site | Filters / sort | Index present? |
|---|---|---|
| Job claim `src/worker/index.ts:88-100` | `completedAt IS NULL, failedAt IS NULL, task (not) in, runAt <= now, lockedAt null/stale`; sort `runAt, createdAt` | `(runAt, completedAt, failedAt)` — leading range matches all history; partial index recommended (F6) |
| Job by workspace/task + JSON path `src/lib/mix-workflow.ts:128`, `workflow-attention.ts:65`, `contact-import-lease.ts:12-17`, `contact-import-jobs.ts:162,177` | `workspaceId, task`, then `payload->>'instanceId'/'batchId'` | `(workspaceId, task)` yes; JSON filter is a post-filter. `workflow-attention.ts:65` builds an `OR` of up to 250 JSON predicates per page; acceptable because `failedAt IS NOT NULL` is applied first |
| Admin jobs list `src/app/(staff)/admin/operations/page.tsx:60-75` | status columns, `task contains`; sort `createdAt` | no `createdAt` index — admin-only, sorted in memory |
| Today page `src/lib/today-list.ts:93-96` and counts `jumps/page.tsx` | `workspaceId, status in, scheduledAt/completedAt ranges`; sort `scheduledAt, id` | `(workspaceId, scheduledAt, status)` and `(workspaceId, status, completedAt)` yes |
| Automatic-delivery candidates `automatic-delivery.ts:137-165` | `workspaceId, status PENDING, scheduledAt <= t` + relation filters | `(workspaceId, scheduledAt, status)` yes; relation filters post-filter; `take 25` |
| Push due `follow-up-push.ts:75-79` | `workspaceId, status PENDING, scheduledAt <= now` | index yes; **no `take`** (F9) |
| Reconcile: existing by key `jump-engine.ts:591`, stale candidates `:729-739`, bounds `:248-252` | `uniquenessKey IN (500)`; `workspaceId, status, scheduledAt range, workflowManaged false` | unique key yes; `(workspaceId, scheduledAt, status)` yes; `workflowManaged` post-filter |
| Workflow jumps `mix-workflow.ts:121` | `workspaceId, workflowInstanceId` | `(workflowInstanceId, workflowVisitId)` yes |
| Workflow maintenance `mix-workflow.ts:284` | `status ACTIVE, nextCheckAt <= now`; sort `nextCheckAt` | `(status, nextCheckAt)` yes (volume issue is F4) |
| Instances by workspace `workflow-attention.ts:36`, `mix-workflow-view.ts:35,56`, `mix-workflow-analytics.ts:19` | `workspaceId (, contactId), status`; `definition->>'revision'` | `(workspaceId, contactId, status)` prefix usable; JSON filter unindexed (full scan of the workspace's instances per Journey view — F1) |
| Admission lookup `mix-workflow.ts:56` | `workspaceId, contactId, admissionKey OR state JSON path` | unique `(workspaceId, admissionKey)` and `(workspaceId, contactId, status)` yes; one query per contact×mix×occurrence (F3) |
| Journey maintenance `journey.ts:111,116` | raw anti-join on `Contact`/`ContactJourney`; `automatic` + relation filters, sort `lastCheckedAt` | `(automatic, lastCheckedAt)` yes; `Contact (workspaceId, archivedAt)` yes; `take 25` |
| Journey roster `journey-roster.ts:17-25` | `workspaceId, archivedAt`, lateral `MIN(scheduledAt)` per contact, `ILIKE` | `Contact (workspaceId, archivedAt)`, `Jump (contactId, scheduledAt)`, trigram GIN on `displayName` yes; `LIMIT 50 OFFSET` |
| Quiet days `quiet-days.ts:20-45` | four correlated `MAX()` subqueries per contact | `Jump (contactId, scheduledAt)` (not `completedAt`), `ContactActivity (contactId, occurredAt)`, `JourneyEvent (contactId, occurredAt)`, `CalendarEntry (contactId, startsAt)` — `MAX(completedAt)` and `outcomeAt` rely on per-contact scans; fine at 1k contacts |
| Calendar ranges `calendar/page.tsx:35,42`, busy windows `automatic-delivery.ts:132`, `jump-engine.ts:336`, `mix-workflow.ts:228` | `workspaceId, canceledAt null, startsAt < a, endsAt > b` | `(workspaceId, startsAt, endsAt)` yes |
| Calendar sync `calendar.ts:91` | `enabled, urlEncrypted not null, lastAttemptAt`; global | `(workspaceId, enabled)` does not lead; table is small — fine |
| Workspace reconciliation claim `worker/index.ts:233-243` | `nextReconcileAt <= now` | none; one row per workspace — fine |
| Automation / notification preferences `automatic-delivery.ts:104`, `notification-delivery.ts:315` | boolean flags, global | none; small tables — fine |
| Notification claims `notification-delivery.ts:79-120` | unique `(workspaceId, kind, localDate)`; lease | yes |
| Automated delivery stale `automatic-delivery.ts:94` | `status PROCESSING, lockedAt < t` | `(lockedAt)` and `(status, reviewEligibleAt)` yes |
| Push receipts `follow-up-push.ts:85-90` | `id IN`, unique `(subscriptionId, jumpId, scheduledAt)` | yes |
| Email budget `email-budget.ts:20,45` | `createdAt > since` group by category | `(createdAt, category)` yes; under advisory lock `(814733,4)` |
| Email events `email-events.ts:23,73` | `providerId`, `recipientHashes has` | unique `providerId`, `(providerId, occurredAt)` yes; array `has` post-filter |
| Retention `data-retention.ts:24-112,122-146,158-175` | `GREATEST(...) < cutoff`, `detailsRetiredAt IS NULL`, `FOR UPDATE SKIP LOCKED LIMIT 100` | `(detailsRetiredAt, createdAt)`, `(detailsRetiredAt, receivedAt)`, `(createdAt, category)`, `(expiresAt)` help the prefilters; `GREATEST` predicates are seq-scan by nature, bounded by LIMIT and 15 s `statement_timeout` |
| Marketplace list `marketplace-service.ts:119-135` | `status LIVE, kind, industry, channels has, beatCount range, favorites some, ILIKE`; sort by relation `_count` | `(status, kind, publishedAt)` yes for newest; popular/added sort aggregates then sorts — fine at hundreds of listings (per-row exports are F2) |
| Official library `marketplace-service.ts:100` | `status APPROVED`; `take 500` | `(status, category)` yes |
| Contacts list/search `contacts/page.tsx:145-173` | seven `contains` branches incl. relations; `skip/take` | trigram GIN indexes on `displayName`, `company`, notes, `ContactEmail.email`, `ContactPhone.phone`, custom values (`prisma/migrations/20260904170000_product_platform/migration.sql:145-151`) yes |
| Session lookup `auth.ts:146-159` | `tokenHash`; touch write every 5 min | unique yes; `(expiresAt)` for cleanup yes |
| Rate limit `rate-limit.ts:51-97` | `key` unique, Serializable with retry | yes |
| Admin audit `src/app/(staff)/admin/audit/page.tsx:27-32` | `AuditLog` paged by `createdAt`; `distinct source` over the whole table per view | `(workspaceId, createdAt)` yes; `distinct source` is a full scan of an unbounded, never-purged table — add `(source)` or cache the list |
| Support/waitlist/report queues `support-email-delivery.ts:131`, `waitlist-delivery.ts:28`, `report-exports.ts:42` | `status, availableAt/nextAttemptAt/leaseUntil`; `expiresAt` | `(status, availableAt)`, `(status, leaseUntil)`, `(status, nextAttemptAt)`, `(status, createdAt)`, `(expiresAt)` yes |
| Worker heartbeat `health/worker/route.ts:11-15`, `worker-dispatch.ts:34` | `status RUNNING`; sort `lastSeenAt desc` | `(status, lastSeenAt)` yes |
| Recovery hold `recovery-hold-query.mjs:4-11` | `pg_db_role_setting` join `pg_database` | catalog; trivial, but per request (F7) |
| Release check `database-release.ts:18-51` | `_prisma_migrations` (LIMIT 2000), `pg_attribute`/`pg_enum` joins over all expected columns | catalog; per readiness probe (F10) |

## Checked and fine

- 2026-09-16 outage is fixed as documented: on Render (`RECOVERY_BOUNDARY_PATH` unset in `render.yaml`) the proxy reads the hold directly (`src/lib/recovery-boundary-client.ts:29-31`), never self-fetches; the HTTPS-terminator topology with `HOSTNAME=0.0.0.0` is covered by `tests/recovery-hold-runtime.integration.test.mjs:51-59`.
- Idle `pg` client errors cannot crash the web or worker process: the Prisma adapter registers a pool `error` listener (`node_modules/@prisma/adapter-pg/dist/index.js:812-817`) and the recovery pool registers its own (`src/lib/recovery-hold.ts:22`).
- Job claim is an atomic compare-and-set on `attempts` (`src/worker/index.ts:105-119`); leases renew every 30 s with lost-lease detection (`:162-173`); exhausted jobs fail permanently with an explanatory `lastError` (`:103,176`); retry delay is exponential with jitter, floored at 5 s and capped at 6 h (`:124-127`); permanent errors (`PermanentJobError`) never retry.
- Two workers overlapping during a deploy is safe for the maintenance passes: workspace reconciliation claims via CAS (`:239-243`), calendar sync claims via `lastAttemptAt` (`src/lib/calendar.ts:78-79`), automatic delivery claims per jump under a contact row lock with a `PROCESSING` guard (`src/lib/automatic-delivery.ts:179-208`), notifications and push receipts are unique per (workspace, kind, day) / (subscription, jump, time), workflow instances are processed under `FOR UPDATE`.
- Uncertain automatic deliveries (worker died after the provider call) are marked FAILED and never resent (`src/lib/automatic-delivery.ts:94-102`), preferring a missed send over a duplicate; the follow-up stays on Today for the owner.
- Email pipeline: provider `Idempotency-Key` plus a local ledger keyed by the same key with payload/recipient hashes (`src/lib/transactional-email.ts:64-91`, `src/lib/email-budget.ts:25-53`), 23 h safe-retry window, daily/monthly budgets with an auth reserve, suppression on hard bounce/complaint/provider suppression from svix-verified events (`src/lib/email-events.ts:43-78`, `src/app/api/webhooks/resend/route.ts:9-27`), bounded bodies (64 KB), event-id dedupe, 503 to make the provider retry.
- Intake webhook: token hash lookup, per-connection rate limit (60/min), 24 KB bounded body, JSON content-type check (`src/app/api/webhooks/intake/[connectionId]/route.ts`).
- Web push: VAPID from env, endpoint allowlist, 10 s timeout, binding re-checked before send, 404/410 deletes the subscription and clears `pushEnabled` when none remain (`src/lib/follow-up-push.ts:16-52,120`).
- ICS import is bounded against size and time bombs: 1 MB, ≤1,000 VEVENTs, ≤2,000 occurrences, sub-daily RRULEs rejected, 20-year lookback guard, floating times pinned to the business timezone (`src/lib/calendar-ical.ts:8-47`); feed fetch pins DNS, blocks private ranges, 10 s timeout, 1 MB cap, 2 redirects, HTTPS only (`src/lib/calendar-feed-fetch.ts`).
- Contact import job: 25-row chunks each committed with per-row idempotency receipts, resumable after crash, cancel path fails the job and preserves committed rows, permanent failure marks the batch (`src/lib/contact-import-jobs.ts:186-240`, `src/worker/index.ts:202-210`).
- Report jobs: bounded SQL with 15 s statement timeout, size caps (`REPORT_EXPORT_BYTES`/`REPORT_SNAPSHOT_BYTES`), lease ownership re-checked before publishing, admin authorization re-verified at completion (`src/lib/report-exports.ts:53-86`, `src/lib/report-snapshots.ts:33-57`).
- Retention runs in bounded (100-row) transactions with 15 s statement timeouts and `SKIP LOCKED`, records a checkpoint, and cleans jobs, heartbeats, expired sessions and expired report artifacts (`src/lib/operational-retention.ts`, `src/lib/data-retention.ts`).
- Backups: daily encrypted `pg_dump --snapshot` (client `postgresql16-client` matches the PG16 database), manifest written last as the commit marker, S3 publish, refuses a recovery-held or mid-migration source (`scripts/backup-database.mjs:92-103`, `infra/operations/backup.Dockerfile`, `infra/operations/render-backup.yaml`).
- Runtime role: least-privilege grants with `_prisma_migrations` read-only and the connecting user verified in pre-deploy (`scripts/lib/runtime-database-role.mjs:55-63`, `scripts/configure-runtime-database.mjs:17-19`); migrations run only through the isolated owner job with a hold check (`scripts/migrate-with-owner.mjs`).
- Configuration validity is enforced before traffic: `productionConfigurationIssues()` gates readiness (`src/app/api/health/ready/route.ts:7-14`) and `DATABASE_URL` is required at import time in production (`src/lib/prisma.ts:6-8`); the worker refuses to start on a non-ready database and exits after 5 minutes so Render restarts it (`src/lib/database-release.ts:68-80`, `src/worker/index.ts:288-289`).
- Logging: job errors redact connection strings and import errors are replaced by a fixed message (`src/worker/index.ts:44-47,188-190`); webhook and dispatch paths log no bodies or secrets; remaining `console.error(..., error)` calls in maintenance passes print Prisma error objects (field names and SQL text, not row values).
- Connection budget is small: web `pg` pool default 10 (`src/lib/prisma.ts:11`, `pg-pool` default) plus 2 for the recovery reader, worker 10, single clients for pre-deploy and backup — roughly 25 steady-state.
- Time handling: clocks use `Intl` with `hourCycle: "h23"` and overnight quiet windows are handled (`src/lib/notification-delivery.ts:27-50`); digests and weekly reports are unique per local date; containers run in UTC and code passes explicit zones.
- Today list uses keyset cursors with per-group probes instead of offsets (`src/lib/today-list.ts:71-123`); action events are capped at 900 and drafts loaded only for the page's pending rows.
- `wakeWorkerAfterResponse` is a no-op on Render (`WORKER_DISPATCH_MODE` unset, `src/lib/worker-dispatch.ts:9`), so no per-request HTTP hop remains.
- Next 16 conformance: `src/proxy.ts` uses the `proxy` convention (Node runtime by default, `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md:253-255`); no `middleware.ts`; all `cookies()`/`headers()` calls are awaited and all `params`/`searchParams` are Promises (36 sites); `experimental.serverActions.{allowedOrigins,bodySizeLimit}` is still the documented location; fonts are self-hosted via `next/font/local` with `display: swap`; the single `next/image` use is an `unoptimized` static import (`src/components/Logo.tsx:8`), unaffected by the v16 image default changes; no `instrumentation.ts`, `unstable_*`, `next/legacy` or runtime-config usage; client components import only types from the generated Prisma client.

## Open questions for the owner

1. Render specifics that decide F5 and F10: what is the health-probe interval for `/api/health/ready`, does a run of failed probes restart the web service, and what shutdown grace applies to the worker today (is `maxShutdownDelaySeconds` set outside `render.yaml`)? Does SIGTERM reach the `node` child under `npm run worker` (a `STOPPED` heartbeat row after a deploy would show it does)?
2. Production sizing for F1/F4: `SELECT status, count(*), avg(pg_column_size(definition)), max(pg_column_size(definition)) FROM "MixWorkflowInstance" GROUP BY status;` and the number of workspaces with Journey rules configured.
3. Render Postgres plan `0.1c-256mb`: its `max_connections`, and whether the backup cron and the optional monitor connect with the owner or the runtime credential.
4. May a `"clear"` recovery-hold result be cached in-process for 5–10 s (F7), given the recovery runbook's "takes effect immediately" wording?
5. May public marketing HTML be cached at Cloudflare for 60 s with its paired CSP nonce header (F12), or must every public response carry a fresh nonce?
6. Is the Cloudflare scheduler (`infra/cloudflare-scheduler/index.ts`) still deployed against `jumpinthemix.com`? It posts to `/.netlify/functions/jump-worker-background`, which the Render deployment does not serve; if so it is generating failed handoffs in Cloudflare logs.
7. Marketplace freshness (F2): is "facts refresh when the author saves, plus a periodic worker refresh" acceptable, or must a viewer always see the author's latest save on the list itself?
8. Account export (F8): is a worker-produced, expiring download artifact acceptable in place of the synchronous route?
