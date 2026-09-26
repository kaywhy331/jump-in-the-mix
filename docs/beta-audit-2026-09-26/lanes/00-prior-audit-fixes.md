# Lane 0 — Status of the 2026-09-24 audit's P0/P1 fixes in production 4b5abd8

> Raw lane report from the read-only lane reviewer, kept as written. The reconciled severities, merged IDs and runtime labels are in [../FINDINGS_TABLE.md](../FINDINGS_TABLE.md), which takes precedence where the two differ.

**Verdict.** No product fix from the 2026-09-24 audit has regressed. 30 of the 40 P0/P1 items are fixed in `4b5abd8`. Each has code that closes the original failure scenario and a named guarding test. None was undone by a later commit, including the unrecorded "D" release `446aadc..4b5abd8`.

The four scale items (OPS-F1, OPS-F3 scale half, OPS-F4) and the staff-only account page (ACC-F3) are open by decision. OPS-F1 is worth measuring before inviting owners with large contact lists.

What has not improved is **process**:
- The production commit `4b5abd8` has never run in CI and has no tag, no pull request and no release record.
- `main` is 267 commits behind.
- No CI run on this code line has ever finished: the browser step hits the 60-minute job cap.
- The last saved local Playwright run before the D deploy ended `failed`.

This lane does not block beta on product grounds. The condition is that the lead's full test run on `4b5abd8` must stand in for the missing CI evidence.

Labels: statements about code are **VERIFIED** (read at `4b5abd8`, quoted below). User-visible behaviour is **INFERRED** until the lead runs the named tests. Nothing was executed except read-only `git` and `gh` queries.

## 1. Status table

