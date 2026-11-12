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

The script creates a sibling `jitm_design_isolated_*` database from `template0`, applies the migrations, runs vitest with `DATABASE_URL` pointed at it, and drops it afterwards whatever the result. It refuses any `DATABASE_URL` that is not a loopback `jitm_design_` database. CI needs none of this because its database is empty when the unit stage runs. With a test database from the next section, run it as `scripts/test-env run qa1 -- npm run test:isolated -- tests/staff-access.integration.test.ts`.

## Disposable test database

One entry point, `scripts/test-env`, gives an agent or a QA session its own loopback database and a matching environment, so database suites never fall back to the default `jitm` database:

```bash
npm ci                                               # bootstrap, once, before the entry point (below)
scripts/test-env create qa1                          # creates jitm_design_qa1 and its env file
scripts/test-env run qa1 -- npm run db:generate
scripts/test-env run qa1 -- npm run db:deploy
scripts/test-env run qa1 -- npm run db:verify-release
scripts/test-env run qa1 -- npm test
scripts/test-env run qa1 -- npm run build
scripts/test-env drop qa1                            # drops it, confirms it is gone, removes its files
```

Prerequisites: a POSIX shell at `/bin/sh` (Linux, macOS or WSL), Node 22 or later, and PostgreSQL listening on loopback at the port the CI `validate` job uses. The test role from that job must exist with permission to create databases. No `createdb` or `psql` binary is needed. `npm run test:env -- qa1` and `npm run test:env:drop -- qa1` call the same entry point; read the trust boundary below before you use them.

### Bootstrap

`npm ci` is a bootstrap step. It runs once in the checkout, before `scripts/test-env create`, and never through the entry point: the helper itself loads `dotenv`, `pg` and `js-yaml` from `node_modules`, so it cannot start until they are installed. The entry point refuses to start while `node_modules` is missing. Because the bootstrap runs outside the boundary, with your session's npm settings, run it from a session you trust. To keep your npmrc files and npm variables out of it as well, start it from an empty environment, for example:

```bash
mkdir -p .artifacts/bootstrap-home && : > .artifacts/bootstrap-home/empty.npmrc
env -i HOME="$PWD/.artifacts/bootstrap-home" PATH="$(command -p getconf PATH)" \
  npm_config_userconfig="$PWD/.artifacts/bootstrap-home/empty.npmrc" npm_config_globalconfig=/dev/null \
  npm ci --no-audit --no-fund
```

The acceptance order for a change to the helper is therefore: `npm ci` (bootstrap), then `create`, loading the env file into a shell, `db:generate`, `db:deploy`, `db:verify-release`, `npm test`, `build`, `check`, `drop`, and a check that the database is gone. Every step after the bootstrap runs through `scripts/test-env`.

### The trust boundary

The helper guarantees that a command reaches only its validated loopback `jitm_design_*` database when the helper is started through `scripts/test-env`. That file is the boundary, and it starts clean:

- **The caller's `PATH` is never searched.** The launcher takes its utilities from the system's standard path (`command -p getconf PATH`, for example `/bin:/usr/bin`), node from the toolchain (next section) and npm from that node's own installation.
- **node starts under `env -i`, twice.** First with only the standard path, to check the arguments, make the database's scratch home empty again and leave only the toolchain links in its toolchain folder. Then for the helper itself, with only that `HOME`, a `PATH` of the toolchain folder and the standard path, and the allowlisted names your shell sets. No `NODE_OPTIONS`, npm setting or npmrc file, dotenv control, database variable or rc file from your session reaches the helper or the command it runs, so nothing your session configured can run code before the checks.
- **Any other start is refused.** `node scripts/test-env.mjs …` refuses unless its own environment is exactly what the entry point gives it: only allowlisted names, the scratch `HOME`, a `PATH` that starts with the toolchain folder whose links lead to the running node and its npm, and no node options.

The calling session is trusted, not hostile. Covered: whatever the session exports or configures by accident or habit, such as database URLs and `PG*` variables, `NODE_OPTIONS`, npm settings and npmrc files, dotenv controls, a `PATH` that leads to other tools, and the rc and `.env` files in your home folder. Not covered:

- **`npm run test:env` from a hostile parent is outside the boundary.** npm and its node start before the entry point, with your session's `NODE_OPTIONS` and npmrc files, so a preload they name runs in that outer npm before anything is checked. The entry point still starts the helper clean, but code has already run. When you cannot vouch for the session, call `scripts/test-env` directly.
- `/bin/sh`, the system's standard utilities, the toolchain's node and npm (including the `npmrc` in npm's own install folder), the repository's files and the PostgreSQL server belong to the trusted machine. A session that replaces them is hostile.
- What a command does with its own arguments is the caller's choice. `run` checks the environment the command starts with and applies the shell rule below. A command that sets its own database (`env DATABASE_URL=… npm test`, `node -e …`, or a shell script that unsets `HOME`) is not something a session does by accident.
- A program that starts a shell by its own means (an interpreter such as `node -e` or `python3 -c`, `xargs` reading its command from input, `npm exec`) is the command's choice too. Such a shell starts with the scratch home, which is empty at every start of the entry point, so it finds no startup file an earlier run left there.
- Loading the env file into your own shell (`set -a; . .artifacts/test-env/jitm_design_qa1.env; set +a`) controls only the variables it sets; anything else your shell exports still reaches the tools. Unset any `NODE_ENV` your shell exports first, because `next build` fails under `development`.
- Windows: the entry point is a POSIX launcher. Run it inside WSL.

### Toolchain

- **node.** When `.artifacts/test-env/toolchain/node` exists (`boundary.node` in `scripts/test-env.config.json`), the launcher uses the node it links to; otherwise the `node` on the standard path. If your node is elsewhere (a version manager, for example), link it once from a session you trust: `mkdir -p .artifacts/test-env/toolchain && ln -s "$(command -v node)" .artifacts/test-env/toolchain/node`. The folder is git-ignored. The helper checks that it runs as that node.
- **npm.** From that node's own installation, `{nodePrefix}/lib/node_modules/npm` (`boundary.npm`), where `{nodePrefix}` is the folder above node's `bin` folder. The helper checks that the folder is npm, with its `npm-cli.js` and `npx-cli.js`.
- **Toolchain folder.** `.artifacts/test-env/{database}.bin` (`boundary.bin`) holds three links: `node`, `npm` and `npx`. Every start of the entry point removes anything else from it, so no tool an earlier command put there (an `sh` that npm's scripts would find first, for example) survives. The `PATH` of the helper and the command is that folder, then the standard path (`boundary.path`), so the command, its npm scripts and the tools they start find this node and this npm first.
- **Scratch home.** `.artifacts/test-env/{database}.home` (`boundary.home`) is made by the helper, mode 700, and made empty again at every start of the entry point: `create`, `run` and `drop` each start with an empty home, so no rc file, npmrc or other file one command writes there persists to the next. It is the `HOME` of the helper and of the command: npm's cache and logs and the per-user state Next.js and Prisma keep go there, for that run only. Run one command at a time per database; a second start empties the home the first one is using. The helper refuses a scratch home or toolchain folder that is a link, belongs to another user or is open to other users. Drop removes both.

### Plain argv only

`run` starts one program with its arguments, with no shell between it and the helper. A shell is allowed only in one form: both `--noprofile` and `--norc` (`run.shellOptions`), before any single-letter option, and a `-c` command or a script file, for example `scripts/test-env run qa1 -- bash --noprofile --norc -c 'npm test 2>&1 | tee test.log'`. Before any connection or child process, `run` refuses:

- interactive and login forms: `-i`, `-l`, `--login` or `--interactive`, also when grouped, as in `bash -ic` and `bash -lc`; `sh -i`; a login name such as `-bash`;
- `--rcfile`, `--init-file`, `-o interactive` and `-o login`;
- a shell without `--noprofile --norc`, such as `bash -c '…'`, `rbash -c '…'` or `sh -c '…'`;
- a shell with no `-c` and no script, or with `-s`, which would read commands from the terminal.

Those forms read startup files (`~/.bashrc`, `~/.profile`, `/etc/profile`) after the checks. `dash` (the `sh` of Debian and Ubuntu), `busybox` and most shells other than bash have no `--noprofile` or `--norc`, so they never pass: use `bash`, or name the program directly.

**What counts as a shell.** `run` decides by what the program really is, not by the name it is given. It applies the rule twice: to the name, first, and last, just before the spawn, to every file the spawn could start under that name, with the child's own `PATH` and working directory. It follows each file through its links to its real path and through its `#!` line to the interpreter, as the kernel does. A file is a shell when any of these holds:

- the name it was called by, or its real name, is in `run.shells` (`sh`, `bash`, `rbash`, `dash`, `ksh`, `mksh`, `zsh`, `busybox` and the others listed there), also with a version suffix such as `ksh93`;
- it is a file the system's own list of shells names (`run.shellsFile`, `/etc/shells`), or one of the `run.shells` names on the child's `PATH`, or the fallback shell below: the same file through any link, a hard link of it, or a byte-for-byte copy of it.

So `rbash -ic`, `/bin/rbash -lc`, a link to bash under another name, a copy of bash, `busybox sh -c` and any program `/etc/shells` lists (some systems list `tmux` there) all meet the same rule as `bash`. Also refused before the spawn:

- **A script that starts a shell.** A file whose `#!` line names a shell (`#!/bin/bash`, `#!/usr/bin/env bash`), or a text file with no `#!` line, which exec runs with `run.fallbackShell` (`/bin/sh`). Start such a script as `bash --noprofile --norc <script>`.
- **A wrapper handed a shell.** A program that starts another program (`run.wrappers`: `env`, `nice`, `nohup`, `timeout`, `stdbuf`, `setsid`, `xargs`, `sudo`, `chroot`, the dynamic loader and the others listed there), when any word of its arguments names a shell or leads to one. `run` does not parse each wrapper's options: it splits every argument at spaces, `=`, `:` and quotes (as `env -S` splits its string), and looks each word up on the child's `PATH`, from the working directory and from any folder those arguments name (as `env --chdir` and `env PATH=…` would). So `env bash -c '…'`, `env -i rbash -ic '…'`, `env -S 'bash -ic …'` and `nice bash -c '…'` are refused, while `env FOO=1 npm test` starts. An argument with `${` is refused, because `env -S` would expand it where `run` cannot see. For a `#!` line that names a wrapper, such as npm's own `#!/usr/bin/env node`, the words on that line are the wrapper's arguments.
- **A program `run` cannot find or read.** A name with no executable file on the child's `PATH` (a shell builtin such as `exec`, for example), or a file it cannot read.

Why the shell form stays. The contract keeps one shell form because the documented steps need it, to load the env file into a shell (`set -a; . <file>; set +a`) and to use pipes and redirection, and because that form reads nothing a session controls: with `--noprofile` bash reads no profile, with `--norc` no `bashrc`, it is neither interactive nor a login shell, and `BASH_ENV` and `ENV`, the only startup files a non-interactive shell reads, are never inherited and refused in the env file. A shell that a command starts in turn reads the scratch home, which is empty at every start of the entry point.

### What the helper checks

- **Names.** Pass a suffix (`qa1`) or the full name (`jitm_design_qa1`). The database must match `^jitm_design_[a-z0-9_]{1,40}$`; any other name is refused before a connection is opened.
- **Settings.** The role, password, port and schema are read at run time from the `validate` job in `.github/workflows/ci.yml`: its `DATABASE_URL`, checked against its PostgreSQL service. The host is the loopback address that URL names: `127.0.0.1` for `localhost` or `127.0.0.1`, `::1` for `[::1]`. The env file starts from `.env.example`, then that job's env, then the env of its `npm test` step.
- **Env file.** `.artifacts/test-env/jitm_design_<name>.env` is git-ignored, mode 600, and made of `KEY="value"` lines. It never sets `HOME`, `PATH` or a shell startup variable, and `run` refuses one that does.
- **Isolation.** The env file points `DATABASE_URL` and `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD` and `PGDATABASE` at the test database. It sets every other database input to empty: the other `*_DATABASE_URL` and `*_DB_URL` variables, every other `PG*` variable the `pg` driver resolves, the libpq variables that can redirect a connection or supply a credential (`PGHOSTADDR`, `PGSERVICE`, `PGSERVICEFILE`, `PGSYSCONFDIR`, `PGPASSFILE`), and any `PG*` variable your shell held at creation. `run` starts the command from an empty environment (next point), adds the env file, and refuses unless the result is clean. The check runs on the configuration the `pg` driver will actually use: a loopback host, the CI port and role, a password (so no password file is consulted) and the named database. The URL may carry no query parameter except `schema`, and no other database input may be set. Values that contain a double quote, `$`, a backtick, a backslash or a line break are refused.
- **Child environment.** The command `run` starts gets an empty environment plus: the scratch `HOME` and the toolchain `PATH`, the variables your shell sets from the allowlist in `scripts/test-env.config.json`, the env file, and the pins below. Nothing else you export reaches it, whatever its name or letter case: no database URL or `PG*` variable, no `NODE_OPTIONS`, `NODE_PATH` or other `NODE_*` setting, no `npm_config_*` or `NPM_CONFIG_*`, no `DOTENV_*`, `PRISMA_*`, `VITEST_*`, `VITE_*`, `NEXT_*`, `JITI_*` or `TSX_*`, no `BASH_ENV` or `ENV`, no `NODE_ENV` and no `TZ`. The config refuses an allowlist that names a database input, a loader input, a shell startup variable, `NODE_ENV`, `HOME` or `PATH`. The allowlist, and why the toolchain needs each name:
  - `TMPDIR`: temporary files, tsx's IPC sockets and the compile caches.
  - `LANG`, `LC_ALL`, `LC_CTYPE`: the locale for text encoding and tool output.
  - `TERM`, `NO_COLOR`, `FORCE_COLOR`: terminal and colour output only.
  - `CI`: a CI-like switch that turns off prompts, watch mode and npm's update check. It names no file, host or module.
  - On Windows only, where names have no letter case and the entry point does not run (use WSL): `SystemRoot`, `SystemDrive` and `WINDIR` (Node's networking and crypto need them), `ComSpec` (npm's script shell), `PATHEXT` (command lookup), `TEMP` and `TMP` (temporary files), `USERPROFILE` (the home folder), `APPDATA` and `LOCALAPPDATA` (npm's global folder and cache).
- **Pinned files.** The same config names every file the helper pins, per database: the env file `.artifacts/test-env/{database}.env`, npm's user config `.artifacts/test-env/{database}.npmrc` (set through `npm_config_userconfig`) and npm's global config `.artifacts/test-env/{database}.global.npmrc` (set through `npm_config_globalconfig`; npm refuses one file as both). Create writes both npm files empty, and drop removes them with the env file, the scratch home and the toolchain folder.
- **Loaders.** What each tool the commands run reads at start-up, and how it is pinned:
  - dotenv 17 (`dotenv/config`, imported by `prisma.config.ts`, `vitest.config.ts` and the database scripts) takes its file, an override switch and a vault key from `DOTENV_*` variables, and treats any non-empty override as on, including `false`. The helper reads the names the installed dotenv uses at run time. The env file sets the file variable to the env file itself and every other control to empty. Before it starts the command, `run` replays the child's dotenv load and refuses unless that load changes nothing. It also refuses a command that passes `dotenv_config_*` arguments, and an env file that sets any loader input to another value.
  - Node 22 reads `NODE_OPTIONS`, whose `--require` and `--import` preload code. The env file sets it to empty unless the CI job sets it. Node's other variables are simply not inherited, and Node reads `--env-file` and its config file only from flags.
  - npm 10 (and `npx`) reads its settings from the command's flags, then `npm_config_*` variables (the two pins only), then a project `.npmrc` in the package folder, then the user config, then the global config (by default `<prefix>/etc/npmrc`), then the `npmrc` in its own install folder. It turns its `node-options` setting into `NODE_OPTIONS` for every script. The project file is refused if it exists, and the user and global configs are the helper's empty files.
  - Prisma 7 loads `prisma.config.ts` through its config loader with dotenv, rc files, remote sources, `extends` and `package.json` lookup all off, and compiles it with jiti, which reads `JITI_*` variables. It reads `PRISMA_*` variables too. None is inherited.
  - Vitest 4 loads `vitest.config.ts`. Vite's env loader reads `.env`, `.env.local`, `.env.<mode>` and `.env.<mode>.local` in the project, but passes on only `VITE_*` keys, and fills only `BROWSER`, `BROWSER_ARGS` and `VITE_USER_NODE_ENV` while they are unset. None of them names a database or a loader.
  - tsx, which runs the database scripts, reads `TSX_*` variables (not inherited) and the project's `tsconfig.json`.
  - Next.js reads the project's `.env` files during a build, but only for keys that are still unset, and the env file sets every database and loader input.
  - `pg` reads `PG*` variables, pinned above, and a password file only when there is no password.
  - Shells read `BASH_ENV` (bash) or `ENV` (a POSIX `sh`) even when not interactive. Neither is inherited, and the env file never sets them.
- **npm.** Before the spawn, `run` loads the npm the command uses, and the npm on the child's `PATH` (the toolchain's), with that npm's own config loader. It first asks npm's own prefix search where npm would look for a project `.npmrc`, and refuses if one is there: no environment value can override what it sets, and it may hold registry tokens, so the helper never opens it. Then it loads npm's configuration as npm will in the child. It refuses unless npm's user and global configs are the helper's files, none of npm's config files sets anything, the environment gives npm nothing but those two pins, and nothing sets `node-options`. The environment npm will hand its scripts must then pass the same database, loader and dotenv checks. The check is repeated for an npm that one of those scripts starts in turn, from the package folder. The check follows npm's real precedence: a `--userconfig` or `--node-options` flag on the command is refused, while a `--globalconfig` flag is ignored because npm itself lets the pinned value win.
- **What it touches.** The helper reads only `.env.example`, `ci.yml`, `scripts/test-env.config.json`, its own env file and npm config files, npm's own install folder, and, to tell what a command really starts, the system's list of shells and the first block of the command's files (all of a file whose size matches a shell's, to compare it). It writes only its env file, its two npm config files, the scratch home and the toolchain folder, and it empties the scratch home at every start. It never reads `.env`, `~/.pgpass`, `~/.npmrc`, a project `.npmrc` (it checks only that none exists) or another credential store. It opens the `postgres` maintenance database only to create, drop or look up the one validated name.
- **Limits.** The `npmrc` in npm's own install folder is treated as part of npm, and only its effect on `node-options` and the two config files is checked. A command that starts npm in another folder itself (`cd elsewhere && npm …`) is checked only where npm starts from the command or the package folder. The trust boundary above lists what the entry point does not cover.

Suites:

- **Supported:** what CI's unit and integration step runs with `npm test`, including the push, plan and unattended-worker cases its env enables. Fixture suites create and drop their own sibling `jitm_design_*` databases.
- **Excluded:** the four suites driven by `RECOVERY_TEST_DATABASE_URL`: `tests/backup-database.integration.test.mjs`, `tests/recovery-state.integration.test.mjs`, `tests/recovery-cutoff.integration.test.mjs` and `tests/recovery-bundle.integration.test.mjs`. They create `jitm_recovery_test_*`, `jitm_cutoff_*` and `jitm_bundle_*` databases outside the namespace, so the env file clears that variable and they skip. CI still runs them on its own throwaway server.
- **Run after the build in CI:** the packaged-server suites `tests/recovery-hold-runtime.integration.test.mjs` and `tests/hosted-load-fixture.integration.test.mjs`. CI skips the mail-capture suite and the isolated-only phone canonicalization case as well.

To show that the supported suites ran rather than skipped, add a JSON report and look for `skipped` results among the integration suites:

```bash
scripts/test-env run qa1 -- npx vitest run --reporter=default --reporter=json --outputFile=.artifacts/test-env/qa1-vitest.json
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
