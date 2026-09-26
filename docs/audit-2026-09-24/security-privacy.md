# Security and privacy audit — 2026-09-24 (d70ec54)

## Scope and method

Read-only static review of the worktree at `the repository` (commit `d70ec54`, 2026-09-24 13:50 -0700; the customer site runs `e26fdd4` + docs). No build, server, test run or network access was used. All file references are relative to the repo root; line numbers are from `cat -n` on this commit.

What was read end to end:

- Auth and session core: `src/lib/auth.ts`, `auth-tokens.ts`, `auth-actions.ts`, `auth-email.ts`, `social-auth.ts`, `password-policy.ts`, `request-context.ts`, `rate-limit.ts`, `env.ts`, `private-test.ts`, `customer-return-path.ts`, `admin-navigation.ts`, `request-url.ts`, `browser-scope.ts`, `push-request-context.ts`, `worker-request.ts`.
- Edge/CSRF/headers: `src/proxy.ts`, `next.config.ts`, `src/app/layout.tsx`, `src/app/robots.ts`, `public/sw.js` (grep).
- Staff control plane: `admin-permissions.ts`, `staff-access.ts`, `impersonation.ts`, `admin-mfa.ts`, `totp.ts`, `integration-crypto.ts`, `support-case-access.ts`, `support-read-audit.ts`, `user-admin.ts`, `admission-admin.ts`, `staff-invitations.ts`, `report-exports.ts` (download), `audit-redaction.ts`, all 15 admin action files, every `(staff)` page's gate, `src/app/staff/accept/page.tsx`.
- All 51 route handlers under `src/app/api/**` (every file read in full).
- All 52 `"use server"` files (admin files in full; customer files in full for auth/contact/marketplace/shared-mix/support/account/calendar/intake/lead/notification/waitlist/invitation-preference/mix-stop/snooze/jump-status, and targeted reads of every id-keyed Prisma call in the rest — see appendix).
- Marketplace (commit `91e5aad`): `marketplace.ts`, `marketplace-service.ts`, `marketplace-actions.ts`, `mix-portable.ts` (schema), `mega-mix-pipeline-service.ts` (`installPortable`, `exportSingleMix`), `jump-render.ts` (placeholder rendering), `placeholders.ts`.
- Data handling: `account-deletion.ts`, `account-deletion-actions.ts`, `intake.ts`, `lead-form-actions.ts`, `calendar-feed-fetch.ts` (SSRF guard), `transactional-email.ts`, `automatic-delivery.ts` (send paths), `email-budget.ts` (reserve), `contact-file-parser.ts`/`contact-import-shared.ts` (caps), `referral-access.ts`, `review-requests.ts`, `connection-tokens.ts`.
- Schema: `prisma/schema.prisma` and the 25 split `.prisma` files (models, `workspaceId` presence, `WorkspaceRole`).
- Docs compared with code: `SECURITY.md` (root), `docs/SECURITY.md`, `SUPPORT_CASE_ACCESS.md`, `STAFF_ACCESS.md`, `ADMIN_MFA.md`, `USER_ADMINISTRATION.md`, `ACCOUNT_EXPORT_INVENTORY_2026-09-22.md`, `DATA_RETENTION.md`, `ADMIN_CONTROL_PLANE.md`, `HOSTED_DEPLOYMENT.md`, `render.yaml`, `.env.example`.
- Framework behaviour checked against `node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/serverActions.md` (`allowedOrigins` compares Origin with Host; same-origin only when empty).

Structural facts that shape the findings: `WorkspaceRole` has a single value `OWNER` (`prisma/schema.prisma:10-12`) and every workspace is created with exactly one member (`account-provisioning.ts:352-357`), so there is no intra-workspace role boundary to audit — "staff" means the platform control plane. Production config (`render.yaml`) sets `AUTH_REQUIRE_ADMIN_MFA=true`, `AUTH_REQUIRE_EMAIL_VERIFICATION=true`, `PILOT_MODE=false`, `DEMO_MODE=false`; `AUTH_ALLOWED_ORIGINS` is empty (`.env.example:30`), so Server Actions accept same-origin only and the proxy allowlist is `APP_URL`.

What could not be checked statically:

- How the real edge (Cloudflare in front of Render, per the brief; the repo docs never mention Cloudflare for production) rewrites `X-Forwarded-For`, `X-Forwarded-Host` and `CF-Connecting-IP`. F1 is verified in code and marked SUSPECTED for the exact production header chain.
- Runtime values of `APP_URL`, secrets, Postgres role grants (`jitm_runtime`), and whether the worker actually runs the retention pass.
- Next.js internals ordering of `proxy.ts` versus Server Action decoding (the matcher covers every path except `_next/static|_next/image`; treated as VERIFIED for coverage, framework ordering per docs).

## Findings (ranked, most exploitable first)

### F1. Rate limits and audit IPs trust the first `X-Forwarded-For` hop, which the client controls

