# Lane 4 — Security and privacy

> Raw lane report from the read-only lane reviewer, kept as written. The reconciled severities, merged IDs and runtime labels are in [../FINDINGS_TABLE.md](../FINDINGS_TABLE.md), which takes precedence where the two differ.

**Lane verdict:** this lane does not block inviting beta users (GO WITH CONDITIONS).

- **Cross-tenant check: nothing found.** I traced every customer route handler (50 route files), every exported server action (50 `"use server"` files), every page that reads an id or token, and the staff control plane. I found no way for account A to read or change account B's data by id. I found no authentication bypass and no privilege escalation. This is VERIFIED in code; the two-account probes in the last section confirm it at runtime.
- **Prior P1s:** both are fixed. SEC-F1 has a small remainder (SEC-05) and SEC-F2 is fully fixed.
- **Three MEDIUM items for the first beta weeks:**
  - staff MFA codes can be guessed with no per-account lock or alert (SEC-01);
  - the privacy notice promises that support views need the customer's permission, but nothing asks for it (SEC-02);
  - anonymous lead-form posts still write into existing customers (SEC-03, prior SEC-F5).
- **Conditions before inviting:**
  - reword or implement SEC-02, because it is a published promise;
  - confirm that `security@` delivers.

Scope and method. Read-only static review of `/tmp/jitm-beta-audit-20260926` (production commit `4b5abd8`).

- **How the sweep was split.** The tenant-isolation sweep ran as four parallel read-only passes of this reviewer:
  - customer route handlers;
  - contact-side and public actions;
  - Mix, Marketplace and id-reading pages;
  - the staff plane.
- **What I did myself.** I traced auth/session, the proxy, rate limits, client IP, tokens, webhooks, health, the client bundle, security.txt, privacy/retention and dependencies.
- **Spot checks.** I re-read the source behind every finding the passes raised. The spot-checked evidence is cited below.
- **Tools.** No build, server, test, database or network was used. One `node` timing computation used the repo's own `bcryptjs`.
- **Untracked marketing files.** I did not open the three untracked owner files; they are not needed for this lane.

## Summary table

| ID | Severity | Label | Title |
|---|---|---|---|
| SEC-01 | MEDIUM | VERIFIED (code) / INFERRED (attack time) | Staff MFA codes can be guessed with no account-wide limit; failed codes are neither logged nor alerted |
| SEC-02 | MEDIUM | VERIFIED | The privacy notice says support views need the customer's permission; nothing asks the customer |
| SEC-03 | MEDIUM | VERIFIED (code) / INFERRED (effect) | Anonymous lead-form posts attach to an existing customer and fire journey events (still open, prior SEC-F5) |
| SEC-04 | LOW | VERIFIED | Whether an email has an account can be learned from sign-in timing, registration and invitation messages |
| SEC-05 | LOW | VERIFIED (code) / INFERRED (edge behaviour) | Per-address rate limits are easy to sidestep: IPv6 keyed per /128, Cloudflare ranges trusted as proxies, per-user caps include the address |
| SEC-06 | LOW (dormant) | VERIFIED | Google/Apple sign-in state is not tied to the browser (login CSRF) — only matters once a provider is configured |
| SEC-07 | LOW | VERIFIED | The verification link is still spent by a GET and signs in whoever opens it, keeping a password someone else may have chosen (prior SEC-F8 remainder) |
| SEC-08 | LOW | VERIFIED | Admin → Audit shows customers' contact names to `audit.read` staff without a support case |
| SEC-09 | LOW | VERIFIED | The personal-data export gives a Marketplace author the reporter's text while the report is still open |
| SEC-10 | LOW | VERIFIED (code) / INFERRED (impact) | A shared Mix republishes every later edit without the privacy check |
| SEC-11 | LOW | VERIFIED | Staff-only accounts have no security page, and a lost authenticator can only be reset in the database (prior ACC-F3 still open) |
| SEC-12 | LOW | VERIFIED | Hardening leftovers: pause/archive rely on the proxy for support views; raw error text in six JSON routes; a dead action with an off-site redirect; moderation plumbing; stale session docs |

## Flows traced

1. **Password sign-in:**
   - `/login` → `loginFormAction` (`src/lib/auth-actions.ts:533`) → `loginAction` (:208).
   - Limits: `passwordAttemptLimits` (:89-93; IP 30/15 min, email+IP 10/15 min, email step-up 10/15 min).
   - `prisma.user.findUnique` (:216) → `bcrypt.compare` against the user hash or `DUMMY_PASSWORD_HASH` (:25, :223).
   - Verification gate (:227-229) → `createSession` (`src/lib/auth.ts:42-109`) → cookie (auth.ts:95-106) → `accountHome` (`src/lib/account-home.ts:3-6`).
2. **Emailed sign-in link:**
   - `requestMagicLinkAction` (auth-actions.ts:240-271).
   - `issueAuthToken` (`src/lib/auth-tokens.ts:28`, 32 bytes, SHA-256, 15 min).
   - GET `/api/auth/magic` (`route.ts:13-22`) reads only and moves the token into a cookie scoped to `/auth/magic` (`src/lib/magic-link.ts:26-34`).
   - The `/auth/magic` button → `consumeMagicLinkAction` (auth-actions.ts:274) → `claimMagicLink` (magic-link.ts:44-67, conditional claim) → `createSession`.
3. **Email verification:**
   - `registerAction` (auth-actions.ts:129) → `deliverVerification` (:115).
   - GET `/api/auth/verify-email` (`route.ts:28-90`): claims the token (:63-67), sets `emailVerifiedAt` (:68-72) and calls `createSession` (:78).
4. **Password reset:**
   - `requestPasswordResetAction` (:410, same answer for every address).
   - `resetPasswordAction` (:443): claims the token under the access lock (:463-469), deletes all sessions and MFA sessions (:471-472), then sends the "password changed" email.
5. **Google/Apple:**
   - `/api/auth/oauth/google/start` (`route.ts:16-32`, 30/15 min per address) → `createSocialAuthorization` (`src/lib/social-auth.ts:94-135`; state, nonce and PKCE stored server-side).
   - Callback (`google/callback/route.ts:7-24`, `apple/callback/route.ts:20-53`) → `completeSocialAuthorization` (:271-301) → `claimOAuthState` (:137-148) → `exchangeCode` → `verifiedProfile` (JWKS `iss`/`aud`/`nonce`) → `findOrCreateSocialUser` (:228-257) → `createSession`.
6. **Every request:**
   - `proxy` (`src/proxy.ts:108-183`; matcher :186 excludes only `_next/static|_next/image`).
   - Recovery hold (:131-142) → `mutationAllowed` (:43-66) → `impersonationMutationAllowed` (:68-72) → security headers (:93-106).
   - `no-referrer`/`no-store` on `/register`, `/waitlist*`, `/staff/accept*` and `/api/auth/oauth/*` (:167-171).
7. **Session read:**
   - `getCurrentSession` (auth.ts:168-232): SHA-256 lookup, suspended or expired sessions deleted (:188-198).
   - Sliding touch (:200-206; 14-day idle, 90-day cap).
   - Support-view resolution (:209-229, only with a verified MFA session).
   - Then `requireWorkspace` (:243-260): verification gate (:245), `memberships[0]` (:248).
8. **Support view:**
   - POST `/api/admin/impersonation/start` → `createAdminImpersonationGrant` (`src/lib/impersonation.ts:12-41`).
   - Cookie `jitm_impersonation` (Lax, HttpOnly).
   - Per request, `resolveAdminImpersonationGrant` (:43-65) runs under the staff lock with the ticket row lock, then writes a read receipt (:62).
   - The proxy returns 403 to every unsafe method while the cookie is present (proxy.ts:150-155).
   - `requireWritableWorkspace` (`src/lib/writable-workspace.ts:22`) also refuses inside actions.
