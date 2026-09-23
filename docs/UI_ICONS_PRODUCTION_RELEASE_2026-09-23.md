# UI icons and workflow production release — September 23, 2026

The [phone-familiar icon and workflow changes](UI_UX_WORKFLOW_AND_ICON_IMPLEMENTATION_2026-09-22.md) are live at **https://jumpinthemix.com/**. Both Render services run the same revision. The desktop three-pane structure is unchanged.

| Release | Verified value |
| --- | --- |
| Application commit | `3f85c775de8c7cad3e84e014b7d47b3122651555` |
| Branch | `release/ui-icons-20260923` (pushed) |
| Previous production commit | `006d44501b1bc2da06ca0a7bcad24904569006c2` |
| Worker deploy | `dep-daptlljtqb8s73dohreg`, live 2026-09-23 13:59:08 UTC |
| Web deploy | `dep-daptp3e7bikc738pg9q0`, live 2026-09-23 14:08:56 UTC |
| Build ID | `HLivQgy6-c4wKhX8IhI0V` |
| Final check | 2026-09-23 14:11:12 UTC |

## Source

- **Isolated worktree.** The release commit was built in an isolated worktree created from the running production commit.
- **What it contains.** The commit adds exactly 59 files: the 57 reviewed implementation and test files plus the audit and implementation documents.
- **Baseline check.** Before overlaying, each file's production copy was confirmed identical to the reviewed baseline.
- **Untouched areas.** The release changes no schema, migration, dependency, lockfile, `render.yaml` or Next configuration file.
- **Working tree preserved.** The original dirty working tree was left as it was.

Checks in the release tree:
- Typecheck and static validation passed.
- The unit suite ran against a disposable migrated database: 1,413 passed, 1 failed. The failure is the existing `shared-mix-boundary` source assertion on `templates/page.tsx`, a file this release does not change.

## Production checks

**Preflight (read-only)**
- The pushed branch matched the commit.
- Both services were live at the previous commit with auto-deploy off, and health returned 200.
- The database was ready with the restricted runtime boundary intact and no recovery hold.
- The source identity matched, and all 68 migration checksums matched the release tree. No migration was required or run.

**Worker**
- Deployed first.
- Its first probe attempt returned no output while the prior instance was still draining.
- After the worker's SSH session reported the new commit, one scoped queue probe with nonexistent contact and Mix IDs completed. It created no follow-up and was removed.

**Web**
- Built and passed its pre-deploy database checks. Deployed second.

**Postflight**
- Both services were live on the release commit.
- Health (live, ready, worker, recovery boundary) and public pages returned 200.
- Signed-in-only pages redirected to sign-in.
- All 59 release files and 20 served assets matched on the live instance.
- The database stayed ready.

## Signed-in qualification

A temporary synthetic account passed real password sign-in, then:

- Onboarding explained the ready pipeline. Installing the mega-mix ended at **"Your pipeline is ready"** with **Add your first customer**, and created no contact, follow-up or delivery.
- Add your first customer saved the person and returned to Journey with the entry Mix ready. Nothing started without an explicit Start.
- On desktop:
  - The Today navigation uses the house icon.
  - Contacts shows the person-plus action.
  - The glossary sheet explains the brand names.
  - The Mix header offers Start.
  - Merge fields appear as readable chips.
- On a phone:
  - Sub-pages show chevron back links.
  - The active Today tab is highlighted.
  - Search Today is visible.
  - Light and dark themes passed accessibility scans and reflow checks, with no page errors.

The account, workspace, contact and installation were removed. The final check found record counts identical to the preflight baseline, and zero synthetic users, workspaces or probe jobs. No jobs have failed since the release began, and health is 200.

Not established by this release: physical-device behavior, and measured usability with contractors.

Evidence: [release artifacts](../.artifacts/ui-icons-live-20260923/), including the scripts, JSON receipts and live phone screenshots.

## Correction and rollback

Prefer a compatible forward correction. This release changes no schema or worker code. Rolling both services back to `006d445` restores the previous UI, but not the archive-Undo or Today return links used in the meantime; those links simply stop appearing.
