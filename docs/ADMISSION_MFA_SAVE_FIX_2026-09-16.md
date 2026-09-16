# Admission saves interrupted by MFA — regression evidence

Date: 2026-09-16. Scope: code fix and review only. No production settings change, live invitation, shared-database write, migration change, merge or deployment was performed for this task.

## Reproduction

The packaged standalone server from baseline `20a0c68260d5aa61c2a62caa309dc27568daac08` reproduced the report using a synthetic administrator, an isolated local PostgreSQL database and real browser MFA verification:

1. Saved policy started at 0/0; administrator MFA was eleven minutes old.
2. Enter 1/1, select the member-referral pause, enter a synthetic reason and password, then Save.
3. Complete authenticator verification and return to Admission.
4. The old form displayed 0 instead of the entered 1. Policy and admission-change audit count remained unchanged.

The new regression failed on the old artifact at `Total account and reservation limit: expected "1", received "0"`. Its preceding assertions verified unchanged policy and zero admission-save events after MFA. The same journey passes with the fix.

## Result and security review

- The interrupted operation retains limits, all four pause values, reason and original policy revision. A 30-minute encrypted cookie binds the draft to the authenticated administrator/session and a random operation ID. It is HttpOnly, SameSite=Strict, scoped to `/admin/admission`, and uses the existing secure-cookie policy and encryption key. No database schema or dependencies were added.
- Only explicit allowlisted draft fields are serialized. Passwords and MFA codes are excluded from storage, save receipts, audit payloads and redirect URLs. URLs carry an opaque operation ID. Password re-entry is required after returning from verification or a failed save.
- MFA verification never commits admission settings. Both verification and the restored form explain that a separate Save is required. A discard action and expiry abandon the draft without changing policy. One admission draft is retained per browser; another save replaces it with explicit feedback if the old operation is revisited.
- Draft capture checks the current authenticated, non-impersonating administrator and `settings.manage`. Committing rechecks active/verified account, session, permission, enabled MFA credential, the existing ten-minute freshness window, password, reason, limits and policy revision under the existing staff/access locks. Rate limiting, request-origin protections and fail-closed defaults remain enforced.
- A conflicting policy revision requires explicit review of the latest saved settings. The server rejects bypassing that confirmation and checks the revision again at commit. Concurrent/replayed submissions cannot create a second save for the same revision.
- Only a post-commit encrypted receipt matching the session, operation and persisted revision permits “Admission controls saved.” A fabricated success URL cannot produce it. Saved values and warnings come from persisted policy, separately from draft fields. Either zero ceiling retains the configuration warning.

## Validation

| Evidence | Result |
| --- | --- |
| Original packaged-server reproduction | Failed at the expected lost-limit assertion; no settings commit |
| Draft, admission and MFA unit/integration suites | 26 passed, 0 failed, 0 skipped |
| New MFA-save browser journeys | 18 passed: nine scenarios each on desktop Chromium and Pixel 7 Chromium |
| Existing admission browser regression/accessibility journeys | 6 passed on desktop/mobile; 320/1440 widths and both themes |
| TypeScript, schema/syntax/import validation | Passed |
| Packaged standalone production build | Passed |
| Production dependency audit threshold | Passed: no high/critical findings; one pre-existing moderate `baseline-browser-mapping` advisory; lockfile unchanged |

Browser cases cover fresh MFA with 1/1 and invitations unpaused; stale ten-minute MFA; fully expired administrator MFA; successful verification without a settings write; restored values and empty password after reload; invalid verification and cancellation; discard; wrong password, short reason and inconsistent limits; concurrent policy changes with browser and server confirmation checks; session/operation isolation; revoked permission; replayed submissions and cross-origin rejection. Unit tests additionally cover tampering, draft expiry, credential exclusion and maximum-length Unicode/control-character reasons. PostgreSQL tests verify concurrent duplicate commits audit exactly once and removal of the MFA credential prevents saving.

