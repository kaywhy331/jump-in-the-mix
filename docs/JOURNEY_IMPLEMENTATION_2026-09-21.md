# Dynamic Journey implementation

September 21, 2026. Implementation and verification record for the owner's requested account-defined Mix/Beat graph. This follows the earlier proposal and forensic review; those documents remain historical design analysis, not proof that every proposed scenario has been qualified.

Subsequently deployed to the live customer site under the owner's explicit instruction. See [the production release record](JOURNEY_PRODUCTION_RELEASE_2026-09-21.md) for the final revision, migration, live workflow checks and the account-time-zone rendering correction.

## Delivered behavior

- Journey reads actual account Mixes, Beats and saved connections. Setup, Progress and Results share the same graph, with expandable Beats, labeled paths, parallel branches, joins, bounded returns, zoom, a readable overview and a structured list. Archived definitions remain discoverable. The original design export is preserved; the implementation uses the redesign's shared tokens, typography, themes and responsive shell.
- “When should it start?” includes **After another Mix finishes**. It creates a saved connection and inherits the person and piece of work. Existing date/manual/fixed-date starts remain available, as the editor explains. Additional independent starts and connections can coexist.
- Connections support immediate completion, named recorded outcomes, a wait with no recorded outcome, delayed continuation, one matching choice, multiple matching destinations, an intentional end, and a bounded return. Immediate paths and decision-dependent paths use separate groups so an immediate match cannot silently consume an unanswered decision.
- A target can be a whole Mix or an individual Beat. A targeted Beat waits for an incoming connection in future instances, preventing an independent scheduled duplicate. Removing incoming paths exposes a control to restore its scheduled start. Referenced Beats cannot be removed from the Mix until their connections are resolved.
- A join belongs to one selected fork and one execution. It waits for all selected destinations, or the first one, with an explicit option to stop the others. Each destination must complete its own required Beats and decisions. Later connections from those destinations remain independent; a join does not implicitly absorb the rest of the account graph.
- Distinct work for the same contact has distinct instances and Beat visits. “Start for someone” explicitly starts another piece of work. Replayed requests and competing workers do not duplicate that admission. Return connections create new visits rather than recycling earlier completion evidence.
- Today records configured outcomes alongside completion, including a whole-Mix outcome on an eligible final ordinary Beat. Contact profiles and Journey expose waiting decisions, corrections, due Beats, saved history, and pause/resume/stop. Rescheduling keeps the same unfinished obligation.
- The server enforces a ten-second Undo window before progressing. Undo invalidates owned dependent work; a stale delayed decision cannot apply to a later completion. A decision received during a pause is retained for resume. Completed actions and independent instances are preserved.
- The existing worker and durable Job queue drive progression with no open browser. Reconciliation retains the existing scheduler's date/appointment semantics for legacy roots; workflow-owned child visits have stable identities and saved definitions. Future required Beats prevent premature Mix completion even outside the legacy preparation horizon.
- Contact restrictions, Mix availability, instance holds, and source-owned stops prevent dependent progression. Appointment-dependent Beats explain missing anchors, accept an explicit linked appointment, and wait for the visit's recorded outcome. Newly linked appointment work requires manual sending review. Existing bound appointments retain their sending policy.
- Automatic sending rechecks current schedule, review window, contact restrictions, Mix/instance availability and prepared content. Claims serialize concurrent automatic sends for the same contact. Workflow completion is queued with successful delivery.
- A client-side simulator uses the same pure evaluator without creating tasks, contacts or messages. It explores configured outcomes, parallel paths, joins, waiting and return limits. It explicitly does not simulate calendar scheduling or delivery providers.

## Configuration and measurement contracts

An instance snapshots its Mix/Beat definitions and connection revision. Subsequent edits apply to new instances. Disabling or removing a live connection holds further progression through it, including older instances; work already started is retained. Progress can show an instance's saved configuration. Optimistic revision checks reject stale edits while preserving the browser draft.

Results use recorded transitions and decision visits for the selected configuration, restricted to instances started within the last thirty days. “Connection starts” measures started versus eligible continuations; “Recorded path choices” measures selections among resolved decisions, with unresolved counts in the list. Parallel selection percentages may exceed 100% across paths. Strong/weak comparisons require an owner-selected target and a minimum observation count. A desired outcome path must be selected for outcome comparisons; a rejection path is not automatically treated as success. Zero or insufficient observations stay neutral. These are operational counts, not measured business impact or inferred customer intent.

Diagnostics identify empty Mixes, unconnected gated Beats, inactive destinations and missing continuation choices. A branch participating in a join is not flagged as a dead end solely because it has no independent successor. Owners can explicitly mark intentional finishes. The system cannot infer an omitted business step from a business scenario that the owner never configured.

