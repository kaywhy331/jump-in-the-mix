# Add people from a phone: release, 2026-10-05

Live at https://jumpinthemix.com since 2026-10-05 23:08 UTC (web cutover); the final check passed at 23:10:31 UTC. This release ships PR #121 (D32):
- the Android contact picker on Add a contact;
- Add from your phone (`/contacts/from-phone`);
- the iPhone share endpoint with a personal key;
- the saved-card import guide.

It has one additive migration and no dependency or service configuration change. `IPHONE_CONTACTS_SHORTCUT_URL` stays unset until Kevin builds the shortcut, so iPhone users see only the saved-card steps for now.

| Item | Value |
|---|---|
| Previous production commit / tag | `9b3f949be20987798584ba7d3cd32c67f51caefe` / `prod-2026-10-05-9b3f949` |
| Release merge / PR | `e6b4c6a858a64f75cbfbff5b3068ba7254517d11` / [#121](https://github.com/kaywhy331/jump-in-the-mix/pull/121) (tree = reviewed head `8adef51`) |
| Production tag | `prod-2026-10-05-e6b4c6a` |
| Fresh encrypted backup | Stored 2026-10-05T22:58:56Z (3 objects), before the migration |
| Migration / job | `20261005120000_contact_share_keys` / `job-db22njflot8c73dk20ug`, 74 migrations installed |
| Worker deploy / live | `dep-db22ojp7lnhs73dd8540` / 2026-10-05T23:03:08Z |
| Web deploy / live / build | `dep-db22q0p7lnhs73ddcrc0` / 2026-10-05T23:08:38Z / `NG76iKpaM5tIqd6scMFlO`, build cache kept |
| Final check | 2026-10-05T23:10:31Z |

## Verification

**VERIFIED locally on the candidate tree (`8adef51` = `e6b4c6a`):**
- **Tier 1:** typecheck, `validate:static`, `standards:check` and the production build all passed.
  - The full Vitest run on `77ac969` passed 2,229 tests. The 3 `staff-access.integration` failures were environmental: they came from the seeded browser-test admin and pass on a fresh database.
  - After the review fixes: 33 unit tests and 6 database tests passed.
- **Schema:**
  - `db:rehearse-migration` passed on populated and clean schemas.
  - `db:deploy` and `db:verify-release` show 74/74 ready.
  - `prisma migrate diff` shows no drift for `ContactShareKey`.
- **UI:** the affected browser specs passed on `desktop-chromium` and `mobile-chromium`: phone-contacts, a2-contacts, core-flows, contact-search-import-jobs, accessibility, design-consistency, contact-lifecycle-management, core-ux-friction, ui-ux-readiness, onboarding-invitations, onboarding-one-person-first, sheet-interactions and visual-fitment.
  - Screenshots in both themes; 200% text reflows.
- **WF-05 review:** an independent review returned Changes requested: COR-01 (vCard names), REC-01 (a hidden existing key) and 10 LOW findings. All were fixed in `8adef51` except SEC-01, which waits for Kevin. The verdict after the fixes was Approve.

**VERIFIED in production:**
- **Preflight (read-only):** both services were at `9b3f949` with auto-deploy off. The database was ready behind the `jitm_runtime` boundary, with no recovery hold and 73 migration checksums matching the release tree. The new table was absent, and no billing variable was set.
- **Migration:** a reviewed one-off job, run from the checksummed GitHub archive with the live lockfile verified identical.
  - It created `ContactShareKey` empty.
  - The runtime role can read and write it without elevated rights; `jitm_backup` can read it only.
  - Existing row counts were unchanged.
- **Worker:** deployed first, reached the release commit, and passed its scoped queue probe. The synthetic job was removed.
- **Postflight:** 26 checks, all passed.
  - Health, public pages and `security.txt` were checked.
  - `/contacts/new`, `/contacts/from-phone` and `/contacts/import` redirect to sign-in when signed out.
  - `POST /api/webhooks/phone-contacts` without a key returns 401 in plain text from outside a browser.
  - All 25 changed files and 22 page assets on the live instance hash-match the release.
  - The first postflight attempt failed: it hashed a stylesheet from a page still served by the previous instance during the cutover. The rerun after the cutover passed. The same thing has happened in an earlier release.
- **Live smoke:** 8 checks with one synthetic owner (no Mix, so nothing could send).
  - **iPhone:** Add a contact leads to Add from your phone, with only the saved-card steps. `?setup=shortcut` makes a hidden 43-character key and focuses it; the page reflows and passes axe in both themes.
  - **Shared card:** an iPhone-style vCard POSTed from TrixBot adds one person with the card's own names (source API). A repeat answers the same without a second person, and a wrong key gets 401. The key is stored as a 64-character hash and its use is recorded. Turn off removes the key and the old key is refused.
  - **Android:** the picker on Add a contact (stubbed) adds the selected person, and Add from your phone shows only the picker.
  - **Computer:** no phone button on Add a contact; Import links to the page, which shows both phones' steps.
  - **Cleanup:** all synthetic rows were removed.
- **Final check:**
  - Record counts are unchanged since the preflight (User 2, Workspace 1, Contact 4).
  - There are zero synthetic users, workspaces or keys, zero failed jobs since the release, zero rate-limit blocks and zero plan-limit stops.
  - Health returns 200, and both services are at `e6b4c6a`.

**CI:** on the merge, the `validate` job was still queued without a runner at release time. `production-image`, `backup-image`, `monitor-image`, `dependency-audit` and `secret-history` passed. The release relied on the local tier-3 run above and the Render build.

## Recovery

If needed, redeploy `prod-2026-10-05-9b3f949`, web first and then the worker. The previous code never reads `ContactShareKey`, so the table can stay. Never reverse the migration in place.

## Owner steps

1. Build the iPhone shortcut on an iPhone. The recipe is in `docs/PHONE_CONTACTS_2026-10-05.md`; start at `https://jumpinthemix.com/contacts/from-phone?setup=shortcut`. Send the iCloud link so `IPHONE_CONTACTS_SHORTCUT_URL` can be set on the web service.
2. Decide SEC-01: should a phone key end on Change password, Sign out everywhere or an administrator's session revocation? Lead connection keys don't today.

## NOT RUN

- A real iPhone: the shortcut, Share Contact, Save to Files and list Export.
- A real Android phone: the picker. `docs/ANDROID_CONTACT_PICKER_QUALIFICATION.md` stays blocked.
- The rest of the desktop browser suite, per JITM-12 §2.13. The diff touches only Add a contact, the Contacts tools, Import, the new page and API, the vCard reader and one new table.
- GitHub `validate`: no runner was assigned.