9. **Webhooks:**
   - Resend: `route.ts:9-26` checks content type, bounds the body to 64 KB, verifies the svix signature (:19), then `receiveEmailProviderEvent`.
   - Intake: `route.ts:8-27` needs `X-JITM-Key` (32 bytes, SHA-256, `kind ≠ HOSTED_FORM`, :10-13), limits to 60/min per connection (:14) and 24 KB (:18), then `receiveIntake` (`src/lib/intake.ts:62-83`).
10. **Hosted lead form:**
    - `/lead/<connectionId>` → `submitLeadFormAction` (`src/lib/lead-form-actions.ts:7-26`).
    - `receiveIntake(..., { publicForm: true })` (intake.ts:62) → `intakeMatches` (:36-43) → `acceptIntake` into the matched contact (:45-60) → `applyJourneyEvent` (:58; `src/lib/journey.ts:65-102`).
11. **Retention:**
    - Worker maintenance (`src/worker/index.ts:351-354`) → `cleanupOperationalData` (`src/lib/operational-retention.ts:9-34`) → `runDataRetention` (`src/lib/data-retention.ts:182`).
    - Email passes (:11), support (:117), drafts and recipients (:151).
    - Then the rate-limit purge (operational-retention.ts:41).
12. **Tenant-isolation sweep:** every entry point in the tables below, traced down to each Prisma query that takes a client-supplied id.

## Tenant isolation: can account A reach account B's data by id?

**Result:** no cross-tenant read or write was found. The label is VERIFIED in code; runtime confirmation is in the lead's checks.

**Structural facts:**
- `workspaceId` always comes from the session: `session.user.memberships[0]` (auth.ts:248) or the support grant's workspace (impersonation.ts:57). No handler or action reads it from the request.
- Every `"use server"` export takes only `FormData` (or nothing). Checked with `grep` over all 50 files. No exported helper accepts a `workspaceId`.
- There are no inline `"use server"` functions under `src/app` or `src/components`.
- There are no database-level composite `(workspaceId, id)` foreign keys (grep of `prisma/migrations`), so app code is the only guard. It holds: every bare-id `update`/`findUnique` comes after a workspace-scoped lookup of the same id.
- A foreign id gets the same 404 or refusal text as a missing id, so there is no existence oracle across tenants. The one exception is a client-chosen UUIDv4 attempt id (`jump-attempts.ts:124`), which is not guessable and reveals nothing.

Legend:
- **Auth:**
  - gcs = `getCurrentSession()` plus membership;
  - rw = `requireWorkspace()`;
  - W = `requireWritableWorkspace()`;
  - R+imp = `requireWorkspace()` plus an explicit refusal during a support view;
  - RPA = `requirePlatformAdmin(perm)` (staff, verified, MFA session in production);
  - RPAI = the same without MFA.
- **View** = behaviour during a support view: block = refused by the route or action itself; proxy = only the proxy's unsafe-method 403; read = allowed read with an audit receipt.

### A. Route handlers (`src/app/api/**`, 50 files)

| Route (handler line) | Method | Auth | Client ids → constraint | View | RL / cap |
|---|---|---|---|---|---|
| account/export:13 | GET | rw | none; every section filters `workspaceId` (+`userId`) (`account-export-stream.ts:243-322`) | block :15 | 6/h; streamed |
| calendar/availability:21 | GET | gcs | none; `{workspaceId}` (:39) | read | 120/min |
| calendar/export:5 | GET | rw | `?id` → `{workspaceId, connectionId:null, id}` (:9) | block :7 | none |
| contacts/[contactId]/activity:61 / :108 / :205 | GET / POST / PATCH | gcs | contact `findFirst {id, workspaceId}` (:53-55); SQL binds both ids (:80-91); note edits `{id, workspaceId, contactId, kind}` (:218-219) | read / block / block | none / 60/min / 60/min |
| contacts/[contactId]/review-request:10 | POST | gcs | contact `{id, workspaceId, archivedAt:null}` (:20-23) | block :14 | 20/day |
| contacts/audience:7 | GET | gcs | `group[]` → `groupId in ids AND group.workspaceId` (:16) | read | ≤100 ids |
| contacts/import:152 / :164 / :175 | GET / DELETE / POST | gcs | batch `{id, workspaceId}` (`contact-import-jobs.ts:161,181`); tags, fields, date types and merge target re-checked per row, also in the background (`contact-import-service.ts:245-257, 311-316, 484-495, 703`) | block | 240/h; 12 MB bounded reader |
| contacts/quick-add:33 | POST | gcs | no client ids | block :92 | 40/h |
| contacts/recipient-search:6 | GET | gcs | `{workspaceId, archivedAt:null}` (:15) | read | none |
| follow-ups/preparation:24 / :32 | GET / POST | gcs + verified | contact `{id, workspaceId}` (:20) | read / block | – / 3 per 5 min |
| jumps/[jumpId]/actions:29, attempts:13, completed-at:12, draft:45/:60/:79, outcome:103, variant:10 | POST, PATCH, GET/PUT/DELETE | gcs | jump always `{id, workspaceId[, PENDING]}` before any bare-id write (e.g. completed-at :28→:31; `jump-drafts.ts:138-141,165,184`; outcome :141-149, :213-236; `jump-variants.ts:15-25`) | block | 60–240/min; 4–64 KB |
| marketplace/favorites:8 | POST | gcs | listing must be LIVE and not your own (`marketplace-service.ts:263-265`) | block :11 | 90/min |
| mega-mixes/[pipelineId]/export:10, mixes/[mixId]/export:10 | GET | rw | `{id, workspaceId}` (`mega-mix-pipeline-service.ts:128,145,157`) | block :13 (SEC-F7 still fixed) | none |
| mix-workflow:28 / :49 | GET / POST | gcs | contact and Mix through `assertMixStartEligible` `{id, workspaceId}` (`mix-start-eligibility.ts:6-13`); every rule's Mix/Beat must be this workspace's (`mix-workflow.ts:25-45`, `mix-workflow-validation.ts:8-12,44`); instance `{id, workspaceId}` (:110,114) | read / block :52 | – / 90/min, 1 MB |
| mixes/favorites:9 | POST | gcs | Mix `{id, workspaceId}` or an approved library template (`mix-favorites.ts:6-10`) | block | 90/min |
| mixes/schedule-preview:9 | POST | gcs | no ids | proxy | 30 KB |
| notifications/subscribe:14 / :29 / :52, notifications/test:7 | GET/POST/DELETE, POST | gcs + verified + browser scope (`push-request-context.ts:10-16`) | `{workspaceId, userId, sessionId[, endpoint]}` | block | 20 subscriptions per person; test 5/min |
| onboarding/preview:7 | GET | gcs | none (static) | read | none |
| quick-capture:8 / :16 | GET / POST | gcs | person `{id, workspaceId, archivedAt:null}` (:50) | read / block | – / 60/h |
| quiet-days:7 / :13 | GET / POST | gcs | SQL binds `workspaceId` (`quiet-days.ts:20-67`) | read / block | 60/min |
| settings/sending-preview:30 | GET | gcs | none; `{workspaceId}` | read | none |
| auth/magic:13 | GET | token (32 bytes, SHA-256, 15 min), not spent | – | – | none |
| auth/verify-email:28 | GET | token (32 bytes, 24 h), spent + session (SEC-07) | – | – | 30/h per address |
| auth/browser-context:5 | GET | gcs | returns a SHA-256 scope only (`browser-scope.ts:11-17`) | read | none |
| auth/oauth/{google,apple}/start:16 | GET | public | invite token checked read-only (`social-auth.ts:78-86`) | – | 30/15 min per address |
| auth/oauth/{google,apple}/callback | GET (+POST Apple) | single-use state (not browser-bound, SEC-06) | – | – | none |
| calendar/feed/[token]:5 | GET | 43-char token, SHA-256 lookup | returns only titles/times (`calendar-ical.ts:57-58`) of the token's workspace | – | none |
| reviews/[token]:9 | POST | token (32 bytes, SHA-256, 30 days, one response) | the token's own request | – | 10/h per token+address |
| reviews/[token]/public-review:5, refer:4 | GET | token | writes click marks on GET (prior CON-F19) | – | none |
| webhooks/resend:9 | POST | svix signature | – | – | 64 KB |
| webhooks/intake/[connectionId]:8 | POST | `X-JITM-Key` + id, `kind ≠ HOSTED_FORM` | writes to that connection's workspace only | – | 60/min, 24 KB |
| health/{live,ready,monitor,worker,recovery-boundary} | GET | public | status words only | – | none |
| admin/impersonation/start, end; admin/browser-context; admin/reports/exports/[exportId] | POST, POST, GET, GET | RPA(support.manage+support.view_customer) / grant owner / staff session / RPA(reports.read) | ticket-derived target; export bound to actor user + session (`report-exports.ts:88-95`) | – | 10/5 min; –; –; 20/min |

