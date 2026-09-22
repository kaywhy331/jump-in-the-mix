# Complete journeys with mega-mixes

The owner requested a selectable, connected set of mixes covering a business’s customer journey, with Contractor as the example. The implementation adds optional whole-journey setup in onboarding and a library at `/templates/journeys`, linked from My mixes, Ready-made and Journey.

## Included starting points

| Mega-mix | Mixes | Coverage |
| --- | ---: | --- |
| Contractor | 13 | Inquiry, site visit, estimate, booked work, progress, handover, aftercare, concern resolution, review, referral, repeat work, agreed later follow-up and quiet conversations. |
| Real estate | 11 | Inquiry, discovery, search/listing decision, under-contract follow-through, closing handover, aftercare, referrals, continued contact, concerns, later follow-up and quiet conversations. |
| Consultant | 11 | Inquiry, discovery, proposal, engagement, handover/adoption, aftercare, referrals, continued contact, concerns, later follow-up and quiet conversations. |
| Photographer | 11 | Inquiry, coverage, booking decision, shoot preparation, gallery delivery, aftercare, referrals, continued contact, concerns, later follow-up and quiet conversations. |
| Recruiter | 10 | Separate candidate/client entry points and later-contact paths, search updates, interview, offer, placement and separate ongoing relationships. A person’s journey never automatically enrolls another person. |

These are editable starting configurations, not an assertion that every profession-specific situation is covered or that these cadences have measured customer results. The five supplied fictional ICPs informed the situations; their invented customer stories and figures were not used as evidence. Existing ready-made home-estimate, professional-proposal and respectful-reconnect wording is reused where appropriate. Additional milestone and aftercare wording is original. The supplied Joanna Wiebe guidance informed the concrete setup action, preview and explanation of what happens next. Existing source documents and the original design export remain unchanged.

## Behavior

Users preview the actual included Beats, timing, decisions, delays and return-path limits. Adding a mega-mix creates active, manually startable mixes and their editable Journey rules in one transaction. It creates no contact assignments, workflow instances, Jumps or deliveries. Users explicitly start a person at whichever Mix matches their current situation. Existing sending preferences and contact restrictions still apply when work starts.

Milestone paths require a recorded outcome after the current Mix’s Beats finish. A completed/skipped follow-up does not infer acceptance, completed work, a closing, a delivered gallery or an accepted offer. Users can keep a reminder open or snooze it to the agreed time. Review/referral completion paths have explicit delays; completion includes skipped Beats under the existing workflow engine. Return paths have repeat limits. Closing a journey ends that path, without asserting a global do-not-contact preference.

Installation copies definitions into the account; the account’s saved Journey configuration controls subsequent execution. Existing instances retain the workflow engine’s saved snapshots. Installation preserves other mixes, connections, gates and intentional endpoints. Separate pre-existing copies of individual templates are preserved rather than silently repurposed.

A durable installation receipt prevents repeated or concurrent setup from duplicating a mega-mix or overwriting edits, pauses or deletions. New professions merge under the same workspace lock used by Journey editing. Invalid or stale requests roll back. Ownership and support-session restrictions are checked on the server. Receipts are included in JSON account export and cascade on workspace deletion.

Onboarding can finish with no contacts. Business details, timezone and installation commit together. Switching between one-person setup and full-journey setup keeps entered drafts mounted; only the visible form guards navigation. A Start link opens Journey with the selected Mix, Setup mode and person selection already available, including on phones.

## Design assumptions

There is no supplied mega-mix screen. The new library adapts the supplied Mix workspace’s directory, central preview and setup pane; shared semantic tokens, Instrument Sans, Newsreader, flat dividers and violet selection states are retained. At 1200px and above all three panes remain visible so setup is reachable beside a long journey preview; wider displays expand the directory and setup panes. Below 1200px, Journeys / Preview / Add journey controls switch mounted panes. Beat wording uses disclosures. The existing Journey graph remains the visualization of installed account data, with its existing zoom, selection and list controls.

## Local qualification and release requirements

The additive migration `20260922120000_mega_mix_installations` creates the receipt table and unique workspace/blueprint key. The generated release contains 67 migrations and 107 models. This migration must precede application code that reads receipts. Local qualification did not modify a hosted database; the subsequent production publication is recorded below.

Local evidence is retained under `.artifacts/mega-mixes-20260922/`. Qualification includes blueprint reachability and loop validation; real database installation, rollback, concurrent retries, preserved customization, account boundaries and contact-free onboarding; and a worker execution from estimate acceptance into booked-job preparation. Browser scenarios cover preview/install/map/edit/start, account export, onboarding draft preservation, invalid selections and recoverable stale-preview errors. Both themes were checked with keyboard interaction, Axe and horizontal-overflow assertions at 320, 390, 834, 1440 and 1920px. Screenshots were compared with supplied light/dark Mix/Journey desktop, tablet and phone references.