| Prior ID | Sev | Title (short) | Status | Fixed in (commit/release) | Decisive evidence (file:line) | Guarding tests |
|---|---|---|---|---|---|---|
| ACC-F1 | P0 | Account deletion leaves imports, reviews, push keys, delivery/preference rows | VERIFIED-FIXED (never orphaned in prod; defence in depth) | `88044e3` (A) → `932a2ac`/`09bcae4` (B relations) | `src/lib/account-deletion.ts:96-104`; `prisma/product-platform.prisma:40,61,108,126,144,168`; `prisma/contact-import-batches.prisma:32` | `tests/account-deletion-orphans.integration.test.ts:107,129`; `tests/account-deletion-schema-guard.test.ts:139,146`; `tests/prisma-relation-guard.test.ts` |
| PRO-F1 | P0 | Releases without CI | REGRESSED (not fixed) | — | `gh`: 4b5abd8 has 0 check-runs; CI on PR #82/#83 cancelled at 60-min cap | none (process) |
| PRO-F2 | P0 | Live code only on an unmerged branch; `main` far behind | REGRESSED (partial: tags to 929f779 only) | tags `prod-2026-09-2x-*` | `gh api .../compare/main...4b5abd8`: ahead 267, main=`4615ade` (09-10); 4b5abd8 untagged, head of `fix/audit-leftovers-20260925` only | none |
| ACC-F2 | P1 | Deleting a staff member erases their replies | VERIFIED-FIXED | `88044e3` (A) | `src/lib/account-deletion.ts:85` | `tests/account-deletion-orphans.integration.test.ts:136` |
| ACC-F3 | P1 | Staff-only accounts have no account page | OPEN-BY-DECISION (downgraded; never scheduled) | — | `src/lib/auth.ts:249`; `src/app/(staff)/layout.tsx:18`; `src/lib/auth-actions.ts:482,508,519` | none |
| ACC-F4 | P1 | "Check acceptance receipt" shown to SUPPORT role | VERIFIED-FIXED | `e40d4b8` (A2) | `src/components/SupportEmailRecovery.tsx:23` | `src/components/SupportEmailRecovery.test.ts:21,37` |
| CON-F1 | P1 | Merge drops Mix stops | VERIFIED-FIXED | `cda30d5` (A) | `src/lib/contact-merge-actions.ts:187-195` | `tests/contact-lifecycle-actions.integration.test.ts:69` |
| CON-F2 | P1 | Import drops Google/Outlook phones & emails silently | VERIFIED-FIXED | `18bb971` (A) | `src/lib/contact-import-mapping.ts:39-40,151-153`; `src/components/ContactImportWizardV2.tsx:303-310,416-419` | `src/lib/contact-import-mapping.test.ts:83,97,110,124,139,171`; `e2e/contact-search-import-jobs.spec.ts:114` |
| CON-F3 | P1 | Phones keyed by format, not number | VERIFIED-FIXED | `c554177` (B1) + `09bcae4` (migration) | `src/lib/phone-number.ts:90-105`; matchers in `contact-actions.ts:244`, `contact-import-service.ts:102,113`, `intake.ts:40`, `contact-duplicate-candidates.ts:34-35` | `tests/phone-number.test.ts:21`; `tests/phone-canonicalization.integration.test.ts:238,264,275`; `e2e/phone-region.spec.ts:51` |
| CON-F4 | P1 | Bulk archive ends Mixes, no Undo | VERIFIED-FIXED | `cda30d5` (A) + `13881f0` (A2 Undo) | `src/lib/bulk-contact-actions.ts:84-107`; `src/lib/contact-lifecycle-actions.ts:85-119` | `tests/contact-lifecycle-actions.integration.test.ts:113`; `tests/contact-bulk-undo.integration.test.ts:74`; `e2e/a2-contacts.spec.ts:48` |
| CON-F5 | P1 | Phone search matches typed digits only | VERIFIED-FIXED | `cda30d5` (A) + `c554177` (B1) | `src/app/(app)/contacts/page.tsx:148`; `src/lib/phone-dial.ts:82-89` | `src/lib/phone-dial.test.ts:62`; `src/app/api/contacts/recipient-search/route.test.ts:24,33`; source check `tests/contact-lifecycle-actions.integration.test.ts:159` |
| CON-F6 | P1 | Archived owner of a number blocks the form, unnamed | VERIFIED-FIXED | `18bb971` (A) | `src/lib/contact-actions.ts:72-86` | `src/lib/contact-actions.test.ts:78,108` |
| CON-F7 | P1 | Two devices: last contact save wins | VERIFIED-FIXED | `13881f0` (A2) | `src/lib/contact-actions.ts:400-409`; `src/lib/contact-revision.ts:35-45` | `src/lib/contact-actions.test.ts:147,159,166`; `tests/contact-save-integrity.integration.test.ts:117` |
| CON-F8 | P1 | Errors not tied to fields; wrong focus | VERIFIED-FIXED | `13881f0` (A2) | `src/components/ContactForm.tsx:100-105` | `e2e/a2-contacts.spec.ts:77`; `src/lib/contact-actions.test.ts:124,132,139` |
| CON-F9 | P1 | Desktop 3-pane leaves focus in the list | VERIFIED-FIXED | `13881f0` (A2) | `src/components/ContactsBulkWorkspace.tsx:100-107,214`; `src/components/ContactProfile.tsx:80` | `e2e/a2-contacts.spec.ts:135` |
| DES-F1 | P1 | "N" shortcut cannot be turned off (WCAG 2.1.4) | VERIFIED-FIXED | `153a083` (A2) | `src/components/QuickAdd.tsx:97-103`; `src/lib/quick-add-shortcut.ts:30-35`; `src/components/Appearance.tsx:71` | `e2e/visual-fitment.spec.ts:301-322`; `src/lib/quick-add-shortcut.test.ts:22,35` |
| DES-F2 | P1 | Phone controls under 44 px | VERIFIED-FIXED | `153a083` (A2) | `src/styles/design-workspaces.css:340`; `src/components/WorkflowJourney.module.css:3`; `src/styles/design-details.css:141`; `src/styles/contacts-workspace.css:21,87,127`; `src/styles/mega-mixes.css:42,48` | `e2e/a2-css-checks.spec.ts:61` |
| DES-F3 | P1 | Today rows 14 px / 32 px / uppercase headers | VERIFIED-FIXED | `153a083` (A2) | `src/styles/design-workspaces.css:215-219,233` | `e2e/a2-css-checks.spec.ts:34` |
| FUN-F1 | P1 | New accounts stay in UTC; no device-timezone detection | VERIFIED-FIXED | `d4327f1` (A) | `src/components/OnboardingForm.tsx:82`; `src/components/MegaMixSetup.tsx:34`; `src/components/TimezonePicker.tsx:74-81` | `e2e/core-flows.spec.ts:118-189` (Denver); `tests/sign-up-funnel.test.ts:31`; `src/components/TimezonePicker.test.ts` |
| FUN-F2 | P1 | `SameSite=Strict` drops email-link/OAuth sign-ins | VERIFIED-FIXED | `d4327f1` (A) | `src/lib/auth.ts:97-105` | `e2e/session-cookie-cross-site.spec.ts:10`; `tests/auth-boundary.test.ts:60-61`; `tests/session-expiry.test.ts:15-29` |
| FUN-F3 | P1 | Invitees cannot use Google/Apple | VERIFIED-FIXED (code; dormant in prod, no provider configured) | `7ca1965` (B) + `09bcae4` | `src/app/register/page.tsx:49`; `src/lib/social-auth.ts:112-113,224-225` | `tests/social-auth-invitation.integration.test.ts:66-143`; `tests/oauth-start-route.test.ts:62`; `e2e/registration.spec.ts:147` (needs `SOCIAL_AUTH_E2E`) |
| FUN-F4 | P1 | Invited email not shown; typo strands the account | VERIFIED-FIXED | `d4327f1` (A) + `7ca1965` (B) | `src/app/register/page.tsx:53-56`; `src/lib/auth-actions.ts:154-157,344`; `src/app/verify-email/pending/page.tsx:48-53` | `tests/register-action.test.ts:68,77`; `tests/auth-abuse.test.ts:212`; `tests/auth-abuse.integration.test.ts:100`; `e2e/registration.spec.ts:56,90,114` |
| MIX-F1 | P1 | Imported date Mixes bind to a duplicate date type | VERIFIED-FIXED | `61dd234` (A) | `src/lib/shared-mix-service.ts:81-88`; `src/lib/mega-mix-pipeline-service.ts:163-168` | `tests/mega-mix-pipelines.integration.test.ts:104` |
| MIX-F2 | P1 | Staff restore republishes a withdrawn share | VERIFIED-FIXED | `61dd234` (A) | `src/lib/marketplace-service.ts:408` | `tests/marketplace.integration.test.ts:152`; `tests/marketplace-archive.integration.test.ts:74` |
| MIX-F3 | P1 | Removing a Mega-Mix erases its hidden share and reports | VERIFIED-FIXED | `61dd234` (A) | `src/lib/mega-mix-pipeline-service.ts:106-121`; `src/components/MegaMixForms.tsx:50-51` | `tests/marketplace.integration.test.ts:180`; `tests/marketplace-archive.integration.test.ts:116` |
| MIX-F4 | P1 | Mix editor: last save wins | VERIFIED-FIXED | `2e2472e` (A2) | `src/lib/mix-editor-actions.ts:121,255-261,379`; `src/components/MixEditor.tsx:184` | `tests/mix-stale-save.integration.test.ts:39,77`; `e2e/mega-mix-pipelines.spec.ts:136` |
| OPS-F1 | P1 | Every workflow instance stores and re-reads the whole workspace definition | OPEN-BY-DECISION (export part fixed) | export: `e40d4b8` (A2), `f12a639` (C-1) | still: `src/lib/workflow-attention.ts:36`; `src/lib/mix-workflow-view.ts:36`; `src/lib/mix-workflow.ts:28` | `tests/account-export-stream.integration.test.ts` (export only) |
| OPS-F2 | P1 | Marketplace reads re-export and write on GET | VERIFIED-FIXED (list; detail still refreshes by decision) | `ee5bb4f` (C-1) | `src/lib/marketplace-service.ts:201-202` (list), `:236` (detail refresh) | `tests/marketplace-refresh.integration.test.ts:96,120,154` |
| OPS-F3 | P1 | 5-min reconciliation: race + sequential lookups | OPEN-BY-DECISION (race half VERIFIED-FIXED) | race: `7a7192e` (A); batching = C-2 (parked) | `src/lib/jump-engine.ts:189,734-737` | `tests/reconciliation-fresh-rows.test.ts:32` |
| OPS-F4 | P1 | Every ACTIVE instance re-evaluated every minute, 50/pass | OPEN-BY-DECISION (C-3 parked) | — | `src/lib/mix-workflow.ts:278,284-285` | none |
| PRO-F3 | P1 | Release procedure not in version control | REGRESSED (not fixed; summary only) | `78ed85e` (AGENTS.md summary) | `.gitignore:26` `.artifacts/`; pipeline only in `.artifacts/market-live-20260924/*.mjs` | none |
| PRO-F4 | P1 | Release records claim runs without saved evidence | REGRESSED (root cause fixed, practice not) | spec header fix `e26fdd4` | D release has no record; last saved D-worktree Playwright run `failed` | none |
| PRO-F5 | P1 | Specs assert removed copy; little run evidence | NOT-VERIFIABLE (named stale strings VERIFIED gone) | `f1064d2`, `b323002`, `d2cfc31`, `5c0c1c7`, `e69bbcb`, `f6636f1` | 9 named strings: 0 hits in `e2e/` | the whole suite: needs the lead's run |
| PRO-F6 | P1 | No tracked production smoke; stale staging gate | REGRESSED (partial) | `f1064d2` (A) | `scripts/production-smoke.mjs:1-18` (GET-only, not wired); `AGENTS.md:13` still Netlify | none |
| PRO-F7 | P1 | Deep-gap items 3/4/6/11/12 and P2 list untested | VERIFIED-FIXED | A, A2, B | see FUN-F3/F4, CON-F7/MIX-F4, CON-F8, CON-F9; `src/app/onboarding/page.tsx:21-25`; `src/lib/contact-actions.ts:286-310` | as for those items |
| SEC-F1 | P1 | Rate limits trust the first `X-Forwarded-For` hop | VERIFIED-FIXED | `ad09784` + `44fdc15` (A) | `src/lib/request-context.ts:22`; `src/lib/client-ip.ts:127-146` | `src/lib/client-ip.test.ts:13-60` |
| SEC-F2 | P1 | One report hides a competitor's share | VERIFIED-FIXED (as decided; residual by decision) | `61dd234` (A) | `src/lib/marketplace.ts:11-33`; `src/lib/marketplace-service.ts:321-324,246` | `tests/marketplace.integration.test.ts:78,104,126,143`; `e2e/marketplace.spec.ts:39` |
| TOD-F1 | P1 | Failed automatic delivery is silent | VERIFIED-FIXED (no retry, by decision) | `7a7192e` (A) | `src/app/(app)/jumps/page.tsx:177-180,293-299,329-332,367`; `src/lib/today-view.ts:44-49` | `src/lib/today-view.test.ts:44,55`; `e2e/automatic-delivery-states.spec.ts:57` |
| TOD-F2 | P1 | Automatic state and send time invisible | VERIFIED-FIXED | `7a7192e` (A) + `416a46f` (A2) | `src/app/(app)/jumps/page.tsx:301,351-353`; `src/components/EditableFollowUpAction.tsx:73-76,431-441` | `src/lib/automatic-delivery-window.test.ts:68-151`; `src/components/EditableFollowUpAction.test.ts:43`; `e2e/automatic-delivery-states.spec.ts:57` |
| TOD-F3 | P1 | New request id per retry → false "no longer pending" | VERIFIED-FIXED | `ed2ff09` (A); e2e realigned `e69bbcb` (D) | `src/components/JumpWorkflow.tsx:108-129,158`; `src/app/api/jumps/[jumpId]/outcome/route.ts:337-343` | `tests/jump-outcome-idempotency.test.ts:37,53,79`; `src/components/JumpWorkflow.test.ts:27`; `e2e/outcome-retry.spec.ts:88,118,149` |