- Severity: P1
- Status: VERIFIED (code path) / SUSPECTED (exact production header chain)
- Evidence:
  - `src/lib/request-context.ts:16-21` — `ipAddress` is `firstForwardedAddress(x-forwarded-for) ?? cf-connecting-ip ?? x-real-ip`. The first XFF element is whatever the client sent; both Cloudflare and Render append the true peer to the chain rather than replacing it, and `CF-Connecting-IP` (trustworthy behind Cloudflare) is only consulted when XFF is absent.
  - Every IP-keyed limiter uses this value: `auth-actions.ts:73` (register 8/h), `:130` (login 30/15 min), `:159` (magic 12/h), `:203` (verify resend 10/h), `:225` (reset request 20/h), `:259` (reset consume 12/h), `:186` (demo); `api/auth/verify-email/route.ts:16-22` (30/h); `lead-form-actions.ts:14` (10/h per connection+IP); `waitlist-actions.ts:27,72`; `invitation-preference-actions.ts:95,115`; `staff-invitation-actions.ts:48`; `api/reviews/[token]/route.ts:13` (token+IP); admin MFA verify `admin-mfa-actions.ts:21-29` (user+IP).
  - Every distinct spoofed value creates a new `AuthRateLimit` row (`rate-limit.ts:24-33`); rows are only deleted per key (`rate-limit.ts:108`) and no retention pass touches the table (grep of `operational-retention.ts`, `data-retention.ts`, `worker/index.ts`: no matches).
  - The same value is stored as `Session.ipAddress` (`auth.ts:49`) and HMAC-hashed into `JumpActionEvent.metadata` (`api/jumps/[jumpId]/actions/route.ts:20-26`), so device/session forensics can be poisoned.
- Failure scenario:
  1. Credential stuffing: with `X-Forwarded-For: 10.0.0.<n>` rotated per request, `auth.login.ip` never trips; only the per-email 10/15 min cap remains, so an attacker can test 10 passwords per known email per 15 minutes across an unlimited number of emails.
  2. Auth-email budget exhaustion: `auth.magic.email` and `auth.reset.request.email` allow 5/h each per address (`auth-actions.ts:160,226`), and AUTH email draws from the same 90/day total (`email-budget.ts:17-21,42-49`; `env.ts:278-306` defaults 90/day with 20 reserved *for* AUTH). Nine known addresses × 10 requests exhaust the day's budget; registration then fails with "Account verification is temporarily unavailable" and password resets stop for everyone.
  3. Table bloat: 100k requests with unique XFF values = 100k `AuthRateLimit` rows that are never removed.
- Fix: derive the client IP from a configured trusted source, never the first XFF element. Add `TRUSTED_CLIENT_IP_HEADER` (set to `cf-connecting-ip` for the Cloudflare→Render topology) and/or `TRUSTED_PROXY_HOPS` (take the n-th element from the *right* of XFF); default in production to the right-most element when neither is set. Add a global (identifier-free) budget for auth email requests per hour, and a periodic `authRateLimit.deleteMany` for rows whose window is older than 24 h and are not blocked. Files: `src/lib/request-context.ts`, `src/lib/env.ts` (+ `productionConfigurationIssues`), `src/lib/operational-retention.ts`, `docs/HOSTED_DEPLOYMENT.md`.
- Effort: M; Risk: low (config-driven, falls back to current behaviour in dev); Needs migration: no; Needs owner decision: yes (which header the edge guarantees; whether to add Turnstile on public auth forms).
- Tests: unit test `getRequestMetadata` with `x-forwarded-for: 1.1.1.1, 203.0.113.9` + `cf-connecting-ip: 203.0.113.9` → `203.0.113.9`; integration test that two login attempts with different spoofed XFF share one bucket; a test that the retention pass removes stale `AuthRateLimit` rows; a `hosted-deployment-boundary` assertion that production refuses to start without a trusted-IP setting.

### F2. Any account can hide a competitor's Marketplace share instantly with one report

- Severity: P1 (abuse; released today in `91e5aad`)
- Status: VERIFIED
- Evidence:
  - `src/lib/marketplace.ts:6-9` — `PRIVATE_INFO`, `OFFENSIVE`, `SPAM` are `autoHide: true`.
  - `src/lib/marketplace-service.ts:220-233` — `reportListing` requires only an authenticated workspace owner; a single report with an auto-hide reason sets the listing to `HIDDEN` immediately. The only checks are "not your own listing" and one report per reporter per listing.
  - `src/lib/marketplace-actions.ts:56` — limiter is 10 reports per hour per workspace, so one account can hide up to 10 listings per hour.
  - `marketplace-service.ts:56` — while `HIDDEN` the author cannot re-share; only staff with `mixes.publish` can restore (`reviewListing`, `marketplace-actions.ts:73`). There is no author appeal path and no SLA.
  - `marketplace-service.ts:171` — the reporter's free-text `details` (up to 1,000 chars) is shown to the author before staff review; combined with the auto-email (`notifyAuthor`) this is a harassment channel.
- Failure scenario: a competitor creates one invited account, files "SPAM" reports against the ten most popular listings in the trade every hour; all disappear from the directory within seconds and stay hidden until a staff member with `mixes.publish` reviews them. Repeat with a second account the next hour.
- Fix: keep "hide from the reporter and queue for staff" as the default; auto-hide only when (a) the reason is `PRIVATE_INFO` *and* the automatic PII scan (`tests/marketplace.test.ts` already covers a detector) agrees, or (b) at least N distinct reporter workspaces (N=3) agree within 24 h. Cap auto-hides per reporter per day (2), record the reporter's account age in the platform audit event, do not surface reporter free text to the author until a staff decision, and rate-limit `report` per *target* listing as well. Files: `marketplace-service.ts` (`reportListing`, `readMarketplaceItem`), `marketplace.ts`.
- Effort: M; Risk: low; Needs migration: no (thresholds computed from existing `MarketplaceReport` rows); Needs owner decision: yes (moderation policy).
- Tests: integration test that one `SPAM` report from a fresh account leaves the listing `LIVE` and queued; that three distinct reporters hide it; that a reporter's `details` are not in the author's `readMarketplaceItem` result while `status: OPEN`; e2e update of `e2e/marketplace.spec.ts:38`.

### F3. Fifty-one pages render arbitrary URL text inside the product's error banner

