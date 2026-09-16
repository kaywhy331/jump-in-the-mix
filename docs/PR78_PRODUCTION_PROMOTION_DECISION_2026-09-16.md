# PR #78 production-promotion decision packet — September 16, 2026

**Decision: HOLD. Production promotion remains unauthorized.** Review and integration into `codex/production-release-checkpoint` are separate from publication or deployment. The [qualification receipt](PR78_QUALIFICATION_2026-09-16.md) records the completed tests and restoration; this packet preserves their limits and the requirements for a later decision.

## Candidate and unchanged systems

- Qualified runtime/source: `1ec6e0e30c389048e44fb76b525c6efbd0af4a6f`.
- Qualified standalone archive SHA-256: `d7b9c1f553a0a8aee7219defb7ee60acd32013950b3923a1d71fc8a9495ae855`; build ID `E07Nn9veTwR1l6amA9cbd`.
- Qualified Netlify application ZIP SHA-256: `e564d23473574dbfb9a095383cc2cb4e682aadb1444ca7c73c1da826fa39841b`; build ID `ebM5Ztcp5XrmgGNS94pks`. The other function and release hashes are in the qualification receipt. Its disposable deploy has been deleted, with bundles retained privately for review.
- Evidence-only finalization changes documentation. Before integration, compare the final head to `1ec6e0e` across every tracked non-documentation file, including runtime source, dependencies, migrations, release inputs, tests, workflows and hosting configuration. Record the final head, comparison result, required check URLs and merge SHA on PR #78; a fresh build must not be described as byte-identical merely because source is unchanged.
- Read-only Render listings during finalization confirm production web and worker remain on `840261884697ed60d9df658d8c648a63ab1d5549`, deploys `dep-dal0138ae00c73f2q1ng` and `dep-dal01r8ae00c73f2snmg` respectively. No production deployment or database operation is part of checkpoint integration.
- The test site remains on original deploy `6aa99626d303505e51d13d2d` with its original environment restored and compared. The original database checksum mismatch remains untouched: migration `20260906010000_customer_journey_intake_calendar`, expected `2a477774ca7621ede25bc11072596ef8160217212326175d32ed569acc348d2c`, stored `bd95076c17c8b59373808e7cf4f5413661413980fdfc22c59b6ef09963669484`.

## Evidence boundaries and remaining gaps

| Evidence | Disposition |
| --- | --- |
| Packaged standalone server behind trusted HTTPS termination; real sign-in, protected routes/mutation, security controls, clear/held/unavailable/timed-out recovery and actual worker processing | **PASSED locally**, 60 tests across completed qualification runs |
| Actual hosted cold/warm requests, authenticated routes, synthetic mutation/worker processing, access controls and unavailable-state recovery | **PASSED** on the disposable clean database |
| Actual hosted recovery hold | **BLOCKED**, SQLSTATE `42501`; provider owner lacked permission to set `jitm.recovery_hold` |
| Actual hosted induced timeout | **NOT RUN**; an outage that recovers does not establish timeout behavior |
| Candidate deployed on actual Render infrastructure | **NOT RUN**; the local equivalent establishes topology evidence only |
| Physical-device matrix and capacity qualification | Not established by this run; Chromium mobile emulation and a few cold/warm samples do not close these gates |

No repeated blocked hold attempt, privilege change, new environment, shared-history edit, manifest workaround or further publication is authorized. Closing or explicitly accepting an evidence gap needs a separate production decision; this integration does neither. The existing test database cannot qualify the unchanged candidate manifest while its mismatch remains.

## Final review and integration gates

Code/security review of the fix found no merge-blocking finding. With no dedicated probe path, standalone uses the existing bounded persistent-catalog database read. A configured probe requires an operator-supplied HTTPS root origin and a valid path, refuses redirects, and never derives its address or credentials from request/forwarded headers. Invalid configuration, failed reads, malformed results and expired deadlines remain unavailable and fail closed.

The read deadline remains 7 seconds, the outer hosted check 8 seconds, connection timeout 5 seconds, query timeout 2 seconds and statement timeout 1.5 seconds. TLS verification, private-site and worker authentication, session checks, CSRF controls, security headers and recovery exemptions are unchanged. Persistent workers retain their existing 30-second release recheck interval; startup/handoff tests do not claim an instantaneous cutoff of work already in flight.

Required checks on the final PR head are CI `validate`, Security `secret-history` and `dependency-audit`, and Docker `production-image`, `backup-image` and `monitor-image`. No manual status override, bypass, or inherited green status from an earlier SHA substitutes for final-head results.

Before merging, confirm approval, the exact final head and checkpoint base, all checks, and deployment isolation. The audit found Render web/worker/backup automatic deploys off and tracking `main`; both related Netlify sites have no Git repository connection; GitHub has zero repository webhooks. The CI/build/security workflows run on pull requests and pushes to `main` and do not publish; the private test worker is schedule/manual only. Only the four current workflow files exist on both `main` and the checkpoint; historical one-time workflow records are not present in either tree. Refresh this audit before merge. Stop if merging could automatically deploy. Do not merge into or move `main`.

## Order for a separately authorized production promotion

1. Obtain explicit production approval naming the pinned revision/artifacts, the remaining evidence gaps and the accepted qualification scope. Refresh backup freshness and a usable restore receipt, read-only migration/checksum inventory, runtime-role inspection, worker health and the behavioral rollback-risk audit. The prior production audit at 05:46:43 UTC found 60 matching applied migrations and zero affected risk rows; it is a historical snapshot, not a current guarantee. PR #78 adds no migration. Stop on drift instead of repairing history or repeating owner migration work.
2. Verify the exact approved web and worker build provenance and the intended configuration. Keep automatic deploys off. A rebuild has new artifact identities and requires its own recorded checks; this receipt does not qualify arbitrary future builds.
3. Deploy the **worker first**, at the approved revision, and verify release/readiness, heartbeat and authorized synthetic job processing. Then deploy the **web at the same revision** and verify actual sign-in, protected reads/mutations, access controls and relevant recovery behavior. Keep the mixed-version interval short. New web behavior must not create elapsed/variant/draft work while the legacy worker is still running.
4. Record both deploy IDs, commit/build hashes, health and authenticated smoke results, backup/restore references and the post-deploy observation window before declaring promotion successful. This is a future sequence, not authority to execute it now.

## Rollback safeguards

Triggers include recovery-clear sign-in returning 503, failed authenticated workflows, held/unavailable/timed-out recovery admitting requests or jobs, exceeded deadlines, authentication regressions, unhealthy worker processing or a failed release check.

`8402618` is the verified live baseline, but rollback to it is conditional on current data behavior. Its worker ignores elapsed-minute anchors, selected-family variants and JumpDraft state; reconciliation can cancel a new occurrence and create a legacy replacement without preserving draft/snooze behavior. Additive schema compatibility alone does not make that rollback safe.

Before an old worker can resume after new behavior has been used, review pending Jumps with non-calendar timing anchors, selected families or drafts, canceled drafted Jumps (including merged-contact carryover), and non-calendar MixSteps including inactive ones. If affected records exist, obtain an approved containment and record-handling plan first. Do not blindly restart the old worker, rewrite queues or records, reverse migrations, change privileges, or weaken fail-closed checks. Preserve the migrated schema and deploy/configuration evidence together. None of these rollback actions is authorized by checkpoint integration.