### B. Server actions (50 files)

| File (actions) | Auth | Client ids → constraint | View | RL |
|---|---|---|---|---|
| auth-actions (register :129, login :208, magic :240/:274, demo :294, logout :305, resend :310, email change :344, reset :410/:443) | public / token | self only; see SEC-04/SEC-07 | – | per address, email and account |
| auth-actions (changePassword :481, revokeSession :507, signOutOthers :518, signOutEverywhere :524) | rw / session | sessions `{id, userId}` (:511-514) | proxy | password change 8/h |
| bulk-contact (4), contact (create/update + wrappers), contact-lifecycle (3), custom-field (3), date-type (4), group (4), mix-stop (2), onboarding (3), snooze (1) | W | contacts `{workspaceId, id in}` with a count check (`bulk-contact-actions.ts:25-33`); groups `findMany {workspaceId, id in}` with a count check (`contact-actions.ts:210,217`); custom fields (`workspace-repository.ts:61-73`); contact `FOR UPDATE … AND workspaceId` (`contact-actions.ts:407-408`) | block | none |
| calendar (6) | local `context()` refuses views | entry, binding and connection all `{id, workspaceId}` (`calendar.ts:27-29,76`; `appointment-bindings.ts:137,175,192,203`) | block | none |
| contact-merge, contact-mix (2), contact-state (2), contact-view (3), important-date (3), intake (2), journey (6), jump-status (1), notification (5), workspace-profile (2), account-preference (10), account-deletion (2), support (5) | R+imp / ctx | both merge contacts `{id, workspaceId, archivedAt:null}` (`contact-merge-actions.ts:38-50`); ticket `{id, workspaceId, requesterUserId}` (`support-service.ts:32-39`); receipt `{id, connection:{workspaceId}}` (`intake.ts:88`); stages and rules counted in the workspace (`journey-configuration.ts:20-32`) | block | account deletion 5/h; support 5/h and 30/h |
| invitation-preference (2), waitlist (3), lead-form (1) | public | tokens: 32 bytes, hashed, single use; the same answer for every address; lead form writes into the connection's workspace (SEC-03) | – | per address, per email and per form |
| marketplace (7) | rw + owner in service; review RPA(mixes.publish) | listing `{id, workspaceId}` or LIVE-only (`marketplace-service.ts:134,278,317,440-442`) | block (markSeen silent) | report 10/h; review request 5/day |
| mega-mix (4), mega-mix-pipeline (5) | rw + owner | pipeline `{id, workspaceId}`; member Mixes must all be the workspace's (`mega-mix-pipeline-service.ts:49-50,92,118`); file keys are package-local and never ids (`mix-portable.ts:105-115,182-190`) | block | none (SEC-12) |
| mix-editor (saveMix) | rw | Mix `{id, workspaceId}` (:215-224); date type from this workspace or the system (:146-150); tags (:229-232); workflow sources through `validateWorkflow` | block | none |
| mix-lifecycle (activate / pause / archive) | rw | Mix `{id, workspaceId}` (:27-30, :60-63, :90-93) | activate: block; pause/archive: **proxy only** (SEC-12) | none |
| shared-mix-use, starter-mix, system-mix (2) | rw | approved library item; contact `{id, workspaceId, not archived}` (`referral-access.ts:33-34`); revoke `{id, inviterUserId, workspaceId}` | block | invite 10/h |
| 15 staff files | RPA / RPAI (see D) | platform scope by design; permission re-checked inside the transaction for most | – | per actor |

### C. Pages that read an id or token from the URL

| Page | Constraint | Result for a foreign id |
|---|---|---|
| `(app)/contacts/[contactId]` → `ContactProfile.tsx:47-75` | `findFirst {id, workspaceId}` then `notFound()`; the unscoped `contactRelationshipState` read (:68) is used only after the check | 404 |
| `(app)/contacts/[contactId]/edit` | `{id, workspaceId, not archived}` | 404 |
| `(app)/mixes/[mixId]/edit` → `/mixes?mix=` (`mixes/page.tsx:38-39`) | `{id, workspaceId}` | 404 |
| `(app)/account/tickets/[ticketId]` | `{id, workspaceId, requesterUserId}` (`support-service.ts:93-99`) | 404 |
| `(app)/templates/[sharedMixId]/use` | APPROVED only | 404 |
| `/review/[token]`, `/lead/[connectionId]`, `/for/[profession]` | hashed token; enabled HOSTED_FORM only; static persona | "expired" / 404 |
| searchParams readers: `/jumps?jump`, `/calendar?edit`, `/contacts?view/person/group/importBatch`, `/journey?contactId&work`, `/mixes/mega?megaMix`, `/marketplace?item=listing:` | every one scoped by `workspaceId`; a listing is LIVE or your own (`marketplace-service.ts:234`) | "unavailable" / 404 / "Nothing to show" |
| `(staff)/admin/*/[id]` (access, email recovery, suppressions, report history, support ticket, templates, users) | RPA with that area's permission; platform scope by design; no page decrypts secrets | – |

### D. Staff plane (summary)

- **Permission on every entry:** each staff page and admin action names its permission (see the coverage table in the staff pass, reflected in the "What holds up" list below).
- **What holds:**
  - `staff.manage` belongs to OWNER only (`admin-permissions.ts:46`).
  - Invitations cannot offer OWNER, are bound to the recipient and are re-validated at acceptance (`staff-invitations.ts:39,105-112`).
  - The last owner is protected (`staff-access.ts:59-61`).
  - Destructive actions need the current password plus MFA within 10 minutes.
  - Support views need `support.manage` and `support.view_customer`, an MFA session, an open ticket assigned to the actor, and a requester who is still a member (`impersonation.ts:19-26`).
- **Weak points:** MFA guessing (SEC-01), audit names (SEC-08), staff self-service (SEC-11).

## Findings

### SEC-01 — Staff MFA codes can be guessed with no account-wide limit; failed codes are neither logged nor alerted
- Severity: MEDIUM · Label: VERIFIED (code); attack duration INFERRED · Prior: none (prior audit listed MFA as sound)
- **What happens:** someone who has a staff member's password, or their inbox (emailed sign-in links work for staff), signs in. The only remaining barrier is the six-digit code. The code check is limited per *(account, client address)* pair only. Every new address gets ten fresh guesses. Nothing records the failures and nothing alerts anyone.
- **Reproduction:**
  1. Local production build, a staff test account with MFA enabled.
  2. Sign in.
  3. Open `/account/admin-mfa?verify=1` and submit 11 wrong codes. The 11th is refused ("Too many administrator verification attempts").
  4. Repeat from a new client address. Locally, loopback is a trusted hop, so `X-Forwarded-For: 198.51.100.2` counts as a new client. Guesses are accepted again, and a correct code still verifies.