**Counts:**

| Status | Count | Items |
|---|---|---|
| VERIFIED-FIXED | 30 | |
| REGRESSED (not fixed or partial) | 5 | PRO-F1, PRO-F2, PRO-F3, PRO-F4, PRO-F6 |
| NOT-VERIFIABLE | 1 | PRO-F5 |
| OPEN-BY-DECISION | 4 | ACC-F3, OPS-F1, OPS-F3, OPS-F4 |

No product-code item regressed.

**Check that no later commit undid a fix.** For each item I ran `git log --oneline <fix>..4b5abd8 -- <files>` and then read the current code at the cited lines.

Later commits touching the fixed files:
- the known audit releases: B1 `c554177`, B11 `4e602f4`/`fe7001a`/`c25a52e`, C-1 `ee5bb4f`/`7e0030f`/`f031654`, the Today fix `5420684`;
- the D commits `446aadc`, `076b6e4`, `7a05480`.

None of them removed a fix:
- `446aadc` only replaced exact-text error matching with error classes. Its diff to `marketplace-service.ts` changes `throw new Error` into `throw new UserFacingError` and nothing else.
- `7a05480` dropped CSS for classes that no component renders. The one live 44 px rule it touched, `.contact-stage-chip`, was kept: `phone-icons.css:68`.

## 2. Item evidence

### P0

**ACC-F1 — VERIFIED-FIXED.**

The original P0 was wrong; `docs/FULL_AUDIT_2026-09-24.md` §3 records the correction. All seven tables already cascaded through foreign keys written by hand in the migrations:
- `20260722013000…/migration.sql:57` — `FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE`;
- `20260904170000…/migration.sql:55,76,98,115,135`;
- `20260904190000…/migration.sql:24`.

Release A added explicit deletes in `88044e3`. Release B (`932a2ac`) replaced them with schema relations, e.g. `prisma/contact-import-batches.prisma:32` `workspace Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)`. `src/lib/account-deletion.ts:96-99` now says:

> "every such table cascades from Workspace or User through a schema relation (including imports, reviews, devices, deliveries and preferences since Release B)"

The genuine gap, the leaver's Marketplace reports, is handled at `:24-33`: open reports are anonymised, decided ones deleted. `tests/account-deletion-schema-guard.test.ts:146` fails if any model with `workspaceId`/`userId`/`contactId` lacks a cascade path. That is the guard that matters for future tables, so it must run in the lead's vitest pass.

**PRO-F1 — REGRESSED (not fixed).** Beta severity **HIGH** (process; release safety).

Facts from `gh` and `git`, run from the audit checkout:
- `gh api …/commits/<sha>/check-runs`:
  - `4b5abd8`, `929f779`, `34ffdae`, `f511984`, `f3a0a20`, `c17cc80` → `[]`, no runs at all;
  - `7b2fa00` → `validate=cancelled`.
- `gh run list`: the only CI runs on this code line all ended cancelled.
  - PR #82 `7b2fa00` (superseded).
  - PR #82 `1df9fdd`, run 36086712407. The job ran 02:33:22 → 03:33:38. `Browser-driven end-to-end tests cancelled`.
  - PR #83 `a1f64aa`, run 36178561878. The job ran 19:15:31 → 20:15:55, the same step cancelled.
  - That is the job cap: `.github/workflows/ci.yml:20` `timeout-minutes: 60`.
  - Every step before the browser step passed on both runs: typecheck, unit and integration tests, migration rehearsal, build, backup/restore rehearsal, restored-DB isolation. The staff/MFA specs, Lighthouse and image steps after it never ran.
- The code under PR #83 equals `929f779`: `git diff --stat 929f779 a1f64aa` shows docs only.
- The D commits `446aadc..4b5abd8` (47 files, 41 outside `docs/` and `e2e/`) have no pull request and have never been through CI. `4b5abd8` is only the head of `fix/audit-leftovers-20260925` (`gh api …/branches-where-head`).
- Security failed on PR #83 (run 36178561859, job `secret-history`): gitleaks `leaks found: 1` (redacted). The same scan passed on PR #82 at 02:23 and 02:33 UTC. See §5.

Fix direction:
1. Split the browser step into its own job, or shard it, so CI can finish.
2. Open a PR for `fix/audit-leftovers-20260925`.
3. Require a completed run before each deploy.

For this beta decision, the lead's full vitest and Playwright run on `4b5abd8` is the substitute.

**PRO-F2 — REGRESSED (partial).** Beta severity **MEDIUM**.

- `gh api repos/…/branches/main` → `4615ade`, dated `2026-09-10T09:36:22Z`.
- `gh api …/compare/main...4b5abd8` → `status: diverged, ahead_by: 267`.
- `git diff --shortstat origin/main 4b5abd8` → `1307 files changed, 124244 insertions(+), 5441 deletions(-)`.

Improvement since 09-24: annotated tags exist for every production commit through `929f779`, e.g. `refs/tags/prod-2026-09-25-929f779 … tag`. The production commit `4b5abd8` itself is untagged, although `AGENTS.md:17` says "Every deployed commit carries an annotated tag".

Other open work:
- PR #83 ("Bring main up to production (929f779 + release records)", head `a1f64aa`) is open and not merged. It would still leave `main` 9 commits behind production.
- PR #82 is still an open draft.
- 104 remote branches.

Fix direction: tag `4b5abd8`, extend #83 to `4b5abd8` and merge it with a merge commit.

### P1 — account and admin

**ACC-F2 — VERIFIED-FIXED.** `src/lib/account-deletion.ts:84-85`:

> "Only the person's own messages: replies they wrote as staff stay on other people's tickets." — `deleteMany({ where: { authorUserId: userId, authorType: "USER" } })`

No foreign key from `SupportTicketMessage.authorUserId` to `User` could cascade them away. The model has only `ticket … onDelete: Cascade`, and the migrations have no author foreign key.

