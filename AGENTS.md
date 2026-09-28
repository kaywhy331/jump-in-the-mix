<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Jump in the Mix — agent router

Jump in the Mix is a phone-first follow-up app for small owner-operators (an internal summary; public copy uses the category in JITM-02 §2.10). Today shows who to contact next. The owner reviews each prepared text, email or call and sends it in their own voice. Contacts, Mixes (reusable sequences of Beats), Journey (the graph of how Mixes connect) and Calendar support that loop.

This file routes every task to the workflow, skills and standards that govern it. The rules live in [`docs/standards/`](docs/standards/README.md); this file does not restate them.

## Before any task (WF-01)

1. Start at the repository root, then work in a task worktree created from a fresh `origin/main`. Never change a checkout that holds other work (JITM-13 §2.1–§2.2, JITM-16 §2.1). If your copy of this file has no router, you are on an old branch: read the standards from `origin/main`.
2. Classify the task with the table below, and load every matching skill.
3. Read the standards the table cites. Cite rules as `JITM-NN §2.N` in plans, reviews and pull requests.
4. If a standard is silent, or conflicts with an instruction from Kevin, stop and ask (JITM-16 §2.16). Record his answer through WF-08.
5. Report with evidence labels, and list what was NOT RUN (JITM-12 §2).

## Routing

| Task | Skill | Workflow | Standards |
|---|---|---|---|
| Pages, components, styles, layout, icons, themes, sheets and dialogs | `jitm-ui-change` | WF-02 | JITM-03, JITM-05 to JITM-10, JITM-12 |
| Any customer-facing words: UI text, emails, message templates, homepage, profession pages, FAQ, marketing | `jitm-copy` | WF-03 | JITM-02 to JITM-05 |
| Product behavior: routes, server actions, the worker, the Prisma schema, imports and exports | `jitm-feature` | WF-04 | JITM-01, JITM-09, JITM-11 to JITM-13, JITM-15 |
| Reviewing a diff, pull request, page or screenshot | `jitm-review` | WF-05 | JITM-12, JITM-16, JITM-17 and the area standards |
| Releasing, deploying or rolling back production, only when asked | `jitm-release` | WF-06 | JITM-12 to JITM-16 |
| Audits of the product, UX, copy, readiness or drift | `jitm-audit` | WF-07 | JITM-12, JITM-15 to JITM-17 |
| Kevin decides something, or a standard is missing, wrong or conflicting | `jitm-standards-update` | WF-08 | JITM-00, JITM-15 to JITM-17 |
| Other documentation or operations work | none | WF-01 | JITM-00, JITM-15, JITM-16 |

## Non-negotiables

1. The owner reviews and sends every message. Opening a messaging app is not delivery. Automatic customer email is off in production during the beta, and automatic SMS is not configured (JITM-00 §2.3).
2. Never invent product behavior, metrics, testimonials, customer evidence, pricing or decisions (JITM-00 §2.4).
3. A workspace's data is reachable only through that workspace's own session (JITM-00 §2.5).
4. Completed or skipped follow-ups never come back. Scheduling stays timezone-safe and idempotent (JITM-00 §2.6).
5. Follow the design system (JITM-06 §2, JITM-10 §2):
   - the export for visual composition;
   - semantic tokens and shared components;
   - both themes, keyboard use and narrow screens.
6. Use the glossary terms: Today, Contacts, Mix, Beat, Journey, Calendar, Quick Add, Mega-Mix, Marketplace (JITM-05 §2).
7. This version of Next.js differs from your training data. Read `node_modules/next/dist/docs/` before writing Next.js code (JITM-11 §2).
8. No paid services without Kevin's approval (JITM-00 §2.9). Agents merge only with Kevin's explicit authorization (JITM-16 §2.5). Production releases run only when asked, through WF-06 (JITM-16 §2.6).
9. No third-party framework, course or author names in standards, skills, copy or new documents (JITM-04 §2). Never commit local-only sources (JITM-15 §2).
10. Keep the Next.js block above first and unchanged. `CLAUDE.md` is a symlink to this file. Edit skills only in `.agents/skills/`; `.claude/skills` links there (JITM-16 §2.18, JITM-16 §2.19).

## Precedence

Precedence and conflicts: JITM-00 §2.12–§2.13 (Kevin's recorded instruction; JITM-00; the other standards; the export for visual composition where they are silent, never for Journey; dated records as history). Shipped code is evidence, not authority.

## Environments

Production (https://jumpinthemix.com) runs on Render. JITM-14 and WF-06 cover the services, the release sequence, tags, records and rollback. The Netlify test site is retired. The deployment notes this file used to carry are preserved word for word in JITM-14.
