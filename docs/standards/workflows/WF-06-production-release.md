---
id: WF-06
title: Production release
status: active
version: 1.0.0
owner: Kevin
last_reviewed: 2026-09-28
standards: [JITM-12, JITM-13, JITM-14, JITM-15, JITM-16]
skills: [jitm-release]
---

# WF-06 — Production release

**Trigger:** the task explicitly asks to release, deploy or roll back production (jumpinthemix.com). A release never happens as a side effect of another task.
**Inputs:**
- the candidate, which is the merge commit on `main` after Kevin has merged the pull request;
- the previous production tag;
- whether the release includes a migration;
- JITM-14.

## Steps

1. **Confirm authority and timing.** Kevin's standing authority lets agents run these steps (JITM-16 §2.6). If your own operator or host instructions forbid releases, follow them and ask Kevin (JITM-16 §2.24). When the release changes customer-visible behavior, check that its merged pull requests have a WF-05 verdict (JITM-17 §2.10). Releases are batched and run in quiet hours, with testers told to reload afterwards (JITM-14 §2.26).
   **Gate:** the task asks for a release, and the candidate is on `main`.
2. **Prepare the workspace.** Create a fresh worktree at the candidate commit, never a shared checkout. Release scripts and receipts go in a new directory under the git-ignored `.artifacts/`, adapted from the previous release's set (JITM-14 §2).
3. **Verify the candidate locally.** Run tier 3 (JITM-12 §2.11) against a build of the previous production commit (JITM-12 §2.14).
   **Gate:** no failure is unique to the candidate.
4. **Run the read-only preflight.** Confirm that:
   - the target is right: both service names and ids, the domain and the commit each runs (JITM-14 §2.3);
   - both services are live on the previous commit, with auto-deploy off;
   - health answers 200 three times;
   - the database is ready, the runtime-role boundary is intact, and there is no recovery hold;
   - applied migration checksums match the release tree;
   - the diff touches only reviewed schema, dependency and configuration changes.

   Record the record-count baseline and hash the changed files.
   **Gate:** every check passes; otherwise stop.
5. **Take a fresh encrypted backup** before any change (JITM-14 §2).
6. **Migrate, only when the release needs it.** Run the reviewed one-off job inside Render's network with the owner role. Then:
   - re-verify the runtime role;
   - check the new objects;
   - confirm the backup role can read new or altered tables (JITM-11 §2.33);
   - confirm record counts are unchanged.

   The old code keeps serving meanwhile.
7. **Deploy the worker first,** at the release commit.
   **Gate:** the new instance reports the commit after the old one drains, and a scoped queue probe creates nothing.
8. **Deploy the web service,** at the same commit, keeping the build cache.
   **Gate:** the pre-deploy checks pass and Render reports the service ready.
9. **Run the postflight** after the cutover completes. Confirm that:
   - both services run the release commit;
   - the public, security and redirect checks pass;
   - the health endpoints answer 200;
   - signed-in pages redirect to sign-in;
   - the release files and served assets hash identically, and deleted files are gone (JITM-14 §2.16).

   If a check fails while instances are rolling over, re-run it once before treating it as a failure.
10. **Run the live smoke test with one synthetic owner** (the checks in JITM-14 §2), then remove every synthetic row.
11. **Run the final check.** Confirm that:
    - record counts equal the baseline;
    - no synthetic rows, probe jobs or rate-limit blocks remain;
    - no jobs failed since the release;
    - health answers 200 three times;
    - both services are on the release commit with auto-deploy off.
12. **Tag the release** with an annotated `prod-<UTC date>-<sha7>` tag. Its message names the release, the pull request, both deploy ids and the previous commit. Push the tag.
13. **Write the record** following JITM-15 §2, in a record pull request titled `docs: record the <release> release (<sha7>)`, and update the JITM-01 §2.22 feature map there if statuses changed. Kevin merges it.
14. **List owner follow-ups:** the steps only Kevin can take.

## Rollback

- **When:** a live check fails after deploy and no compatible forward correction is obvious (JITM-14 §2.22).
- **Schema unchanged:** redeploy the previous tag, web first and then the worker, verify, and record.
- **Migration included:** prefer a forward correction. Never reverse a migration in place.

## Evidence to produce

- The preflight, postflight, smoke and final-check results.
- The deploy ids, the tag, and the record.
- The NOT RUN items, such as physical devices.

## Done when

- The tag is pushed.
- The final check is clean.
- The record pull request is open.

## Stop and ask Kevin when

- Any gate fails and the fix is not obvious.
- A safety classifier or permission prompt blocks a step. Do not work around it.
- A migration is destructive.
- A service setting outside the reviewed release plan would change.

## Changelog

- 1.0.0 — 2026-09-28 — Initial version, codifying the release sequence practiced since 2026-09-21.
