# Journey clarity and people analytics

## Scope and design

The owner requested the usability cleanup identified in the preceding review and the return of quantity counts and visibility into who is at each status. Journey retains the account's actual Mix/Beat topology and the supplied design's semantic colors, Instrument Sans, light/dark themes, desktop inspector and responsive navigation. The original design export is unchanged. Its stage-centric topology was already superseded by the owner's dynamic graph requirement; its emphasis on real people counts and drill-down now carries into the graph.

The optional status clarification received no answer during implementation. Both workflow status and existing account-defined contact stages are shown. Stage labels are secondary filters and never generate or rearrange Mix/Beat nodes.

## Delivered behavior

- The first view is Progress when the account has nonarchived contacts, and Setup for an empty account. The count strip opens a status-filtered people list. Mix and Beat counts open people at that exact point.
- Counts use the whole account scope, not the visible roster page. Contacts are unique within a status and node, including repeat visits and parallel work. A person can occupy several simultaneous statuses. Completed visits do not make ongoing work look finished. Pausing work does not rewrite completed Beat history.
- Existing follow-ups without a workflow instance are included until adoption; adopted follow-ups are counted through their owning instance once. Prepared follow-up dates, including delays/snoozes, determine ready versus scheduled work. Holds and pending recorded outcomes remain visible after source completion.
- The roster supports status, configured contact stage and name filters, ten-person pages, contact links, follow-up review and exact work drill-down. Pausing, resuming, stopping, recording outcomes, linking appointments and previous visits remain available in the existing work card. Starting work includes an in-place person search and opens the resulting work.
- Results retain connection-start and recorded-choice measures, selectable 7/30/90-day cohorts, waiting/held/canceled counts, individual connection details and optional targets. Strong/below-target labels require a supplied target and adequate observations; no performance judgment is fabricated.
- Copy and controls are reduced: map options and help are disclosures, zoom has one percentage control, error-free diagnostics collapse, and people tools live in Progress/Results. The connection editor reveals timing, labels, branching, joins and repeat settings when relevant. Activation and entry-policy consequences stay explicit.
- Fit mode adapts to available width; manual zoom is retained. When overview zoom hides expanded Beats, their connections anchor to the owning Mix rather than using hidden element coordinates. Connection gestures keep stable canvas geometry when their cancel action appears. Editing protects the draft from switching to another connection. Counts and lists indicate refresh activity while stale roster actions are unavailable.

## Counting boundaries

Map totals exclude archived contacts and include people with no recorded work as Not started. Roster filters narrow the list; they do not silently change the account map totals. Here counts unfinished work at a Mix or Beat; total includes recorded past participation. Paused work remains present. Completed includes successfully resolved/skipped Beats according to the existing engine and is not a sales conversion claim.

Connection results count route visits, not unique people, for work admitted in the selected period using the displayed configuration revision. Repeated visits and parallel choices are explicit; older revision outcomes are not silently blended into newly edited definitions. People counts remain current when inspecting a saved map. No schema migration or workflow execution-engine change is needed.

Analytics reads are scoped to the account and process database records in bounded pages. Totals cover every qualifying record; the response returns a bounded people page. Read work grows with the account's stored participation, so substantial growth may justify persisted aggregates later; no measured large-production-account latency claim is made.

## Verification

Local evidence is retained in ignored `.artifacts/journey-analytics-20260921/`. All 52 focused tests across six suites and all 17 browser scenarios passed. The production build, TypeScript checks, schema/syntax/import checks passed. Screenshots were inspected at phone, tablet and desktop widths in both themes; scoped Axe checks found no violations. Browser coverage includes counts, filters, pagination, exact person/node drill-down, pausing and starting work, advanced outcomes/waits/joins, all four connection endpoint combinations, retries/conflicts, bounded loops, keyboard, touch, zoom and auto-pan. Fixtures are synthetic and isolated from customer contacts and delivery providers.

## Production verification

Published to https://jumpinthemix.com/journey on September 21, 2026. The web service is pinned to application commit `48272e1cd407f973b4aa05a1b6c3cf999d17b4c3`, Render deployment `dep-daop44942hec73fj62p0`, build `5edaMvsj8ruLicrgmslJd`. The worker remains unchanged at `334d59d366254285e9b1aba4f2e8041f5744a2e9`; automatic deployment remains disabled.

Post-deployment verification passed 13 health/public/protected-route checks, matched 783 hosted source files and 20 served assets to the release, and confirmed database readiness. All 18 live browser checks passed, completing at 2026-09-21T20:28:28.806Z. These include real password sign-in, connection save/reload/retry/conflict handling, quantity counts, configured-stage filtering, exact Mix drill-down, and light/dark phone/desktop screenshots with no page errors, overflow or scoped Axe violations. Beat links remain visible after expanding and fitting the phone overview.

The synthetic workspace, user and three contacts were removed and their absence verified. No workflow instances or automated deliveries were created by the live checks. The disposable local database and its private environment file were also removed.
