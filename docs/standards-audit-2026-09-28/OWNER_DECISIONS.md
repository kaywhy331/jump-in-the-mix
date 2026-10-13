# Owner decisions — JITM standards program (2026-09-28)

Kevin answered every decision in this packet on 2026-09-28, in the agent session that ran the standards program:

> "For the decisions. I will go all on your recommendations."

Each decision below is therefore resolved as option **A**, the recommendation. The standards cite these decisions as `[OWNER 2026-09-28 D#]`.

This file is also the in-repository record of owner decisions made earlier in agent sessions but never written into the repository's documents. The standards cite those as `[OWNER <date> O#]`.

Line numbers in this file, as in SOURCE and OWNER tags, refer to the source file as it stood when the entry or rule was written: `origin/main` 9439fd6 for every entry below and every 1.0.0 rule (read them with `git show 9439fd6:<path>`). Amendments and new standards name their base commit in the changelog line, and a later entry here names its own. SHIPPED tags name their commit.

## Answered decisions

### D1 — Customer vocabulary

- **Question:** Which words does the product use with customers?
- **Conflict:**
  - [CANONICAL_PRODUCT_DECISIONS](../CANONICAL_PRODUCT_DECISIONS.md) (lines 38–47) prescribes Today / Follow-up / Plan / Ready-made plan / Saved date. Its line 50 bans `Mix` from customer copy, and its lines 54–59 set a four-item navigation: Today, Contacts, Plans, More.
  - [CONTRIBUTING](../../CONTRIBUTING.md) (lines 66–68) uses Mix / Step / Jump.
  - [README](../../README.md) (line 3) uses Mixes and Beats.
  - The shipped navigation (`src/components/Nav.tsx`, lines 10–15) is Today, Contacts, Mixes, Journey, Calendar, More.
  - Later owner decisions use Mix, Beat, Journey, Mega-Mix and Marketplace ([numbering record](../MARKETPLACE_AND_NUMBERING_2026-09-24.md), line 20).
- **Decision (A):** Codify the shipped terms, each with a plain-language explanation for new users: Today, Contacts, Mixes, Beats, Journey, Calendar, Quick Add, Mega-Mix, Marketplace, and A1 / A1.a numbering. The old customer-language table is retired.
- **Applied in:** JITM-05 (glossary), JITM-04 (copy), JITM-09 (navigation labels).

### D2 — Audience priority

- **Question:** Which audiences does the product serve first?
- **Conflict:**
  - [CANONICAL_PRODUCT_DECISIONS](../CANONICAL_PRODUCT_DECISIONS.md) (line 24) names home services, real estate, and insurance or financial services.
  - The README (line 3), the five ICP profiles and the profession pages name contractors, consultants, real estate agents, photographers and recruiters.
  - The owner's 2026-09-04 brief ([product audit](../PRODUCT_AUDIT_2026-09-04.md), line 5) describes a self-employed plumber or a solo real-estate agent with no marketing experience.
- **Decision (A):** Keep all five audiences. When they conflict, optimize for trades and solo real estate.
- **Applied in:** JITM-02, JITM-01.

### D3 — Authority of older documents

- **Question:** Do the standards replace the older contracts?
- **Decision (A):** Yes. The standards supersede, as authorities:
  - [CANONICAL_PRODUCT_DECISIONS](../CANONICAL_PRODUCT_DECISIONS.md), which claims single-source status at line 8;
  - [DESIGN_GUIDELINES](../design/DESIGN_GUIDELINES.md);
  - the "Product language" and "Branch and commit conventions" sections of [CONTRIBUTING](../../CONTRIBUTING.md).

  Those documents keep a one-line banner and remain as history. The [migration ledger](MIGRATION_LEDGER.md) maps every rule they held.
- **Applied in:** JITM-00 (precedence), JITM-15 (supersession).

### D4 — Journey

- **Question:** Which Journey design governs?
- **Conflict:** [DESIGN_GUIDELINES](../design/DESIGN_GUIDELINES.md) keeps the stage-circle composition (line 28) beside the owner's 2026-09-21 dynamic Mix/Beat graph direction (line 5). The 2026-09-28 releases then changed Journey numbering and map navigation.
- **Decision (A):** Canonical Journey is:
  - the dynamic graph of the account's actual Mixes and Beats;
  - the 2026-09-28 navigation and numbering.

  The export's stage-circle Journey becomes history for Journey only. The export still governs visual language everywhere.
- **Applied in:** JITM-07, JITM-09, JITM-06.

### D5 — Staging

- **Question:** What replaces the test-site deployment rule?
- **Conflict:** [AGENTS.md](../../AGENTS.md) (line 13) requires test deploys to the Netlify test site. Line 17 of the same file says that site no longer answers.
- **Decision (A):** Retire the Netlify test-site rule. Pre-release verification is:
  1. a local production build of the candidate;
  2. the relevant test suites, compared with an origin/main baseline;
  3. the post-deploy smoke checks.
- **Applied in:** JITM-14, JITM-12.

### D6 — Local-only sources

- **Question:** Should files that exist only in the owner's checkout be committed?
- **Facts:** Sixteen documents and assets exist only in the owner's local checkout. They are listed with content hashes in the [source register](SOURCE_REGISTER.md). Two of them are third-party copywriting references.
- **Decision (A):** Keep them out of Git and refer to them by content hash. JITM-04 carries a clean-room distillation of the copywriting mechanisms. The owner's own local documents can be committed later if he asks.
- **Applied in:** JITM-15, JITM-04.

### D7 — Third-party names

- **Question:** May standards, skills and copy name third-party frameworks, courses or authors?
- **Conflict:** [AGENTS.md](../../AGENTS.md) (line 25) and [assets/README.md](../../assets/README.md) (lines 25–26) direct agents to named third-party guidance. The fleet's evidence-led persuasion standard is clean-room.
- **Decision (A):** Clean-room everywhere: describe mechanisms, and carry no third-party framework, course or author names into standards, skills, product copy or new documents. The existing wording in `assets/README.md` is a preserved source and stays as it is. The new AGENTS.md router carries no names.
- **Applied in:** JITM-04, JITM-16.

### D8 — Enforcement strength

- **Question:** Should the standards gate CI or pushes?
- **Decision (A):** Enforcement is advisory for now. It consists of the router, the skills, the PR template, and `npm run standards:check` run by agents and reviewers. It is not a CI or pre-push gate. (GitHub Actions has been blocked by billing, so CI runs locally anyway.)
- **Applied in:** JITM-17, JITM-12.

### D9 — Open design defaults from 2026-09-23

- **Question:** Should the four defaults assumed in the [design consistency record](../design/DESIGN_CONSISTENCY_2026-09-23.md) (lines 64–69) stand?
- **Decision (A):** Ratify all four:
  - staff screens are compact on desktop and use 44px rows on touch;
  - Quick Add uses the shared sheet header;
  - boxed disclosures stay boxed;
  - the Mixes and Ready-made filters keep their Apply button.
- **Applied in:** JITM-07, JITM-08.

### D10 — Branch and commit conventions

- **Question:** Written or practiced conventions?
- **Conflict:** [CONTRIBUTING](../../CONTRIBUTING.md) (lines 33–38) prescribes `feature/…` branches and conventional commits. Practice uses `<type>/<topic>-<YYYYMMDD>` branches, sentence-style imperative subjects and merge commits.
- **Decision (A):** Codify the practice:
  - `<type>/<topic>-<YYYYMMDD>` branches;
  - imperative subjects of at most 72 characters;
  - one logical change per commit.

  CONTRIBUTING's convention section is superseded (D3).
