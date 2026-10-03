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

## Still open

The standards' §6 sections list the remaining open questions and known deviations. The second packet's product changes are tasks in the audit's [follow-up backlog](../STANDARDS_AUDIT_2026-09-28.md#8-follow-up-backlog).
