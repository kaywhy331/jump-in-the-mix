# Verification — JITM standards program (2026-09-28)

This record shows that the standards, workflows, skills and router are well formed, and that Claude Code and Codex actually load them and use them to route work. All tests ran on the owner's build host, in the program worktree, against the branch `docs/jitm-standards-20260928`, which is based on `origin/main` 9439fd6. Tool versions: Claude Code 2.1.283 and codex-cli 0.155.1.

## 1. Discovery before this change (probes)

Scratch repositories outside every checkout, each containing only probe files:

| Probe | Claude Code | Codex |
|---|---|---|
| Skill in `.claude/skills/<name>/SKILL.md` (real directory) | Found | Not read |
| Skill in `.agents/skills/<name>/SKILL.md` only | **Not found** | Found |
| Skill in `.codex/skills/<name>/SKILL.md` | Not tested | Found |
| `.claude/skills` as a relative symlink to `../.agents/skills` | Found | Found once (reads `.agents/skills`) |
| Root `AGENTS.md` | Only through `CLAUDE.md` | Loaded |
| Nested `AGENTS.md` in a subdirectory | Not tested | Loaded only when the session starts in that directory |
| `CLAUDE.md` containing `@AGENTS.md`, session at the root | Router loaded | Not applicable |
| `CLAUDE.md` containing `@AGENTS.md` or `@./AGENTS.md`, session in a subdirectory | **Router not loaded** (the import is left unexpanded) | Not applicable |
| `CLAUDE.md` as a symlink to `AGENTS.md`, sessions at the root, one level down and two levels down | Router loaded once in each | Router loaded once |

Methods:
- Codex: `codex debug prompt-input "x"`, which prints the model-visible context without calling a model, searched for markers.
- Claude Code: `claude -p` asked to list the probe skills, or to print the marker words present in its instructions.

Consequences built into the standards:
- The shared skills live in `.agents/skills/`, and `.claude/skills` is a relative symlink to that directory (JITM-16 §2.19).
- `CLAUDE.md` is a relative symlink to `AGENTS.md` rather than an `@AGENTS.md` import (JITM-16 §2.18). Before this change, Claude Code sessions started below the repository root lost every project rule.
- `next dev` rewrites the agent-rules block only inside `AGENTS.md` when `AGENTS.md` holds the block, so the symlink is safe (`node_modules/next/dist/server/lib/generate-agent-files.js`, `writeAgentFiles`).

## 2. Discovery of this change

| Check | Result |
|---|---|
| Codex from the repository root: router text, Next.js block and all seven `jitm-*` skills in the model-visible context | VERIFIED |
| Codex from `src/`: the same | VERIFIED |
| Claude Code from the repository root: lists all seven `jitm-*` skills and quotes the router's first non-negotiable verbatim | VERIFIED |
| Claude Code from `src/`, with `CLAUDE.md` as an `@AGENTS.md` import: lists all seven skills but cannot quote the router | FAILED, which led to the symlink |
| Claude Code from `src/` and `src/components/`, with `CLAUDE.md` as a symlink: lists all seven skills and quotes the non-negotiable verbatim | VERIFIED |

## 3. Behavior dry runs

Each scenario ran once per tool, one run at a time, from the worktree root, in a fresh session:
- Claude Code: `claude -p --permission-mode plan "<scenario> — Plan only: …"`.
- Codex: `codex exec -s read-only --ephemeral -o <file> "<scenario> — Plan only: …"`.

The plan-only suffix asked each session to name the skills and standards it would apply and to list its steps, changing nothing. A run passes when it selects the expected skills and standards and its plan follows them. All 12 runs exited cleanly and changed no repository file.

