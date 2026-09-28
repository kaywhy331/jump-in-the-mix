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
- **Applied as (lead's interpretation, pending Kevin's confirmation):** the owner-reviewed 2026-09-18 claim that accounts are free with no payment card stays usable; D11 forbids amounts, tiers and payment promises.

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

## Still open

These are not blocking. They are listed in the [audit](../STANDARDS_AUDIT_2026-09-28.md#questions-for-kevin).