- Severity: P2 (content spoofing / phishing lure; no XSS because React escapes)
- Status: VERIFIED
- Evidence: the pattern `{params.error && <Notice type="error">{params.error}</Notice>}` appears in 51 page files (full list in the appendix), including the public `login/page.tsx:45`, `register/page.tsx:41`, `forgot-password`, `reset-password`, `waitlist/page.tsx`, `waitlist/leave`, `verify-email/pending` and `staff/accept/page.tsx:18`. The producers are the `fail()` helpers that redirect with `?error=<free text>` (`auth-actions.ts:28-32`, `contact-actions.ts:26-28`, `admin-navigation.ts:537-541`, etc.).
- Failure scenario: `https://jumpinthemix.com/login?error=Your+account+is+suspended.+Call+%2B1-800-...+to+verify+your+card` renders the attacker's sentence in the trusted red banner above the real sign-in form; the link is on the legitimate origin, so mail filters and users accept it.
- Fix (one code change, mechanical across pages): stop carrying prose in the URL. Introduce `src/lib/form-errors.ts` → `FORM_ERROR_CODES` (a `Record<code, message>` populated from the existing strings), make `fail()`/`adminActionDestination()` emit `?error=<code>`, and replace the 51 inline banners with `<UrlErrorNotice code={params.error} />` that renders the message for a known code and a fixed generic sentence otherwise. Where a message must stay dynamic (a few admin flows echo service messages), sign it: `error=<msg>&sig=HMAC(authRateLimitSecret, msg)` and have `UrlErrorNotice` verify before rendering. Forms that already use `useActionState` (`*FormAction` wrappers in `auth-actions.ts:339-349`) carry the message in-band and need no URL at all.
- Effort: M (roughly 60 producers, 51 consumers, no schema); Risk: low; Needs migration: no; Needs owner decision: no.
- Tests: unit test `UrlErrorNotice` rejects unknown text; e2e `visit /login?error=<lure>` shows the generic message; keep the existing form-error e2e assertions by asserting on codes.

### F4. Per-email auth throttles let anyone lock password sign-in and mail-bomb a target

- Severity: P2 (abuse; compounds F1)
- Status: VERIFIED
- Evidence: `auth-actions.ts:131` — 10 failed passwords per email per 15 min then a 30-minute block, regardless of source; `auth-actions.ts:160,226` — 5 magic-link and 5 reset emails per hour per address, each producing a real email (`sendMagicLoginEmail`, `sendPasswordResetEmail`); `auth-actions.ts:204` — 4 verification resends per hour. No CAPTCHA/proof-of-work anywhere (`grep -ri turnstile|captcha src` → none).
- Failure scenario: an attacker who knows a customer's email keeps password login blocked indefinitely (10 bad attempts every 15 min) while sending the victim up to 14 legitimate-looking emails per hour; at scale this also drains the shared 90/day email budget (see F1 scenario 2).
- Fix: on the email limiter, degrade to a step-up (Turnstile challenge or "confirm via email") instead of a hard block; cap auth emails per recipient per 24 h (e.g., 3 magic + 3 reset), and add an alert when AUTH email use exceeds, say, 50% of the daily reserve. Files: `auth-actions.ts`, `rate-limit.ts` (add a `challenge` decision), `operations-signals.ts` (alert).
- Effort: M; Risk: low; Needs migration: no; Needs owner decision: yes (adding a challenge provider).
- Tests: integration test that the 11th failed login for an email returns a challenge rather than a block; that per-recipient daily auth-email cap holds across magic and reset scopes.

### F5. Anonymous lead-form submissions append text to existing contacts and drive their journey

