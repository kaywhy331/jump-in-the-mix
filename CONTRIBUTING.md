# Contributing to Jump in the Mix

## Start locally

The supported local path uses Docker:

- Windows: `start-local.cmd`
- macOS: `start-local.command`
- Linux: `./start-local.sh`

The launcher creates `.env`, generates local secrets, starts PostgreSQL, seeds the demo workspace, and opens the application.

## Before opening a pull request

Run:

```bash
npm install
npm run db:generate
npm run validate:static
npm run typecheck
npm test
npm run build
```

For changes that affect the complete local stack, also run the smoke test in `docs/LOCAL_TESTING.md`.

## Branch and commit conventions

Use short branches such as:

```text
feature/contact-import
fix/jump-generation
chore/dependency-update
```

Prefer conventional commit messages:

```text
feat: add contact import preview
fix: prevent duplicate jump generation
docs: clarify local setup
```

## Database changes

1. Update `prisma/schema.prisma`.
2. Generate and review a Prisma migration.
3. Do not edit production data manually.
4. Include migration and rollback notes in the pull request.

## Security rules

- Never commit `.env` files, provider secrets, access tokens, or customer exports.
- Keep database and provider credentials server-side.
- Validate tenant ownership for every workspace-scoped mutation.
- Verify webhook signatures and make handlers idempotent.
- AI-generated multi-record changes require a user confirmation step.

## Product language

Use the canonical terms consistently:

- **Important Date** in user-facing forms; `JumpDate` internally
- **Mix** for a follow-up plan
- **Step** for a reusable message or call template
- **Jump** for one generated follow-up action

Do not reintroduce the legacy terms Campaign, Connect, or Connected in customer-facing copy.