**ACC-F3 — OPEN-BY-DECISION (downgraded, never scheduled).** Beta severity **LOW-PARKED**.

`src/lib/auth.ts:249` `if (!membership) redirect("/register");` still sends staff-only accounts away from `/account`.
- `src/app/(staff)/layout.tsx:18` links "Your account" only when `user.memberships.length > 0`.
- `changePasswordAction`, `revokeSessionAction` and `signOutOtherSessionsAction` still call `requireWorkspace()` (`src/lib/auth-actions.ts:482,508,519`).
- No staff security page exists (`find src/app -path '*staff*' -name page.tsx` → only `account/admin-mfa`).

Record: the deliberation "re-ranked severities … (… staff-tooling findings to P2 …)" (`docs/FULL_AUDIT_2026-09-24.md:65`). No release plan (§5, A2, B, C) lists it.

It affects staff only, never beta customers. Workaround: password reset closes all sessions (`docs/SECURITY.md:7`).

**ACC-F4 — VERIFIED-FIXED.** `src/components/SupportEmailRecovery.tsx:23`:

```
{canManageEmail && <FormSubmitButton formAction={adminRecoverSupportEmailAction} label="Check acceptance receipt" …/>}
```

`:16` explains the limit to other staff. The caller passes `canManageEmail={permissions.includes("email.manage")}` (`admin/support/[ticketId]/page.tsx:125`). The server still enforces `assertEmailReviewer`.

### P1 — Contacts

**CON-F1 — VERIFIED-FIXED.** `src/lib/contact-merge-actions.ts:188-195` copies each source `mixStop` onto the survivor: `upsert … create: { … contactId: survivor.id … }`. The engine skips stopped assignments (`src/lib/jump-engine.ts:408`). The test asserts the survivor stop exists and that `generateJumps` creates 0 PENDING rows for the stopped Mix (`tests/contact-lifecycle-actions.integration.test.ts:98-100`). That is the original scenario.

**CON-F2 — VERIFIED-FIXED.** Header rules:

- `EMAIL_HEADER = /^(?:(?:work|home|business|personal|primary|main|other) )?e ?mail(?: address)?(?: \d+)?(?: (?:address|value))?$/`
- `PHONE_HEADER = /^(?:(?:mobile|cell|home|work|business|main|primary|other) )?(?:phone|telephone|tel|mobile|cell)(?: number)?(?: \d+)?(?: value)?$/`

(`contact-import-mapping.ts:39-40`)

Google's ` ::: ` separator is split at `:153`. The review shows "N of M rows have no phone or email" (`ContactImportWizardV2.tsx:416-419`). When more than half the rows lack one, queueing asks first: "Most rows have no phone or email … Queue anyway" (`:303-310`).

I checked the mapping with a `node -e` copy of both regexes and the header normaliser:
- Google headers `E-mail 1 - Value`/`Phone 1 - Value` → email/phone.
- Outlook `Mobile Phone`/`Home Phone`/`Business Phone 2`/`E-mail 2 Address` → mapped.
- `Cell Phone`/`Work Phone`/`Tel.` → phone.

Residual, LOW: hand-made headers `Phone Numbers`, `Emails`, `Contact Email`, `Contact Phone` still map to *ignore*. The new warning and confirmation now surface this, so it is no longer silent.

**CON-F3 — VERIFIED-FIXED.** `src/lib/phone-number.ts:90-93`: `canonicalPhoneKey` returns E.164 (`+15551234567`, `;ext=` kept) when the value is a possible number at full national length for the workspace region; otherwise the legacy digits key. `phoneLookupKeys` (`:100-105`) returns both keys for matchers.

Every writer and matcher uses them:
- `contact-actions.ts:129,244`;
- `contact-import-service.ts:102,113,237,434`;
- `intake.ts:40,46`;
- `quick-capture.ts:25,58`;
- `referral-access.ts:39`;
- `contact-duplicate-candidates.ts:34-35`;
- `appointment-bindings.ts:90`;
- `jump-attempts.ts:161-169`.

The device-picker path goes through the import service (`contact-quick-add.ts:1`). So the audit's case — `(555) 123-4567` against `+15551234567` in a US workspace — now gives one key.

Trade-off (by decision, Release B §Decisions 4): an automatic text now requires a full international form. Numbers that cannot be read that way fail visibly on Today and are sent by hand.

**CON-F4 — VERIFIED-FIXED.** `bulk-contact-actions.ts:84-86`:

> "Archiving several people works exactly like archiving one: their Mix assignments stay in place"

It writes per-person audit rows and one `generate-jumps` job, and redirects with `archivedContacts=<ids>` when there are 50 or fewer (`:105-107`). `restoreContactsAction` (`contact-lifecycle-actions.ts:85-119`) restores under `FOR UPDATE`, so a double tap is one success. The test shows Restore brings the follow-up back without re-adding the Mix (`…integration.test.ts:133-137`).

**CON-F5 — VERIFIED-FIXED.** `contacts/page.tsx:148` searches `normalized contains` for every digit form (`phoneSearchDigits`: raw digits, ±leading 1; `phone-dial.ts:82-89`) plus both region keys. `archived/page.tsx:31` and `api/contacts/recipient-search/route.ts:14` do the same.

Gap: there is no browser test of phone search on `/contacts`. Only the helper tests and a source-string check exist (`tests/contact-lifecycle-actions.integration.test.ts:165`).

**CON-F6 — VERIFIED-FIXED.** `contact-actions.ts:74-78`:

> `That ${kind} already belongs to ${owner.displayName} (archived). Restore them from Archived contacts or use another ${other}.`

with the link `/contacts/archived?q=<typed>`. `ContactForm.tsx:177` renders the link.

**CON-F7 — VERIFIED-FIXED.** The edit page sends `revision={contactRevision(contact)}` (`edit/page.tsx:48`, hidden input `ContactForm.tsx:180`). The save re-reads under a row lock (`contact-actions.ts:407-409`):

```
SELECT id FROM "Contact" … FOR UPDATE; … if (!current || (revision && contactRevision(current) !== revision)) throw new StaleContactSaveError();
```

The fingerprint covers names, notes, emails, phones (display, label, primary), addresses, tags and custom values (`contact-revision.ts:35-45`). The user sees:

> "This contact was changed on another device after you opened it. Reload…"

Forms without a revision (opened before A2) still save, by decision.

**CON-F8 — VERIFIED-FIXED.** `ContactForm.tsx:105` gives the failing control `aria-invalid` and `aria-describedby="contact-save-error"`. `:100-103` focuses it, falling back to the banner.

**CON-F9 — VERIFIED-FIXED.** `ContactsBulkWorkspace.tsx:102-107` moves focus with `pendingProfileFocus` → `document.getElementById("contact-profile-heading")?.focus()` after a docked-layout click (`:214`). The heading is `<h2 id="contact-profile-heading" tabIndex={-1}>` (`ContactProfile.tsx:80`).

### P1 — design and accessibility

**DES-F1 — VERIFIED-FIXED.**
- `QuickAdd.tsx:99` installs the listener only if the switch is on: `if (shortcutEnabled) window.addEventListener("keydown", shortcut)`.
- `quick-add-shortcut.ts:32` ignores `isComposing` and `repeat`.
- The switch is "Quick Add keyboard shortcut (N)" in Personal preferences (`Appearance.tsx:71`).