| # | Scenario | Expected | Claude Code | Codex |
|---|---|---|---|---|
| S1 | Add a Duplicate button to each Mix in the Mixes library. | `jitm-ui-change` and `jitm-feature`; JITM-05 to JITM-08 | PASS: all three skills (UI, feature, copy). It cites JITM-06 to JITM-10 and JITM-09's authoring and numbering rules. It found the existing Mega-Mix duplicate path to reuse, and stopped to ask four product questions (placement, draft status, which Mixes, what is left behind) before building. | PASS: the expected skills and standards |
| S2 | Rewrite the homepage hero for real estate agents. | `jitm-copy`; JITM-02, 04, 05; ICP used only as a hypothesis; claims ledger; no invented proof | PASS: first asked whether "homepage" means the shared homepage or the real-estate profession page (JITM-02 §2.1, JITM-09 §2.67–§2.68). It plans a claim–proof list (JITM-04 §2.26), Kevin's dated approval (§2.28, §2.31), treats the headline as a hypothesis, uses no prices and does the clean-room check. | PASS: `jitm-copy`, a claims ledger, the ICP as a hypothesis |
| S3 | Review the open PR for design and copy consistency. | `jitm-review`; the JITM-17 rubric | PASS | PASS |
| S4 | Ship main to production. | `jitm-release`; JITM-14; stops at any gate it lacks | PASS: follows WF-06 gate by gate. It cites the standing release authority (JITM-16 §2.6), "agents never merge" (§2.5) and "host limits come first" (§2.24). It would stop if `main` already equals production, which it does. | PASS: `jitm-release`, the gates, no agent merge |
| S5 | Kevin decided "Journey" should be renamed "Map". | `jitm-standards-update` (plus `jitm-copy` for the product change) | PASS | PASS |
| S6 | Add a notification-sound settings page (no mockup exists). | `jitm-ui-change` and `jitm-feature`; the no-mockup archetype; flags new behavior for Kevin | PASS | PASS: lists the undecided product choices for Kevin (JITM-16 §2.7, §2.16), picks the focused-form archetype (`page--form`, 1040px) and plans the verification |

Every scenario selected its expected skills in both tools, so no skill description needed sharpening. Keyword scoring flagged three runs (S1 Claude Code, S2 Claude Code, S6 Codex) for missing terms. Reading them showed they cite the same rules through ranges ("JITM-06 to JITM-10") or paraphrase ("a list of every claim with its proof"), so all three pass.

## 4. Structure and scope

| Check | Result |
|---|---|
| `npm run standards:check`: 18 standards, 8 workflows, 7 skills, 44 documents | VERIFIED, 0 errors and 0 warnings |
| The check script finds planted defects: a missing basis tag, a non-portable skill key, a skill name mismatch, a missing rule, an unknown standard, an unknown workflow, a broken link, a home path and a machine name | VERIFIED, 9 of 9 caught |
| Changed paths are limited to documentation, skills, the router and its symlinks, the PR template, the check script and one `package.json` script entry | VERIFIED (`git diff --name-only origin/main...HEAD`) |
| No product paths changed (`src`, `prisma`, `e2e`, `tests`, `public`, `infra`, `netlify`, `render.yaml`, `next.config.ts`) | VERIFIED, empty diff |
| The Next.js agent-rules block in `AGENTS.md` is byte-identical to `origin/main` | VERIFIED |
| Router size after the Next.js block is within 10 KB and 160 lines | VERIFIED |
| `CLAUDE.md` and `.claude/skills` are committed as symlinks (mode 120000) to `AGENTS.md` and `../.agents/skills` | VERIFIED |
| No local-only source, secret, home-directory path, vault path or machine name is committed | VERIFIED by `standards:check` and a separate review |

## 5. Faithfulness review

Two independent read-only reviews checked the drafts before these results were recorded:
- **Contradictions, duplication and allocation:** 49 findings, all applied. Owner-level items were decided conservatively and are listed as questions for Kevin in the audit.
- **Evidence honesty, citation accuracy and hygiene:** 34 findings. It sampled more than 40 rules across all 18 standards against their cited lines, checked every non-D/O `OWNER` tag, and confirmed the hashes of the local-only sources. All findings were applied except one that an earlier fix already covered.

Corrections that came out of the reviews:
- Owner tags that cited agent-adopted defaults became `SOURCE`, and rules that go beyond an owner decision now also carry `PROPOSED`.
- O3 and O4 now separate Kevin's words from derived practice, and O7 (2026-09-22) was recorded.
- Line citations are pinned to 9439fd6.
- The audit's claim that Render failure notifications were off was corrected: Kevin confirmed setting them on 2026-09-26.

## 6. NOT RUN

- Application builds, unit and browser suites, Lighthouse and physical devices. This change touches no product code, so none of them applies.
- Any production or Render request.
- Codex Cloud and Codex IDE sessions (only codex-cli 0.155.1 was probed), and Claude Code versions other than 2.1.283.
- A Windows checkout. `CLAUDE.md` and `.claude/skills` are symlinks, and a checkout without symlink support would turn them into plain text files.
