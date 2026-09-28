---
name: jitm-feature
description: Jump in the Mix product behavior changes done end to end — concept fit, user-workflow rules, tenancy, timezone-safe idempotent scheduling, migrations, tests and records. Use when adding or changing features, routes, server actions, the background worker, the Prisma schema, imports or exports, or the behavior of Today, Contacts, Mixes, Beats, Mega-Mixes, Journey, Calendar, Quick Add, invitations or the Marketplace.
---

# Jump in the Mix — feature

Follow **WF-04** (`docs/standards/workflows/WF-04-feature.md`). The rules live in these standards:
- JITM-01: product concept;
- JITM-09: user workflows;
- JITM-11: engineering;
- JITM-12: verification;
- JITM-13: git and pull requests;
- JITM-15: records.

Load `jitm-ui-change` for any UI work and `jitm-copy` for any words.

## Checklist

1. **Intake** (WF-01). Work in a task worktree created from `origin/main`.
2. **Concept fit** (JITM-01 §2). State how the change serves the promise that the owner opens the app and knows who to contact next.
   - **Gate:** the behavior fits the product concept, or Kevin has approved it.
3. **Workflow fit** (JITM-09 §2). Name the user workflows the change touches. If a documented workflow changes, get Kevin's decision (JITM-16 §2.7), then amend its rule through WF-08 in the same pull request.
4. **Build to the engineering rules** (JITM-11 §2):
   - take `workspaceId` only from the session;
   - use the timezone-safe scheduling model;
   - write outcomes idempotently;
   - keep worker jobs bounded and lease-safe;
   - review every migration;
   - keep completed history immutable.
5. **Test** (JITM-12 §2).
   - Add unit and integration tests for the behavior, and browser tests for the workflow.
   - Run the suite tier that matches the change.
   - Compare failures with an `origin/main` baseline.
6. **Record and open the pull request** (JITM-15 §2, JITM-13 §2).
   - Write the implementation record if the change is release-worthy.
   - Update the JITM-01 §2.22 feature map when a feature's status changes.
   - Use the PR template, cite rules, and list NOT RUN items.
   - Kevin merges. Releasing is a separate task (`jitm-release`).

## Must-know rules

- Human review is the default. Automatic customer email is off in production during the beta, and automatic SMS is not configured (JITM-00 §2.3).
- Completed or skipped follow-ups never regenerate. A promised next follow-up creates exactly one follow-up (JITM-00 §2.6).
- Tenant isolation holds in every route, action, job, import, export and support view (JITM-00 §2.5).
- The deliberate strengths in JITM-00 §2.7 are never weakened for simplicity.
- Read `node_modules/next/dist/docs/` before writing Next.js code (JITM-11 §2).
- Add no paid services and no cost-bearing dependencies without Kevin (JITM-00 §2.9).
- Invitations, the Marketplace, Journey numbering and channel versions have owner-decided rules in JITM-09 §2. Read them before you touch those areas.

## Where to look

- Workflows and business rules: JITM-09.
- Schema: the split `prisma/*.prisma` files (JITM-11 §2.26), and `docs/DATABASE_HAND_WRITTEN_OBJECTS.md` for hand-written database objects.
- Libraries: `src/lib/`. Worker: `src/worker/`. Routes: `src/app/`.
- Test commands and tiers: JITM-12. `package.json` scripts: `validate:static`, `typecheck`, `test`, `test:isolated`, `test:e2e`, `test:a11y`.

## Stop and ask Kevin when

- The change alters the product promise, access, pricing, sending behavior or data retention.
- A migration is destructive.
- The change needs a paid service.
- A documented workflow rule would change.