The full five-scenario browser run passed; the responsive scenario was rerun successfully after screenshot review moved laptop setup into its own visible column. The four focused unit/integration suites passed 58 tests, with the 20 new blueprint/installation tests rerun after the last Contractor deferral-path adjustment. Schema, syntax, imports and server-action boundary validation passed. Earlier development runs exposed a missing mobile page heading and a Start link that opened Progress without person selection; both were fixed and verified. The isolated production build passed, including Next.js TypeScript checks and static-page generation. All five browser scenarios then passed against the production build, with the same keyboard/theme/Axe/reflow checks. Source comparison verified that all 893 application, public, Prisma and script files in the qualified copy matched the workspace.

The initial workspace build was interrupted during its broad TypeScript scan; archived source copies under `.artifacts` made that check unnecessarily large. Qualification used an isolated source copy and the same installed dependencies. An initial symlinked dependency attempt was rejected by Turbopack’s filesystem boundary; using local directory entries resolved that build-environment issue. These failed attempts are not counted as passing checks.

The complete source/test TypeScript check also passed in the isolated copy after including its infrastructure and Netlify declaration files. The production preview, disposable database, temporary build/development caches and generated local path changes were removed after verification. Test screenshots, logs and the task file manifest remain in the artifact directory.

## Deployment preflight

On September 22 at 14:26 UTC, the designated Netlify test site's identity and private-test environment were verified. Its existing Neon database still refused a direct connection with SQLSTATE `53000` (account or project quota exceeded). The published site's liveness returned 200, readiness and worker health returned 503, and its recovery probe reported `unavailable`. No hosted migration or publication was attempted. Evidence is recorded in `.artifacts/mega-mixes-20260922/deployment-preflight.json`.

The test release requires restored database access, a pre-migration backup, verified migration history and application of pending migrations before publication to the stable test URL. The owner subsequently selected deployment to `https://jumpinthemix.com/`; that separate Render release was prepared from the previously deployed application revision.

## Production publication

The mega-mix release is live at `https://jumpinthemix.com/templates/journeys`. Both the web app and worker run commit `ef87c3cf9e6015483a2567f27467ea6501533782`, on branch `release/mega-mixes-20260922`. The web deployment `dep-dap9gou0tbcc738snr30` became live at 15:06:42 UTC on September 22; worker deployment `dep-dap9cq0ae00c739hl0f0` became live at 14:54:52 UTC. Automatic deployments remain off.

A fresh encrypted backup was stored at 14:42:28 UTC. All 66 existing migration checksums matched before the isolated migration job applied the new receipt table. The successful job, `job-dap9bmegekts7388jdgg`, verified 67 migrations, 107 models, the unique installation key, workspace deletion cascade, restricted application DML and read-only backup access. It removed its temporary source files. The owner credential was confined to the isolated job. Existing customer record counts were unchanged by the migration.

Hosted verification matched all 917 source/schema/configuration files in the release manifest and 20 served assets. The production build and pre-deployment checks passed. Liveness, readiness and worker health returned 200; authenticated routes, including the new journey library, retained their sign-in boundary. The new worker processed a scoped synthetic queue job successfully.

Live browser qualification passed real password sign-in; Contractor installation with 13 mixes, 24 Beats and 13 saved rules; the populated Journey map; duplicate prevention on repeat visits; opening an included Mix and explicitly starting one synthetic person; and installation receipts in account export. Phone onboarding preserved the one-person draft and completed an 11-mix Photographer journey without contacts. Preview and setup were checked in light/dark themes at 390, 834, 1440 and 1920px, including keyboard operation, Axe and horizontal reflow. Representative live screenshots were inspected. No page errors or automated deliveries were recorded.

All temporary accounts, workspaces, installation receipts and scoped jobs were removed. Final verification at 15:09:24 UTC found the original customer record counts and healthy web/worker endpoints. Evidence remains under `.artifacts/mega-mixes-20260922/`.

The first isolated migration job stalled and was canceled; a read-only check confirmed unchanged migration history and no receipt table before retrying. The first web build stalled while restoring its cache and was canceled; rebuilding the same commit with a fresh cache succeeded. Neither canceled attempt is counted as a passing check. Retain the additive schema for an application rollback; the preceding web release was `def2e96ed80dd5dc6062b5f76f0400da3e377077`, and the preceding worker was `334d59d366254285e9b1aba4f2e8041f5744a2e9`.