- Severity: P2 (abuse resistance)
- Status: VERIFIED
- Evidence: `src/lib/lead-form-actions.ts:12-20` — the public hosted form only needs the connection id (a cuid published on the business's website). `src/lib/intake.ts:29-36` matches the submission to existing contacts by email or phone; `intake.ts:38-51` then appends a `SYSTEM` activity containing the submitter's 4,000-char `message` to that contact and calls `applyJourneyEvent(... CONTACT_RECEIVED ...)`, which can transition the contact's journey stage and start automatic follow-ups configured for that event. Only two or more matches, or an archived match, route to `REVIEW` (`intake.ts:70`). Limits: 10/h per connection+IP (spoofable, F1) and 300/h per connection (`lead-form-actions.ts:14-17`).
- Failure scenario: knowing a customer's email, an outsider posts "New inquiry" notes into that customer's timeline and re-triggers `CONTACT_RECEIVED` journey rules; with automatic sending enabled, the business's own outbound sequence can be restarted toward that person.
- Fix: for `publicForm` submissions that match an *existing* contact, create the receipt in `REVIEW` (owner confirms) instead of auto-accepting; never fire journey events from unauthenticated sources without review; add Turnstile to the hosted form; include the honeypot already present. Files: `intake.ts` (`receiveIntake`), `PublicLeadForm.tsx`.
- Effort: S–M; Risk: low; Needs migration: no; Needs owner decision: yes (review-first behaviour changes the product flow).
- Tests: integration test that a public submission matching an existing contact lands in `REVIEW` and creates no `JourneyEvent`; API-key intake keeps current behaviour.

### F6. Imported and Marketplace content bypasses the editor's placeholder rules and lands as ACTIVE

- Severity: P2 (hardening; render-time guard currently prevents a leak)
- Status: VERIFIED
- Evidence: `src/lib/mega-mix-pipeline-service.ts:133-155` (`installPortable`, used by file import and `addFromMarketplace`) creates step versions straight from the package with no `findUnknownPlaceholders`/`containsPrivateNotesPlaceholder` check and sets `status: "ACTIVE"` (`:143`). The editor, shared-mix import, quick capture and bulk paths all enforce "private-note placeholders only in phone-call beats" (`mix-editor-actions.ts:60,92`, `shared-mix.ts:162`, `quick-capture.ts:81`, `bulk-contact-actions.ts:121`). The only thing stopping `{{Private Notes}}` in a shared email beat from rendering the *importer's* private notes to their customer is `jump-render.ts:73` (`channel === "PHONE_CALL" ? contact.privateNotes : ""`).
- Failure scenario: an author crafts a portable JSON with `{{Private Notes}}` in an EMAIL beat, imports it (no validation), shares it; importers get an ACTIVE mix whose safety depends solely on one renderer line. A future variant/channel change that forgets that line becomes a private-data leak.
- Fix: run the same validator over every imported beat/variant (`validateStepContent` from the editor) inside `installPortable`, reject unknown placeholders, and create imports as `DRAFT` (owner decision) so the "Review the wording" checkbox is backed by a real review step. Add a unit test pinning `jump-render.ts:73`.
- Effort: S; Risk: low; Needs migration: no; Needs owner decision: yes (DRAFT vs ACTIVE on import).
- Tests: unit test that `installPortable` rejects `{{Private Notes}}` outside `PHONE_CALL`; renderer test that EMAIL/SMS never substitute private notes.

### F7. Support "view-only" sessions can still download the customer's Mix and Mega-Mix files

- Severity: P2 (PII exposure to a role that is meant to be read-on-screen only)
- Status: VERIFIED
- Evidence: `src/app/api/mixes/[mixId]/export/route.ts:10-13` and `src/app/api/mega-mixes/[pipelineId]/export/route.ts:10-13` call `requireWorkspace()` and never check `impersonation`; they are GETs so `proxy.ts:68-72` (which only blocks unsafe methods) does not apply. Compare `api/account/export/route.ts:12` and `api/calendar/export/route.ts:7`, which refuse during a support session. `docs/SUPPORT_CASE_ACCESS.md` states "sensitive account/export/actions retain their own checks".
- Failure scenario: a support agent with `support.view_customer` opens a case, starts the view, and downloads the customer's authored wording as JSON files; the read receipt records a page read, not a file export.
- Fix: add `if (impersonation) return 403` to both export routes; add a shared `requireWritableWorkspace()` (throws on `impersonation`) and use it in the mutating server actions that currently rely only on the proxy cookie check (`contact-actions.ts`, `group-actions.ts`, `custom-field-actions.ts`, `date-type-actions.ts`, `snooze-actions.ts`, `mix-stop-actions.ts`, `onboarding-actions.ts` — grep in appendix). Defence in depth: the proxy gate depends on the impersonation cookie being present on the request.
- Effort: S; Risk: low; Needs migration: no; Needs owner decision: no.
- Tests: extend `tests/route-authorization.test.ts:45` ("blocks every impersonated browser mutation") with the two GET export routes; unit test for `requireWritableWorkspace`.

### F8. Magic-link and verification tokens are consumed by a GET

- Severity: P2 (hardening)
- Status: VERIFIED
- Evidence: `src/app/api/auth/magic/route.ts:10-32` and `src/app/api/auth/verify-email/route.ts:13-62` claim the single-use token and create a session on a plain GET. The waitlist and opt-out flows already use the safer pattern (`waitlist/confirm/page.tsx:12`, `waitlist/leave/page.tsx:22`: GET shows a button, POST consumes).
- Failure scenario: corporate mail scanners and link previewers open the link, burning the one-time token (user sees "already used") and, for magic links, receiving a session cookie they discard; a shared-device autocomplete or referer leak reuses nothing because the token is spent, but the user experience and audit trail degrade.
- Fix: serve an interstitial page on GET (`/auth/magic?token=` renders "Continue signing in" with a POST form; same for verify-email); keep the API route for POST only. Effort: S–M; Risk: low; Needs migration: no; Needs owner decision: no.
- Tests: e2e that a GET does not consume the token; existing `auth-security.test.ts:24` token tests unchanged.

### F9. Redirect targets for the support-view endpoints are built from `X-Forwarded-Host`

- Severity: P2 (hardening; exploitability negligible)
- Status: VERIFIED
- Evidence: `src/lib/request-url.ts:7-20` prefers `x-forwarded-host`/`host`; used by `api/admin/impersonation/start/route.ts:10,32` and `api/admin/impersonation/end/route.ts:23` for 303 `Location` headers. `verify-email` uses `env.appUrl` instead (`route.ts:10`).
- Failure scenario: only an authenticated staff POST that passed the origin check reaches these lines, so an attacker cannot make a victim follow a foreign `Location`; the risk is a misconfigured edge forwarding a client-supplied host.
- Fix: build these URLs from `env.appUrl` like the other auth routes; delete `requestPublicOrigin`. Effort: S; Risk: low; Needs migration: no; Needs owner decision: no.
- Tests: unit test that the redirect origin equals `APP_URL` regardless of forwarded headers.

### F10. Unbounded anonymous row creation on OAuth start and push subscriptions

- Severity: P2 (resource abuse)
- Status: VERIFIED
- Evidence: `src/app/api/auth/oauth/{google,apple}/start/route.ts` → `social-auth.ts:49-61` inserts an `AuthOAuthState` row per anonymous GET with no rate limit (expired rows are purged only on the next call, `:50`, and TTL is 10 min). `api/notifications/subscribe/route.ts:26-45` upserts a `PushSubscription` per distinct endpoint with no per-user cap.
- Failure scenario: a scripted loop against `/api/auth/oauth/google/start` writes tens of thousands of rows per minute on the 5 GB plan; the cleanup runs only inside the same hot path.
- Fix: rate-limit both starts by IP (after F1) and globally (e.g., 600/min), cap push subscriptions per user (e.g., 20, evicting the oldest), and add `AuthOAuthState` to the retention pass. Effort: S; Risk: low; Needs migration: no; Needs owner decision: no.
- Tests: integration test for the caps.

## Checked and fine

- CSRF: `proxy.ts:43-66` requires `Origin` ∈ {`APP_URL`, `AUTH_ALLOWED_ORIGINS`} (or same-origin/same-site/none Fetch-Metadata when Origin is absent) for every non-GET/HEAD/OPTIONS request on every path except `_next/static|_next/image`; Server Actions additionally get Next's own Origin/Host check (`next.config.ts:219-223`, `allowedOrigins` empty → same-origin only). Exceptions are Apple `form_post` (`:48-52`) and webhooks (signature/token verified).
- Session cookies: 32 random bytes, SHA-256 at rest, `httpOnly`, `SameSite=Strict`, `Secure` in production, 14-day expiry, cap of 10 per user, rotation on password change, all sessions revoked on reset/suspend (`auth.ts:28-139`, `env.ts:249-259`).
- Password policy and comparison: bcrypt cost 12, ≥12 chars, ≤72 bytes, dummy-hash compare for unknown emails (`password-policy.ts`, `auth-actions.ts:22,134`).
- One-time tokens (verify, reset, magic, waitlist, opt-out): 32 random bytes, hashed, previous token invalidated on issue, conditional `updateMany` claim, TTLs 24 h/60 min/15 min (`auth-tokens.ts`, `auth-actions.ts:273-283`, `api/auth/magic/route.ts:16-21`).
- OAuth: random hashed single-use `state`, PKCE S256, nonce compared timing-safe, JWKS-verified `iss`/`aud`, `email_verified` required; auto-link to an existing account by verified email is standard practice (`social-auth.ts:43-171`). Suspended users cannot obtain sessions via any path (`auth.ts:37-38`).
- Admin MFA: AES-256-GCM secret, ±1 step window, last-counter replay guard, HMAC'd recovery codes removed atomically, step-up ≤10 min for destructive staff/user/admission/library/email operations, MFA state cleared on password events (`admin-mfa.ts`, `totp.ts`, `user-admin.ts:36`, `staff-invitations.ts:30`, `admission-admin.ts`).
- Impersonation: grant bound to actor user + actor session + assigned active ticket + requester membership, 30-min expiry, re-validated on every request under the staff lock, audited start/end/read receipts, staff identity kept as `authUser`, `(staff)` layout refuses while impersonating (`impersonation.ts`, `auth.ts:179-201,235`).
- Staff permissions: every `(staff)` page and every admin action names its permission (appendix); `staff.manage` is owner-only even if forged (`admin-permissions.ts:121`); invitations cannot offer OWNER or `staff.manage`, are recipient-bound, re-validated at acceptance, and cannot attach to existing accounts (`staff-invitations.ts:39-40,105-109`); last-owner protections (`staff-access.ts:59-61`, `account-deletion.ts:42-44`); report downloads are bound to the requesting session and encrypted (`report-exports.ts:88-99`).
- Tenant isolation: all customer routes derive `workspaceId` from `session.user.memberships[0]`; every request-supplied id I traced is looked up with `workspaceId` first (`workspace-repository.ts`, `contact-actions.ts:244`, `contact-state-actions.ts:21`, `onboarding-actions.ts:48`, `intake-actions.ts:22`, `mix-workflow.ts:108-113`, `jump-drafts.ts:138`, `quick-capture.ts:47`, `mix-start-eligibility.ts:5-12`, `calendar-actions.ts:66,80-82`, `appointment-bindings.ts:167,182`, `contact-import-jobs.ts:145-162`, `support-service.ts` requester functions, `marketplace-service.ts:69,161,265`). `tests/server-action-auth-guard.test.ts:34` enforces `requireWorkspace` in every tenant action file.
- Raw SQL: all `$queryRaw`/`$executeRaw` use tagged templates or `Prisma.sql`/`Prisma.join`; the single `$queryRawUnsafe` runs a constant string (`database-release.ts:20`, `recovery-hold-query.mjs`) and the one `Prisma.raw` identifier is regex-validated (`database-release.ts:14,25`).
- Search: `quiet-days.ts:19` escapes `%`/`_`; `journey-roster.ts:23`, `recipient-search`, marketplace `contains` do not, but all are workspace-scoped (broad-match only, no data exposure).
- Input schemas: contact import is strict zod with 12 MB body, 5,000 rows, 100-record match batches, CSV/VCF parsed in the browser (`ContactImportWizardV2.tsx`); quick-add strict; workflow `configure` (`z.unknown()`) is normalised and validated by `workflowConfiguration`+`validateWorkflow` (`mix-workflow.ts:42-44`); push subscription `.passthrough()` only affects ignored keys; portable packages are strict with size caps (`mix-portable.ts:12-37`).
- Email/SMS injection: all HTML is `escapeHtml`'d (`automatic-delivery.ts:79`, `auth-email.ts`, `support-email.ts`, `notification-delivery.ts`, `marketplace-service.ts:247`); Resend is a JSON API and Twilio form-encoded, so header injection is not possible; `sms:`/`mailto:` bodies are `encodeURIComponent`'d (`review-request/route.ts:51-52`).
- Open redirects: `customerReturnPath` allowlists in-app prefixes and rejects control chars (`customer-return-path.ts`); `safeAdminReturnTo` restricts to `/admin`; local `safeReturnTo` helpers only accept `/jumps…`/`/contacts/<id>`; public-review redirect only follows an owner-configured `https:` `reviewUrl` (`public-review/route.ts:12-13`, `workspace-profile-actions.ts:20-34`).
- Headers/CSP: nonce + `strict-dynamic`, no `unsafe-eval` in production, `object-src 'none'`, `frame-ancestors 'none'`, `form-action 'self'`, HSTS 1 y + subdomains, COOP/CORP, Referrer-Policy, Permissions-Policy; only two `dangerouslySetInnerHTML` uses, both constant/escaped (`layout.tsx:46`, `StructuredData.tsx:4`). No `NEXT_PUBLIC_` variables; no console output of tokens/PII (grep).
- Webhooks: Resend verified with svix (timestamp+signature), 64 KB cap, event-id idempotency; intake API needs the hashed `X-JITM-Key`, 24 KB cap, 60/min per connection, JSON only.
- SSRF: calendar subscriptions are HTTPS-only, DNS-resolved once, private/reserved ranges blocked, IP pinned for the TLS request, 1 MB, 10 s, ≤2 redirects (`calendar-feed-fetch.ts`).
- Token entropy/revocation: calendar feed, intake key, review, referral, staff-invite and impersonation tokens are all 32 random bytes hashed at rest with rotate/revoke paths; review requests expire after 30 days and accept one response.
- Account export: scoped to the workspace and the requesting user; excludes hashes, session/push/calendar/invite secrets; "reports received" omit the reporter as documented (`api/account/export/route.ts:73-74,155`).
- Account deletion: re-authentication (password, or a session younger than 5 min for password-less accounts), exact phrase, 5/h limit, one transaction, workspace cascade removes listings/favorites/imports/reports-on-own-listings, last-owner guard (`account-deletion-actions.ts`, `account-deletion.ts`).
- Worker/Netlify handoff: constant-time Bearer check, ≥32-char secret, HTTPS origin only (`worker-request.ts`, `worker-dispatch.ts:8-17`).

## Docs vs code mismatches

1. Root `SECURITY.md:3` still describes "an early single-user, self-hosted release candidate… No hosted service" while the code and `render.yaml` run a hosted multi-tenant SaaS with a Marketplace. Replace with a pointer to `docs/SECURITY.md` and a real disclosure address.
2. `docs/SECURITY.md` §Authentication: "sign-in, registration, and authenticated mutations are database-rate-limited" — true, but the IP dimension is client-controlled (F1) and nothing documents which proxy header is trusted; `docs/HOSTED_DEPLOYMENT.md` and `render.yaml` never mention `AUTH_ALLOWED_ORIGINS`, a trusted-IP header, or Cloudflare.
3. `docs/SUPPORT_CASE_ACCESS.md` ("sensitive account/export/actions retain their own checks") and `docs/SECURITY.md` ("support views… are read-only") — Mix and Mega-Mix JSON exports are downloadable during a view (F7).
4. `docs/SECURITY.md` §Data protection: "Account deletion… deletes owned data transactionally" — `MarketplaceReport` rows *authored* by the deleted account (with their free-text `details` and `reporterUserId`) survive because the model has no relation to `User`/`Workspace` (`prisma/marketplace.prisma:100-120`); `docs/DATA_RETENTION.md` has no rule for `MarketplaceReport` or `AuthRateLimit`.
5. `docs/ADMIN_MFA.md` §Storage and audit: "Enrollment and verification events are written to the workspace audit log" — `admin-mfa-actions.ts:40-53` writes the platform event always but the workspace `auditLog` only when the staff member has a customer workspace; staff-only accounts (the normal case after `STAFF_ACCESS.md`) get no workspace entry. Wording should say platform audit.
6. `docs/MARKETPLACE_AND_NUMBERING_2026-09-24.md`/`docs/SECURITY.md` do not describe the report-and-hide moderation model or its abuse limits (F2); the export inventory correctly says reports received omit the reporter.
7. `docs/SECURITY.md` §Browser boundary: "Unsafe browser requests must be same-origin or come from an explicitly allowed origin" — accurate; note that `sec-fetch-site: same-site` is also accepted when `Origin` is absent (`proxy.ts:59`), so any future sibling subdomain would be trusted.
8. `docs/ACCOUNT_EXPORT_INVENTORY` says CalendarPreference is excluded because it "contains only subscription credentials" — correct; but the JSON does include the staff `reviewNote` on reports received (`export/route.ts:74`), which the inventory does not mention. Harmless, but state it.

## Appendix: route and action coverage table

Legend — Auth: `session` = `getCurrentSession()` + membership, `workspace` = `requireWorkspace()`, `admin(p)` = `requirePlatformAdmin(p)` (+MFA in prod), `token` = public capability token, `public` = none. Scope: whether every request-keyed query is constrained by the session's `workspaceId` (or a verified token). Imp: behaviour during a support view (`block` = explicit 403, `proxy` = only the proxy's unsafe-method gate, `read` = allowed read). CSRF: `proxy` = `proxy.ts` Origin allowlist (all unsafe methods); `n/a` for GET. RL = rate limit.

