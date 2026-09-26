# Dynamic Journey production release

The owner explicitly requested deployment to the live site after the separate Netlify test database refused connections because its Neon quota was exhausted. The customer site uses a separate, healthy Render database. The dynamic Journey and Mix-completion triggers are now deployed at https://jumpinthemix.com/.

| Item | Verified value |
| --- | --- |
| Final application commit | `334d59d366254285e9b1aba4f2e8041f5744a2e9` |
| Release branch | `release/dynamic-journey-20260921` |
| Initial workflow/migration commit | `6c8927d90d77e29e3f8701f87860c8c912d7a0de` |
| Previous customer release | `9ec7daf4a25af1e4ca86ed2d686d6f4d0579feee` |
| Final Render web deployment | `dep-daollj5g1s2s738og56g` |
| Web live at | September 21, 2026, 16:30:15 UTC / 9:30 a.m. Pacific |
| Final Render worker deployment | `dep-daoljkg473hc73csqmo0` |
| Build ID | `KoF3zVIqLUJbVdHhrvZ2L` |
| Final verification | September 21, 2026, 16:36:13 UTC |

## Database and release checks

- A fresh encrypted backup was stored at 16:01:51 UTC, before migration. Backup run: `crn-dah1j5ht0dsc73e709ig-1790006462`.
- All 64 existing migration checksums matched. The isolated Render job `job-daolapp42hec73ab1t20` verified the exact release archive and applied `20260921120000_dynamic_mix_workflows`. Its temporary source files were removed. The owner credential was confined to that job.
- The database now has 65 matching migrations and 105 application models. The restricted `jitm_runtime` role retains application DML and read-only migration history, with no ownership or elevated grants. The recovery boundary is clear.
- Existing counts were unchanged by migration and after qualification: 2 users, 1 workspace, 2 contacts, 1 access invitation, 4 follow-ups and 1 invitation-delivery record.
- The worker was deployed and passed a scoped queue check before each web publication. Both services finish on the final commit. Automatic deployment settings remain off.
- Render builds and pre-deploy checks passed. Hosted verification matched 776 application/schema/configuration files and 20 served assets. Live, readiness and worker health endpoints returned 200; protected routes retained their sign-in boundary.

## Functional and visual qualification

The release passed 54 focused workflow, delivery, activation and database-permission tests against a fresh disposable database, plus a rendering regression and TypeScript checking. Earlier broad implementation qualification is recorded in [the implementation record](JOURNEY_IMPLEMENTATION_2026-09-21.md).

The final production browser run passed real password sign-in, configuration persistence, idempotent starts, simultaneous work, Today completion with a recorded decision, exactly one automatic successor after closing the tab, parallel branches, an ALL join that waits for both branches, and recorded transition metrics. It also checked the Mix editor's completion trigger, inherited person, cross-origin rejection and unauthenticated access rejection. A bounded return path was configured and displayed; this run did not execute a complete return cycle.

Journey rendered in light and dark themes at 390px and 1440px with no page overflow, no page errors and no Axe violations in the checked Journey surfaces. Screenshots were inspected. Production qualification exposed host-dependent date formatting; the final correction passes the account's saved locale/time zone to Journey and contact progress. The regression compares initial markup under UTC, Los Angeles and Auckland host zones; the final live browser explicitly used Los Angeles with an account set to UTC.

All browser fixtures used an isolated synthetic account, contacts without recipient addresses, and manual phone-call Beats. No automated deliveries were created. The temporary account/workspace and scoped worker probe jobs were removed. Final checks found zero leftover probe jobs and zero failed jobs since the correction began.

Evidence is retained under ignored `.artifacts/workflow-live-20260921/`. The release worktree is `/tmp/jitm-workflow-live-20260921`. No Netlify site was published during this live deployment.

## Correction and rollback

Retain the additive schema. Prefer a forward correction. An older worker predates workflow-owned Beats, saved execution state and routing; do not restart it blindly after workflow instances have been created. Any database restore must account for subsequent writes and follow the existing recovery runbooks. Deployment diagnostics encountered transient provider/SSH failures and an older draining instance; acceptance used the final, verified revision after the rollout.
