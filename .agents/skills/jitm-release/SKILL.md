---
name: jitm-release
description: Jump in the Mix production release, deploy and rollback on Render using the practiced gated sequence — local candidate checks, read-only preflight, fresh backup, reviewed migration job, worker then web deploy, postflight, synthetic smoke, final check, annotated prod tag and release record. Use when explicitly asked to release, ship, deploy or roll back jumpinthemix.com, and only then; never as a side effect of another task.
---

# Jump in the Mix — production release

Follow **WF-06** (`docs/standards/workflows/WF-06-production-release.md`) step by step. JITM-14 holds the environment facts and the release rules. JITM-15 holds the record format. JITM-12 holds the checks.

## Before you start

- **Authority.** Kevin gave agents standing authority to run release steps (JITM-16 §2.6). Pull request merges stay with Kevin. If your own operator or host instructions forbid releases, follow them and ask Kevin (JITM-16 §2.24).
- **Candidate.** The candidate is the merge commit on `main` after Kevin merged the pull request. Release only a commit that is on `main`.
- **Workspace.** Create a fresh worktree at the candidate commit, never a shared checkout. Release scripts and receipts go in a new directory under the git-ignored `.artifacts/`, adapted from the previous release's set.

## The sequence (gates in WF-06)

1. Confirm the target: both service names and ids, the domain and the commit each runs (JITM-14 §2.3).
2. Verify the candidate locally against the previous production build (JITM-12 §2).
3. Run the read-only preflight.
4. Take a fresh encrypted backup.
5. Migrate, only if the release needs it, through the reviewed one-off job.
6. Deploy the worker first.
7. Deploy the web service second, at the same commit, keeping the build cache.
8. Run the postflight after the cutover.
9. Run the synthetic smoke check, then remove every synthetic row.
10. Run the final check.
11. Push an annotated `prod-<UTC date>-<sha7>` tag.
12. Open a record pull request titled `docs: record the <release> release (<sha7>)`, and update the feature map there if statuses changed (JITM-01 §2.22).
13. List the owner follow-ups.

## Rollback

- If a live check fails and the schema is unchanged, redeploy the previous tag: web first, then the worker.
- If a migration shipped, prefer a forward fix.
- Never reverse a migration in place (JITM-14 §2).

## Must-know rules

- Production runs on Render. Auto-deploy is off. Service names and ids are in JITM-14 §2. The Netlify test site is retired.
- Never edit migration history, checksums or the release manifest to make a check pass. Never clear a recovery hold by hand (JITM-14 §2).
- Never print or commit secrets (JITM-11 §2.41, JITM-14 §2.27). Never test with a real customer's account or data (JITM-12 §2.21).
- Stay on the Render free plan: no paid services, releases batched, build cache kept (JITM-00 §2.9, JITM-14 §2).
- Use UTC dates in tags and record names (JITM-14 §2, JITM-15 §2).

## Stop and ask Kevin when

- Any gate fails and the fix is not obvious.
- A permission prompt or safety classifier blocks a step. Do not route around it.
- A migration is destructive.
- A service setting outside the reviewed plan would change.