- **Applied in:** JITM-13.
- **Applied as (pending Kevin's confirmation):** release-record branches named `docs/<topic>-record`, with no date (for example `docs/invite-page-record`, merged as PR #89), and the `docs: record …` commit subject are practice outside D10's pattern. JITM-13 §2.4 and §2.8 carry them as proposed rules.

### D11 — Pricing and claims

- **Question:** What may product and marketing say about price?
- **Facts:** No pricing is decided ([CANONICAL_PRODUCT_DECISIONS](../CANONICAL_PRODUCT_DECISIONS.md), line 85). A local-only brand, price and features document is a proposal.
- **Decision (A):** Until Kevin sets pricing, say only "free beta, access by invitation or waitlist". The pricing document stays a proposal.
- **Applied in:** JITM-02, JITM-04.
- **Applied as (lead's interpretation, confirmed by Kevin in D28):** the owner-reviewed 2026-09-18 claim that accounts are free with no payment card stays usable; D11 forbids amounts, tiers and payment promises.

### D12 — Appearance synchronization

- **Question:** Should the appearance choice sync to the account? This is open item 1 in [DESIGN_GUIDELINES](../design/DESIGN_GUIDELINES.md), line 68.
- **Decision (A):** No. Keep the System, Light and Dark choice in the browser, as shipped.
- **Applied in:** JITM-06.

## Decisions made earlier, recorded here

| ID | Date | Decision | Where it came from |
|---|---|---|---|
| O1 | 2026-09-04 | Jump in the Mix is a simple, phone-first follow-up CRM for small owner-operators with no marketing experience, for example a self-employed plumber or a solo real-estate agent. It must work without extra services and should prepare the owner's outreach. Fully autonomous sending is opt-in and comes later. | The owner's brief, recorded as the lens of the [2026-09-04 product audit](../PRODUCT_AUDIT_2026-09-04.md) (line 5) |
| O2 | 2026-09-23 | Kevin asked whether every popup, sheet and disclosure follows one design concept; the 2026-09-23 release made them follow one. | [Design consistency record](../design/DESIGN_CONSISTENCY_2026-09-23.md), line 3 |
| O3 | 2026-09-24 | Agents run production release steps on Kevin's behalf: preflight, migrations, deploys and checks ("I want you to always run the release steps on my behalf … I give you authority to run."). Every pull request so far was merged from Kevin's GitHub account, by Kevin or at his instruction; JITM-16 §2.5 keeps "Kevin merges" as a proposed rule for his confirmation. | The owner's instruction in an agent session |
| O4 | 2026-09-25 | Stay on Render's free plan for the MVP. Move to paid hosting after traction ("once we deploy and gain traction after MVP we will move towards a paid hosting"). Derived defaults (proposed, for Kevin's confirmation): add no paid services without approval, batch releases, keep the build cache. | The owner's instruction in an agent session |
| O5 | 2026-09-28 | Journey numbering: each starting point is a letter. Its Mixes are A1, A2, … and their Beats are A1.a, A1.b, …. After a hand-off, numbering follows the journey whose Mix was created first. This replaces the 2026-09-24 position numbering. | [Numbering record](../MARKETPLACE_AND_NUMBERING_2026-09-24.md), line 20; `src/lib/journey-numbering.ts` |
| O6 | 2026-09-28 | Every agent task in Jump in the Mix, through Claude Code or Codex, follows these standards, skills and workflows so the product does not drift from the Jump in the Mix standard. | The owner's request that started this program |
| O7 | 2026-09-22 | Preserve the current UI structure and format; change visible structure only where needed to fix a specific workflow gap. Whether this is a standing rule or applied only to the 2026-09-22 work is open (question 8 in the audit). | The owner's clarification, recorded in the local-only contractor UX approach (sha256 f7ea577d837b6b1f, line 5) and reflected in docs/CONTRACTOR_UX_IMPLEMENTATION_2026-09-22.md, line 7 |
| O8 | 2026-09-29 | Kevin approved the copy batch in PR #96, including the seven descriptive approach labels that replace third-party sales-method names: Question-led discovery, Problem-to-value discovery, Mutual-fit conversation, Decision support for a hesitant buyer, Listening-first follow-up, Honest comparison of options and Answer-first education. He also approved the public wording in its claims ledger, including the FAQ answer "Not during the beta. Joining the waitlist and creating your account are free, and no card is required. Prices after the beta haven't been set." ("I approve.") | The owner's approval in an agent session. PR #96 was merged as 65f2c96 |
| O9 | 2026-09-29 | Kevin approved the one-person onboarding wording in PR #97 and confirmed its two defaults. First, Today's welcome offers the optional Mega-Mix step once the first follow-up is ready. Second, a business type that several Mega-Mixes share opens the Mega-Mix list instead of naming one. ("I approve.") | The owner's approval in an agent session. PR #97 was merged as cb154fd; see the [implementation record](../ONBOARDING_ONE_PERSON_FIRST_IMPLEMENTATION_2026-09-29.md) |
| O10 | 2026-09-29 | Kevin set the plans: Free at $0, Plus at $15 a month or $144 a year, Pro at $29 a month or $288 a year ("we can identify the prices up front right now and incorporate it with the payment terminal"). He chose to build Stripe's hosted checkout now and charge later: charging stays off until he picks a start date. The plans limit only people with follow-ups on (100, 1,000 and 5,000) and active Mixes (3, 25 and 100), and a Mega-Mix counts as one Mix. | The owner's answers in an agent session; see the [pricing decision](../PRICING_DECISION_2026-09-29.md). Built in PRs #103 and #104 |
| O11 | 2026-09-29 | "Realtor should follow a journey that is tailored and curated for that particular field of work." Kevin chose to rebuild the Real estate Mega-Mix with separate buyer and seller paths, and to start realtor onboarding from it. | The owner's answer in an agent session; see the [realtor journey record](../REALTOR_JOURNEY_IMPLEMENTATION_2026-09-29.md). Built in PR #102 |
| O12 | 2026-09-29 | Kevin gave the go-ahead to change the shared form guard so an untouched form never warns about unsaved changes ("ok go ahead"). | The owner's answer in an agent session; see the [fix record](../FORM_GUARD_UNTOUCHED_FORM_FIX_2026-09-29.md). PR #101 was merged as cb694a9 |
| O13 | 2026-09-30 | Kevin approved the realtor journey wording in PR #102 and the pricing page and FAQ wording in PR #103, including their claims ledgers, and asked for the merges ("Approved. Please proceed with the merges"). | The owner's approval in an agent session. PRs #102, #103 and #104 were merged as 20be467, 174386f and 94b9539 |
| O14 | 2026-09-30 | Kevin decided two plan-limit rules. When an automatic addition (saved dates, tags, imports, Contact stages) would pass a plan limit, the person is skipped and the owner is notified on Today with a link to upgrade, rather than held until there is room. The onboarding first follow-up Mix doesn't count toward Free's 3 active Mixes. Limits still apply only while billing is on. | The owner's answers in an agent session; see the [plan limits record](../PLAN_LIMITS_IMPLEMENTATION_2026-10-01.md). Applied in JITM-09 §2.75 and JITM-11 §2.58 |

## Answered decisions — second packet (2026-09-28)

Kevin answered the 18 questions in §7 of the [audit](../STANDARDS_AUDIT_2026-09-28.md#questions-for-kevin) on 2026-09-28, in a later agent session, with a reason for each. D13–D30 record them in question order (D13 is question 1, D30 is question 18). They were applied against `origin/main` 61d4df4. Quotes are short extracts of his answers.

### D13 — Outage alerting (question 1)

- **Decision (B now, and restore Actions separately):** "Add a free external monitor for the public site and application health endpoints, and test that its alerts reach you. Monitoring should keep working when CI billing fails." Keep Render's notifications. Restore GitHub Actions for CI and the broader smoke checks: "basic uptime monitoring cannot replace those checks."
- **Applied in:** JITM-14 §2.30, JITM-12 §6. Setting up the monitor is backlog B-08; restoring Actions billing is an owner step.

### D14 — Product copy fixes (question 2)

- **Decision (A):** one coordinated batch covering the automation claim, the retired demo instructions, the third-party names and the inconsistent vocabulary, "so you have one consistent explanation across marketing, onboarding, and Help." The batch also checks template claims about availability or deadlines, "using placeholders or 'only if true' guidance where necessary."
- **Applied in:** JITM-04 §2.20 and §6; the audit backlog merges B-01, B-02 and B-03 into this batch.

### D15 — Marketplace moderation (question 3)

- **Decision (A, with precise wording and assigned responsibility):** keep immediate hiding for private-information reports, at most two automatic hides per reporting account per rolling 24 hours. Other reports reach moderators promptly.
- **Correction:** "the code verifies the reporter's email — not the truth of the allegation. The policy should say that clearly" (`src/lib/marketplace.ts:24-31` at 61d4df4).
- **Who can publish:** staff publishing and moderation authority (`mixes.publish`) goes to Kevin first, with a named backup moderator added when needed. Invited members keep sharing their own Mixes; `mixes.publish` does not restrict ordinary member sharing.
- **Replaces:** the 2026-09-24 rule that offensive and spam reports also hide at once (JITM-09 §2.49 at 1.0.0).
- **Applied in:** JITM-09 §2.49 and §2.70.
- **Confirmed on review of PR #95:** "Keep 'promptly' as a recommendation until staffing supports a specific response-time commitment."

### D16 — Journey stages (question 4)

- **Decision (A):** keep stages as optional contact information. "Call the setting **Contact stages**, and describe Journey as connected Mixes and Beats."
- **Applied in:** JITM-05 §2 (glossary), JITM-09 §2.7 and §2.51.

### D17 — Backups before code-only releases (question 5)

- **Decision (A):** always take a fresh backup immediately before deployment, automated through the release script. "A backup supports recovery; it does not make every rollback safe or replace restore testing."
- **Applied in:** JITM-14 §2.12.

### D18 — Release pipeline (question 6)

- **Decision (A):** commit the reusable script and runbook. The script identifies the target services and commit, runs the required checks, stops on failure and records the rollback target. "Keep credentials and individual release logs outside Git."
- **Applied in:** JITM-14 §2.10. Building the script is backlog B-11.

### D19 — Missing release records (question 7)

- **Decision (A):** back-fill short, evidence-based records: the commit, the deployment identifiers that exist, known changes, verification evidence and rollback context. Missing information is marked unknown, and each record is marked as reconstructed, "without pretending that undocumented checks happened."
- **Applied in:** JITM-15 §2.19, JITM-14 §6. The back-fill is backlog B-12.

### D20 — Preserving the UI structure (question 8)

- **Decision (A):** a standing default. "Preserve navigation and workspace structure unless a specific workflow, accessibility, or responsive-layout problem requires a change, or you request one."
- **Settles:** O7.
- **Applied in:** JITM-01 §2.24.

### D21 — Journey labels (question 9)

- **Decision (B):** labels stay the same across the account's views. "Switching from All Mixes to a Mega-Mix should not rename the same Mix." Labels are calculated from the account's complete graph, then the view is filtered. Real graph edits may still renumber, and labels are not stored identifiers.
- **Replaces:** the per-view numbering in JITM-09 §2.54 at 1.0.0.
- **Applied in:** JITM-09 §2.54, JITM-05 §6. The product change is backlog B-13.
- **Confirmed on review of PR #95:** "Standalone files and Marketplace outlines can use package-local numbering. Account views should retain account-wide labels."

### D22 — Brand line and marks (question 10)

- **Decision (A):** "Stay in the mix," paired with a literal description such as "client follow-up app", "because the tagline alone does not explain the product." Its customer comprehension still needs testing.
- **Monogram:** retired. "Retire the JM monogram from active use and consistently use the approved logo and its derived icons."
- **Applied in:** JITM-02 §2.14, JITM-03 §2.9. Removing the monogram file and aligning the other lines are in backlog B-14.
- **Confirmed on review of PR #95:** "Leave the existing footer and social card for B-14; the documentation correctly identifies the remaining work."

### D23 — Voice (question 11)

- **Decision (A):** "I" by default in the owner's messages; owners choose "we" when they genuinely speak for a crew or team. This applies to message templates and drafts; "interface instructions can continue addressing the user as 'you.'"
- **Applied in:** JITM-04 §2.5.

### D24 — Design deviations (question 12)

- **Decision (B as the default, with documented exceptions):** for unexplained visual differences, the export is the reference. Later approved decisions stay, including the dynamic Journey graph and accessibility improvements. Each disputed value is compared in context before it changes. "A shipped difference should become the standard when there is a recorded design or usability reason — not merely because it reached production." This does not restore the old Journey layout.
- **Applied in:** JITM-06 §2.33 and §6, JITM-07 §6.

### D25 — Screenshots (question 13)

- **Decision (A):** synthetic data; raw captures stay in the ignored `.artifacts/` directory; selected evidence is committed only after checking it for sensitive URLs, tokens, account details and other incidental information.
- **Applied in:** JITM-12 §2.19.

### D26 — Open Journey product questions (question 14)

- **a. Status:** "Workflow status governs the work; stage describes the relationship." Label them separately, and do not force a person's several running Mixes into one global status. Applied in JITM-09 §2.71.
- **b. Pause and resume:** preserve missed work and review it explicitly. On resume, show overdue follow-ups with their original dates and let the owner reschedule or skip them. Never send a backlog automatically, silently discard missed items, or revive completed or skipped work. Applied in JITM-09 §2.72.
- **c. Strong and weak targets:** owner-selected per connection. With no target, show factual counts and rates without a judgment; with a target, show an insufficient-data state when there are too few observations. Applied in JITM-09 §2.58.
- **d. Member invitations:** yes, add optional email delivery after an explicit **Send invitation**, with a preview, keeping personal sharing and copy-link options. "It would deliberately change today's manual policy; until implemented, copy must continue explaining manual delivery. Keep invitation delivery separate from automatic customer outreach." Applied in JITM-09 §2.18. The feature is backlog B-16.
- **e. Older Mixes without connections:** stop-only early updates are accepted for now, with clear limits. Keep existing history, make stopping the remaining sequence understandable, and let owners record what happened and schedule a separate follow-up. Richer outcome routing needs an explicit upgrade, never inferred connections. Applied in JITM-09 §2.73.
- **f. Hover tooltips:** not enough as the only way to reach details. The same information must be reachable by tapping or keyboard-activating the row, preferably in the existing details pane. Hover content needs predictable dismissal and persistence. Verify the real touch and keyboard experience. Applied in JITM-10 §2.17.
- **g. Tester onboarding:** recommend one person and one follow-up, with Mega-Mix setup as an optional next step. "This is a usability hypothesis worth testing: observe whether testers can prepare their first useful follow-up without help." Replaces the Mega-Mix-first recommendation (JITM-09 §2.20 at 1.0.0). Applied in JITM-09 §2.20. The product change is backlog B-17.

### D27 — Primary checkout (question 15)

- **Decision (A):** an agent inventories the owner's primary checkout read-only and proposes a cleanup. It first identifies unique source documents, unpublished changes, and work already preserved elsewhere.
- **Applied in:** JITM-16 §6. The inventory is backlog B-18.

### D28 — Pricing wording (question 16)

- **Decision (A, qualified by beta and access limits):** "No card required" stays, beside "free beta" and accurate invitation or waitlist wording, for example "Free beta. No card required. Join the waitlist." Copy avoids implying permanent free access, immediate admission, or decided post-beta pricing.
- **Confirms:** the D11 interpretation above.
- **Applied in:** JITM-02 §2.18.

### D29 — The Ready-made mixes library (question 17)

- **Decision (B):** consolidate discovery in the Marketplace's **Jump in the Mix** section, beside Community and My shares. Preserve the useful filters, previews, favorites and guided setup; redirect the old browsing entry and keep existing setup links working.
- **Applied in:** JITM-05 §2.5, JITM-09 §2.74. The product change is backlog B-19.

### D30 — Merging (question 18)

- **Decision (A):** agents merge only with Kevin's explicit authorization. Agents can prepare, validate and open pull requests on their own. "Once you authorize a specific merge or clearly defined batch, the agent should complete it without asking for the same permission again."
- **Settles:** the merge question in O3.
- **Applied in:** JITM-16 §2.5, JITM-13 §2.19, JITM-17 §2.1, `AGENTS.md`, the PR template, WF-04, WF-06, WF-08 and the skills that said "Kevin merges".

### D31 — Public demo native handoff (2026-10-03)

- **Decision:** "They are actually supposed to trigger the text message, email, and phone functions when clicking the button." The public demo's ordinary user-activated `sms:`, `mailto:` and `tel:` links hand the edited, demo-marked sample to the visitor's own apps, aimed only at the fictional number and per-situation `example.invalid` email. A click means requested only; the visitor decides whether to send or call. Simulated Mark sent or called, Not yet and Undo remain demo records. State stays in memory in the mounted tab.
- **Future option:** an owned auto-reply demo (a verified JITM-owned inbox or number with one clearly labeled reply, separate from marketing opt-in, with destination verification and service approval first) is deferred and not built.
- **Reverses:** the no-handoff rule in JITM-09 §2.67 at 2.3.0 (D2-era demo contract).
- **Applied in:** JITM-09 §2.67 and §4 (3.0.0), `docs/HOMEPAGE_CONTACT_DEMO.md`.

### D32 — Adding people from a phone (2026-10-05)

- **Request:** "I would like an easy way for the user to be able to add a contact that is saved in their phone into the webapp."
- **Decision:** "Okay I will go off your recommendations and go with 1,2,and 3." That means three things:
  1. The Android contact picker sits at the top of Add a contact and in the Contacts tools.
  2. An iPhone shortcut sends contact cards shared from the Contacts app with the owner's personal key. The cards go through the picker's matching: one exact email or phone match is merged, an ambiguous match is left unchanged, and notes, dates and photos are not taken.
  3. A guide shows how to save a contact card to Files and import it.
- **Deferred:** continuous sync, either from Google Contacts or through an App Store app, until beta users ask for automatic syncing. iCloud contacts are not pursued: the only route needs an Apple app-specific password.
- **Applied in:** JITM-09 §2.33 (3.1.0), JITM-01 §2.22 (2.3.0), JITM-11 §2.38 (1.2.1), `docs/PHONE_CONTACTS_2026-10-05.md`.

### D33 — Contacts with no Mix (2026-10-05)

Base e8692f2. D33–D37 answer the five questions in the analysis recorded in [Mix placement and contact stages](../MIX_PLACEMENT_AND_STAGES_2026-10-05.md).

- **Question:** what counts as a contact left in limbo, and how should the app show it?
- **Gap:**
  - No setting, filter or label finds a contact who is not in a Mix.
  - A Mix that ends without a connection prompts nothing.
- **Decision:** "Meaning.. there was a text message sent.. but nothing triggered because the user didn't enter a trigger or forgot. Or a contact was added but didn't assign the contact to a mix. If there is no mix assigned to a contact, then the contact should show something that the contat has no mix. This way it could easily be identified that there's no actions on a contact. Ideally everyone should be in the journey OR marked as a status/label/ or confirmation where they are not in a mix."
- **Applied in:** JITM-09 §2.76 and §2.77, JITM-05 §2.2, JITM-01 §2.22. The detailed defaults are P1–P4 in the record.
- **Confirmed (2026-10-05):** Kevin was asked to confirm seven of the proposed defaults: P1–P4, P5's import confirmation, P6 and P7's timing. He replied "yes, please proceed". So the following are now owner decisions:
  - One-time follow-ups and finished or stopped Mixes don't count as being in a Mix.
  - The labels are "No Mix" and "No Mix needed".
  - A line on Today links to the Contacts Mix filter.
  - The last Beat of a Mix with no connection asks what's next.
  - Imports ask before using the default Mix.
  - "Everyone" includes people added later.
  - A Mix sets its stage when the person starts it.

  The rest of P5 and P8–P11 stay proposed.

### D34 — Where new contacts go (2026-10-05)

- **Question:** should new contacts go into a Mix by default? The options were:
  - (A) a default Mix for each source;
  - (B) the add-contact form starts with a follow-up ticked;
  - (C) contacts stay manual and appear in the No Mix list.
- **Decision:** "A, B, and C. There should be a setting for newly added contacts to default to one of those settings. Default can be C."
- **Owner control:** the owner chooses the setting, which is the explicit action JITM-01 §2.23 asks for. This works the same way as a stage's Mix on entry and a tag's Mix.
- **Applied in:** JITM-09 §2.78, JITM-01 §2.22. The detailed defaults are P5 and P6 in the record.

### D35 — Stages from Mixes and Mega-Mixes (2026-10-05)

- **Question:** should stages stay separate from Mixes? The options were:
  - (A) stages stay labels, but a Mix can set the stage;
  - (B) Mega-Mix positions become the stages;
  - (C) no change.
- **Conflict:** D16 and JITM-09 §2.51 kept stages as optional information that the owner manages, apart from the Journey.
- **Decision:** "A and/or B. Mega-mixes could create the labels, but users could always customize and change the labels."
- **Replaces:** D16 in part.
  - Stages stay optional and are still called Contact stages.
  - They still never create, order or organize the Journey graph.
  - The graph can now set a person's stage, and a Mega-Mix can create stage labels.
- **Applied in:** JITM-09 §2.51 and §2.79, JITM-05 §2.2, JITM-01 §2.22. The detailed defaults are P7 and P8 in the record.

### D36 — Stage wording (2026-10-05)

- **Question:** how do owners use their own pipeline words? The options were:
  - (A) milestones the owner names;
  - (B) presets only;
  - (C) both.
- **Decision:** "C", both.
- **Applied in:** JITM-09 §2.80, JITM-05 §2.2, JITM-01 §2.22. The detailed defaults are P9 and P10 in the record.

### D37 — Other business types and individual representatives (2026-10-05)

- **Context:** "for scalability and foundational structure, it should allow for other business types to utilize the app or even representatives of a larger company that want to use the app for their own personal managment (example: business development rep)."
- **Question:** how far does the product go for them? The options were:
  - (A) support them without marketing to them;
  - (B) make them a target audience;
  - (C) not now.
- **Decision:** "A".
- **Targeting is unchanged:** JITM-00 §2.1 and JITM-02 §2.1–§2.2 still describe the targets.
- **Applied in:** JITM-02 §2.20, JITM-01 §2.22. The wording review is P11 in the record.

### D38 — An assistant connector, and sending after a yes (2026-10-06)

- **Request:** "I definitely want the connector that ai agents can connect to in the near future, to allow users that have chatgpt, iOS ai, claude, gemini, or any other capable model be able to utilize their ai assistant with jitm easily providing them with the needed information to be quick and take action on their behalf."
- **Question:** when an owner's AI assistant acts through Jump in the Mix, may it send customer messages? The options were:
  - (A) the owner still sends: the assistant prepares the message and hands the owner a one-tap draft for their own Messages, Mail or Phone app;
  - (B) the assistant sends after a yes: the phone's own assistant sends from the owner's number after the owner confirms each message, and Jump in the Mix records it;
  - (C) the assistant sends on its own, with no confirmation for each message.
- **Decision:** "Assistant sends after a yes" (B).
- **Conflict resolved:** JITM-00 §2.3 said the owner sends each message. It now counts a message the owner's own connected assistant sends from the owner's own number or email account, after the owner says yes to that message, as the owner sending it. Jump in the Mix itself never sends it, records it as the assistant reported it rather than as delivered, and keeps unconfirmed sending an off-by-default option.
- **Applied in:** JITM-00 §2.3 and §2.5 (2.0.0); JITM-01 §2.20, §2.22, §2.25 and §2.26 (2.5.0); JITM-08 §2.35 (1.1.0); `AGENTS.md`; the `jitm-copy` skill; `docs/ASSISTANT_CONNECTOR_PROPOSAL_2026-10-06.md`.

### D39 — What an assistant may change (2026-10-06)

- **Question:** which changes inside Jump in the Mix may an assistant make for the owner? The options were:
  - (A) one at a time, undoable: read everything in the owner's own workspace; add people and notes, log outcomes, reschedule, start or stop a Mix, one person per request, each change shown back and undoable; skipping or completing a follow-up asks first; no bulk approvals;
  - (B) read-only first, with actions in a later release;
  - (C) any change, including bulk changes.
- **Decision:** "One at a time, undoable" (A).
- **Note:** skipping and completing ask first because the scheduler never brings those follow-ups back (JITM-00 §2.6); Reopen from Done stays in the app (JITM-08 §2.4).
- **Applied in:** JITM-01 §2.25, JITM-08 §2.35.

### D40 — The first iPhone path (2026-10-06)

- **Question:** how should the iPhone's own assistant (Siri) connect first? The options were:
  - (A) Shortcut now, app later: a Siri Shortcut using the owner's personal key reads Today aloud and logs outcomes by voice, on any iPhone, with no App Store and no fees; a native app that Siri can operate directly waits for the demand signposts;
  - (B) a native iOS app now, which needs the Apple Developer Program ($99 a year), lifts the native-app deferral and goes through App Store review;
  - (C) no iPhone-specific work.
- **Decision:** "Shortcut now, app later" (A).
- **Unchanged:** native apps stay deferred (JITM-01 §2.7), and no paid service is added (JITM-00 §2.9).
- **Applied in:** JITM-01 §2.22 and §2.25.

### D41 — When the connector is built (2026-10-06)

- **Question:** when should the connector work start? The options were:
  - (A) after D33–D35 ship: record and design it now, build it once D33–D35 and the phone checks are done, and give it to the first tester wave;
  - (B) now, alongside D33–D35;
  - (C) now, as the top priority.
- **Decision:** "After D33–D35 ship" (A).
- **Applied in:** JITM-01 §2.20, §2.22 and §2.25; the design is `docs/ASSISTANT_CONNECTOR_PROPOSAL_2026-10-06.md`.

### D42 — Calls through an assistant (2026-10-06)

- **Question:** may an assistant place calls, and does JITM-01 §2.26's line against AI-generated voices stand?
- **Decision:** "no AI calls. It can be AI assistant initiated though to connect users to their contacts. Example: AI assistant can check today and see that there is a call needing to be made to [Name] about [Phone Notes], AI ask user to connect the call, user says 'yes', AI makes the call."
- **Meaning:** an assistant may start a call that connects the owner to the person, after the owner says yes, and the owner then speaks. Jump in the Mix offers no AI-voice calling.
- **Applied in:** JITM-01 §2.26 (no longer proposed), JITM-08 §2.35, `docs/ASSISTANT_CONNECTOR_PROPOSAL_2026-10-06.md`.

### D43 — Assistant actions count, and permission lives in the assistant (2026-10-06)

- **Question:** do outcomes an assistant logs count toward activation and retention (JITM-01 §2.14–§2.15)?
- **Decision:** "yes all assistant should count towards the logs"
- **Kevin's reasoning, which also settles who controls an assistant's permission:** "How I see the AI assistant working is, there would still be a user's permission on the ai assistant side to allow the ai assistant to act upon their behalf. It is something that will be on their AI assistant side that we don't have control over. Our system only provides the AI agent the items that need action to be taken. If they use a 3rd party agent, we have no control over how they utilize the workflow on their end."
- **Meaning:**
  - Actions an owner's connected assistant takes through the connector count as the owner's actions for activation and retention. Jump in the Mix's own automation still never counts.
  - The owner gives an assistant permission to act on the assistant's side. Jump in the Mix neither controls nor verifies that permission, nor how a third-party assistant runs its workflow.
  - The connector provides the items that need action, the prepared wording and one-person actions. It marks sending, skipping and completing as needing the owner's approval, and records what the assistant reports.
- **Refines:** D38 and D39. The yes for each message, and the approval before skipping or completing, are given in the assistant under its own permission settings.
- **Applied in:**
  - JITM-00 §2.3;
  - JITM-01 §2.14, §2.15 and §2.25 (3.0.0);
  - JITM-08 §2.35;
  - `AGENTS.md`;
  - the `jitm-copy` skill;
  - `docs/ASSISTANT_CONNECTOR_PROPOSAL_2026-10-06.md`.

### D44 — What the No Mix sentences say (2026-10-06)

Base a05b189. D44–D47 answer questions 1, 2, 3 and 5 of the WF-05 review of PR #125, "Show whether each contact is in a Mix (D33)". Kevin's answers were relayed to the implementing agent session by the coordinating session on 2026-10-06; this entry records them in that session's wording, not as a quote.

- **Question:** Today said "{n} people have No Mix, so nothing will remind you about them.", and the profile's What's next sheet said the same, but a pending one-time follow-up from Quick Add or "Schedule the next follow-up" does remind the owner. The options were:
  - (a) keep D33's definition and change the wording to say that no Mix will remind the owner;
  - (b) have Today's line count only people with nothing scheduled at all.
- **Decision:** (a): fix the wording and keep D33's definition.
- **Meaning:**
  - One-time follow-ups still don't count as being in a Mix (D33).
  - Today's line reads "{n} people have No Mix, so no Mix will remind you about them.", or "1 person has No Mix, …" for one.
  - The What's next sheet reads "No Mix has work to come for this person."
  - D33 confirmed the labels "No Mix" and "No Mix needed"; the meaning sentence in the glossary is this decision.
- **Applied in:** JITM-05 §2.3 (2.1.2), JITM-09 §2.77 (5.0.0), `docs/NO_MIX_STATUS_2026-10-05.md`.

### D45 — A paused Mix still counts (2026-10-06)

- **Question:** does work held by a paused Mix count as being in a Mix, and should No Mix needed lapse when a paused Mix resumes? Pausing cancels a Mix's future Beats and leaves overdue ones pending until the worker's next pass, so a paused Mix split its people: some read In a Mix and others No Mix. The options were:
  - (a) work on hold counts, and a confirmation set during the pause lapses when the Mix resumes;
  - (b) work on hold doesn't count, and a paused Mix's overdue Beats don't count either.
- **Decision:** (a): a paused Mix still counts as being in a Mix for all of its people. That covers people with overdue Beats, people with only future Beats held by the pause, and people whose Journey work is paused. A No Mix needed set while the Mix was paused lapses when the Mix resumes.
- **Meaning:**
  - "In a Mix" includes running or paused Journey work and the Beats a paused Mix holds for someone still enrolled in it and not stopped. A paused date-based Mix still counts a coming date.
  - Resuming brings back the same rows rather than creating new ones, so No Mix needed also gives way to a Beat brought back, or done, after it was set.
- **Applied in:** JITM-09 §2.76 (5.0.0), `src/lib/contact-mix-status.ts`.

### D46 — Undo for Add to the Mix (2026-10-06)

- **Question:** bulk "Add to the Mix" started a Mix for up to 100 people with neither Undo nor a confirmation, and people who had finished the Mix started it again without being told. The options were:
  - (a) act at once and offer Undo in the notice, as Archive does;
  - (b) ask first with a confirmation.
- **Decision:** (a). Undo ends the Mix starts that this bulk action made, meaning the assignments it created or reactivated, and cancels the pending Beats those starts produced. It never touches completed or skipped follow-ups (JITM-00 §2.6) or history. The sheet warns that people who already finished the Mix will start it again.
- **Meaning:**
  - The sheet says "Anyone who already finished this Mix starts it again. Anyone still in it keeps their start."
  - People who were already in the Mix keep their start, so Undo has nothing of theirs to end.
  - Implementation readings, for Kevin to confirm: Undo also removes a saved date the start wrote for someone who had none (the start day of a date-based Mix), and it leaves alone any start that changed since, such as a person started again on their own. A second tap ends nothing.
  - Further readings after the WF-05 re-review (2026-10-06), also agent defaults awaiting Kevin's confirmation (JITM-15 §2.12; defaults 4–6 in `docs/NO_MIX_STATUS_2026-10-05.md`): Undo puts back an assignment's earlier start when the bulk start restarted one that was active before, and writes a No Mix needed confirmation again for anyone who had one; bulk Add leaves anyone the Mix already has work for, by any route, as they are; the sentence above is the sheet's for a Mix started by hand, and a date-based or fixed-date Mix gets its own. After the third review, also awaiting confirmation (default 8): Undo, like Remove from Mix, ends the run's Journey record, including a decision still waiting on that run, and a later start of the same Mix and day picks the record back up.
- **Applied in:** JITM-09 §2.77 (5.0.0), `src/lib/contact-mix-actions.ts`.

### D47 — Counts and returns on a filtered Contacts list (2026-10-06)

- **Question:** "{n} with No Mix" and the Mix filter's counts covered the whole account while sitting beside a searched or filtered list, and the link dropped the search and the tag. Should they follow the current search and filters?
- **Decision:** yes. The "{n} with No Mix" link and the filter's counts follow the current search and filters, and the link keeps the search and the tag. Return paths are built from the filter parameters only, so old notices don't reappear. The docked profile's Undo keeps the docked person.
- **Meaning:**
  - The counts cover the people the list's filters show: search, tag, priority, Contact permission and an import.
  - Agent reading, awaiting Kevin's confirmation (JITM-15 §2.12; default 1 in `docs/NO_MIX_STATUS_2026-10-05.md`): the link keeps all of those filters, not only the search and the tag, so it opens the people it counted. Until he confirms it, the standards cite it as `[SOURCE]`.
  - After any action on the list, the owner returns to the same filters and docked person, without an earlier notice such as "Contact added." or an old Undo.
- **Applied in:** JITM-09 §2.77 (5.0.0), `src/app/(app)/contacts/page.tsx`.

Question 4 of the same review needed no new decision: the Mix filter's first option is "Any", as JITM-09 §2.77 already said, and the start buttons keep their names.

### D48–D53 — What happens next for a person (2026-10-06)

- **Context:** slice 2 of the Mix placement work (PR #128, `docs/MIX_NEXT_STEP_2026-10-06.md`) was built with six implementation choices the decisions left open. Kevin asked for the most logical, easiest workflow and adopted the recommendations: "For those questionss, what is the most logical and best user experience? I will go off your recommendations. I want it to be easy for users providing and easy user experience for the users and intilligent to do the right workflow."
- **D48 — The end-of-Mix question asks only when the person is left with no Mix.** Someone still in another Mix isn't falling through, so the owner isn't interrupted. This answers P4's open question.
- **D49 — Only Mixes that start "When I start it for someone" can be the New contacts Mix.** The same goes for the Mix that Add a contact, Quick Add and an import offer for new people. It is the same rule as a Contact stage's Mix. A date-based, broadcast or after-another-Mix Mix can't sensibly start "today" for a new person. Clarified by D57 (2026-10-07): Add a contact keeps the Mixes that follow the follow-up date.
- **D50 — With "Ask each time", people from the phone and from lead connections go to Today's No Mix line.** No one is there to ask when they arrive. Review opens them together for one bulk Add. A connection that should start a Mix automatically can choose its own Mix.
- **D51 — People added with a visit, during onboarding or by an invitation don't take the New contacts Mix.**
  - A visit is already a next step.
  - Onboarding starts its own first Mix.
  - Invitees are peers trying the app.

  They still join Mixes for Everyone, so "Everyone" means everyone in Contacts.
- **D52 — Mixes already saved with Everyone take in people added after the release.** One meaning everywhere is easiest. The checkbox says "and anyone you add later", and broadcasts whose time has passed are skipped. The release counts the accounts that have such Mixes and reports them to Kevin.
- **D53 — Over the people limit, an import's Mix skips those people, and a Mix chosen in Quick Add is refused with the reason.**
  - Skipped people show on Today and can be resumed from their profile (§2.75).
  - Refusing keeps the Quick Add draft, and the owner can choose "No Mix for now".
  - This applies only while billing is on.
- **Confirms:** the rest of P5 as built. JITM-09 §2.78 drops [PROPOSED].
- **Applied in:** JITM-09 §2.77, §2.78 (6.1.0); `docs/MIX_NEXT_STEP_2026-10-06.md`.

### D54–D60 — Readings from the reviews of PR #128 (2026-10-07)

- **Context:** the WF-05 reviews of PR #128 (`docs/MIX_NEXT_STEP_2026-10-06.md`, "Reviews") needed seven readings that the decisions left open. The agent took them as reversible defaults (JITM-15 §2.12) and asked Kevin to confirm them with the merge. Kevin chose "Accept all 7 (Recommended)" on 2026-10-07, together with "Merge and release".
- **D54 — A Contact stage's Mix comes first, but not before the owner's own pick.** When the stage new people join starts a Mix, the New contacts Mix, or one a lead connection set up in advance, is not added on top of it, and no form preselects it. A Mix the owner picks while adding someone, in Add a contact, Quick Add or an import's review, still starts beside it.
- **D55 — Imported and phone contacts get their stage from the worker's stage pass,** about 25 new people a minute, and are placed knowing which stage they will join.
- **D56 — How Add a contact opens.** With Ask each time, the First follow-up is ticked for today with no Mix chosen, as Quick Add and imports open. With Leave them out, or under a stage's Mix, it opens as it always has: unticked, with the first Mix that follows the follow-up date.
- **D57 — D49 clarified.** Mixes set to start after another Mix are never offered or started for new people. Add a contact keeps offering the Mixes that follow the follow-up date, such as the starter Mix.
- **D58 — An Everyone Mix turned back on takes in the people added while it was off,** from that moment. While it is paused, newcomers are not placed in it.
- **D59 — The end-of-Mix question's sheet** lists Mixes the owner starts first and preselects only one of those; date-based and fixed-date Mixes can be chosen, with the start day's meaning shown.
- **D60 — A Journey Start's own Mix is left to the Start.** Someone added from a Journey Start is not given an Everyone place in the Mix the Start then starts for them.
- **Applied in:** JITM-09 §2.77–§2.78 (6.3.0); `docs/MIX_NEXT_STEP_2026-10-06.md`.

### D61–D68 — Stages from the work: PR #132's open questions (2026-10-07)

- **Context:** PR #132 builds D35 (`docs/MIX_STAGES_2026-10-07.md`). Its six WF-05 reviews left sixteen agent defaults, P8's label lists and eight questions, each with a recommended answer. Kevin, on 2026-10-07: "I will go based on your recommendations for all the answers."
- **D61 — The ready-made Mega-Mix stage labels are confirmed as listed (P8).** Trade milestones such as "Offer", "Under contract", "Closed" and "Booking decision" stay where they are the trade's own words; owners can rename any label.
- **D62 — A save that starts people on a Mix that names a stage is always reviewed,** whatever Personal preferences → Starting mixes says: turning it on, ticking Everyone or adding a tag. The review says how many people move. This is an exception to JITM-09 §2.39.
- **D63 — A paused Everyone Mix takes in no newcomers, even when the owner saves it while it is paused** (D58, applied to the editor). Turning it back on takes them in.
- **D64 — Remove on an Everyone Mix stops that Mix for the person,** so no later save or resume puts them back in it.
- **D65 — A tag added while a Mix is paused moves its members to the Mix's stage when the Mix resumes,** after the same review as adding a tag to a Mix that is on.
- **D66 — An Everyone Mix moves only people who have no stage yet.** People in a stage keep it. New people have the stage new people join (D55), so an Everyone Mix doesn't move them either; tags and the owner's own starts move people as before.
- **D67 — A stage's "Mix completed" rule following its Mix run from Journey waits for slice 4.**
- **D68 — Every way of adding people will put them in the first stage at once,** as Add a contact does, in a later slice; D55 is replaced then.
- **Confirms:** agent defaults 1–16 in `docs/MIX_STAGES_2026-10-07.md` as built, with default 15 as D62 and default 1's Everyone case as D66.
- **Applied in:** PR #132 (D61, D62, D66; JITM-09 6.9.0). D63–D65 in the follow-up to #132 (PR #134, JITM-09 9.0.0, `docs/MIX_STAGES_FOLLOWUP_2026-10-08.md`); its five agent defaults are answered as D102 and D110. D67 and D68 are planned.

### D69–D86 — UX, design and layout audit: the 18 questions (2026-10-08)

- **Context:** the read-only UX, design and layout audit of 2026-10-08 (`docs/UX_DESIGN_AUDIT_2026-10-08.md`, PR #135) ended with 18 letter-answer questions, each with a recommended option. Kevin, on 2026-10-08: "I will go off you recommendations. please go ahead and implement." Every answer below is the recommended option (A). The product changes are tasks of their own; each cites its decision.
- **D69 (Q1) — The review stars hotfix (TRU-01) ships now.** Kevin also approved one read-only check of the review ratings stored since 2026-09-04 (aggregate counts, no identities or feedback text). Whether to correct or flag those ratings is decided once the counts are known.
- **D70 (Q2) — Today keeps momentum.** After each recorded outcome the next due follow-up opens by itself, on phones and desktop, and the Undo stays on screen. Counts update at once.
- **D71 (Q3) — One person's follow-ups due the same day show as one card,** with "also due" for the other and a way to skip the earlier one.
- **D72 (Q4) — One compact invitation prompt that the owner can dismiss,** shown only after the first recorded outcome. The desktop rail callout and the More row stay; the More badge and the tablet header gift go. This replaces the placements of 2026-09-27 (JITM-09 §2.9) and moves the Today strip out of the top of Today (JITM-09 §2.24).
- **D73 (Q5) — Onboarding fits about two phone screens:** the person first, then a preview with real dates. Setting up a complete Mega-Mix becomes a secondary link.
- **D74 (Q6) — Calendar shows appointments first.** Follow-ups become one summary row per day that links to Today.
- **D75 (Q7) — Journey opens readable:** at 100% on desktop, scrolled to the first Mix, and in the list view by default on phones.
- **D76 (Q8) — Placing people in Mixes in bulk is visible:** a "Select" control on the Contacts list, a No Mix strip with "Add these people to a Mix", and Mix as the main bulk action.
- **D77 (Q9) — The contact profile gets one Mixes section** below the Next card and a profile "•••" menu (Edit, Ask for a review, Schedule a meeting, Do not contact, Archive). Notes and the next appointment move near the top.
- **D78 (Q10) — Work that needs the owner shows on Today:** lead inquiries held for a match and visits waiting for an outcome appear under Needs your input, and the outcome step offers "Book a visit".
- **D79 (Q11) — Times use the 12-hour clock with AM/PM, and time zones are named by city** ("New York time"), US-first.
- **D80 (Q12) — Each Beat in the Mix editor gets Text / Email / Call tabs.** B-19 (the ready-made library folded into the Marketplace, D29) comes next.
- **D81 (Q13) — Settings becomes one grouped hub.** Working hours and scheduling move out of Personal preferences into Settings, and the desktop gets one account control that holds Sign out and Plan and billing.
- **D82 (Q14) — 44px targets and 13px text are MUST rules on every owner screen,** Calendar and Journey included, with an automated check.
- **D83 (Q15) — The staff Overview becomes one ordered "This week" queue** (support, community reports, the waitlist wave, health, library changes), and "Customers" is the one name of the staff page for accounts.
- **D84 (Q16) — Pages the owner's customers see speak with the business name** (the lead form, the private review page and the review request), never "we" or "I".
- **D85 (Q17) — Business wording by default:** the "Personal connections" use option, "people in my circle" and the personal empty states go, and an import asks which stage new people join.
- **D86 (Q18) — The audit is committed with its evidence and opened as a pull request** (#135).
- **Applied in:** the standards in this pull request (JITM-04, JITM-05, JITM-07, JITM-08, JITM-09, JITM-10). The product changes follow in their own pull requests, starting with the TRU-01 hotfix.

### D87–D111 — The open points of PRs #134 and #139–#147 (2026-10-12)

- **Context:** #141–#147 each ended with a "For Kevin" list: details its decision left open, which the pull request settled as a default or put as a question. #134's agent defaults are in its record, and Kevin answered #139–#141's points on 2026-10-09 (D111). On 2026-10-12 he said "I will go off of what you recommend" and "please proceed with your recommendations for each." The agent then sent one message with its recommendation for each open point: what to keep as built and what to change. Kevin chose "Yes, merge them (Recommended)" for #136, #135, #138, #139, #140, #141, #142, #144, #143, #145, #146 and #147, in that order, and "Release after the checks (Recommended)". The base of this entry is 4e78545, the merge of #147.
- **What Kevin saw:** where the message named a point briefly, the decision takes that point's own recommendation, alternative or question as the pull request set it out (D90, D91, D92, D96). Some details are the agent's choices, not in the message: D99's choice of #142's first fix, D103's wording, and the details marked "the follow-up's default" or "the release's default". D101 wasn't in the message at all. The standards tag these `[PROPOSED]` until Kevin confirms them (JITM-15 §2.12, JITM-17 §2.5).
- **D87 — Resume brings back what a Stop removed.** The follow-ups a person's Stop cancelled come back on Resume, with their original dates, when a start, a tag or Journey work still wants them. Those already due come back for the owner to send or skip on Today and are never sent automatically, even after a snooze to a later time (JITM-09 §2.72). A stage change's stop only lifts: its start has ended. (#147, point 1; the TRU-02 fix.)
- **D88 — Archiving a contact from the profile's ••• menu acts at once, with Undo** (JITM-08 §2.5), on the profile's own page and docked beside the list. It doesn't ask first: Undo brings back the person and the follow-ups archiving held. The list's bulk "Archive N…" still asks first; this decision doesn't change it. (#147, point 7.)
- **D89 — The No Mix strip's button says how many people it acts on:** "Add these 50 to a Mix", or "Add this person to a Mix" for one, as Q8's option A had it. It replaces D76's "Add these people to a Mix". The strip acts on the page shown, up to 50 people (point 2, confirmed below). (#146, point 1.)
- **D90 — While the owner selects people, a whole row ticks or unticks its person,** by pointer, keyboard and screen reader alike, as the label of the row's checkbox; the name opens the profile only outside selection. (#146, point 5.)
- **D91 — "Mark No Mix needed" on the strip opens its sheet on the heading,** as every sheet opens (JITM-08 §2.12), with the No Mix section in view. (#146, point 6.)
- **D92 — Labels under icons in a phone action bar may be 12px,** like the bottom navigation's tab labels (JITM-10 §2.2): the bulk bar's "Mix", "Export" and "Archive". (#146, point 3.)
- **D93 — Onboarding's four general reasons use the short labels** "An estimate or quote", "Someone who went quiet", "After the job" and "Ask for a review", so the closed drop-down shows the whole choice on a phone. #145 offered to map every marketing example's reason to the labels chosen. As the follow-up's default, only the contractors' example takes a short label: its "Follow up on a quote" names the estimate starter and becomes "An estimate or quote". Real estate's and consulting's "Reconnect with a lead", photography's "Follow up on an inquiry" and recruiting's "Reconnect with someone" keep their own words: those people asked to hear back later or are still deciding, so "Someone who went quiet" would misdescribe them. (#145, point 3.)
- **D94 — "Run setup again" reuses a starter Mix only when it is on and starts from the follow-up date.** Otherwise setup makes a new starter Mix, named apart as the follow-up's default ("Title (2)"). The preview then matches the Mix in PRV-03's paused, draft and started-another-way cases; its other two cases, a Beat that a Journey connection starts and a call first, stay for later. (#145, point 8.)
- **D95 — Journey's pane tabs read People / Mixes / Details,** below 1200px where the panes switch. The middle tab shows the Mixes as a list or a map, so "Map" no longer names both the tab and one of its views. (#143, point 1.)
- **D96 — With a person chosen, Journey goes to their work:** from 768px the map opens on their first active Mix; on phones the list marks their Mixes and, as the follow-up's default, scrolls to the first. (#143, point 3.)
- **D97 — "Also due" looks beyond Today's page.** One bounded query for the page's people names their follow-up due the same day on another page, with the skip offer and the review's note. Placement stays per page and the counts don't change, so on a heavy day such a person can still have a card on each page. (#142, point 7.)
- **D98 — Once a person has been contacted today, their follow-ups still due say so and keep their skip,** so the owner doesn't contact them twice in a day (TDY-13). (#142, point 6.)
- **D99 — Today's refresh never closes an open review, and an Undo no longer holds the refresh.** The recommendation read: "Drop the update hold, so a refresh never closes an open review." Confirmations and their Undo sit outside the list, so a refresh can't take them away, and Today's updates wait only for a message edit or a draft. For LIV-01 the follow-up takes #142's first fix: once a person has been contacted today, their follow-ups still due stay under Today for the rest of the day, so recording their later follow-up first no longer moves the earlier one's card out from under its open review. That also moves a contacted person's overdue card from Overdue into Today when the contact was made from another page (D97) or from Upcoming. A card also has to keep its place when a refresh brings another of the person's follow-ups onto the page; that case predates D99 and is backlog task B-20 (JITM-08 §6). (#141's HLD-01 with #142's LIV-01, point 3.)
- **D100 — A notice that appears in a review scrolls into view, clear of the stuck bar.** (#141, LAY-07.)
- **D101 — JITM-12 gets an "intermittent" failure class:** a failure that both fails and passes when rerun alone on the same build, where an order-dependent one passes every time alone. To tell the two apart, each failure is rerun alone twice on each build. An intermittent failure is then run alone five times on the candidate and five times on the baseline; when it fails more often on the candidate it counts as new and blocks like a failure only on the candidate. The recommendation message didn't include it, so JITM-12 tags it `[PROPOSED]`, in force as the default until Kevin confirms or changes it (JITM-17 §2.5), and WF-06's changelog marks its new gate as proposed. (#141's question about the testing standard.) Kevin confirmed it on 2026-10-13 (below).
- **D102 — #134's release writes the stops for Everyone removals made before #134 built D64.** For each Everyone place that is off, has no stop and whose last change was a recorded Remove, it writes a stop, and as the release's default it reports how many first. (#134, default 4, as its review recommended.)
- **D103 — Onboarding's contact hint names what the first Beat needs:** "An email needs an email address" for a starter that begins with an email, where it said "A text needs a mobile number", and, as the follow-up's default, "A call needs a phone number" for one that begins with a call. The recommendation read: "Show the right hint for starters that begin with an email." (#145's "Also defaults", COPY-01 (b).)
- **D104 — #147's readings, as built:** point 1's three ways to end a Mix, each explained (Stop, Remove, and Journey work's own Pause and Stop); point 2, Notes to remember under the details; point 3, Edit in the profile menu; point 4, what counts as one of the person's Mixes, with "Getting follow-ups ready" narrower than JITM-09 §2.76 for now; point 5, the next meeting; point 6, the stage section and Coming up; point 8, the empty Next card.
- **D105 — #146's readings, as built:** point 2, the strip acts on the page shown; point 4, nothing preselected in the Mix sheet.
- **D106 — #145's readings, as built:** point 1, the person first; point 2, the reason drop-down; point 4, no review tick, with Enter moving to the next field; point 5, no personal or networking use in setup; point 6, the new wording, with the one "Set up a whole pipeline instead" link, on #145's condition: its two lines about sending ("…before anything is sent." and "You review each message in Today before you send it.") hold while automatic customer email is off, and the second needs new wording before it is turned on; point 7, about 2.4 phone screens for a new account at 390px (2.7 at 320px).
- **D107 — #144's readings, as built:** all five points: completed outcomes count, a dismissal lasts about 13 months in that browser, the Profile sheet's entry stays until D81, the rail callout can show beside the prompt, and the prompt shows in every Today view.
- **D108 — #143's reading, as built:** point 2, the Map or List choice lasts the visit.
- **D109 — #142's readings, as built:** points 1 and 2, the same day and the earliest first; points 3 and 4 together: a card sits in the section of the person's latest follow-up on the page, and each section counts at least the follow-ups it shows, exactly on one page and on a paged list the view's totals, adjusted for the page's shared cards; point 5, the card's skip as a quick action; point 8, filters, search and single-follow-up links.
- **D110 — #134's defaults 1, 2, 3 and 5, as built.** Remove stops that Mix for the person by every route (default 5); with D87, Resume brings back the Everyone place and the other routes' cancelled follow-ups that a start, a tag or Journey work still wants, where default 5 brought back only the Everyone place.
- **D111 — The answers given in the pull requests on 2026-10-09** (Kevin: "Yes I approve your findings. please go ahead"): D70's scope as #141 lists it (JITM-08 §2.36); HLD-01 as a known limitation for the time being, which D99 now replaces; TRU-03's public demo copy and TRU-08's copy-only fix (#139); and D79's 12-hour clock for accounts with the en-GB or en-AU locale too (#140, JITM-05 §2.19).
- **Still Kevin's:** publishing the invitation wording with "three" as the system Mix's next version, so the render-time replacement can go (TRU-09), which belongs to the staff batch (D83). Kevin confirmed D101 and the details tagged `[PROPOSED]` on 2026-10-13 (next section).
- **Applied in:** JITM-05 §2.19 (D111); JITM-07 §2.19 and §2.20 (D95, D96) and §6; JITM-08 §2.33 (D99), §2.36 (D111's D70 scope, D99, D100) and §6 (D88, D91, D99, D100); JITM-09 §2.9 (D107), §2.20 (D93, D94, D103, D106), §2.32 (D104), §2.72 (D87), §2.81 (D89, D90, D105), §2.82 (D97–D99, D109) and §6; JITM-10 §2.2 (D92); JITM-12 §2.14 and WF-06 step 3 (D101, proposed); `docs/design/DESIGN_GUIDELINES.md` (D77's menu). D88–D91, D93–D100 and D103 change the product in their own tasks; D102 is a step of #134's release.

### D112–D121 — The open points of PRs #150 and #151 (2026-10-13)

- **Context:** #150 and #151 built D88–D100 and D103, and each ended with a "For Kevin" list: details it settled as defaults, and one question (JRN-03). On 2026-10-13 the agent listed its recommendation for each and asked: "Accept my recommended answers for the open points above (#151's four, #150's six) and confirm the standards items still marked proposed?" Kevin chose "Accept all (Recommended)". The same day he authorized the merges and the release, which shipped both pull requests (`docs/UX_FOLLOWUPS_RELEASE_2026-10-13.md`).
- **What Kevin saw:** one line per point with the recommendation; the pull requests' "For Kevin" sections give the trade-offs. The `[PROPOSED]` items to confirm were named: D101, D99's first fix, D94's naming, D96's phone scroll and D103's call hint.
- **D112 — LIV-01's fix stays, and the next step keeps a card in its section while its review is open.** A person contacted today keeps their follow-ups still due under Today for the rest of the day (D99's first fix, confirmed). A read can still move a card from under an open review in PLC-01's cases: a person whose only follow-up here is overdue, contacted elsewhere; that contact undone; and the later follow-up skipped, snoozed, or recorded as No answer or Wrong number. A rule that keeps a card in its section while its review is open covers these and B-20's older case together; it is backlog B-20. (#151, For Kevin 1.)
- **D113 — "Review overdue" keeps a contacted person under Overdue.** That view lists overdue follow-ups only, so no card was under Today there to keep in place. The "Contacted today" line and the skip offer still show (D98). (#151, For Kevin 2; PLC-02.)
- **D114 — Today names a read only when it takes longer than a second:** "Updating your follow-up list…" shows past a second, so the list doesn't move after each outcome. This answers JITM-08 §6's question whether Today should be silent like Journey. (#151, For Kevin 3.)
- **D115 — "Already reopened."** A Reopen or an Undo that finds the follow-up already reopened elsewhere counts as reopened, and Reopen says "Already reopened." the way finishing outcomes say "Already marked done." (#151, For Kevin 4; UND-01.)
- **D116 — A new starter Mix is named apart with a number,** such as "Estimate follow-up (2)", and a later run of setup reuses it while it is on and starts from the follow-up date (D94's detail, confirmed). (#150, For Kevin 1; STR-01.)
- **D117 — On phones, Journey's list scrolls to the chosen person's first Mix** (D96's detail, confirmed). (#150, For Kevin 2.)
- **D118 — Onboarding's contact hint asks for a phone number when the first Beat is a call** (D103's detail, confirmed). (#150, For Kevin 3.)
- **D119 — "Contacted today" counts a done outcome that reached the person:** sent, connected, a voicemail left or a reschedule. A call with no answer or a wrong number doesn't count, so the person's other follow-up goes on without the note. (#150, For Kevin 4; TDY-01.)
- **D120 — D93's short labels are also the new follow-up's reason,** shown on Today's row and in the review ("Someone who went quiet · Went quiet: gentle reconnect"). (#150, For Kevin 5; ONB-01.)
- **D121 — Journey marks the Mixes a person is in through their Mix starts and follow-ups too,** not only through Journey work, in a later pull request. Until then, in an account with no Journey connection, choosing a person marks none of the Mixes whose rows count them. Backlog B-21. (#150, For Kevin 6; JRN-03.)
- **Confirmed `[PROPOSED]` items:** D101 (JITM-12 §2.14's intermittent class), D99's first fix (D112), D94's naming (D116), D96's phone scroll (D117) and D103's call hint (D118). The standards now tag them `[OWNER 2026-10-13]`. #151's second round also compared batch runs for a failure that never failed alone (the docking race, 2 in 11 against 0 in 9 on the base); D101's text covers reruns alone.
- **Applied in:** JITM-07 §2.20 (D117, D121) and §6; JITM-08 §2.4 (D115), §2.33 (D114), §2.36 (D112) and §6; JITM-09 §2.20 (D116, D118, D120), §2.82 (D112, D113, D119) and §6; JITM-12 §2.14 (D101); the audit's backlog B-20 to B-22 (`docs/STANDARDS_AUDIT_2026-09-28.md` §8). The standards' §6 sections also mark D88–D100 and D103 built, in `prod-2026-10-13-4d5c307`.

## Still open

The standards' §6 sections list the remaining open questions and known deviations. The second packet's product changes are tasks in the audit's [follow-up backlog](../STANDARDS_AUDIT_2026-09-28.md#8-follow-up-backlog).