Final browser report: 24 expected/passed, 0 unexpected, 0 skipped, 0 flaky. Started `2026-09-16T17:29:38.773Z`; duration 121.831 seconds. Disposable local database `jitm_design_invitation_browser_0ab36f7b51` was dropped; verification returned no remaining database at `2026-09-16T17:31:40.762Z`. Other reproduction/integration databases were also dropped. No mail worker ran; fixtures and provider configuration were synthetic. This is local packaged-server evidence, not hosted or production qualification.

Build ID: `7uzf0ggBT9BnwQaTltbhp`. Runtime input SHA-256 values:

| File | SHA-256 |
| --- | --- |
| `src/lib/admission-draft.ts` | `ed6dc3666ed63f1b80d65b074bf63fa33f7c0f6400bcdb28c6a35f0a9b2a1288` |
| `src/lib/admission-draft-cookie.ts` | `c0224fc760fbc384a20c95d624149ccc2125dcff5ee9043ab0f123a4cf12fb7e` |
| `src/lib/admission-admin-actions.ts` | `81fba1c61349c2154c079c5d1d41115800cb186fb74b379458216ced803c5d72` |
| `src/lib/admission-admin.ts` | `58a28ed61fe480ef357c1c44766027e2db5ab9a80b0ff0f0591403222795dbc8` |
| `src/app/(staff)/admin/admission/page.tsx` | `ae76b555f8d266b5aec36fab45fe3b94a11c8c82f52a02713808a4d566d7ddbf` |
| `src/components/AdminMfaPanel.tsx` | `7fab94f9119151d779a81437b98d3d2972aa4f757fc731ac3e21738b83a315ba` |
| `package-lock.json` (unchanged) | `b0e38245412b6d6c8d190a87f7899db4a502aec4c0a2f47cbbb0ddc9316a9bd7` |

Local machine evidence is under `.artifacts/admission-mfa-fix-2026-09-16/`: `reproduction.json`, `reproduction.log`, `tests.json`, `browser.json`, `browser-cleanup.json`, `build-receipt.json` and validation logs. Tests are committed and the existing CI staff-browser gate includes the new suite. GitHub checks remain separate from these local results and must be read on the PR's final head.

## Kevin's manual steps for 1/1 with invitations unpaused

These steps apply after a separately authorized deployment of the fix. Kevin enters his own credentials directly; none should be sent to an agent or pasted into evidence.

1. Open **Admin → Admission** in Kevin's signed-in administrator session. Set **Total account and reservation limit** to **1** and **Outstanding invitation limit** to **1**.
2. Leave **Pause all new customer invitations**, **Pause new member referrals**, and **Emergency: pause account creation from invitations** unchecked. Keep waitlist collection at its intended setting. Enter a reason of 10–500 characters and Kevin's current administrator password.
3. Select **Save admission controls**. If MFA is requested, Kevin enters his authenticator code directly and completes verification.
4. On return, confirm that 1/1, the pause choices and reason are restored, and that the page says the changes are **not saved**. Re-enter only the administrator password and select **Save admission controls** once. If another administrator changed policy, review the displayed saved settings and explicitly confirm before applying the draft.
5. Require **Admission controls saved**, saved limits of **1/1** and the intended saved pause states. Reload to verify persisted values. With fresh MFA, the initial Save can commit directly. A remaining warning must be resolved from the saved state, not dismissed.

Saving positive limits with invitations unpaused permits existing scheduled/manual/referral behavior within capacity; it is not itself an invitation-send confirmation. The existing weekly schedule is a separate control. This task does not operate that schedule or issue invitations.

## Review boundary

The fix PR is based on `fix/invitation-admission-authorization` at `20a0c68` so its diff contains only this MFA-save fix, tests and documentation. That already-deployed predecessor is not part of this PR's new changes. Render web/worker automatic deployment was verified `no`/`off`; both still track `main`. Both existing Netlify sites have no linked repository, so PR creation does not publish a preview. No deployment/configuration mutation was used to obtain these checks. Production and the original test database, including its known migration checksum mismatch, remain outside this fix's write scope.
