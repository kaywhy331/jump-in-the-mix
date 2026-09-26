# Contractor workflow implementation — September 22, 2026

**Published to the stable test site. Local verification passed; signed-in hosted workflows remain blocked by a preexisting database quota outage.**

Implements the 13 findings in the [forensic audit](USER_JOURNEY_FORENSIC_AUDIT_2026-09-22.md), using the [approved approach](CONTRACTOR_UX_APPROACH_2026-09-22.md). The original audit, proposal and their evidence remain historical records. This document records implementation and release evidence separately.

The current navigation, Journey graph, page hierarchy, responsive panes/sheets, shared styles and design export are preserved. Necessary additions use existing form, row, notice and review-dialog components. Installation still does not enroll a person. Saved connections remain dynamic: this does not introduce a fixed contractor pipeline or an approval at every connection.

## Implemented behavior

| Finding | Result |
| --- | --- |
| F01 — First person loses chosen work | Add/import preserves the chosen Mix, label and return path. Start previews actual scheduled dates using the same scheduling function as execution. It requires an explicit start, reconciles repeated requests and opens the correct saved work. Missing appointments retain person/work context through Calendar and back. |
| F02 — Hidden owner decisions | Today includes Needs your input, due callbacks, date repairs and failed preparation with an actionable retry. Deliberate pauses are excluded. Counts and the opted-in digest share the same owner-attention source. Journey also counts an open callback as Waiting, then Needs attention when due, rather than treating its canceled reminders as stopped work. Unknown/preparing states are not reported as caught up. |
| F03 — Early replies and dated waiting | Record a configured outcome before remaining Beats finish, review the actual effect, and cancel only the selected remaining work and affected unperformed dependent paths. Completed and independent work remain. Customer-requested callbacks and owner-chosen checks store one dated commitment with its source/timezone. Date expiry creates an owner action, never an inferred customer acceptance. |
| F04 — Future Review links | Exact follow-up links work independently of due-date, status and search filters; unavailable records provide current context. |
| F05 — False success on stopped work | Starts validate ownership, current Mix/person eligibility, explicit stops and Do not contact inside the transaction. Restrictions are not silently removed. |
| F06 — Decision loading failure | Loading, available choices and failed lookup are distinct. Recording only the real completion is an explicit choice; an unresolved required decision remains visible and retryable. |
| F07 — Incomplete exports | Complete JSON includes contact relationship preferences and attributable Mix stops. The [export inventory](ACCOUNT_EXPORT_INVENTORY_2026-09-22.md) records other included owner data and deliberate security/operational exclusions. CSV describes its narrower scope. |
| F08 — Unclear edit scope | The Mix editor explains that running Journeys retain their saved version. |
| F09 — Lost sign-in destination | The email sign-in form carries the authorized requested destination through the existing safe-return flow. |
| F10 — Hidden alternatives | Other uses/one follow-up is visible. Save answers and finish later retains current setup answers without installing unrelated work or enrolling anyone. Today and Help provide a return to setup. |
| F11 — Reminder handoff | Successful scheduling offers an optional route to the existing owner-reminder settings. Customer automatic sending remains a separate setting. |
| F12 — Missing recovery help | Help now covers connected work, decisions, early replies, callbacks, corrections, stopped work, saved versions, setup and reminders, with relevant links. |
| F13 — Misleading completed label | Completed history shows a neutral original due date instead of a current overdue obligation. |

Early updates use an explicit scope for the selected running Mix and the outcomes in its saved definition. Existing connected work can use this reviewed action without overwriting the reusable definition. Where no business outcome is configured, the interface does not invent one; dated waiting/check-back remains available. Unconnected legacy Mixes retain their existing explicit stop control.

Update and start receipts reconcile uncertain responses. If provider dispatch is already processing, the business fact is saved and its changes wait for the actual delivery result. New claims recheck whether work is still eligible. Undo checks unchanged dependent state and external deliveries; subsequent corrections preserve performed work, the original event and its reversal. A callback keeps the branch waiting, including at parent joins.

