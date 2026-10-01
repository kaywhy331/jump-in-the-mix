# Plan limits — implementation record, October 1, 2026

Each plan limits people with follow-ups on (Free 100, Plus 1,000, Pro 5,000) and active Mixes (3, 25, 100). The limits apply only while billing is on, and billing is off in production. This record covers the enforcement. The plans and prices are in the [pricing decision](PRICING_DECISION_2026-09-29.md).

## Kevin's decisions

Asked on 2026-09-30, while the limits work was paused, because automatic additions put people into a Mix without an owner action:
- **Automatic additions beyond the people limit:** skip the person and notify the owner on Today with a link to upgrade, instead of holding them until there is room. Automatic additions are saved dates, tags, imports and Contact stages.
- **The onboarding first follow-up Mix** doesn't count toward Free's 3 active Mixes.

Earlier rules from the pricing decision, lines 18–21: a person counts once; a Mega-Mix counts as one Mix; stored contacts don't count until follow-up is on for them; reaching a limit stops new additions, never access to what the account already has.

**Status:** pull request open; not released. The release (WF-06) needs the additive migration `20261001120000_plan_people`.

| Item | Value |
| --- | --- |
| Branch | `feat/plan-limits-20261001` |
| Base | `origin/main` at `f1ac84d` |
| Workflow | WF-01, then WF-04 with WF-03 and WF-08; skills `jitm-feature`, `jitm-copy`, `jitm-standards-update` |
| Standards | JITM-01 §2.9 and §2.22 (2.2.2); JITM-09 §2.75 (2.3.0); JITM-11 §2.58 (1.2.0); JITM-14 §2.31 (2.1.1); O14 |

## How it works

**People.** A new table, `PlanPerson`, holds the people the plan counts. A person "has follow-ups on" while any of these is true:
- an active assignment on an active Mix, made directly or through a visible tag;
- a running or paused workflow.

Archived contacts, Do not contact, and a Mix stopped for that person don't count.

Before every follow-up generation pass (`reconcileJumps`), `applyPeopleLimit` settles the count for the whole workspace, whatever the pass's filters. It runs under the workspace's own advisory lock (class 814735).
1. Someone with no running Mix leaves the count. A place taken in the last ten minutes is kept, so a start the owner just made can't lose it to a pass that runs before the enrollment is written.
2. Someone new joins while there is room, earliest enrollment first.
3. Anyone left over gets a `MixStop` with reason `plan.limit` in each Mix that would have started for them, and the pass writes one audit entry (`plan.limit.people_skipped`). A skip is final for that Mix. The owner can resume it from the contact page once there is room.

While billing is off, everyone is counted and no one is skipped. So the people an account has when charging starts keep their follow-ups, even beyond the limit.

**Direct starts.** These reserve a place first and are refused with the reason when there is none:
- starting a Mix from a contact;
- a workflow start;
- a new contact's first Mix;
- a visit's plan;
- Resume.

They take the plan's lock before any contact row lock, so they can't deadlock with a pass. A person who already counts always fits. Only the workspace's own contacts can take a place.

**Active Mixes.** These paths check the count inside their transaction, after the workspace lock:
- Activate;
- the Mix editor saving an active Mix;
- adding a ready-made Mega-Mix;
- Marketplace, file and copy installs;
- a ready-made Mix set up as active.

A Mega-Mix counts as one. `ONE_TIME` and `STARTER` Mixes don't count. A Mix whose Mega-Mix already counts takes no new place. Mixes already active when charging starts stay active.

**Today.** A warning notice says how many people were skipped in the last week, the plan's people limit, and how to resume them, with a link to Plan and billing.

## Wording for Kevin's approval (WF-03)

| Where | Text | Claim and proof |
| --- | --- | --- |
| Today notice | "3 people weren’t added to a Mix this week. Your Free plan has room for 100 people with follow-ups on." / "Once there’s room, resume the Mix from their contact page. See plans" | Counted from `plan.limit` stops in the last 7 days; Resume reserves a place (`src/lib/mix-stop-actions.ts`) |
| Contact profile, Mix row | "Not started: plan limit" | The stop's reason is `plan.limit` |
| Refusal, people | "Your Free plan has room for 100 people with follow-ups on. Upgrade your plan to add more." | `reservePeople` refused |
| Refusal, Mixes | "Your Free plan allows 3 active Mixes. Pause one or upgrade your plan to turn on another." | `activeMixLimitRefusal` refused; pausing frees a place |

None of this is visible while billing is off.

## Release notes

- The migration is additive: one table, two foreign keys that cascade, and one index. The previous release never reads the table. The worker fills it on its first pass.
- **When billing is turned on**, `BILLING_ENABLED` and both Stripe secrets go on the worker as well as the web service (JITM-14 §2.31, `docs/BILLING.md`). Without them, the worker never limits automatic additions.

## Known limits

- Changing a Mega-Mix's membership (`updateMegaMixPipeline`) can split it into separately counted Mixes without a check.
- A ready-made Mix set up as active checks the count without the workspace lock, so two simultaneous setups could pass the limit by one.

## Verification

- `tests/plan-limits.integration.test.ts`, 5 tests:
  - billing off counts everyone;
  - existing people keep their place at switch-on;
  - a newcomer beyond the limit is skipped in every Mix and counted on Today;
  - earliest newcomers are admitted first;
  - a place frees when a Mix ends;
  - direct reservations, including another account's contact;
  - Mega-Mix, starter and one-time counting;
  - the engine generates nothing for a skipped person, even on a filtered pass.
- The full Vitest run found one real bug: a workflow start for another account's contact hit a foreign-key error in the reservation. Fixed by limiting reservations to the workspace's own contacts. `tests/contractor-journey.integration.test.ts` covers it.

## NOT RUN

- Browser tests and screenshots of the Today notice and the contact label. They only appear while billing is on.
- A run with billing on in a deployed environment.