- **Evidence:**
  - `src/lib/admin-mfa-actions.ts:25` — `identifiers: [userId, metadata.ipAddress],` with `limit: 10`, `windowMs: 15 min`, `blockMs: 30 min` (:26-28).
  - `verifyAdminMfaAction` (:91-117) audits only on success (:104-109); the `catch` (:111-115) records nothing.
  - `src/lib/admin-mfa.ts:103-112` has no failure counter.
  - `src/lib/client-ip.ts:45,136` keys the full IPv6 address.
  - `docs/ADMIN_MFA.md:93` lists "alerting for repeated verification failures" as outstanding.
  - Odds: the ±1-step window accepts 3 of 10⁶ codes. About 231,000 guesses give a 50% chance: `ln 2 / 3e-6`. At about 5 guesses per second that is roughly 13 hours from an IPv6 /64 or an address pool.
- **Root cause:** the limiter was designed against a shared-office lockout, so it includes the address. There is no IP-independent per-account failure cap.
- **Fix direction:** add a per-account failure limit (for example 5 failures → 15-minute lock), a `DENIED` platform audit event, an email to the staff member and an operations alert.
- **Runtime check for the lead:** steps 1–4 above in a Playwright context with `extraHTTPHeaders {"x-forwarded-for": "198.51.100.N"}`. Then confirm no `PlatformAuditEvent` row with outcome `DENIED` exists for `admin.mfa.verify`.

### SEC-02 — The privacy notice says support views need the customer's permission; nothing asks the customer
- Severity: MEDIUM · Label: VERIFIED · Prior: none
- **What happens:** `/privacy` tells every beta user "The private support-view workflow requires customer permission and records staff access." In the code, a staff member with `support.view_customer` can open a read-only view of the whole workspace for any open support conversation assigned to them. The view includes contacts, private notes (via the activity API) and history. Staff with both permissions can assign any open conversation to themselves (`support-case-access.ts:30-48`). The customer is never asked, and the "Message support" form never mentions it.
- **Reproduction:**
  1. As a customer, send any message from `/help` (`Message support`).
  2. Read the form. It mentions retention and "Keep private data out", but not staff access to the account.
  3. As an OWNER, grant yourself `support.view_customer`, assign the ticket to yourself and start a view. There is no customer step.
- **Evidence:**
  - `src/app/privacy/page.tsx:14` — "The private support-view workflow requires customer permission and records staff access."
  - `src/lib/impersonation.ts:19-26` checks the actor, assignment, open status and membership, with no consent.
  - `prisma/support.prisma:43` — `model SupportTicket` has no consent field.
  - `src/app/(app)/help/page.tsx:81-89` — the form text.
  - `docs/SUPPORT_CASE_ACCESS.md:33` — "Customer-approved repairs … remain separate launch work".
- **Root cause:** the policy text describes an intended consent step that was never built. The audit trail ("records staff access") does exist.
- **Fix direction:** either add an explicit "Allow support to view my account read-only while this conversation is open" choice on the ticket and check it at `createAdminImpersonationGrant`, or change the sentence (owner decision).
- **Runtime check for the lead:** production GET of `/privacy` to confirm the live text, and `/help` as a signed-in test user to confirm there is no consent control.

### SEC-03 — Anonymous lead-form posts attach to an existing customer and fire journey events (still open, prior SEC-F5)
- Severity: MEDIUM (fine to fix during beta) · Label: VERIFIED (code); user effect INFERRED · Prior: SEC-F5 / CON-F20
- **What happens:** anyone with a business's hosted form URL (published on its website) and a customer's email or phone can:
  - post up to 4,000 characters into that customer's timeline as "New inquiry from …";
  - fire `CONTACT_RECEIVED`, which can move the customer to a new Journey stage and start that stage's Mix, so the business's own sequence may go to the real customer.

  Since Release B, matching accepts any spelling of the phone number, which widens it.
- **Reproduction:**
  1. As A, create a hosted form in Settings → Connections.
  2. Keep a contact "Pat" (pat@example.com). Optionally enable Journey with a CONTACT_RECEIVED rule to a stage that has a Mix.
  3. In a private window, open `/lead/<connectionId>`, submit `pat@example.com` with the message "URGENT: call 555-0100", and tick the permission box.
  4. As A, open `/contacts/<Pat>`. The text is in the timeline, nothing appears under review, and the stage and Mix may change.
- **Evidence:**
  - `src/lib/lead-form-actions.ts:12` — the connection id is the only credential.
  - `src/lib/intake.ts:78-79` — `const needsReview = matches.length > 1 || matches.some(contact => contact.archivedAt); const contact = needsReview ? null : await acceptIntake(...)`.
  - `intake.ts:57` writes the activity; `intake.ts:58` calls `applyJourneyEvent`.
  - `journey.ts:92-101` — a rule transition calls `changeManagedPlan` (:101).
  - Limits: 10/h per form+address and 300/h per form (`lead-form-actions.ts:14-17`). The per-form total can also be used up to block real leads for an hour.
- **Root cause:** public submissions are treated like authenticated API intake.
- **Fix direction:** send public submissions that match an existing contact to REVIEW, and fire no journey event before the owner accepts (owner decision).
- **Runtime check for the lead:** steps 1–4 on the local build.

### SEC-04 — Whether an email has an account can be learned from sign-in timing, registration and invitation messages
- Severity: LOW · Label: VERIFIED · Prior: none (the prior audit judged the dummy hash sound)
- **What happens:** three paths answer the question.
  - **Sign-in:** an unknown address is compared against a dummy bcrypt hash of cost 10; real accounts use cost 12. The answer arrives about 4× faster for an unknown address.
  - **Registration:** a request with any made-up 43-character invite token answers "An account with that email already exists." for an existing account. For any other address it answers "This invitation is unavailable or has already been used." Nothing is created and no invitation is spent.
  - **Invitation preparation:** a member preparing an invitation learns whether any address has an account, has opted out, or has an outstanding invitation from anyone.

  Reset, sign-in-link and resend answers are uniform.
- **Reproduction:**
  1. On `/login`, submit a known account's email with a wrong password five times, then five times with a random address. Compare the server-action response times in DevTools: about 460 ms against about 110 ms locally.
  2. On a real invitation page, edit the hidden `invite` input to 43 random characters and submit an existing account's email. Then do the same with a new address.
  3. As a verified member, go to `/mixes/system` and prepare an invitation for a contact whose email belongs to another account.
- **Evidence:**
  - `src/lib/auth-actions.ts:25` — `DUMMY_PASSWORD_HASH = "$2b$10$…"`; `:165` — `bcrypt.hash(password, 12)`.
  - Computed with the repo's `bcryptjs`: `dummy cost10 ms 107,111,113 | real cost12 ms 449,466,485`.
  - `auth-actions.ts:138` checks the token's format only.
  - `auth-actions.ts:159-160` — `if (existing) fail("/login", "An account with that email already exists.")` runs before the invitation is claimed.
  - `src/lib/referral-access.ts:131-134` refuses a fake token.
  - `referral-access.ts:44-45,56` run before the quota check at :60-61.
- **Root cause:** existence checks run before the invitation or quota check, and the dummy hash uses a different cost factor.
- **Fix direction:** make the dummy hash cost 12 (`bcrypt.hashSync("…", 12)` at module load), claim the invitation before the existence check, and return one generic invitation refusal.
- **Runtime check for the lead:** steps 1 and 2 locally.