### Route handlers (`src/app/api/**`)

| Route | Methods | Auth | Scope | Role/permission | Imp | CSRF | RL |
|---|---|---|---|---|---|---|---|
| account/export | GET | workspace | yes (workspace+user) | – | block | n/a | none |
| admin/browser-context | GET | session (optional) | n/a | staff ACTIVE | n/a | n/a | none |
| admin/impersonation/end | POST | session (optional) | token bound to actor | – | (ends view) | proxy (+`Origin: null` same-origin exception) | none |
| admin/impersonation/start | POST | admin(support.manage, support.view_customer) | ticket-derived | yes | n/a | proxy | 10/5 min per admin |
| admin/reports/exports/[exportId] | GET | admin(reports.read) | actor session bound | yes | n/a | n/a | 20/min |
| auth/browser-context | GET | session (optional) | n/a | – | read | n/a | none |
| auth/magic | GET | token (single-use) | token | – | n/a | n/a (F8) | none |
| auth/oauth/apple/start, google/start | GET | public | n/a | – | n/a | n/a | none (F10) |
| auth/oauth/apple/callback | GET, POST | state token | state | – | n/a | proxy (Apple origin allowed) | none |
| auth/oauth/google/callback | GET | state token | state | – | n/a | n/a | none |
| auth/verify-email | GET | token | token | – | n/a | n/a (F8) | 30/h per IP (F1) |
| calendar/availability | GET | session | yes | – | read | n/a | 120/min |
| calendar/export | GET | workspace | yes | – | block | n/a | none |
| calendar/feed/[token] | GET | token (43-char, hashed) | via token | – | n/a | n/a | none |
| contacts/audience | GET | session | yes | – | read | n/a | none |
| contacts/[contactId]/activity | GET, POST, PATCH | session | yes | – | POST/PATCH block | proxy | 60/min (POST, PATCH) |
| contacts/[contactId]/review-request | POST | session | yes | – | block | proxy | 20/day |
| contacts/import | GET, POST, DELETE | session | yes | – | block (all) | proxy | 240/h; 12 MB |
| contacts/quick-add | POST | session | yes | – | block | proxy | 40/h |
| contacts/recipient-search | GET | session | yes | – | read | n/a | none |
| follow-ups/preparation | GET, POST | session | yes | – | POST block | proxy | POST 3/5 min |
| health/live, ready, monitor, worker, recovery-boundary | GET | public | n/a | – | n/a | n/a | none |
| jumps/[jumpId]/actions | POST | session | yes | – | block | proxy | 120/min |
| jumps/[jumpId]/attempts | POST | session | yes | – | block | proxy | 120/min; 64 KB |
| jumps/[jumpId]/completed-at | PATCH | session | yes | – | block | proxy | 60/min |
| jumps/[jumpId]/draft | GET, PUT, DELETE | session | yes | – | block (all) | proxy | 240/min; 64 KB |
| jumps/[jumpId]/outcome | POST | session | yes | – | block | proxy | 90/min |
| jumps/[jumpId]/variant | PATCH | session | yes | – | block | proxy | 120/min; 4 KB |
| marketplace/favorites | POST | session | listing must be LIVE | – | block | proxy | 90/min; 1 KB |
| mega-mixes/[pipelineId]/export | GET | workspace | yes | – | **read (F7)** | n/a | none |
| mixes/favorites | POST | session | yes | – | block | proxy | 90/min |
| mixes/[mixId]/export | GET | workspace | yes | – | **read (F7)** | n/a | none |
| mixes/schedule-preview | POST | session | yes (prefs only) | – | read | proxy | none; 30 KB |
| mix-workflow | GET, POST | session | yes | – | POST block | proxy | POST 90/min; 1 MB |
| notifications/subscribe | GET, POST, DELETE | session + browser-scope header | yes (user+session) | – | block | proxy | none (F10) |
| notifications/test | POST | session + browser-scope | yes | – | block | proxy | 5/min |
| onboarding/preview | GET | session | n/a (static) | – | read | n/a | none |
| quick-capture | GET, POST | session | yes | – | POST block | proxy | 60/h |
| quiet-days | GET, POST | session | yes | – | POST block | proxy | 60/min |
| reviews/[token] | POST | token | token | – | n/a | proxy | 10/h per token+IP |
| reviews/[token]/public-review, refer | GET | token | token | – | n/a | n/a (side effect: click marks) | none |
| settings/sending-preview | GET | session | yes | – | read | n/a | none |
| webhooks/intake/[connectionId] | POST | `X-JITM-Key` (hashed) | connection | – | n/a | exempt (token) | 60/min per connection; 24 KB |
| webhooks/resend | POST | svix signature | n/a | – | n/a | exempt (signature) | none; 64 KB |

