# Beta-readiness audit — Jump in the Mix (production `4b5abd8`), 2026-09-26

**Verdict: NO-GO as deployed. Do not invite outside beta users onto `4b5abd8` yet.** There are 4 blockers:
- **LOOP-01:** a recorded "next follow-up" is not scheduled (reproduced).
- **DATA-01:** completed follow-ups come back after a time-setting change (reproduced).
- **REL-01:** nothing alerts Kevin when a tester is broken.
- **MSG-01:** automatic customer email sends as the platform, which contradicts the FAQ.

**Path to GO WITH CONDITIONS:**
- one focused fix release for LOOP-01 and DATA-01;
- automatic email kept unavailable for the beta, with the FAQ corrected;
- a free alert path;
- the owner steps in §9.

None of it needs a paid service.

**What holds up:**
- an invited owner reaches a prepared first follow-up on a phone in a few minutes;
- two-account probes found no cross-tenant access;
- none of the 30 product fixes from the 2026-09-24 audit has regressed;
- vitest: 2,159 passed, 0 failed, 10 skipped;
- the browser suites passed 628 of 632 tests in CI's four groups, and each of the 4 failures traces to a test or CI-configuration problem, not the product.

This report is the deliverable of a read-only audit. The code was read and run but not changed; nothing was deployed or migrated; production was touched only by public GET requests. The raw lane reports, runtime evidence, screenshots and the full findings table are in [docs/beta-audit-2026-09-26/](beta-audit-2026-09-26/README.md).

