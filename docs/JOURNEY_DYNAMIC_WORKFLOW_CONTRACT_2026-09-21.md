# Journey: dynamic workflow and interaction contract

**Implementation follow-up:** see [the implementation and verification record](JOURNEY_IMPLEMENTATION_2026-09-21.md) for delivered behavior and tested limits. The analysis below records the earlier evaluation and recommendations.

September 21, 2026. Proposed behavior, not an implemented feature. Extends the [forensic review](JOURNEY_EXPERIENCE_FORENSIC_REVIEW_2026-09-21.md) and [graph proposal](MIX_HANDOFF_AND_JOURNEY_PROPOSAL_2026-09-21.md). Where those documents previously restricted branching or rejected all loops, this clarification takes precedence.

## 1. Owner requirements and scope

Journey represents the account's actual Mixes, Beats and configured connections. Multiple triggers, concurrent Mixes/Beats, forks, alternative paths and loops are core requirements. Contacts progress automatically where saved rules and recorded events permit it. The diagram exposes missing configuration, unintended dead ends and evidence of strong/weak performance.

The owner's estimate example illustrates possible complexity only. **Do not implement its eight choices, estimate terminology, a particular pipeline, or any sales-stage sequence as universal behavior.** No account receives invented nodes, routes, outcomes or traffic. Optional templates may supply editable configuration when deliberately selected; the runtime and Journey must treat them like any other account-owned configuration.

The mechanics below are recommendations for fulfilling those requirements. Existing schedules remain valid unless deliberately changed. This is a shared workflow model supporting Mixes, Today, Contacts, Calendar and Journey; it is not a second diagram users maintain by hand.

## 2. Separate the definition from each execution

| Concept | Role in the experience |
| --- | --- |
| Mix definition | A reusable plan containing actual Beats and saved rules; shown once in the account map. |
| Beat definition | A configured action within its owning Mix. Connecting to another Beat creates a dependency or admission rule, not a duplicate definition. |
| Control node | A saved start, decision, wait, fork, join or end condition. Label it as such; do not count it as a Beat or fabricate a task for it. |
| Connection | A versioned executable rule specifying source event, condition, target, timing and continuation behavior. |
| Journey instance | One related piece of work for a contact, such as one enquiry, project, visit or recurring occurrence. The interface can use the account's vocabulary. |
| Mix run / Beat execution | One participation in the reusable plan or one performance of the action, with its own state and evidence. |
| Path / loop visit | A particular branch or repeat inside an instance, preserving which decision and iteration created it. |

A contact can participate in several instances, each with several active Mix runs and Beats. An event for one instance must not complete or cancel another. The same Mix can also run again legitimately within a single instance. Deduplicate by the intended admission/visit, not merely by contact plus Mix.

Create instance identity automatically at entry and carry it through handoffs. Do not force users to create a project record for every ordinary follow-up. If an event cannot be matched unambiguously to one of several active instances, hold it for a clear choice rather than apply it to all of them. Show the instance label wherever simultaneous work would otherwise be ambiguous.

## 3. Define the connection vocabulary

These are configuration semantics, not prescribed business stages. Offer plain-language controls in context and keep advanced options collapsed until needed.

| User intent | Required behavior |
| --- | --- |
| Start when any of these happens | Each listed trigger is an alternative entry. Matching events for the same admission are deduplicated; genuinely separate occurrences remain separate. |
| Start after another Mix finishes | Continue for the same contact and instance when that exact run meets its completion policy. No new audience selection or per-contact Start action. |
| Continue after this Beat | Wait for the configured action completion or recorded outcome, then activate the target. Do not infer this dependency from visual order. |
| Choose one path | One explicit outcome selects one route for this decision visit. Conditions must be mutually exclusive or have a visible configured priority. Ambiguous matches are held, never decided by canvas position. |
| Run matching paths together | Evaluate the conditions once for the decision visit and start every selected route. Record the selected set. Zero matches follows a configured fallback or becomes an explained hold. |
| Run these paths together | Start every configured branch, even if their due dates differ. Show all active positions. |
| Wait for a response or a date | Track an actual event subscription and/or timer with a known anchor. Show what is awaited and when the next evaluation is due. |
| Continue after all required paths | Join the required participants from the same fork/iteration. If the split was conditional, wait for the selected participants, not branches that were never started. |
| Continue after the first result | Release once for the same join visit. Explicitly specify whether the remaining owned branches continue or are canceled. A later arrival cannot release it again. |
| Return to an earlier step | Create a new execution/decision visit under the saved repeat rule; retain earlier attempts and outcomes. |
| Finish here | Finish the named path, Mix run or instance. The scope is explicit; completing one path does not automatically end unrelated work. |