### Server action files (`grep -rln '"use server"' src`)

CSRF for every action = Next Server Action Origin/Host check + `proxy.ts`. Scope = every request id constrained by `workspaceId`/actor as noted.

| File | Auth | Scope | Role/permission | Imp | RL |
|---|---|---|---|---|---|
| access-admin-actions | admin(access.read + access.revoke/jobs.retry) | platform | yes, rechecked in tx | n/a | none |
| admission-admin-actions | admin identity + settings.manage | platform | yes; password + MFA ≤10 min in service | n/a | 10/15 min |
| user-admin-actions | admin(users.read + users.suspend/sessions.revoke) | platform | yes; password + MFA ≤10 min | n/a | 10/15 min |
| staff-actions | admin(staff.manage) | platform | owner-only; password + MFA ≤10 min | n/a | 10/15 min |
| staff-invitation-actions | admin(staff.manage) / public accept | platform / token+email | owner; no OWNER offers | n/a | 10–15/15 min; accept 10/h IP + 5/h token |
| support-admin-actions | admin(support.manage) | ticket | yes, rechecked in tx | n/a | 40/5 min |
| admin-operations-actions | admin(jobs.retry) | platform | yes | n/a | 20/5 min |
| admin-settings-actions | admin(settings.manage) | platform | yes | n/a | none |
| report-actions | admin(reports.read) | actor session | yes | n/a | 20/5 min |
| shared-mix-admin-actions | admin(mixes.edit / +mixes.publish) | platform | yes; publish needs password+MFA | n/a | 30 & 10/15 min |
| system-mix-admin-actions | admin(mixes.edit / +mixes.publish) | platform | yes | n/a | 30 & 10/15 min |
| waitlist-admin-actions | admin(waitlist.read + waitlist.manage/waves.pause) | platform | yes, rechecked in tx | n/a | none |
| admin-mfa-actions | admin identity | self | password for enrol | n/a | 10/15 min (user+IP) |
| email-suppression-actions | admin(email.manage) | platform | yes; password + MFA | n/a | 10–20 |
| operations-actions | admin(operations.read + operations.manage) | platform | yes | n/a | 20/5 min |
| auth-actions | public / session | self | – | n/a | per IP (F1) and per email (F4) |
| account-deletion-actions | workspace | self | re-auth (password or fresh session) | block | 5/h |
| account-preference-actions | workspace | yes | – | block | none |
| bulk-contact-actions | workspace | yes | – | block | none |
| calendar-actions | workspace | yes | – | block (context()) | none |
| contact-actions | workspace | yes | – | **proxy only (F7)** | none |
| contact-lifecycle-actions | workspace | yes | – | block | none |
| contact-merge-actions | workspace | yes | – | block | none |
| contact-mix-actions | workspace | yes | – | block | none |
| contact-state-actions | workspace | yes | – | block | none |
| contact-view-actions | workspace | yes (user+workspace) | – | block | none |
| custom-field-actions | workspace | yes | – | proxy only | none |
| date-type-actions | workspace | yes | – | proxy only | none |
| group-actions | workspace | yes | – | proxy only | none |
| important-date-actions | workspace | yes | – | block | none |
| intake-actions | workspace | yes | – | block | none |
| invitation-preference-actions | public | token/email | – | n/a | 10/h IP, 3/day email, 30/h confirm |
| journey-actions | workspace | yes | – | block | none |
| jump-status-actions | workspace | yes | – | block | none |
| lead-form-actions | public | connection id | – | n/a | 10/h conn+IP (F1), 300/h conn (F5) |
| marketplace-actions | workspace (owner asserted in service) / admin(mixes.publish) for review | yes / listing LIVE | owner check; staff review perm | block | report 10/h (F2) |
| mega-mix-actions | workspace | yes | – | block | none |
| mega-mix-pipeline-actions | workspace | yes | owner check in service | block | none |
| mix-editor-actions | workspace | yes | – | block | none |
| mix-lifecycle-actions | workspace | yes | – | block | none |
| mix-stop-actions | workspace | yes | – | proxy only | none |
| notification-actions | workspace | yes | – | block | test 2/h |
| onboarding-actions | workspace | yes | – | proxy only | none |
| shared-mix-actions | workspace | yes | owner check | block | none |
| shared-mix-use-actions | workspace | yes | owner check | block | none |
| snooze-actions | workspace | yes | – | proxy only | none |
| starter-mix-actions | workspace | yes | – | block | none |
| support-actions | workspace | yes (requester) | – | block | 5/h create, 30/h reply |
| system-mix-actions | workspace | yes (owner asserted) | – | block | yes |
| waitlist-actions | public | email | – | n/a | 10/h IP, per-email/day, 30/h confirm |
| workspace-profile-actions | workspace | yes | – | block | none |

