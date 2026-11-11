# Local testing

## Self-hosted product smoke

Initialize and start the production-like Docker edition:

```bash
npm ci --no-audit --no-fund
npm run pilot:init
npm run pilot:up
npm run pilot:health
```

Open `http://127.0.0.1:3000/register`, create the owner, complete business setup, and confirm Today contains a prepared follow-up with no unresolved placeholders. Exercise Text/Email/Call, the return tray, undo, snooze, contact history, export, and password recovery. Stop with `npm run pilot:down`.

The developer demo is separate and may be started with `npm run quickstart`. Demo data must never be loaded into a production database.

## Repository checks

With PostgreSQL available through `DATABASE_URL` (the next section sets one up with one command):

```bash
npm ci --no-audit --no-fund
npm run db:generate
npm run validate:static
npm run db:rehearse-migration
npm run db:deploy
npm run typecheck
npm test
npm run build
RESET_DEMO_DATA=true DEMO_MODE=true npm run db:seed
npm run db:seed:e2e-admin
npm run db:rehearse-restore
npx playwright install chromium
npm run test:e2e
npm run security:audit
```

Run database tests serially when a local Prisma Postgres development server cannot safely multiplex prepared statements:

```bash
npx vitest run --no-file-parallelism --maxWorkers=1
```

A shared local database that has been seeded (the demo data, the browser-test administrator) contaminates suites that expect an empty catalog: the first-owner bootstrap cases in `tests/staff-access.integration.test.ts` fail against a database that already holds an active owner. Run such suites, or the whole unit run, against a database created for that run alone:

```bash
DATABASE_URL=postgresql://jitm:jitm@localhost:5432/jitm_design_local npm run test:isolated -- tests/staff-access.integration.test.ts
```

The script creates a sibling `jitm_design_isolated_*` database from `template0`, applies the migrations, runs vitest with `DATABASE_URL` pointed at it, and drops it afterwards whatever the result. It refuses any `DATABASE_URL` that is not a loopback `jitm_design_` database. CI needs none of this because its database is empty when the unit stage runs. With a test database from the next section, run it as `node scripts/test-env.mjs run qa1 -- npm run test:isolated -- tests/staff-access.integration.test.ts`.

## Disposable test database

One command gives an agent or a QA session its own loopback database and a matching environment, so database suites never fall back to the default `jitm` database:

```bash
npm run test:env -- qa1                                     # creates jitm_design_qa1 and its env file
node scripts/test-env.mjs run qa1 -- npm run db:generate
node scripts/test-env.mjs run qa1 -- npm run db:deploy
node scripts/test-env.mjs run qa1 -- npm run db:verify-release
node scripts/test-env.mjs run qa1 -- npm test
node scripts/test-env.mjs run qa1 -- npm run build
npm run test:env:drop -- qa1                                # drops it, confirms it is gone, removes the env file
```

Prerequisites: Node 22 or later, `npm ci`, and PostgreSQL listening on loopback at the port the CI `validate` job uses. The test role from that job must exist with permission to create databases. No `createdb` or `psql` binary is needed.

- **Names.** Pass a suffix (`qa1`) or the full name (`jitm_design_qa1`). The database must match `^jitm_design_[a-z0-9_]{1,40}$`; any other name is refused before a connection is opened.
- **Settings.** The role, password, port and schema are read at run time from the `validate` job in `.github/workflows/ci.yml`: its `DATABASE_URL`, checked against its PostgreSQL service. The host is written as `127.0.0.1`. The env file starts from `.env.example`, then that job's env, then the env of its `npm test` step.
- **Env file.** `.artifacts/test-env/jitm_design_<name>.env` is git-ignored, mode 600, and made of `KEY="value"` lines. Instead of `run`, you can load it with `set -a; . .artifacts/test-env/jitm_design_qa1.env; set +a`. Then unset any `NODE_ENV` your shell exports, because `next build` fails under `development`; `run` clears it for you.
- **Isolation.** The env file points `DATABASE_URL` and `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD` and `PGDATABASE` at the test database. It sets every other database input to empty: the other `*_DATABASE_URL` and `*_DB_URL` variables, every other `PG*` variable the `pg` driver resolves, the libpq variables that can redirect a connection or supply a credential (`PGHOSTADDR`, `PGSERVICE`, `PGSERVICEFILE`, `PGSYSCONFDIR`, `PGPASSFILE`), and any `PG*` variable your shell held at creation. `run` starts from your environment with every database input and `NODE_ENV` removed, adds the env file, and refuses unless the result is clean. The check runs on the configuration the `pg` driver will actually use: a loopback host, the CI port and role, a password (so no password file is consulted) and the named database. The URL may carry no query parameter except `schema`, and no other database input may be set. Values that contain a double quote, `$`, a backtick, a backslash or a line break are refused.
- **What it touches.** The helper reads only `.env.example`, `ci.yml` and its own env file, never `.env`, `~/.pgpass` or another credential store. It opens the `postgres` maintenance database only to create, drop or look up the one validated name. The repository's own tools load a `.env` for keys still unset, so run from a checkout without one.

Suites:

- **Supported:** what CI's unit and integration step runs with `npm test`, including the push, plan and unattended-worker cases its env enables. Fixture suites create and drop their own sibling `jitm_design_*` databases.
- **Excluded:** the four suites driven by `RECOVERY_TEST_DATABASE_URL`: `tests/backup-database.integration.test.mjs`, `tests/recovery-state.integration.test.mjs`, `tests/recovery-cutoff.integration.test.mjs` and `tests/recovery-bundle.integration.test.mjs`. They create `jitm_recovery_test_*`, `jitm_cutoff_*` and `jitm_bundle_*` databases outside the namespace, so the env file clears that variable and they skip. CI still runs them on its own throwaway server.
- **Run after the build in CI:** the packaged-server suites `tests/recovery-hold-runtime.integration.test.mjs` and `tests/hosted-load-fixture.integration.test.mjs`. CI skips the mail-capture suite and the isolated-only phone canonicalization case as well.

To show that the supported suites ran rather than skipped, add a JSON report and look for `skipped` results among the integration suites:

```bash
node scripts/test-env.mjs run qa1 -- npx vitest run --reporter=default --reporter=json --outputFile=.artifacts/test-env/qa1-vitest.json
```

## Manual journey

Verify both desktop and phone viewports:

1. Create an account and complete the three-part business setup.
2. Confirm the first message uses the owner’s business name/signature and the displayed time matches their timezone.
3. Add, edit, archive, restore, search, and deduplicate a contact.
4. Start a ready-made plan and build a simple custom plan.
5. Complete and undo a follow-up; return from a native composer and record the result.
6. Enable a digest or push notification and confirm quiet hours are respected.
7. Export spreadsheet and JSON data, revoke a session, and exercise account deletion with a synthetic account.

Never put real customer data, provider tokens, passwords, databases, or backup archives in fixtures or test reports.