A simple merge of alternative routes is not a wait-for-all join. A Mix with several incoming lines is not automatically an AND condition. Distinct choice, parallel and synchronization behavior are established workflow concepts; see the primary [gateway overview](https://docs.camunda.io/docs/components/modeler/bpmn/gateways/) and [exclusive gateway semantics](https://docs.camunda.io/docs/components/modeler/bpmn/exclusive-gateways/). These references inform the model, not a recommendation to adopt that engine or expose BPMN terminology to customers.

Beat-to-Beat and Beat-to-Mix routes must use the same execution service as Mix-to-Mix routes. A cross-Mix edge targeting an interior Beat needs an explicit entry policy: attach to a specified existing run or open an allowed entry in a new run. The editor must identify prerequisite Beats and whether they are required, already satisfied or deliberately bypassed. Silently marking earlier Beats completed is never valid. Beat groups can share wording/templates without sharing completion state.

Completion evaluates the selected execution paths, not every Beat in the reusable definition. A pending decision, required timer, join or future Beat keeps its owning scope open even when no task is currently due. Unselected alternatives do not block completion. A Mix finishes when its configured finish condition is reached and its required owned work is resolved; detached parallel work only continues if that behavior was configured. Finishing an instance does not close the person's entire relationship or prevent a later independent entry.

## 4. The setup flow

1. **Create or open a Mix.** Existing Beats and starts appear immediately in Journey. A blank account offers creation or a deliberate template choice; it has no fictional pipeline.
2. **Set “When should it start?”** Allow one or more supported conditions, including another Mix's completion or a recorded Beat outcome. Separate the reason for entry from the Beat's timing anchor. Default to one simple rule; expose “Add another trigger” when needed.
3. **Set “What happens next?”** From a Beat, decision or Mix finish, select an existing target or create one without losing context. Choose one path, several paths together, a wait, a return, or an intentional end. The owner creates their own outcome labels and conditions.
4. **Check the summary.** Describe who continues, what event causes it, the timing, what happens to the current path, and whether parallel work continues. Display the source and target's actual names. Recipients inherit from the source execution unless the owner explicitly configures a supported alternative.
5. **Preview before enabling.** Simulate representative outcomes, waits, parallel branches and bounded repeats against a draft snapshot. No real tasks, enrollments or messages are created. Show no-match states, conflicting routes, unavailable destinations and missing anchors.
6. **Save/enable once.** Respect existing activation-review preferences. Both Journey and the Mix editor edit the same saved rule. Ordinary execution requires no repeat assignment, tagging, stage change or approval at every connection.

Do not require a general diagram builder to create a simple handoff. A compact form can generate the connection and display it immediately. Dragging a line, if offered, opens the same configuration and validation rather than silently turning on automation.

Saving configuration and enabling it are distinct operations. Empty/draft nodes remain visible but cannot execute. Creation of a connection must not replay historical completions unless the owner deliberately selects a bounded, reviewed enrollment operation.

## 5. Recording decisions with minimal effort

**Doing a Beat and learning a customer's decision are different events.** Sent, attempted, completed, skipped, replied, agreed and declined must not collapse into a single DONE flag. Preserve the current operational outcomes and add account-defined business decision fields with stable identifiers and versioned labels.

Where an action and decision happen together, Today offers one compact completion interaction: record the action, choose the relevant configured outcome if known, and show what follows. Contacts, an appointment outcome and configured inbound integrations use the same decision command and event identity. If no business decision is known, record the action alone and enter the configured wait; users should not invent an outcome to finish their task.

Supported authenticated integrations can supply configured events automatically. Receiving arbitrary message text is not evidence of a particular decision. The system cannot know a contact chose an alternative provider, accepted terms or needs a later date without a recorded decision or reliable mapped event. Unknown outcomes remain visible and actionable without stopping unrelated paths.

A “no response” rule requires an anchor, duration, observation source and scope. If only manual responses are recorded, label it “No response recorded by [date].” Opening an external message app does not prove a message was sent or start a delivery-based timer. A recorded “waiting until [date]” can suspend an ordinary silence timer when the owner configured that behavior.

User-defined outcomes may change over time. Renaming preserves identity and history. Removing a used outcome requires a migration/retirement choice for pending waits and configured routes; it cannot silently orphan them. Unsupported or unclassified events follow an explicit fallback or produce a needs-attention hold.

## 6. Concurrent work, changes of direction and loops

### Parallel work

Starting one path never implies stopping other active Mixes. On a decision route, configure whether it continues alongside the source, ends that source path or replaces specified incompatible owned branches. Default cancellation scope must be narrow and explainable. A stage exit, if configured, uses the same ownership rules; it does not terminate every Mix for the person.

Independent admissions do not acquire parent ownership merely because they use the same Mix. For a duplicate logical admission, show “Already started by [source]”; for a different piece of work, permit its own run. If a configured singleton policy prevents overlap, show the hold and intended resolution instead of silently discarding legitimate work.

For joins, keep the required participants and their states visible. A failed or canceled required branch cannot be silently treated as completed. A skip may satisfy an obligation only under a displayed policy. The owner can configure a failure/timeout route; otherwise the join waits with an actionable reason. Nested forks need their own correlation scopes.

### A decision changes

A later decision can supersede an earlier one within the same piece of work. Record a correction or new decision event with its cause, then stop obsolete unstarted owned work, invalidate pending timers/joins, and activate the new route once. Preserve performed work and explain effects that cannot be reversed. A reply to an old version cannot automatically override a newer version's decision.

Recheck current state before preparing and dispatching outreach. Serialize competing decision/timer transitions per instance or affected execution; revalidate delayed events and dispatch reservations. There is an unavoidable boundary once a provider request has begun: if cancellation loses that race, show the true in-flight/sent state, preserve evidence and prevent future obsolete work. Do not promise to unsend it.

### Loops are legitimate

Allow configured return edges. Each visit creates a new execution with a new iteration identity, even on the same day. Do not reopen and overwrite the previous Beat as though the earlier attempt never happened.

Every repeating path needs a progress boundary, such as a new recorded decision, changed version, future date or bounded counter. Reject autonomous loops that can repeatedly react to the same already-consumed event without waiting or progress. Validate cycles across Mix and legacy stage rules together, not only within each editor.

For automated outreach loops, require a repeat/expiry policy and a visible outcome when the limit is reached: finish, wait for a new event, or request attention. Recurring relationship work can deliberately wait for the next distinct scheduled occurrence; it is not an immediate self-triggering loop. Apply an additional bounded number of transitions per worker evaluation so invalid configuration cannot monopolize processing. Hitting that bound holds the affected path with a diagnosis; it does not silently mark it finished.

## 7. Keep the diagram understandable

The overview shows actual Mix containers and their saved connections. Expanding a Mix reveals its Beats and control nodes. Collapse complexity, not information: display branch/Beat counts, outstanding waits and attention markers on collapsed groups. Never silently drop intermediate nodes or limit the account to six Mixes.

Use stable placement with a consistent main flow direction. Label conditional edges with account-defined outcome names. Render return edges as clearly labeled return arcs. A loop uses one definition node with visit counts and drill-down history, not an ever-growing duplicate chain. Differentiate one-path decisions, parallel splits and joins through symbols and accessible text.

Offer three views over the same structure:

| View | Question answered |
| --- | --- |
| Setup | What can happen under my saved configuration, and where are configuration gaps? |
| Progress | Who is active, waiting or blocked, and why? |
| Results | How did the selected routes perform on the chosen measure and cohort? |

Selecting a contact first distinguishes their active instances, then highlights every active path in the selected scope. Future routes remain conditional. Selecting a line explains the exact rule; selecting a waiting node shows the event/deadline; selecting a loop shows its current iteration, limit and exit conditions. “Why here?” and “What happens next?” must agree with Today and Contacts.

The setup view displays the current published/draft definition. An existing execution may use an earlier revision: show that fact and offer its actual route snapshot. Do not move active contacts onto newly edited paths merely to fit the current diagram. Historical visits remain inspectable after Beats/rules are retired.

Refresh counts and states without moving nodes, closing a details panel or overwriting a form. On phones, provide path focus and a complete structured list alternative; preserve keyboard access, visible focus, readable labels and both themes. Color alone cannot express branch type or performance; see [WCAG use of color](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html). Surrounding controls must reflow even where the diagram needs two-dimensional navigation; see [WCAG reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html).

## 8. Diagnostics and performance must respect branching

| Condition | Correct interpretation |
| --- | --- |
| Empty Mix, missing target, missing required content/anchor | Concrete configuration issue with an in-context repair. |
| Decision has no matching route or fallback | Explained unhandled condition; do not silently choose a path. |
| Several exclusive routes match | Configuration conflict, unless an explicit priority resolves it. |
| Join waits for a branch that never belonged to its fork | Correlation/configuration error, not ordinary customer delay. |
| Wait has a valid future event/date | Intentional waiting, with its reason and age. A missing expiry is only a defect if the owner's policy requires one. |
| All work has ended with no applicable route or intentional finish | Possible dead end; distinguish missing setup from a deliberate stop. |
| Repeat limit reached | Configured finish or needs-attention state, shown with actual iteration count. |
| Owner-defined required milestone lacks a route | Missing expected step. Without that expectation, do not invent industry-specific Beats. |

Route volume is not success. A refusal, pause or closure route may be functioning correctly. Show operational reliability separately from recorded business goals. A heavily used return edge can indicate normal iteration or friction; compare only against a declared expectation or comparable evidence.

Define metric units explicitly: unique people, instances, Mix runs, decision visits and Beat executions are different denominators. Exclusive choices can be shown as shares of the same decision cohort. Parallel path reach is non-exclusive and can legitimately sum beyond 100%; label it accordingly. Repeated loop visits do not become extra customers. Show first-pass results, final observed outcomes and repeat frequency separately where useful.

Use the same source cohort and configuration/observation window for numerators and denominators. Keep waits that are not yet due out of failure measures. Correct retries and superseded decisions without deleting historical evidence. Show insufficient data, untracked outcomes and unlinked legacy history honestly. Goal attribution across simultaneous Mixes needs an explicit policy; recorded association does not prove a Mix caused the outcome.

## 9. Platform-wide consequences

| Surface | Necessary contract |
| --- | --- |
| Mix editor / Journey | Same versioned configuration and validation; changes can target future runs or explicitly reviewed existing runs. |
| Templates | Only deliberately selected templates create local configuration. Copy internal references together; require explicit mapping for external Mix references. No connection back into the library or another account. |
| Today | Show the instance and relevant wait/decision. One recorded action/decision updates all dependent views without repeated user entry. |
| Contacts | Show concurrent instances and paths rather than one universal stage; retain a chronological explanation of decisions, repeats, holds and corrections. |
| Calendar | Bind timing/outcomes to the exact event occurrence. Moving one event adjusts its dependent work without moving another instance's schedule. |
| Quick Add | Keep one-time manual work visible. Attaching it to an instance does not implicitly make it a reusable Beat or enable automatic sending. |
| Imports / forms / events | Preserve source identity and retry protection. Correlate to an existing instance only with sufficient evidence; new independent work can create a new instance. |
| Sending / restrictions | Every path respects current contact and channel restrictions, quiet hours and sending preferences. Multiple valid branches still need coordinated dispatch: serialize overlapping sends, expose collisions, and use only configured spacing/priorities. Do not silently drop one. |
| Pause / resume | Specify path, instance, Mix, connection or contact scope. Show overdue work and timer policy before a resume causes catch-up actions. Global contact restrictions prevail. |
| Notifications | Notify about actionable work or exceptions under saved preferences; do not send a notification for every graph traversal. |
| Merge / archive / restore | Preserve separate work instances when contacts merge. Cancel or hold owned work correctly; restore must not silently replay stale decisions or outreach. |
| Export / delete / permissions | Include new rules, instances and history; enforce workspace boundaries on events, projections, edits and retries. Clear private selections/cache on account changes. |

## 10. Implementation direction and qualification

Extend the existing run/handoff proposal into a versioned directed workflow model. Keep topology, layout, execution state and metrics separate. Proposed persisted concepts include canonical rules/control nodes, journey instances, exact Mix/Beat executions, decision visits, fork/join participants, loop iterations, event subscriptions/timers and a correction-aware transition ledger. Names are implementation choices; their identities and semantics are required.

One evaluator should accept completion, decision, timer and lifecycle commands from all surfaces. Persist state transitions and durable jobs atomically; use unique event/admission keys and worker retry reconciliation. Correlation must include workspace, contact, instance, execution/decision visit and fork/iteration where applicable. A source-run/connection uniqueness constraint alone cannot represent repeated Beat-level traversal. Saved configuration needs optimistic revision checks; executions retain the revision they actually follow.

Recommended sequence:

1. Establish these execution, decision, ownership and revision contracts; project current configuration faithfully without converting its schedule semantics.
2. Implement exact identities, shared transition evaluation, durable timers/jobs and lifecycle handling. Preserve provable legacy history; ambiguous history never triggers new routes.
3. Implement and qualify completion connections, conditional branches, parallel work, scoped joins and guarded loops together with their authoring summaries and simulation. A linear-only pilot is partial scope, not completion of the owner's request.
4. Integrate the shared read models across Journey, Today, Contacts and Calendar; qualify path interruption, late events, duplicate triggers, repeated visits and dispatch conflicts with unattended workers.
5. Qualify graph comprehension, accessibility, realistic graph sizes, diagnostics and evidence-based results. Test accounts with wholly different Mix names, outcome counts, topologies and entry types; the estimate example is at most one configurable fixture.

The [acceptance matrix](JOURNEY_EXPERIENCE_ACCEPTANCE_2026-09-21.csv) adds executable acceptance requirements for this scope. Its rows are planned, not passing tests. Earlier baseline results cover the current application only; none certify this new evaluator, diagram or interaction model. This update changes documentation only. Browser walkthroughs, screenshots, migrations, new behavior tests and deployment remain implementation work.
