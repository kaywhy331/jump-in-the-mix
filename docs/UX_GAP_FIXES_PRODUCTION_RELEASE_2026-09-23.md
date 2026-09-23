# UX gap fixes production release — September 23, 2026

The first three fixes from the [deep gap audit](UI_UX_DEEP_GAP_AUDIT_2026-09-23.md) are live at **https://jumpinthemix.com/**:

- Enter can no longer skip onboarding setup.
- Contact, Calendar and Mix editor forms keep what the user typed when a save fails.
- Phone controls meet the 44px touch-target minimum.

The desktop three-pane layout is unchanged.

| Release | Verified value |
| --- | --- |
| Application commit | `5b264a6e76d69b46d8b373ba896bd46bc099219c` |
| Branch | `fix/ux-gaps-20260923` (pushed) |
| Previous production commit | `3f85c775de8c7cad3e84e014b7d47b3122651555` |
| Worker deploy | `dep-daq3bfegekts73bdrpa0`, live 2026-09-23 20:27:01 UTC |
| Web deploy | `dep-daq3cbuk1f9s738b2rhg`, live 2026-09-23 20:31:00 UTC |
| Build ID | `qwkW0uVf86Ggk-REyJM9D` |
| Final check | 2026-09-23 20:40:33 UTC |

## Source and local verification

The release changes 11 files relative to the previous production commit:

- the previous release record
- the audit
- 8 application files
- one new client helper

It touches no schema, migration, dependency, lockfile, Render or Next configuration file.

Local checks:
- Typecheck is clean.
- Unit suite: 1,413 passed. The one failure is `shared-mix-boundary`, which fails identically in the previous production commit.
- An isolated production build with a disposable database passed browser checks:
  - Enter in onboarding opens the review step and installs nothing.
  - An aborted save keeps the typed entries on the Contact form, the Calendar form and the Mix editor, and writes nothing.
  - Phone controls on Today, contact and calendar measured at least 44px, with no horizontal scroll.

## Production checks

**Preflight (read-only)**
- Both services were live on the previous commit, with auto-deploy off.
- The pushed branch matched the release commit.
- The database was ready, the runtime boundary was intact, and all 68 migration checksums matched. No migration was run.

**Deploys**
- The worker deployed first. Its scoped queue probe, using nonexistent contact and Mix IDs, completed and was removed.
- The web service then deployed, with its pre-deploy checks passing.

**Postflight**
- Health checks and public pages returned 200, and signed-in pages redirected to sign-in.
- All 11 release files and 20 served assets matched on the live instance.

**Live smoke** — a temporary synthetic account passed real password sign-in, then:
- In setup, Enter in the Business name field opened the review step. Enter on the review checkbox submitted nothing, and no Mix was installed.
- Installing the mega-mix explicitly reached "Your pipeline is ready". Add your first customer returned to Journey, and nothing started without Start.
- The desktop icons, glossary, Mix Start and merge-field chips were intact.
- On a phone, all 5 contact Back, Edit and stage controls measured at least 44px tall. Back links and the active Today tab worked.
- Light and dark themes both passed accessibility and reflow checks.

The first smoke run stopped on an ambiguous test selector: onboarding has two "Business name" fields. The run cleaned up its account. The selector was corrected and the resumed run passed.

**Final check**
- Record counts matched the preflight baseline.
- There were zero synthetic users, workspaces or probe jobs.
- No jobs failed after the release.
- Health returned 200, and both services were live on the release commit.

Not established: behavior on physical devices, and measured contractor usability.

Evidence (including scripts and JSON receipts): `.artifacts/ux-gaps-live-20260923/` in the release checkout.

## Correction and rollback

Prefer a forward correction. The release changes no schema or worker logic, so rolling both services back to `3f85c77` is compatible; it would restore the previous form and onboarding behavior.