## Data and access

Migration: `prisma/migrations/20260921120000_dynamic_mix_workflows/migration.sql`.

`MixWorkflow` stores account configuration and revision. `MixWorkflowInstance` stores the contact, admission identity, immutable definition, execution state, revision and next worker check. Jump rows reference their exact instance and visit. Existing Jump and outcome records remain the evidence for performed work. Retired Beat rows are retained where saved instances can still require them.

The API uses session workspace ownership, existing same-origin protection, write rate limiting, view-only support-session restrictions, and configuration/instance revisions. It validates that a submitted decision belongs to that exact Beat or eligible finishing Mix. Contact merging moves instances without merging their identities. Account export includes the new configuration and execution records; deletion cascades them.

The local application database was verified as `localhost:5432/jitm` and migrated successfully, including four already-pending additive migrations required by the current workspace. Browser and integration qualification used a separate disposable PostgreSQL cluster and fabricated account data. The disposable cluster and preview processes were stopped and removed after qualification; logs and screenshots were retained. No customer site or staging site was deployed in this implementation session.

## Requested staging deployment

The subsequent deployment request targets the designated test site, `https://jump-in-the-mix-test.netlify.app/` (Netlify site ID `8fd20ccd-5c35-47e5-99ce-98e5670d52fe`). Its identity and private-test environment were verified. The checkout's existing Netlify link points to a different site and was preserved.

Deployment preflight on September 21 was blocked by the existing test database: Neon rejected a connection with SQLSTATE `53000`, reporting that the account or project quota had been exceeded. The already-published site independently returned database readiness **503**, worker health **503**, and recovery-boundary status `unavailable`; liveness remained **200**. No remote migration or publication was attempted. The new workflow schema cannot be installed or verified until database access is restored.

The source snapshot and restricted deployment evidence are under `.artifacts/workflow-deploy-20260921/`. Resume by restoring capacity on the existing test database, taking a pre-migration backup, checking migration history, applying pending migrations, and running database release verification. Then use the documented combined Netlify build/upload, verify preview assets, publish to the stable test URL, and qualify the authenticated Journey and worker there. A local or preview build alone does not qualify the deployment.

The isolated Netlify production-context build passed, including TypeScript, the Next.js adapter, background worker, minute scheduler, recovery probe and edge handler. Its release package is `/tmp/jitm-workflow-staging-20260921`; `netlify-build-final.log` and `build-result.json` retain the successful result. The first packaging attempt omitted `infra/`, which a test import required during type checking; the corrected package includes it. Nothing was uploaded or published. Rebuild with the combined build/upload command when resuming because the adapter's function manifest expires.

## Verification evidence

Evidence is retained locally under `.artifacts/workflow-implementation/` (ignored generated artifacts):

- `full-tests.log`: **176 suites passed, 8 skipped; 1,322 tests passed, 68 skipped**. Skipped tests remain unqualified. This broad run preceded the final focused boundary refinements.
- `final-workflow-tests.log`: **45 tests passed across four suites** after the completion/Undo, retained decisions, joins, activation and committed-decision/timeout race refinements. Covers pure evaluation, database execution, Mix activation policy and automatic delivery checks.
- `browser-flow.json`: Today completion plus a configured choice; exactly one automatic successor with the tab closed; unrelated work unchanged; rescheduling remains pending; invalid decisions, cross-origin writes and unauthenticated reads rejected; local simulation of a decision and parallel split; completion trigger available in the Mix editor.
- `browser-editing.json`: live transition/decision metrics and rejection of a stale configuration save with the typed draft retained.
- `browser-visual.json` and screenshots: light/dark at 390, 834 and 1440 pixels, no page overflow, no browser errors, no Axe violations within the Journey diagram/details surfaces. Additional Results/list checks at 320, 1194 and 1920 pixels also reported no page overflow. List and Results reflow on phone; keyboard movement in the connection editor was checked. The shared confirmation dialog was also checked on a dark phone viewport, including accessibility and Escape dismissal. Screenshots were inspected against the corresponding supplied export screens, with the owner's graph requirement replacing the old stage layout.
- `static.log`, `typecheck.log`, `build.log`: schema/syntax/import checks, TypeScript checking and production build.

The 96-row acceptance matrix is a broader research and qualification register. Only rows with matching evidence are marked verified; several others have partial evidence. Passing the checks above does not establish provider race behavior, screen-reader usability with real customers, large-account performance targets, or measured business outcomes. Connected-network template portability and automatic correlation of arbitrary inbound replies across simultaneous work instances are not added by this implementation; custom outcomes are explicitly recorded, and copied Mixes can be connected locally in Journey.