Note: the choice is stored per browser in `localStorage` (`quick-add-shortcut.ts:13-21`), not per account. That meets WCAG 2.1.4, but it resets on a new device.

**DES-F2 — VERIFIED-FIXED.** Every control the audit named is now at least 44 px:

| Control | Rule |
|---|---|
| Calendar week navigation | `.calendar-page .calendar-week-nav .button { font-size: .8125rem; min-height: 44px }` (`design-workspaces.css:340`, inside `@media (max-width: 1099px)` at `:336`) |
| Journey view tabs | `.tabs button{min-height:44px…}` (`WorkflowJourney.module.css:3`) |
| Calendar duration chips | `.calendar-form-row .when-chip { min-height: 44px }` (`design-details.css:141`) |
| Contacts filter button | `min-height: 44px` (`contacts-workspace.css:21`) |
| Profile track and touchpoint links | `contacts-workspace.css:87,127` |
| Marketplace sections and kinds | `mega-mixes.css:42,48` |

**DES-F3 — VERIFIED-FIXED.**
- `design-workspaces.css:219` `.today-page .jump-card-heading h3 { font-size: 1rem }`.
- `:215-217` 40 px grid column and avatar, `font-size: .875rem`.
- `:233` `.today-page .section-label h2 { text-transform: none; letter-spacing: 0; }`, specificity 0,2,1 against `components.css:334` at 0,1,1.

The browser test measures 16 px, 40 px, `text-transform: none` and no overflow at 320 px (`e2e/a2-css-checks.spec.ts:34-58`).

### P1 — funnel and auth

**FUN-F1 — VERIFIED-FIXED.** Both onboarding paths now detect the device zone while the stored zone is `UTC`:
- `OnboardingForm.tsx:82` `confirmDetection={timezone === "UTC"}`;
- the default Mega-Mix path via `MegaMixSetup.tsx:34` `detectTimezone={Boolean(onboarding) && initialSetup.timezone === "UTC"}`.

`TimezonePicker.tsx:74-81` then `setValue(zone)`, propagated by `:47` into the date field. The zone is persisted by all three finishing paths: `onboarding-actions.ts:127`, the skip path at `:137-149`, and `mega-mix-service.ts:32`.

Accounts are still created in UTC (`account-provisioning.ts:45`); detection happens only at onboarding, by design. The browser test covers only the one-person path, with Denver. The default Mega-Mix path has only a source-string guard (`tests/sign-up-funnel.test.ts:31-36`).

**FUN-F2 — VERIFIED-FIXED.** `src/lib/auth.ts:100` `sameSite: "lax"`, with the reason in `:97-99`. Mutations stay behind the proxy origin check. I scanned every session-authenticated `GET` route handler for writes. The only candidate, `api/contacts/[contactId]/activity`, writes only in POST/PATCH. So Lax does not open a CSRF-via-GET path.

Magic links now land on a confirmation page before any session is created (`dbeb55d`, A2). Doc drift: see §4.

**FUN-F3 — VERIFIED-FIXED (code), dormant in production.**
- `/register?invite=` renders provider buttons carrying the invite: `register/page.tsx:49`, `SocialSignInOptions … invite={token}`.
- The OAuth state stores `inviteTokenHash` and `inviteId` (`social-auth.ts:112-113`).
- An email invitation refuses a mismatched provider address with a specific message (`:224-225`).
- `/login` says the buttons are for existing accounts (`login/page.tsx:89`).

With no provider configured, `SocialSignInOptions` returns null (`SocialSignInOptions.tsx:7`). Release B's preflight recorded "No Google or Apple sign-in is configured", so production has neither the feature nor the old dead end. **NOT RUN** end to end with real providers.

**FUN-F4 — VERIFIED-FIXED.**
- An email invitation pre-fills the address read-only: "Invitation sent to …" (`register/page.tsx:53-54`).
- A mismatch names the address: "This invitation was sent to … Use that address." (`auth-actions.ts:154-156`).
- A text invitation asks for "Confirm email" (`register/page.tsx:56`, `auth-actions.ts:157`).
- A text invitee can correct a typo on the verification screen with their password (`verify-email/pending/page.tsx:48-53` → `changeUnverifiedEmailAction`, `auth-actions.ts:344`), up to three changes a day. This applies only to text invitations, by decision (Release B §Decisions 8).

### P1 — Mixes and Marketplace

**MIX-F1 — VERIFIED-FIXED.** `matchDateType` (`shared-mix-service.ts:81-88`) looks up by slug, then case-insensitive name, scoped to this workspace's custom types plus system types. All three installers use it: `mega-mix-pipeline-service.ts:165`, `shared-mix-service.ts:101`, `shared-mix-use-service.ts:24`. It creates a type only on a miss (`:167`).

**MIX-F2 — VERIFIED-FIXED.** `marketplace-service.ts:408`:

```
status = restore && listing.status === "HIDDEN" ? (value ? "LIVE" : "UNSHARED") : !restore && listing.status === "LIVE" ? "HIDDEN" : listing.status
```

An UNSHARED listing stays unshared; its reports just close.

**MIX-F3 — VERIFIED-FIXED.** `mega-mix-pipeline-service.ts:108` `underReview: listing.status === "HIDDEN" || listing._count.reports > 0`. `:121` refuses with "This Mega-Mix's share is under review; it can be removed once the review is done." The dialog says "This also removes its Marketplace share." (`MegaMixForms.tsx:50-51`).

Trade-off: a share that staff keep hidden also keeps its Mega-Mix until another review or a restore. The author can request that review (Release B, `1928f26`).

**MIX-F4 — VERIFIED-FIXED.** The editor posts `mixUpdatedAt` (`MixEditor.tsx:184`). Under the workspace lock, `mix-editor-actions.ts:259-261` checks:

```
if (!current || current.updatedAt.getTime() !== Date.parse(openedAt)) throw new MixChangedElsewhere(…)
```

and `:379` returns the error with entries kept. Commits `446aadc` and `076b6e4` changed only the unrelated error-class and library-timing code.

### P1 — ops and scale

**OPS-F1 — OPEN-BY-DECISION (export part fixed).** Beta severity **MEDIUM**, magnitude INFERRED.

The export writes each distinct definition once and streams (`src/lib/account-export-stream.ts:220-224,282-285`).

The hot paths are unchanged:
- `readWorkflowAttention` still selects `state: true, definition: true` for **every** ACTIVE instance on each Today render (`workflow-attention.ts:36`, called from `jumps/page.tsx:188`).
- The daily digest does the same (`notification-delivery.ts:217`).
- The Journey page includes full rows (`mix-workflow-view.ts:36`).

Record:
- Deliberation: "moved two hot-path rewrites (workflow-attention projection…) to a later scale release" (`FULL_AUDIT_2026-09-24.md:65`).
- C-2 is "optional at one workspace … wait for the owner" (`AUDIT_RELEASE_C1_2026-09-25.md:80`).
- The brief parks C-2.

