# Second UX gap fixes production release — September 23, 2026

The second group of [deep gap audit](UI_UX_DEEP_GAP_AUDIT_2026-09-23.md) fixes is live at **https://jumpinthemix.com/**:

- an honest welcome notice
- signed-out drafts that stop retrying and keep the user's wording
- field borders with 3:1 contrast
- named tag and date-type controls

The desktop three-pane layout is unchanged.

| Release | Verified value |
| --- | --- |
| Application commit | `0b175a5a14e946156c942a04e59b6680cc4f7ac4` |
| Branch | `fix/ux-gaps-20260923` (pushed) |
| Previous production commit | `5b264a6e76d69b46d8b373ba896bd46bc099219c` |
| Worker deploy | `dep-daq45uou01pc73fo6lfg`, live 2026-09-23 21:23:23 UTC |
| Web deploy | `dep-daq475mgekts73bh03vg`, live 2026-09-23 21:28:25 UTC |
| Build ID | `FcRYIgfQ08o2jlJYEqb9H` |
| Final check | 2026-09-23 21:30:57 UTC |

## Verification

**Local**
- The release changes 12 files relative to the previous production commit. None is a schema, migration, dependency, lockfile, Render or Next configuration file.
- Typecheck is clean.
- Unit suite: 1,413 passed. The one failure is the same `shared-mix-boundary` failure that production already has.
- An isolated production build passed browser checks for all four fixes:
  - The welcome notice was correct for both an empty account and an account with follow-ups.
  - Clearing the session mid-edit left the draft signed out with no retry loop, and the wording stayed intact.
  - Computed border colours were correct in light and dark themes, and the focus colour still took precedence.
  - Tag and date-type toggles had accessible names, and their inputs had visible labels at phone width.

**Preflight (read-only)**
- Both services were live on the previous commit, with auto-deploy off.
- The pushed branch matched the release commit.
- The database was ready, the runtime boundary was intact, and all 68 migrations matched. No migration was run.

**Deploys**
- The worker deployed first. After waiting for the prior instance to drain, its scoped queue probe completed and was removed.
- The web service deployed second, with its pre-deploy checks passing.

**Postflight**
- Health checks and public pages returned 200, and signed-in pages redirected to sign-in.
- All 12 release files and 20 served assets matched on the live instance.

**Live smoke** — all 8 checks passed with a synthetic account:
- Sign-in and setup, including the Enter-key safety.
- Mega-mix install and the first customer.
- The desktop icons, glossary and Start button.
- **New in this release:**
  - The welcome notice did not promise a Review when nothing was due.
  - Field borders used the 3:1 token.
  - The tag inputs were labelled.
- On a phone, controls measured at least 44px. Back links worked, and light and dark themes passed accessibility and reflow checks.

**Final check**
- Record counts matched the preflight baseline.
- There were zero synthetic rows or probe jobs, and no jobs failed after the release.
- Health returned 200, and both services were on the release commit.

Not established: behavior on physical devices, and measured contractor usability.

Evidence: `.artifacts/ux-gaps2-live-20260923/` in the release checkout.

## Correction and rollback

Prefer a forward correction. No schema or worker logic changed, so rolling both services back to `5b264a6` is compatible.