### Pages rendering `searchParams.error` verbatim (F3)

`(app)/account`, `(app)/account/preferences`, `(app)/account/tickets/[ticketId]`, `(app)/calendar`, `(app)/contacts`, `(app)/contacts/archived`, `(app)/contacts/[contactId]/edit`, `(app)/contacts/custom-fields`, `(app)/contacts/duplicates`, `(app)/contacts/new`, `(app)/help`, `(app)/jumps`, `(app)/mixes`, `(app)/mixes/new`, `(app)/mixes/system`, `(app)/settings/business`, `(app)/settings/connections`, `(app)/settings/journey`, `(app)/settings/jump-date-types`, `(app)/settings/notifications`, `(app)/settings/sending`, `(app)/templates`, `(app)/templates/[sharedMixId]/use`, `forgot-password`, `login`, `onboarding`, `register`, `reset-password`, `staff/accept`, `verify-email/pending`, `waitlist`, `waitlist/leave`, and 19 `(staff)/admin/**` pages (`access`, `access/[inviteId]`, `admission`, `email/recovery`, `email/recovery/[deliveryId]`, `email/suppressions`, `email/suppressions/[suppressionId]`, `operations`, `operations/alerts`, `reports/exports`, `support`, `support/[ticketId]`, `system-mix`, `team`, `templates/new`, `templates/[sharedMixId]/edit`, `users`, `users/[userId]`, `waitlist`).

## Open questions for the owner

1. Which header does the production edge guarantee for the client IP (`CF-Connecting-IP` if Cloudflare proxies jumpinthemix.com; otherwise the right-most `X-Forwarded-For` hop from Render)? F1 cannot be closed without this.
2. Marketplace moderation policy: is instant hiding on one report intentional for launch, and who staffs `mixes.publish` reviews (F2)? Should reporter free text ever be visible to the author?
3. Should the public lead form auto-attach submissions to existing contacts and fire journey events, or always queue matches for review (F5)?
4. Should imported/Marketplace Mixes start as DRAFT (F6)?
5. Is a bot challenge (Turnstile) acceptable on `/login`, `/register`, `/forgot-password`, the waitlist and the hosted lead form (F1/F4/F5)?
6. Retention: should `MarketplaceReport` rows authored by a deleted account be removed or anonymised, and should `AuthRateLimit`/`AuthOAuthState` be added to the retention pass (docs mismatch 4, F10)?
7. Root `SECURITY.md` disclosure channel: the "Security tab" instruction assumes a public GitHub repo; confirm the intended private reporting address for the hosted product.