Why MEDIUM rather than LOW for beta:
1. Every assigned contact gets an instance. The default onboarding path installs a Mega-Mix that adds Journey rules (`mega-mix-service.ts:60-61`). Whenever rules exist, each assignment creates an instance (`jump-engine.ts:474`).
2. Definitions grow with Quick Add use.
   - `readWorkflowDefinition` includes **all** steps of `ONE_TIME` Mixes (`mix-workflow.ts:28`, `OR: [{ isActive: true }, { mix: { source: "ONE_TIME" } }]`).
   - Every Quick Add or one-time follow-up adds a step to that hidden Mix (`quick-capture.ts:88-92`, `bulk-contact-actions.ts:206-217`).

   So each new instance's snapshot grows with the owner's history. VERIFIED code structure; the effect on memory is INFERRED.

An owner with a few hundred contacts in a Mega-Mix therefore makes each Today render parse hundreds of full-workspace JSON copies on the 512 MB web instance.

Mitigation at no cost: measure before inviting owners with large lists (see "Runtime check" in §3). Watch Render's memory graph during beta.

**OPS-F2 — VERIFIED-FIXED.** `marketplace-service.ts:201-202`:

> "Rows show the stored facts, so a list read exports nothing and writes nothing"

Saves refresh their shares (`refreshSharesOf`) and an hourly pass catches up (`refreshStaleListings`). By recorded decision (C-1 §Decisions 1), the opened detail view still refreshes its one listing on read (`:236`). Drift: `prisma/marketplace.prisma:50` and `docs/MARKETPLACE_AND_NUMBERING_2026-09-24.md:69` still say "refreshed whenever it is read".

**OPS-F3 — OPEN-BY-DECISION (scale half). The race half is VERIFIED-FIXED.** Beta severity for the open half **LOW-PARKED**.

`jump-engine.ts:189` `const now = new Date();` is read before the assignment query. The stale pass then excludes newer rows (`:734-737`):

> "A row created or touched since this pass started … the next pass judges it instead of this one cancelling it." — `createdAt: { lt: now }, updatedAt: { lt: now }`

`Jump.updatedAt` is `@updatedAt`. The batched admission lookups and the whole-workspace five-minute pass remain, parked as C-2 (`AUDIT_RELEASE_C1_2026-09-25.md:80,84`).

**OPS-F4 — OPEN-BY-DECISION (C-3 parked).** Beta severity **LOW-PARKED**; it becomes MEDIUM once active instances across all users exceed a few hundred.

`mix-workflow.ts:278` still sets `nextCheckAt: new Date(now.getTime() + 60_000)` after every evaluation. `:284-285` takes `limit = 50` per minute, globally. With N active instances, each is revisited about every N/50 minutes, so Journey timeouts and commitments slip by that much. The free 0.1-CPU Postgres carries the constant evaluation load (INFERRED). Record: `AUDIT_RELEASE_C1_2026-09-25.md:80`.

### P1 — process

**PRO-F3 — REGRESSED (not fixed).** Beta severity **MEDIUM**.

`.gitignore:26` still ignores `.artifacts/`. Every audit release ran from untracked scripts on TrixBot: `.artifacts/market-live-20260924/{audit,a2,b,b11,c1,c1b,dfix}-{preflight,deploy,postflight,live-smoke,finalize,lib,release}.mjs`, about 31 files per release. What is tracked:
- a factual summary in `AGENTS.md:15-17` (`78ed85e`);
- a generic deploy order in `docs/HOSTED_DEPLOYMENT.md:55-66`.

No release plan scheduled this (G7 in `FULL_AUDIT` §5 lists the smoke, tags, PR and record, not the pipeline). Mitigation: a rollback is "redeploy the previous tag, web first" from the Render dashboard, which needs no script.

**PRO-F4 — REGRESSED (partial).** Beta severity **MEDIUM**.

The root cause is fixed: the specs send `Origin` (`e2e/journey-connections.spec.ts:105,148,288,336,340`), and `FULL_AUDIT` §1 re-ran 17/17 on a production build.

The practice the finding asked for — cite only runs whose log is referenced by path — was not adopted:
- The A2, B, B11 and C-1 records claim full-suite passes with no saved log in the repo.
- The **D release has no record**. Its pipeline file `.artifacts/market-live-20260924/dfix-release.json` (untracked) names `"localEvidence":"docs/AUDIT_LEFTOVERS_2026-09-25.md"`, a file that exists nowhere, and says `"engineeringChecksPassed":"true"` at `2026-09-26T13:36:24Z`.
- The D worktree's Playwright state `/tmp/jitm-d-20260925/test-results/.last-run.json` (mtime `2026-09-26 13:35:33Z`) reads `{"status":"failed","failedTests":["b5fad46062bc08d3af56-24ad3b4facfddab57ce8"]}`. Its error context is `onboarding-invitations-…-links-and-no-queued-emails-mobile-chromium`, i.e. `e2e/onboarding-invitations.spec.ts:60` on the phone project.

Whether that failure was a flake is unknown. The lead should run that spec on both projects.

The same untracked files show both Render services on `4b5abd8` at 13:44Z with the live smoke passing (`dfix-final-check.json` `"passed":true`).

**PRO-F5 — NOT-VERIFIABLE.** The named stale assertions are gone: `git grep -F` over `e2e/` finds 0 hits for "Also offer as", "Add person & follow-up", "Minutes after it is marked completed", "timed from a visit", "Find someone in the journey", "Search this journey", "Filter mixes by status", "Check the details", and "Create a basic starter mix".

After those removals, 79 spec files exist. Whether they pass on `4b5abd8` is not established:
- CI never finished (PRO-F1);
- D changed four specs without a recorded run: `e69bbcb`, `f6636f1`, `ca924af` and `446aadc`'s test edits;
- the last local run failed one test (PRO-F4).

The lead's run decides this.

**PRO-F6 — REGRESSED (partial).** Beta severity **LOW**.

A tracked, credential-free production smoke exists: `scripts/production-smoke.mjs:1-18`, "checks https://jumpinthemix.com" by default, GET only. It does not sign in, so it would not catch a sign-in-only break like 2026-09-16. It is also not wired anywhere: there is no npm script (`package.json` has only `smoke:staging`, `load:smoke`, `db:smoke-restored`), and neither docs nor CI reference it. `docs/HOSTED_DEPLOYMENT.md:85-99` still prescribes `npm run smoke:staging`.

The sign-in smoke that did run for every release is untracked (`*-live-smoke.mjs`). `AGENTS.md:13` still mandates the retired Netlify test site. The private test worker is `disabled_manually` (`gh workflow list --all`). FULL_AUDIT §8 lists this as still open for the owner.

**PRO-F7 — VERIFIED-FIXED.** Deep-gap items:
- 3 and 4 → FUN-F3, FUN-F4;
- 6 → CON-F7, MIX-F4;
- 11 → CON-F8;
- 12 → CON-F9.

Each now has an implementation and tests. The P2 items the finding named are also done:
- onboarding completed state: `src/app/onboarding/page.tsx:21-25` "Setup is complete";
- contact-create idempotency: `contact-actions.ts:286-310` `contact-create:${user.id}:${requestId}`;
- double-submit-safe restore: `contact-lifecycle-actions.ts:60-61,95-97`.

### P1 — security