## Contents
1. [Blockers](#1-blockers)
2. [What holds up](#2-what-holds-up)
3. [Runtime reproductions](#3-runtime-reproductions)
4. [Status of the 2026-09-24 audit's P0/P1 fixes](#4-status-of-the-2026-09-24-audits-p0p1-fixes)
5. [Findings by lane](#5-findings-by-lane)
6. [Test suite health (lane 9)](#6-test-suite-health-lane-9)
7. [NOT RUN](#7-not-run)
8. [Questions for Kevin](#8-questions-for-kevin)
9. [Proposed beta-launch checklist](#9-proposed-beta-launch-checklist)
10. [Method, environment and evidence](#10-method-environment-and-evidence)
11. [Where the documents and the code disagree](#11-where-the-documents-and-the-code-disagree)

## 1. Blockers

Ranked by harm to a beta tester. Full details, with reproduction steps, are in [FINDINGS_TABLE.md](beta-audit-2026-09-26/FINDINGS_TABLE.md#details-for-blocker-and-high-findings).

| # | ID | Blocker | Label | What clears it |
|---|---|---|---|---|
| 1 | **LOOP-01** (+ONB-01, LOOP-02) | Scheduling a follow-up often creates nothing, and the screen confirms it anyway. Reproduced at 5 entry points: <br>• After a call, "Schedule the next follow-up: tomorrow 10:00" produced no follow-up. The confirmation read "Next scheduled: Sep 28" (the plan's own step). <br>• "Rescheduled" marks the follow-up done and creates nothing. <br>• "Save & schedule follow-up" for the first customer on the recommended onboarding path created 0 follow-ups. <br>• "Add to a mix" on a contact says "Follow-ups are being prepared" and creates 0. <br>• On the starter plan, the follow-up lands at the plan's own time (14:00 requested, 10:00 created), and every promise replays the plan's later call. | VERIFIED (runtime) | Create exactly one follow-up at the chosen day and time, as Quick Add already does. Make "Add to a mix" ask for a start date. Confirm the date on screen. Add tests. |
| 2 | **DATA-01** | Changing the weekend rule, time zone, quiet or working hours, or a Beat's timing re-creates follow-ups the owner already completed as new pending ones. With automatic email on, the customer gets the same email again. | VERIFIED (runtime + an existing test that asserts it) | Never regenerate an occurrence that already has a DONE or SKIPPED row. Add a test per setting. |
| 3 | **REL-01** (+BOPS-01, BOPS-02) | Kevin has no signal when a beta tester is broken. <br>• No alert path is deployed. <br>• Server errors go only to Render's log stream. <br>• New in-app tickets notify no one. <br>• The independent monitor is not running: production `/api/health/monitor` answers 503. | VERIFIED (code, production GET) · NOT RUN (Render notification settings) | Free steps: <br>• Render failure emails (owner). <br>• An hourly GitHub Actions run of `scripts/production-smoke.mjs` (agent). <br>• An email to support@ for each new ticket (agent). <br>• A written daily `/admin` check until then (owner). |
| 4 | **MSG-01** (+BOPS-03, UX-01) | Automatic customer email is "Available" with one consent tick. <br>• It sends as "Jump in the Mix", with the platform Reply-To, so customer replies go to the operator's mailbox. <br>• It carries no business footer. <br>• The public FAQ says it "needs a connected provider", which is false in production. | VERIFIED (code, local UI, production text) · NOT RUN (production `EMAIL_REPLY_TO` value) | For the beta: make automatic email unavailable in production and correct the FAQ. Later: "{Business} via Jump in the Mix" with Reply-To the owner. |

**Why these are blockers.** The brief defines BLOCKER to include the following, and each maps to one of the four:
- the owner being unable to complete the core loop: LOOP-01;
- data corruption and false sending: DATA-01;
- no way to learn that a beta user is broken: REL-01;
- a false claim about sending: MSG-01.

LOOP-01 and DATA-01 break the product's central promise: "Today tells you who to follow up with". Both happen silently. Both are cheap to fix in code, and neither needs a migration.

**HIGH findings that need a fix or a written workaround before inviting.** Details are in the findings table.
- SEC-02: `/privacy` promises that support views require the customer's permission; nothing asks for it.
- DATA-04: recovery is unproven for today's schema (last production restore: 48 of 71 migrations); backups last 7 days; a failed backup alerts no one.
- ONB-02: the recommended onboarding is the longest and most jargon-heavy route.
- DATA-02: re-starting a finished plan silently does nothing.
- DATA-03: one unreadable date rejects a whole import row; Outlook's empty `0/0/00` does it for every row.
- BOPS-04: the owner's own iPhone/Android launch gate has never been run.

## 2. What holds up

Each item is evidence-backed and matters for the verdict.
- **The funnel works end to end on a phone** (runtime, 375 and 390 px, light and dark):
  - The invitation page shows the invited address read-only.
  - The verification email arrives with a single link, and it lands on `/onboarding?verified=1` with "Your email is verified".
  - The one-person onboarding route reaches "Your first follow-up for Chris Parker is ready" on Today with a correctly addressed `sms:+1…?&body=` link. The captures run from [w2-01](beta-audit-2026-09-26/captures/w2-01-register-390-dark.png) to [w2-05](beta-audit-2026-09-26/captures/w2-05-today-welcome-390-dark.png).
  - The device timezone was adopted on both routes (America/Chicago, America/Denver).
- **Tenant isolation holds.** Lane 4 traced 50 route files, 50 server-action files and every page that reads an id. At runtime, the realtor's account requested the plumber's contact, plan, follow-up, draft, activity, export and workflow by id:
  - every API probe returned 404 or 400, and the recipient search returned an empty list;
  - every page rendered an empty shell with none of the other account's data;
  - nothing was written;
  - a POST with a foreign `Origin` got 403.

  See [sec-idor2](beta-audit-2026-09-26/runtime/walkthroughs/sec-idor2.txt).
- **No secrets in the client bundle.** The scan found 0 hits for every server secret name, test secret value, provider key pattern and the build's own VAPID private key, and no source maps ([scan](beta-audit-2026-09-26/runtime/bundle-secret-scan.txt)).
- **Production edge configuration is sound** (GET only):
  - Nonce CSP with `strict-dynamic`, a new nonce per response.
  - HSTS with `includeSubDomains`, `frame-ancestors 'none'`, DENY, nosniff, COOP and CORP.
  - `security.txt` with an expiry.
  - The session cookie is `HttpOnly; Secure; SameSite=Lax` with a 90-day cap (seen locally).
  - `scripts/production-smoke.mjs` passed 18 of 18.

  See [production checks](beta-audit-2026-09-26/runtime/production-get-checks.txt).
- **Production is running this code.** 94 of 97 client assets on 7 public production pages are byte-identical to a local build of `4b5abd8`. The other two differ only in per-build Server Action ids ([identity check](beta-audit-2026-09-26/runtime/production-build-identity.txt)).
- **Accessibility and reflow basics pass.**
  - 12 key screens × 4 widths (320, 375, 414, 1440) × 2 themes had zero horizontal overflow and zero axe violations for the WCAG 2.2 A/AA tags ([matrix](beta-audit-2026-09-26/runtime/walkthroughs/matrix.txt)).
  - Every keyboard stop on Today showed a visible 3 px focus ring ([e6c](beta-audit-2026-09-26/runtime/walkthroughs/e6c.txt)).
  - Lighthouse accessibility was 100 on every public page measured, locally and on production ([lighthouse](beta-audit-2026-09-26/runtime/lighthouse.txt)).
  - The caveat is RUN-04.
- **Correctness foundations from the earlier releases hold.** Lanes 2 and 3 read these end to end:
  - outcome idempotency per logical attempt;
  - contact and Mix stale-save refusal under row locks;
  - contact-create idempotency;
  - reconciliation that never cancels fresh rows;
  - lease-locked imports;
  - one durable claim per automatic delivery, and uncertain sends never repeated;
  - E.164 phone keys;
  - account deletion by cascade with a schema-guard test.
- **Backup and restore mechanics work locally.** `npm run db:rehearse-restore` produced an encrypted backup, restored it into a fresh database and passed the foreign-key checks ([log](beta-audit-2026-09-26/runtime/db-rehearse-restore.txt)). The production restore is a separate, still-open question (DATA-04).
- **The earlier audit's product fixes are present.** 30 of 40 P0/P1 items were verified fixed in `4b5abd8`, and none regressed (§4).

## 3. Runtime reproductions

All against the packaged production build of `4b5abd8`:
- `node --max-semi-space-size=8 .next/standalone/server.js`, the production start command;
- a fresh local database `jitm_design_beta0926` with all 71 migrations, the demo seed and the catalog;
- CI's synthetic environment, with email verification required;
- the real worker (`node --import tsx src/worker/index.ts`).

Outgoing email was captured by a test preload instead of being sent (§10). Walkthrough logs are in [runtime/walkthroughs/](beta-audit-2026-09-26/runtime/walkthroughs/) and screenshots in [captures/](beta-audit-2026-09-26/captures/).

| Check | Result | Evidence |
|---|---|---|
| Invited plumber, recommended path (375 px, light, America/Chicago) | Register: 2 fields. Verify: 1 email link. Onboarding: "A complete mega-mix · Recommended" preselected, then "Review my setup", tick, "Add Contractor mega-mix" (13 Mixes installed). "Add your first customer" with "Save & schedule follow-up" (tomorrow) saved a date and **0 follow-ups** (ONB-01/LOOP-01). The flow then lands on Journey "Start this Mix", which created the plan's two follow-ups. That is 7–8 taps after verification plus a form. | [w1a](beta-audit-2026-09-26/runtime/walkthroughs/w1a.txt)–[w1e](beta-audit-2026-09-26/runtime/walkthroughs/w1e.txt) |
| The first onboarding screen | Shows "Unsaved changes. Save before leaving this page." before any input (RUN-01) | [w1b](beta-audit-2026-09-26/runtime/walkthroughs/w1b.txt), [capture](beta-audit-2026-09-26/captures/w1-10-onboarding-review-375-light-full.png) |
| LOOP-01, Journey person | Tray: "Schedule the next follow-up" (Sep 27 10:00), Save → "Next scheduled: Sep 28". The `JumpDate` was written and the `generate-jumps` job completed without error. **No follow-up exists for Sep 27 10:00**; Today shows only Sep 28. | [w1f](beta-audit-2026-09-26/runtime/walkthroughs/w1f.txt), [capture](beta-audit-2026-09-26/captures/m-today-375-dark.png) |
| Invited realtor, one-person path (390 px, dark, America/Denver) | Type of business defaults to Home services and the reason to "Follow up about an estimate". The first text reads "…received the estimate from my business" (ONB-10). Today shows "Your first follow-up for Chris Parker is ready". | [w2a](beta-audit-2026-09-26/runtime/walkthroughs/w2a.txt), [w2b](beta-audit-2026-09-26/runtime/walkthroughs/w2b.txt) |
| LOOP-01, starter plan | A follow-up on the chosen day (Sep 27) is created, at the plan Beat's own 10:00, which matched the choice (see the 14:00 row below). A **duplicate** of the plan's day-5 call is also created (Oct 1 and Oct 2). The confirmation names Oct 1. | [w2c](beta-audit-2026-09-26/runtime/walkthroughs/w2c.txt) |
| DATA-01 | After the Saturday follow-up was completed, Weekend scheduling → "Move to next Monday" re-created it as **PENDING on Monday 10:00**. Changing only the default follow-up time did not (every shipped Beat has its own time). | [w2f](beta-audit-2026-09-26/runtime/walkthroughs/w2f.txt), [w2d](beta-audit-2026-09-26/runtime/walkthroughs/w2d.txt) |
| Editing a running plan | The only save path is "Review and start" → "Start this mix?", and "Start the mix" stays disabled until an audience is chosen (RUN-02) | [w2e](beta-audit-2026-09-26/runtime/walkthroughs/w2e.txt), [capture](beta-audit-2026-09-26/captures/w2-15b-review-sheet-1440-light.png) |
| MSG-01 (settings) | Settings → Sending: "Email · Available", "Text · Not available yet". One consent box ("I understand these messages send without a final tap"). No mention of the sender or reply address. | [capture](beta-audit-2026-09-26/captures/w2-18-settings-sending-390-dark-full.png) |
| Cross-tenant probes | 0 leaks, 0 writes; foreign `Origin` → 403 | [sec-idor2](beta-audit-2026-09-26/runtime/walkthroughs/sec-idor2.txt) |
| Screens × widths × themes | 96 combinations; 0 overflow; 0 axe violations | [matrix](beta-audit-2026-09-26/runtime/walkthroughs/matrix.txt) |
| Inline links (UX-03) | "Sign in", "Leave the waitlist…", "Back to home" on /waitlist look like plain text | [capture](beta-audit-2026-09-26/captures/m-waitlist-375-light.png) |
| Memory and CPU on a Render-sized instance | With no cap, the standalone server's RSS was 333 MB after the walkthroughs and 420–434 MB (peak 435 MB) under serial browser-suite load; the worker used 218 MB. **Confined like `0.5c-512mb`** (`systemd-run` MemoryMax=512M, CPUQuota=50%) with 5 concurrent signed-in readers: memory peaked at 238 MB with no OOM; p50 1.8 s, p95 6.1 s, max 17.8 s; **2 of 119 requests answered 503** just after start (the fail-closed recovery check, REL-05). Warm, 6 readers for 45 s: 175 requests, 0 failures. | [free-plan-sizing](beta-audit-2026-09-26/runtime/free-plan-sizing.txt) |
| LOOP-02: "Add to a mix" on a contact | The starter plan for a person with no saved date showed "Start saved. Follow-ups are being prepared." and "Follow-up list updated". **0 follow-ups** after 15 s with the worker running. | [e23](beta-audit-2026-09-26/runtime/walkthroughs/e23.txt), [capture](beta-audit-2026-09-26/captures/e2-add-to-mix-390-light.png) |
| LOOP-01: "Rescheduled" | A Quick Add follow-up recorded as "Rescheduled" to Sep 29 09:00 returned `{"status":"DONE"}`. It is marked done and **nothing exists on Sep 29**. | [e3c](beta-audit-2026-09-26/runtime/walkthroughs/e3c.txt) |
| LOOP-01: the chosen time | Next follow-up requested for Sep 30 14:00 on the starter plan. It was created at **10:00** (the Beat's own time) and another call was replayed on Oct 5; the person now has 4 pending follow-ups. | [e7](beta-audit-2026-09-26/runtime/walkthroughs/e7.txt) |
| DATA-03: Outlook-style import | Of 5 rows, **1 can be queued**. Rows with `0/0/00`, `31/12/1985` or "TBD" in any date column are "reported as failed", including a row whose birthday is valid. | [e1](beta-audit-2026-09-26/runtime/walkthroughs/e1.txt), [capture](beta-audit-2026-09-26/captures/e1-import-review-1440-light.png) |
| Quick Add (RUN-03) | "Save all 3" for "Follow up with Sam Ortiz today about the kitchen quote" is blocked by a native "Please fill out this field." for three required fields (time, method, draft) below the visible part of the sheet. | [e3b](beta-audit-2026-09-26/runtime/walkthroughs/e3b.txt), [capture](beta-audit-2026-09-26/captures/e3b-quick-add-after-save-390-light.png) |
| Keyboard only (1440) | Sign-in by keyboard works, and **every Tab stop showed a visible focus ring (3 px)**. Mark sent is 9 stops from the docked review. But "Checking your account…" masked the page at 48 of 80 Tab stops, and Review in the list was never reached (RUN-04). | [e6c](beta-audit-2026-09-26/runtime/walkthroughs/e6c.txt), [e6b](beta-audit-2026-09-26/runtime/walkthroughs/e6b.txt) |
| Member invitation on a phone | Preparing one invitation creates a Today reminder; tapping Review opens the sheet with the message (412 px and the Pixel 7 profile). | [e8](beta-audit-2026-09-26/runtime/walkthroughs/e8.txt), [e8b](beta-audit-2026-09-26/runtime/walkthroughs/e8b.txt) |
| Waitlist confirmation email | "Confirm your Jump in the Mix waitlist request": a 24-hour link, "We can't promise a date", "If you didn't request this, ignore this email", and a leave link. No List-Unsubscribe header (MSG-06). | [e5e6](beta-audit-2026-09-26/runtime/walkthroughs/e5e6.txt) |
| Design export vs app | The export's phone and desktop screens were rendered next to the app's. Structure, groups, 40 px avatar rows, Newsreader snippets and the bottom navigation with the central Quick Add bubble match. The export's "Beat 1 of 2" dots are missing, and the app's card repeats the plan name (UX-06). | [export-Main-390](beta-audit-2026-09-26/captures/export-Main-390.png) vs [m-today-375-light](beta-audit-2026-09-26/captures/m-today-375-light.png) |
| Production after a 27-minute gap | TTFB 0.22 s: no sleep observed | [production checks](beta-audit-2026-09-26/runtime/production-get-checks.txt) |

## 4. Status of the 2026-09-24 audit's P0/P1 fixes

The full table with decisive `file:line` evidence and guarding tests is [lanes/00-prior-audit-fixes.md](beta-audit-2026-09-26/lanes/00-prior-audit-fixes.md).
- Every guarding unit and integration test named there ran green in this audit's vitest run.
- The guarding browser specs are reported in §6.
- **REGRESSED is not used.** No fix that was made has been undone. Items that were never fully fixed are marked **STILL OPEN**, and deferred items **OPEN BY DECISION**.

| Status | Count | Items |
|---|---|---|
| VERIFIED-FIXED | 30 | ACC-F1 (P0; defence in depth, never orphaned in production), ACC-F2, ACC-F4, CON-F1–F9, DES-F1–F3, FUN-F1–F4 (FUN-F3's Google/Apple path is dormant: no provider is configured), MIX-F1–F4, OPS-F2, PRO-F7, SEC-F1 (small remainder SEC-05), SEC-F2, TOD-F1–F3 |
| STILL OPEN (process) | 5 | PRO-F1 (P0): no CI run on the production line has ever finished; `4b5abd8` has 0 check-runs; PR #83's `validate` hit the 60-minute cap. PRO-F2 (P0): `main` is `4615ade` (2026-09-10), 267 commits behind; `4b5abd8` is untagged and exists only on `fix/audit-leftovers-20260925`; PR #83 would still leave `main` 9 commits behind. PRO-F3: the release pipeline lives in git-ignored `.artifacts/`. PRO-F4: the D release (`446aadc..4b5abd8`) has no record. PRO-F6: `production-smoke.mjs` exists but runs nowhere; `AGENTS.md` still names the retired Netlify site. |
| NOT-VERIFIABLE → now measured | 1 | PRO-F5: the named stale strings are gone. The suite's result on `4b5abd8` is in §6. |
| OPEN BY DECISION | 4 | ACC-F3 (staff-only accounts have no account page; staff tooling downgraded), OPS-F1 (whole-workspace workflow definition per instance, parked as C-2), OPS-F3 (race fixed; batching parked as C-2), OPS-F4 (every active instance re-checked each minute, parked as C-3) |

**Beta relevance of the open items.**
- The process items (PRO-F1 to F4) do not harm a tester directly. They make every fix release a hand-verified release: CI cannot finish, and the rollback scripts live only on TrixBot. The blocker fixes will need the same local full run this audit did.
- OPS-F1 and OPS-F4 stay parked. They only bite for owners with hundreds of active Journey contacts; keep beta imports modest (see REL-02).

## 5. Findings by lane

Counts after reconciliation (82 findings: 4 BLOCKER, 6 HIGH, 40 MEDIUM, 32 LOW/PARKED). Each lane has a raw report under [lanes/](beta-audit-2026-09-26/lanes/). The ranked list is [FINDINGS_TABLE.md](beta-audit-2026-09-26/FINDINGS_TABLE.md).

### Lane 1 — First-run and onboarding ([report](beta-audit-2026-09-26/lanes/01-first-run-onboarding.md))
**Result.** An invited owner can finish sign-up and reach a follow-up without help; the one-person route is quick. The recommended route is long and full of jargon, and its "Save & schedule follow-up" schedules nothing (merged into LOOP-01).

**Time to first value (runtime):**
- One-person route: invitation link → Today in 4 app screens plus the email, about 6 taps, 4–5 typed fields.
- Recommended route: about 9 screens and 7–8 taps after verification, plus a contact form.
- A cold visitor has no path except the waitlist, which is honestly worded ("We can't promise a date").

**Findings:**
- **HIGH:** ONB-02 (recommended route).
- **MEDIUM:**
  - ONB-03 (jargon; the canonical doc conflicts with the shipped words);
  - ONB-04 (day-one "You're caught up" when the first follow-up is later);
  - ONB-05 (customer fields autofill the owner's own details; markup confirmed at runtime);
  - ONB-06 (no direct invite-by-email);
  - RUN-01 ("Unsaved changes" on arrival).
- **LOW:** ONB-07 to ONB-10.

### Lane 2 — Core daily loop ([report](beta-audit-2026-09-26/lanes/02-core-daily-loop.md))
**Result.** Parts of the loop are sound and honest:
- Review → Open text/email/call → tray;
- "Opening an app does not send it";
- durable drafts and idempotent outcomes;
- visible failed automatic sends;
- Quick Add creates exactly what it shows, once its required fields are filled (RUN-03).

The "next promise" step is broken (LOOP-01).

**Findings:**
- **MEDIUM:**
  - LOOP-03 (opting in to automatic sending releases the overdue backlog);
  - LOOP-04 (after-visit Beats wait for "Visit happened");
  - LOOP-05 (raw error text in Today's in-place actions);
  - LOOP-06 (nothing leads from an import to Today);
  - LOOP-07 (one owner's quiet hours can stop the automatic-send pass for others);
  - RUN-02 (editing a running plan);
  - RUN-03 (Quick Add's hidden required fields).
- **LOW:** LOOP-08, LOOP-09.

### Lane 3 — Data integrity and trust ([report](beta-audit-2026-09-26/lanes/03-data-integrity.md))
**Result.** The idempotency, concurrency and deletion work holds.
- **BLOCKER:** DATA-01.
- **HIGH:** DATA-02, DATA-03, DATA-04.
- **MEDIUM:** DATA-05 to DATA-08 (import encodings and address mapping, duplicate saved dates, phone-only merges, export gaps and "backup" wording).
- **LOW:** DATA-09 to DATA-11.
- iPhone users export vCard (`.vcf`); the importer accepts it, with the encoding caveat in DATA-05.

### Lane 4 — Security and privacy ([report](beta-audit-2026-09-26/lanes/04-security-privacy.md))
**Result.**
- No cross-tenant access, authentication bypass or privilege escalation (verified in code and at runtime).
- **HIGH:** SEC-02 (a published privacy promise with no mechanism).
- **MEDIUM:** SEC-01 (staff MFA guessing across addresses, no lockout or alert) and SEC-03 (anonymous lead-form posts drive existing contacts; prior SEC-F5 still open).
- **LOW:** SEC-04 to SEC-12, including login CSRF on Google/Apple (dormant until a provider is configured) and account enumeration by timing.
- Dependencies:
  - `npm audit --omit=dev --audit-level=high` passes: it found one moderate advisory, in `baseline-browser-mapping`, a browser-data package (GHSA-w5vr-8v7q-w6rv, denial of service on invalid input) ([log](beta-audit-2026-09-26/runtime/npm-audit.txt)).
  - The bundle and headers are clean (§2).

### Lane 5 — Email and messaging ([report](beta-audit-2026-09-26/lanes/05-email-messaging.md))
**Result.**
- **DNS authenticates the sending domain** (verbatim `dig` output in the lane report):
  - SPF passes through Resend's `send.jumpinthemix.com` (Amazon SES);
  - DKIM `resend._domainkey` is present;
  - DMARC is `p=none`;
  - MX is ImprovMX.
- **Account emails:**
  - Links are built from `APP_URL`, and verification is single-use with 24-hour expiry.
  - The captured verification email had a plain subject and body and one link. It carried no Reply-To only because none is configured in the test environment.
- **Today handoff links** are E.164 with `?&body=` (seen at runtime: `sms:+15125550142?&body=…`).

**Findings:**
- **BLOCKER:** MSG-01.
- **MEDIUM:**
  - MSG-02 (uncertain and budget failures worded "provider rejected it, send it yourself");
  - MSG-03 (one 90/day allowance for everything);
  - MSG-04 (suppressed addresses stuck at verification);
  - MSG-05 (waitlist form has no bot guard);
  - MSG-06 (no List-Unsubscribe or stop link);
  - MSG-07 (contact-page Text/Call links still use the typed number; seen at runtime: `sms:(303) 555-0199`).
- **LOW:** MSG-08 to MSG-11.
- Inbox placement is NOT RUN (§7).

### Lane 6 — Reliability on the free plan ([report](beta-audit-2026-09-26/lanes/06-reliability-free-plan.md))
**Result.** The engineering underneath is sound:
- job leases, the SIGTERM stop flag and crash-safe imports;
- an idempotent pre-deploy;
- a service worker that never caches HTML;
- nothing that needs an always-on web instance.

**Findings:**
- **BLOCKER:** REL-01.
- **MEDIUM:**
  - REL-02 (one large import stalls background work for everyone);
  - REL-03 (a stopped worker keeps promising sends and imports);
  - REL-04 (the worker health check measures a timer, not progress);
  - REL-05 (a database hiccup or CPU starvation shows a bare text 503 page; seen at runtime under load);
  - REL-06 (each release breaks saves in already-open tabs).
- **LOW:** REL-07 and REL-08.

**Free-plan facts measured in this audit:**
- **Production.** The first request answered in 0.23 s, and 0.22 s again after a 27-minute gap: no sleep observed (`render.yaml` names `0.5c-512mb` instances). `/api/health/worker` reported `ready`; `/api/health/monitor` answered 503 (no monitor).
- **Locally.** With no memory cap the server used 420–434 MB RSS under test load, and the worker 218 MB.
- **Confined like the Render instance** (512 MB, 0.5 CPU), 5 concurrent readers:
  - memory peaked at 238 MB with no OOM;
  - CPU is the limit: p50 1.8 s, p95 6.1 s;
  - 2 of 119 requests got a bare 503 just after start (REL-05, now seen at runtime).

**Zero-cost mitigations:**
- Render failure emails.
- An hourly GitHub Actions smoke.
- Releases in quiet hours.
- Keeping beta imports to about 1,000 rows.
- Pacing invitation waves.

### Lane 7 — Beta operations ([report](beta-audit-2026-09-26/lanes/07-beta-operations.md))
**Result.** The admission, invitation, suspension and pause machinery is sound, and the admin UI explains why an invitation can't go out.

**What Kevin can see of testers today:**
- `/admin/users`: setup complete or incomplete, and "Last active".
- `/admin/users/[id]`: verified or not, sessions, and contact/Mix/follow-up counts.
- Admin Reports: aggregate funnel counts (created, verified, setup, contact, Mix, activated, D7/D30).

Conversion events are never collected: the homepage only dispatches a browser event that nothing receives, consistent with "no analytics provider" on `/privacy`. The verification-email outcome for a given address cannot be looked up (BOPS-11).

**Findings:**
- **Merged into blockers:** BOPS-01 and BOPS-02 (into REL-01), BOPS-03 (into MSG-01).
- **HIGH:** BOPS-04 (device gate never run).
- **MEDIUM:**
  - BOPS-05 (raising capacity releases an overdue weekly wave of up to 10 waitlisters);
  - BOPS-06 (merged with ONB-06);
  - BOPS-07 (`4b5abd8` untagged, unrecorded, no CI);
  - BOPS-08 (no solo MFA recovery);
  - BOPS-09 (no "beta" or pricing wording);
  - BOPS-10 (support buried on phones);
  - BOPS-11 (diagnosing a stuck tester takes three admin pages).
- **LOW:** BOPS-12 and BOPS-13.

**Inviting one named person today takes these steps:**
1. They join and confirm the waitlist.
2. Kevin sets limits in Admin → Admission: password, MFA under 10 minutes old, and a reason. **Pause weekly waves first if hand-picking.**
3. He selects them in Admin → Waitlist.
4. The worker sends the invitation within about a minute.

### Lane 8 — Design, accessibility and copy ([report](beta-audit-2026-09-26/lanes/08-design-a11y-copy.md))
**Result.**
- **Tokens and accessibility.** The design export's colour tokens are reproduced exactly (25 light and 18 dark), every computed text/background pair passes AA, and axe was clean at runtime.
- **Public-page claims.** No public page shows prices, testimonials, ratings or user counts. The proposed Plus/Pro catalogue is not presented as current.

**Findings:**
- **Merged into MSG-01:** UX-01.
- **MEDIUM:**
  - UX-02 (template and feature pages describe demo behaviour that doesn't exist);
  - UX-03 (inline links look like text; seen at runtime);
  - RUN-04 ("Checking your account…" masks the workspace on every return to the app, and repeatedly during keyboard use).
- **LOW:** UX-05 to UX-09.

**Lighthouse** (mobile preset, devtools throttling as in CI, one run per page). **Production:**
- `/`: performance 89, accessibility 100, best practices 100, SEO 100, LCP 2.64 s, CLS 0.
- `/for/contractors`: performance 90, accessibility, best practices and SEO 100, LCP 2.63 s.
- `/waitlist`: performance 92, LCP 2.43 s.

**Local build:** accessibility and best practices were 100 everywhere and performance 79–87 on this loaded shared host ([lighthouse.txt](beta-audit-2026-09-26/runtime/lighthouse.txt)). Production LCP sits at the 2.5 s budget; one run each, so treat it as borderline, not failing (UX-09 notes the budget covers only 6 URLs).

### Lane 9 — Test suite health
See §6.

## 6. Test suite health (lane 9)

| Check | Result |
|---|---|
| `npm run validate:static` | clean ([log](beta-audit-2026-09-26/runtime/validate-static.txt)) |
| `npm run typecheck` | clean, 1 min 08 s, peak RSS 1.7 GB ([log](beta-audit-2026-09-26/runtime/typecheck.txt)) |
| `vitest` (CI env, empty database, push/plan/worker suites on) | **2,159 passed, 10 skipped, 0 failed**, over 288 files in 6 shards. The backup/restore suites need `pg_dump`, which TrixBot lacks; with a PostgreSQL 17 client on PATH they pass (37/37). Without it, 5 tests and 2 suites fail with `spawn pg_dump ENOENT`, a host-tooling gap. ([summary](beta-audit-2026-09-26/runtime/vitest-summary.txt)) |
| `npm run build` | passed in 2 min 42 s, peak RSS 1.7 GB, no warnings ([log](beta-audit-2026-09-26/runtime/build.txt)) |
| `npm run db:rehearse-restore` | passed ([log](beta-audit-2026-09-26/runtime/db-rehearse-restore.txt)) |
| Playwright, main suite, desktop (79 spec files) | 306 passed, 1 failed, 80 skipped (the gated staff suites run in their own groups). The failure, `journey-connections.spec.ts:310`, passes alone and in its own file: order-dependent, as the C-1 record notes. |
| Playwright, MFA staff group (14 specs, gated flags) | 54 passed, 1 failed, 2 skipped. The failure, `admin-workflow-regressions.spec.ts:92`, passed 4 of 5 repeats: timing-dependent, listed as order-only in the A2 record. |
| Playwright, staff/waitlist group (4 specs, MFA-off server) | 11 passed, 1 failed. `staff-permissions.spec.ts:64` fails 3 of 3 under CI's own configuration for this group (MFA off). The whole file passes 6 of 6 with MFA required, which is production's setting. CI would fail here. |
| Playwright, main suite, phone (Pixel 7) | 257 passed, 1 failed, 129 skipped (desktop-only tests). The failure, `onboarding-invitations.spec.ts:60`, fails 4 of 4. The test taps Review before the page is interactive. By hand the same tap opens the review, both at 412 px and with the exact Pixel 7 profile. The D release notes record it as pre-existing. |
| CI on GitHub | PR #83: `validate` cancelled at the 60-minute cap; `secret-history` (gitleaks) failed (TEST-02); image builds passed. `4b5abd8`: 0 check-runs ([state](beta-audit-2026-09-26/runtime/github-ci-state.txt)) |

**Browser failures:** all four were rerun and classified as flaky or mis-configured tests (TEST-03). None fails because of product code, and none is new since the release records: three are named there, and the fourth depends on CI's MFA setting. **Also run:**
- CI's packaged-server recovery suite (`RUN_RECOVERY_WEB_TESTS`): 2 of 2 passed.
- The hosted load-fixture rehearsal (`RUN_HOSTED_LOAD_WEB_TESTS`): its fixture exits at start on TrixBot, which is environmental. The same step passed in CI on PR #83 ([ci-only-suites](beta-audit-2026-09-26/runtime/ci-only-suites.txt)).

**Critical flows with no test (TEST-01):**
- Recording an outcome with "Schedule the next follow-up" produces a follow-up at the chosen time. The only test (`e2e/jump-outcome-timeline.spec.ts:98`) checks the saved date row.
- A completed or skipped follow-up stays settled after a settings or plan-timing change. The only related test (`tests/draft-continuity.test.ts:98-109`) asserts the opposite for broadcasts.
- "Save & schedule follow-up" on Add contact in a workspace set up the recommended way.
- "Add to a mix" on a contact producing follow-ups. The tests assert only the "Follow-ups are being prepared" notice.
- An end-to-end invitation → email → verify → onboarding → first follow-up run. The existing tests seed a verified user or read the database, not the email.
- The From and Reply-To of an automatic customer email.
- Restarting a finished Mix.
- Import of an Outlook export containing `0/0/00` dates.

## 7. NOT RUN

| Item | Why not | What it needs |
|---|---|---|
| iPhone Safari and Android Chrome: text, email and call handoffs and the return tray; installed-app sign-in; contact picker; dictation | No physical devices in this audit; also the owner's own launch gate (BOPS-04) | Kevin's phones, a synthetic production account, 30 minutes; record in `docs/MANUAL_DEVICE_QUALIFICATION.md` |
| Real inbox delivery and placement (verification, invitation, waitlist confirmation) at Gmail, Outlook/M365, iCloud, Yahoo | Would send real email from production (a write) | Owner-approved test invitations to seed inboxes; read the SPF/DKIM/DMARC results in the headers |
| Any signed-in flow on production (sign-up, onboarding, Today, settings, admin) | Production was read-only for this audit (GET and public pages only) | A synthetic production account and the owner's go-ahead; the release smoke already does this at each release |
| Production admin state: admission ceilings, whether waves are paused, Kevin's MFA and recovery codes, `support.view_customer` | Needs a signed-in admin session on production | Kevin opens Admin → Admission, Waitlist and Team (checklist §9) |
| Render settings: instance types actually in use, notification emails, worker shutdown delay, `EMAIL_FROM` / `EMAIL_REPLY_TO` / Twilio / VAPID values | No dashboard or API access under the audit rules | Kevin reads them in the dashboard (checklist §9) |
| Restore of a real production backup | Needs the AWS credentials and SSM-escrowed keys | `db:qualify-backup` into a scratch database, by the owner or with the owner's keys (DATA-04) |
| Google and Apple sign-in | Not configured in production | Provider apps (owner steps in the Release B record) |
| Automatic SMS | Twilio not configured ("Text · Not available yet") | Twilio plus 10DLC registration, if ever wanted |
| Cold start after a long idle on production | The instance answered warm: 0.23 s, and 0.22 s after a 27-minute gap. The audit cannot force it to sleep | A few scheduled GETs after quiet periods (the hourly smoke would record this) |
| Screen readers (VoiceOver, TalkBack) and 200% text on devices | No devices | Manual pass with the device test |
| Load beyond one serial browser | Out of scope for a beta decision | A Render-sized run was done: 512 MB, 0.5 CPU, 5 then 6 concurrent readers for 60 s and 45 s (§3). Sustained load, and production's 0.1-CPU database, were not tested. |

## 8. Questions for Kevin

Owner decisions only. The lane reports carry the full lists; these are the ones that change what happens before inviting.
1. **Automatic email for the beta:**
   - Keep it unavailable (recommended), or keep it with "{Business} via Jump in the Mix" and replies to the owner?
   - Is it acceptable that customers' replies currently reach the operator's mailbox?
   - What are the production `EMAIL_FROM` and `EMAIL_REPLY_TO`? (MSG-01)
2. **"Next follow-up" behaviour:** should "Schedule the next follow-up" and "Rescheduled" always create exactly one follow-up at the chosen day and time, whatever plan the person is on? (Recommended: yes.) (LOOP-01)
3. **Completed follow-ups:** should a completed or skipped follow-up ever reappear after a settings or plan-timing change? (Recommended: never.) (DATA-01)
4. **Alerts:**
   - Which inbox should outage and ticket alerts go to?
   - Is an hourly GitHub Actions smoke run (free) acceptable?
   - Will you turn on Render's failure notifications? (REL-01)
5. **Support-view consent:** add an "allow support to view my account" choice to tickets, or reword `/privacy`? Does anyone hold `support.view_customer` today? (SEC-02)
6. **Cohort:**
   - Hand-pick testers (pause weekly waves and member referrals) or keep waves on?
   - What capacity limits?
   - Three or five member invitations? The code gives three, the canonical doc five. (BOPS-05, BOPS-13)
7. **Onboarding default for testers:** keep "mega-mix" recommended, or recommend "one person, one follow-up"? (ONB-02)
8. **Vocabulary:** is the 09-22 Mix/Beat/Mega-Mix vocabulary current (then update the canonical doc), or should the screens say Plan and Follow-up? (ONB-03)
9. **Beta and pricing wording** for Terms and the welcome email: "free during the beta"? What happens after? (BOPS-09)
10. **Backups:**
    - Is 7-day retention acceptable for the beta?
    - Who else can reach the AWS/SSM keys?
    - Will you run (or authorise) a production restore check before inviting? (DATA-04)
11. **CI:**
    - May the agent split the browser step so CI can finish inside the cap?
    - Should a green run be required before each deploy?
    - Is the PR #83 gitleaks hit a fixture? (PRO-F1, TEST-02)
12. **Invite-by-email:** do you want a staff action to invite a named person without the waitlist steps? (ONB-06)

## 9. Proposed beta-launch checklist

### Before the first invitation
**Agent steps** (after your go-ahead; one fix release, verified like this audit):
1. Fix LOOP-01:
   - the next promise, "Rescheduled" and "Save & schedule follow-up" create exactly one follow-up at the chosen time, and the confirmation names it;
   - "Add to a mix" asks for a start date;
   - add browser tests.
2. Fix DATA-01: settled occurrences never regenerate. Add a test per setting.
3. MSG-01: make automatic email unavailable in production for the beta and correct the FAQ and `/privacy` sentences (or build sender identity if you choose).
4. REL-01:
   - email support@ on each new ticket and customer reply;
   - add an hourly GitHub Actions workflow running `scripts/production-smoke.mjs`, which emails on failure;
   - show the worker heartbeat age on the admin Overview.
5. SEC-02: apply your chosen wording, or a consent checkbox on the ticket form.
6. DATA-03: keep an import row when one date is unreadable; warn instead.
7. Tag and record `4b5abd8`, and bring `main` up to production. Commit the release scripts without secrets. Make CI's browser step fit the cap. Identify the gitleaks hit.
8. Run the full local verification (typecheck, vitest, build, all browser groups, restore rehearsal) on the fix release; release in quiet hours; run the production smoke.

**Owner steps (Kevin):**
1. Decide questions 1–4 and 6 in §8.
2. Render dashboard:
   - turn on failure notifications for web, worker and backup cron;
   - read and note `EMAIL_FROM`/`EMAIL_REPLY_TO` and the instance types.
3. Admin → Admission:
   - if hand-picking, **pause weekly waves before raising any limit**;
   - then set the capacity;
   - decide on member referrals.
4. Confirm your MFA recovery codes (and Render/GitHub recovery codes) are stored somewhere you can reach without TrixBot.
5. Run the device pass (BOPS-04): iPhone Safari and Android Chrome against production with a synthetic account (open text, email, call; return to the app; record the outcome).
6. Send one real invitation to yourself at Gmail and at one Outlook address; check it lands in the inbox; complete onboarding on your phone.
7. Restore check (DATA-04): run or authorise `db:qualify-backup` on today's production backup.
8. Add the `security@` alias in ImprovMX (support@ is the fallback meanwhile).

### During the beta
- Open `/admin` once a day: Support, Operations and Waitlist → Delivery (until the alerts exist, this is the only signal).
- Send each tester a welcome note:
  - which onboarding option to pick;
  - support@ for help;
  - "automatic sending is off during the beta";
  - how to give feedback.
- Keep imports to about 1,000 rows per owner and pace invitations (REL-02, MSG-03).
- Release in quiet hours and tell testers to reload after a release (REL-06).

## 10. Method, environment and evidence

- **Code and branch.** Production commit `4b5abd8` (the head of `fix/audit-leftovers-20260925`), checked out as worktree `/tmp/jitm-beta-audit-20260926` on branch `audit/beta-readiness-20260926`. The branch holds only this report and `docs/beta-audit-2026-09-26/`. The owner's main checkout (`fix/admission-mfa-draft` with 484 uncommitted changes) was not touched, and neither was any release worktree.
- **Working tree versus production.** The main checkout differs from production (a different branch plus uncommitted work). This audit read and ran only the `4b5abd8` worktree, which was clean. Production's client assets match it (§2).
- **Lanes.**
  - Nine read-only reviewers traced the code: lanes 1–8 plus the prior-fix lane. They were barred from builds, tests and network, except `dig` for lane 5 and read-only `gh` for lanes 0 and 7. Each wrote a raw report under `lanes/`.
  - The lead reconciled severities (the notes under the findings table) and reproduced the consequential claims at runtime.
- **Runtime environment.**
  - `npm run build` with CI's environment.
  - `node --max-semi-space-size=8 .next/standalone/server.js` on `127.0.0.1:3111`.
  - The database was the fresh local `jitm_design_beta0926` on the TrixBot PostgreSQL 17 service. It had all 71 migrations, `db:seed` (demo and catalog) and `db:seed:e2e-admin`; the vitest run came first, on the empty database, as in CI.
  - For the walkthroughs, `AUTH_REQUIRE_EMAIL_VERIFICATION=true` (as in production), and the real worker ran with the same settings.
  - For the browser suites, CI's exact environment was used (verification off, no worker).
- **Email capture (test harness, not product code).** A `node --import` preload recorded the app's calls to `https://api.resend.com/emails` into a local file and answered with a fake id, so verification links could be followed and email payloads read. It was not loaded for the browser suites.
- **Invitations.** Test invitations were created as `ReferralAccessInvite` rows exactly as `e2e/registration.spec.ts` does.
- **Production.** GET only, public URLs only:
  - `scripts/production-smoke.mjs`;
  - `curl` of public pages, headers, `security.txt`, health endpoints and static chunks;
  - no sign-in, no forms, no SQL.
- **Host limits.** TrixBot has 3.8 GB of RAM. The build, the server, Playwright and Lighthouse ran one heavy job at a time. The long browser suites ran as one background job while only documents were edited.
- **Evidence index:**
  - `runtime/`: validate, typecheck, vitest summary, build log, restore rehearsal, npm audit, production GET checks, build-identity check, bundle scan, GitHub CI state, free-plan sizing, Lighthouse, CI-only suites.
  - `runtime/walkthroughs/`: logs of every scripted walkthrough and probe.
  - `runtime/e2e/`: Playwright batch summaries.
  - `captures/`: screenshots. The folder is not named `screenshots/` because `.gitignore` ignores that name.
- **The walkthrough scripts** are kept in the session scratchpad, not in the repository ("no code changes"). Their steps are recorded in the logs, and they can be re-created from §3.

## 11. Where the documents and the code disagree

The code wins in each case; each is a documentation fix unless noted.
- **Sessions.** `docs/CANONICAL_PRODUCT_DECISIONS.md:109` and `docs/SECURITY.md:7` say `SameSite=Strict`, 14-day maximum. The code uses `SameSite=Lax`, a 14-day idle window and a 90-day cap. `render.yaml` sets only `AUTH_SESSION_DAYS=14`.
- **Vocabulary.** The canonical product language says Plan / Follow-up / Saved date; the product ships Mix, Beat, Mega-Mix and Journey (ONB-03; an owner decision).
- **Member invitations.** The canonical doc says five, emailed and counted; the code gives three, uncounted, sent from Today (BOPS-13).
- **Production tags and records.** `AGENTS.md:17` says every deployed commit has a `prod-*` tag and a record; `4b5abd8` has neither.
- **Staging site.** `AGENTS.md:13` still makes the retired Netlify site the staging destination (flagged by the previous audit; unchanged).
- **Copywriting references.** `assets/README.md` says the two Joanna Wiebe references "were supplied and reviewed". They are not in the repository; they exist only as untracked files in the owner's checkout, together with `Jump_in_the_Mix_Brand_price_freatures.md`.
  - No lane opened the two Joanna Wiebe files.
  - The copy findings here are judged against the canonical decisions, the copy and claim matrix, and current behaviour.
  - Lanes 7 and 8 read the pricing proposal file, and lane 1 its first 30 lines. No public page presents its proposals as current.
- **FAQ and privacy wording.**
  - The FAQ says automatic sending "needs a connected provider" (MSG-01).
  - `/privacy` says support views require customer permission (SEC-02).
  - `features/follow-up-reminders` and the template pages describe demo steps that don't exist (UX-02).
- **Marketplace refresh.** `prisma/marketplace.prisma:50` still describes read-time refresh (changed in C-1).
