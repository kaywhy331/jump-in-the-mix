# WF-06 workflow step map

Build-only map for INFRA-W14-RELEASE-WF, November 6, 2026 (UTC).
This is an implementation map, not evidence of a production release.
See [the environment specification](ENVIRONMENT_SPEC.md) for activation,
the single settings block and the reviewed one-off receipt contract.

| WF-06 step | Job / workflow step | Gate and manual work |
|---|---|---|
| 1. Authority and timing | Manual; `release` environment approval | Kevin approves the exact candidate, local baseline evidence, review record, quiet hours and settings; he cuts the releaser tag. W1-1, A1 and h are go-live prerequisites. |
| 2. Fresh workspace | `verify` candidate checkout; `release`/`publish` owner-tag checkout | Distinct hosted runners; candidate code receives no deploy credentials or contents-write token. Kevin prepares the candidate approval record. |
| 3. Candidate verification | `verify` full CI tier, including release-unit tests | Existing CI commands retained, actions pinned, no environment/secrets. **Manual:** local tier 3 versus the previous production build and failure classification under JITM-12 §2.11–§2.14; approval must reference that evidence. Hosted CI is additional evidence. |
| 4. Read-only preflight | `release` → `preflight` | Service identity/domain/current commits, auto-deploy off, three health rounds, changed-file digest; private-network one-off job verifies database, runtime boundary, hold, migration checksums, reviewed diff and baseline counts. Returned job ID / receipt: **to verify in the rehearsal (h)**. |
| 5. Fresh encrypted backup | `release` → `backup` | Private-network one-off job; fresh/encrypted/durable/checksum assertions required even for code-only release. Returned job ID / receipt: **to verify in the rehearsal (h)**. |
| 6. Migration if needed | `release` → `migrate` | `none` requires identical migration-set digests; otherwise the reviewed job key must be bound to the approval and marked forward-only. Private-network assertions cover new objects, runtime role, backup grants and unchanged counts. Returned job ID / receipt: **to verify in the rehearsal (h)**. No reverse migrations. |
| 7. Worker first | `release` → `worker` | Record deploy request and returned ID, observe live candidate, then one-off drain/heartbeat/queue-probe gate before web. Returned probe-job ID / receipt: **to verify in the rehearsal (h)**. |
| 8. Web second | `release` → `web` | Same candidate, keep cache; require worker gate success and Render live status. Provider live status includes the service's configured pre-deploy checks. |
| 9. Postflight | `release` → `postflight` | Live service/health checks plus reviewed one-off public/security/redirect/asset assertions. Job ID / receipt: **to verify in the rehearsal (h)**. The reviewed postflight command repeats a failing read check once when it proves instances are rolling over, preserving both observations; the orchestrator never retries the job-creation POST. |
| 10. Synthetic live smoke and removal | `release` → `smoke`, then `cleanup` | One synthetic owner, contacts without addresses and manual Beats. Cleanup runs even after an observed terminal smoke failure. Database fixture creation/removal are inside reviewed one-off jobs; returned IDs / receipts: **to verify in the rehearsal (h)**. An unresolved operation blocks cleanup too and requires explicit recovery, never an inferred safe retry. |
| 11. Final check | `release` → `final` | One-off final counts equal baseline; no rows/probes/blocks/failed jobs; both services at candidate, auto-deploy off, three health rounds. Job ID / receipt: **to verify in the rehearsal (h)**. |
| 12. Annotated tag | `publish` → `publish` | Every required current-attempt ledger entry must have succeeded; create prod tag using web-live UTC date and SHA7, message includes PRs, deploy IDs and previous SHA; existing tags refuse. |
| 13. Record | `publish` → `publish`; manual PR | Write JITM-15 §2.6 record on a separate record branch. **Manual:** open PR with the emitted title and update feature map if statuses changed; Kevin authorizes its merge. No PR-write permission or merge in the workflow. |
| 14. Owner follow-ups | `publish` job summary | Approval supplies owner steps, NOT RUN and carried follow-ups; summary includes manual record PR. Kevin handles device passes, inbox/monitor settings and tester reload notice. |

Each release step has a persisted `requested` record and a terminal or unresolved
outcome. Composite steps have distinct operation IDs for each provider call or
local gate. A returned one-off job ID occupies the common `render_deploy_id`
field; `evidence.operation_kind` on its request distinguishes job from deploy.
Cancellation or process death after a request leaves the durable gate closed.

Only release appends to the ledger. Publish reads it and writes tags/records;
publication effects have Git refs as receipts. Its own failure cannot trigger
another deployment. Recovery is a future workflow sharing the same concurrency
group, with migrations always forward-only.

NOT RUN: all hosted workflow and production steps. Local parser/unit checks
prove the orchestration contracts only; rehearsal h must prove the provider
protocol and actual job assertions before any go-live claim.