**SEC-F1 — VERIFIED-FIXED.** `request-context.ts:22` reads `clientAddressFromHeaders(…, { trustedCidrs: env.trustedProxyCidrs })`. `client-ip.ts:131-138` walks `X-Forwarded-For` right to left, skips private and Cloudflare ranges, and returns the first untrusted hop. `CF-Connecting-IP` is used only behind a Cloudflare hop (`:139-143`). The walk never throws. No other code reads forwarded client addresses (`git grep -i x-forwarded-for` hits only `client-ip.ts`). `TRUSTED_PROXY_CIDRS` is validated (`env.ts:151`).

Runtime proof is in the untracked live smokes: a forged `X-Forwarded-For` still recorded the real address on every release through D.

Residual, INFERRED: when the chain proves nothing, the address is `null`. `rate-limit.ts:21` maps `null` to `"unknown"`, so such requests would share one bucket. It does not arise in production on the recorded evidence.

**SEC-F2 — VERIFIED-FIXED (as decided; residual accepted).** Only `PRIVATE_INFO` has `autoHide: true` (`marketplace.ts:12`). `reportHidesAtOnce` also needs a verified reporter under two automatic hides a day per reporting workspace (`:24,31-33`, applied at `marketplace-service.ts:321-324`). Other reasons stay live and queue for staff. Staff owners are emailed on every report (`notifyStaff`). The author sees no reporter details until a decision (`:246` `details: report.status === "OPEN" ? null : report.details`).

The residual — one verified PRIVATE_INFO report still hides a share at once — is owner decision 5 (`FULL_AUDIT` §8). Beta impact is negligible: invite-only accounts, and the Marketplace had no listings at the audit.

### P1 — Today

**TOD-F1 — VERIFIED-FIXED (no retry, by decision).** Today reads `automatedDelivery … status: "FAILED"` for pending rows (`jumps/page.tsx:177-180`). The card shows "Automatic send failed" or "Send not confirmed" (`:367`). The review shows the plain reason and "Tried …", plus "Manual · you send" (`:329-332`). The two wordings come from `today-view.ts:44-49`, for when the send failed and for when it may have gone out.

A failure also takes the row out of automatic delivery (`:299` `… && !failure && …`). "Never retried" is owner decision 3 (`FULL_AUDIT` §8).

**TOD-F2 — VERIFIED-FIXED.** The card's hidden `status-pill` claim is gone (no `status-pill` in `jumps/page.tsx`). The review shows "Sends automatically at {time} unless you send, snooze or skip it first." (`EditableFollowUpAction.tsx:73-76`, rendered at `:431-441`). The time comes from the worker's own rule, `automaticSendWindow` (`jumps/page.tsx:301`), with a parity test against the worker (`automatic-delivery-window.test.ts:68-101`). The state appears in the review only, not on the card, following the design export.

**TOD-F3 — VERIFIED-FIXED.** `useOutcomeRequestIds` "minted on first use and reused until the attempt succeeds" (`JumpWorkflow.tsx:108-129`). The route's 409 carries the current `status` (`outcome/route.ts:337-343`). The client treats an already-finished follow-up as recorded (`JumpWorkflow.tsx:158`). The route test replays the same id as one record (`tests/jump-outcome-idempotency.test.ts:37`).

Note: the guarding browser spec failed on `c17cc80` through C-1 (Release B record, "outcome-retry ×2"). It was realigned in D (`e69bbcb`: "After a lost answer the outcome panel stays open and its Save outcome is the retry"). The core assertion — two POSTs carry the same `requestId` (`e2e/outcome-retry.spec.ts:111-112`) — is intact, but it has no recorded pass on `4b5abd8`.

## 3. Runtime checks for the lead (highest value first)

1. **Full vitest and the Playwright specs below on `4b5abd8`**: they stand in for the missing CI evidence (PRO-F1, F4, F5). Include `e2e/onboarding-invitations.spec.ts` on both projects, `e2e/outcome-retry.spec.ts`, and `tests/account-deletion-schema-guard.test.ts`.
2. **OPS-F1 magnitude** on the local production build:
   - onboard a fresh account through the default Mega-Mix path;
   - import about 200 contacts and add them to it;
   - create about 20 Quick Add follow-ups;
   - on the local DB, run `SELECT count(*), avg(pg_column_size(definition)), max(pg_column_size(definition)) FROM "MixWorkflowInstance" WHERE status='ACTIVE'`;
   - time `/jumps` and watch the web process RSS.
3. The FUN-F2 and FUN-F1 end-to-end flows in a browser: a verification link opened from another origin lands signed in on `/onboarding`, and the Mega-Mix path shows the device zone.

## 4. Doc-vs-code drift met along the way

- **Sessions.** `docs/CANONICAL_PRODUCT_DECISIONS.md:109` says "Sessions use opaque hashes, `SameSite=Strict`, a 14-day maximum". `docs/SECURITY.md:7` says the same: "`SameSite=Strict` … expire after at most 14 days by default".

  The code:
  - The cookie is `sameSite: "lax"` (`src/lib/auth.ts:100`) and expires at `env.sessionMaxDays` (`:105`).
  - `sessionMaxDays` defaults to 90 (`src/lib/env.ts:61`); readiness rejects values above 400 or below the idle window (`:157-158`).
  - The session row slides by `AUTH_SESSION_DAYS`, which is now the **idle** window (`env.ts:59`, `auth.ts:32-35,202-205`), capped at 90 days from creation.
  - `render.yaml:20-21` sets `AUTH_SESSION_DAYS=14`, meaning idle; it does not set `AUTH_SESSION_MAX_DAYS`, so production uses the code default of 90. The untracked D live smoke observed "a Lax, Secure, HttpOnly session cookie expiring in about 90 days".

  The two docs misstate both the SameSite mode and the lifetime.
- **Tags and records.** `AGENTS.md:17` says "Every deployed commit carries an annotated tag … Each release has a record under `docs/`". Both are false for `4b5abd8`.
- **Staging.** `AGENTS.md:13` makes the Netlify test site the staging gate; it is retired and its worker disabled. `docs/HOSTED_DEPLOYMENT.md:85-99`'s release smoke uses `smoke:staging`, not `scripts/production-smoke.mjs`.
- **Marketplace refresh.** `prisma/marketplace.prisma:50` and `docs/MARKETPLACE_AND_NUMBERING_2026-09-24.md:69` say listings refresh on every read; C-1 (`ee5bb4f`) stopped that for list reads.

## 5. New facts outside the 40 items

- **CI secret scan failed.** `Security / secret-history` failed on PR #83 (run 36178561859): gitleaks v8.30.1 reported `leaks found: 1`, redacted. It passed on PR #82 at 02:23 and 02:33 UTC on 09-25.

  The commits added in between include many test fixtures with mocked secret values, e.g. `authRateLimitSecret: "…"` in `tests/*.test.ts`. That points to a fixture false positive, but it is **unconfirmed**. `.gitleaksignore` lists only older fingerprints. The weekly scheduled scan (`security.yml`, `--log-opts="--all --full-history"`) will fail the same way.

  **NOT RUN**: I had no gitleaks locally, and Docker is not allowed.
- **Raw error text in JSON.** The outcome route's 409 returns `error.message` for any thrown error (`outcome/route.ts:337-343`), so an unexpected database error's text can reach the client. This is out of scope for the P1 list; flagged for the security lane.

## 6. Tests to run on the production build