## Verification

Local verification used disposable PostgreSQL databases with outbound providers and the background worker disabled. The final application source copy matched all 849 application files checked. Build identifier: `kShZhPwasnoYrtETjnZHr`.

- 179 tests passed across 26 files, including workflow branches, callbacks, correction/Undo, provider-processing deferral, start restrictions and retry receipts, exports, scheduling, notification attention and safe magic-link returns.
- 33 browser scenarios passed across the new contractor desktop/phone journeys and existing onboarding, draft and save-recovery suites. The shared viewport matrix runs once, with its duplicate phone invocation intentionally skipped.
- Both themes and phone/tablet/desktop layouts were checked at 390, 834 and 1440 pixels. The visual matrix includes 24 page scans and four review-dialog scans. Captures require the actual page heading and completed hydration; an earlier capture of the account-loading screen was discarded and the matrix rerun.
- TypeScript, schema validation, syntax/import and Server Action boundary checks, and the production build passed. Schema remains at 68 migrations / 107 models; this implementation adds no database migration.

Detailed evidence is in [the implementation artifacts](../.artifacts/contractor-ux-implementation-20260922/) and [the acceptance record](CONTRACTOR_UX_IMPLEMENTATION_ACCEPTANCE_2026-09-22.csv). Screenshots pair the current screens with the matching pre-implementation build using the same fixtures. Existing CSS, shared tokens, fonts and the original design export were not changed by this implementation.

These checks establish local behavior, not measured ease of use by contractors. Real-device native-app handoff, live reminder-provider delivery and independent contractor usability sessions remain qualification work. Hosted workflow verification is separately constrained below.

## Deployment

Published target: **https://jump-in-the-mix-test.netlify.app/**, Netlify site `8fd20ccd-5c35-47e5-99ce-98e5670d52fe`. The customer site is a separate target.

| Release evidence | Result |
| --- | --- |
| Published deploy | `6ab31f1fec3c94c4ac387199`, Netlify state `ready` |
| Published at | September 22, 2026, 5:40:28 PM Pacific (`2026-09-23T00:40:28Z`) |
| Netlify build | `QH1bhf3u4Mz2MC_p6jJEM`; build and adapter deployment succeeded using the test site's production-context configuration |
| Source parity | All 849 application files checked match the locally verified source |
| Stable publication | Site API confirms `published_deploy.id` matches the reviewed preview deployment |
| Public smoke | Homepage and contractor page return 200; all 15 referenced built assets match local SHA-256 hashes on both preview and stable URLs |
| Liveness | 200 after publication |
| Application readiness | 503, database unavailable, configuration valid; worker and Today also remain unavailable |
| Database check after publication | Read-only connection still returns `53000`, quota exceeded |

Release receipts are `publication.json`, `hosted-preview.json`, `hosted-published.json`, `hosted-database-after.json` and `deploy-source-comparison.json` in the artifact directory. A first build attempt failed locally for insufficient disk space; inactive, regenerable temporary build caches were cleared and the full build/deployment was retried successfully. It did not publish the failed attempt.

Before this release, the test site already returned `503` from readiness/worker checks. A read-only database connection failed with PostgreSQL `53000`: the account/project has exceeded its quota. The test site's configuration was valid and liveness was healthy. Evidence: `hosted-before.json` and `hosted-database.json` in the artifact directory. No database replacement, reset or paid upgrade is part of this release.

The previous published deploy was `6ab03690b7561cda45f6c156`. Old application/worker versions do not understand the new callback/early-update state. Once such state has been written, prefer a compatible forward fix instead of restoring an older release blindly. No hosted business records were changed during the local qualification.

After database quota is restored, verify readiness and worker health, then exercise signed-in start, early reply, callback, reminder and export flows on this published deployment. Until then, publication is verified but live workflow readiness is not. The disposable local databases were dropped and preview processes stopped; the temporary test-site environment copy was removed after deployment verification.
