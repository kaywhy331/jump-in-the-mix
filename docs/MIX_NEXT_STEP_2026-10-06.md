# What happens next for a person — 2026-10-06

**Status:** built on branch `feat/mix-next-step-20261006`, stacked on PR #125 (the No Mix status). Not merged and not released.

**Decisions:**
- **D33** (confirmed 2026-10-05): when a Mix ends without a connection, the last Beat's outcome asks what's next.
- **D34** (default C), with **P5's import confirmation** and **P6** confirmed: imports ask before using the default Mix, and "Everyone" includes people added later. The rest of P5 is still `[PROPOSED]`.
- **D44** (2026-10-06, recorded on #125): the wording "No Mix will remind you about them".
- **D48–D53** (2026-10-06): Kevin adopted the recommendations for this slice's six open choices. They are listed under "Decisions made during the build" below.

All four are in the [owner decision log](standards-audit-2026-09-28/OWNER_DECISIONS.md).

**Rules:** JITM-09 §2.77, §2.78, §2.75 (plan limits) and §2.25 (Today states only what is true). This is the second build slice in [Mix placement and contact stages](MIX_PLACEMENT_AND_STAGES_2026-10-05.md).

## What changed

### The end-of-Mix question (§2.77)

**When it asks.** The owner records Sent, Done or Skip on a follow-up, and that closes out a Mix for the person. Today then asks "What's next for {name}?". A Mix has ended for a person when all of these are true (`src/lib/mix-end-question.ts`):
- every Beat of the Mix has come due for them;
- none of those Beats is still open;
- a date-based Mix has no next date waiting;
- no switched-on connection leads on from any Beat of the Mix, or from the whole Mix.

**When it doesn't ask:**
- The person is still in another Mix, so they aren't falling through (D48).
- The owner promised a next follow-up in the same outcome. That already answers the question.
- The Mix is a one-time follow-up.
- The person is marked Do not contact, or is archived.
- A Beat still waits for a visit or a connection.

**Where it appears.** The question waits in the stack of confirmations at the bottom of Today, above "Follow-up completed", like the export's sent confirmation (`TodaySent`). It lives outside the list, so Today's refresh after the outcome doesn't remove it. It names the Mix that finished and says "No Mix will remind you about them.", plus "A one-time follow-up is still coming." when one is pending (D44, §2.25).

**What the owner can do:**
- **What's next?** opens a sheet with the same three answers as the profile's What's next sheet:
  - **start a Mix:** a Mix other than the one that just finished comes first, with a start day;
  - **schedule a one-time follow-up;**
  - **mark No Mix needed.**

  Each answer returns to Today with its notice. Marking No Mix needed offers Undo there.
- **The close button ("Not now")** changes nothing, so the person stays No Mix.
- **Undo on the outcome** takes the question away.
- **A retried outcome** whose first answer was lost asks again.

### "Everyone" includes people added later (P6)

- **The flag.** A Mix records that its audience is Everyone in `Mix.audienceEveryone`. The editor, ready-made setup and the Mix page read the flag. Before this, the Mix page guessed from the assignments that existed. The checkbox now reads "{n} active people, and anyone you add later".
- **One routine for new people.** `placeNewContacts` (`src/lib/new-contact-placement.ts`) runs inside the transaction that creates them, however they arrive:
  - Add a contact;
  - Quick Add;
  - CSV and vCard imports, the Android picker and shared iPhone cards;
  - lead connections;
  - "Added with a visit";
  - onboarding;
  - invitations.

  It gives each newcomer an audience assignment, as the Mix's own save does.
  - A Mix that starts when the owner starts it begins from the moment they were added.
  - A broadcast whose time has passed is left out, so nobody receives it late as an overdue follow-up.
  - Do not contact and the plan's limit hold these follow-ups as they hold any audience's (§2.75).
- **Existing Mixes.** The migration marks every Mix that still has Everyone assignments. Those Mixes keep their audience, which now includes newcomers (D52). The release counts the accounts that have such Mixes and reports them to Kevin.

### The New contacts setting (§2.78, D34)

- **The setting.** Settings → New contacts (`/settings/new-contacts`) offers three choices, stored on `WorkspacePreference`:
  - **Leave them out** (the default): they show as No Mix;
  - **Add them to a Mix:** a Mix that starts when the owner starts it, from the day they're added;
  - **Ask each time.**

  A chosen Mix that is later turned off or removed counts as none, and the page says so.
- **Add a contact.** With a chosen Mix or Ask each time, the First follow-up starts ticked for today. With a chosen Mix, that Mix is preselected and the form says the setting chose it. The Mix list now includes Mixes that start when the owner starts them; such a Mix begins on the follow-up date. A person added to start a Mix chosen in Journey is left as before.
- **Quick Add.** A new person's review offers "Add to a Mix", with the setting's Mix preselected (or none for Ask each time), and the receipt names the Mix that started. The choice is a direct start, so the plan's limit refuses it with its reason (§2.75).
- **Phone contacts and lead connections** start the setting's Mix. With Ask each time there is no one to ask, so they wait on Today's No Mix line, where Review opens them together for one bulk Add (D50).
  - Each lead connection can follow the setting, choose its own Mix or start none (`IntakeConnection.newContactPlacement`).
  - A connection whose chosen Mix was deleted starts none and says so.
  - People already in Contacts are left as they are.
- **Imports.** The review step asks "Add the {n} new people to a Mix", with the setting's Mix preselected (none when the import was opened to start a Mix from Journey). It also names the Mixes for Everyone that the new people will join.
  - The queued batch keeps the answer. Batches queued before this release start none.
  - People who can't start the Mix are skipped, like any automatic addition (§2.75).
- **A Contact stage's own Mix.** When a person's stage starts its Mix, the new-contact Mix is not added on top.
- **Shared start routine.** Starting one person on a Mix moved into `src/lib/contact-mix-start.ts`, so the profile, bulk Add, Today's question and these paths share it. A start with no user is audited as the system's.

**Schema:** two additive migrations.
- `20261006120000_mix_audience_everyone`: `Mix.audienceEveryone`, set for Mixes that still have Everyone assignments.
- `20261006130000_new_contact_placement`: the `NewContactPlacement` enum, plus nullable or defaulted columns on `WorkspacePreference` and `IntakeConnection`, with foreign keys that clear when the Mix is deleted.

The previous release never reads any of these. Rollback: redeploy the previous commit. The columns stay, stored choices are inert under the old code, and they apply again on re-promotion. There is no reverse migration (JITM-14 §2.24).

## Decisions made during the build

The decisions were silent on six implementation choices. Kevin asked for the most logical, easiest workflow and adopted the recommendations (D48–D53, [owner decision log](standards-audit-2026-09-28/OWNER_DECISIONS.md)):

| ID | Choice | Why |
|---|---|---|
| D48 | The end-of-Mix question asks only when the person is left with no Mix. | Fewer interruptions. It appears exactly when someone would otherwise fall through. |
| D49 | Only Mixes that start "When I start it for someone" can be the New contacts Mix, or the Mix offered in Quick Add and imports. | A birthday, broadcast or after-another-Mix Mix can't sensibly start "today" for a new person. This is the same rule as a Contact stage's Mix. |
| D50 | With "Ask each time", people from the phone and from lead connections wait on Today's No Mix line. | No one is there to ask when they arrive. Review opens them together for one bulk Add, and a connection can choose its own Mix to make it automatic. |
| D51 | People added with a visit, during onboarding or by an invitation don't take the New contacts Mix. They still join Mixes for Everyone. | A visit is already a next step, onboarding starts its own Mix, and invitees are peers trying the app. "Everyone" keeps one meaning. |
| D52 | Mixes already saved with Everyone take in people added after the release. | One meaning everywhere. The checkbox says "and anyone you add later", and past broadcasts are skipped. |
| D53 | Over the people limit, an import's Mix skips those people, and a Mix chosen in Quick Add is refused with the reason. | A large import isn't blocked by a few people. Quick Add keeps the draft and offers "No Mix for now". This applies only while billing is on. |

## Verification

All of it was run on TrixBot against the local `jitm_design_local` database, with CI's environment. The base is a05b189 merged in.

| Check | Label | Result |
|---|---|---|
| `npm run typecheck`, `npm run validate:static`, `npm run standards:check` | VERIFIED | Passed. Standards had one existing warning: JITM-09 is over 300 lines. |
| Full `vitest run` | VERIFIED | Against the shared design database: 296 files passed. Five tests failed:<br>- three were in the staff-access suite, which needs an empty catalog;<br>- the other two came from this change, and both are fixed. One compared the exact outcome response, which now carries the question. The other was the invitations test's mocked database, which lacked the new placement call.<br>Through `npm run test:isolated`, all 299 files passed (2,270 tests). |
| New tests | VERIFIED | `tests/mix-end-question.integration.test.ts` (7, including D48: no question while another Mix runs) and `tests/new-contact-placement.integration.test.ts` (12). `tests/system-mix-actions.test.ts` now checks that a new invitee joins only the Mixes for Everyone. |
| `npm run build` | VERIFIED | Passed. |
| `db:rehearse-migration`, `db:deploy`, `db:verify-release` | VERIFIED | The rehearsal passed, and the release check reported `{"status":"ready","required":77,"missing":0,"mismatched":0}`. `prisma migrate diff` from the migrated database to the schema shows only the documented hand-written objects. |
| New browser spec `e2e/mix-next-step.spec.ts`, desktop and phone, against the production standalone build | VERIFIED | Desktop passed all 6, twice in a row. Phone passed 5; the audit runs once, on desktop. It covers the question's three answers, Not now, Undo of the outcome, the setting in Add a contact, Quick Add and an import, and a lead connection's own Mix. |
| Accessibility | VERIFIED | Axe (WCAG 2.0, 2.1 and 2.2 AA) checked the question, its sheet and the New contacts page, in light and dark, at 1280 and 390: no violations. At 320px with 200% text, neither the question nor the settings page scrolls sideways. The question's close control is 44px, and Escape and Enter work on the sheet. |
| Existing browser specs, desktop and phone | VERIFIED | 31 specs that touch Today, Contacts, imports, Quick Add, Mixes, Journey, settings, accessibility and fitment all passed, with one exception: `design-correction.spec.ts:111` failed once on phone. Its snapshot shows the cause, which is existing behavior (see Found, not fixed). The spec then passed twice on phone (28 of 28). |
| Screenshots | VERIFIED, inspected | Production build at 390, 834, 1194 and 1920, light and dark, for the question and the New contacts page. The sheet, Add a contact, Quick Add, the import step and a lead connection were captured at 390 and 1920. The question follows the export's sent-confirmation toast. Settings has no export screen, so it follows the form-page archetype (JITM-07). Captures stay private in `.artifacts/mix-next-step-20261006/` (JITM-12 §2.19). |

## Found, not fixed

- **"Mark sent" before the Beat's Journey choices load.** The click opens an empty "Record journey outcome" step, with Save outcome and Cancel, instead of recording. The owner needs an extra tap. This is existing behavior in `JumpOutcomeButton` (`src/components/JumpWorkflow.tsx`).
  - The No Mix slice classified `design-correction.spec.ts:111` as order-dependent. Its failure snapshots show this step, so this is the cause.
  - The new spec handles the step. The product behavior belongs in its own fix.
- **The import review's sticky action bar.** On wide screens it covers the Mix question's hint until the page is scrolled further.
- **The "Add phone or email" link on a Contacts row** still fails axe's target-size check. The No Mix slice already reported it.

## NOT RUN

- Physical phones and tablets.
- A worker processing the queued jobs. The Beats of a newly placed person, and an import's queued batch, were checked through the database, not through the worker.
- A baseline build of `origin/main` for A/B comparison. Every failure was either fixed in this change or explained by its own snapshot.
- Production data. Nobody counted the Mixes already saved with Everyone yet; the release does that (D52).
- Production. Nothing was released.