**vitest** (the DB-backed files need a local `jitm_design_*` database; the `staff-access` bootstrap tests need `npm run test:isolated`):

| Area | Files |
|---|---|
| Account deletion | `tests/account-deletion-orphans.integration.test.ts`, `tests/account-deletion-schema-guard.test.ts`, `tests/prisma-relation-guard.test.ts`, `tests/account-deletion.integration.test.ts`, `tests/account-deletion-guard.test.ts`, `tests/account-deletion-action.test.ts` |
| Admin | `src/components/SupportEmailRecovery.test.ts` |
| Contacts | `tests/contact-lifecycle-actions.integration.test.ts`, `tests/contact-bulk-undo.integration.test.ts`, `src/lib/contact-import-mapping.test.ts`, `src/lib/contact-actions.test.ts`, `tests/contact-save-integrity.integration.test.ts` |
| Phones | `tests/phone-number.test.ts`, `tests/phone-canonicalization.integration.test.ts`, `tests/contact-input.test.ts`, `src/lib/contact-duplicate-candidates.test.ts`, `tests/phone-client-bundle-guard.test.ts`, `src/lib/phone-dial.test.ts`, `src/app/api/contacts/recipient-search/route.test.ts` |
| Design | `src/lib/quick-add-shortcut.test.ts` |
| Funnel and auth | `src/components/TimezonePicker.test.ts`, `tests/sign-up-funnel.test.ts`, `tests/auth-boundary.test.ts`, `tests/session-expiry.test.ts`, `tests/known-device.test.ts`, `tests/magic-login-return.test.ts`, `tests/oauth-callback-route.test.ts`, `tests/oauth-start-route.test.ts`, `tests/social-auth.test.ts`, `tests/social-auth-invitation.integration.test.ts`, `tests/invitation-sign-in-pages.test.tsx`, `tests/register-action.test.ts`, `tests/auth-abuse.test.ts`, `tests/auth-abuse.integration.test.ts` |
| Mixes and Marketplace | `tests/mega-mix-pipelines.integration.test.ts`, `tests/marketplace.integration.test.ts`, `tests/marketplace-archive.integration.test.ts`, `tests/marketplace-review.integration.test.ts`, `tests/marketplace-refresh.integration.test.ts`, `tests/marketplace.test.ts`, `tests/mix-stale-save.integration.test.ts` |
| Ops | `tests/reconciliation-fresh-rows.test.ts`, `tests/account-export-stream.integration.test.ts` |
| Security | `src/lib/client-ip.test.ts` |
| Today | `src/lib/today-view.test.ts`, `src/lib/automatic-delivery-window.test.ts`, `src/components/EditableFollowUpAction.test.ts`, `tests/automatic-delivery-recipient.test.ts`, `tests/jump-outcome-idempotency.test.ts`, `src/components/JumpWorkflow.test.ts` |

**Playwright** (desktop unless noted; most need `DATABASE_URL` on a local `jitm_design_*` DB, and the demo seed `RESET_DEMO_DATA=true DEMO_MODE=true npm run db:seed`):

| Spec | Test (line) | Guards |
|---|---|---|
| `e2e/core-flows.spec.ts` | "new customer reaches a prepared first Jump through onboarding" (:122, Denver) | FUN-F1 |
| `e2e/core-flows.spec.ts` | the deletion test after it | ACC-F1, UI only |
| `e2e/session-cookie-cross-site.spec.ts` | "a verification link opened from another site signs the person in" (:10) | FUN-F2 |
| `e2e/registration.spec.ts` | :56, :90, :114 | FUN-F4 |
| `e2e/registration.spec.ts` | :147, needs `SOCIAL_AUTH_E2E=1` and placeholder Google/Apple credentials on the server | FUN-F3 |
| `e2e/a2-contacts.spec.ts` | :25, :48, :77, :121, :135, :162 | CON-F4, F8, F9 |
| `e2e/contact-search-import-jobs.spec.ts` | "import review counts the rows with no phone or email and asks before queueing them" (:114) | CON-F2 |
| `e2e/phone-region.spec.ts` | :51 | CON-F3 |
| `e2e/a2-css-checks.spec.ts` | :34, :61 (also :78, :108) | DES-F2, F3 |
| `e2e/visual-fitment.spec.ts` | "Quick Add shortcuts continue into actionable contact journeys" (:301) | DES-F1 |
| `e2e/marketplace.spec.ts` | :39, :195, :252, :277 | MIX-F2, F3, SEC-F2 |
| `e2e/mega-mix-pipelines.spec.ts` | :136 | MIX-F4 |
| `e2e/automatic-delivery-states.spec.ts` | :57 | TOD-F1, F2 |
| `e2e/outcome-retry.spec.ts` | :88, :118, :149 | TOD-F3 |
| `e2e/onboarding-invitations.spec.ts` | :60, **both projects** | failed before D |
| `e2e/support-email.spec.ts` | needs `SUPPORT_EMAIL_E2E=1`, `AUTH_REQUIRE_ADMIN_MFA=true` | privileged receipt path, ACC-F4 |

Critical flows with **no** browser test:
- phone-number search on `/contacts` (CON-F5);
- timezone detection on the default Mega-Mix onboarding path (FUN-F1);
- a real Google/Apple invitation sign-up (FUN-F3 — no provider configured).

## 7. NOT RUN

- All vitest and Playwright runs and builds; the brief forbids them here. The lead runs §6.
- Render state: the dashboard value of `AUTH_SESSION_MAX_DAYS` and the worker shutdown delay. The untracked D smoke is consistent with 90 days.
- Production reads. I did not contact jumpinthemix.com.
- The identity of the gitleaks finding (needs gitleaks locally).
- OAuth sign-up with real Google/Apple credentials.
- Carrier IPv6/NAT client-address check on a phone (the owner follow-up in `FULL_AUDIT` §7).
- The OPS-F1 and OPS-F4 magnitudes (§3.2).

## 8. Questions for Kevin

1. Tag `4b5abd8` (`prod-2026-09-26-4b5abd8`), extend PR #83 to it, and merge `main` with a merge commit?
2. Split or shard the CI browser step so a release PR can finish green, and require that green run before each deploy?
3. Is the gitleaks finding on PR #83 a test fixture (add its fingerprint to `.gitleaksignore`) or a real secret (rotate it)?
4. Should the release pipeline (`.artifacts/market-live-20260924/*-{preflight,deploy,postflight,live-smoke,finalize,lib}.mjs`, secrets excluded) be committed?
5. Should the D release get a record? Its pipeline cites a `docs/AUDIT_LEFTOVERS_2026-09-25.md` that does not exist. Was the failed `onboarding-invitations` phone run before the D deploy triaged?
6. Are staff-only accounts a supported configuration? If yes, ACC-F3 needs a staff security page; if no, every staff member needs a workspace.
7. With C-2 and C-3 parked, is it acceptable for beta owners to put hundreds of contacts into a Mega-Mix? Or invite smaller lists first until OPS-F1 is measured?
8. Should `CANONICAL_PRODUCT_DECISIONS.md:109` and `docs/SECURITY.md:7` be corrected to Lax, 14-day idle and 90-day cap? Should `render.yaml` set `AUTH_SESSION_MAX_DAYS: "90"` explicitly? Should the Netlify staging rule in `AGENTS.md:13` be retired?