### SEC-05 — Per-address rate limits are easy to sidestep (residual of prior SEC-F1)
- Severity: LOW · Label: VERIFIED (code); edge behaviour INFERRED · Prior: SEC-F1 (fixed in Release A; this is what remains)
- **What happens:** there are three gaps.
  - **IPv6:** addresses are keyed per /128, so one IPv6 home connection supplies millions of distinct "clients".
  - **Cloudflare ranges:** every Cloudflare range is trusted as a proxy. A request that itself originates from a Cloudflare address (for example a free Cloudflare Worker) can therefore have its own `X-Forwarded-For` hops, to the left, accepted as the client.
  - **Per-user caps:** several per-user limits include the address (support tickets, MFA), so rotating the address resets them.

  Per-email and per-account daily caps still hold, which is why this stays LOW. It is the root of SEC-01's attack time.
- **Reproduction:** locally, loopback is trusted. Send `X-Forwarded-For: 2001:db8::N` with a different N and observe fresh buckets, for example on the lead form: 10 per N, up to 300 per form.
- **Evidence:**
  - `src/lib/client-ip.ts:97-101` — the trusted list includes `CLOUDFLARE_RANGES`.
  - `:132-137` — right-to-left walk, `if (inList(trusted, hop)) continue; return hop.address;`.
  - `:45` — the full IPv6 address is returned.
  - `src/lib/rate-limit.ts:19-28` — the identifiers are joined into one key.
  - `support-actions.ts:46-50` — keyed `[workspace.id, user.id, ipAddress]`.
  - Production topology: `docs/PRODUCTION_PROMOTION_HANDOFF_2026-09-15.md:21` — "served by Render …, Cloudflare in front" (Render's edge); `docs/EXTERNAL_DATA_RETENTION.md` — DNS in Route 53.
  - Test gap: `src/lib/client-ip.test.ts` has no case where the client itself is a Cloudflare address, and no IPv6 /64 case.
- **Root cause:** trusting a proxy's published ranges is not the same as trusting the hop that proxy appended.
- **Fix direction:** key IPv6 by /64. When the nearest hop is Cloudflare, take `CF-Connecting-IP` and stop walking. Key per-user caps on the user alone.
- **Runtime check for the lead:** `dig AAAA jumpinthemix.com` (is the site reachable over IPv6?), plus the local XFF rotation above.

### SEC-06 — Google/Apple sign-in state is not tied to the browser (login CSRF), dormant until a provider is configured
- Severity: LOW (MEDIUM if Google or Apple is enabled before beta) · Label: VERIFIED · Prior: none
- **What happens:** the OAuth `state`, nonce and PKCE verifier live only in the database. No cookie ties them to the browser that started the flow. An attacker can start Google sign-in with their own Google account, stop at the callback, and send the victim `https://jumpinthemix.com/api/auth/oauth/google/callback?state=…&code=…`. The victim's browser completes it and is signed in to the attacker's account; `createSession` also deletes the victim's own session in that browser. Anything the victim then adds lands in the attacker's account. Apple's callback also accepts GET.
- **Reproduction:** needs configured provider credentials; not possible on production today. Release B's record says no provider is configured.
- **Evidence:**
  - `src/lib/social-auth.ts:98-116` — the state is stored by `stateHash` only.
  - `google/callback/route.ts:7-12` — no cookie is read before `completeSocialAuthorization`.
  - `social-auth.ts:137-148` — `claimOAuthState` checks the provider, expiry and single use only.
  - `apple/callback/route.ts:52` — `export async function GET`.
- **Fix direction:** set a short-lived HttpOnly cookie holding a random value at start (hash it into the state row), and require it at the callback.
- **Runtime check for the lead:** production GET `/login` should show no Google or Apple button (confirms dormant).

### SEC-07 — The verification link is still spent by a GET and signs in whoever opens it, keeping a password someone else may have chosen
- Severity: LOW · Label: VERIFIED · Prior: SEC-F8 / FUN-F5 (the magic-link half was fixed in A2)
- **What happens:**
  - A mail scanner that opens the verification link spends it and receives a session. The person then lands on `/login?verified=1` and must sign in (UX).
  - A text invitation lets its holder register with any address (confirm field only). If the address's real owner clicks "verify" in the email they did not ask for, the account becomes verified and they are signed in, while the registrant still knows the password. The emailed sign-in link and Google/Apple release such a password (Release B); the verification link does not.
- **Reproduction:**
  1. Register from a text invitation using mailbox X.
  2. Open the verification link from X in another browser. You are signed in.
  3. Sign in with the first browser's password. It still works.
- **Evidence:**
  - `src/app/api/auth/verify-email/route.ts:63-72` — the token is claimed and `user.update({ where: { email }, data: { emailVerifiedAt: now } })` runs with no password release.
  - `:78` — `await createSession(outcome.user.id);`.
  - Compare `src/lib/magic-link.ts:63` and `social-auth.ts:249-250` (`releaseUnverifiedAccount`).
  - `auth-actions.ts:157` — a text invitation accepts any email with a confirm field.
- **Fix direction:** move verification to the same GET-then-POST page as the magic link, and do not sign in from the link for password accounts (owner decision on UX).
- **Runtime check for the lead:** the three steps above locally.

### SEC-08 — Admin → Audit shows customers' contact names to `audit.read` staff without a support case
- Severity: LOW · Label: VERIFIED · Prior: none
- **What happens:**
  - Archive, restore, bulk archive and merge write the contact's `displayName` into the workspace audit metadata.
  - Admin → Audit renders this metadata under "Record details" for OPERATOR and OWNER roles.
  - This bypasses the rule that customer content needs an assigned support case and an audited view.
- **Reproduction:**
  1. As a customer, merge two duplicate contacts.
  2. As an OPERATOR, open `/admin/audit?scope=workspace&q=contact.merge`.
  3. Expand "Record details". Both names are shown.
- **Evidence:**
  - Where the names are written:
    - `src/lib/contact-merge-actions.ts:263` — `metadata: { sourceDisplayName: source.displayName, survivorDisplayName: survivor.displayName }`;
    - `contact-lifecycle-actions.ts:43,74,107`;
    - `bulk-contact-actions.ts:99`.
  - `src/lib/audit-redaction.ts:1` — the redaction pattern `/password|secret|token|cipher|credential|authorization|cookie|body|script|notes|email|phone|address|message/i` does not match `displayName`.
  - `src/app/(staff)/admin/audit/page.tsx:13,16,46` renders it.
  - `admin-permissions.ts:33` — OPERATOR holds `audit.read`.
- **Fix direction:** store contact ids only, or add `name` to the redaction pattern.
- **Runtime check for the lead:** the steps above, if a staff OPERATOR fixture exists.

### SEC-09 — The personal-data export gives a Marketplace author the reporter's text while the report is still open
- Severity: LOW · Label: VERIFIED · Prior: SEC-F2 (Release A decision: "the reporter's free text is withheld until a decision")
- **What happens:** the Marketplace hides a reporter's free text from the author while the report is OPEN. The author's own JSON export includes it anyway. The reporter's identity is not exposed.
- **Reproduction:**
  1. As B, report A's LIVE share with the details `PROBE-TEXT-123`.
  2. As A, open `/marketplace?…item=listing:<id>`. No details are shown.
  3. As A, run `GET /api/account/export`. `marketplace.reportsReceived[].details` is `"PROBE-TEXT-123"` with `status: "OPEN"`.
- **Evidence:**
  - `src/lib/account-export-stream.ts:298` — `select: { id, listingId, reason, details: true, status, reviewNote, createdAt }` for any status.
  - `src/lib/marketplace-service.ts:245-246` — `details: report.status === "OPEN" ? null : report.details`.
  - `docs/MARKETPLACE_AND_NUMBERING_2026-09-24.md:77` still says the author sees the details.
- **Fix direction:** return null details for OPEN reports in the export.
- **Runtime check for the lead:** steps 1–3.

### SEC-10 — A shared Mix republishes every later edit without the privacy check
- Severity: LOW · Label: VERIFIED (code); impact INFERRED · Prior: related to MIX-F5
- **What happens:**
  - The privacy warnings (names after greetings, private-information patterns) run only when the share sheet opens.
  - Once shared, every Mix save republishes at once, and so does every change to the members of a shared Mega-Mix.
  - A real customer's name typed into the wording later becomes readable by every member until someone reports it.
  - The editor does tell the author that changes appear as soon as they save.
- **Evidence:**
  - `src/lib/mix-editor-actions.ts:386` — `await refreshSharesOf({ workspaceId: workspace.id, mixIds: [mixId] });`.
  - `src/lib/marketplace-service.ts:62-74`.
  - `src/components/MarketplaceShare.tsx:25` — `warnings={exported ? shareWarnings(exported.package) : []}`.
  - `src/components/MarketplaceControls.tsx:52` — "appear there as soon as you save them."
- **Fix direction:** run `shareWarnings` when a shared item is saved, and hold publication until the author re-confirms when new warnings appear (owner decision).
- **Runtime check for the lead:** share a Mix, edit a Beat to "Hi Jane Smith, …", save, and open the listing as account B.

### SEC-11 — Staff-only accounts have no security page, and a lost authenticator can only be reset in the database
- Severity: LOW (operational) · Label: VERIFIED · Prior: ACC-F3 (still open)
- **What happens:**
  - Staff created from an invitation have no workspace. `/account` sends them to `/register`, so they cannot change their password, list sessions or sign out everywhere; only "Sign out" exists.
  - There is no in-app way to reset another staff member's MFA or issue new recovery codes.
  - With one owner, a lost phone plus used-up codes locks everyone out of admin, including suspending an abusive beta user.
- **Evidence:**
  - `src/app/(app)/account/page.tsx:36` — `requireWorkspace()`.
  - `src/lib/auth.ts:249` — `if (!membership) redirect("/register");`.
  - `src/lib/staff-invitations.ts:109-112` creates the user with no workspace.
  - `src/app/(staff)/layout.tsx:20` — only "Sign out".
  - `src/lib/admin-mfa.ts` writes the credential only at enrolment and use.
  - `docs/ADMIN_MFA.md:37` sends a lost authenticator to a manual operator procedure.
- **Workarounds:** `/forgot-password` ends every session (`auth-actions.ts:471-472`). A second OWNER with MFA is the break-glass option.
- **Fix direction:** a staff security page under `requirePlatformAdminIdentity`, and an owner-only MFA reset with step-up.
- **Runtime check for the lead:** accept a staff invitation locally and open `/account`. It should redirect to `/register`.

### SEC-12 — Hardening leftovers (no user-visible impact today)
- Severity: LOW · Label: VERIFIED · Prior: partly SEC-F6/F7
1. **Pause/Archive Mix rely only on the proxy during a support view:** `src/lib/mix-lifecycle-actions.ts:58,88` use `requireWorkspace()` with no view check, whereas `activateMixAction` does check (:25). The module is not in `WRITABLE_ACTION_MODULES` (`tests/server-action-auth-guard.test.ts`). The proxy still returns 403.
2. **Six JSON routes return raw exception text:**
   - `contacts/[contactId]/activity:201`
   - `contacts/quick-add:125`
   - `jumps/[jumpId]/outcome:342`
   - `mixes/[mixId]/export:22`
   - `mega-mixes/[pipelineId]/export:22`
   - `marketplace/favorites:18`

   An unexpected Prisma error would show model or constraint names to the signed-in owner. `mix-workflow:85` shows only `UserFacingError` text.
3. **A dead exported action normalises its return path off-site:** `src/lib/jump-status-actions.ts:15,18-21` check `startsWith("/jumps")` before `new URL()` normalises the path. Computed: `/jumps/..//evil.com` becomes `//evil.com?jumpUpdated=done`, which resolves to `https://evil.com/`. It is not reachable cross-site (POST plus the origin check). Nothing posts to it, but it is re-exported through `src/lib/actions.ts:18`, which `ContactProfile.tsx:8` imports, so it is likely registered. Delete it.
4. **Moderation and settings plumbing:** `marketplace-actions.ts:88-98` (`reviewListingAction`) has no in-transaction permission re-check, rate limit or step-up. Its `failed()` swallows the MFA redirect, so staff see "The decision could not be saved." instead of the MFA prompt. The Community-reports page is gated `mixes.edit`, but deciding needs `mixes.publish` (`admin-permissions.ts:65`).
5. **Imports, copies and Marketplace adds have no rate limit or install-side caps:** `mega-mix-pipeline-actions.ts:42-74`; `mega-mix-pipeline-service.ts:174-199`. Repeated adds inflate "added N times" (`marketplace-service.ts:242`). Imports land ACTIVE without assignments (prior SEC-F6, validation half fixed at `mega-mix-pipeline-service.ts:178`).
6. **Stale security docs:** `docs/SECURITY.md:7` and `docs/CANONICAL_PRODUCT_DECISIONS.md:109` still say sessions are `SameSite=Strict` with a 14-day maximum. The code is Lax with a 14-day idle limit and a 90-day cap (`auth.ts:100,105`; `env.ts:59-61`). `docs/ADMIN_MFA.md:58` says MFA events go to the workspace audit log, but they go to the platform log (prior docs mismatch 5).

- **Fix direction:** one small cleanup PR.
- **Runtime check for the lead:** optional. During a support view, press Pause on `/mixes` and expect 403 "view-only".

## What holds up (checked, evidence)

- **Sessions:**
  - 32 random bytes, stored as a SHA-256 hash (`auth.ts:43,62`).
  - Cookie `HttpOnly`, `SameSite=Lax`, `Secure` in production, expiring at the 90-day cap (auth.ts:95-106). The row slides by 14 idle days, never past the cap (:33-36, :200-206).
  - At most 10 per user (:80-92). A new sign-in replaces the browser's previous session (:54-76). A password change rotates the session (:111-118; auth-actions.ts:497-502).
  - Reset, email change and suspension end all sessions (auth-actions.ts:471-472, :382-383; auth.ts:188-198). Sign out everywhere works (:524-529).
- **Verification gate:** sessions are created only for verified accounts in production. The call sites are auth-actions.ts:203 (pilot only), :231 (after :227), :283 (link proves the address), :301 (demo, refused in production), verify-email and OAuth (verified), staff acceptance (`emailVerifiedAt` set at `staff-invitations.ts:109`). `requireWorkspace` also gates (auth.ts:245).
- **Password policy:** at least 12 characters and at most 72 bytes (`password-policy.ts`), bcrypt cost 12. Reset, sign-in-link and resend give the same answer for every address. Magic links are no longer spent by a GET (A2).
- **Request boundary:**
  - Every unsafe method on every path except `_next/static|_next/image` needs `Origin` equal to `APP_URL` or an allowed origin (proxy.ts:43-66).
  - Exempt: `/api/webhooks/*` (signature or key), Apple's `form_post` from `https://appleid.apple.com` only (:48-52), and ending a support view with `Origin: null` plus `Sec-Fetch-Site: same-origin` (:57).
  - Server Actions also get Next's same-origin check (`next.config.ts:35-38`).
  - The internal headers `x-jitm-*` and `x-nonce` are overwritten by the proxy (:157-162).
- **Headers:**
  - Nonce CSP with `strict-dynamic`; no `unsafe-eval` in production; `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `frame-ancestors 'none'`, `upgrade-insecure-requests` (:74-91).
  - HSTS for one year with subdomains; `nosniff`, `DENY`, `strict-origin-when-cross-origin`, Permissions-Policy, COOP, CORP (:93-106).
  - `poweredByHeader: false`; no browser source maps (next.config.ts).
  - Only two `dangerouslySetInnerHTML` uses, both constant or escaped (`layout.tsx:46`, `StructuredData.tsx:4`). No user-supplied image URLs.
  - The service worker caches only `/_next/static` and icons (`public/sw.js:34-57`). Push payloads are generic (`follow-up-push.ts:185`).
- **Open redirects:** `customerReturnPath` re-validates after normalising (`customer-return-path.ts:2-7`). `safeAdminReturnTo` checks the origin and `/admin` (`admin-navigation.ts:34-43`). OAuth and impersonation redirects use `APP_URL` (SEC-F9 fixed).
- **Error banners:** public `?error=` must carry our HMAC (`form-errors.ts:33-50`). Signed-in pages need a signature for that viewer, under one hour old (:65-90). This closes SEC-F3.
- **Tokens:**
  - Every secret token is 32 random bytes and stored hashed: verify, reset, magic, waitlist, invitation-stop, referral invite, staff invite, review, calendar feed, intake key, impersonation.
  - Single use is enforced by conditional `updateMany` claims.
  - Lifetimes: verify 24 h, reset 60 min, magic 15 min, staff invite 7 days, impersonation 30 min, review 30 days (`auth-tokens.ts`, `magic-link.ts`, `impersonation.ts`, `staff-invitations.ts`).
  - Report exports are bound to the requesting staff session and encrypted (`report-exports.ts:88-95`).
  - The calendar feed and intake keys are hidden during support views (`calendar/page.tsx:61`, `settings/connections/page.tsx:43`).
  - Note: a referral invitation's raw link also sits in the prepared message body (`referral-access.ts:67-73`). This is intended so the owner can send it, but it is plaintext at rest while unused.
- **Webhooks:** Resend is svix-verified over the exact raw body, with id, timestamp and signature (`webhooks/resend/route.ts:13-20`), and bounded to 64 KB. Intake needs the hashed key and the right kind, limited to 60/min and 24 KB.
- **SEC-F2 fixed:** only a verified PRIVATE_INFO report auto-hides, at most 2 per reporter per day (`marketplace.ts:24-34`).
- **SEC-F7 fixed:** exports refuse support views (`mixes/[mixId]/export:13`, `mega-mixes/…:13`).
- **SEC-F10 fixed:** OAuth starts are limited (`google/start/route.ts:22`), push subscriptions are capped at 20, and expired OAuth states are purged (`operational-retention.ts:28`).
- **Stale rate-limit rows are purged** (`operational-retention.ts:41-54`).
- **Staff plane:** `staff.manage` belongs to OWNER only (`admin-permissions.ts:46`). Invitations cannot offer OWNER and cannot attach to existing accounts. The last owner is protected. Step-up (password plus MFA within 10 minutes) guards destructive actions. MFA secrets use AES-256-GCM, the last used counter blocks replay, and recovery codes are stored as HMACs (`admin-mfa.ts:27-35,103-133`; `totp.ts` uses timing-safe comparison with a ±1 step).
- **Email HTML is escaped** in every template checked: `auth-email.ts:18`, `marketplace-service.ts:352-486`, `notification-delivery.ts:179-181,293`, `staff-invitations.ts:63`.
- **Secrets in the client bundle (static):**
  - No `NEXT_PUBLIC_*` variable exists (grep).
  - An import-graph walk of all 111 `"use client"` modules finds none reaching `env`, `prisma`, `auth`, `auth-tokens`, `rate-limit`, `integration-crypto`, `admin-mfa`, `totp`, `social-auth`, `impersonation`, `request-context`, `email-budget` or `transactional-email`. The walk is `scratchpad/client-graph.mjs`, which reads files only.
  - The only node built-in reached is `node:crypto` `createHash` in `jump-schedule.ts` (via MixEditor and LibraryDraftForm), which is harmless.
  - `libphonenumber-js` is kept server-only by `tests/phone-client-bundle-guard.test.ts`.
- **Privacy promises backed by code:**
  - Support conversations are deleted 180 days after resolution (`data-retention.ts:117-149`).
  - Email and audit details are kept up to 400 days (`data-retention-policy.ts:1-12`).
  - Waitlist, verification and draft retention (`data-retention.ts:11-116,151-180`).
  - Capture drafts last 10 minutes (`capture-draft.ts:4,34`).
  - Dictation is browser-only, with no recording (`VoiceNoteButton.tsx`, no `MediaRecorder`).
  - No analytics or advertising scripts (grep for gtag, posthog, sentry and similar: none).
  - Export and deletion are at Settings → Data & privacy (`account/page.tsx:55`).
  - Staff MFA is required in production (`render.yaml:18-19`; `env.ts:137`).
- **`security.txt`:** Contact, Expires 2027-09-25, Canonical, Policy (`public/.well-known/security.txt`). `/security` and `SECURITY.md` agree. A test fails 30 days before expiry (`tests/security-txt.test.ts`).
- **Dependencies:** exact pins except `web-push ^3.6.7`, which the lockfile pins. Overrides cover six transitive packages. Next 16.3.4 and React 19.2.7 are later than the fixed versions of the late-2025 React Server Components advisories (INFERRED from version numbers; `npm audit` is the lead's check). CI runs gitleaks and `npm run security:audit` (`.github/workflows/security.yml`), but only on `main` and PRs. `main` lags production, so the deployed branch is not scanned on schedule.

## Test coverage for this lane

| Flow | Tests |
|---|---|
| Tenant scoping helpers | `tests/workspace-isolation.test.ts` (5 repository-helper cases) |
| Cross-workspace fixtures in integration tests | `contact-import-integration`, `contact-quick-add.integration`, `jump-drafts`, `mega-mix-installation.integration`, `mega-mix-pipelines.integration`, `mix-workflow-rule-save.integration`, `quick-capture.integration`, `support-service.integration`, `marketplace.integration:85`, `push-notification-routes`, `customer-journey.integration` |
| Every tenant action calls the guard; the writable list | `tests/server-action-auth-guard.test.ts` (static source test) |
| Route and support-view matrix | `tests/route-authorization.test.ts`, `tests/support-boundary.test.ts`, `tests/admin-impersonation.test.ts`, `e2e/support-cases.spec.ts` (needs `SUPPORT_CASES_E2E=1`) |
| Auth and sessions | `auth-security`, `auth-abuse` (+ `.integration`), `auth-boundary` (static), `magic-link-release.integration`, `social-auth*`, `oauth-*`, `e2e/session-cookie-cross-site.spec.ts` |
| Client address | `src/lib/client-ip.test.ts`, `tests/env-trusted-proxy.test.ts` |
| MFA | `tests/admin-mfa.test.ts` (vector, enrol, replay, recovery), `tests/admin-mfa-boundary.test.ts`, `e2e/admission-mfa.spec.ts` |
| Signed errors, security.txt | `tests/url-error-guard.test.ts`, `tests/security-txt.test.ts`, `tests/security-page.test.tsx` |
| Retention | `tests/data-retention.integration.test.ts`, `src/lib/operational-retention.test.ts` |

**Critical flows with no test:**
- no browser or HTTP two-account IDOR suite (A's session against B's ids across routes, actions and pages);
- nothing tests A sharing, adding or copying with B's ids;
- no test of Pause/Archive during a support view;
- no per-account MFA failure lock (it does not exist);
- no login-timing or registration-enumeration test;
- no test that the export withholds OPEN report details;
- no test binding OAuth state to the browser;
- no `client-ip` case for a Cloudflare-address client or IPv6 /64 rotation;
- no lead-form test for attaching to an existing contact (only `customer-journey.integration` touches intake).

## NOT RUN

- **All runtime confirmation** of the tables and findings: needs the lead's local production build and two accounts (checks below).
- **The production edge chain:** whether Cloudflare Worker subrequests can carry a client-chosen `X-Forwarded-For` (SEC-05), and whether the site answers over IPv6 (`dig AAAA`). Needs network access.
- **Production configuration:**
  - who holds `support.view_customer` (SEC-02 exposure);
  - whether `TWILIO_*` or `WEB_PUSH_VAPID_*` are set;
  - the text of `PUBLIC_BACKUP_RETENTION_NOTICE`;
  - `AUTH_ALLOWED_ORIGINS` and `TRUSTED_PROXY_CIDRS`.

  These need the Render dashboard or the owner.
- **Whether `security@jumpinthemix.com` delivers** (the ImprovMX alias, a Release B owner step): needs a test email.
- **Provider-side retention:** S3 seven-day lifecycle, Render recovery window and ImprovMX seven-day logs. These are stated in docs only; checking them needs the AWS, Render and ImprovMX consoles.
- **Whether the retention pass actually completes in production:** check the `DataRetentionState` checkpoint in Admin → Operations → Data retention (staff MFA session needed).
- **`npm audit` and the built-bundle grep:** the lead's job.
- **Timing on 0.5 CPU production hardware:** not measured; the local ratio was about 4×.

## Questions for Kevin

1. **Support views (SEC-02):** should the ticket form ask "Allow support to view my account read-only while this conversation is open", or should `/privacy` drop "requires customer permission"? Does anyone in production hold `support.view_customer` today?
2. **security@ alias:** is `security@jumpinthemix.com` live in ImprovMX yet? `security.txt` lists it first.
3. **SMS and push providers:** are Twilio SMS or web push configured in production? If Twilio is, `/privacy` should name it, since the operator chooses it, not the user.
4. **Lead form (SEC-03):** should a public submission that matches an existing contact wait for your review instead of updating the timeline and Journey?
5. **Marketplace (SEC-10):** should saving a shared Mix re-run the privacy check and hold publication until re-confirmed?
6. **Staff MFA (SEC-01, SEC-11):** is a lockout after 5 wrong codes (15 minutes, with an email to you) acceptable? Will you keep a second OWNER with MFA as break-glass?
7. **Verification link (SEC-07):** keep one-tap sign-in from the verification email, or require the password (or a confirm page) for password accounts?
8. **Google/Apple sign-in (SEC-06):** confirm both stay off until the OAuth state is tied to the browser.

## Runtime checks for the lead

**1. Two-account IDOR probes** (local production build, owners A and B, each with a contact, Mix, Mega-Mix, ticket, follow-up and calendar entry).

Take B's ids from B's own URLs, then use A's session. Expected results:
- **404:**
  - `/contacts/<Bc>`
  - `/contacts/<Bc>/edit`
  - `/account/tickets/<Bt>`
  - `/mixes/<Bm>/edit`
  - `/mixes/mega?megaMix=<Bp>`
  - `GET /api/mixes/<Bm>/export`
  - `GET /api/mega-mixes/<Bp>/export`
  - `GET /api/contacts/<Bc>/activity`
  - `GET /api/jumps/<Bj>/draft?family=TEXT`
  - `GET /api/calendar/export?id=<Be>` (404 or empty)
- **Refused or no effect:**
  - `/jumps?jump=<Bj>` shows "unavailable".
  - `POST /api/jumps/<Bj>/outcome` with `{"outcome":"COMPLETED","requestId":"x1"}` (same-origin `Origin`) returns 404 or 409.
  - `POST /api/mix-workflow` with `{"action":"start","contactId":"<Ac>","mixId":"<Bm>","requestId":"<uuid>"}` returns 400.
- **Edited hidden inputs in DevTools:**
  - contact edit `contactId` = Bc → "Contact not found";
  - share sheet `targetId` = Bm → refused;
  - Mega-Mix save with `mixId` = Bm → "Choose Mixes from this account.";
  - Mix editor `dateTypeId` = B's custom type, and `groupIds` = B's tag → refused;
  - `/mixes/system` `contactId` = Bc → "Choose an active contact from your own account."

  Afterwards, B's data is unchanged.

**2. Boundary and headers:**
- `curl -si -X POST <origin>/api/contacts/quick-add -H 'Origin: https://evil.example' -H 'Cookie: jitm_session=<A>' -d '{}'` → 403 "The request origin is not allowed."
- The same request with no `Origin` and `Sec-Fetch-Site: cross-site` → 403.
- `curl -sI` on `/` and `/jumps` shows:
  - CSP with `nonce-` and `strict-dynamic`, no `unsafe-eval`;
  - HSTS; `X-Frame-Options: DENY`; `nosniff`; `strict-origin-when-cross-origin`; COOP/CORP `same-origin`;
  - no `X-Powered-By`;
  - `/jumps` with `Cache-Control` `private`/`no-store`.
- `/register` and `/staff/accept` answer with `Referrer-Policy: no-referrer` and `Cache-Control: private, no-store`.
- Sign-in `Set-Cookie`: `jitm_session` has HttpOnly, Secure, SameSite=Lax and Expires about 90 days out, plus `jitm_session_device`.

**3. Findings:**
- SEC-01: rotate `X-Forwarded-For` on `/account/admin-mfa?verify=1`.
- SEC-03: lead form attaches to Pat.
- SEC-04: timing, and the fake-invite registration.
- SEC-09: export while the report is OPEN.

**4. Production GETs:**
- `/privacy`: does the live text still say "requires customer permission"? Is Twilio named? What does the backup notice say?
- `/login`: no Google or Apple buttons.
- `/.well-known/security.txt` and `/security` answer 200.
- Response headers show `cf-ray` / `server: cloudflare` (Render's edge).
- `dig AAAA jumpinthemix.com`.

**5. Bundle grep** (`.next/static/**`, `find … -name '*.map'` should find none). None of these strings should appear:
- Variable names that must not appear with values: `DATA_ENCRYPTION_KEY`, `AUTH_RATE_LIMIT_SECRET`, `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `WEB_PUSH_VAPID_PRIVATE_KEY`, `TWILIO_AUTH_TOKEN`, `AUTH_GOOGLE_CLIENT_SECRET`, `AUTH_APPLE_PRIVATE_KEY`, `DATABASE_URL`, `NETLIFY_WORKER_SECRET`, `PRIVATE_TEST_PASSWORD`, `BACKUP_ENCRYPTION_KEY`, `AWS_SECRET_ACCESS_KEY`.
- Literals that would mean a server module was bundled: `local-development-rate-limit-secret`, `jitm-public-error:v1`, `jitm-viewer-error`, `jitm-known-device`, `PrismaClient`, `@prisma/client`, `bcrypt`, `libphonenumber`.
- Secret value patterns: `re_[A-Za-z0-9]{8,}`, `whsec_`, `postgres://`, `postgresql://`, `-----BEGIN`.
- Exact values: `grep -F` of each secret value from the build's `.env`, without printing them.

Expected: `createHash`/`node:crypto` shims may appear through `jump-schedule.ts`; that is harmless.

**For other lanes (seen while tracing):**
- One global daily email budget covers every workspace's automatic follow-ups, Marketplace report mail and support mail: 90 a day, 20 of them reserved for auth mail. See `env.ts:52,82`, `email-budget.ts`, `automatic-delivery.ts:81-87`, `marketplace-service.ts:336-369`. One busy workspace can hold everyone else's automatic email for the day. This is for the ops/sending lane.
- The proxy buffers request bodies of up to 10 MB before authentication (`proxyClientMaxBodySize` is unset). This is for the ops lane on a 512 MB instance.
