# No Mix status — 2026-10-05

**Status:** built on branch `feat/no-mix-status-20261005`, stacked on the decisions in PR #124. Not merged and not released.

**Decision:** D33 ([owner decision log](standards-audit-2026-09-28/OWNER_DECISIONS.md)). Kevin asked for this: "If there is no mix assigned to a contact, then the contact should show something that the contat has no mix … Ideally everyone should be in the journey OR marked as a status/label/ or confirmation where they are not in a mix."

**Rules:** JITM-09 §2.76–§2.77 and §2.24, and JITM-05 §2.2. This is the first build slice in [Mix placement and contact stages](MIX_PLACEMENT_AND_STAGES_2026-10-05.md).

## What changed

**One definition.** `src/lib/contact-mix-status.ts` decides the status in a single SQL expression, so the Contacts row, filter and count, the profile, Today and Journey always agree.

- **In a Mix:** at least one Mix still has work to come for the person. Any of these counts:
  - a pending Beat in a Mix that isn't one-time;
  - Journey work that is running or paused;
  - a Mix started in the last day, while its Beats are still being prepared, either directly or through a newly added tag, and not stopped;
  - a date-based Mix waiting for a repeating or future date.

  One-time follow-ups don't count, and neither does a finished or stopped Mix.
- **No Mix:** none of the above applies.
- **No Mix needed:** the owner confirmed it. The confirmation is stored as `ContactRelationshipState.noMixNeededAt`. It counts only while no Mix work has started for the person since it was set, so joining a Mix makes it lapse without any write. A one-time follow-up never clears it.
- **Do not contact:** the row shows "Do not contact" instead of a Mix status. These people are not counted.
- **Archived** people are left out.

**Contacts:**
- **Rows** show "No Mix" in the warning color, or "No Mix needed" muted, next to the stage. For someone in a Mix, the row is unchanged.
- **The summary** offers "{n} with No Mix", which links to the filter.
- **The filter sheet** has a Mix filter: Everyone, In a Mix, No Mix, or No Mix needed, each with its count. Saved views keep it.
- **The selection bar** has a Mix sheet with two choices:
  - **Add to the Mix**, which asks for a start day like the profile does. The plan, Do not contact and stopped-Mix checks refuse the whole batch, naming the person, before anything is saved.
  - **Mark No Mix needed.** It acts at once, and the notice offers Undo (JITM-08 §2.5). Anyone already in a Mix or marked Do not contact is left as they are, and the notice says so.

  Both return to the same filtered list.

**Profile:**
- A "No Mix" chip, or a neutral "No Mix needed" chip, sits beside the stage chip.
- The chip opens "What's next for {name}". It offers:
  - start a Mix;
  - schedule a one-time follow-up;
  - mark No Mix needed, or remove it.
- The Start a follow-up sheet offers the same confirmation.

**Today:** after Quiet-day check-ins, one line reads "{n} people have No Mix, so nothing will remind you about them", with Review. Review opens the Contacts filter. If the count fails, only the line is hidden.

**Journey People:** a "No Mix" person status appears in the count strip and the status filter. It is never counted per Mix.

**Shared Mix start:** profile Start and bulk Add use one start routine, `startMixForContact` in `src/lib/contact-mix-actions.ts`. Its behavior for a single person is unchanged.

**Schema:** one nullable column, added by `prisma/migrations/20261005200000_contact_no_mix_needed`. It is additive; the previous release never reads it. The account export already includes the whole relationship state, so the export picks up the new field without a change.

## Not in this slice

These come with the next build slice (P4–P6 in the decisions record):
- the end-of-Mix question in JITM-09 §2.77;
- the new-contact setting in §2.78;
- "Everyone" including people added later.

## Verification

All of it was run on TrixBot against the local `jitm_design_local` database. The base is 8bee3b1.

| Check | Label | Result |
|---|---|---|
| `npm run typecheck` | VERIFIED | Passed. |
| `npm run validate:static` | VERIFIED | Passed. |
| Full `vitest run` on the design database | VERIFIED | 288 files passed on the first run. Nine failed only for environment reasons: eight because CI's encryption keys were absent, and the staff-access suite because it needs an empty catalog. With CI's environment the eight passed (50 tests), and staff-access passed through `npm run test:isolated` (9 tests). |
| New tests | VERIFIED | `tests/contact-mix-status.integration.test.ts` (9), `tests/contact-no-mix-actions.integration.test.ts` (6), and a Journey No Mix case in `tests/workflow-analytics.test.ts`. |
| `npm run build` | VERIFIED | Passed. |
| `db:rehearse-migration`, `db:deploy`, `db:verify-release` | VERIFIED | The rehearsal passed, and the release check reported `{"status":"ready","required":75,"missing":0,"mismatched":0}`. |
| Browser specs, desktop and mobile, against the production standalone build with CI's environment | VERIFIED | Covered: `a2-contacts`, `contact-lifecycle-management`, `core-flows`, `core-ux-friction`, `live-search-contact-layout`, `sheet-interactions`, `a2-css-checks`, `follow-up-drafts`, `design-correction`, `journey-analytics`, `preparation`, `quiet-days`, `accessibility`, `journey-connections`, `visual-fitment`, `phone-contacts`, `contact-search-import-jobs` and the new `no-mix-status`. Everything passed except one mobile case, `design-correction.spec.ts:111` (the completion confirmation). It passed alone twice, so it is classified as order-dependent (JITM-12 §2.14). |
| Accessibility of the new elements | VERIFIED | `no-mix-status.spec.ts` runs axe (WCAG 2.0, 2.1 and 2.2 AA) on the filtered list and on the profile with the sheet open, in light and dark, at 1280 and 390. No violations. The chip is at least 44px tall on phones. |
| Screenshots | VERIFIED, inspected | Production build with synthetic people, light and dark, at 390, 834, 1194 and 1920. They cover the Contacts list, the filter sheet, the bulk Mix sheet at 390 and 1920, the profile with each chip, the What's next sheet, the Today line and Journey at 390 and 1920. They match the export's Contacts row anatomy, with the stage chip pattern reused for the Mix chip. The captures stay private in `.artifacts/` (JITM-12 §2.19). |

## Found, not fixed

- **The "Add phone or email" link fails axe's 24px target-size and target-offset check.** It is the existing link on a Contacts row for someone with no phone or email, and it sits too close to the name link above it. It is INFERRED to exist already, because that row's markup for someone in a Mix is unchanged from `origin/main`. It belongs in a separate fix. The new tests give their people a phone so the audit covers this change.
- **Scale.** The count runs on each Contacts and Today load, and the filter reads the matching ids, which are capped at 30,000. Both scan the account's contacts with indexed EXISTS checks. That is fine at pilot scale. A stored status belongs with the scale work parked for paid hosting.
- **A No Mix person can read "Awaiting follow-up preparation" on their profile.** That happens while any of the account's preparation jobs is pending. It was seen locally only because no worker ran. This is existing behavior.

## NOT RUN

- Physical phones and tablets.
- A worker processing the queued jobs. The day of grace for a just-started Mix was exercised through the database, not through the worker.
- A baseline build of `origin/main` for A/B comparison. No failure needed one: every failure was environmental or passed alone.
- Production. Nothing was released.
